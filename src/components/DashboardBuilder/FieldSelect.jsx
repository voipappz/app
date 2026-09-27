import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material';
import { monitoringApi } from '../../services/api/monitoringApi';

const AGGREGATIONS = ['mean', 'sum', 'max', 'min', 'last', 'first', 'count'];

/**
 * FieldSelect — measurement -> field -> aggregation, fed by the SAME live
 * schema call InfluxMetricExplorer uses (monitoringApi.getInfluxSchema()),
 * not a fixed list. A 'table' widget (recent calls) has no measurement to
 * pick — it renders nothing here.
 */
export default function FieldSelect({ widget, onChange }) {
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
      .catch((e) => { if (alive) setSchemaError(e?.message || 'Failed to load schema'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retry]);

  const measurements = useMemo(() => schema.map((s) => s.measurement).filter(Boolean).sort(), [schema]);
  const fields = useMemo(() => {
    const m = schema.find((s) => s.measurement === widget.measurement);
    return (m?.fields || []).map((f) => (typeof f === 'string' ? f : f.name)).filter(Boolean).sort();
  }, [schema, widget.measurement]);

  if (widget.type === 'table') {
    return (
      <Typography variant="body2" color="text.secondary">
        Recent calls shows completed call records from InfluxDB.
      </Typography>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Metric</Typography>
      {schemaError && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
          Schema: {schemaError}
          <Button size="small" onClick={() => setRetry((value) => value + 1)}>Retry</Button>
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        <Autocomplete size="small" sx={{ minWidth: 220 }} loading={loading}
          options={measurements} value={widget.measurement || null}
          onChange={(_, value) => onChange({ measurement: value || '', field: '' })}
          renderInput={(params) => <TextField {...params} label="Measurement" />} />
        <Autocomplete size="small" sx={{ minWidth: 220 }} disabled={!widget.measurement} loading={loading}
          options={fields} value={widget.field || null}
          onChange={(_, value) => onChange({ field: value || '' })}
          renderInput={(params) => <TextField {...params} label="Field" />} />

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Aggregation</InputLabel>
          <Select label="Aggregation" value={widget.aggregation || 'mean'} onChange={(e) => onChange({ aggregation: e.target.value })}>
            {AGGREGATIONS.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>
      {!loading && !schemaError && !measurements.length && <Typography color="text.secondary">No measurements are available.</Typography>}
      {schema.find((entry) => entry.measurement === widget.measurement)?.fields?.filter((entry) => entry.name === widget.field).map((entry) => <Typography key={entry.name} variant="caption" color="text.secondary">Field type: {entry.type}</Typography>)}
    </Box>
  );
}
