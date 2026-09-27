import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AddBalanceDialog from './AddBalanceDialog';
import { subscriptionsApi } from '../../services/api/subscriptionsApi';

vi.mock('../../services/api/subscriptionsApi', () => ({ subscriptionsApi: { creditSubscription: vi.fn() } }));

describe('AddBalanceDialog', () => {
  it('credits a postpaid subscription too', async () => {
    const user = userEvent.setup();
    subscriptionsApi.creditSubscription.mockResolvedValue({ balance: 150 });
    const onSuccess = vi.fn();
    render(<AddBalanceDialog open subscription={{ uuid: 's-1', type: 'postpaid', balance: 100 }} onClose={vi.fn()} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText('Amount to add'), '50');
    await user.click(screen.getByRole('button', { name: 'Add Balance' }));

    expect(subscriptionsApi.creditSubscription).toHaveBeenCalledWith('s-1', 50);
    expect(onSuccess).toHaveBeenCalledWith(50, 150);
  });
});
