// Health as a colour, the way the old sidebar status dot read it:
//   green   everything reporting healthy
//   orange  DEGRADED — the API answers, but a check failed or warns, or some
//           node probes are down. /health says "ok" while NATS is down, so
//           this is the case that is otherwise invisible.
//   red     the API is unhealthy/unreachable, or every node probe is down
//   grey    still checking
export const HEALTH_COLORS = {
  healthy: 'var(--color-success)',
  degraded: 'var(--color-warning)',
  down: 'var(--color-danger)',
  checking: 'var(--color-neutral)',
};

export function checkLevel(check) {
  if (!check) return 'checking';
  if (check.ok === false) return 'down';
  if (check.warning) return 'degraded';
  return 'healthy';
}

export function overallHealth({ loading, isHealthy, checks, response } = {}, gatus = {}) {
  if (loading && isHealthy === null) return { level: 'checking', reason: 'checking…' };
  const total = gatus.total || 0;
  const down = gatus.down || 0;
  if (isHealthy === false) return { level: 'down', reason: 'API unhealthy' };
  if (total > 0 && down === total) return { level: 'down', reason: 'all node probes down' };
  const failing = Object.entries(checks || {}).filter(([, c]) => checkLevel(c) !== 'healthy').map(([name]) => name);
  const parts = [];
  if (failing.length) parts.push(failing.join(', '));
  if (down > 0) parts.push(`${down}/${total} node probes down`);
  if (response?.severity && !['green', 'ok'].includes(response.severity) && !parts.length) parts.push(`severity ${response.severity}`);
  if (parts.length) return { level: 'degraded', reason: parts.join('; ') };
  return { level: 'healthy', reason: 'all healthy' };
}
