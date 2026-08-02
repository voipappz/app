#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="$(mktemp -d /tmp/voipappz-verify-build.XXXXXX)"
preview_pid=""

cleanup() {
  if [[ -n "$preview_pid" ]]; then kill "$preview_pid" 2>/dev/null || true; fi
  rm -rf "$build_dir"
}
trap cleanup EXIT INT TERM

cd "$repo_dir"

echo '==> ESLint'
npm run lint

echo '==> Frontend unit tests'
npm run test:run

echo '==> Deno type-check and tests'
if command -v deno >/dev/null 2>&1; then
  (
    cd api
    deno check app.ts server.ts
    deno test --allow-net --allow-env --allow-read --allow-write --allow-ffi tests/
  )
elif command -v docker >/dev/null 2>&1; then
  docker run --rm -e DENO_DIR=/deno-dir -v voipappz-deno-cache:/deno-dir \
    -v "$repo_dir:/work" -w /work/api denoland/deno:2.5.3 deno check app.ts server.ts
  docker run --rm -e DENO_DIR=/deno-dir -v voipappz-deno-cache:/deno-dir \
    -v "$repo_dir:/work" -w /work/api denoland/deno:2.5.3 \
    deno test --allow-net --allow-env --allow-read --allow-write --allow-ffi tests/
else
  echo 'Deno verification requires either deno or Docker.' >&2
  exit 1
fi

echo '==> Production build'
VITE_MOCK_LOGIN=1 VITE_USE_MOCK=1 npm run build -- --outDir "$build_dir"

echo '==> End-user module smoke (login, Dashboard, Calls, Reports)'
npx vite preview --host 127.0.0.1 --port 4200 --strictPort --outDir "$build_dir" > /tmp/voipappz-verify-preview.log 2>&1 &
preview_pid=$!
npx wait-on -t 30000 http://127.0.0.1:4200

if [[ "${VERIFY_E2E_NATIVE:-0}" != "1" ]] && command -v docker >/dev/null 2>&1; then
  docker run --rm --network host \
    -v "$repo_dir:/work" -w /work \
    mcr.microsoft.com/playwright:v1.57.0-noble \
    npx playwright test tests/smoke.spec.ts --output=/tmp/voipappz-pw-results
else
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:4200 \
    npx playwright test tests/smoke.spec.ts --output="$build_dir/playwright-results"
fi

echo '==> Pre-push verification passed'
