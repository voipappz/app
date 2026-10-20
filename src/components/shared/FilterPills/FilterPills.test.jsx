import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterPills from './FilterPills.jsx';

const segments = [
  { name: 'call.cause', label: 'Cause', type: 'select', data: [{ value: 'answer', name: 'Answer' }, { value: 'busy', name: 'Busy' }] },
  { name: 'call.caller', label: 'Caller', type: 'string' },
];

describe('FilterPills', () => {
  it('a pill writes search[field][IS] and clears its own field first', () => {
    const onChange = vi.fn();
    render(
      <FilterPills
        segments={segments}
        fields={['call.cause', 'call.caller']}
        currentSearchParams={{ 'search[call.cause][NOT]': ['busy'], 'search[call.queue_name][IS]': 'sales' }}
        onChange={onChange}
      />
    );
    // Not a chip of its own: NOT is not what a pill sets, but it is this
    // field's, so the pill shows it as set.
    fireEvent.click(screen.getByText('Cause: Busy').parentElement.querySelector('.MuiChip-deleteIcon'));
    expect(onChange).toHaveBeenCalledWith({ 'search[call.queue_name][IS]': 'sales' }, true);

    onChange.mockClear();
    fireEvent.click(screen.getByText('Caller'));
    const input = screen.getByPlaceholderText('Caller');
    fireEvent.change(input, { target: { value: '97250' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // IS, the other params carried forward, the NOT on cause untouched.
    expect(onChange).toHaveBeenCalledWith({
      'search[call.cause][NOT]': ['busy'], 'search[call.queue_name][IS]': 'sales', 'search[call.caller][IS]': '97250',
    }, false);
  });

  it('a choice pill wraps the value in an array, the same param a quick filter writes', () => {
    const onChange = vi.fn();
    render(<FilterPills segments={segments} fields={['call.cause']} currentSearchParams={{ order_by: 'created_at' }} onChange={onChange} />);
    fireEvent.click(screen.getByText('Cause'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Answer' }));
    expect(onChange).toHaveBeenCalledWith({ order_by: 'created_at', 'search[call.cause][IS]': ['answer'] }, false);
  });

  it('skips a field the server sent no segment for', () => {
    render(<FilterPills segments={segments} fields={['call.cause', 'call.nowhere']} currentSearchParams={{}} onChange={vi.fn()} />);
    expect(screen.getAllByText(/Cause|nowhere/)).toHaveLength(1);
  });
});
