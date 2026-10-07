import { Link } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import { useTranslation } from 'react-i18next';
import { useOptionalLocale } from './LocaleContext';

// One click to the other language, named in that language: "🌐 עברית" / "🌐 English".
// Renders nothing outside the app's providers (a screen tested on its own).
export default function LanguageLink({ sx }) {
  const { t } = useTranslation();
  const locale = useOptionalLocale();
  if (!locale) return null;

  const otherLanguage = locale.language === 'he' ? 'en' : 'he';
  return (
    <Link
      component="button"
      type="button"
      underline="hover"
      onClick={() => locale.setLanguage(otherLanguage)}
      aria-label={t('appearance.switchLanguage')}
      data-testid="language-link"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.85rem', ...sx }}
    >
      <LanguageIcon sx={{ fontSize: 16 }} />
      {t(`languageName.${otherLanguage}`)}
    </Link>
  );
}
