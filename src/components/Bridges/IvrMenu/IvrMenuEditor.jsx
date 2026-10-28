import { useEffect, useId, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, CircularProgress, FormControl, FormHelperText, IconButton, InputLabel, MenuItem,
  Select, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '../../../hooks/usePermissions';
import AudioPreview from '../../common/AudioPreview/AudioPreview.jsx';
import { KEYPAD, LIMITS, itemLabel } from './ivrMenuModel';
import { useBridgeResources, useDestinationChoices, useIvrMenu } from './useIvrMenu';
import OptionDialog, { DestinationFields } from './OptionDialog';

/**
 * A phone menu (IVR) for a portal user, laid out the way a caller meets it:
 * the greeting, then a phone's keypad where the keys in use are filled in (a
 * tap opens that key's setup), then what happens when no key or a wrong key
 * is pressed. Shown as a step of the route wizard; `onDrillDown` opens the
 * editor of a place to send callers, and the answer comes back here.
 */
export default function IvrMenuEditor({ ivr, mode, environmentUuid, onSave, onClose, onDrillDown }) {
  const { t } = useTranslation('bridges');
  const { canWriteDestinations } = usePermissions();
  const editor = useIvrMenu({ ivr, mode, environmentUuid, onSave });
  const { menu, errors, change, putOption, setFallback } = editor;
  const resources = useBridgeResources(editor.environmentUuid);
  const destinations = useDestinationChoices();
  const [editing, setEditing] = useState(null); // null | { option, isNew }

  // The summary names where each key goes: load the kinds of place in use.
  const { load } = resources;
  const typesKey = [...new Set([...menu.options, menu.noKey, menu.wrongKey].map((d) => d.type).filter(Boolean))].sort().join(',');
  useEffect(() => { typesKey.split(',').filter(Boolean).forEach((type) => load(type)); }, [typesKey, load]);

  // Leave for the wizard to open a place's editor; `comeBack(uuid)` runs when
  // it saves (a new place's uuid). Cancelled, the wizard just comes back here.
  const leaveFor = onDrillDown && ((type, uuid, comeBack) => onDrillDown({
    type,
    mode: uuid ? 'edit' : 'create',
    data: uuid ? { uuid } : null,
    environmentUuid: editor.environmentUuid,
    onResult: async (saved) => {
      await load(type, { again: true });
      comeBack(saved?.uuid || saved?.id);
    },
  }));

  // From a key's dialog: what was typed goes into the menu first, so it is
  // there whether the wizard step is saved or cancelled; a save reopens the
  // key with the new place chosen.
  const leaveFromOption = (draft, type, uuid) => {
    putOption(draft);
    setEditing(null);
    leaveFor(type, uuid, (savedUuid) => {
      const back = uuid ? draft : { ...draft, type, target: savedUuid || draft.target };
      putOption(back);
      setEditing({ option: back, isNew: false });
    });
  };

  const typeName = (type) => t(`ivrMenu.types.${type}`, { defaultValue: type });
  const placeName = ({ type, target }) => (target && resources.nameOf(type, target)) || t('ivrMenu.notSet');
  const errorText = (key) => (errors[key] ? t(`ivrMenu.errors.${errors[key]}`) : undefined);

  if (editor.status === 'loading') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 3 }}>
        <CircularProgress size={24} /><Typography>{t('ivrMenu.loading')}</Typography>
      </Box>
    );
  }
  if (editor.status === 'loadError') {
    return (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert severity="error">{t('ivrMenu.loadError')}</Alert>
        <Button onClick={onClose} sx={{ alignSelf: 'flex-start' }}>{t('ivrMenu.cancel')}</Button>
      </Box>
    );
  }

  const openKey = (key) => {
    const option = menu.options.find((o) => o.key === key);
    setEditing(option ? { option, isNew: false } : { option: { key, name: '', type: '', target: '' }, isNew: true });
  };

  const fallback = (which, countKey) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '140px 1fr' }, gap: 2, alignItems: 'start' }}>
      <TextField
        type="number"
        label={t(`ivrMenu.${countKey}`)}
        value={menu[which][countKey]}
        onChange={(e) => setFallback(which, { [countKey]: e.target.value === '' ? '' : Number(e.target.value) })}
        inputProps={{ ...LIMITS[countKey], inputMode: 'numeric' }}
        error={Boolean(errors[countKey])}
        helperText={errorText(countKey)}
        fullWidth
      />
      <DestinationFields
        value={menu[which]}
        onChange={({ type, target }) => setFallback(which, { type, target })}
        destinations={destinations}
        resources={resources}
        environmentUuid={editor.environmentUuid}
        error={errorText(which)}
        onEdit={leaveFor && ((type, uuid) => leaveFor(type, uuid, () => {}))}
        onCreate={leaveFor && ((type) => leaveFor(type, null, (uuid) => { if (uuid) setFallback(which, { type, target: uuid }); }))}
      />
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
        <TextField
          label={t('ivrMenu.name')}
          placeholder={t('ivrMenu.namePlaceholder')}
          value={menu.name}
          onChange={(e) => change({ name: e.target.value })}
          error={Boolean(errors.name)}
          helperText={errorText('name')}
          inputProps={{ dir: 'auto' }}
          required
          fullWidth
        />

        <GreetingRow
          value={menu.greeting}
          onChange={(greeting) => change({ greeting })}
          resources={resources}
          error={errorText('greeting')}
          onEdit={leaveFor && ((uuid) => leaveFor('announcement', uuid, () => {}))}
          onCreate={leaveFor && canWriteDestinations
            ? () => leaveFor('announcement', null, (uuid) => { if (uuid) change({ greeting: uuid }); })
            : undefined}
        />

        <Section title={t('ivrMenu.options')} help={t('ivrMenu.optionsHelp')}>
          <DialPad options={menu.options} errors={errors} onPress={openKey} />
          {menu.options.length > 0 && (
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {menu.options.map((option) => (
                <li key={option.key}>
                  <ButtonBase
                    onClick={() => openKey(option.key)}
                    sx={{ width: '100%', justifyContent: 'flex-start', textAlign: 'start', gap: 1, py: 0.75, px: 1, borderRadius: 1 }}
                  >
                    <Typography component="span" dir="ltr" sx={{ fontWeight: 700, minWidth: 16 }}>{option.key}</Typography>
                    <Typography component="span" noWrap dir="auto" sx={{ minWidth: 0 }}>{option.name || t('ivrMenu.notSet')}</Typography>
                    <Typography component="span" color="text.secondary">→</Typography>
                    <Typography
                      component="span"
                      noWrap
                      dir="auto"
                      color={errors[`option.${option.key}`] ? 'error' : 'text.secondary'}
                      sx={{ minWidth: 0 }}
                    >
                      {option.type ? `${typeName(option.type)} · ${placeName(option)}` : t('ivrMenu.notSet')}
                    </Typography>
                  </ButtonBase>
                </li>
              ))}
            </Box>
          )}
          {editor.hints.map((hint) => <Alert key={hint} severity="info">{t(`ivrMenu.hints.${hint}`)}</Alert>)}
        </Section>

        <Section title={t('ivrMenu.noKey')}>{fallback('noKey', 'seconds')}</Section>
        <Section title={t('ivrMenu.wrongKey')}>{fallback('wrongKey', 'tries')}</Section>

        {editor.saveError !== null && (
          <Alert severity="error">{[t('ivrMenu.saveFailed'), editor.saveError].filter(Boolean).join(' ')}</Alert>
        )}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button onClick={onClose}>{t('ivrMenu.cancel')}</Button>
        <Button variant="contained" onClick={editor.save} disabled={editor.saving}>
          {editor.saving ? t('ivrMenu.saving') : t('ivrMenu.save')}
        </Button>
      </Box>

      {editing && (
        <OptionDialog
          option={editing.option}
          isNew={editing.isNew}
          onChange={(option) => setEditing((e) => ({ ...e, option }))}
          onDone={(option) => { putOption(option); setEditing(null); }}
          onDelete={(key) => { editor.removeOption(key); setEditing(null); }}
          onClose={() => setEditing(null)}
          onEdit={leaveFor && ((type, uuid) => leaveFromOption(editing.option, type, uuid))}
          onCreate={leaveFor && ((type) => leaveFromOption({ ...editing.option, type, target: '' }, type, null))}
          destinations={destinations}
          resources={resources}
          environmentUuid={editor.environmentUuid}
        />
      )}
    </Box>
  );
}

