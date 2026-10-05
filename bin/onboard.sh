#!/usr/bin/env bash
# Make sure there is a valid login token for the API before anything talks to
# it. Reuses the cached token (.env.token) while it is valid, signs in again
# otherwise, and stops with what is missing. TOKEN=1 prints the token.
# Values come from the environment first (CI), then from .env.
set -e -o pipefail

[ -f .env ] || [ -n "$VITE_API_BASE_URL" ] || cp .env.example .env
get() { [ -f .env ] || return 0; sed -n "s/^$1=//p" .env | tail -1; }
# Write KEY=value into .env, replacing the line if it is there.
put() { python3 -c 'import sys
k,v=sys.argv[1],sys.argv[2]; p=".env"
L=[l for l in open(p).read().splitlines() if not l.startswith(k+"=")]
open(p,"w").write("\n".join(L+[k+"="+v])+"\n")' "$1" "$2"; }

# Where a login comes from: voipappz-api's `make tenant` creates a customer
# with an Account login (admin console) and a User login (user portal).
tenant_hint() {
  echo "$1 Create a tenant where the API runs (voipappz-api):"
  if [ -f ../voipappz-api/Makefile ]; then echo "    cd ../voipappz-api && make tenant CUSTOMER=<name> EMAIL=<you@company.com>"
  else echo "    make tenant CUSTOMER=<name> EMAIL=<you@company.com>"; fi
  echo "  It prints an Account login (admin console) and a User login (user portal)."
}

api=${VITE_API_BASE_URL:-$(get VITE_API_BASE_URL)}
email=${TEST_EMAIL:-$(get TEST_EMAIL)}
pass=${TEST_PASSWORD:-$(get TEST_PASSWORD)}
otp=${VA_TEST_OTP:-$(get VA_TEST_OTP)}
case "$api" in *example.com*) api="" ;; esac
case "$email" in you@example.com) email="" ;; esac

# The wizard: ask for what is missing when a person is at the terminal.
if { [ -z "$api" ] || [ -z "$email" ] || [ -z "$pass" ]; } && [ -t 0 ]; then
  echo; echo "Sign in to the VoIPappz API (saved to .env once the login works; git ignores it)"
  tenant_hint "  No login yet?"
  echo
  # Answers stay in memory; .env gets them only once the login works.
  if [ -z "$api" ]; then
    read -r -p "  API address [https://switch.voipappz.io]: " api
    api=${api:-https://switch.voipappz.io}; ask_api=1
  fi
  [ -n "$email" ] || { read -r -p "  Email: " email; ask_email=1; }
  [ -n "$pass" ]  || { read -r -s -p "  Password: " pass; echo; ask_pass=1; }
fi
[ -n "$api" ] || api=https://switch.voipappz.io
if [ -z "$email" ] || [ -z "$pass" ]; then
  echo "Put TEST_EMAIL and TEST_PASSWORD in .env, or run make onboard in a terminal to be asked"
  tenant_hint "No login yet?"
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
ok() {
  echo "token valid for $api as $email"
  if [ -n "$TOKEN" ]; then echo "$access"
  elif [ -t 1 ]; then
    port=${PORT:-3000}
    echo
    echo "  Admin console  http://localhost:$port/admin   (Account login: $email)"
    echo "  User portal    http://localhost:$port/        (User login, created in the console or by make tenant)"
    echo "  Start it with  make dev"
  fi
  exit 0
}

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

# Signed in: now keep what the wizard asked for.
if [ -f .env ]; then
  [ -z "$ask_api" ]   || put VITE_API_BASE_URL "$api"
  [ -z "$ask_email" ] || put TEST_EMAIL "$email"
  [ -z "$ask_pass" ]  || put TEST_PASSWORD "$pass"
fi
( umask 077; printf '%s %s\n%s\n' "$api" "$email" "$access" > "$CACHE" )
ok
