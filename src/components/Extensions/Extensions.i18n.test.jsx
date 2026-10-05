import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../../theme/theme';
import i18n from '../../i18n';

/**
 * Extensions, the first screen converted to ResponsiveTable + t().
 *
 * This exists because the gate that was supposed to cover this step cannot
 * run here: tests/extensions.spec.ts needs the Playwright image, and
 * mcr.microsoft.com resolves to IPv6 only on this host while Docker 18.09
 * pulls over IPv4. Rather than convert the screen with no safety net, this
 * asserts the things the conversion could plausibly break — headers, row
 * content, selection, the phone card, and that Hebrew does not leave raw keys
 * on screen.
 *
 * Deliberately NOT a port of the e2e spec: that one drives a real API. This
 * one mocks the data hook and tests the rendering contract.
 */

const mocks = vi.hoisted(() => ({
  rows: [],
  loading: false,
  registered: new Set(),
  viewport: 1280,
}));

const hookValue = () => ({
  extensions: mocks.rows,
  loading: mocks.loading,
  dialogLoading: false,
  selectedExtension: null,
  dialogOpen: false,
  deleteDialogOpen: false,
  extensionToDelete: null,
  page: 0,
  rowsPerPage: 25,
  totalCount: mocks.rows.length,
  sortBy: 'username',
  sortOrder: 'asc',
  environments: [],
  handleOpenDialog: vi.fn(),
  handleCloseDialog: vi.fn(),
  handleSaveExtension: vi.fn(),
  handleOpenDeleteDialog: vi.fn(),
  handleCloseDeleteDialog: vi.fn(),
  handleDeleteExtension: vi.fn(),
  handlePageChange: vi.fn(),
  handleRowsPerPageChange: vi.fn(),
  handleSortChange: vi.fn(),
  handleFiltersChange: vi.fn(),
  handleResetFilters: vi.fn(),
  fetchExtensions: vi.fn(),
  registeredUsers: mocks.registered,
});

vi.mock('./Extensions', () => ({ useExtensions: () => hookValue() }));
vi.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}));
vi.mock('../../context/GlobalSearchContext', () => ({
  useGlobalSearch: () => ({ registerScreen: vi.fn(), unregisterScreen: vi.fn() }),
}));
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true }),
}));
vi.mock('../Live/useLiveRegistrations', () => ({
  useLiveRegistrations: () => ({ rows: [], connected: false }),
}));
vi.mock('../../hooks/useCentralizedSearch', () => ({
  default: () => ({ searchParams: {}, handleSearch: vi.fn(), handleClear: vi.fn() }),
}));
vi.mock('../../context/PhoneContext', () => ({
  usePhoneContext: () => ({ openPhone: vi.fn(), setSipTarget: vi.fn() }),
}));
// The search bar reaches for AuthContext internally. Stubbed rather than
// wrapped in an AuthProvider: this test is about the table, and a real
// CentralizedSearch would drag in the auth session, the environment context
// and the saved-filter store to prove nothing about a column list.
vi.mock('../shared/CentralizedSearch/CentralizedSearch.jsx', () => ({
  default: () => null,
}));
vi.mock('../../hooks/useEnvironmentEdit', () => ({
  default: () => ({
    envDialogOpen: false, envDialogEnvironment: null, envDialogLoading: false,
    handleEnvEdit: vi.fn(), handleEnvSave: vi.fn(), handleEnvClose: vi.fn(),
  }),
}));

const { default: Extensions } = await import('./Extensions.jsx');

const setViewport = (width) => {
  window.matchMedia = vi.fn().mockImplementation((query) => {
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const matches = (!max || width <= parseFloat(max[1])) && (!min || width >= parseFloat(min[1]));
    return {
      matches, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    };
  });
};

const mount = () => render(
  <MemoryRouter>
    <ThemeProvider theme={createAppTheme(i18n.language === 'he' ? 'rtl' : 'ltr')}>
      <Extensions />
    </ThemeProvider>
  </MemoryRouter>
);

const ROWS = [
  {
    uuid: 'e1', username: '101', name: 'Reception', enabled: true, switch: true,
    environment: { uuid: 'env1', name: 'Acme' },
    created_at: '2026-07-20T10:00:00Z', updated_at: '2026-07-21T10:00:00Z',
    registration: { user_agent: 'Zoiper', network_ip: '10.0.0.9', network_port: '5060' },
  },
  {
    uuid: 'e2', username: '102', name: 'Sales', enabled: false, switch: false,
    environment: { uuid: 'env1', name: 'Acme' },
    created_at: '2026-07-20T10:00:00Z', updated_at: '2026-07-21T10:00:00Z',
  },
];

describe('Extensions — converted screen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.rows = ROWS;
    mocks.loading = false;
    mocks.registered = new Set();
    setViewport(1280);
  });

  afterEach(async () => { await i18n.changeLanguage('en'); });

  it('renders a table with the expected headers', () => {
    mount();
    const table = screen.getByTestId('extensions-table');
    expect(within(table).getByRole('columnheader', { name: 'Device' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Application' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Tags' })).toBeInTheDocument();
  });

  it('renders a row per device', () => {
    mount();
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('Reception')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
  });

  it('wraps the SIP username in <bdi>', () => {
    // An extension number inside Hebrew text loses its punctuation to the
    // surrounding RTL run without this, and nothing about English shows it.
    const { container } = mount();
    const bdis = [...container.querySelectorAll('bdi')].map((el) => el.textContent);
    expect(bdis).toContain('101');
  });

  it('keeps the action buttons, with their test ids', () => {
    // The e2e spec clicks these; they must survive the conversion even though
    // that spec cannot run here.
    mount();
    expect(screen.getAllByTestId('edit-extension-button').length).toBe(2);
    expect(screen.getAllByTestId('delete-extension-button').length).toBe(2);
    expect(screen.getAllByTestId('webrtc-extension-button').length).toBe(2);
    expect(screen.getAllByTestId('qrcode-extension-button').length).toBe(2);
  });

  it('shows skeleton rows while loading, not a bare spinner', () => {
    mocks.rows = [];
    mocks.loading = true;
    const { container } = mount();
    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
  });

  it('says so when there are no devices', () => {
    mocks.rows = [];
    mount();
    expect(screen.getByText('No devices found')).toBeInTheDocument();
  });

  it('collapses to cards on a phone, keeping the device number', () => {
    setViewport(375);
    mount();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByTestId('responsive-table-cards')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();   // primary
    expect(screen.getByText('Reception')).toBeInTheDocument(); // secondary
  });

  it('renders Hebrew headers with no raw keys left on screen', async () => {
    await i18n.changeLanguage('he');
    const { container } = mount();

    expect(screen.getByRole('columnheader', { name: 'שלוחה' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'תגיות' })).toBeInTheDocument();

    // The failure mode this guards: a missing key rendering as `ns:key`.
    expect(container.textContent).not.toMatch(/\b(common|nav|extensions|settings):[a-zA-Z.]+/);
  });
});
