import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StatCounter from './StatCounter.jsx';

describe('StatCounter tile', () => {
  it('shows the number, the label and the icon, and filters on a click', () => {
    const onClick = vi.fn();
    render(<StatCounter variant="tile" label="Answered" value={12} icon={<svg data-testid="ico" />} onClick={onClick} />);
    const tile = screen.getByRole('button', { name: 'Answered: 12' });
    expect(screen.getByTestId('ico')).toBeInTheDocument();
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalled();
  });

  it('never shows a confident 0 for unknown data', () => {
    render(<StatCounter variant="tile" label="Total" value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });
});
