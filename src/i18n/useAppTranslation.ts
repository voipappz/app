import { useTranslation } from 'react-i18next';
import { useDirection } from '../context/DirectionContext';

type Language = 'he' | 'en';

export function useAppTranslation() {
  const { t, i18n } = useTranslation();
  const { setDirection } = useDirection();

  const changeLanguage = (lang: Language) => {
    i18n.changeLanguage(lang);
    setDirection(lang === 'he' ? 'rtl' : 'ltr');
    localStorage.setItem('app-language', lang);
  };

  return {
    t,
    language: i18n.language as Language,
    changeLanguage,
    isRTL: i18n.language === 'he'
  };
}
