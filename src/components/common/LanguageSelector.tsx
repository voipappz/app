import { IconButton, Tooltip } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import { useAppTranslation } from '../../i18n/useAppTranslation';

export function LanguageSelector() {
  const { language, changeLanguage } = useAppTranslation();

  const toggle = () => {
    changeLanguage(language === 'he' ? 'en' : 'he');
  };

  return (
    <Tooltip title={language === 'he' ? 'English' : 'עברית'}>
      <IconButton onClick={toggle} color="inherit">
        <LanguageIcon />
      </IconButton>
    </Tooltip>
  );
}

export default LanguageSelector;
