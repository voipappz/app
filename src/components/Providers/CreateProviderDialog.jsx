import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, TextField,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { getCreatableProviderTypes } from '../../services/api/providersApi';

const emptyForm = { name: '', type: '', tariff_uuid: '', notes: '', profile: {} };
const defaultsFor = (fields = []) => Object.fromEntries(
  fields.filter((field) => field.default != null).map((field) => [field.key, field.default])
);

export default function CreateProviderDialog({ open, onClose, onSave, loading, providerTypes = [], allTariffs = [], canWrite = true }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (open) { setForm(emptyForm); setError(''); setErrors({}); }
  }, [open]);

  const types = useMemo(() => getCreatableProviderTypes(providerTypes).map((type) => (
    typeof type === 'string' ? { value: type, label: type.toUpperCase(), fields: [] } : type
  )), [providerTypes]);
  const selectedType = types.find((type) => type.value === form.type);
  const serviceField = selectedType?.service_field;
  const service = selectedType?.services?.[form.profile[serviceField]];
  const fields = [...new Map([...(selectedType?.fields || []), ...(service?.fields || [])]
    .map((field) => [field.key, field])).values()];
  const hasTariff = ['sip', 'did'].includes(form.type);

  const chooseType = (value) => {
    const type = types.find((item) => item.value === value);
    setForm((previous) => ({ ...previous, type: value, tariff_uuid: '', profile: defaultsFor(type?.fields) }));
    setErrors({});
  };
  const chooseService = (value) => {
    // Keep only common fields when switching services; never send stale credentials.
    const common = Object.fromEntries((selectedType.fields || []).filter((field) => field.key in form.profile)
      .map((field) => [field.key, form.profile[field.key]]));
    setForm((previous) => ({ ...previous, profile: {
      ...defaultsFor(selectedType.fields), ...common,
      ...defaultsFor(selectedType.services[value]?.fields), [serviceField]: value,
    } }));
    setErrors({});
  };
  const submit = async (event) => {
    event.preventDefault();
    if (loading || !canWrite) return;
    const next = {};
    if (!selectedType) next.type = 'Choose a provider type';
    if (!form.name.trim()) next.name = 'Enter a provider name';
    if (serviceField && !service) next[serviceField] = 'Choose a service';
    fields.forEach((field) => {
      if (field.required && !String(form.profile[field.key] ?? '').trim()) next[field.key] = `${field.label || field.key} is required`;
    });
    setErrors(next);
    if (Object.keys(next).length) return;
    setError('');
    try {
      await onSave({ name: form.name.trim(), type: form.type, notes: form.notes, profile: form.profile,
        ...(hasTariff && form.tariff_uuid ? { tariff_uuid: form.tariff_uuid } : {}) });
    } catch (err) { setError(err.response?.data?.message || err?.message || 'Failed to create provider'); }
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={submit} noValidate>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Create Provider
          <IconButton aria-label="Close" onClick={onClose} disabled={loading}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {!types.length && <Alert severity="info">No provider types are available from the server.</Alert>}
          <TextField select fullWidth label="Provider type" required value={form.type}
            onChange={(event) => chooseType(event.target.value)} disabled={loading || !types.length}
            error={Boolean(errors.type)} helperText={errors.type || selectedType?.description}>
            {types.map((type) => <MenuItem key={type.value} value={type.value}>{type.label || type.value}</MenuItem>)}
          </TextField>
          <TextField fullWidth label="Name" required value={form.name} disabled={loading}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            error={Boolean(errors.name)} helperText={errors.name} />
          {serviceField && (
            <TextField select fullWidth label="Service" required value={form.profile[serviceField] || ''}
              onChange={(event) => chooseService(event.target.value)} disabled={loading}
              error={Boolean(errors[serviceField])} helperText={errors[serviceField]}>
              {Object.entries(selectedType.services || {}).map(([value, spec]) => (
                <MenuItem key={value} value={value}>{spec.label || value}</MenuItem>
              ))}
            </TextField>
          )}
          {fields.map((field) => (
            <TextField key={`${form.type}-${field.key}`} fullWidth label={field.label || field.key}
              required={Boolean(field.required)} disabled={loading} value={form.profile[field.key] ?? ''}
              type={field.secret || field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
              multiline={field.type === 'text'} minRows={field.type === 'text' ? 2 : undefined}
              autoComplete={field.secret ? 'new-password' : 'off'}
              error={Boolean(errors[field.key])} helperText={errors[field.key] || field.description}
              onChange={(event) => setForm({ ...form, profile: { ...form.profile, [field.key]: event.target.value } })} />
          ))}
          {hasTariff && <TextField select fullWidth label="Tariff" value={form.tariff_uuid} disabled={loading}
            onChange={(event) => setForm({ ...form, tariff_uuid: event.target.value })}>
            <MenuItem value="">None</MenuItem>
            {allTariffs.map((tariff) => <MenuItem key={tariff.uuid} value={tariff.uuid}>{tariff.name}</MenuItem>)}
          </TextField>}
          <TextField fullWidth label="Notes" multiline minRows={2} value={form.notes} disabled={loading}
            onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading || !canWrite || !selectedType}
            startIcon={loading ? <CircularProgress size={18} /> : null}>Create Provider</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
