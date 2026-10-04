import {
  Box, FormControl, FormControlLabel, InputLabel, MenuItem, Radio, RadioGroup, Select, Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../i18n/LocaleContext';
import { useThemeMode } from '../../context/ThemeContext';
import { SUPPORTED_LANGUAGES } from '../../i18n';

// Each language names itself in its own language — a reader looking for Hebrew
// should not have to recognise the English word "Hebrew" to find it.
const LANGUAGE_NAMES = { en: 'English', he: 'עברית' };

/**
 * Appearance — language and theme, the two per-browser display preferences.
 *
 * Both are stored per browser rather than on the account, so the wording says
 * "this browser" instead of implying it follows you to another machine.
 *
 * This is also the admin console's FIRST reachable theme toggle. There has
 * been one in TopBar all along, inside its `overflowTools` menu, but that menu
 * renders only when `isPhone` AND the whole `.topbar-container` is
 * `display: none !important` — two independent reasons it never appeared. The
 * portal has had one in UserRail; the console had none.
 */
const Appearance = () => {
  const { t } = useTranslation();
  const { language, setLanguage } = useLocale();
  const { theme, setTheme } = useThemeMode();

  return (
    <Box>
      <Typography variant="body2" sx={{ color: 'var(--theme-text-secondary)', mb: 3 }}>
        {t('settings:appearance.intro', {
          defaultValue: 'These settings are remembered in this browser.',
        })}
      </Typography>

      <FormControl size="small" sx={{ minWidth: 220, mb: 4, display: 'block' }}>
        <InputLabel id="appearance-language-label">
          {t('settings:appearance.language', { defaultValue: 'Language' })}
        </InputLabel>
        <Select
          labelId="appearance-language-label"
          id="appearance-language"
          data-testid="appearance-language"
          value={language}
          label={t('settings:appearance.language', { defaultValue: 'Language' })}
          // 'user' marks this an explicit choice, which outranks the customer's
          // default from then on — see LocaleSync.
          onChange={(event) => setLanguage(event.target.value, 'user')}
          sx={{ minWidth: 220 }}
        >
          {SUPPORTED_LANGUAGES.map((code) => (
            <MenuItem key={code} value={code} lang={code}>
              {LANGUAGE_NAMES[code] || code}
            </MenuItem>
          ))}
        </Select>
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'var(--theme-text-tertiary)' }}>
          {t('settings:appearance.languageHint', {
            defaultValue: 'Switching reloads the screen. Hebrew also flips the layout right-to-left.',
          })}
        </Typography>
      </FormControl>

      <FormControl>
        <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
          {t('settings:appearance.theme', { defaultValue: 'Theme' })}
        </Typography>
        <RadioGroup
          row
          name="appearance-theme"
          data-testid="appearance-theme"
          value={theme}
          onChange={(event) => setTheme(event.target.value)}
        >
          <FormControlLabel
            value="light"
            control={<Radio size="small" />}
            label={t('settings:appearance.light', { defaultValue: 'Light' })}
          />
          <FormControlLabel
            value="dark"
            control={<Radio size="small" />}
            label={t('settings:appearance.dark', { defaultValue: 'Dark' })}
          />
        </RadioGroup>
      </FormControl>
    </Box>
  );
};

export default Appearance;
