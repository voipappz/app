import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RouteDetails from './RouteDetails.jsx';

vi.mock('../../shared/RowEventsButton/RowEventsButton.jsx', () => ({ default: () => null }));
// The real preview fetches the bridge; here it only shows what it was given.
vi.mock('../DIDDialog/RoutingChain.jsx', () => ({
  default: ({ bridgeType, bridgeUuid, onEditBridge }) => (
    <div data-testid="routing-chain">
      {bridgeType}:{bridgeUuid}
      {onEditBridge && <button onClick={() => onEditBridge(bridgeType, { uuid: bridgeUuid })}>Edit bridge</button>}
    </div>
  ),
}));

const route = {
  uuid: 'r1', number: '+97235551234', name: 'Main line', type: 'dst', enabled: true,
  bridge_type: 'ivr', bridge: { uuid: 'i1', name: 'Main menu' },
  provider: { uuid: 'p1', name: 'Carrier' },
  environment: { uuid: 'e1', name: 'Sales' }, environment_uuid: 'e1',
  notes: 'Front desk line',
};
const handlers = () => ({
  onClose: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn(),
  onEditBridge: vi.fn(), onOpenProvider: vi.fn(), onCall: vi.fn(),
});
const show = (props = {}) => {
  const on = handlers();
  render(<RouteDetails open did={route} canWrite {...on} {...props} />);
  return on;
};

describe('Route details', () => {
  it('shows who the route is and where its calls go', () => {
    show();
    expect(screen.getByText('+97235551234').tagName).toBe('BDI');
    expect(screen.getByText('Main line')).toBeInTheDocument();
    expect(screen.getByText('Incoming number')).toBeInTheDocument();
    expect(screen.getByText('Calls go to')).toBeInTheDocument();
    expect(screen.getByTestId('routing-chain')).toHaveTextContent('ivr:i1');
    expect(screen.getByText('Carrier')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Front desk line')).toBeInTheDocument();
  });

  it('edits, duplicates and deletes the route', () => {
    const on = show();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(on.onEdit).toHaveBeenCalledWith(route);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Route' }));
    expect(on.onDuplicate).toHaveBeenCalledWith(route);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(on.onDelete).toHaveBeenCalledWith(route);
  });

  it('opens a bridge on the path in its editor', () => {
    const on = show();
    fireEvent.click(screen.getByRole('button', { name: 'Edit bridge' }));
    expect(on.onEditBridge).toHaveBeenCalledWith('ivr', { uuid: 'i1' });
  });

  it('goes back, calls the number and opens the provider', () => {
    const on = show();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(on.onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Call +97235551234' }));
    expect(on.onCall).toHaveBeenCalledWith('+97235551234');
    fireEvent.click(screen.getByTestId('route-details-provider'));
    expect(on.onOpenProvider).toHaveBeenCalledWith(route.provider);
  });

  it('is read-only without write access', () => {
    show({ canWrite: false });
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit bridge' })).not.toBeInTheDocument();
    expect(screen.getByTestId('routing-chain')).toBeInTheDocument();
  });

  it('has no application or provider link for a portal user', () => {
    const on = show({ portalMode: true });
    expect(screen.queryByText('Application')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('route-details-provider'));
    expect(on.onOpenProvider).not.toHaveBeenCalled();
  });

  it('says so when the route no longer exists', () => {
    show({ did: null, missing: true });
    expect(screen.getByText('This route no longer exists.')).toBeInTheDocument();
  });
});
