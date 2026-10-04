#!/usr/bin/env bash
# Make sure there is a valid login token for the API before anything talks to
# it. Reuses the cached token (.env.token) while it is valid, signs in again
# otherwise, and stops with what is missing. TOKEN=1 prints the token.
# Values come from the environment first (CI), then from .env.
set -e -o pipefail

[ -f .env ] || [ -n "$VITE_API_BASE_URL" ] || cp .env.example .env
get() { [ -f .env ] && sed -n "s/^$1=//p" .env | tail -1; }
api=${VITE_API_BASE_URL:-$(get VITE_API_BASE_URL)}
case "$api" in ''|*example.com*) api=https://switch.voipappz.io
  sed -i.bak "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=$api|" .env && rm -f .env.bak ;;
esac
email=${TEST_EMAIL:-$(get TEST_EMAIL)}
pass=${TEST_PASSWORD:-$(get TEST_PASSWORD)}
otp=${VA_TEST_OTP:-$(get VA_TEST_OTP)}

case "$email" in ''|you@example.com) email="" ;; esac
if [ -z "$email" ] || [ -z "$pass" ]; then
  echo "Put TEST_EMAIL and TEST_PASSWORD in .env (from: make tenant CUSTOMER=<name> EMAIL=<email> in voipappz-api)"
  exit 1
fi

py() { python3 -c "$1" "${@:2}"; }
field() { py 'import sys,json
try: print(json.load(sys.stdin).get(sys.argv[1],""))
except Exception: print("")' "$1"; }
ttl() { py 'import sys,json,base64,time
try:
  p=sys.argv[1].split(".")[1]; p+="="*(-len(p)%4)
  print(max(0,int(json.loads(base64.urlsafe_b64decode(p))["exp"]-time.time())))
except Exception: print(0)' "$1"; }
enc() { py 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$1"; }
ok() { echo "token valid for $api as $email"; [ -z "$TOKEN" ] || echo "$access"; exit 0; }

CACHE=.env.token
if [ -f "$CACHE" ] && [ "$(sed -n 1p $CACHE)" = "$api $email" ]; then
  access=$(sed -n 2p $CACHE)
  [ "$(ttl "$access")" -gt 60 ] && ok
fi

rm -f "$CACHE"
resp=$(curl -s --max-time 15 -X POST "$api/auth/login?email=$(enc "$email")&password=$(enc "$pass")" || true)
access=$(printf '%s' "$resp" | field access)
temp=$(printf '%s' "$resp" | field temp_token)
# OTP is off by default; only when the API asks for it is VA_TEST_OTP used.
if [ -z "$access" ] && [ -n "$temp" ]; then
  resp=$(curl -s --max-time 15 -X POST "$api/auth/otp/verify?temp_token=$(enc "$temp")&code=$(enc "$otp")&email=$(enc "$email")&password=$(enc "$pass")" || true)
  access=$(printf '%s' "$resp" | field access)
fi
[ -n "$access" ] || { echo "login failed at $api for $email: ${resp:-no answer}"; exit 1; }

( umask 077; printf '%s %s\n%s\n' "$api" "$email" "$access" > "$CACHE" )
ok
