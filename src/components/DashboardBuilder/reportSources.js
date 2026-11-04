// The two report sources the builder speaks, behind one query shape
// ({ measures, dimensions, bucket, minutes, where, view, order, limit }):
//   cdr       finished calls from InfluxDB `cdr` — the Monitoring page's call report
//   identity  the live stream's history from Postgres `identities` — the Dashboard
// A saved widget's `type` ('cdr' | 'identity') names its source.
import { monitoringApi } from '../../services/api/monitoringApi';
import { identityReportApi } from '../../services/api/identityReportApi';
import { FALLBACK_CATALOG, NEW_CDR_QUERY } from './cdrReport';

// The fixed part of the identities catalog; the API adds field:<key> dimensions
// and incr:<key> measures it discovers in the caller's scope.
export const IDENTITY_FALLBACK_CATALOG = {
  source: 'identity',
  dimensions: [
    ['type', 'Type'], ['event', 'Event'], ['environment', 'Environment'], ['identity', 'Identity'],
    ['hour', 'Hour of day'], ['weekday', 'Day of week'],
  ].map(([key, label]) => ({ key, label })),
  measures: [['events', 'Events', 'count'], ['identities', 'Identities', 'count']].map(([key, label, unit]) => ({ key, label, unit })),
  buckets: ['5m', '15m', '1h', '1d'],
};

export const NEW_IDENTITY_QUERY = {
  title: '', type: 'identity', measures: ['events', 'identities'], dimensions: ['type'],
  bucket: '', minutes: 1440, where: {}, view: 'table', order: '', limit: 50,
};

export const REPORT_SOURCES = {
  cdr: {
    type: 'cdr', fallback: { ...FALLBACK_CATALOG, source: 'cdr' }, newQuery: NEW_CDR_QUERY, sql: true,
    catalog: () => monitoringApi.getCdrCatalog(),
    run: (params) => monitoringApi.runCdrReport(params),
  },
  identity: {
    type: 'identity', fallback: IDENTITY_FALLBACK_CATALOG, newQuery: NEW_IDENTITY_QUERY, sql: false,
    catalog: (scope) => identityReportApi.getCatalog(scope),
    run: (params) => identityReportApi.runReport(params),
  },
};

/** The source a widget type or source name belongs to; anything else is the CDR report. */
export const reportSource = (type) => REPORT_SOURCES[type] || REPORT_SOURCES.cdr;
export const isReportType = (type) => type === 'cdr' || type === 'identity';
