#!/usr/bin/env bash
# One command from a fresh .env to a working login against the API, for a
# person or an agent. Says exactly which value is missing and who has it.
# TOKEN=1 prints the access JWT (for curl or an agent's own calls).
set -e -o pipefail

[ -f .env ] || { cp .env.example .env; echo "created .env from .env.example"; }
get() { sed -n "s/^$1=//p" .env | tail -1; }

api=$(get VITE_API_BASE_URL)
case "$api" in ''|*example.com*) api=https://switch.voipappz.io
  sed -i.bak "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=$api|" .env && rm -f .env.bak
  echo "VITE_API_BASE_URL set to $api" ;;
esac
email=$(get TEST_EMAIL); pass=$(get TEST_PASSWORD); otp=$(get VA_TEST_OTP)

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

EOF
  exit 1
fi

enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$1"; }
field() { python3 -c 'import sys,json
try: print(json.load(sys.stdin).get(sys.argv[1],""))
except Exception: print("")' "$1"; }

step1=$(curl -s --max-time 15 -X POST "$api/auth/login?email=$(enc "$email")&password=$(enc "$pass")")
access=$(printf '%s' "$step1" | field access)
temp=$(printf '%s' "$step1" | field temp_token)
if [ -z "$access" ] && [ -z "$temp" ]; then
  echo "login refused by $api for $email: $step1"
  echo "(5 failed logins lock the account for 15 minutes -- check the password before retrying)"
  exit 1
fi
# OTP is off by default: the login answers with the tokens. Only when it says
# otp_sent is there a second step, and only then is VA_TEST_OTP needed.
if [ -z "$access" ]; then
  [ -n "$otp" ] || { echo "$api has OTP enabled: put its bypass code in .env as VA_TEST_OTP"; exit 1; }
  step2=$(curl -s --max-time 15 -X POST "$api/auth/otp/verify?temp_token=$(enc "$temp")&code=$(enc "$otp")&email=$(enc "$email")&password=$(enc "$pass")")
  access=$(printf '%s' "$step2" | field access)
  [ -n "$access" ] || { echo "OTP step refused by $api: $step2"; exit 1; }
fi

echo "signed in to $api as $email"
if [ -n "$TOKEN" ]; then echo "$access"; else echo "(TOKEN=1 prints the access token)"; fi
echo "next: make dev   ->  http://localhost:3000"
