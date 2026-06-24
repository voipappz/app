/**
 * Mock call records for template development.
 * 30 deterministic rows (no Math.random) so tests are stable.
 */

const DIRECTIONS = ['inbound', 'outbound'];
const STATUSES = ['completed', 'completed', 'completed', 'failed', 'no-answer', 'busy'];

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

function mkPhone(seed) {
  const last4 = pad(1000 + (seed * 37) % 9000, 4);
  return `+972-50-${pad(100 + (seed * 13) % 900, 3)}-${last4}`;
}

export const MOCK_CALLS = Array.from({ length: 30 }, (_, i) => {
  const direction = DIRECTIONS[i % 2];
  const status = STATUSES[i % STATUSES.length];
  const duration_seconds =
    status === 'completed' ? 30 + (i * 47) % 600 : status === 'no-answer' ? 0 : 5 + (i * 7) % 20;
  const minutesAgo = i * 17 + 3;
  const started_at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return {
    id: `mock-${pad(i, 3)}`,
    from_number: mkPhone(i),
    to_number: mkPhone(i + 1),
    direction,
    duration_seconds,
    status,
    started_at,
  };
});
