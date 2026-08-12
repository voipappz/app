import { useEffect, useState } from 'react';
import { DENO_API_BASE } from '../../lib/clients/denoApi';
import { getToken } from '../../lib/auth';

export interface DashboardStats {
  total: number;
  answered: number;
  failed: number;
  inbound: number;
  outbound: number;
  avg_duration_sec: number;
}

export interface DashboardCall {
  id: string;
  direction: string;
  from_number: string | null;
  to_number: string | null;
  status: string;
  started_at: string;
  duration_sec: number;
}

export interface CallsPerHourPoint {
  bucket: string;
  inbound: number;
  outbound: number;
  total: number;
}

export interface DashboardSnapshot {
  stats: DashboardStats;
  calls_per_hour: CallsPerHourPoint[];
  recent_calls: DashboardCall[];
}

type DashboardStatus = 'loading' | 'live' | 'error';

const EMPTY: DashboardSnapshot = {
  stats: { total: 0, answered: 0, failed: 0, inbound: 0, outbound: 0, avg_duration_sec: 0 },
  calls_per_hour: [],
  recent_calls: [],
};

/** Dashboard-only DuckDB projection. Calls and Reports never use this hook. */
export function useDashboardSnapshot({ from, to }: { from: Date; to: Date }) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY);
  const [status, setStatus] = useState<DashboardStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const fromEpoch = Math.floor(from.getTime() / 1000);
  const toEpoch = Math.floor(to.getTime() / 1000);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const token = typeof getToken === 'function' ? getToken() : null;
        const params = new URLSearchParams({ from: String(fromEpoch), to: String(toEpoch) });
        const response = await fetch(`${DENO_API_BASE}/dashboard/snapshot?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json() as DashboardSnapshot;
        if (alive) { setSnapshot(body); setStatus('live'); setError(null); }
      } catch (reason) {
        if (alive) {
          setStatus('error');
          setError(reason instanceof Error ? reason.message : 'failed');
        }
      }
    };
    load();
    const timer = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(timer); };
  }, [fromEpoch, toEpoch]);

  return { snapshot, status, error };
}
