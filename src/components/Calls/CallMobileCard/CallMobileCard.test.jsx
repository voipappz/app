import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../../i18n';
import CallMobileCard from './CallMobileCard';

const call = {
  uuid: 'c1',
  created_at: '2026-01-01T10:00:00Z',
  profile: { caller: '+972-3-555-1234', callee: '1010', cid: 'abc-123', direction: 'inbound', cause: 'answered' },
  environment: { name: 'Sales' },
};

afterEach(() => i18n.changeLanguage('en'));

describe('CallMobileCard', () => {
  it('labels the details in English, as before', () => {
    render(<CallMobileCard call={call} />);
    expect(screen.getByText('Client:')).toBeInTheDocument();
    expect(screen.getByText('Call ID:', { exact: false })).toBeInTheDocument();
  });

  it('labels the details in Hebrew and keeps phone numbers left to right', async () => {
    await i18n.changeLanguage('he');
    render(<CallMobileCard call={call} />);
    expect(screen.getByText('לקוח:')).toBeInTheDocument();
    expect(screen.getByText('+972-3-555-1234').tagName).toBe('BDI');
    expect(screen.getByText('abc-123').tagName).toBe('BDI');
  });
});
