import { Box, Typography, Link } from '@mui/material';
import { useLoginLeft } from './LoginLeft';
import { useTranslation } from 'react-i18next';
import { brand } from '../../config';
import './LoginLeft.css';

// Brand mark — white-on-dark logo on the sidebar (env-driven, see config.brand).
const Logo = () => {
  return (
    <Box className="logo">
      <img src={brand.logoWhite} alt={brand.name} style={{ height: 48 }} />
    </Box>
  );
};

const LoginLeft = () => {
  const { t } = useTranslation();
  const { currentYear } = useLoginLeft();

  return (
    <Box className="login-left sidebar">
      <Box className="logo-container">
        <Logo />
      </Box>
        <Box sx={{height: "55vh;",display:" flex;",justifyContent: "space-between;",flexDirection: "column;"}}>
          <Box>
            <Typography variant="h4" className="welcome-text">
              {t('login.welcome', { brand: brand.name })}
            </Typography>

            <Typography variant="h6" className="login-subtitle">
              {t('login.subtitle')}
            </Typography>
          </Box>
          <Box className="footer">
            <Box>
              <Typography component="span" className="copyright">
                © {currentYear}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Link component="a" className="footer-link">{t('login.footer.privacy')}</Link>
              <Link component="a" className="footer-link">{t('login.footer.legal')}</Link>
              <Link component="a" className="footer-link">{t('login.footer.contact')}</Link>
            </Box>
          </Box>
        </Box>
    </Box>
  );
};

export default LoginLeft;
