import { Box, Typography } from '@mui/material';
import { useLoginLeft } from './LoginLeft';
import { useTranslation } from 'react-i18next';
import { brand } from '../../config';
import './LoginLeft.css';

const LoginLeft = () => {
  const { t } = useTranslation();
  const { currentYear } = useLoginLeft();

  return (
    <Box className="login-left sidebar">
      <Box className="login-left-copy">
        <Typography variant="h3" className="welcome-text">
          {t('login.welcome', { brand: brand.name })}
        </Typography>

        <Typography variant="h6" className="login-left-subtitle">
          {t('login.subtitle')}
        </Typography>
      </Box>
      <Box className="footer">
        <Typography component="span" className="copyright">
          © {currentYear} {brand.name}
        </Typography>
      </Box>
    </Box>
  );
};

export default LoginLeft;
