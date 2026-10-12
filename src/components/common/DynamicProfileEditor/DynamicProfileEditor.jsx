import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Chip,
  Alert,
  Table,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Tooltip,
  InputAdornment,
} from '@mui/material';
import { Add as AddIcon, Info as InfoIcon, LockOpen as LockOpenIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import { profileParamsApi } from '../../../services/api/profileParamsApi';
import SecretField from '../SecretField.jsx';

/**
 * DynamicProfileEditor Component
 * Renders dynamic profile fields based on API-defined field structure
 *
 * @param {string} type - Profile type (e.g., 'environment', 'user')
 * @param {object} profile - Current profile data
 * @param {function} onChange - Callback when profile values change
 * @param {boolean} disabled - Whether fields are disabled
 * @param {string} title - Section title
 * @param {boolean} ownTypeOnly - Hide inherited child-type fields (keys
 *   namespaced as "environment.domain", "campaign.x", ...) and show only the
 *   editor's own keys. For type="customer" the API appends namespaced fields
 *   for all seven CUSTOMER_CHILD_TYPES — 108 of them against the customer's own
 *   23 — which buried the settings that actually apply. They are validated on
 *   save but never read back at runtime, so hiding them costs nothing; the
 *   values stay in the column, since the API merges a partial profile update
 *   rather than replacing it.
 */
// A field from profile.yml may carry `pattern` (a regex the value must match)
// and `example` (shown as the placeholder and in the error). Blank is left to
// the `empty` rule; only a filled-in value is checked. A pattern the browser
// cannot compile is ignored rather than blocking the form.
export const profileFieldError = (field, value) => {
  if (!field?.pattern) return null;
  const v = value === undefined || value === null ? '' : String(value).trim();
  if (!v) return null;
  let re;
  try { re = new RegExp(field.pattern); } catch { return null; }
  if (re.test(v)) return null;
  return field.example
    ? i18n.t('profile.expectedLike', { ns: 'bridges', example: field.example })
    : i18n.t('profile.invalidFormat', { ns: 'bridges' });
};

const DynamicProfileEditor = ({
  type,
  profile = {},
  onChange,
  disabled = false,
  title,
  grouped = false,
  nestByType = false,
  ownTypeOnly = false,
  // (key) => Promise<string> — fetch a stored secret in the clear. Supplying it
  // adds a reveal button to `input: 'encrypted'` fields. Omit it and secrets
  // stay write-only, which is the right default for every editor except the
  // provider one (the reveal API route is provider-scoped and audited).
  onReveal = null,
  menuZIndex = null,
  // (valid: boolean) => void — told whenever the pattern check of the visible
  // fields changes, so a dialog can refuse to save a malformed value.
  onValidityChange = null,
}) => {
  const { t } = useTranslation('bridges');
  const heading = title === undefined ? t('profile.title') : title;
  // Encrypted fields shown as text after a successful reveal.
  const [shown, setShown] = useState({});
  // When rendered inside a raised-zIndex dialog (e.g. a bridge at Z.L2/L3),
  // Select dropdowns must render above it or they open hidden behind the dialog.
  const selectMenuProps = menuZIndex
    ? { style: { zIndex: menuZIndex }, PaperProps: { sx: { zIndex: menuZIndex } } }
    : undefined;
  // Pretty label for a group key (e.g. "environment" -> "Application")
  const formatGroupLabel = (key) =>
    String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  // The API masks `input: 'encrypted'` values as ****last4 (Vault.mask) so a
  // secret never reaches the browser. Sending the mask back means "unchanged".
  const isMasked = (v) => typeof v === 'string' && v.startsWith('****');

  // A field's type = key prefix before '.' (e.g. "environment.domain" -> "environment");
  // fields with no prefix belong to the editor's own type (e.g. "customer").
  const getFieldType = useCallback(
    (field) => (field.key && field.key.includes('.') ? field.key.split('.')[0] : (type || 'general')),
    [type]
  );
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});

  // Fetch profile params on mount or type change
  useEffect(() => {
    const fetchParams = async () => {
      if (!type) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const all = await profileParamsApi.getProfileParams(type);

        // Drop inherited child-type fields when asked. A namespaced key always
        // carries the "<child_type>." prefix the API builds in
        // Profile.namespace_key, so the dot is the whole test.
        const params = ownTypeOnly
          ? all.filter((f) => !String(f.key || '').includes('.'))
          : all;
        setFields(params);

        if (nestByType) {
          // Start with every type group collapsed; the user expands each via
          // the "+" affordance.
          setExpandedSections({});
        } else if (grouped) {
          const sectionsToExpand = {};
          params.forEach((field) => {
            if (field.empty === false) sectionsToExpand[field.section || 'Other'] = true;
          });
          if (params.length > 0) sectionsToExpand[params[0].section || 'Other'] = true;
          setExpandedSections(sectionsToExpand);
        }
      } catch (err) {
        console.error('Error fetching profile params:', err);
        setError(t('profile.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    fetchParams();
  }, [type]);

  // Initialize values from profile when fields or profile change
  useEffect(() => {
    if (fields.length === 0) return;

    const initialValues = {};
    fields.forEach((field) => {
      if (profile && profile[field.key] !== undefined && profile[field.key] !== null) {
        // Handle numeric conversion
        if (field.input === 'numeric') {
          initialValues[field.key] = Number(profile[field.key]) || 0;
        } else if (field.input === 'boolean') {
          initialValues[field.key] = profile[field.key] === true || profile[field.key] === 'true';
        } else if (field.input === 'multi_select') {
          initialValues[field.key] = Array.isArray(profile[field.key])
            ? profile[field.key]
            : [];
        } else {
          initialValues[field.key] = profile[field.key];
        }
      } else {
        // Use default value
        if (field.input === 'multi_select') {
          initialValues[field.key] = Array.isArray(field.value) ? field.value : [];
        } else if (field.input === 'boolean') {
          initialValues[field.key] = field.value === true || field.value === 'true';
        } else if (field.input === 'numeric') {
          initialValues[field.key] = field.value !== undefined ? Number(field.value) : '';
        } else {
          initialValues[field.key] = field.value !== undefined ? field.value : '';
        }
      }
    });
    setValues(initialValues);
  }, [fields, profile]);

  // Check if a field should be visible based on depends_on condition
  const isFieldVisible = useCallback((field) => {
    if (!field.depends_on) return true;
    const { key, value } = field.depends_on;
    return Array.isArray(value) ? value.includes(values[key]) : values[key] === value;
  }, [values]);

  // Report whether every visible field passes its pattern.
  const allValid = fields.every((f) => !isFieldVisible(f) || !profileFieldError(f, values[f.key]));
  useEffect(() => {
    if (onValidityChange) onValidityChange(allValid);
  }, [allValid, onValidityChange]);

  // Filter values to only include visible fields before notifying parent
  const getVisibleValues = useCallback((allValues) => {
    const visible = {};
    fields.forEach((field) => {
      const dep = field.depends_on;
      if (!dep) {
        visible[field.key] = allValues[field.key];
      } else {
        const depVal = allValues[dep.key];
        const match = Array.isArray(dep.value) ? dep.value.includes(depVal) : depVal === dep.value;
        if (match) {
          visible[field.key] = allValues[field.key];
        }
      }
    });
    return visible;
  }, [fields]);

  // Handle field value change
  const handleFieldChange = useCallback(
    (key, value) => {
      setValues((prev) => {
        const newValues = { ...prev, [key]: value };
        // Notify parent with only visible field values
        if (onChange) {
          onChange(getVisibleValues(newValues));
        }
        return newValues;
      });
    },
    [onChange, getVisibleValues]
  );

  // Group fields by section (only used when grouped=true)
  const sections = useMemo(() => {
    if (!grouped) return [];
    const grouped_map = {};
    fields.forEach((field) => {
      const section = field.section || 'Other';
      if (!grouped_map[section]) grouped_map[section] = { name: section, fields: [], hasRequired: false };
      grouped_map[section].fields.push(field);
      if (field.empty === false) grouped_map[section].hasRequired = true;
    });
    return Object.values(grouped_map);
  }, [fields, grouped]);

  // Two-level grouping: type (outer) -> section (inner) -> fields.
  // Used by the customer editor so each inherited child type (environment,
  // tariff, ...) is its own collapsible group, with its sections inside.
  const typeGroups = useMemo(() => {
    if (!nestByType) return [];
    const map = {};
    fields.forEach((field) => {
      const fieldType = getFieldType(field);
      if (!map[fieldType]) map[fieldType] = { name: fieldType, fields: [], hasRequired: false, _sec: {} };
      map[fieldType].fields.push(field);
      if (field.empty === false) map[fieldType].hasRequired = true;
      const sec = field.section || 'Other';
      if (!map[fieldType]._sec[sec]) map[fieldType]._sec[sec] = { name: sec, fields: [] };
      map[fieldType]._sec[sec].fields.push(field);
    });
    // Editor's own type (e.g. "customer") first, then the rest alphabetically.
    return Object.values(map)
      .map((g) => ({ ...g, sections: Object.values(g._sec) }))
      .sort((a, b) => {
        if (a.name === type) return -1;
        if (b.name === type) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [fields, nestByType, getFieldType, type]);

  const handleSectionToggle = (sectionName) => {
    setExpandedSections((prev) => ({ ...prev, [sectionName]: !prev[sectionName] }));
  };

  // Helper to safely get options array from field
  const getFieldOptions = (field) => {
    const options = field.select_options || field.options;
    if (Array.isArray(options)) {
      return options;
    }
    // If it's an object, convert to array format
    if (options && typeof options === 'object') {
      return Object.entries(options).map(([key, value]) => ({
        name: typeof value === 'string' ? value : key,
        val: key
      }));
    }
    return [];
  };

  // Render field based on input type
  const renderField = (field) => {
    const value = values[field.key];
    const isRequired = field.empty === false;
    const hasError = isRequired && (value === '' || value === undefined || value === null);
    const formatError = profileFieldError(field, value);

    switch (field.input) {
      case 'string':
        return (
          <TextField
            fullWidth
            size="small"
            value={value || ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.example || field.label || ''}
            disabled={disabled}
            error={hasError || !!formatError}
            helperText={formatError}
            required={isRequired}
            inputProps={{ 'data-testid': `profile-field-${field.key}` }}
          />
        );

      // A secret, declared in the API's config/profile.yml as `input: 'encrypted'`
      // (see Profile.secret_field?). Stored encrypted at rest — AES-256-GCM under
      // the customer's derived key — and never sent here in the clear: the API
      // serializes it as ****last4.
      //
      // Sending that mask back means "unchanged"; the API restores the stored
      // ciphertext rather than saving the mask. So we leave the mask in place
      // and clear it on focus, which is what distinguishes "type a new secret"
      // from "leave it alone" without needing a separate checkbox.
      case 'encrypted':
        return (
          <SecretField
            fullWidth
            size="small"
            revealed={!!shown[field.key]}
            value={value || ''}
            onFocus={() => { if (isMasked(value)) handleFieldChange(field.key, ''); }}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={isMasked(value) ? '' : (field.label || '')}
            helperText={isMasked(value) ? t('profile.storedSecret') : undefined}
            disabled={disabled}
            error={hasError}
            required={isRequired}
            InputProps={{
              // Reveal only when the parent supplies onReveal — it hits the
              // audited action=reveal route, so it is a deliberate capability,
              // not something every editor gets.
              endAdornment: onReveal && isMasked(value) ? (
                <InputAdornment position="end">
                  <Tooltip title={t('profile.revealSecret')}>
                    <IconButton
                      size="small"
                      edge="end"
                      disabled={disabled}
                      onClick={async () => {
                        const secret = await onReveal(field.key);
                        if (secret != null) {
                          handleFieldChange(field.key, secret);
                          setShown((p) => ({ ...p, [field.key]: true }));
                        }
                      }}
                    >
                      <LockOpenIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ) : undefined,
            }}
          />
        );

      case 'numeric':
        return (
          <TextField
            fullWidth
            size="small"
            type="number"
            value={value !== undefined && value !== '' ? value : ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value ? Number(e.target.value) : '')}
            placeholder={field.label || ''}
            disabled={disabled}
            error={hasError}
            required={isRequired}
            inputProps={{ min: 0 }}
          />
        );

      case 'boolean':
        return (
          <FormControlLabel
            control={
              <Switch
                checked={value === true}
                onChange={(e) => handleFieldChange(field.key, e.target.checked)}
                disabled={disabled}
                size="small"
              />
            }
            label={value ? t('profile.yes') : t('profile.no')}
          />
        );

      case 'select': {
        const selectOptions = getFieldOptions(field);
        return (
          <FormControl fullWidth size="small" error={hasError} required={isRequired}>
            <Select
              value={value || ''}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              disabled={disabled}
              displayEmpty
              MenuProps={selectMenuProps}
            >
              <MenuItem value="">
                <em>{t('profile.select')}</em>
              </MenuItem>
              {selectOptions.map((option, idx) => (
                <MenuItem key={option.val || option.value || idx} value={option.val || option.value}>
                  {option.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      }

      case 'multi_select': {
        const multiOptions = getFieldOptions(field);
        return (
          <FormControl fullWidth size="small" error={hasError} required={isRequired}>
            <Select
              multiple
              value={Array.isArray(value) ? value : []}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              disabled={disabled}
              MenuProps={selectMenuProps}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((val) => {
                    const option = multiOptions.find(
                      (o) => (o.val || o.value) === val
                    );
                    return (
                      <Chip key={val} label={option?.name || val} size="small" />
                    );
                  })}
                </Box>
              )}
            >
              {multiOptions.map((option, idx) => (
                <MenuItem key={option.val || option.value || idx} value={option.val || option.value}>
                  {option.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      }

      case 'color':
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              component="input"
              type="color"
              value={value || '#000000'}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              disabled={disabled}
              sx={{
                width: 40,
                height: 40,
                p: 0.25,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                cursor: disabled ? 'default' : 'pointer',
                '&::-webkit-color-swatch-wrapper': { p: 0 },
                '&::-webkit-color-swatch': { border: 'none', borderRadius: 0.5 },
              }}
            />
            <TextField
              size="small"
              value={value || ''}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              placeholder="#000000"
              disabled={disabled}
              error={hasError}
              required={isRequired}
              sx={{ width: 130 }}
              inputProps={{ style: { fontFamily: 'monospace' } }}
            />
          </Box>
        );

      case 'image':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              value={value || ''}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              placeholder="https://example.com/image.png"
              disabled={disabled}
              error={hasError}
              required={isRequired}
            />
            {value && value !== 'test' && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  backgroundColor: 'var(--mui-palette-surface-muted)',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box
                  component="img"
                  src={value}
                  alt={field.name}
                  sx={{
                    maxWidth: 120,
                    maxHeight: 40,
                    objectFit: 'contain',
                  }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </Box>
            )}
          </Box>
        );

      case 'textarea':
        return (
          <TextField
            fullWidth
            size="small"
            multiline
            rows={3}
            value={value || ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.label || ''}
            disabled={disabled}
            error={hasError}
            required={isRequired}
          />
        );

      case 'date':
        return (
          <TextField
            fullWidth
            size="small"
            type="date"
            value={value || ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            disabled={disabled}
            error={hasError}
            required={isRequired}
            InputLabelProps={{ shrink: true }}
          />
        );

      default:
        // Default to string input
        return (
          <TextField
            fullWidth
            size="small"
            value={value || ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.label || ''}
            disabled={disabled}
            error={hasError}
            required={isRequired}
          />
        );
    }
  };

  // Loading state
  if (loading) {
    return (
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          {t('profile.loading')}
        </Typography>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">{error}</Alert>
      </Box>
    );
  }

  // No fields
  if (fields.length === 0) {
    // Kept visible, and worded so it is not mistaken for a failure: an empty
    // section and a refused request used to look identical. An error renders in
    // the branch above; reaching here means the server answered, with nothing.
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {t('profile.noFields')}
        </Typography>
      </Box>
    );
  }

  const visibleFields = fields.filter(isFieldVisible);

  const renderFieldRow = (field) => (
    <TableRow key={field.key}>
      <TableCell sx={{ width: '35%', fontWeight: 500, verticalAlign: 'middle', py: 1, border: 'none' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {field.name}
          {field.empty === false && <Typography component="span" color="error">*</Typography>}
          {field.notes && (
            <Tooltip title={field.notes} arrow>
              <IconButton size="small" sx={{ p: 0.25 }}>
                <InfoIcon fontSize="small" color="action" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </TableCell>
      <TableCell sx={{ py: 1, border: 'none' }}>{renderField(field)}</TableCell>
    </TableRow>
  );

  return (
    <Box sx={{ width: '100%' }}>
      {heading && (
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          {heading}
        </Typography>
      )}

      {nestByType ? (
        typeGroups.map((tg) => {
          const tgVisible = tg.fields.filter(isFieldVisible);
          if (tgVisible.length === 0) return null;
          const showSectionHeaders = tg.sections.filter((s) => s.fields.some(isFieldVisible)).length > 1;
          return (
            <Accordion
              key={tg.name}
              expanded={expandedSections[tg.name] || false}
              onChange={() => handleSectionToggle(tg.name)}
              sx={{ mb: 1, '&:before': { display: 'none' }, boxShadow: 1 }}
            >
              <AccordionSummary expandIcon={<AddIcon />} sx={{ minHeight: 48, '&.Mui-expanded': { minHeight: 48 }, '& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': { transform: 'rotate(45deg)' } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography fontWeight={600}>{formatGroupLabel(tg.name)}</Typography>
                  {tg.hasRequired && (
                    <Chip label={t('profile.required')} size="small" color="error" sx={{ height: 20, fontSize: '0.7rem' }} />
                  )}
                  <Chip label={tgVisible.length} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                {tg.sections.map((sec) => {
                  const secVisible = sec.fields.filter(isFieldVisible);
                  if (secVisible.length === 0) return null;
                  return (
                    <Box key={sec.name}>
                      {showSectionHeaders && (
                        <Typography
                          variant="caption"
                          sx={{ display: 'block', px: 2, pt: 1, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}
                        >
                          {sec.name}
                        </Typography>
                      )}
                      <Table size="small"><TableBody>{secVisible.map(renderFieldRow)}</TableBody></Table>
                    </Box>
                  );
                })}
              </AccordionDetails>
            </Accordion>
          );
        })
      ) : grouped ? (
        sections.map((section) => {
          const sectionVisible = section.fields.filter(isFieldVisible);
          if (sectionVisible.length === 0) return null;
          return (
            <Accordion
              key={section.name}
              expanded={expandedSections[section.name] || false}
              onChange={() => handleSectionToggle(section.name)}
              sx={{ mb: 1, '&:before': { display: 'none' }, boxShadow: 1 }}
            >
              <AccordionSummary expandIcon={<AddIcon />} sx={{ minHeight: 48, '&.Mui-expanded': { minHeight: 48 }, '& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': { transform: 'rotate(45deg)' } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography fontWeight={600}>{section.name}</Typography>
                  {section.hasRequired && (
                    <Chip label={t('profile.required')} size="small" color="error" sx={{ height: 20, fontSize: '0.7rem' }} />
                  )}
                  <Chip label={sectionVisible.length} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                <Table size="small"><TableBody>{sectionVisible.map(renderFieldRow)}</TableBody></Table>
              </AccordionDetails>
            </Accordion>
          );
        })
      ) : (
        <Table size="small"><TableBody>{visibleFields.map(renderFieldRow)}</TableBody></Table>
      )}
    </Box>
  );
};

export default DynamicProfileEditor;
