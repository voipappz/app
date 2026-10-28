import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  IconButton, InputLabel, Link, MenuItem, Select, Skeleton, Snackbar, TextField, Typography,
} from '@mui/material';
import { AccountTree as CallConditionIcon, Close as CloseIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog as Dialog } from '../../ui';
import { useCustomerEnvironment } from '../../../context/CustomerEnvironmentContext';
import { useIsUserSession } from '../../../hooks/useIsUserSession';
import { Z, menuProps } from '../../../utils/zIndex.js';
import WeekHoursEditor, { WeekSummary } from './WeekHoursEditor';
import DestinationPicker from './DestinationPicker';
import MoreRules from './MoreRules';
import { saveCallCondition, useCallConditionForm, useDestinations } from './useCallConditionForm';
import { isValidName, tidyName, validateForm } from './callConditionSchedule';

// What marks a problem on the page: an invalid field, a field's error text,
// a rule card or a save message flagged with data-problem.
const PROBLEM = '[aria-invalid="true"], .Mui-error, [data-problem]';
const TYPABLE = 'input:not([type="hidden"]):not([aria-hidden="true"]), textarea, [role="combobox"]';

// Brings the first problem on the page into view and puts the cursor in it,
// so a Save that could not go through never leaves its reason off screen.
function showFirstProblem(container) {
  const first = container?.querySelector(PROBLEM);
  if (!first) return;
  first.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  const box = first.closest('.MuiFormControl-root, [data-problem]') || first;
  const field = box.matches(TYPABLE) ? box : box.querySelector(TYPABLE);
  field?.focus({ preventScroll: true });
}

/**
 * A call condition, edited as business hours: which days and hours you are
 * open, where calls go while open and otherwise, and any rules checked before
 * that. One page for creating and editing, for accounts and users; full
 * screen on a phone.
 *
 * containerMode 'panel' renders inside the route wizard; 'dialog' in its own
 * dialog. onDrillDown (the wizard) lets a destination be created on the way.
 */
