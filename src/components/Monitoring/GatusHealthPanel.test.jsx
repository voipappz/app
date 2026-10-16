import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/apiService', () => ({
  apiService: { get: vi.fn(), getText: vi.fn(), clearCache: vi.fn() },
}));
vi.mock('../../hooks/useGatusHealth', () => ({ useGatusHealth: () => ({ endpoints: [], summary: { total: 0, up: 0, down: 0 }, loading: false }) }));

import { apiService } from '../../services/apiService';
import GatusHealthPanel from './GatusHealthPanel.jsx';

const ep = { key: 'core_web-api', name: 'Web API', group: 'core', up: false, uptime: 98, history: [], lastCheck: '2026-10-14T10:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
  apiService.getText.mockResolvedValue('0.98');
  apiService.get.mockImplementation((url) => Promise.resolve(url.includes('/statuses')
    ? {
      results: [{
        timestamp: '2026-10-14T10:00:00Z', success: false, status: 503, duration: 42e6, hostname: 'web',
        conditionResults: [{ condition: '[STATUS] == 200', success: false }, { condition: '[RESPONSE_TIME] < 2000', success: true }],
        errors: ['dial tcp: connection refused'],
      }],
      events: [{ type: 'UNHEALTHY', timestamp: '2026-10-14T10:00:00Z' }],
    }
    : { values: [1, 2, 3] }));
});

describe('GatusHealthPanel tile detail', () => {
  it('opens on a click, fetches through the signed-in client, and shows the latest check', async () => {
    render(<GatusHealthPanel endpoints={[ep]} summary={{ total: 1, up: 0, down: 1 }} title="Health · Gatus" />);
    await userEvent.click(screen.getByText('Web API'));

    const latest = await screen.findByTestId('gatus-latest-check');
    // The Gatus API is protected: every detail call goes through apiService.
    expect(apiService.get).toHaveBeenCalledWith('/api/v1/endpoints/core_web-api/statuses?page=1&pageSize=50', expect.anything(), 'Gatus detail', false, true);
    expect(apiService.getText).toHaveBeenCalledWith('/api/v1/endpoints/core_web-api/uptimes/24h', 'Gatus detail');
    await waitFor(() => expect(latest).toHaveTextContent('[STATUS] == 200'));
    expect(latest).toHaveTextContent('[RESPONSE_TIME] < 2000');
    expect(latest).toHaveTextContent('503');
    expect(latest).toHaveTextContent('dial tcp: connection refused');
  });
});
