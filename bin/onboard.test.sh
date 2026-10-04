#!/usr/bin/env bash
# Tests for the login gate (bin/onboard.sh), offline: no request reaches an API.
set -e -o pipefail
gate=$(cd "$(dirname "$0")" && pwd)/onboard.sh
dir=$(mktemp -d); trap 'rm -rf "$dir"' EXIT
cd "$dir" && cp "$OLDPWD/.env.example" .
unset VITE_API_BASE_URL TEST_EMAIL TEST_PASSWORD VA_TEST_OTP TOKEN
fail() { echo "FAIL: $1"; exit 1; }
jwt() { python3 -c 'import base64,json,time,sys
e=lambda d:base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
print(e({"alg":"HS256"})+"."+e({"exp":int(time.time())+int(sys.argv[1])})+".sig")' "$1"; }

out=$("$gate" 2>&1) && fail "no credentials should stop"
echo "$out" | grep -q "TEST_EMAIL and TEST_PASSWORD" || fail "no credentials: wrong message: $out"
grep -q '^VITE_API_BASE_URL=https://switch.voipappz.io$' .env || fail "API not set to switch"
echo "ok  no credentials stop, API defaults to switch"

printf 'TEST_EMAIL=gate@example.invalid\nTEST_PASSWORD=x\n' >> .env
t=$(jwt 3600)
printf 'https://switch.voipappz.io gate@example.invalid\n%s\n' "$t" > .env.token
"$gate" | grep -q "token valid" || fail "valid cached token not reused"
[ "$(TOKEN=1 "$gate" | tail -1)" = "$t" ] || fail "TOKEN=1 did not print the token"
echo "ok  valid cached token reused, TOKEN=1 prints it"

printf 'http://127.0.0.1:9 gate@example.invalid\n%s\n' "$t" > .env.token
out=$(VITE_API_BASE_URL=http://127.0.0.1:9 TEST_EMAIL=other@example.invalid "$gate" 2>&1) && fail "token for another email reused"
echo "$out" | grep -q "login failed" || fail "other email: wrong message: $out"
echo "ok  token for another email not reused, environment overrides .env"

printf 'http://127.0.0.1:9 gate@example.invalid\n%s\n' "$(jwt 30)" > .env.token
VITE_API_BASE_URL=http://127.0.0.1:9 "$gate" >/dev/null 2>&1 && fail "expiring token accepted"
[ ! -f .env.token ] || fail "failed login left a token behind"
echo "ok  expiring token signs in again, a failed login clears the cache"

rm -f .env .env.token
out=$(VITE_API_BASE_URL=http://127.0.0.1:9 TEST_EMAIL=ci@example.invalid TEST_PASSWORD=x "$gate" 2>&1) && fail "unreachable API accepted"
echo "$out" | grep -q "login failed" || fail "no .env (CI): wrong message: $out"
echo "ok  without .env (as in CI) it uses the environment and reports a failed login"
