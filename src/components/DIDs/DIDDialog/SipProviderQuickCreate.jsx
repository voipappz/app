import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Alert, CircularProgress,
} from '@mui/material';
import { providersApi } from '../../../services/api/providersApi';
import { Z } from '../../../utils/zIndex.js';

// The API's Provider name rule (lib/models/provider.rb).
const NAME_FORMAT = /^[0-9a-zA-Z ֐-׿_-]+$/;

/**
 * Create a SIP provider from inside a trunk route, the way a queue or IVR is
 * created from a route's destination. Only what a trunk needs: where the
 * peer is (address + port, 5060 by default). Tariffs, codecs and the rest
 * stay on the Providers screen.
 */
const SipProviderQuickCreate = ({ open, onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', address: '', port: '5060' });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    setErrors(prev => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    else if (!NAME_FORMAT.test(form.name.trim())) e.name = 'Letters, digits, spaces, - and _ only';
    if (!form.address.trim()) e.address = 'Address is required: without one the call goes nowhere';
    if (form.port && !/^\d{1,5}$/.test(form.port)) e.port = 'A port number';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    setApiError('');
    try {
      const created = await providersApi.createProvider({
        type: 'sip',
        name: form.name.trim(),
        enabled: true,
        profile: { address: form.address.trim(), port: form.port || '5060' },
      });
      onCreated(created?.data || created);
      setForm({ name: '', address: '', port: '5060' });
    } catch (err) {
      setApiError(err?.response?.data?.message || err?.message || 'Failed to create SIP provider');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth
      sx={{ zIndex: Z.L2.DIALOG }} data-testid="sip-provider-quick-create">
      <DialogTitle>New SIP provider</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {apiError && <Alert severity="error">{apiError}</Alert>}
        <TextField label="Name" value={form.name} onChange={set('name')} required autoFocus
          error={!!errors.name} helperText={errors.name || 'e.g. PBX2 or Carrier IL'} />
        <TextField label="Address" value={form.address} onChange={set('address')} required
          error={!!errors.address} helperText={errors.address || 'IP or host the call is sent to'}
          placeholder="192.0.2.10" />
        <TextField label="Port" value={form.port} onChange={set('port')}
          error={!!errors.port} helperText={errors.port || 'SIP port, 5060 by default'}
          inputProps={{ inputMode: 'numeric' }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : null}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SipProviderQuickCreate;
