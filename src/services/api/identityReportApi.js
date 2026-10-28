import { apiService } from '../apiService';

// Reports over `identities` — the live stream's history (voipappz-api
// IdentityReport). Same contract as monitoringApi's CDR report: the client
// names dimensions, measures, a bucket and filters; the API builds the SQL and
// always applies the session's own scope.
export const identityReportApi = {
  getCatalog: async ({ environmentUuids = [], customerUuid = '' } = {}) => {
    const qs = new URLSearchParams();
    if (environmentUuids.length) qs.append('environment_uuids', environmentUuids.join(','));
    else if (customerUuid) qs.append('customer_uuid', customerUuid);
    return apiService.get(`/api/identities/catalog?${qs.toString()}`, {}, 'fetching identities catalog', false, true);
  },

  runReport: async ({ measures = ['events'], dimensions = [], bucket = '', minutes = 1440, where = {}, order = '', limit = 100, environmentUuids = [], customerUuid = '' } = {}) => {
    const qs = new URLSearchParams({ minutes: String(minutes), limit: String(limit) });
    measures.forEach((m) => qs.append('measures[]', m));
    dimensions.forEach((d) => qs.append('dimensions[]', d));
    if (bucket) qs.append('bucket', bucket);
    if (order) qs.append('order', order);
    Object.entries(where || {}).forEach(([dim, value]) => {
      const joined = (Array.isArray(value) ? value : [value]).filter((v) => v !== '' && v != null).map(String).join(',');
      if (joined) qs.append(`where[${dim}]`, joined);
    });
    if (environmentUuids.length) qs.append('environment_uuids', environmentUuids.join(','));
    else if (customerUuid) qs.append('customer_uuid', customerUuid);
    return apiService.get(`/api/identities/report?${qs.toString()}`, {}, 'running identities report', false, true);
  },
};

export default identityReportApi;
