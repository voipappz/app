import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import i18n from '../../../i18n';
import CallHistory from './CallHistory';
import { callsApi } from '../../../services/api/callsApi';

vi.mock('../../../services/api/callsApi', () => ({ callsApi: { getCallHistory: vi.fn() } }));

const earlier = { uuid: 'c0', created_at: '2026-10-10T08:00:00Z', profile: { direction: 'outgoing', cause: 'no_answer', caller: '201', callee: '0541234567' } };

beforeEach(() => { callsApi.getCallHistory.mockResolvedValue([{ uuid: 'c1' }, earlier]); });
afterEach(() => i18n.changeLanguage('en'));

describe('CallHistory', () => {
  it('lists the other calls, and opens one', async () => {
    const onOpenCall = vi.fn();
    render(<CallHistory callUuid="c1" onOpenCall={onOpenCall} />);
    const line = await screen.findByRole('button', { name: /^Unanswered call to .*0541234567/ });
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(line);
    expect(onOpenCall).toHaveBeenCalledWith(earlier);
  });

  it('says so when there are no other calls', async () => {
    callsApi.getCallHistory.mockResolvedValue([]);
    render(<CallHistory callUuid="c1" onOpenCall={vi.fn()} />);
    expect(await screen.findByText('No other calls with this number')).toBeInTheDocument();
  });

  it('says so when the history could not load', async () => {
    callsApi.getCallHistory.mockRejectedValue(new Error('boom'));
    render(<CallHistory callUuid="c1" onOpenCall={vi.fn()} />);
    expect(await screen.findByText("Couldn't load the history")).toBeInTheDocument();
  });

  it('speaks Hebrew', async () => {
    await i18n.changeLanguage('he');
    callsApi.getCallHistory.mockResolvedValue([]);
    render(<CallHistory callUuid="c1" onOpenCall={vi.fn()} />);
    expect(await screen.findByText('אין שיחות נוספות עם מספר זה')).toBeInTheDocument();
  });
});
