import { useEffect, useId, useState } from 'react';
import {
  Box, Button, ButtonBase, DialogActions, DialogContent, DialogTitle, FormControl, FormHelperText,
  InputLabel, MenuItem, Select, Typography,
} from '@mui/material';
import { ChevronRight as OpenIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog as Dialog } from '../../ui';
import { NumberSelector } from '../NumberBridge/NumberSelector.jsx';
import AnnouncementActions from '../shared/AnnouncementActions.jsx';
import { menuProps } from '../../../utils/zIndex.js';

const CREATE_NEW = '__create__';
// Types whose editor can be opened from the route wizard to make a new one.
const CREATABLE = ['announcement', 'vml', 'call_condition', 'queue', 'ivr', 'bot'];

/**
 * Type, then the destination of that type. A phone number is searched; every
 * other type is picked from its list. "Create new" opens that type's editor
 * in the wizard (when there is one) and picks what it saves. A chosen
 * announcement can be heard, and opened in its editor when `onEdit` is given.
 */
export function DestinationFields({ target, onChange, types, destinations, environmentUuid, layer, error, onCreateNew, onEdit }) {
  const { t } = useTranslation('callConditions');
  const list = destinations.lists[target.type] || [];
  const { load } = destinations;
  const id = useId();

  useEffect(() => {
    if (target.type && target.type !== 'number') load(target.type);
  }, [target.type, load]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FormControl fullWidth>
        <InputLabel id={`${id}-type`}>{t('destination.type')}</InputLabel>
        <Select
          labelId={`${id}-type`}
          value={types.includes(target.type) ? target.type : ''}
          label={t('destination.type')}
          onChange={(event) => onChange({ type: event.target.value, uuid: '' })}
          MenuProps={menuProps(layer)}
        >
          {types.map((type) => <MenuItem key={type} value={type}>{t(`types.${type}`, { defaultValue: type })}</MenuItem>)}
        </Select>
      </FormControl>

      {target.type === 'number' ? (
        <NumberSelector
          value={target.uuid}
          onChange={(uuid, number) => onChange({ type: 'number', uuid: uuid || '', label: number || '' })}
          environmentUuid={environmentUuid}
          label={t('destination.target')}
          error={error ? t(error) : null}
        />
      ) : target.type ? (
        <FormControl fullWidth error={Boolean(error)}>
          <InputLabel id={`${id}-target`}>{t('destination.target')}</InputLabel>
          <Select
            labelId={`${id}-target`}
            value={list.some((item) => item.uuid === target.uuid) ? target.uuid : ''}
            label={t('destination.target')}
            onChange={(event) => {
              if (event.target.value === CREATE_NEW) onCreateNew(target.type);
              else onChange({ type: target.type, uuid: event.target.value });
            }}
            MenuProps={menuProps(layer)}
          >
            {onCreateNew && CREATABLE.includes(target.type) && (
              <MenuItem value={CREATE_NEW} sx={{ color: 'primary.main', fontWeight: 600 }}>+ {t('destination.createNew')}</MenuItem>
            )}
            {list.length === 0 && <MenuItem disabled value="">{t('destination.none')}</MenuItem>}
            {list.map((item) => <MenuItem key={item.uuid} value={item.uuid}>{item.name || item.number || item.uuid}</MenuItem>)}
          </Select>
          {error && <FormHelperText>{t(error)}</FormHelperText>}
        </FormControl>
      ) : (
        error && <FormHelperText error>{t(error)}</FormHelperText>
      )}

      {target.type === 'announcement' && (
        <AnnouncementActions uuid={target.uuid} onEdit={onEdit && ((uuid) => onEdit(target.type, uuid))} />
      )}
    </Box>
  );
}

// "Queue · Support", or the prompt to choose one.
export function useTargetText() {
  const { t } = useTranslation('callConditions');
  return (target, destinations) => {
    if (!target?.type) return '';
    const typeName = t(`types.${target.type}`, { defaultValue: target.type });
    const name = destinations.nameOf(target);
    return name ? `${typeName} · ${name}` : typeName;
  };
}

/**
 * One "where calls go" row: what it is for on one side, the chosen
 * destination on the other. A tap opens the picker.
 */
export default function DestinationPicker({
  label, hint, target, onChange, types, destinations, environmentUuid, nestedLayer, error, onDrillDown, testId,
}) {
  const { t } = useTranslation('callConditions');
  const theme = useTheme();
  const targetText = useTargetText();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(target);
  const { load } = destinations;

  // The row shows the destination's name, so its list is needed up front.
  useEffect(() => {
    if (target.type && target.type !== 'number') load(target.type);
  }, [target.type, load]);

  const openPicker = () => { setDraft(target); setOpen(true); };
  const done = () => { onChange(draft); setOpen(false); };

  // Making a new destination happens in the wizard; the picker closes and the
  // row takes what the new editor saves.
  const createNew = onDrillDown ? (type) => {
    setOpen(false);
    onDrillDown({
      type,
      mode: 'create',
      data: null,
      environmentUuid,
      onResult: async (saved) => {
        const uuid = saved?.uuid || saved?.id;
        await load(type, true);
        if (uuid) onChange({ type, uuid });
      },
    });
  } : null;

  // Editing what is chosen also happens in the wizard: the choice is kept,
  // and the list reloads so a renamed destination shows its new name.
  const editExisting = onDrillDown ? (type, uuid) => {
    onChange(draft);
    setOpen(false);
    onDrillDown({
      type,
      mode: 'edit',
      data: { uuid },
      environmentUuid,
      onResult: () => load(type, true),
    });
  } : null;

  const chosen = targetText(target, destinations);

  return (
    <>
      <ButtonBase
        onClick={openPicker}
        data-testid={testId}
        // Label and destination share the line while both fit; when they
        // don't, the destination (with its arrow) wraps to a line of its own,
        // still at the end, and a name too long even for that ends in "…".
        // The label asks for 8rem before the destination must move: its hint
        // wraps under it rather than pushing the destination down.
        sx={{
          width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          columnGap: 1.5, rowGap: 0.5, textAlign: 'start',
          p: 1.5, borderRadius: 2, border: 1, borderColor: error ? 'error.main' : 'divider',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box sx={{ flex: '1 1 8rem', minWidth: 0 }}>
          <Typography fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{label}</Typography>
          {hint && <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{hint}</Typography>}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, maxWidth: '100%', ms: 'auto' }}>
          <Typography color={chosen ? 'text.primary' : 'primary'} noWrap sx={{ minWidth: 0 }}>
            {chosen || t('targets.choose')}
          </Typography>
          <OpenIcon color="action" sx={{ flexShrink: 0, transform: theme.direction === 'rtl' ? 'scaleX(-1)' : undefined }} />
        </Box>
      </ButtonBase>
      {error && <FormHelperText error sx={{ mx: 1.5 }}>{t(error)}</FormHelperText>}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs" sx={{ zIndex: nestedLayer.DIALOG }}>
        <DialogTitle>{label}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <DestinationFields
              target={draft}
              onChange={setDraft}
              types={types}
              destinations={destinations}
              environmentUuid={environmentUuid}
              layer={nestedLayer}
              onCreateNew={createNew}
              onEdit={editExisting}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('destination.cancel')}</Button>
          <Button variant="contained" onClick={done} disabled={!draft.type || !draft.uuid}>{t('destination.done')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
