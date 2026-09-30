import { didsApi } from '../../services/api/routesApi';
import { queuesApi } from '../../services/api/queuesApi';
import { ivrApi } from '../../services/api/ivrApi';
import { getCallCondition } from '../../services/api/callConditionsApi';
import { bridgeApi } from '../../services/api/bridgeApi';
import { providersApi } from '../../services/api/providersApi';
import { subscriptionsApi } from '../../services/api/subscriptionsApi';
import { tariffsApi } from '../../services/api/tariffsApi';

const MAX_DEPTH = 10;

/**
 * Shared topology builder used by both the single-DID PBX routing view and the
 * environment-wide Studio canvas. It walks a DID's full routing chain (IVR →
 * queue → extension/announcement/condition…) plus its billing context, pushing
 * ReactFlow nodes + edges into a shared context object.
 *
 * The context's `cache`/dedupe means a resource referenced by several DIDs (a
 * shared queue, the same provider) renders as ONE node with edges from each
 * source — so building many DIDs into one context yields a clean merged graph.
 */
export function createTopologyContext() {
  return {
    rawNodes: [],
    rawEdges: [],
    cache: new Map(), // `${type}:${uuid}` → fetched data (also memoizes provider/sub lists)
  };
}

// `sip_provider` is a trunk route's bridge (API Did::TRUNK_BRIDGE): the same
// Provider row the billing context draws, so it shares the `provider` node.
const TYPE_ALIASES = { que: 'queue', sip_provider: 'provider' };
const normType = (t) => TYPE_ALIASES[t] || t;

/**
 * Build the topology for a single DID into the shared context.
 * @param {string} didUuid
 * @param {{rawNodes:Array, rawEdges:Array, cache:Map}} ctx
 * @param {{includeBilling?:boolean}} [opts]
 * @returns {Promise<object|null>} the DID record, or null if not found
 */
