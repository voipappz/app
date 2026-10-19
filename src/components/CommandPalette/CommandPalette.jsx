import { lazy, Suspense, useRef } from 'react';
import { Box, CircularProgress, Dialog, DialogTitle, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useGlobalSearchResults } from './useGlobalSearchResults';
import SearchResults from './SearchResults';
import './CommandPalette.css';

const AIChat = lazy(() => import('../AIChat/AIChat.jsx'));

// ⌘K / Ctrl+K / `/` open the global SEARCH: a top-anchored dialog with one
// input, type chips, and grouped results (useGlobalSearchResults +
// SearchResults). The assistant stays one Enter away: the `Ask: "…"` quick
// action swaps the body to AIChat with the typed question, and the back arrow
// returns to the results. The MCP developer workspace stays at /mcp.
const CommandPalette = ({ open, onClose, initialQuery = '' }) => {
  const { t } = useTranslation('search');
  const search = useGlobalSearchResults({ open, initialQuery, onClose });
  const inputRef = useRef(null);
  const asking = search.asking;

  const clear = () => {
    search.setQuery('');
    inputRef.current?.focus();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="command-palette-overlay"
      maxWidth={asking ? 'lg' : 'sm'}
      fullWidth
      aria-label={asking ? t('assistant') : t('title')}
      PaperProps={{
        className: 'command-palette-paper',
        sx: asking ? { height: '85dvh', display: 'flex', flexDirection: 'column' } : undefined,
      }}
      slotProps={{ backdrop: { sx: { backgroundColor: 'rgba(0, 0, 0, 0.3)' } } }}
      // autoFocus covers the first open; a reopen (`/` after Esc) found the
      // input unfocused and the keystrokes went to the page behind it.
      TransitionProps={{ onEntered: () => inputRef.current?.focus() }}
    >
      {asking ? (
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, px: 1 }}>
            <IconButton aria-label={t('back')} onClick={search.back}>
              <ArrowBackIcon sx={{ '[dir="rtl"] &': { transform: 'scaleX(-1)' } }} />
            </IconButton>
            <Typography component="span" variant="subtitle1" noWrap sx={{ flex: 1, minWidth: 0 }} title={asking}>
              {asking}
            </Typography>
            <IconButton aria-label={t('close')} onClick={onClose}><CloseIcon /></IconButton>
          </DialogTitle>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <Suspense fallback={<CircularProgress sx={{ m: 'auto', display: 'block', mt: 4 }} />}>
              <AIChat initialQuestion={asking} />
            </Suspense>
          </Box>
        </>
      ) : (
        <>
          <Box sx={{ p: '12px 12px 0' }}>
            <TextField
              inputRef={inputRef}
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              onKeyDown={search.handleKeyDown}
              placeholder={t('placeholder')}
              variant="outlined"
              size="small"
              fullWidth
              autoFocus
              inputProps={{ 'aria-label': t('title'), autoComplete: 'off', spellCheck: false }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 22, color: 'var(--theme-text-secondary)' }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end" sx={{ gap: 0.5 }}>
                    {search.resourceLoading && <CircularProgress size={16} />}
                    {search.query ? (
                      <IconButton size="small" aria-label={t('clear')} onClick={clear} edge="end">
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    ) : (
                      <kbd className="command-palette-kbd" onClick={onClose}>Esc</kbd>
                    )}
                  </InputAdornment>
                ),
                sx: {
                  height: 44,
                  borderRadius: '10px',
                  fontSize: '1rem',
                  '& .MuiOutlinedInput-input': { py: 0, height: 44, boxSizing: 'border-box' },
                },
              }}
            />
          </Box>
          <SearchResults search={search} />
        </>
      )}
    </Dialog>
  );
};

export default CommandPalette;
