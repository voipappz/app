import { useEffect, useState } from 'react';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Switch, TextField,
} from '@mui/material';
import { providersApi } from '../../../services/api/providersApi';
import { Z } from '../../../utils/zIndex.js';

const SipProviderEditDialog = ({ providerUuid, onClose, onSaved, canWrite }) => {
  const [form, setForm] = useState(null);
  const [fields, setFields] = useState([]);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([providersApi.getProvider(providerUuid), providersApi.getProviderTypes()])
      .then(([response, types]) => {
        if (!active) return;
        const provider = response?.data?.uuid ? response.data : response;
        const specification = types.find(type => type.value === 'sip');
        if (provider?.type !== 'sip' || !specification?.fields?.length) {
          throw new Error('Unable to load the SIP provider and its fields. Close and reopen to retry.');
        }
        const profile = typeof provider.profile === 'string' ? JSON.parse(provider.profile) : provider.profile;
        setForm({ uuid: provider.uuid, name: provider.name || '', notes: provider.notes || '',
          enabled: provider.enabled !== false, profile: profile || {} });
        setFields(specification.fields);
      })
      .catch(err => { if (active) setError(err?.message || 'Unable to load SIP provider'); });
    return () => { active = false; };
  }, [providerUuid]);

  const save = async () => {
    if (!form || saving || !canWrite) return;
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Name is required';
    fields.forEach(field => {
      if (field.required && !String(form.profile[field.key] ?? '').trim()) {
        nextErrors[field.key] = `${field.label || field.key} is required`;
      }
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    setError('');
    try {
      const { uuid, ...changes } = form;
      const response = await providersApi.updateProvider(uuid, { ...changes, name: form.name.trim() });
      const updated = response?.data?.uuid ? response.data : response;
      onSaved({ ...form, ...updated, uuid });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Unable to update SIP provider');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth sx={{ zIndex: Z.L2.DIALOG }}>
      <DialogTitle>Edit SIP provider</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!form && !error && <CircularProgress aria-label="Loading SIP provider" />}
        {form && <>
          <TextField label="Provider name" required value={form.name} disabled={saving || !canWrite}
            onChange={event => setForm({ ...form, name: event.target.value })}
            error={Boolean(errors.name)} helperText={errors.name} />
          <FormControlLabel label="Enabled" control={<Switch checked={form.enabled} disabled={saving || !canWrite}
            onChange={event => setForm({ ...form, enabled: event.target.checked })} />} />
          {fields.map(field => (
            <TextField key={field.key} label={field.label || field.key} required={Boolean(field.required)}
              value={form.profile[field.key] ?? ''} disabled={saving || !canWrite}
              type={field.secret || field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
              autoComplete={field.secret || field.type === 'password' ? 'new-password' : 'off'}
              error={Boolean(errors[field.key])} helperText={errors[field.key] || field.description}
              onChange={event => setForm({ ...form, profile: { ...form.profile, [field.key]: event.target.value } })} />
          ))}
          <TextField label="Notes" multiline minRows={2} value={form.notes} disabled={saving || !canWrite}
            onChange={event => setForm({ ...form, notes: event.target.value })} />
        </>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!form || saving || !canWrite}
          startIcon={saving ? <CircularProgress size={16} /> : null}>Update provider</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SipProviderEditDialog;
