import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { buildRouteColumns } from './routeColumns.jsx';
import ResponsiveTable from '../shared/ResponsiveTable/ResponsiveTable';
import { pretendPhoneScreen } from '../../test/phoneScreen';
import { widthNeeded } from '../../test/tableWidth';
import { formatDate } from '../../utils/dateUtils';

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
const english = i18n.getFixedT('en', 'routes');
const show = ({ isPhone = false, portalMode = false, t = english } = {}) => render(
  <ResponsiveTable
    columns={buildRouteColumns({ t, portalMode, isPhone, loading: false, canWriteRoute: () => true, actions })}
    rows={[route]}
    getRowId={(row) => row.uuid}
  />,
);

let backToDesktop = () => {};
afterEach(async () => { backToDesktop(); backToDesktop = () => {}; await i18n.changeLanguage('en'); });

describe('Routes columns', () => {
  it('keep the headers the table always had', () => {
    const labels = buildRouteColumns({ t: english, portalMode: false, isPhone: false, canWriteRoute: () => true, actions })
      .map((column) => column.label);
    expect(labels).toEqual(
      ['Created At', 'Updated At', 'Enabled', 'Name', 'Application', 'Type', 'Number', 'Bridge', 'Provider', 'Tags', 'Actions'],
    );
  });

  it('have no Application column for a portal user', () => {
    const labels = buildRouteColumns({ t: english, portalMode: true, isPhone: false, canWriteRoute: () => true, actions })
      .map((column) => column.label);
    expect(labels).not.toContain('Application');
  });

  it('fit every column, Provider and Tags included, in a 1280px desktop', () => {
    const columns = buildRouteColumns({ t: english, portalMode: false, isPhone: false, loading: false, canWriteRoute: () => true, actions });
    show();
    expect(screen.getAllByRole('columnheader')).toHaveLength(columns.length);
    expect(screen.getByRole('columnheader', { name: 'Provider' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Tags' })).toBeInTheDocument();
    expect(widthNeeded(screen.getByRole('table'), columns)).toBeLessThanOrEqual(1280);
  });

  it('fix a narrow width only on the short columns and let the text ones flex', () => {
    const columns = buildRouteColumns({ t: english, portalMode: false, isPhone: false, loading: false, canWriteRoute: () => true, actions });
    expect(columns.filter((column) => column.width).map((column) => column.id)).toEqual(['enabled', 'type', 'number']);
  });

  it('show the dates on one line in the small secondary type, and small chips', () => {
    show();
    const created = screen.getByText(formatDate(route.created_at));
    expect(created.tagName).toBe('SPAN');
    expect(screen.getByText('Yes').closest('.MuiChip-root')).toHaveClass('MuiChip-sizeSmall');
    expect(screen.getByText('Incoming number').closest('.MuiChip-root')).toHaveClass('MuiChip-sizeSmall');
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
    expect(screen.getByText('Incoming number')).toBeInTheDocument();
    expect(screen.getByText('Calls go to')).toBeInTheDocument();
    expect(screen.getByText('Main menu')).toBeInTheDocument();
    expect(screen.queryByTestId('edit-did-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('routing-did-button')).not.toBeInTheDocument();
    expect(screen.queryByText('Created At')).not.toBeInTheDocument();
  });
});

describe('Routes columns in Hebrew', () => {
  it('have Hebrew headers', async () => {
    await i18n.changeLanguage('he');
    const labels = buildRouteColumns({ t: i18n.getFixedT('he', 'routes'), portalMode: false, isPhone: false, canWriteRoute: () => true, actions })
      .map((column) => column.label);
    expect(labels).toEqual(['נוצר', 'עודכן', 'פעיל', 'שם', 'אפליקציה', 'סוג', 'מספר', 'יעד', 'ספק', 'תגיות', 'פעולות']);
  });

  it('show the type by its Hebrew name and the number left to right', async () => {
    await i18n.changeLanguage('he');
    backToDesktop = pretendPhoneScreen();
    show({ isPhone: true, t: i18n.getFixedT('he', 'routes') });
    expect(screen.getByText('מספר נכנס')).toBeInTheDocument();
    expect(screen.getByText('השיחות עוברות אל')).toBeInTheDocument();
    expect(screen.getByText('+97235551234').tagName).toBe('BDI');
  });
});
