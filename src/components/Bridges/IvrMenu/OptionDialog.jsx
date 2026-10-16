import { useEffect, useId } from 'react';
import {
  Alert, Box, Button, DialogActions, DialogContent, DialogTitle, FormControl, FormHelperText, IconButton,
  InputLabel, MenuItem, Select, TextField, Tooltip,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog } from '../../ui';
import { useConfirm } from '../../ui/useConfirm';
import { NumberSelector } from '../NumberBridge/NumberSelector.jsx';
import { itemLabel } from './ivrMenuModel';

/**
 * Where a caller goes, the way the app's forms ask it: a Type dropdown, then
 * the Destination of that type (a number is searched), with ✎ and + on its
 * row to open that place's editor or make a new one in the route wizard.
 *
 * value: { type, target }
 * destinations: the server's choices for this person (null while it answers)
 * onEdit(type, uuid) / onCreate(type): leave for the wizard; absent = no icon
 */
export function DestinationFields({ value, onChange, destinations, resources, environmentUuid, onEdit, onCreate, error }) {
  const { t } = useTranslation('bridges');
  const id = useId();
  const chosen = destinations?.find((d) => d.type === value.type);
  const { load } = resources;

  useEffect(() => { if (value.type && value.type !== 'number') load(value.type); }, [value.type, load]);

  if (destinations?.length === 0) return <Alert severity="info">{t('ivrMenu.destination.noTypes')}</Alert>;

  const typeName = (type) => t(`ivrMenu.types.${type}`, { defaultValue: type });
  const places = value.type ? resources.resource(value.type) : null;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
      <FormControl fullWidth disabled={!destinations}>
        <InputLabel id={`${id}-type`}>{t('ivrMenu.destination.type')}</InputLabel>
        <Select
          labelId={`${id}-type`}
          label={t('ivrMenu.destination.type')}
          value={chosen ? value.type : ''}
          onChange={(e) => onChange({ type: e.target.value, target: '' })}
        >
          {(destinations || []).map((d) => {
            const Icon = d.icon;
            return (
              <MenuItem key={d.type} value={d.type}>
                <Icon fontSize="small" sx={{ me: 1, color: 'text.secondary' }} />{typeName(d.type)}
              </MenuItem>
            );
          })}
        </Select>
        {!value.type && error && <FormHelperText error>{error}</FormHelperText>}
      </FormControl>

      {value.type && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, minWidth: 0 }}>
          {value.type === 'number' ? (
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <NumberSelector
                value={value.target}
                onChange={(uuid) => onChange({ type: 'number', target: uuid || '' })}
                environmentUuid={environmentUuid}
                label={t('ivrMenu.destination.target')}
                error={error}
              />
            </Box>
          ) : (
            <FormControl fullWidth error={Boolean(error)}>
              <InputLabel id={`${id}-target`}>{t('ivrMenu.destination.target')}</InputLabel>
              <Select
                labelId={`${id}-target`}
                label={t('ivrMenu.destination.target')}
                value={places.status === 'done' && places.items.some((i) => i.uuid === value.target) ? value.target : ''}
                onChange={(e) => onChange({ type: value.type, target: e.target.value })}
              >
                {places.status === 'loading' && <MenuItem value="" disabled>{t('ivrMenu.destination.loading')}</MenuItem>}
                {places.status === 'done' && places.items.length === 0 && (
                  <MenuItem value="" disabled>{t('ivrMenu.destination.noItems')}</MenuItem>
                )}
                {places.items.map((item) => (
                  <MenuItem key={item.uuid} value={item.uuid} dir="auto">{itemLabel(item)}</MenuItem>
                ))}
              </Select>
              {error && <FormHelperText>{error}</FormHelperText>}
            </FormControl>
          )}
          {chosen?.canCreate && onEdit && value.target && (
            <Tooltip title={t('ivrMenu.destination.edit', { type: typeName(value.type) })}>
              <IconButton color="primary" sx={{ mt: 1 }} onClick={() => onEdit(value.type, value.target)}
                aria-label={t('ivrMenu.destination.edit', { type: typeName(value.type) })}>
                <EditIcon />
              </IconButton>
            </Tooltip>
          )}
          {chosen?.canCreate && onCreate && (
            <Tooltip title={t('ivrMenu.destination.create', { type: typeName(value.type) })}>
              <IconButton color="primary" sx={{ mt: 1 }} onClick={() => onCreate(value.type)}
                aria-label={t('ivrMenu.destination.create', { type: typeName(value.type) })}>
                <AddIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * One key of the menu: its name and where it sends the caller. A dialog on a
 * desktop, the whole screen on a phone. The editor holds the draft (`option`,
 * changed through `onChange`), so leaving for the wizard and coming back
 * keeps what was typed. Delete asks first.
 */
export default function OptionDialog({
  option, isNew, onChange, onDone, onDelete, onClose, onEdit, onCreate, destinations, resources, environmentUuid,
}) {
  const { t } = useTranslation('bridges');
  const confirm = useConfirm();
  const titleId = useId();

  // An option is named after the place it goes to, until it is renamed.
  const goTo = ({ type, target }) => {
    const name = option.name.trim() || !target ? option.name : resources.nameOf(type, target);
    onChange({ ...option, type, target, name });
  };

  const remove = async () => {
    const sure = await confirm({
      title: t('ivrMenu.option.deleteTitle', { key: option.key }),
      message: t('ivrMenu.option.deleteMessage', { key: option.key }),
    });
    if (sure) onDelete(option.key);
  };

  return (
    <ResponsiveDialog open onClose={onClose} fullScreenBelow="md" fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>
        {t(isNew ? 'ivrMenu.option.titleNew' : 'ivrMenu.option.titleEdit', { key: option.key })}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label={t('ivrMenu.option.name')}
            placeholder={t('ivrMenu.option.namePlaceholder')}
            value={option.name}
            onChange={(e) => onChange({ ...option, name: e.target.value })}
            inputProps={{ dir: 'auto' }}
            fullWidth
          />
          <DestinationFields
            value={option}
            onChange={goTo}
            destinations={destinations}
            resources={resources}
            environmentUuid={environmentUuid}
            onEdit={onEdit}
            onCreate={onCreate}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        {!isNew && <Button color="error" onClick={remove} sx={{ me: 'auto' }}>{t('ivrMenu.option.delete')}</Button>}
        <Button onClick={onClose}>{t('ivrMenu.cancel')}</Button>
        <Button variant="contained" onClick={() => onDone(option)}>{t('ivrMenu.option.done')}</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
