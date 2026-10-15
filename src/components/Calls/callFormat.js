// Small, pure formatters for the Calls screen. Unknown is "—", never 0.

// Seconds as a clock: m:ss under an hour, h:mm:ss from an hour up.
export const formatClock = (seconds) => {
  if (seconds === null || seconds === undefined || seconds === '') return '—';
  const num = Number(seconds);
  if (!Number.isFinite(num) || num < 0) return '—';
  const total = Math.round(num);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// A 0..1 ratio as a whole percentage.
export const formatPercent = (ratio) => {
  if (ratio === null || ratio === undefined) return '—';
  const num = Number(ratio);
  if (!Number.isFinite(num)) return '—';
  return `${Math.round(num * 100)}%`;
};
