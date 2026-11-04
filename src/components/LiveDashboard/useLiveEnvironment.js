import { useMemo } from 'react';
import { useUserAuth } from '../../context/UserAuthContext';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext';

/**
 * Which environments Live shows. No picker of its own: the signed-in identity
 * decides. A portal user has one environment, their own. An account shows
 * every environment selected in the top bar, so the live data, its history and
 * the API server the top bar chose always cover the same environments.
 */
export function useLiveEnvironments() {
  const { user } = useUserAuth();
  const { selectedEnvironments } = useCustomerEnvironment();
  const own = user?.environment;
  const selectedKey = (selectedEnvironments || []).map((e) => `${e?.uuid}:${e?.name || ''}`).join(',');

  return useMemo(() => {
    const environments = own?.uuid
      ? [{ uuid: own.uuid, name: own.name || '' }]
      : (selectedEnvironments || []).filter((e, i, all) => e?.uuid && all.findIndex((x) => x?.uuid === e.uuid) === i)
        .map((e) => ({ uuid: e.uuid, name: e.name || '' }));
    return { uuids: environments.map((e) => e.uuid), environments, own: Boolean(own?.uuid) };
  // The top bar hands a new array on every render; its content is the key.
  }, [own?.uuid, own?.name, selectedKey]);
}
