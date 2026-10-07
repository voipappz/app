import { describe, it, expect } from 'vitest';
import { muiLocalesFor } from './muiLocales';
import { createAppTheme } from '../theme/theme';

describe('muiLocalesFor', () => {
  it('adds nothing for English, which is MUI\'s default', () => {
    expect(muiLocalesFor('en')).toEqual([]);
  });

  it('gives the data grid and date pickers their Hebrew text', () => {
    const theme = createAppTheme('rtl', ...muiLocalesFor('he'));
    expect(theme.components.MuiDataGrid.defaultProps.localeText).toBeDefined();
    expect(theme.components.MuiLocalizationProvider.defaultProps.localeText).toBeDefined();
    expect(Object.keys(theme.colorSchemes)).toEqual(['light', 'dark']);
  });
});
