import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SidebarCustomerSwitcher, { SidebarUserCustomer } from './SidebarCustomerSwitcher.jsx';

const selectCustomer = vi.fn();
let ctx;
let auth;
vi.mock('../../../context/CustomerEnvironmentContext', () => ({ useCustomerEnvironment: () => ctx }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth }));

const mtn = { uuid: 'c-1', name: 'MTN Business Unicom', enabled: true };
const yello = { uuid: 'c-2', name: 'yellobiz', enabled: false };

describe('the sidebar customer switcher', () => {
  let opened;
  const onOpen = (e) => opened.push(e.detail);

  beforeEach(() => {
    opened = [];
    selectCustomer.mockClear();
    window.addEventListener('openCustomerEdit', onOpen);
  });
  afterEach(() => window.removeEventListener('openCustomerEdit', onOpen));

  it('open sidebar: names the customer and the application in view; collapsed: the avatar only', () => {
    ctx = { customers: [mtn, yello], selectedCustomer: mtn, selectCustomer, isRoot: true,
            selectedEnvironments: [{ uuid: 'e-1', name: 'Sales' }] };
    auth = { accountCustomer: mtn };
    const { rerender } = render(<SidebarCustomerSwitcher expanded />);
    expect(screen.getByTestId('sidebar-customer-name')).toHaveTextContent('MTN Business Unicom');
    expect(screen.getByText('Sales')).toBeInTheDocument();

    rerender(<SidebarCustomerSwitcher />);
    expect(screen.queryByTestId('sidebar-customer-name')).not.toBeInTheDocument();
  });

  it('lists every customer an account can see and switches on one click', () => {
    ctx = { customers: [mtn, yello], selectedCustomer: mtn, selectCustomer, isRoot: true };
    auth = { accountCustomer: mtn };
    render(<SidebarCustomerSwitcher />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch customer' }));
    fireEvent.click(screen.getByText('yellobiz'));

    expect(selectCustomer).toHaveBeenCalledWith(yello);
  });

  it('offers add and duplicate only to an account that sees all customers', () => {
    ctx = { customers: [mtn, yello], selectedCustomer: mtn, selectCustomer, isRoot: true };
    auth = { accountCustomer: mtn };
    render(<SidebarCustomerSwitcher />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch customer' }));
    fireEvent.click(screen.getByText('Add customer'));

    expect(opened).toEqual([{ mode: 'create', customer: null }]);
  });

  it('opens the wizard from the customer menu', () => {
    const wizard = vi.fn();
    window.addEventListener('openWizardModal', wizard);
    ctx = { customers: [mtn, yello], selectedCustomer: mtn, selectCustomer, isRoot: true };
    auth = { accountCustomer: mtn };
    render(<SidebarCustomerSwitcher />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch customer' }));
    fireEvent.click(screen.getByText('Wizard'));

    expect(wizard).toHaveBeenCalledTimes(1);
    window.removeEventListener('openWizardModal', wizard);
  });

  it('opens the menu for an account with one customer, with manage, wizard and settings', () => {
    const settings = vi.fn();
    window.addEventListener('openSettingsTool', settings);
    ctx = { customers: [mtn], selectedCustomer: mtn, selectCustomer, isRoot: false };
    auth = { accountCustomer: mtn };
    render(<SidebarCustomerSwitcher />);

    fireEvent.click(screen.getByRole('button', { name: 'Customer menu' }));
    expect(screen.queryByText('Add customer')).toBeNull();
    expect(screen.getByText('Wizard')).toBeTruthy();

    fireEvent.click(screen.getByText('Manage customer'));
    expect(opened).toEqual([{ mode: 'edit', customer: mtn }]);

    fireEvent.click(screen.getByRole('button', { name: 'Customer menu' }));
    fireEvent.click(screen.getByText('Settings'));
    expect(settings).toHaveBeenCalledTimes(1);
    expect(selectCustomer).not.toHaveBeenCalled();
    window.removeEventListener('openSettingsTool', settings);
  });
});

describe('SidebarUserCustomer: a user sees its customer, read-only', () => {
  const user = { customer: { uuid: 'c-1', name: 'SOMOTEX GHANA LTD' }, environment: { name: 'MTN Business Unicom' } };

  it('open: names the customer and, under it, the application', () => {
    render(<SidebarUserCustomer user={user} expanded />);
    expect(screen.getByTestId('sidebar-customer-name')).toHaveTextContent('SOMOTEX GHANA LTD');
    expect(screen.getByText('MTN Business Unicom')).toBeInTheDocument();
  });

  it('is not a button: nothing to switch to or manage', () => {
    render(<SidebarUserCustomer user={user} expanded />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('a session from before the payload named the customer shows the application', () => {
    render(<SidebarUserCustomer user={{ environment: { name: 'MTN Business Unicom' } }} expanded />);
    expect(screen.getByTestId('sidebar-customer-name')).toHaveTextContent('MTN Business Unicom');
  });
});
