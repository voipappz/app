import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoutingChain from './RoutingChain.jsx';
import { bridgeApi } from '../../../services/api/bridgeApi';
import { queuesApi } from '../../../services/api/queuesApi';
import { getCallCondition } from '../../../services/api/callConditionsApi';
import { ivrApi } from '../../../services/api/ivrApi';

vi.mock('../../../services/api/bridgeApi', () => ({ bridgeApi: { getBridgeResource: vi.fn() } }));
vi.mock('../../../services/api/queuesApi', () => ({ queuesApi: { getQueue: vi.fn() } }));
vi.mock('../../../services/api/callConditionsApi', () => ({ getCallCondition: vi.fn() }));
vi.mock('../../../services/api/ivrApi', () => ({ ivrApi: { getIVR: vi.fn() } }));

const script = { uuid: 'vml-1', name: 'route_script', type: 'eval', data: 'session:answer()' };

describe('editing VML from the route preview', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    bridgeApi.getBridgeResource.mockResolvedValue(script);
  });

  it.each([['direct', script], ['wrapped', { data: script }]])(
    'passes the full VML to the editor for a %s response', async (_label, response) => {
      bridgeApi.getBridgeResource.mockResolvedValue(response);
      const onEditBridge = vi.fn();
      render(<RoutingChain bridgeType="vml" bridgeUuid={script.uuid} environmentUuid="env-1" onEditBridge={onEditBridge} />);

      expect(await screen.findByText(script.name)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(onEditBridge).toHaveBeenCalledWith('vml', script);
    }
  );

  it.each(['queue', 'call_condition', 'ivr'])(
    'keeps the VML UUID when editing a %s destination', async (bridgeType) => {
      queuesApi.getQueue.mockResolvedValue({ uuid: 'parent', name: 'Support', max_wait_time_bridge_type: 'vml', max_wait_time_bridge_uuid: script.uuid });
      getCallCondition.mockResolvedValue({ uuid: 'parent', name: 'Hours', fallback_bridge_type: 'vml', fallback_bridge_uuid: script.uuid });
      ivrApi.getIVR.mockResolvedValue({ uuid: 'parent', name: 'Menu', timeout_bridge_type: 'vml', timeout_bridge_uuid: script.uuid });
      const onEditBridge = vi.fn();
      render(<RoutingChain bridgeType={bridgeType} bridgeUuid="parent" environmentUuid="env-1" onEditBridge={onEditBridge} />);

      fireEvent.click(await screen.findByRole('button', { name: 'Edit VML' }));
      expect(onEditBridge).toHaveBeenCalledWith('vml', script);
    }
  );
});

describe('listening from the route preview', () => {
  beforeEach(() => vi.resetAllMocks());

  it('offers the announcement to play', async () => {
    bridgeApi.getBridgeResource.mockResolvedValue({ uuid: 'ann-1', name: 'Welcome', path: 'https://files.example/ann-1.wav' });
    render(<RoutingChain bridgeType="announcement" bridgeUuid="ann-1" environmentUuid="env-1" />);

    expect(await screen.findByText('Welcome')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play announcement' })).toBeInTheDocument();
  });

  it("offers an IVR's greeting to play", async () => {
    ivrApi.getIVR.mockResolvedValue({ uuid: 'ivr-1', name: 'Main menu', announcement_uuid: 'ann-1' });
    render(<RoutingChain bridgeType="ivr" bridgeUuid="ivr-1" environmentUuid="env-1" />);

    expect(await screen.findByText('Greeting')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play announcement' })).toBeInTheDocument();
  });
});

describe('a call condition in the route preview', () => {
  beforeEach(() => vi.resetAllMocks());

  it('reads as business hours and rules, not "rule 1, rule 2"', async () => {
    getCallCondition.mockResolvedValue({
      uuid: 'cc-1', name: 'office_hours', fallback_bridge_type: 'vml', fallback_bridge_uuid: 'v-1',
      resources: [
        { name: 'rule_1', bridge_type: 'extension', bridge_uuid: 'e-1', segments: [{ uuid: 's1', field: 'call.caller', operator: 'PREFIX', val: ['+97250'] }] },
        { name: 'open_1', bridge_type: 'queue', bridge_uuid: 'q-1', segments: [
          { uuid: 's2', field: 'time.weekday', operator: 'IN', val: ['0', '1', '2', '3', '4'] },
          { uuid: 's3', field: 'time.hour', operator: 'BETWEEN', val: ['9', '16'] },
        ] },
      ],
    });
    bridgeApi.getBridgeResource.mockImplementation(async (type) => ({ extension: { name: 'Front desk' }, queue: { name: 'Support' }, vml: { name: 'Voicemail' } }[type]));
    const onEditBridge = vi.fn();
    render(<RoutingChain bridgeType="call_condition" bridgeUuid="cc-1" environmentUuid="env-1" onEditBridge={onEditBridge} />);

    expect(await screen.findByTestId('week-summary')).toHaveTextContent('Sun–Thu 09:00–17:00 · Fri–Sat Closed');
    expect(screen.getByText(/starts with/)).toHaveTextContent("If the caller's number starts with ⁦+97250⁩");
    expect(screen.getByText('Queue: Support')).toBeInTheDocument();
    expect(screen.queryByText(/rule_1|Rule 1/)).toBeNull();

    // The pencil beside a destination edits that destination.
    fireEvent.click(screen.getByRole('button', { name: 'Edit Device: Front desk' }));
    expect(onEditBridge).toHaveBeenCalledWith('extension', { uuid: 'e-1' });
  });
});
