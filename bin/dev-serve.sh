#!/usr/bin/env bash
# Start the Vite dev server in the background and block until it answers.
#
# Never trusts "something answers on $PORT". Another app on a developer's
# machine holding :3000 made `curl localhost:3000` succeed, `serve` report
# "already up", and the whole Playwright suite then run against the OTHER app —
# green, and meaningless. We only accept a port we can prove is ours: a live
# pid we started, or a response carrying this app's Vite client.
set -e -o pipefail

PORT="${PORT:-3000}"
LOG="${LOG:-/tmp/vite-${PORT}.log}"
PIDFILE="${PIDFILE:-/tmp/vite-${PORT}.pid}"

ours() {
  # A pid we started and is still alive.
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then return 0; fi
  # Or a server serving this app: Vite injects its client into index.html.
  curl -fsS --max-time 3 "http://localhost:${PORT}/" 2>/dev/null | grep -q '/@vite/client'
}

if ours; then
  echo "server already up on :${PORT}"
  exit 0
fi

# A stale pidfile from a killed run makes every later `serve` think a server is
# up. Clear it before deciding the port is free.
rm -f "$PIDFILE"

if curl -fsS --max-time 3 "http://localhost:${PORT}/" >/dev/null 2>&1; then
  echo "port ${PORT} is held by something that is not this app."
  echo "stop it, or choose another port:  make dev PORT=3001"
  exit 1
fi

npm run dev -- --port "$PORT" > "$LOG" 2>&1 &
echo $! > "$PIDFILE"

for _ in $(seq 60); do
  if ours; then echo "server up on :${PORT}"; exit 0; fi
  # The server can die at boot (port taken, bad .env). Notice, don't wait 60s.
  if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "dev server exited during startup -- last lines of ${LOG}:"
    tail -20 "$LOG"
    rm -f "$PIDFILE"
    exit 1
  fi
  sleep 1
done

echo "server did not answer within 60s -- see ${LOG}"
tail -20 "$LOG"
exit 1
