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

  it('puts the search field and date selector directly in the top bar', () => {
    render(<CentralizedSearch {...props()} />);
    expect(slot.contains(screen.getByPlaceholderText('Search calls'))).toBe(true);
    expect(slot.contains(screen.getByTestId('date-picker'))).toBe(true);
    expect(screen.queryByTestId('topbar-search-popup')).toBeNull();
  });

  it('opens filters on focus while keeping the date selector in the bar', () => {
    render(<CentralizedSearch {...props()} />);
    fireEvent.focus(screen.getByPlaceholderText('Search calls'));
    const popup = screen.getByTestId('topbar-search-popup');
    expect(popup.contains(screen.getByTestId('date-picker'))).toBe(false);
    expect(slot.contains(screen.getByTestId('date-picker'))).toBe(true);
    expect(popup.textContent).toContain('Caller');
    // Refresh and the screen's other actions live in the popup, not in the bar.
    expect(popup.contains(screen.getByRole('button', { name: 'Refresh' }))).toBe(true);
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

  it('leaves the date range out when the screen asks', () => {
    render(<CentralizedSearch {...props({ hideDateRange: true })} />);
    expect(screen.getByPlaceholderText('Search calls')).toBeTruthy();
    expect(screen.queryByTestId('date-picker')).toBeNull();
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

// A screen that draws its own search row (Calls) wants only the full panel,
// behind one button, plus the chips for filters its own pills don't cover.
describe('CentralizedSearch as a Filters button', () => {
  const segments = [
    { name: 'call.cause', label: 'Cause', type: 'select', data: [{ value: 'answer', name: 'Answer' }] },
    { name: 'call.caller', label: 'Caller', type: 'string' },
    { name: 'call.queue_name', label: 'Queue', type: 'string' },
  ];

  it('renders as a Filters button with the panel in a popover when renderAs="button"', () => {
    const p = props({
      renderAs: 'button', segments, inlineFilters: ['call.cause', 'call.caller'],
      currentSearchParams: { 'search[call.cause][IS]': ['answer'], 'search[call.queue_name][IS]': 'sales', 'search[inline]': '97250' },
    });
    render(<CentralizedSearch {...p} />);
    // No search field, no date range, no table actions.
    expect(screen.queryByPlaceholderText('Search calls')).toBeNull();
    expect(screen.queryByTestId('date-picker')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    // The button counts the filters no pill speaks for: the queue and the text.
    const button = screen.getByRole('button', { name: 'Filters' });
    expect(button).toHaveTextContent('Filters · 2');
    // Those two are chips with a ×; the cause is a pill's business, so no chip.
    expect(screen.getByText('Queue: sales')).toBeInTheDocument();
    expect(screen.getByText('Search: 97250')).toBeInTheDocument();
    expect(screen.queryByText(/Cause:/)).toBeNull();
    expect(screen.queryByText('Cause')).toBeNull();
    fireEvent.click(screen.getByText('Search: 97250').parentElement.querySelector('.MuiChip-deleteIcon'));
    expect(p.onFilterChange).toHaveBeenCalledWith({ 'search[call.cause][IS]': ['answer'], 'search[call.queue_name][IS]': 'sales' }, true);
    // Clear is the whole screen's.
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(p.onClearAllFilters).toHaveBeenCalled();
    // The panel opens in a popover, every field in it.
    expect(screen.queryByTestId('centralized-search-popover')).toBeNull();
    fireEvent.click(button);
    const popover = screen.getByTestId('centralized-search-popover');
    expect(popover.textContent).toContain('Cause');
    expect(popover.textContent).toContain('Caller');
    expect(popover.textContent).toContain('Queue');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not dock into the top bar in button mode', () => {
    const slot = document.createElement('div');
    slot.id = TOPBAR_SEARCH_SLOT_ID;
    document.body.appendChild(slot);
    try {
      render(<CentralizedSearch {...props({ renderAs: 'button', segments })} />);
      expect(slot.childElementCount).toBe(0);
      expect(screen.queryByTestId('topbar-search')).toBeNull();
      expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    } finally {
      slot.remove();
    }
  });
});
