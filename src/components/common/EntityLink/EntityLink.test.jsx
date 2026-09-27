import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import EntityLink from './EntityLink';

describe('EntityLink', () => {
  it('opens the editor from the name and does not bubble to the row', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onRow = vi.fn();
    render(<div onClick={onRow}><EntityLink name="Sales" ariaLabel="Edit application Sales" onEdit={onEdit} /></div>);
    await user.click(screen.getByRole('button', { name: 'Edit application Sales' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRow).not.toHaveBeenCalled();
  });

  it('is plain text without an editor or when disabled', () => {
    const { rerender } = render(<EntityLink name="Sales" />);
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<EntityLink name="Sales" onEdit={() => {}} disabled />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a dash for a missing name', () => {
    render(<EntityLink name={null} onEdit={() => {}} />);
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