function Section({ title, help, children }) {
  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box>
        <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600, color: 'text.secondary' }}>{title}</Typography>
        {help && <Typography variant="caption" color="text.secondary">{help}</Typography>}
      </Box>
      {children}
    </Box>
  );
}

// A phone's keypad. A key in use is filled and shows its option's name; a
// free key is outlined with "+". A key whose option is incomplete shows red.
function DialPad({ options, errors, onPress }) {
  const { t } = useTranslation('bridges');
  const byKey = Object.fromEntries(options.map((o) => [o.key, o]));
  return (
    <Box dir="ltr" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, width: '100%', maxWidth: 360 }}>
      {KEYPAD.map((key) => {
        const option = byKey[key];
        const name = option ? option.name || t('ivrMenu.notSet') : null;
        return (
          <Button
            key={key}
            variant={option ? 'contained' : 'outlined'}
            color={errors[`option.${key}`] ? 'error' : 'primary'}
            onClick={() => onPress(key)}
            aria-label={option ? `${t('ivrMenu.keyName', { key })}: ${name}` : t('ivrMenu.keyFree', { key })}
            sx={{ minHeight: 64, flexDirection: 'column', textTransform: 'none', lineHeight: 1.2, borderRadius: 2, minWidth: 0 }}
          >
            <Box component="span" sx={{ fontSize: '1.5rem', fontWeight: 600 }}>{key}</Box>
            <Box
              component="span"
              dir="auto"
              sx={{ fontSize: '0.75rem', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: option ? 1 : 0.6 }}
            >
              {name || '+'}
            </Box>
          </Button>
        );
      })}
    </Box>
  );
}

