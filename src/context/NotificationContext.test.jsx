import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NotificationProvider, useNotification } from './NotificationContext.jsx';

const Harness = () => {
  const { showError } = useNotification();
  return (
    <>
      <button onClick={() => { showError('Service unavailable'); showError('Service unavailable'); }}>
        duplicate
      </button>
      <button onClick={() => {
        showError('one'); showError('two'); showError('three'); showError('four');
      }}>
        burst
      </button>
    </>
  );
};

describe('NotificationProvider toaster', () => {
  it('shows an identical error only once inside the dedupe window', () => {
    render(<NotificationProvider><Harness /></NotificationProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'duplicate' }));
    expect(screen.getAllByTestId('notification-toast')).toHaveLength(1);
    expect(screen.getByText('Service unavailable')).toBeInTheDocument();
  });

  it('stacks distinct messages without dropping earlier ones', () => {
    render(<NotificationProvider><Harness /></NotificationProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'burst' }));
    expect(screen.getAllByTestId('notification-toast')).toHaveLength(4);
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('four')).toBeInTheDocument();
  });

  it('dismisses one message without clearing the rest of the stack', () => {
    render(<NotificationProvider><Harness /></NotificationProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'burst' }));
    fireEvent.click(screen.getAllByTestId('notification-toast-close')[0]);
    expect(screen.queryByText('one')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('notification-toast')).toHaveLength(3);
    expect(screen.getByText('four')).toBeInTheDocument();
  });
});
