import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SidebarCustomerSwitcher from './SidebarCustomerSwitcher.jsx';

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

  it('opens its own customer directly when there is nothing to switch to', () => {
    ctx = { customers: [mtn], selectedCustomer: mtn, selectCustomer, isRoot: false };
    auth = { accountCustomer: mtn };
    render(<SidebarCustomerSwitcher />);

    fireEvent.click(screen.getByRole('button', { name: 'Manage customer' }));

    expect(opened).toEqual([{ mode: 'edit', customer: mtn }]);
    expect(screen.queryByText('Add customer')).toBeNull();
    expect(selectCustomer).not.toHaveBeenCalled();
  });
});
