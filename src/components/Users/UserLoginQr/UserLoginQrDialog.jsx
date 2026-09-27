import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography,
} from '@mui/material';
import { Close as CloseIcon, ContentCopy as CopyIcon, QrCode2 as QrCodeIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import qrcode from 'qrcode-generator';
import { usersApi } from '../../../services/api/usersApi';

// The link the phone opens: this console's sign-in page, which trades the code
// for a session (UserLogin reads ?login_token=).
export const loginLinkFor = (token, origin = window.location.origin) => `${origin}/?login_token=${encodeURIComponent(token)}`;

const qrSvg = (text) => {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
};

const remaining = (expiresAt, now) => Math.max(0, expiresAt - Math.floor(now / 1000));
const mmss = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Sign-in QR for a user: scan it on a phone to be signed in as that user.
 * The code is a single-use JWT that expires in 10 minutes; "New code" issues
 * another.
 */
const UserLoginQrDialog = ({ open, user, onClose }) => {
  const [code, setCode] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  const issue = useCallback(async () => {
    if (!user?.uuid) return;
    setLoading(true);
    setError('');
    setCode(null);
    try {
      const res = await usersApi.createLoginToken(user.uuid);
      if (!res?.token) throw new Error('no token');
      setCode({ link: loginLinkFor(res.token), expiresAt: res.expires_at });
      setNow(Date.now());
    } catch {
      setError('Could not create a sign-in code. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.uuid]);

  useEffect(() => {
    if (open) issue();
    else { setCode(null); setError(''); setCopied(false); }
  }, [open, issue]);

  useEffect(() => {
    if (!open || !code) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open, code]);

  const svg = useMemo(() => (code ? qrSvg(code.link) : ''), [code]);
  const secondsLeft = code?.expiresAt ? remaining(code.expiresAt, now) : null;
  const expired = secondsLeft === 0;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(code.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="user-login-qr-title">
      <DialogTitle id="user-login-qr-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <QrCodeIcon color="primary" />
        <Box component="span" sx={{ flex: 1 }}>Sign-in QR - {user?.name || user?.email}</Box>
        <IconButton aria-label="Close sign-in QR" onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 3 }}>
        {error ? (
          <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>
        ) : loading || !code ? (
          <CircularProgress sx={{ my: 4 }} />
        ) : (
          <>
            <Box
              data-testid="user-login-qr"
              role="img"
              aria-label={`Sign-in QR code for ${user?.name || user?.email}`}
              sx={{ width: 220, height: 220, p: 1, bgcolor: '#fff', borderRadius: 1, border: '1px solid var(--mui-palette-divider)', opacity: expired ? 0.25 : 1, '& svg': { width: '100%', height: '100%', display: 'block' } }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <Typography variant="body2" color={expired ? 'error' : 'text.secondary'} data-testid="user-login-qr-expiry">
              {expired ? 'This code has expired.' : `Scan with the phone camera. Expires in ${mmss(secondsLeft)}, works once.`}
            </Typography>
            <Alert severity="warning" sx={{ width: '100%' }}>
              Anyone who scans this code signs in as this user. Show it only to them.
            </Alert>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 2, gap: 1 }}>
        <Button variant="outlined" startIcon={<CopyIcon />} onClick={copyLink} disabled={!code || expired} color={copied ? 'success' : 'primary'} sx={{ textTransform: 'none' }}>
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={issue} disabled={loading} sx={{ textTransform: 'none' }}>
          New code
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UserLoginQrDialog;
