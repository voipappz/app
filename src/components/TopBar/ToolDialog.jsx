import { useId, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { GlobalSearchProvider } from '../../context/GlobalSearchContext';

// Resizing changes only the paper, keeping the screen and its filters mounted.
export default function ToolDialog({ title, open, onClose, confirmClose = false, children }) {
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
        <DialogTitle id={`${titleId}-header`} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, pr: 1 }}>
          <Typography id={titleId} component="span" variant="h6" sx={{ flex: 1 }}>{title}</Typography>
          <Tooltip title={fullscreen ? 'Restore size' : 'Expand to fullscreen'}>
            <IconButton aria-label={fullscreen ? 'Restore size' : 'Expand to fullscreen'} onClick={() => setFullscreen(value => !value)}>
              {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Tooltip>
          <IconButton aria-label={`Close ${title}`} onClick={requestClose}><CloseIcon /></IconButton>
        </DialogTitle>
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {open && <GlobalSearchProvider>{children}</GlobalSearchProvider>}
        </Box>
      </Dialog>
      <Dialog open={open && closing} onClose={() => setClosing(false)} aria-label={`Close ${title}?`}>
        <DialogTitle>Close {title}?</DialogTitle>
        <DialogContent>Any unsaved edits will be lost. Keep this tool open to finish editing.</DialogContent>
        <DialogActions>
          <Button onClick={() => setClosing(false)} autoFocus>Keep editing</Button>
          <Button onClick={close}>Close tool</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
