#!/usr/bin/env bash
# One command from a fresh .env to a working login against the API, for a
# person or an agent. Says exactly which value is missing and who has it.
#
# Also the login gate in front of every make target that talks to the API
# (dev, serve, test): a cached token still valid for this API and email is
# reused, anything else signs in again, and a failed sign-in stops the target
# before it starts a server or a browser against a login that cannot work.
#
#   TOKEN=1       print the access JWT (for curl or an agent's own calls)
#   FORCE=1       ignore the cached token and sign in again
#   SKIP_LOGIN=1  skip the gate (offline work on the UI only)
#
# Values come from the environment first (CI passes secrets that way), then
# from .env. The token is cached in .env.token (gitignored by .env.*).
set -e -o pipefail

[ -n "$SKIP_LOGIN" ] && { echo "login check skipped (SKIP_LOGIN=1)"; exit 0; }

CACHE=.env.token
[ -f .env ] || [ -n "$VITE_API_BASE_URL" ] || { cp .env.example .env; echo "created .env from .env.example"; }
get() { [ -f .env ] && sed -n "s/^$1=//p" .env | tail -1; }

api=${VITE_API_BASE_URL:-$(get VITE_API_BASE_URL)}
case "$api" in ''|*example.com*) api=https://switch.voipappz.io
  sed -i.bak "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=$api|" .env && rm -f .env.bak
  echo "VITE_API_BASE_URL set to $api" ;;
esac
email=${TEST_EMAIL:-$(get TEST_EMAIL)}
pass=${TEST_PASSWORD:-$(get TEST_PASSWORD)}
otp=${VA_TEST_OTP:-$(get VA_TEST_OTP)}

missing=""
case "$email" in ''|you@example.com) missing="$missing TEST_EMAIL" ;; esac
[ -n "$pass" ] || missing="$missing TEST_PASSWORD"
if [ -n "$missing" ]; then
  cat <<EOF

  Missing in .env:$missing

  Ask the switch operator for them. They create the login on the API host with
      make tenant CUSTOMER=<name> EMAIL=<you@company.com>     (voipappz-api)
  which prints the email and password. Put both in .env and run: make onboard
  (VA_TEST_OTP is needed only if OTP is enabled on the API; it is off by default.)
  Working on the UI offline? Add SKIP_LOGIN=1.

EOF
  exit 1
fi

enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$1"; }
field() { python3 -c 'import sys,json
try: print(json.load(sys.stdin).get(sys.argv[1],""))
except Exception: print("")' "$1"; }
# Seconds the JWT has left, from its own exp claim; 0 when it cannot be read.
ttl() { python3 -c 'import sys,json,base64,time
try:
  p=sys.argv[1].split(".")[1]; p+="="*(-len(p)%4)
  print(max(0,int(json.loads(base64.urlsafe_b64decode(p))["exp"]-time.time())))
except Exception: print(0)' "$1"; }
done_msg() {
  echo "token valid for $api as $email ($(( $1 / 60 )) min left)"
  if [ -n "$TOKEN" ]; then echo "$access"; fi
}

# The cache is reused only for the same API and email, with a minute to spare
# so a command that starts now does not die mid-run on an expiring token.
if [ -z "$FORCE" ] && [ -f "$CACHE" ]; then
  c_api=$(sed -n 's/^api=//p' "$CACHE"); c_email=$(sed -n 's/^email=//p' "$CACHE")
  access=$(sed -n 's/^access=//p' "$CACHE")
  if [ "$c_api" = "$api" ] && [ "$c_email" = "$email" ]; then
    left=$(ttl "$access")
    if [ "$left" -gt 60 ]; then done_msg "$left"; exit 0; fi
  fi
fi

step1=$(curl -s --max-time 15 -X POST "$api/auth/login?email=$(enc "$email")&password=$(enc "$pass")")
access=$(printf '%s' "$step1" | field access)
temp=$(printf '%s' "$step1" | field temp_token)
if [ -z "$access" ] && [ -z "$temp" ]; then
  rm -f "$CACHE"
  echo "login refused by $api for $email: ${step1:-no answer}"
  echo "(5 failed logins lock the account for 15 minutes -- check the password before retrying)"
  exit 1
fi
# OTP is off by default: the login answers with the tokens. Only when it says
# otp_sent is there a second step, and only then is VA_TEST_OTP needed.
if [ -z "$access" ]; then
  [ -n "$otp" ] || { echo "$api has OTP enabled: put its bypass code in .env as VA_TEST_OTP"; exit 1; }
  step2=$(curl -s --max-time 15 -X POST "$api/auth/otp/verify?temp_token=$(enc "$temp")&code=$(enc "$otp")&email=$(enc "$email")&password=$(enc "$pass")")
  access=$(printf '%s' "$step2" | field access)
  [ -n "$access" ] || { rm -f "$CACHE"; echo "OTP step refused by $api: $step2"; exit 1; }
fi

( umask 077; printf 'api=%s\nemail=%s\naccess=%s\n' "$api" "$email" "$access" > "$CACHE" )
echo "signed in to $api as $email"
done_msg "$(ttl "$access")"
