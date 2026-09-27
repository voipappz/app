import { lazy, Suspense } from 'react';
import { Box, CircularProgress, Dialog, DialogTitle, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import './CommandPalette.css';

const AIChat = lazy(() => import('../AIChat/AIChat.jsx'));

// ⌘K opens the assistant chat (AIChat: sessions, streaming, and the MCP tools
// of whoever is signed in via /api/vmls/generate mode=mcp) — and for now
// nothing else. The MCP developer workspace stays at /mcp.
const CommandPalette = ({ open, onClose }) => (
  <Dialog
    open={open}
    onClose={onClose}
    maxWidth="lg"
    fullWidth
    aria-label="Assistant"
    PaperProps={{ sx: { height: '85dvh', display: 'flex', flexDirection: 'column' } }}
    slotProps={{ backdrop: { sx: { backgroundColor: 'rgba(0, 0, 0, 0.3)' } } }}
  >
    <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, pr: 1 }}>
      <Typography component="span" variant="h6" sx={{ flex: 1 }}>Assistant</Typography>
      <IconButton aria-label="Close assistant" onClick={onClose}><CloseIcon /></IconButton>
    </DialogTitle>
    <Box sx={{ flex: 1, minHeight: 0 }}>
      {open && (
        <Suspense fallback={<CircularProgress sx={{ m: 'auto', display: 'block', mt: 4 }} />}>
          <AIChat />
        </Suspense>
      )}
    </Box>
  </Dialog>
);

export default CommandPalette;
