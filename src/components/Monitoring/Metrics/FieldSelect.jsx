import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material';
import { monitoringApi } from '../../../services/api/monitoringApi';
import { useTranslation } from 'react-i18next';

const AGGREGATIONS = ['mean', 'sum', 'max', 'min', 'last', 'first', 'count'];

/**
 * FieldSelect — measurement -> field -> aggregation, fed by the SAME live
 * schema call InfluxMetricExplorer uses (monitoringApi.getInfluxSchema()),
 * not a fixed list. A 'table' widget (recent calls) has no measurement to
 * pick — it renders nothing here.
 */
export default function FieldSelect({ widget, onChange }) {
  const { t } = useTranslation('widgets');
  const [schema, setSchema] = useState([]);
  const [schemaError, setSchemaError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSchemaError(null);
    monitoringApi.getInfluxSchema()
      .then((s) => { if (alive) setSchema(Array.isArray(s) ? s : []); })
      .catch((e) => { if (alive) setSchemaError(e?.message || t('field.schemaFailed')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retry, t]);

  const measurements = useMemo(() => schema.map((s) => s.measurement).filter(Boolean).sort(), [schema]);
  const fields = useMemo(() => {
    const m = schema.find((s) => s.measurement === widget.measurement);
    return (m?.fields || []).map((f) => (typeof f === 'string' ? f : f.name)).filter(Boolean).sort();
  }, [schema, widget.measurement]);

  if (widget.type === 'table') {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('field.recentCalls')}
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>{t('field.metric')}</Typography>
      {schemaError && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
          {t('field.schemaError', { error: schemaError })}
          <Button size="small" onClick={() => setRetry((value) => value + 1)}>{t('field.retry')}</Button>
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        <Autocomplete size="small" sx={{ minWidth: 220 }} loading={loading}
          options={measurements} value={widget.measurement || null}
          onChange={(_, value) => onChange({ measurement: value || '', field: '' })}
          renderInput={(params) => <TextField {...params} label={t('field.measurement')} />} />
        <Autocomplete size="small" sx={{ minWidth: 220 }} disabled={!widget.measurement} loading={loading}
          options={fields} value={widget.field || null}
          onChange={(_, value) => onChange({ field: value || '' })}
          renderInput={(params) => <TextField {...params} label={t('field.field')} />} />

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>{t('field.aggregation')}</InputLabel>
          <Select label={t('field.aggregation')} value={widget.aggregation || 'mean'} onChange={(e) => onChange({ aggregation: e.target.value })}>
            {AGGREGATIONS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>
      {!loading && !schemaError && !measurements.length && <Typography color="text.secondary">{t('field.noMeasurements')}</Typography>}
      {schema.find((entry) => entry.measurement === widget.measurement)?.fields?.filter((entry) => entry.name === widget.field).map((entry) => <Typography key={entry.name} variant="caption" color="text.secondary">{t('field.fieldType', { type: entry.type })}</Typography>)}
    </Box>
  );
}
