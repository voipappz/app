// Toaster — the app-wide toast surface. Presentational only: it renders the
// queue it is handed (see context/ToastContext.jsx for the queue itself).
//
// The visual language is deliberately CallToast's — flat coloured card, 3px
// radius, white text, small close button in the inline-end corner — so the app
// has ONE toast idiom. What differs is the corner: the incoming-call toast owns
// the top inline-end (top: 76), so notifications stack from the BOTTOM inline-end
// and the two can never cover each other.
import { Box, Slide, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { useDirection } from '../../context/DirectionContext';

// Card background per level. 'success'/'info' reuse the call toast's green and
// the phone dock's header slate, so nothing new enters the palette.
const LEVEL_BG = {
  error: '#8f2a1e',
  exception: '#8f2a1e',
  critical: '#8f2a1e',
  fatal: '#8f2a1e',
  alert: '#8f2a1e',
  warning: '#8a5a00',
  success: '#367823',
  info: '#2f3640',
};

export default function Toaster({ toasts = [], onDismiss }) {
  const { t } = useTranslation();
  const { isRTL } = useDirection();
  if (!toasts.length) return null;

  // Slide in from the edge the stack is pinned to, which flips with direction.
  const slideFrom = isRTL ? 'right' : 'left';

  return (
    <Box
      aria-label={t('notifications.toasts', 'Notifications')}
      data-testid="toaster"
      sx={{
        // Notifications should not cover a modal editor or the full-screen
        // dashboard builder. They remain above the normal app shell.
        position: 'fixed', insetBlockEnd: 16, insetInlineEnd: 16,
        zIndex: (theme) => theme.zIndex.modal - 1,
        display: 'flex', flexDirection: 'column', gap: 1,
        pointerEvents: 'none',   // the page stays clickable between cards
      }}
    >
      {toasts.map((toast) => (
        <Slide key={toast.id} direction={slideFrom} in mountOnEnter unmountOnExit>
          <Box
            role={toast.sticky ? 'alert' : 'status'}
            data-testid="notification-toast"
            data-level={toast.level}
            sx={{
              width: 300, maxWidth: '92vw', position: 'relative',
              bgcolor: LEVEL_BG[toast.level] || LEVEL_BG.info, color: '#fff',
              borderRadius: '3px', p: 1.25,
              boxShadow: '0 6px 20px rgba(0,0,0,0.3)', pointerEvents: 'all',
            }}
          >
            <IconButton
              size="small"
              onClick={() => onDismiss?.(toast.id)}
              aria-label={t('notifications.dismiss', 'Dismiss')}
              data-testid="notification-toast-close"
              sx={{ position: 'absolute', top: 2, insetInlineEnd: 2, color: '#fff', opacity: 0.85 }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', paddingInlineEnd: '24px' }}>
              {toast.title || t('notifications.title', 'Notification')}
            </Typography>
            {toast.body && (
              <Typography sx={{ fontSize: '0.8rem', mt: 0.25, opacity: 0.9 }}>{toast.body}</Typography>
            )}
          </Box>
        </Slide>
      ))}
    </Box>
  );
}
