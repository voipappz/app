// Pins the voipappz-api contract this service is written against — the shapes
// come from lib/endpoints/users.rb and lib/models/agent.rb, so a drift on
// either side should fail here rather than in production.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/clients/api', () => ({
  apiSend: vi.fn().mockResolvedValue({ uuid: 'u-1' }),
  apiList: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  apiGet: vi.fn().mockResolvedValue({}),
}));

import { apiSend, apiList, apiGet } from '../lib/clients/api';
import { setAgentStatus, listBreakReasons, listAgentStatuses } from './agentStatusApi';

describe('agentStatusApi', () => {
  beforeEach(() => { apiSend.mockClear(); apiList.mockClear(); apiGet.mockClear(); });

  it('PATCHes the user with the action/type the API expects', async () => {
    await setAgentStatus('u-9019', 'available');
    const [method, path] = apiSend.mock.calls[0];
    expect(method).toBe('PATCH');
    expect(path).toContain('/api/users/u-9019?');
    expect(path).toContain('action=status');
    expect(path).toContain('type=available');
  });

  it('sends the break reason as `name`', async () => {
    await setAgentStatus('u-9019', 'on_break', 'Lunch');
    expect(apiSend.mock.calls[0][1]).toContain('name=Lunch');
  });

  it('omits `name` when there is none, letting the server humanise the key', async () => {
    await setAgentStatus('u-9019', 'logged_out');
    expect(apiSend.mock.calls[0][1]).not.toContain('name=');
  });

  // Agent::STATUSES_MAPPINGS.keys — anything else earns a 406, so it is caught
  // before the round trip.
  it('refuses a status the API would reject, without calling it', async () => {
    await expect(setAgentStatus('u-9019', 'on_lunch')).rejects.toThrow(/unknown status/);
    expect(apiSend).not.toHaveBeenCalled();
  });

  it('requires a user uuid', async () => {
    await expect(setAgentStatus('', 'available')).rejects.toThrow(/uuid/);
    expect(apiSend).not.toHaveBeenCalled();
  });

  // The vocabulary belongs to the platform (Agent::STATUSES_MAPPINGS, served by
  // GET /statuses/agent_statuses). Copying it into the frontend would be a
  // second source of truth that rots the day a status is added.
  it('reads the status vocabulary from the API, not a local copy', async () => {
    apiGet.mockResolvedValueOnce({
      logged_out: 'Logged Out',
      available: 'Available',
      available_on_demand: 'Available (On Demand)',
      on_break: 'On Break',
    });
    const statuses = await listAgentStatuses();
    expect(apiGet).toHaveBeenCalledWith('/api/statuses/agent_statuses');
    expect(statuses).toContainEqual({ type: 'on_break', label: 'On Break' });
    expect(statuses.map((s) => s.type)).toContain('available_on_demand');
  });

  it('survives a malformed vocabulary rather than breaking the picker', async () => {
    apiGet.mockResolvedValueOnce(null);
    expect(await listAgentStatuses()).toEqual([]);
  });

  it('reads break reasons from the tenant, dropping unusable rows', async () => {
    apiList.mockResolvedValueOnce({
      rows: [{ name: 'Lunch', uuid: 's-1' }, { uuid: 's-2' }, { name: '', uuid: 's-3' }],
      total: 3,
    });
    const reasons = await listBreakReasons();
    expect(apiList).toHaveBeenCalledWith('/api/statuses?type=on_break');
    expect(reasons).toEqual([{ name: 'Lunch', uuid: 's-1' }]);
  });
});
