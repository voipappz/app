import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../../i18n';
import DateTimeCell from './DateTimeCell';
import { DENSITY } from './density';
import { formatDate } from '../../../utils/dateUtils';
import { styledCss } from '../../../test/styledCss';

const when = '2026-01-01T10:00:00Z';

afterEach(() => i18n.changeLanguage('en'));

describe('DateTimeCell', () => {
  it('shows the date and time on one line, in the small secondary type', () => {
    render(<DateTimeCell value={when} />);
    const cell = screen.getByText(formatDate(when));
    expect(cell.tagName).toBe('SPAN');
    const css = styledCss();
    expect(css).toContain(`font-size:${DENSITY.secondaryFontSize}`);
    expect(css).toContain('white-space:nowrap');
  });

  it('follows the language, through the shared date helper', async () => {
    await i18n.changeLanguage('he');
    render(<DateTimeCell value={when} />);
    expect(screen.getByText(formatDate(when))).toBeInTheDocument();
  });

  it('shows a dash for no date', () => {
    render(<DateTimeCell value={null} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
