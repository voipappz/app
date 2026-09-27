import { lazy, Suspense } from 'react';
import { Box, CircularProgress, Dialog, DialogTitle, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import './CommandPalette.css';

const McpWorkspace = lazy(() => import('../ApiDocs/McpWorkspace.jsx'));

// ⌘K opens the MCP workspace — the assistant, quick connect and the tool
// console, everything MCP in one place — and for now nothing else. Resource
// search and the quick actions (useGlobalSearchResults) are kept aside.
const CommandPalette = ({ open, onClose, initialQuery = '' }) => (
  <Dialog
    open={open}
    onClose={onClose}
    maxWidth="lg"
    fullWidth
    aria-label="MCP"
    PaperProps={{ sx: { height: '90dvh', display: 'flex', flexDirection: 'column' } }}
    slotProps={{ backdrop: { sx: { backgroundColor: 'rgba(0, 0, 0, 0.3)' } } }}
  >
    <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, pr: 1 }}>
      <Typography component="span" variant="h6" sx={{ flex: 1 }}>MCP</Typography>
      <IconButton aria-label="Close MCP" onClick={onClose}><CloseIcon /></IconButton>
    </DialogTitle>
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {open && (
        <Suspense fallback={<CircularProgress sx={{ m: 'auto' }} />}>
          <McpWorkspace initialQuestion={initialQuery} />
        </Suspense>
      )}
    </Box>
  </Dialog>
);

export default CommandPalette;
