import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildDashboardEventsQuery, COUNTER_METRICS, createDashboard, createWidget,
  deleteWidget, getDashboardEvents, getDashboards, getWidgets, normalizeDashboards,
  normalizeWidgets,
} from './dashboardsApi';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(payload, ok = true, status = 200) {
  const mock = vi.fn().mockResolvedValue({ ok, status, text: async () => JSON.stringify(payload) });
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('normalizeWidgets', () => {
  it('unwraps the { widgets: [...] } envelope and drops rows without a uuid', () => {
    expect(normalizeWidgets({ widgets: [{ uuid: 'w1' }, { title: 'no id' }, null] })).toEqual([{ uuid: 'w1' }]);
  });

  it('tolerates a bare array and garbage payloads', () => {
    expect(normalizeWidgets([{ uuid: 'w1' }])).toEqual([{ uuid: 'w1' }]);
    expect(normalizeWidgets(null)).toEqual([]);
    expect(normalizeWidgets('nope')).toEqual([]);
  });
});

describe('local widget CRUD', () => {
  it('reads definitions from the local /dashboard/widgets endpoint', async () => {
    const mock = stubFetch({ widgets: [{ uuid: 'w1', metric: 'answered' }] });
    const widgets = await getWidgets();
    expect(widgets).toEqual([{ uuid: 'w1', metric: 'answered' }]);
    expect(mock.mock.calls[0][0]).toMatch(/\/dashboard\/widgets\?dashboard_uuid=default$/);
    expect(mock.mock.calls[0][1].method).toBe('GET');
  });

  it('creates with a JSON body and deletes by uuid', async () => {
    const mock = stubFetch({ uuid: 'w2' });
    await createWidget({ title: 'Answered', type: 'counter', metric: 'answered' }, 'ops');
    expect(mock.mock.calls[0][1].method).toBe('POST');
    expect(mock.mock.calls[0][0]).toMatch(/dashboard_uuid=ops/);
    expect(JSON.parse(mock.mock.calls[0][1].body).metric).toBe('answered');

    await deleteWidget('w2');
    expect(mock.mock.calls[1][0]).toMatch(/\/dashboard\/widgets\/w2$/);
    expect(mock.mock.calls[1][1].method).toBe('DELETE');
  });

  it('throws on a non-2xx answer', async () => {
    stubFetch({ error: 'nope' }, false, 503);
    await expect(getWidgets()).rejects.toThrow('503');
  });
});

describe('local dashboards and DuckDB event views', () => {
  it('lists and creates dashboard definitions', async () => {
    const mock = stubFetch({ dashboards: [{ uuid: 'default', name: 'Main dashboard' }] });
    expect(await getDashboards()).toEqual([{ uuid: 'default', name: 'Main dashboard' }]);
    expect(mock.mock.calls[0][0]).toMatch(/\/dashboard\/dashboards$/);

    await createDashboard('Support');
    expect(mock.mock.calls[1][1].method).toBe('POST');
    expect(JSON.parse(mock.mock.calls[1][1].body)).toEqual({ name: 'Support' });
  });

  it('normalizes dashboard envelopes and rejects nameless rows', () => {
    expect(normalizeDashboards({ dashboards: [{ uuid: 'd1', name: 'One' }, { uuid: 'd2' }] }))
      .toEqual([{ uuid: 'd1', name: 'One' }]);
  });

  it('pages filtered normalized events through the dashboard endpoint', async () => {
    const mock = stubFetch({ events: [{ event_id: 'e1' }], total: 9, limit: 20, offset: 4 });
    expect(await getDashboardEvents({ limit: 20, offset: 4, eventType: 'call.cdr', action: 'write' }))
      .toMatchObject({ events: [{ event_id: 'e1' }], total: 9, limit: 20, offset: 4 });
    expect(mock.mock.calls[0][0]).toContain('/dashboard/events?');
    expect(mock.mock.calls[0][0]).toContain('event_type=call.cdr');
    expect(mock.mock.calls[0][0]).toContain('action=write');
  });

  it('omits blank event filters', () => {
    expect(buildDashboardEventsQuery({ q: ' ', eventType: '', limit: 5 }))
      .toBe('limit=5&offset=0');
  });
});

describe('COUNTER_METRICS', () => {
  it('matches the DashboardSnapshot.stats keys', () => {
    expect(COUNTER_METRICS).toEqual(['total', 'answered', 'failed', 'inbound', 'outbound', 'avg_duration_sec']);
  });
});
