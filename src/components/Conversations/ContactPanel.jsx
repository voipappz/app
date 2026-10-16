import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Chip, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import Bdi from '../../i18n/Bdi';
import { contactsApi } from '../../services/api/contactsApi';
import { formatOnlyDate, formatTime } from '../../utils/dateUtils';

const unwrap = (res) => (res && res.data !== undefined ? res.data : res);

const Section = ({ title, children }) => (
  <Box sx={{ px: 1.75, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
    <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6, mb: 0.5 }}>{title}</Typography>
    {children}
  </Box>
);

/** One label and value; a click turns the value into an input of the field's type. */
function Field({ label, type = 'text', options = [], value, onSave, editable }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);
  const commit = () => { setEditing(false); if (String(draft) !== String(value ?? '')) onSave(draft); };
  const input = type === 'select' ? (
    <TextField select size="small" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} onBlur={commit} inputProps={{ 'aria-label': label }} sx={{ minWidth: 120 }}>
      <MenuItem value="">—</MenuItem>
      {options.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
    </TextField>
  ) : (
    <TextField
      size="small" autoFocus type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'} value={draft}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); } }}
      inputProps={{ 'aria-label': label }}
    />
  );
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.25, py: 0.5, alignItems: 'center', fontSize: 12.5 }}>
      <Typography variant="body2" color="text.secondary" component="label">{label}</Typography>
      {editing ? input : (
        <Box
          component={editable ? 'button' : 'span'} type={editable ? 'button' : undefined}
          onClick={editable ? () => setEditing(true) : undefined} aria-label={editable ? label : undefined}
          sx={{ all: 'unset', cursor: editable ? 'pointer' : 'default', fontSize: 12.5, minWidth: 24, textAlign: 'end', overflowWrap: 'anywhere' }}
        >
          {type === 'date' && value ? formatOnlyDate(value) : (value || '—')}
        </Box>
      )}
    </Box>
  );
}

/** Contact details for the selected conversation's number. */
export default function ContactPanel({ phone, contactUuid }) {
  const { t } = useTranslation('conversations');
  const [contact, setContact] = useState(null);
  const [fields, setFields] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [tag, setTag] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    contactsApi.fields().then((r) => { if (alive) setFields(Array.isArray(unwrap(r)) ? unwrap(r) : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoaded(false); setError(false); setContact(null);
    if (!phone && !contactUuid) { setLoaded(true); return undefined; }
    (async () => {
      try {
        let found = contactUuid ? { uuid: contactUuid } : unwrap(await contactsApi.lookup(phone));
        if (found?.uuid) found = unwrap(await contactsApi.get(found.uuid));
        if (alive) setContact(found || null);
      } catch { if (alive) setError(true); }
      finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [phone, contactUuid]);

  const patch = useCallback(async (change) => {
    setError(false);
    try {
      const updated = unwrap(await contactsApi.update(contact.uuid, change));
      if (updated) setContact((c) => ({ ...c, ...updated }));
    } catch { setError(true); }
  }, [contact]);

  const create = async () => {
    setError(false);
    try { setContact(unwrap(await contactsApi.create({ phone }))); } catch { setError(true); }
  };

  const addTag = () => {
    const raw = tag.trim();
    if (!raw) return;
    const [k, ...rest] = raw.split(':');
    patch({ meta: { [k.trim()]: rest.join(':').trim() } });
    setTag(''); setAdding(false);
  };

  if (!loaded) return null;

  return (
    <Box data-testid="contact-panel">
      {error && <Typography role="alert" variant="caption" color="error" sx={{ px: 1.75, pt: 1, display: 'block' }}>{t('contact.error')}</Typography>}
      {!contact ? (
        <Section title={t('contact.title')}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('contact.none')}</Typography>
          {phone && <Button size="small" variant="outlined" onClick={create}>{t('contact.create')}</Button>}
        </Section>
      ) : (
        <>
          <Section title={t('contact.title')}>
            <Field label={t('contact.name')} value={contact.name} editable onSave={(v) => patch({ field: 'name', value: v })} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.25, py: 0.5, fontSize: 12.5 }}>
              <Typography variant="body2" color="text.secondary">{t('contact.phone')}</Typography>
              <Box component="span" sx={{ fontSize: 12.5 }}><Bdi>{contact.phone}</Bdi></Box>
            </Box>
            <Field label={t('contact.email')} value={contact.email} editable onSave={(v) => patch({ field: 'email', value: v })} />
            {fields.filter((f) => f.key !== 'name' && f.key !== 'email').map((f) => (
              <Field key={f.key} label={f.label || f.key} type={f.type} options={f.options || []} value={contact.fields?.[f.key]} editable onSave={(v) => patch({ field: f.key, value: v })} />
            ))}
          </Section>
          <Section title={t('contact.tags')}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
              {Object.entries(contact.meta || {}).map(([k, v]) => (
                <Chip key={k} size="small" variant="outlined" label={v ? `${k}: ${v}` : k} onDelete={() => patch({ removeMeta: k })} deleteIcon={<span aria-label={t('contact.removeTag', { tag: k })} role="button">×</span>} />
              ))}
              {adding ? (
                <TextField
                  size="small" autoFocus value={tag} placeholder={t('contact.tagPlaceholder')} inputProps={{ 'aria-label': t('contact.tagPlaceholder') }}
                  onChange={(e) => setTag(e.target.value)} onBlur={addTag}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') { setTag(''); setAdding(false); } }}
                />
              ) : (
                <IconButton size="small" aria-label={t('contact.addTag')} onClick={() => setAdding(true)}><AddIcon fontSize="small" /></IconButton>
              )}
            </Box>
          </Section>
          <Section title={t('contact.previous')}>
            {(contact.previous || []).length === 0 && <Typography variant="body2" color="text.secondary">{t('contact.noPrevious')}</Typography>}
            {(contact.previous || []).map((p) => (
              <Box key={p.call_uuid} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.25, fontSize: 12 }}>
                <span>{formatOnlyDate(p.started_at)} {formatTime(p.started_at)}</span>
                <Typography variant="caption" color="text.secondary">{t(`direction.${p.direction || 'unknown'}`, { defaultValue: '' })}</Typography>
              </Box>
            ))}
          </Section>
        </>
      )}
    </Box>
  );
}
