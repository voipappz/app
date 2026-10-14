import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, TextField, FormControl, InputLabel, Select, MenuItem,
  Switch, FormControlLabel, Button, Stepper, Step, StepLabel, StepButton,
  Chip, Tooltip, IconButton, Alert, CircularProgress, Checkbox, ListItemText,
  Card, CardActionArea,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import DynamicProfileEditor from '../../common/DynamicProfileEditor/DynamicProfileEditor';
import EventPipelineBuilder from '../EventPipelineBuilder/EventPipelineBuilder';
import WebhookBodyEditor, { fieldsToObject } from '../WebhookBodyEditor';

const STEPS = ['Type', 'Details', 'Triggers', 'Configuration', 'Applications', 'Review'];

// Per-step help shown in the right-hand help panel.
const STEP_HELP = {
  0: { title: 'Pick a service type', body: 'The type decides what the service does and which fields you’ll configure next. It comes from the server and can’t be changed after creation.' },
  1: { title: 'Name your service', body: 'Give it a clear, unique name. Notes are optional.' },
  2: { title: 'When should it run?', body: 'Triggers are the EventStore events the service subscribes to. Pick at least one. What happens next is decided by the service type on the server.' },
  3: { title: 'Type-specific settings', body: 'These fields come from the server for the chosen type (e.g. a webhook needs a URL and method). For webhooks you can also define the body as key/value pairs — values like data.queue_name or call.caller_id_number are filled from the event, anything else is sent as-is.' },
  4: { title: 'Where should it apply?', body: 'Select the applications (environments) this service runs in. With none selected it won’t fire anywhere.' },
  5: { title: 'Review & create', body: 'Check everything below. Click any “Edit” to jump back. Create sends it to the server, which validates it one more time.' },
};

const emptyForm = {
  name: '', type: '', enabled: true, triggers: [],
  environment_uuids: [],
  profile: {}, meta_fields: [], notes: '',
};

/**
 * ServiceWizard — step-by-step, validated service creation. The default create
 * flow for the Services screen. Reuses the same field components as the quick
 * dialog so types/handlers/profile fields all come from the API.
 */
