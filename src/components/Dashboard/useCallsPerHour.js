import { useEffect, useState } from 'react';
import { getCalls } from '../../services/callsApi';
import { bucketCallsPerHour } from './callsPerHourBuckets';

// How many calls we pull to build the series. The API pages by recency, so a
// tenant busier than this loses the OLDEST hours of the window, not the newest.
// Reported as `truncated` rather than silently drawing a short chart.
const MAX_CALLS = 500;

/**
 * Calls-per-hour, derived from the mothership's own call list.
 *
 * It used to come from InfluxDB via deno's `/dashboard/calls-per-hour`, which
 * answers 503 unless INFLUXDB_URL is configured — so on every install that had
 * not provisioned a second datastore, the chart was permanently empty. The
 * calls are already in the API this app reads for the Calls page; bucketing
 * them needs no extra infrastructure and cannot disagree with that page.
 *
 * Returns `points: [{ bucket, inbound, outbound, total }]`, or null while
 * loading / on failure.
 */
export function useCallsPerHour({ minutes = 1440 } = {}) {
  const [points, setPoints] = useState(null);
  const [error, setError] = useState(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let alive = true;
    const to = Date.now();
    const from = to - minutes * 60 * 1000;

    getCalls({ perPage: MAX_CALLS, range: { start: from, end: to }, orderBy: 'created_at', orderType: 'desc' })
      .then(({ rows, total }) => {
        if (!alive) return;
        setPoints(bucketCallsPerHour(rows, { from, to }));
        setTruncated(Number(total) > MAX_CALLS);
        setError(null);
      })
      .catch((reason) => {
        if (!alive) return;
        setError(reason?.message || 'failed');
        setPoints(null);
      });

    return () => { alive = false; };
  }, [minutes]);

  return { points, error, truncated };
}
