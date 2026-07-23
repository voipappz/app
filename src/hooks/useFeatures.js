// useFeatures — read the per-user feature-flag map (voipappz-api GET /api/features)
// and gate UI off it. The map is fetched once per app load and cached at module
// scope, so any number of components can call the hook without refetching.
//
//   const { isEnabled, loading } = useFeatures();
//   if (isEnabled('beta_calls')) { ... }
//
//   // or for a single flag:
//   const { enabled } = useFeature('beta_calls');
//
// Clear the cache on logout so a different user doesn't inherit stale flags —
// call clearFeaturesCache() from your logout handler.
import { useState, useEffect } from 'react';
import { getFeatures } from '../services/featuresApi';

let cache = null;        // last resolved feature map
let inflight = null;     // de-dupes concurrent first-loads

/** Load (and cache) the feature map. Pass force=true to refetch. */
export function loadFeatures(force = false) {
  if (!force && cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = getFeatures()
      .then((map) => { cache = map || {}; return cache; })
      .catch(() => (cache = cache || {}))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Drop the cached flags (call on logout / user switch). */
export function clearFeaturesCache() {
  cache = null;
  inflight = null;
}

/** The whole feature map + an isEnabled() helper. */
export function useFeatures() {
  const [features, setFeatures] = useState(cache || {});
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    loadFeatures().then((map) => {
      if (!alive) return;
      setFeatures(map);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return {
    features,
    loading,
    isEnabled: (name) => !!features[name],
    reload: () => loadFeatures(true).then((map) => { setFeatures(map); return map; }),
  };
}

/** Convenience for gating on a single flag. */
export function useFeature(name) {
  const { isEnabled, loading } = useFeatures();
  return { enabled: isEnabled(name), loading };
}
