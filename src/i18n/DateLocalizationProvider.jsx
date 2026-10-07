import { useTranslation } from 'react-i18next';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { he } from 'date-fns/locale/he';
import './index'; // make sure i18next is set up, even when rendered on its own

// Date pickers in the active language: Hebrew month and day names under Hebrew.
// Reads the language from i18next rather than useLocale(), so it also works in
// tests that render a screen without the app's providers.
export default function DateLocalizationProvider({ children }) {
  const { i18n } = useTranslation();
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={i18n.language === 'he' ? he : undefined}>
      {children}
    </LocalizationProvider>
  );
}
