// CallToast — the incoming-call card (green slide-in card with Answer / Reject),
// non-blocking rather than a modal dialog. Where it sits is the call dock's
// (CallDock.jsx), which keeps it above every page and dialog.
import { useTranslation } from 'react-i18next';
import { Box, Slide, Typography, Button, IconButton, useTheme } from '@mui/material';
import CallIcon from '@mui/icons-material/Call';
import CallEndIcon from '@mui/icons-material/CallEnd';
import CloseIcon from '@mui/icons-material/Close';
import Bdi from '../../i18n/Bdi';

const GREEN = '#367823';
const PINK_BTN = {
  border: '1px solid #fff', color: '#fff', borderRadius: '10px', textTransform: 'none',
  fontWeight: 700, px: 1.5, '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.12)' }
};

export default function CallToast({ open, title, number, onAnswer, onReject, onClose }) {
  const { t } = useTranslation('phone');
  const isRtl = useTheme().direction === 'rtl';
  return (
    <Slide direction={isRtl ? 'right' : 'left'} in={open} mountOnEnter unmountOnExit>
      <Box
        role="alert"
        sx={{
          position: 'relative', width: '100%',
          bgcolor: GREEN, color: '#fff', borderRadius: '3px', p: 1.25,
          boxShadow: '0 6px 20px rgba(0,0,0,0.3)', pointerEvents: 'all'
        }}
        data-testid="call-toast"
      >
        <IconButton size="small" onClick={onClose} sx={{ position: 'absolute', top: 2, insetInlineEnd: 2, color: '#fff', opacity: 0.85 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', pe: 3 }}>{title}</Typography>
        <Typography sx={{ fontSize: '1.1rem', mb: 1.25, mt: 0.25, overflowWrap: 'anywhere' }}><Bdi>{number}</Bdi></Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'flex-end' }}>
          <Button size="small" startIcon={<CallEndIcon />} onClick={onReject} sx={PINK_BTN}>{t('toast.reject')}</Button>
          <Button size="small" startIcon={<CallIcon />} onClick={onAnswer} sx={{ ...PINK_BTN, bgcolor: 'rgba(255,255,255,0.15)' }}>{t('toast.answer')}</Button>
        </Box>
      </Box>
    </Slide>
  );
}
