import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { addDays } from 'date-fns';
import '../../i18n';
import DateRangeControl from './DateRangeControl.jsx';
import { dayKey } from '../../utils/dateUtils';

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Select dates' }));

describe('DateRangeControl', () => {
  it('starts at all time and sends the Last 7 days preset as from/to day keys', () => {
    const onChange = vi.fn();
    render(<DateRangeControl from="" to="" onChange={onChange} />);
    expect(screen.queryByRole('button', { name: 'Clear period' })).toBeNull();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenCalledWith({ from: dayKey(addDays(new Date(), -6)), to: dayKey(new Date()) });
  });

  it('sends a custom range typed into Start and End', () => {
    const onChange = vi.fn();
    render(<DateRangeControl from="" to="" onChange={onChange} />);
    open();
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-10-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-05' });
  });

  it('shows the chosen period and clears back to all time', () => {
    const onChange = vi.fn();
    render(<DateRangeControl from={dayKey(new Date())} to={dayKey(new Date())} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear period' }));
    expect(onChange).toHaveBeenCalledWith({ from: '', to: '' });
  });
});
