// Resilience: if the SIP/WebRTC layer throws while loading, the ErrorBoundary in
// SipPhoneProvider must swap in a degraded context and STILL render the app —
// the softphone failing must never white-screen the whole project.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the SIP hook so the live provider throws during render (simulates sip.js /
// WebRTC failing to load). Must be declared before importing the provider.
const useSipPhone = vi.fn();
vi.mock('../lib/sip/useSipPhone', () => ({ useSipPhone: () => useSipPhone() }));

import { SipPhoneProvider, useSipPhoneCtx } from './SipPhoneContext';
import { AuthProvider } from './AuthContext';

function Consumer() {
  const { status, unavailable } = useSipPhoneCtx();
  return <div data-testid="consumer">app-ok:{status}:{String(!!unavailable)}</div>;
}

// SipPhoneProvider observes auth (for logout teardown), so it lives inside AuthProvider.
const renderApp = () => render(
  <AuthProvider><SipPhoneProvider><Consumer /></SipPhoneProvider></AuthProvider>,
);

describe('SipPhoneProvider resilience', () => {
  beforeEach(() => {
    useSipPhone.mockReset();
    vi.stubEnv('VITE_SIP_ENABLED', 'true');
    vi.spyOn(console, 'error').mockImplementation(() => {}); // silence boundary log
  });
  afterEach(() => vi.unstubAllEnvs());

  it('does not mount or connect the SIP layer when the tenant disables it', () => {
    vi.stubEnv('VITE_SIP_ENABLED', 'false');
    renderApp();
    expect(screen.getByTestId('consumer')).toHaveTextContent('app-ok:unavailable:true');
    expect(useSipPhone).not.toHaveBeenCalled();
  });

  it('renders children with a degraded context when the SIP layer throws', () => {
    useSipPhone.mockImplementation(() => { throw new Error('WebRTC failed to load'); });
    renderApp();
    expect(screen.getByTestId('consumer')).toHaveTextContent('app-ok:unavailable:true');
  });

  it('renders children with the live context when the SIP layer is healthy', () => {
    useSipPhone.mockReturnValue({
      status: 'idle', call: null, muted: false, logs: [],
      register: vi.fn(), unregister: vi.fn(), dial: vi.fn(), answer: vi.fn(),
      hangup: vi.fn(), sendDtmf: vi.fn(), setMuted: vi.fn(), clearLogs: vi.fn(),
    });
    renderApp();
    expect(screen.getByTestId('consumer')).toHaveTextContent('app-ok:idle:false');
  });
});
