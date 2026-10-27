import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import CableStatus, { ago } from './CableStatus';

const NOW = 1_800_000_000_000;
const live = {
  configured: true,
  url: 'ws://localhost:14000/cable?token=***',
  tokenSource: 'portal',
  tokenExpiresAt: NOW + 2 * 3600 * 1000,
  state: 'open',
  openedAt: NOW - 60000,
  welcomedAt: NOW - 60000,
  pingedAt: NOW - 2000,
  reconnectAttempts: 0,
  monitorRunning: true,
  lastCloseAt: null,
  lastCloseCode: null,
  disconnectReason: null,
};
const confirmed = { status: 'confirmed', environmentUuid: 'env-906', confirmedAt: NOW - 59000, frames: 12, lastFrameAt: NOW - 3000 };

describe('CableStatus', () => {
  it('is one green line when the screen is live, details folded away', () => {
    render(<CableStatus conn={live} sub={confirmed} counts={{ user: 3 }} now={NOW} />);
    expect(screen.getByText('Realtime cable: Live')).toBeInTheDocument();
    expect(screen.getByText(/12 updates, last 3s ago/)).toBeInTheDocument();
    expect(screen.queryByText('Endpoint')).not.toBeInTheDocument();
  });

  it('opens the details by itself when it is not live, and says why', () => {
    render(
      <CableStatus
        conn={{ ...live, state: 'closed', welcomedAt: null, pingedAt: null, monitorRunning: false, disconnectReason: 'unauthorized', lastCloseAt: NOW - 1000, lastCloseCode: 1000 }}
        sub={{ status: 'pending', environmentUuid: 'env-906', frames: 0 }}
        now={NOW}
      />,
    );
    expect(screen.getByText('Realtime cable: Token refused')).toBeInTheDocument();
    expect(screen.getByText('Endpoint')).toBeInTheDocument();
    expect(screen.getByText(/server said “unauthorized”/)).toBeInTheDocument();
    // The token itself is never on screen.
    expect(screen.getByText('ws://localhost:14000/cable?token=***')).toBeInTheDocument();
  });

  it('shows the subscription the screen depends on', () => {
    render(<CableStatus conn={live} sub={confirmed} now={NOW} />);
    fireEvent.click(screen.getByLabelText('cable details'));
    expect(screen.getByText(/LiveChannel · env-906 · confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/portal login · expires in 2h 0m/)).toBeInTheDocument();
  });
});

describe('ago', () => {
  it('reads like a person would say it', () => {
    expect(ago(null, NOW)).toBe('never');
    expect(ago(NOW - 5000, NOW)).toBe('5s ago');
    expect(ago(NOW - 125000, NOW)).toBe('2m 5s ago');
    expect(ago(NOW - 3_660_000, NOW)).toBe('1h 1m ago');
  });
});

describe('CableStatus in Hebrew', () => {
  it('speaks Hebrew, keeping the endpoint as it is', async () => {
    await i18n.changeLanguage('he');
    try {
      render(<CableStatus conn={live} sub={confirmed} now={NOW} />);
      expect(screen.getByText('ערוץ זמן אמת: חי')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('פרטי הערוץ'));
      expect(screen.getByText('כתובת')).toBeInTheDocument();
      expect(screen.getByText('ws://localhost:14000/cable?token=***')).toBeInTheDocument();
      expect(ago(NOW - 5000, NOW)).toBe('לפני 5 שנ׳');
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
