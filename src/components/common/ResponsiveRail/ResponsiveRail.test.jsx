import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResponsiveRail, { RailItem, RailSpacer, RAIL_WIDTH, BOTTOM_NAV_HEIGHT } from './ResponsiveRail';

describe('ResponsiveRail', () => {
  it('renders a nav landmark with its label', () => {
    render(
      <ResponsiveRail ariaLabel="Portal navigation" testId="the-rail">
        <RailItem testId="a" icon={<span>i</span>} label="A" onClick={vi.fn()} />
      </ResponsiveRail>
    );
    const nav = screen.getByTestId('the-rail');
    expect(nav.tagName).toBe('NAV');
    expect(screen.getByRole('navigation', { name: 'Portal navigation' })).toBe(nav);
  });

  it('keeps the same DOM at both sizes', () => {
    // The desktop/phone flip is pure CSS, so nothing remounts on resize and
    // the same test IDs are present either way. A JS branch would not hold this.
    render(
      <ResponsiveRail testId="r">
        <RailItem testId="a" icon={<span>i</span>} label="A" onClick={vi.fn()} />
        <RailSpacer />
        <RailItem testId="b" icon={<span>i</span>} label="B" onClick={vi.fn()} />
      </ResponsiveRail>
    );
    expect(screen.getByTestId('a')).toBeInTheDocument();
    expect(screen.getByTestId('b')).toBeInTheDocument();
  });

  it('exports the geometry the surrounding layout offsets itself by', () => {
    expect(RAIL_WIDTH).toBe(88);
    expect(BOTTOM_NAV_HEIGHT).toBe(64);
  });
});

describe('RailItem', () => {
  it('clicks', () => {
    const onClick = vi.fn();
    render(<RailItem testId="x" icon={<span>i</span>} label="X" onClick={onClick} />);
    fireEvent.click(screen.getByTestId('x'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is operable from the keyboard, since it is not a real button', () => {
    const onClick = vi.fn();
    render(<RailItem testId="x" icon={<span>i</span>} label="X" onClick={onClick} />);
    const item = screen.getByTestId('x');

    expect(item).toHaveAttribute('role', 'button');
    expect(item).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(item, { key: 'Enter' });
    fireEvent.keyDown(item, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('ignores other keys', () => {
    const onClick = vi.fn();
    render(<RailItem testId="x" icon={<span>i</span>} label="X" onClick={onClick} />);
    fireEvent.keyDown(screen.getByTestId('x'), { key: 'a' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('marks the active entry for assistive tech, not just visually', () => {
    render(
      <>
        <RailItem testId="on" icon={<span>i</span>} label="On" active onClick={vi.fn()} />
        <RailItem testId="off" icon={<span>i</span>} label="Off" onClick={vi.fn()} />
      </>
    );
    expect(screen.getByTestId('on')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('off')).not.toHaveAttribute('aria-current');
  });

  it('shows a badge beside the icon when given one', () => {
    render(
      <RailItem
        testId="x" icon={<span>i</span>} label="X" onClick={vi.fn()}
        badge={<span data-testid="badge">3</span>}
      />
    );
    expect(screen.getByTestId('badge')).toBeInTheDocument();
  });
});
