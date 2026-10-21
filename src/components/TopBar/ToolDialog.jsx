import { useId, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { useTranslation } from 'react-i18next';
import { GlobalSearchProvider } from '../../context/GlobalSearchContext';

// Resizing changes only the paper, keeping the screen and its filters mounted.
export default function ToolDialog({ title, open, onClose, confirmClose = false, children }) {
  const { t } = useTranslation();
  const titleId = useId();
  const [fullscreen, setFullscreen] = useState(false);
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(false); setFullscreen(false); onClose(); };
  const requestClose = () => confirmClose ? setClosing(true) : close();

  return (
    <>
      <Dialog
        open={open}
        onClose={(_, reason) => { if (reason !== 'backdropClick') requestClose(); }}
        fullScreen={fullscreen}
        maxWidth="xl"
        fullWidth
        aria-labelledby={titleId}
        PaperProps={{ sx: { height: fullscreen ? '100%' : '90dvh', display: 'flex', flexDirection: 'column' } }}
      >
        <DialogTitle id={`${titleId}-header`} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, pe: 1 }}>
          <Typography id={titleId} component="span" variant="h6" sx={{ flex: 1 }}>{title}</Typography>
          <Tooltip title={fullscreen ? t('toolDialog.restore') : t('toolDialog.expand')}>
            <IconButton aria-label={fullscreen ? t('toolDialog.restore') : t('toolDialog.expand')} onClick={() => setFullscreen(value => !value)}>
              {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Tooltip>
          <IconButton aria-label={t('toolDialog.close', { title })} onClick={requestClose}><CloseIcon /></IconButton>
        </DialogTitle>
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {open && <GlobalSearchProvider>{children}</GlobalSearchProvider>}
        </Box>
      </Dialog>
      <Dialog open={open && closing} onClose={() => setClosing(false)} aria-label={t('toolDialog.confirmTitle', { title })}>
        <DialogTitle>{t('toolDialog.confirmTitle', { title })}</DialogTitle>
        <DialogContent>{t('toolDialog.confirmBody')}</DialogContent>
        <DialogActions>
          <Button onClick={() => setClosing(false)} autoFocus>{t('toolDialog.keepEditing')}</Button>
          <Button onClick={close}>{t('toolDialog.closeTool')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
