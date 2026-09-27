import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import HealthList from './HealthList';

describe('HealthList', () => {
  it('lists every service and opens the verbose health for the one clicked', async () => {
    const onOpen = vi.fn();
    const health = { loading: false, isHealthy: true, checks: { database: { ok: true, ms: 0.7 }, nats: { ok: false, error: 'disconnected' } } };
    render(<HealthList health={health} onOpen={onOpen} />);

    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getByText('disconnected')).toBeInTheDocument();
    expect(screen.getByText(/Degraded — nats/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Nats health details' }));
    expect(onOpen).toHaveBeenCalledWith('nats');
  });

  it('still shows the API as one row when it reports no per-service checks', () => {
    render(<HealthList health={{ loading: false, isHealthy: true, checks: null }} onOpen={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'API health details' })).toBeInTheDocument();
  });
});