export const CallConditionBridge = ({
  open,
  onClose,
  onSave,
  environmentUuid = null,
  callCondition = null,
  mode = 'create',
  hideEnvironment = false,
  containerMode = 'dialog',
  zLayer = null,
  onDrillDown,
}) => {
  const { t } = useTranslation('callConditions');
  const userSession = useIsUserSession();
  const { selectedEnvironments } = useCustomerEnvironment();
  const layer = zLayer || Z.L2;
  const nestedLayer = Z.L3;

  const { form, setForm, saved, loading, loadFailed } = useCallConditionForm({ open, mode, callCondition });
  const [environment, setEnvironment] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [copiedDay, setCopiedDay] = useState(null);
  const bodyRef = useRef(null);
  // Counts the Saves that stopped on a problem; each one shows the problem.
  const [stopped, setStopped] = useState(0);
  useEffect(() => { if (stopped) showFirstProblem(bodyRef.current); }, [stopped]);

  // Reset when the page opens. Only the first application's uuid is watched:
  // the list itself can be a new array on every render, and re-running this
  // would wipe the errors a Save just showed.
  const firstEnvironment = selectedEnvironments?.[0]?.uuid || '';
  useEffect(() => {
    if (!open) return;
    setEnvironment(callCondition?.environment_uuid || callCondition?.environment?.uuid || environmentUuid || firstEnvironment);
    setTried(false);
    setSaveError('');
    setShowNotes(false);
  }, [open, callCondition, environmentUuid, firstEnvironment]);

  useEffect(() => {
    if (saved?.environment?.uuid) setEnvironment(saved.environment.uuid);
  }, [saved]);

  const destinations = useDestinations(environment);
  // A name the API cannot take says so while it is typed, not only on Save.
  const errors = tried
    ? validateForm(form)
    : (form.name && !isValidName(form.name) ? { name: 'errors.nameFormat' } : {});
  const set = (changes) => setForm((prev) => ({ ...prev, ...changes }));
  const anyOpen = form.week.some((day) => day.open);

  const handleSave = async () => {
    setTried(true);
    const stop = () => setStopped((n) => n + 1);
    if (Object.keys(validateForm(form)).length > 0) { stop(); return; }
    if (!environment) {
      setSaveError(t('errors.noApplication'));
      stop();
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const result = await saveCallCondition({
        form,
        saved,
        // Always sent: the API service needs it to create. For a user it is
        // their own application, which the API enforces anyway.
        environmentUuid: environment,
      });
      onSave?.(result);
      onClose?.();
    } catch (error) {
      setSaveError(t('errors.save', { message: error?.message || '' }));
      stop();
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'edit' ? t('title.edit') : t('title.create');

  const body = loading ? (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Skeleton variant="rounded" height={56} />
      <Skeleton variant="rounded" height={280} />
      <Skeleton variant="rounded" height={72} />
    </Box>
  ) : (
    <Box ref={bodyRef} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {loadFailed && <Alert severity="error">{t('errors.load')}</Alert>}

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label={t('name.label')}
          value={form.name}
          onChange={(event) => set({ name: tidyName(event.target.value) })}
          placeholder={t('name.placeholder')}
          required
          error={Boolean(errors.name)}
          helperText={errors.name ? t(errors.name) : t('name.help')}
          inputProps={{ dir: 'ltr', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }}
          sx={{ flex: '1 1 240px' }}
        />
        {/* A user has one application, their own: never a choice. */}
        {!hideEnvironment && !userSession && (
          <FormControl sx={{ flex: '1 1 200px' }}>
            <InputLabel>{t('application')}</InputLabel>
            <Select value={environment} label={t('application')} onChange={(event) => setEnvironment(event.target.value)} MenuProps={menuProps(layer)}>
              {selectedEnvironments?.map((env) => <MenuItem key={env.uuid} value={env.uuid}>{env.name}</MenuItem>)}
            </Select>
          </FormControl>
        )}
      </Box>

      {showNotes || form.notes ? (
        <TextField label={t('notes.label')} value={form.notes} onChange={(event) => set({ notes: event.target.value })} multiline minRows={2} />
      ) : (
        <Link component="button" type="button" variant="body2" onClick={() => setShowNotes(true)} sx={{ alignSelf: 'flex-start' }}>
          {t('notes.add')}
        </Link>
      )}

      <Box component="section">
        <Typography variant="subtitle1" fontWeight={700}>{t('hours.title')}</Typography>
        <WeekSummary week={form.week} />
        <Typography variant="caption" color="text.secondary">{t('hours.timezone')}</Typography>
        <WeekHoursEditor
          week={form.week}
          onChange={(week) => set({ week })}
          errors={errors}
          layer={layer}
          onCopied={setCopiedDay}
        />
      </Box>

      <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {anyOpen && (
          <DestinationPicker
            testId="target-while-open"
            label={t('targets.whileOpen')}
            hint={t('targets.whileOpenHint')}
            target={form.openTarget}
            onChange={(openTarget) => set({ openTarget })}
            types={destinations.ruleTypes}
            destinations={destinations}
            environmentUuid={environment}
            nestedLayer={nestedLayer}
            error={errors.openTarget}
            onDrillDown={onDrillDown}
          />
        )}
        <DestinationPicker
          testId="target-otherwise"
          label={t('targets.otherwise')}
          hint={t('targets.otherwiseHint')}
          target={form.otherwise}
          onChange={(otherwise) => set({ otherwise })}
          types={destinations.fallbackTypes}
          destinations={destinations}
          environmentUuid={environment}
          nestedLayer={nestedLayer}
          error={errors.otherwise}
          onDrillDown={onDrillDown}
        />
      </Box>

      <Divider />

      <MoreRules
        rules={form.rules}
        onChange={(rules) => set({ rules })}
        errors={errors}
        types={destinations.ruleTypes}
        destinations={destinations}
        environmentUuid={environment}
        layer={nestedLayer}
      />

      {tried && Object.keys(errors).length > 0 && <Alert severity="warning">{t('errors.fixFirst')}</Alert>}
      {saveError && <Alert severity="error" data-problem onClose={() => setSaveError('')}>{saveError}</Alert>}

      <Snackbar
        open={copiedDay !== null}
        autoHideDuration={2500}
        onClose={() => setCopiedDay(null)}
        message={copiedDay !== null ? t('hours.copied', { day: t(`days.short.${copiedDay}`) }) : ''}
      />
    </Box>
  );

  const actions = (
    <>
      <Button onClick={onClose} disabled={saving}>{t('actions.cancel')}</Button>
      <Button
        variant="contained"
        onClick={handleSave}
        disabled={saving || loading}
        startIcon={saving ? <CircularProgress size={18} color="inherit" /> : null}
        data-testid="call-condition-save"
      >
        {saving ? t('actions.saving') : mode === 'edit' ? t('actions.save') : t('actions.create')}
      </Button>
    </>
  );

  if (containerMode === 'panel') {
    return (
      <Box className="call-condition-page" sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CallConditionIcon />
          <Typography variant="h6">{title}</Typography>
        </Box>
        <Box sx={{ flex: 1 }}>{body}</Box>
        {/* Pinned to the bottom of the scroll, so Save is always in reach. */}
        <Box
          sx={{
            position: 'sticky', bottom: 0, zIndex: 2, display: 'flex', justifyContent: 'flex-end', gap: 1,
            mt: 2, py: 1.5, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider',
            '& .MuiButton-root': { minHeight: 44, flex: { xs: 1, md: 'none' } },
          }}
        >
          {actions}
        </Box>
      </Box>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreenBelow="md" sx={{ zIndex: layer.DIALOG }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CallConditionIcon />
        <Box component="span" sx={{ flex: 1 }}>{title}</Box>
        <IconButton onClick={onClose} aria-label={t('actions.cancel')} edge="end"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>{body}</DialogContent>
      <DialogActions sx={{ '& .MuiButton-root': { minHeight: 44 } }}>{actions}</DialogActions>
    </Dialog>
  );
};

export default CallConditionBridge;
