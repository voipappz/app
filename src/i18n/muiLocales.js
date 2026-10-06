import { heIL as coreHeIL } from '@mui/material/locale';
import { heIL as dataGridHeIL } from '@mui/x-data-grid/locales';
import { heIL as datePickersHeIL } from '@mui/x-date-pickers/locales';

// MUI's own translations of its built-in text: pagination, data grid menus and
// date pickers. English needs none, it is MUI's default.
export const muiLocalesFor = (language) =>
  (language === 'he' ? [coreHeIL, dataGridHeIL, datePickersHeIL] : []);
