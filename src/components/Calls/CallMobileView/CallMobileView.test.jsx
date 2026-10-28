import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import i18n from '../../../i18n';
import CallMobileView from './CallMobileView';
// The Block button tells its outcome through notifications.
vi.mock('../../../context/NotificationContext', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }));

// The sentinel's observer is not what's under test.
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: () => {}, inView: false }) }));
vi.mock('../../../hooks/useDialNow', () => ({ useDialNow: () => ({ canDial: false, dialNow: vi.fn() }) }));

const at = (daysAgo, hour) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};
const call = (uuid, created_at) => ({ uuid, created_at, profile: { caller: uuid, direction: 'incoming', cause: 'answer' } });

afterEach(() => i18n.changeLanguage('en'));

describe('CallMobileView', () => {
  it('heads each day once: Today, Yesterday, then the date', () => {
    render(
      <CallMobileView
        rows={[call('a', at(0, 12)), call('b', at(0, 9)), call('c', at(1, 15)), call('d', at(10, 8))]}
        hasNextPage={false}
      />,
    );
    const headings = screen.getAllByTestId('calls-mobile-day').map((el) => el.textContent);
    expect(headings).toHaveLength(3);
    expect(headings[0]).toBe('Today');
    expect(headings[1]).toBe('Yesterday');
    expect(headings[2]).not.toMatch(/Today|Yesterday/);
  });

  it('names the days in Hebrew', async () => {
    await i18n.changeLanguage('he');
    render(<CallMobileView rows={[call('a', at(0, 12)), call('c', at(1, 15))]} hasNextPage={false} />);
    const headings = screen.getAllByTestId('calls-mobile-day').map((el) => el.textContent);
    expect(headings).toEqual(['היום', 'אתמול']);
  });

  it('opens one call at a time', () => {
    render(<CallMobileView rows={[call('a', at(0, 12)), call('b', at(0, 9))]} hasNextPage={false} />);
    const [first, second] = screen.getAllByRole('button', { name: /^Incoming call from/ });
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'false');
  });
});

// An empty list is not "no calls" until the server says so.
describe('CallMobileView with no calls to show', () => {
  it('says the calls are loading, not that there are none', () => {
    render(<CallMobileView rows={[]} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading calls…');
    expect(screen.queryByText('No call data available.')).toBeNull();
  });

  it('says there are no calls once the answer came back empty', () => {
    render(<CallMobileView rows={[]} loading={false} />);
    expect(screen.getByText('No call data available.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says the calls could not load, and tries again', () => {
    const onRetry = vi.fn();
    render(<CallMobileView rows={[]} error="HTTP error! status: 500" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the calls.");
    expect(screen.queryByText('No call data available.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('keeps showing the calls it has while more load', () => {
    render(<CallMobileView rows={[call('c1', at(0, 9))]} loading />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getAllByTestId('calls-mobile-day')).toHaveLength(1);
  });

  it('says it is loading in Hebrew', async () => {
    await i18n.changeLanguage('he');
    render(<CallMobileView rows={[]} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('טוען שיחות…');
  });
});
