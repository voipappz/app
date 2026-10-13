import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import i18n from '../../../i18n';
import CallLogFilter from './CallLogFilter';

afterEach(() => i18n.changeLanguage('en'));

describe('CallLogFilter', () => {
  it('names what is shown and offers the other choices', async () => {
    const onChange = vi.fn();
    render(<CallLogFilter value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'All calls' }));
    const options = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(options).toEqual(['All calls', 'Incoming', 'Outgoing', 'Not answered']);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Not answered' }));
    expect(onChange).toHaveBeenCalledWith('missed');
  });

  it('does nothing when the same choice is picked again', async () => {
    const onChange = vi.fn();
    render(<CallLogFilter value="incoming" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Incoming' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Incoming' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('speaks Hebrew', async () => {
    await i18n.changeLanguage('he');
    render(<CallLogFilter value="missed" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'שלא נענו' })).toBeInTheDocument();
  });
});
