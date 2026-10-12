import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRouteColumns } from './routeColumns.jsx';
import ResponsiveTable from '../shared/ResponsiveTable/ResponsiveTable';
import { pretendPhoneScreen } from '../../test/phoneScreen';

// The events button reads the signed-in session's permissions; not under test here.
vi.mock('../shared/RowEventsButton/RowEventsButton.jsx', () => ({ default: () => null }));

const route = {
  uuid: 'r1', number: '+97235551234', name: 'Main line', type: 'dst', enabled: true,
  bridge_type: 'ivr', bridge: { uuid: 'i1', name: 'Main menu' },
  provider: { uuid: 'p1', name: 'Carrier' },
  environment: { uuid: 'e1', name: 'Sales' },
  created_at: '2026-01-01T10:00:00Z',
};
const actions = {
  onCall: vi.fn(), onEditApplication: vi.fn(), onEditBridge: vi.fn(), onOpenProvider: vi.fn(),
  onEdit: vi.fn(), onOpenFlow: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn(),
};
const show = ({ isPhone = false, portalMode = false } = {}) => render(
  <ResponsiveTable
    columns={buildRouteColumns({ portalMode, isPhone, loading: false, canWriteRoute: () => true, actions })}
    rows={[route]}
    getRowId={(row) => row.uuid}
  />,
);

let backToDesktop = () => {};
afterEach(() => { backToDesktop(); backToDesktop = () => {}; });

describe('Routes columns', () => {
  it('keep the headers the table always had', () => {
    const labels = buildRouteColumns({ portalMode: false, isPhone: false, canWriteRoute: () => true, actions })
      .map((column) => column.label);
    expect(labels).toEqual(
      ['Created At', 'Updated At', 'Enabled', 'Name', 'Application', 'Type', 'Number', 'Bridge', 'Provider', 'Tags', 'Actions'],
    );
  });

  it('have no Application column for a portal user', () => {
    const labels = buildRouteColumns({ portalMode: true, isPhone: false, canWriteRoute: () => true, actions })
      .map((column) => column.label);
    expect(labels).not.toContain('Application');
  });

  it('show the row buttons on a desktop', () => {
    show();
    expect(screen.getByTestId('edit-did-button')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Call +97235551234' })).toBeInTheDocument();
  });

  it('show a route as a card on a phone: number, name, type and where calls go, no buttons', () => {
    backToDesktop = pretendPhoneScreen();
    show({ isPhone: true });
    expect(screen.getByTestId('mobile-record-card')).toBeInTheDocument();
    expect(screen.getByText('+97235551234').tagName).toBe('BDI');
    expect(screen.getByText('Main line')).toBeInTheDocument();
    expect(screen.getByText('DST')).toBeInTheDocument();
    expect(screen.getByText('Calls go to')).toBeInTheDocument();
    expect(screen.getByText('Main menu')).toBeInTheDocument();
    expect(screen.queryByTestId('edit-did-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('routing-did-button')).not.toBeInTheDocument();
    expect(screen.queryByText('Created At')).not.toBeInTheDocument();
  });
});
