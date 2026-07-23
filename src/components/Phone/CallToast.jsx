// CallToast — incoming-call toast, modeled on the va-voipbox-portal `call-toast`
// component (green slide-in card with Answer / Reject), replacing the modal
// dialog so an inbound call is non-blocking and matches the old portal UX.
import { Box, Slide, Typography, Button, IconButton } from '@mui/material';
import CallIcon from '@mui/icons-material/Call';
import CallEndIcon from '@mui/icons-material/CallEnd';
import CloseIcon from '@mui/icons-material/Close';

const GREEN = '#367823';        // the portal's call-toast background
const PINK_BTN = {              // the portal's .btn-pink outline button
  border: '1px solid #fff', color: '#fff', borderRadius: '10px', textTransform: 'none',
  fontWeight: 700, px: 1.5, '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.12)' },
};

export default function CallToast({ open, title, number, onAnswer, onReject, onClose }) {
  return (
    <Slide direction="left" in={open} mountOnEnter unmountOnExit>
      <Box
        role="alert"
        sx={{
          position: 'fixed', top: 76, right: 16, zIndex: 1400, width: 300, maxWidth: '92vw',
          bgcolor: GREEN, color: '#fff', borderRadius: '3px', p: 1.25,
          boxShadow: '0 6px 20px rgba(0,0,0,0.3)', pointerEvents: 'all',
        }}
        data-testid="call-toast"
      >
        <IconButton size="small" onClick={onClose} sx={{ position: 'absolute', top: 2, insetInlineEnd: 2, color: '#fff', opacity: 0.85 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', pr: 3 }}>{title}</Typography>
        <Typography sx={{ direction: 'ltr', fontSize: '1.1rem', mb: 1.25, mt: 0.25 }}>{number}</Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button size="small" startIcon={<CallEndIcon />} onClick={onReject} sx={PINK_BTN}>Reject</Button>
          <Button size="small" startIcon={<CallIcon />} onClick={onAnswer} sx={{ ...PINK_BTN, bgcolor: 'rgba(255,255,255,0.15)' }}>Answer</Button>
        </Box>
      </Box>
    </Slide>
  );
}
