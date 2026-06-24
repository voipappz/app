import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Paper,
  FormControl,
  FormHelperText,
  CircularProgress,
  Alert
} from '@mui/material';
import { useLogin } from './Login';
import { useTranslation } from 'react-i18next';
import { brand } from '../../config';
import './Login.css';

const Login = () => {
  const { t } = useTranslation();
  const {
    email,
    password,
    touched,
    loading,
    error,
    handleEmailChange,
    handlePasswordChange,
    handleBlur,
    handleSubmit
  } = useLogin();

  return (
    <Container component="main" maxWidth="sm" className="login-container">
      <Paper
        elevation={0}
        className="login-paper"
      >
        {/* Mobile-only logo — dark wordmark on the white card */}
        <Box className="mobile-login-logo">
          <img src={brand.logo} alt={brand.name} style={{ height: 40 }} />
        </Box>

        <Typography component="h1" variant="h5" className="login-title">
          {t('login.title')}
        </Typography>
        
        {error && (
          <Alert severity="error" className="mb-3" data-testid="error-message">
            {error}
          </Alert>
        )}
        
        <Box component="form" onSubmit={handleSubmit} className="login-form" data-testid="login-form">
          <FormControl fullWidth className="input-container email-container mb-3">
            <TextField
              fullWidth
              id="email"
              name="email"
              label={t('login.email')}
              value={email}
              onChange={handleEmailChange}
              onBlur={() => handleBlur('email')}
              variant="outlined"
              className="login-input email-input"
              data-testid="email-input"
              data-cy="email-input"
              required
              error={touched.email && email === ''}
            />
            {touched.email && email === '' && (
              <FormHelperText error className="error-message email-error">{t('login.requiredField')}</FormHelperText>
            )}
          </FormControl>
          
          <FormControl fullWidth className="input-container password-container">
            <TextField
              fullWidth
              id="password"
              name="password"
              label={t('login.password')}
              type="password"
              value={password}
              onChange={handlePasswordChange}
              onBlur={() => handleBlur('password')}
              variant="outlined"
              className="login-input password-input"
              data-testid="password-input"
              data-cy="password-input"
              required
              error={touched.password && password === ''}
            />
            {touched.password && password === '' && (
              <FormHelperText error className="error-message password-error">{t('login.requiredField')}</FormHelperText>
            )}
          </FormControl>
          
          <Box className="form-footer">
            <Typography
              variant="body2"
              className="forgot-password"
            >
              {t('login.forgotPassword')}
            </Typography>

            <Button
              type="submit"
              variant="contained"
              className="login-button"
              data-testid="login-button"
              data-cy="login-button"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              {loading ? t('login.loggingIn') : t('login.loginButton')}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default Login;
