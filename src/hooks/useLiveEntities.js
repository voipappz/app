import { useEffect, useMemo, useRef, useState } from 'react';
import { getConsumer } from '../services/cable.js';

/**
 * useLiveEntities — live state over the cable, replacing the poll.
 *
 * A subscription to the node's LiveChannel on the page's one ActionCable
 * consumer (services/cable.js). The node materialises `state.*` deltas into
 * JetStream KV and the channel serves that bucket with one `watch`, which
 * delivers the CURRENT value of every entity and then every change. So a
 * screen mounting mid-shift gets the whole picture at once — no snapshot
 * request, no reducer here: each frame carries a whole document.
 *
 * Frames look like:
 *   { scope: "user", id: "<uuid>", revision: 12, deleted: false, doc: {...} }
 *
 * `deleted` matters: replacing documents updates rows but never removes one
 * that is gone, so an entity that disappears has to say so explicitly. And a
 * RECONNECT re-delivers the whole snapshot, which is why the rows are dropped
 * when one is confirmed: a key deleted while the link was down never sends its
 * deletion, and keeping the old map would show it forever.
 */

// Renders are coalesced rather than painted per frame: a busy environment can
// deliver dozens a second, and React re-rendering a table that often is what
// makes a dashboard tab unusable.
const COALESCE_MS = 250;

// Worst first: the screen is live only when every environment is.
const STATUS_RANK = ['rejected', 'unavailable', 'disconnected', 'reconnecting', 'pending', 'idle', 'confirmed'];

// One environment uuid or several: an account watches every environment
// selected in the top bar, and the channel is per environment, so it is one
// subscription each, kept in one list.
export default function useLiveEntities(environmentUuids, scope = null) {
  const list = (Array.isArray(environmentUuids) ? environmentUuids : [environmentUuids]).filter(Boolean);
  const envKey = [...new Set(list)].sort().join(',');
  const [version, setVersion] = useState(0);
  const [statuses, setStatuses] = useState({});
  const [unavailable, setUnavailable] = useState(false);
  const entities = useRef(new Map());
  const pending = useRef(false);
  // Counted per frame, published with the coalesced render — a state update
  // per frame is exactly the re-render storm the coalescing exists to stop.
  const stats = useRef({ frames: 0, lastFrameAt: null });
  const [published, setPublished] = useState({ frames: 0, lastFrameAt: null });

  // Derived, not received, on the node side too — this only NARROWS what the
  // channel already scoped to the verified identity.
  const identifiers = useMemo(() => (envKey ? envKey.split(',') : []).map((env) => {
    const id = { channel: 'LiveChannel', environment_uuid: env };
    if (scope) id.scope = scope;
    return id;
  }), [envKey, scope]);

  useEffect(() => {
    // A new set of environments is a different dataset, not more of the same.
    entities.current.clear();
    stats.current = { frames: 0, lastFrameAt: null };
    setPublished(stats.current);
    setVersion((v) => v + 1);
    setUnavailable(false);
    if (!identifiers.length) { setStatuses({}); return undefined; }
    const consumer = getConsumer();
    if (!consumer) { setStatuses({}); setUnavailable(true); return undefined; }

    const flush = () => {
      if (pending.current) return;
      pending.current = true;
      setTimeout(() => {
        pending.current = false;
        setVersion((v) => v + 1);
        setPublished({ ...stats.current });
      }, COALESCE_MS);
    };
    const setStatus = (env, update) => setStatuses((all) => ({ ...all, [env]: update(all[env] || { status: 'pending', confirmedAt: null }) }));
    setStatuses(Object.fromEntries(identifiers.map((id) => [id.environment_uuid, { status: 'pending', confirmedAt: null }])));

    // ActionCable flags `reconnected` on the first subscription confirmed after
    // a reconnect only; any environment confirmed before is re-delivering too.
    const confirmedBefore = new Set();
    const subs = identifiers.map((identifier) => {
      const env = identifier.environment_uuid;
      return consumer.subscriptions.create(identifier, {
        connected({ reconnected } = {}) {
          if (reconnected || confirmedBefore.has(env)) {
            // This environment's snapshot comes again; the others keep theirs.
            for (const key of entities.current.keys()) if (key.startsWith(`${env}|`)) entities.current.delete(key);
            flush();
          }
          confirmedBefore.add(env);
          setStatus(env, (s) => ({ ...s, status: 'confirmed', confirmedAt: Date.now() }));
        },
        disconnected({ willAttemptReconnect } = {}) {
          setStatus(env, (s) => (s.status === 'rejected' ? s
            : { ...s, status: willAttemptReconnect ? 'reconnecting' : 'disconnected' }));
        },
        rejected() {
          // Not this session's environment, or the node could not resolve it.
          // The library does not retry a rejection, and neither should we.
          setStatus(env, (s) => ({ ...s, status: 'rejected' }));
        },
        received(data) {
          if (!data || !data.id) return;
          const key = `${env}|${data.scope}:${data.id}`;
          if (data.deleted) entities.current.delete(key);
          else entities.current.set(key, { scope: data.scope, id: data.id, environment_uuid: env, ...data.doc });
          stats.current = { frames: stats.current.frames + 1, lastFrameAt: Date.now() };
          flush();
        },
      });
    });

    // Unsubscribe, don't just drop the reference: the server keeps streaming
    // to a subscription nobody told it to end.
    return () => subs.forEach((sub) => sub.unsubscribe());
  }, [identifiers]);

  const rows = useMemo(
    () => Array.from(entities.current.values()),
    [version],
  );

  const each = Object.values(statuses);
  const status = unavailable ? 'unavailable'
    : !identifiers.length ? 'idle'
      : STATUS_RANK.find((rank) => each.some((s) => s.status === rank)) || 'pending';
  const confirmedAt = status === 'confirmed' ? Math.max(...each.map((s) => s.confirmedAt || 0)) || null : null;

  return {
    rows,
    byScope: (want) => rows.filter((r) => r.scope === want),
    connected: status === 'confirmed',
    rejected: status === 'rejected',
    status,
    subscription: {
      status, confirmedAt, ...published,
      identifier: identifiers.length === 1 ? identifiers[0] : identifiers.length ? identifiers : null,
      environmentUuid: envKey ? envKey.split(',').join(', ') : null,
    },
  };
}
