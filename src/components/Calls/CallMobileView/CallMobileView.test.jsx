import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../../i18n';
import CallMobileView from './CallMobileView';

// The sentinel's observer is not what's under test.
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: () => {}, inView: false }) }));

const at = (daysAgo, hour) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};
const call = (uuid, created_at) => ({ uuid, created_at, profile: { caller: uuid, direction: 'inbound', cause: 'answered' } });

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
});
