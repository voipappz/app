import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CentralizedSearch, { TOPBAR_SEARCH_SLOT_ID } from './CentralizedSearch.jsx';

vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ access: 'token', isAuthenticated: true }) }));
vi.mock('../../../context/UserAuthContext', () => ({ useUserAuth: () => ({ token: null }) }));
vi.mock('../EnhancedDateRangePicker/EnhancedDateRangePicker.jsx', () => ({ default: () => <div data-testid="date-picker" /> }));

const today = [new Date(), new Date()];
const props = (over = {}) => ({
  segments: [{ name: 'call.caller', label: 'Caller', type: 'string' }],
  currentSearchParams: {},
  onFilterChange: vi.fn(),
  onQuickSearch: vi.fn(),
  onClearAllFilters: vi.fn(),
  dateRange: today,
  onDateRangeChange: vi.fn(),
  onRefresh: vi.fn(),
  quickSearchText: '97250',
  onQuickSearchChange: vi.fn(),
  placeholder: 'Search calls',
  textParam: 'search[inline]',
  ...over,
});

describe('CentralizedSearch docked in the top bar', () => {
  let slot;
  beforeEach(() => {
    slot = document.createElement('div');
    slot.id = TOPBAR_SEARCH_SLOT_ID;
    document.body.appendChild(slot);
  });
  afterEach(() => slot.remove());

  it('puts the search field in the top bar slot and keeps the date range out of sight', () => {
    render(<CentralizedSearch {...props()} />);
    expect(slot.contains(screen.getByPlaceholderText('Search calls'))).toBe(true);
    expect(screen.queryByTestId('date-picker')).toBeNull();
    expect(screen.getByRole('button', { name: 'Date range: Today' })).toBeTruthy();
  });

  it('opens the date range and filters as a popup when the field is focused', () => {
    render(<CentralizedSearch {...props()} />);
    fireEvent.focus(screen.getByPlaceholderText('Search calls'));
    const popup = screen.getByTestId('topbar-search-popup');
    expect(popup.contains(screen.getByTestId('date-picker'))).toBe(true);
    expect(popup.textContent).toContain('Caller');
  });

  it("searches on Enter with the screen's text param and closes the popup", () => {
    const p = props();
    render(<CentralizedSearch {...p} />);
    const input = screen.getByPlaceholderText('Search calls');
    fireEvent.focus(input);
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    expect(p.onFilterChange).toHaveBeenCalledWith({ 'search[inline]': '97250' }, false);
    expect(screen.queryByTestId('topbar-search-popup')).toBeNull();
  });

  it('stays in the screen when the screen is open inside a dialog', () => {
    render(<div role="dialog"><CentralizedSearch {...props()} /></div>);
    expect(slot.childElementCount).toBe(0);
    expect(screen.getByTestId('date-picker')).toBeTruthy();
  });
});

describe('CentralizedSearch without a top bar', () => {
  it('renders the whole row in the screen', () => {
    render(<CentralizedSearch {...props()} />);
    expect(screen.getByPlaceholderText('Search calls')).toBeTruthy();
    expect(screen.getByTestId('date-picker')).toBeTruthy();
  });
});

// A date-range segment's own inputs: they share a scope with the value's
// "from-to" parts, which once shadowed the translation function.
describe('CentralizedSearch date-range filter', () => {
  let slot;
  beforeEach(() => {
    slot = document.createElement('div');
    slot.id = TOPBAR_SEARCH_SLOT_ID;
    document.body.appendChild(slot);
  });
  afterEach(() => slot.remove());

  it('shows From and To inputs in the filter panel', () => {
    render(<CentralizedSearch {...props({ segments: [{ name: 'created_at', label: 'Created', type: 'date' }] })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });
});
