import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { didsApi } from '../../../services/api/routesApi';

const uuidOf = (did) => did?.uuid || did?.id;

/**
 * Which route's details are open: `?route=<uuid>` on /routes. Living in the
 * URL, the phone's Back button closes the details, and a link (or the phone
 * redirect from the workflow) opens them.
 *
 * The route comes from the loaded page of the list; one that is not on it is
 * fetched by itself.
 */
export function useRouteDetails(dids) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const uuid = params.get('route');
  const listed = uuid ? dids.find((did) => uuidOf(did) === uuid) : null;
  const [fetched, setFetched] = useState(null); // { uuid, did } or { uuid, missing: true }

  useEffect(() => {
    if (!uuid || listed || fetched?.uuid === uuid) return undefined;
    let live = true;
    didsApi.getDID(uuid)
      .then((response) => {
        const did = response?.data && uuidOf(response.data) ? response.data : response;
        if (live) setFetched(uuidOf(did) ? { uuid, did } : { uuid, missing: true });
      })
      .catch(() => { if (live) setFetched({ uuid, missing: true }); });
    return () => { live = false; };
  }, [uuid, listed, fetched]);

  const open = useCallback((did) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('route', uuidOf(did));
      return next;
    }, { state: { routeDetails: true } });
  }, [setParams]);

  // Back to where the details were opened from; a link that landed here
  // directly has nowhere to go back to, so it just drops the parameter.
  const close = useCallback(() => {
    if (location.state?.routeDetails) {
      navigate(-1);
      return;
    }
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('route');
      return next;
    }, { replace: true });
  }, [location.state, navigate, setParams]);

  const fetchedHere = fetched?.uuid === uuid ? fetched : null;
  return {
    uuid,
    did: listed || fetchedHere?.did || null,
    missing: Boolean(!listed && fetchedHere?.missing),
    open,
    close,
  };
}
