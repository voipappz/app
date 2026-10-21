import React, { useState } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Divider
} from '@mui/material';
import {
  MoreVert,
  Phone,
  PersonAdd,
  Note,
  ContentCopy,
  History,
  Block,
  LockOpen
} from '@mui/icons-material';
import { useCallNumber } from '../../../hooks/useCallNumber';
import { useNotification } from '../../../context/NotificationContext';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog as Dialog, useConfirm } from '../../ui';
import { callsApi } from '../../../services/api/callsApi';
import { isolated } from '../../Phone/isolated';
import { callFacts } from '../CallLogRow/callDirection';

/**
 * Block or unblock the number of a call's other party (the caller of an
 * incoming call, the callee of an outgoing one — the server picks it).
 * Whether it is blocked is the server's word: the call's `blacklisted`.
 * Blocking asks first; the outcome is told either way, and `onChanged` (the
 * screen's refresh) then brings the new state back from the server.
 * Used by the row's ⋮ menu, the call panel, and the phone's row and details page.
 */
export function useNumberBlock({ call, onChanged }) {
  const { t } = useTranslation('calls');
  const { showNotification } = useNotification();
  const confirm = useConfirm();
  const blocked = call?.blacklisted === true;
  const number = isolated(callFacts(call).number);

  const toggle = async () => {
    const block = !blocked;
    if (block && !(await confirm({
      title: t('block.confirmTitle'),
      message: t('block.confirmMessage', { number }),
      description: null,
      confirmLabel: t('block.block'),
    }))) return;
    try {
      await callsApi.setNumberBlocked(call.uuid || call.id, block);
      showNotification(t(block ? 'block.blocked' : 'block.unblocked', { number }), 'success');
      onChanged?.();
    } catch {
      showNotification(t('block.failed', { number }), 'error');
    }
  };

  return { blocked, toggle };
}

// The ⋮ menu of a call row: call back, copy, contact, note, history, block.
// `call` is the row as the API sends it.
const CallActions = ({ call, onAddNote, onBlockChanged }) => {
  const { t } = useTranslation('calls');
  const [anchorEl, setAnchorEl] = useState(null);
  const [noteDialog, setNoteDialog] = useState(false);
  const [noteText, setNoteText] = useState('');

  const callNumber = useCallNumber();
  const { showNotification } = useNotification();
  // The other party, the same for every action: who called in, or who was called.
  const { number } = callFacts(call);
  const { blocked, toggle: toggleBlock } = useNumberBlock({ call, onChanged: onBlockChanged });

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleCallback = () => {
    // The phone opens on the right with the number in its dialpad.
    if (number) callNumber(number);
    handleMenuClose();
  };

  const handleCopyNumber = () => {
    if (number) {
      navigator.clipboard.writeText(number);
      showNotification(t('actions.copied', { number: isolated(number) }), 'success');
    }
    handleMenuClose();
  };

  const handleAddContact = () => {
    // This would integrate with a contacts system
    showNotification(t('actions.contactsSoon'), 'info');
    handleMenuClose();
  };

  const handleAddNote = () => {
    setNoteDialog(true);
    handleMenuClose();
  };

  const handleSaveNote = () => {
    if (noteText.trim()) {
      onAddNote?.(call.uuid || call.id, noteText.trim());
      showNotification(t('actions.noteAdded'), 'success');
      setNoteText('');
    }
    setNoteDialog(false);
  };

  const handleShowHistory = () => {
    // This would filter the calls list to show only calls from/to this number
    showNotification(t('actions.showingHistory', { number: isolated(number) }), 'info');
    handleMenuClose();
  };

  const handleToggleBlock = () => {
    handleMenuClose();
    toggleBlock();
  };

  return (
    <>
      <Tooltip title={t('actions.menu')}>
        <IconButton size="small" onClick={handleMenuOpen} aria-label={t('actions.menu')}>
          <MoreVert />
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: { minWidth: 180 }
        }}
      >
        <MenuItem onClick={handleCallback}>
          <ListItemIcon>
            <Phone fontSize="small" color="primary" />
          </ListItemIcon>
          <ListItemText primary={t('actions.callBack')} />
        </MenuItem>

        <MenuItem onClick={handleCopyNumber}>
          <ListItemIcon>
            <ContentCopy fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('actions.copyNumber')} />
        </MenuItem>

        <MenuItem onClick={handleAddContact}>
          <ListItemIcon>
            <PersonAdd fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('actions.addContact')} />
        </MenuItem>

        <MenuItem onClick={handleAddNote}>
          <ListItemIcon>
            <Note fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('actions.addNote')} />
        </MenuItem>

        <MenuItem onClick={handleShowHistory}>
          <ListItemIcon>
            <History fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('actions.showHistory')} />
        </MenuItem>

        {number && <Divider />}
        {number && (
          <MenuItem onClick={handleToggleBlock} sx={blocked ? undefined : { color: 'error.main' }}>
            <ListItemIcon>
              {blocked ? <LockOpen fontSize="small" /> : <Block fontSize="small" color="error" />}
            </ListItemIcon>
            <ListItemText primary={blocked ? t('block.unblockNumber') : t('block.blockNumber')} />
          </MenuItem>
        )}
      </Menu>

      {/* Add Note Dialog: full screen on a phone */}
      <Dialog open={noteDialog} onClose={() => setNoteDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('actions.addNote')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('actions.note')}
            fullWidth
            multiline
            rows={4}
            variant="outlined"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={t('actions.notePlaceholder', { number: number ? isolated(number) : t('actions.unknown') })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNoteDialog(false)}>{t('actions.cancel')}</Button>
          <Button onClick={handleSaveNote} variant="contained" disabled={!noteText.trim()}>
            {t('actions.saveNote')}
          </Button>
        </DialogActions>
      </Dialog>

    </>
  );
};

export default CallActions;
