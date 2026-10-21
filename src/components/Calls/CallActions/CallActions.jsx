import React, { useState } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button
} from '@mui/material';
import {
  MoreVert,
  Phone,
  PersonAdd,
  Note,
  ContentCopy,
  History
} from '@mui/icons-material';
import { useCallNumber } from '../../../hooks/useCallNumber';
import { useNotification } from '../../../context/NotificationContext';
import { useTranslation } from 'react-i18next';

const CallActions = ({ call, onAddNote }) => {
  const { t } = useTranslation('calls');
  const [anchorEl, setAnchorEl] = useState(null);
  const [noteDialog, setNoteDialog] = useState(false);
  const [noteText, setNoteText] = useState('');
  
  const callNumber = useCallNumber();
  const { showNotification } = useNotification();
  
  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleCallback = () => {
    if (call.caller_number || call.destination_number) {
      const numberToCall = call.direction === 'inbound' ? call.caller_number : call.destination_number;
      
      // The phone opens on the right with the number in its dialpad.
      callNumber(numberToCall);
    }
    handleMenuClose();
  };

  const handleCopyNumber = () => {
    const numberToCopy = call.caller_number || call.destination_number;
    if (numberToCopy) {
      navigator.clipboard.writeText(numberToCopy);
      showNotification(t('actions.copied', { number: numberToCopy }), 'success');
    }
    handleMenuClose();
  };

  const handleAddContact = () => {
    // This would integrate with a contacts system
    const number = call.caller_number || call.destination_number;
    console.log('👤 Add to contacts:', number);
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
    const number = call.caller_number || call.destination_number;
    console.log('📋 Show history for:', number);
    // This would filter the calls list to show only calls from/to this number
    showNotification(t('actions.showingHistory', { number }), 'info');
    handleMenuClose();
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
      </Menu>

      {/* Add Note Dialog */}
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
            placeholder={t('actions.notePlaceholder', { number: call.caller_number || call.destination_number || t('actions.unknown') })}
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
