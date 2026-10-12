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
