#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="voipappz-api-crystal-test:local"
container="voipappz-crystal-pipeline-test"
port="${CRYSTAL_TEST_PORT:-4401}"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
cleanup

docker build -f "$repo_dir/api/Dockerfile" -t "$image" "$repo_dir/api"
docker run -d --name "$container" \
  -p "127.0.0.1:${port}:3000" \
  -e MOCK_CRYSTAL_EVENTS=1 \
  -e EVENT_STORE_PATH=/data/test-events.duckdb \
  "$image" >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${port}/test" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${port}/test" >/dev/null

curl -fsS -X POST "http://127.0.0.1:${port}/test/crystal/events" \
  -H 'content-type: application/json' \
  -d '{"call_id":"ci-crystal-call","direction":"inbound","from":"100","to":"200"}' \
  >/tmp/voipappz-crystal-trigger.json
curl -fsS "http://127.0.0.1:${port}/health" >/tmp/voipappz-crystal-health.json
curl -fsS "http://127.0.0.1:${port}/dashboard/snapshot" >/tmp/voipappz-crystal-dashboard.json

python3 -c '
import json
trigger=json.load(open("/tmp/voipappz-crystal-trigger.json"))
health=json.load(open("/tmp/voipappz-crystal-health.json"))
dashboard=json.load(open("/tmp/voipappz-crystal-dashboard.json"))
assert trigger["accepted"] == 3, trigger
assert health["event_pipeline"] == {"received":3,"persisted":3,"duplicates":0,"persistence_failures":0,"relayed":3}, health
assert health["checks"]["event_store"]["events"] == 3, health
assert dashboard["stats"]["total"] == 1, dashboard
assert dashboard["stats"]["answered"] == 1, dashboard
assert dashboard["recent_calls"][0]["status"] == "completed", dashboard
assert dashboard["recent_calls"][0]["duration_sec"] == 60, dashboard
print("Crystal pipeline OK: 3 received, 3 persisted, 1 completed Dashboard call")
'
