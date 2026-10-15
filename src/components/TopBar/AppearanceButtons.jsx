import { IconButton, Tooltip } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '../../context/ThemeContext';
import { useLocale } from '../../i18n/LocaleContext';

// Language and light/dark mode, in the top bar's end corner where people look
// for them. Appearance is the viewer's, not a permission: both sessions get it.
export default function AppearanceButtons() {
  const { t } = useTranslation();
  const { isDarkMode, toggleTheme } = useThemeMode();
  const { language, setLanguage } = useLocale();
  // One click to the other language, named in that language.
  const otherLanguage = language === 'he' ? 'en' : 'he';
  const sx = { color: 'var(--theme-text-secondary)' };
  return (
    <>
      <Tooltip title={t(`languageName.${otherLanguage}`)}>
        <IconButton size="small" onClick={() => setLanguage(otherLanguage)} aria-label={t('appearance.switchLanguage')} data-testid="topbar-language" sx={sx}>
          <LanguageIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t(isDarkMode ? 'appearance.lightMode' : 'appearance.darkMode')}>
        <IconButton size="small" onClick={toggleTheme} aria-label={t(isDarkMode ? 'appearance.lightMode' : 'appearance.darkMode')} data-testid="topbar-theme" sx={sx}>
          {isDarkMode ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </>
  );
}