export async function buildDidTopology(didUuid, ctx, opts = {}) {
  const { includeBilling = true } = opts;
  const { rawNodes, rawEdges, cache } = ctx;

  const addNode = (id, type, data) => {
    if (rawNodes.some((n) => n.id === id)) return;
    rawNodes.push({ id, type, data, position: { x: 0, y: 0 } });
  };

  const addEdge = (source, target, sourceHandle, label, edgeType) => {
    const id = `${source}__${sourceHandle || 'default'}__${target}`;
    if (rawEdges.some((e) => e.id === id)) return;
    rawEdges.push({
      id,
      source,
      target,
      sourceHandle: sourceHandle || 'default',
      label,
      type: 'pbxEdge',
      data: { edgeType },
    });
  };

  const fetchResource = async (type, uuid) => {
    const key = `${type}:${uuid}`;
    if (cache.has(key)) return cache.get(key);

    let result;
    try {
      switch (type) {
        case 'queue': {
          const r = await queuesApi.getQueue(uuid);
          result = r?.data || r;
          break;
        }
        case 'ivr': {
          const r = await ivrApi.getIVR(uuid);
          result = r?.data || r;
          break;
        }
        case 'call_condition': {
          const r = await getCallCondition(uuid);
          result = r?.data || r;
          break;
        }
        case 'provider': {
          const r = await providersApi.getProvider(uuid);
          result = r?.data || r;
          break;
        }
        default: {
          const r = await bridgeApi.getBridgeResource(type, uuid);
          result = r?.data || r;
          break;
        }
      }
    } catch (err) {
      console.warn(`Topology: failed to fetch ${type}/${uuid}:`, err);
      result = { uuid, name: uuid.slice(0, 8) + '...' };
    }

    cache.set(key, result);
    return result;
  };

  const resolve = async (bridgeType, bridgeUuid, parentNodeId, sourceHandle, edgeLabel, edgeType, visited, depth) => {
    if (!bridgeType || !bridgeUuid) return;
    if (depth > MAX_DEPTH) return;

    const bt = normType(bridgeType);
    const nodeId = `${bt}-${bridgeUuid}`;

    if (visited.has(nodeId)) {
      addEdge(parentNodeId, nodeId, sourceHandle, edgeLabel, edgeType);
      return;
    }

    const pathVisited = new Set(visited);
    pathVisited.add(nodeId);

    const data = await fetchResource(bt, bridgeUuid);
    if (!data) return;

    addNode(nodeId, bt, data);
    addEdge(parentNodeId, nodeId, sourceHandle, edgeLabel, edgeType);

    // ── Queue: announcements + timeout destination ──
    if (bt === 'queue') {
      const introUuid = data.intro_announcement?.uuid || data.intro_announcement_uuid;
      if (introUuid) {
        await resolve('announcement', introUuid, nodeId, 'intro-announcement', 'Intro Announcement', 'queue-intro', pathVisited, depth + 1);
      }
      const holdUuid = data.hold_announcement?.uuid || data.hold_announcement_uuid;
      if (holdUuid) {
        await resolve('announcement', holdUuid, nodeId, 'hold-announcement', 'Hold Music', 'queue-hold', pathVisited, depth + 1);
      }
      const tbt = normType(data.max_wait_time_bridge_type);
      if (tbt && data.max_wait_time_bridge_uuid) {
        const timeoutLabel = `Timeout (${data.max_wait_time || 0}s)`;
        await resolve(tbt, data.max_wait_time_bridge_uuid, nodeId, 'timeout', timeoutLabel, 'queue-timeout', pathVisited, depth + 1);
      }
    }

    // ── IVR: each entry + timeout + invalid ──
    if (bt === 'ivr') {
      const entries = data.entries || data.options || {};
      const entryList = Array.isArray(entries)
        ? entries
        : Object.entries(entries).map(([key, val]) => ({ key, ...val }));

      await Promise.all(entryList.map(async (entry) => {
        const ebt = normType(entry.bridge_type);
        const digit = entry.key || entry.digit || entry.name;
        if (ebt && entry.bridge_uuid) {
          await resolve(ebt, entry.bridge_uuid, nodeId, `entry-${digit}`, `Key ${digit}`, 'ivr-entry', pathVisited, depth + 1);
        }
      }));

      const tbt = normType(data.timeout_bridge_type);
      if (tbt && data.timeout_bridge_uuid) {
        await resolve(tbt, data.timeout_bridge_uuid, nodeId, 'timeout', 'Timeout', 'ivr-timeout', pathVisited, depth + 1);
      }
      const ibt = normType(data.invalid_bridge_type);
      if (ibt && data.invalid_bridge_uuid) {
        await resolve(ibt, data.invalid_bridge_uuid, nodeId, 'invalid', 'Invalid', 'ivr-invalid', pathVisited, depth + 1);
      }
    }

    // ── Call Condition: each rule + fallback ──
    if (bt === 'call_condition') {
      const resources = data.resources || [];
      await Promise.all(resources.map(async (res, i) => {
        const rbt = normType(res.bridge_type);
        if (rbt && res.bridge_uuid) {
          const label = `Rule #${i + 1}: ${res.name || ''}`.trim();
          await resolve(rbt, res.bridge_uuid, nodeId, `rule-${i}`, label, 'cc-rule', pathVisited, depth + 1);
        }
      }));
      const fbt = normType(data.fallback_bridge_type);
      if (fbt && data.fallback_bridge_uuid) {
        await resolve(fbt, data.fallback_bridge_uuid, nodeId, 'fallback', 'Fallback', 'cc-fallback', pathVisited, depth + 1);
      }
    }
  };

  // Provider/subscription list lookups are memoized in the shared cache so an
  // environment-wide build fetches them once, not once per DID.
  const getAllProviders = async () => {
    const key = 'providers:all';
    if (cache.has(key)) return cache.get(key);
    const providers = await providersApi.getProviders().catch(() => []);
    const list = Array.isArray(providers) ? providers : (providers?.data || []);
    cache.set(key, list);
    return list;
  };

  const getEnvSubscriptions = async (environmentUuid) => {
    const key = `subs:${environmentUuid}`;
    if (cache.has(key)) return cache.get(key);
    const subs = await subscriptionsApi.getSubscriptions({
      'search[environment_uuid]': environmentUuid,
      'search[enabled]': true,
      per_page: 5,
    }).catch(() => []);
    const list = Array.isArray(subs) ? subs : (subs?.data || []);
    cache.set(key, list);
    return list;
  };

  const fetchBillingContext = async (did, didNodeId) => {
    const [providerList, subList] = await Promise.all([
      getAllProviders(),
      did.environment_uuid ? getEnvSubscriptions(did.environment_uuid) : Promise.resolve([]),
    ]);

    const matchedProvider = did.provider_uuid
      ? providerList.find((p) => p.uuid === did.provider_uuid)
      : null;

    if (matchedProvider) {
      const provNodeId = `provider-${matchedProvider.uuid}`;
      addNode(provNodeId, 'provider', matchedProvider);
      addEdge(provNodeId, didNodeId, 'default', 'Inbound', 'provider-did');

      if (matchedProvider.tariff_uuid) {
        const tkey = `tariff:${matchedProvider.tariff_uuid}`;
        try {
          let tariffData = cache.get(tkey);
          if (!tariffData) {
            const tariff = await tariffsApi.getTariff(matchedProvider.tariff_uuid);
            tariffData = tariff?.data || tariff;
            cache.set(tkey, tariffData);
          }
          if (tariffData?.uuid) {
            const tariffNodeId = `tariff-${tariffData.uuid}`;
            addNode(tariffNodeId, 'tariff', tariffData);
            addEdge(provNodeId, tariffNodeId, 'tariff', 'Tariff', 'provider-tariff');
          }
        } catch { /* skip tariff on failure */ }
      }
    }

    const activeSub = subList.find((s) => s.status === 'active') || subList[0];
    if (activeSub?.uuid) {
      const subNodeId = `subscription-${activeSub.uuid}`;
      addNode(subNodeId, 'subscription', activeSub);
      addEdge(subNodeId, didNodeId, 'default', 'Billing', 'subscription-env');
    }
  };

  // 1. Fetch the DID
  const did = await didsApi.getDID(didUuid);
  if (!did) return null;

  const didNodeId = `did-${did.uuid}`;
  addNode(didNodeId, 'did', did);

  // 2. Billing context + 3. routing chain, in parallel
  const billingPromise = includeBilling ? fetchBillingContext(did, didNodeId) : Promise.resolve();
  const bt = normType(did.bridge_type);
  const routingPromise = (bt && did.bridge_uuid)
    ? resolve(bt, did.bridge_uuid, didNodeId, 'default', bt === 'provider' ? 'Trunk' : bt, 'did-bridge', new Set([didNodeId]), 1)
    : Promise.resolve();

  await Promise.all([billingPromise, routingPromise]);
  return did;
}
