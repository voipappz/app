import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { useUserAuth } from '../../context/UserAuthContext';

/** End the portal session; SoftphoneContext also unregisters and clears SIP state. */
export default function PhoneSessionSignOut({ inCall }) {
  const { logout } = useUserAuth();
  const navigate = useNavigate();
  const { t } = useTranslation('phone');
  const [confirm, setConfirm] = useState(false);
  const signOut = () => { logout(); navigate('/', { replace: true }); };
  return <>
    <Button size="small" startIcon={<LogoutIcon sx={{ fontSize: 16 }} />} onClick={() => inCall ? setConfirm(true) : signOut()}
      sx={{ color: '#cbd5e1', textTransform: 'none', minHeight: 36, fontSize: 12 }}>
      {t('session.signOut')}
    </Button>
    <Dialog open={confirm} onClose={() => setConfirm(false)} aria-labelledby="phone-sign-out-title">
      <DialogTitle id="phone-sign-out-title">{t('session.confirmTitle')}</DialogTitle>
      <DialogContent><DialogContentText>{t('session.confirmBody')}</DialogContentText></DialogContent>
      <DialogActions>
        <Button onClick={() => setConfirm(false)} autoFocus>{t('session.stay')}</Button>
        <Button onClick={signOut} color="error">{t('session.signOut')}</Button>
      </DialogActions>
    </Dialog>
  </>;
}
