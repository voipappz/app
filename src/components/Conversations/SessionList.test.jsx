import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import SessionList from './SessionList.jsx';
import { conversations } from './fixtures';

const base = { tab: 'all', sessions: conversations, selectedId: 'c-ended', loading: false, error: false, liveConnected: true, search: '', onSearch: () => {}, view: { sort: 'newest', direction: '', outcome: '', everyone: false }, onView: () => {}, canEveryone: false };

describe('SessionList', () => {
  it('highlights the selected row and reports clicks and tab changes', () => {
    const onSelect = vi.fn(); const onTab = vi.fn();
    render(<SessionList {...base} onSelect={onSelect} onTab={onTab} />);
    const rows = screen.getAllByTestId('session-row');
    expect(rows).toHaveLength(7);
    expect(rows[3]).toHaveAttribute('aria-current', 'true');
    fireEvent.click(rows[2]);
    expect(onSelect).toHaveBeenCalledWith('c-missed');
    fireEvent.click(screen.getByRole('tab', { name: 'Missed' }));
    expect(onTab).toHaveBeenCalledWith('missed');
  });

  it('says so when live updates are not connected', () => {
    render(<SessionList {...base} tab="live" sessions={[]} liveConnected={false} onSelect={() => {}} onTab={() => {}} />);
    expect(screen.getByText('Live updates are not connected.')).toBeInTheDocument();
  });
});