// What callers hear first: one of the environment's announcements, with ▶ to
// hear it and ✎ / + on the same row, as the app's other forms have them.
function GreetingRow({ value, onChange, resources, error, onEdit, onCreate }) {
  const { t } = useTranslation('bridges');
  const id = useId();
  const { load } = resources;
  useEffect(() => { load('announcement'); }, [load]);
  const announcements = resources.resource('announcement');

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
      <FormControl fullWidth required error={Boolean(error)}>
        <InputLabel id={`${id}-greeting`}>{t('ivrMenu.greeting')}</InputLabel>
        <Select
          labelId={`${id}-greeting`}
          label={t('ivrMenu.greeting')}
          value={announcements.status === 'done' && announcements.items.some((i) => i.uuid === value) ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {announcements.status === 'loading' && <MenuItem value="" disabled>{t('ivrMenu.destination.loading')}</MenuItem>}
          {announcements.status === 'done' && announcements.items.length === 0 && (
            <MenuItem value="" disabled>{t('ivrMenu.destination.noItems')}</MenuItem>
          )}
          {announcements.items.map((item) => (
            <MenuItem key={item.uuid} value={item.uuid} dir="auto">{itemLabel(item)}</MenuItem>
          ))}
        </Select>
        <FormHelperText>{error || t('ivrMenu.greetingHelp')}</FormHelperText>
      </FormControl>
      {value && <Box sx={{ mt: 1 }}><AudioPreview key={value} uuid={value} /></Box>}
      {value && onEdit && (
        <Tooltip title={t('ivrMenu.greetingEdit')}>
          <IconButton color="primary" sx={{ mt: 1 }} onClick={() => onEdit(value)} aria-label={t('ivrMenu.greetingEdit')}>
            <EditIcon />
          </IconButton>
        </Tooltip>
      )}
      {onCreate && (
        <Tooltip title={t('ivrMenu.greetingNew')}>
          <IconButton color="primary" sx={{ mt: 1 }} onClick={onCreate} aria-label={t('ivrMenu.greetingNew')}>
            <AddIcon />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
