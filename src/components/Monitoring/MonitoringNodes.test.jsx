import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isRoot: true }) }));
vi.mock('../../services/api/nodesApi', () => ({
  nodesApi: {
    getNodes: vi.fn(),
    getConnectedNodes: vi.fn(),
    deleteNode: vi.fn(),
  },
}));

import { nodesApi } from '../../services/api/nodesApi';
import MonitoringNodes from './MonitoringNodes.jsx';

// Deleting a node asks first, through the shared ConfirmDialog. The screen had
// no test for this: its only one covered the View Logs action, removed with
// the per-record log trail.
describe('MonitoringNodes delete', () => {
  const node = {
    uuid: 'n-20', name: 'node-192-168-137-20',
    ip_address_internal: '192.168.137.20', source: 'database', editable: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    nodesApi.getNodes.mockResolvedValue([node]);
    nodesApi.getConnectedNodes.mockResolvedValue([]);
    nodesApi.deleteNode.mockResolvedValue({});
  });

  const openConfirm = async () => {
    render(<MonitoringNodes />);
    fireEvent.click(await screen.findByTestId(`node-delete-${node.uuid}`));
    return screen.findByRole('dialog', { name: 'Delete node' });
  };

  it('asks before deleting, naming the node and what a delete means', async () => {
    const dialog = await openConfirm();
    expect(dialog).toHaveTextContent(node.name);
    expect(dialog).toHaveAccessibleDescription(/soft deleted/);
    expect(nodesApi.deleteNode).not.toHaveBeenCalled();
  });

  it('deletes on confirm and reloads the list', async () => {
    await openConfirm();
    fireEvent.click(screen.getByTestId('node-delete-confirm'));
    await waitFor(() => expect(nodesApi.deleteNode).toHaveBeenCalledWith(node.uuid));
    await waitFor(() => expect(nodesApi.getNodes).toHaveBeenCalledTimes(2));
  });

  it('deletes nothing on cancel', async () => {
    await openConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete node' })).toBeNull());
    expect(nodesApi.deleteNode).not.toHaveBeenCalled();
  });
});

// Each node shows ITS OWN report, as it answers node:<uuid>:node.health over
// NATS — not the mothership's Gatus board, which this screen used to draw
// (Admin SPA, Kong, PgCat...) under every node's name.
describe('MonitoringNodes health', () => {
  const node = { uuid: 'n-10', name: 'node-10', source: 'database', editable: true };
  const check = (key, name, group, success, errors = []) =>
    ({ key, name, group, results: [{ success, timestamp: '2026-10-12T00:00:00Z', errors }] });

  beforeEach(() => {
    vi.clearAllMocks();
    nodesApi.getNodes.mockResolvedValue([node]);
  });

  it('expands to the node\'s own checks and metrics from the NATS reply', async () => {
    nodesApi.getConnectedNodes.mockResolvedValue([{
      uuid: node.uuid, name: node.name, connected: true, ok: false,
      health: {
        node_uuid: node.uuid, ok: false,
        statuses: [
          check('sip_kamailio', 'Kamailio', 'sip', true),
          check('system_disk', 'Disk', 'system', false, ['86.9% >= 85.0%']),
        ],
        metrics: { calls: 3, registrations: 12 },
      },
    }]);
    render(<MonitoringNodes />);
    fireEvent.click(await screen.findByText(node.name));
    const panel = await screen.findByTestId('node-health-panel');
    expect(panel).toHaveTextContent('1/2 up');
    expect(screen.getByTestId('node-check-system_disk')).toHaveTextContent('86.9% >= 85.0%');
    expect(screen.getByTestId('node-metric-calls')).toHaveTextContent('3');
    expect(screen.getByTestId('node-metric-registrations')).toHaveTextContent('12');
    expect(panel).not.toHaveTextContent('Admin SPA');
  });

  it('says why when the node does not answer on NATS', async () => {
    nodesApi.getConnectedNodes.mockResolvedValue([
      { uuid: node.uuid, name: node.name, connected: false, reason: 'no responder' },
    ]);
    render(<MonitoringNodes />);
    fireEvent.click(await screen.findByText(node.name));
    expect(await screen.findByText(/Not answering on NATS — no responder/)).toBeInTheDocument();
  });
});