const ServiceWizard = ({ open, onClose, onSave, loading, hookServiceTypes = [], serviceTypeConfigs = {}, canWrite = true }) => {
  const { environments } = useCustomerEnvironment();
  const [active, setActive] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (open) { setActive(0); setForm(emptyForm); setErrors({}); setApiError(''); }
  }, [open]);

  const set = (field, value) => {
    setForm((p) => {
      if (field === 'type' && value !== p.type) {
        const config = serviceTypeConfigs[value] || {};
        return {
          ...p, type: value,
          profile: { ...(config.profile_defaults || {}) },
          triggers: config.managed && Array.isArray(config.triggers) ? [...config.triggers] : [],
        };
      }
      return { ...p, [field]: value };
    });
    if (errors[field]) setErrors((p) => ({ ...p, [field]: null }));
  };

  // Validate a step; returns an errors object (empty = valid).
  const validateStep = (step) => {
    const e = {};
    if (step === 0 && !form.type) e.type = 'Choose a service type';
    if (step === 1 && !form.name.trim()) e.name = 'Service name is required';
    if (step === 2 && (!form.triggers || form.triggers.length === 0)) e.triggers = 'Select at least one trigger';
    return e;
  };

  const stepValid = useMemo(() => Object.keys(validateStep(active)).length === 0, [active, form]);

  const goNext = () => {
    const e = validateStep(active);
    setErrors(e);
    if (Object.keys(e).length === 0) setActive((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => setActive((s) => Math.max(s - 1, 0));
  const goTo = (step) => { if (step < active) setActive(step); };

  const buildPayload = () => {
    let profile = { ...(form.profile || {}) };
    delete profile.code;
    delete profile.handler_type;
    const payload = {
      name: form.name, type: form.type, enabled: form.enabled,
      triggers: form.triggers || [], environment_uuids: form.environment_uuids || [],
      profile, notes: form.notes,
    };
    if (form.type === 'webhook') {
      payload.meta = fieldsToObject(form.meta_fields);
    }
    return payload;
  };

  const handleCreate = async () => {
    // Validate the gating steps one more time before sending.
    const all = { ...validateStep(0), ...validateStep(1), ...validateStep(2) };
    if (Object.keys(all).length) {
      setErrors(all);
      setActive(all.type ? 0 : all.name ? 1 : 2);
      return;
    }
    setApiError('');
    try {
      await onSave(buildPayload());
    } catch (err) {
      setApiError(err?.message || 'Failed to create service');
    }
  };

  const types = hookServiceTypes;
  const typeDesc = (t) => serviceTypeConfigs?.[t]?.description || '';
  const help = STEP_HELP[active];

  const Row = ({ label, value, step }) => (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, py: 0.5, borderBottom: '1px solid var(--theme-border)' }}>
      <Typography variant="caption" sx={{ minWidth: 110, color: 'text.secondary', fontWeight: 600 }}>{label}</Typography>
      <Typography variant="body2" sx={{ flex: 1, wordBreak: 'break-word' }}>{value || '—'}</Typography>
      <Button size="small" sx={{ textTransform: 'none' }} onClick={() => setActive(step)}>Edit</Button>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { height: '88vh', display: 'flex', flexDirection: 'column' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <SettingsIcon color="primary" />
        <Typography variant="h6" sx={{ flex: 1 }}>New Service</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      <Box sx={{ px: 3, pt: 1 }}>
        <Stepper activeStep={active} alternativeLabel>
          {STEPS.map((label, i) => (
            <Step key={label} completed={i < active}>
              <StepButton onClick={() => goTo(i)} disabled={i > active}>
                <StepLabel>{label}</StepLabel>
              </StepButton>
            </Step>
          ))}
        </Stepper>
      </Box>

      <DialogContent dividers sx={{ display: 'flex', gap: 2, flex: 1, overflow: 'hidden' }}>
        {/* Step content */}
        <Box sx={{ flex: 1, overflow: 'auto', pr: 1 }}>
          {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}

          {active === 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1.5 }}>
              {(types || []).map((t) => (
                <Card key={t} variant="outlined"
                  sx={{ borderColor: form.type === t ? 'primary.main' : 'var(--theme-border)', borderWidth: form.type === t ? 2 : 1 }}>
                  <CardActionArea onClick={() => set('type', t)} sx={{ p: 1.5, height: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>{t.replace(/_/g, ' ').toUpperCase()}</Typography>
                      {form.type === t && <CheckCircleIcon color="primary" sx={{ fontSize: 18 }} />}
                    </Box>
                    {typeDesc(t) && <Typography variant="caption" color="text.secondary">{typeDesc(t)}</Typography>}
                  </CardActionArea>
                </Card>
              ))}
              {errors.type && <Typography color="error" variant="caption">{errors.type}</Typography>}
            </Box>
          )}

          {active === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />} label="Enabled" />
              <TextField label="Service Name" value={form.name} onChange={(e) => set('name', e.target.value)}
                error={!!errors.name} helperText={errors.name} required fullWidth autoFocus />
              <TextField label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} multiline rows={2} fullWidth />
            </Box>
          )}

          {active === 2 && (
            <Box>
              <EventPipelineBuilder
                triggers={form.triggers}
                onTriggersChange={(v) => set('triggers', v)}
                serviceType={form.type}
                disabled={loading}
              />
              {errors.triggers && <Typography color="error" variant="caption">{errors.triggers}</Typography>}
            </Box>
          )}

          {active === 3 && (
            form.type ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <DynamicProfileEditor type={form.type} profile={form.profile}
                  onChange={(profile) => set('profile', profile)} disabled={loading}
                  title={`${form.type.replace(/_/g, ' ').toUpperCase()} Configuration`} />
                {form.type === 'webhook' && (
                  <>
                    <WebhookBodyEditor fields={form.meta_fields}
                      onChange={(fields) => set('meta_fields', fields)} disabled={loading} />
                  </>
                )}
              </Box>
            ) : <Alert severity="info">Pick a type first.</Alert>
          )}

          {active === 4 && (
            <FormControl fullWidth>
              <InputLabel>Applications</InputLabel>
              <Select multiple value={form.environment_uuids || []} label="Applications"
                onChange={(e) => set('environment_uuids', e.target.value)}
                renderValue={(sel) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {sel.map((uuid) => <Chip key={uuid} size="small" label={environments?.find((e) => e.uuid === uuid)?.name || uuid} />)}
                  </Box>
                )}>
                {environments?.map((env) => (
                  <MenuItem key={env.uuid} value={env.uuid}>
                    <Checkbox checked={form.environment_uuids?.includes(env.uuid)} />
                    <ListItemText primary={env.name} />
                  </MenuItem>
                ))}
              </Select>
              {(!form.environment_uuids || form.environment_uuids.length === 0) && (
                <Typography variant="caption" color="warning.main" sx={{ mt: 0.5 }}>
                  No applications selected — the service won’t fire anywhere.
                </Typography>
              )}
            </FormControl>
          )}

          {active === 5 && (
            <Box>
              <Row label="Type" value={form.type?.replace(/_/g, ' ').toUpperCase()} step={0} />
              <Row label="Name" value={form.name} step={1} />
              <Row label="Enabled" value={form.enabled ? 'Yes' : 'No'} step={1} />
              <Row label="Triggers" value={(form.triggers || []).join(', ')} step={2} />
              {form.type === 'webhook' && (
                <Row label="Body"
                  value={(form.meta_fields || []).filter((f) => f.key?.trim()).map((f) => `${f.key} = ${f.value}`).join(', ') || 'Full event payload'}
                  step={3} />
              )}
              <Row label="Applications" value={(form.environment_uuids || []).map((u) => environments?.find((e) => e.uuid === u)?.name || u).join(', ')} step={4} />
              <Row label="Notes" value={form.notes} step={1} />
            </Box>
          )}
        </Box>

        {/* Help panel */}
        <Box sx={{ width: 220, flexShrink: 0, p: 1.5, borderRadius: '8px', bgcolor: 'var(--theme-bg-secondary)', alignSelf: 'flex-start' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <HelpOutlineIcon sx={{ fontSize: 16, color: 'var(--accent-primary)' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{help.title}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">{help.body}</Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={goBack} disabled={active === 0 || loading}>Back</Button>
        {active < STEPS.length - 1 ? (
          <Tooltip title={stepValid ? '' : 'Complete this step to continue'}>
            <span>
              <Button variant="contained" onClick={goNext} disabled={!stepValid || loading}>Next</Button>
            </span>
          </Tooltip>
        ) : (
          <Button variant="contained" color="success" onClick={handleCreate} disabled={!canWrite || loading}
            startIcon={loading ? <CircularProgress size={18} /> : null}>
            Create Service
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ServiceWizard;
