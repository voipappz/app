import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Bdi from './Bdi';
import LtrIsland from './LtrIsland';
import { ChevronForward, ChevronBack } from './DirectionalIcon';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../theme/theme';

describe('Bdi', () => {
  it('isolates its content as left-to-right', () => {
    const { container } = render(<Bdi>+972-3-555-1234</Bdi>);
    const bdi = container.querySelector('bdi');
    // <bdi> opens its own bidi context; dir pins which way.
    expect(bdi).not.toBeNull();
    expect(bdi.getAttribute('dir')).toBe('ltr');
    expect(bdi).toHaveTextContent('+972-3-555-1234');
  });

  it('passes attributes through, so it can carry a testid or class', () => {
    const { container } = render(<Bdi data-testid="num" className="x">101</Bdi>);
    const bdi = container.querySelector('bdi');
    expect(bdi.getAttribute('data-testid')).toBe('num');
    expect(bdi).toHaveClass('x');
  });
});

describe('LtrIsland', () => {
  it('pins its subtree to ltr', () => {
    const { container } = render(<LtrIsland><span>chart</span></LtrIsland>);
    const box = container.querySelector('[dir="ltr"]');
    expect(box).not.toBeNull();
    expect(box).toHaveTextContent('chart');
  });

  it('stays ltr even when the app around it is rtl', () => {
    const { container } = render(
      <ThemeProvider theme={createAppTheme('rtl')}>
        <LtrIsland><span>axis</span></LtrIsland>
      </ThemeProvider>
    );
    // The island re-declares direction for itself; a time axis must not mirror.
    expect(container.querySelector('[dir="ltr"]')).not.toBeNull();
  });
});

describe('DirectionalIcon', () => {
  const iconTestId = (container) =>
    container.querySelector('svg')?.getAttribute('data-testid');

  it('points right for "forward" in ltr', () => {
    const { container } = render(
      <ThemeProvider theme={createAppTheme('ltr')}><ChevronForward /></ThemeProvider>
    );
    expect(iconTestId(container)).toBe('ChevronRightIcon');
  });

  it('points left for "forward" in rtl', () => {
    const { container } = render(
      <ThemeProvider theme={createAppTheme('rtl')}><ChevronForward /></ThemeProvider>
    );
    expect(iconTestId(container)).toBe('ChevronLeftIcon');
  });

  it('mirrors "back" the opposite way', () => {
    const ltr = render(
      <ThemeProvider theme={createAppTheme('ltr')}><ChevronBack /></ThemeProvider>
    );
    expect(iconTestId(ltr.container)).toBe('ChevronLeftIcon');

    const rtl = render(
      <ThemeProvider theme={createAppTheme('rtl')}><ChevronBack /></ThemeProvider>
    );
    expect(iconTestId(rtl.container)).toBe('ChevronRightIcon');
  });
});
