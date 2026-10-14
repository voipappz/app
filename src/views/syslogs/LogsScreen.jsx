import SystemLogs from './SystemLogs.jsx';

/**
 * Logs — the InfluxDB-backed app log viewer (/api/logs).
 *
 * This used to carry seven tabs, one per InfluxDB measurement: containers,
 * api, exceptions, sip, node and a custom query browser. Five of them named
 * measurements that nothing ever writes, so they rendered empty and every poll
 * raised a NotFound that surfaced on the Monitoring screen as
 * "unknown measurement 'exception_logs'" / "'live__call'" and tripped the
 * "service temporarily unavailable due to multiple errors" banner:
 *
 *   http_request    — no such series. API logs are Pliny canonical lines that
 *                     land in `syslog` under source=http (endpoints/monitoring.rb
 *                     says so explicitly and filters that way).
 *   exception_logs  — the written measurement is `error_exception`.
 *   live_call       — referenced only here; nothing emits it.
 *   sip_capture     — SIP capture is queried as the `hep` series.
 *
 * Everything real is one `syslog` measurement discriminated by tags (source,
 * app, node, severity), which the viewer below already filters on — so the tabs
 * were splitting one stream into six views, five of which could not work.
 * Ad-hoc Influx querying still lives on Monitoring → Metric explorer.
 */
// Props pass through so a link can open the screen on one call (?session=).
const LogsScreen = (props) => <SystemLogs {...props} />;

export default LogsScreen;
