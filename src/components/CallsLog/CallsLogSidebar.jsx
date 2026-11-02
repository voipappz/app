import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Paper,
  Typography,
  TextField,
  FormControl,
  FormGroup,
  FormControlLabel,
  Checkbox,
  RadioGroup,
  Radio,
  Button,
  Divider,
  InputAdornment,
  IconButton,
  Chip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';

const LOG_LEVELS = [
  { key: 'fatal', color: '#F08080' },
  { key: 'error', color: '#FFA07A' },
  { key: 'warn', color: '#F0E68C' },
  { key: 'info', color: '#00FA9A' },
  { key: 'debug', color: '#ADD8E6' },
  { key: 'trace', color: '#D3D3D3' },
];

const TIME_PERIODS = [
  { value: 'today' },
  { value: 'yesterday' },
  { value: 'week' },
  { value: 'month' },
  { value: 'year' },
  { value: 'all' },
];

const CallsLogSidebar = ({
  apps,
  filters,
  searchQuery,
  selectedApp,
  timePeriod,
  tagFilters,
  onSearchChange,
  onAppChange,
  onTimePeriodChange,
  onToggleLogLevel,
  onRemoveTagFilter,
  onApply,
  onClear,
}) => {
  const { t } = useTranslation('callsLog');
  return (
    <Paper
      className="calls-log-sidebar"
      sx={{
        width: 280,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        borderInlineEnd: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FilterIcon fontSize="small" />
          {t('filters.title')}
        </Typography>
      </Box>

      {/* Scrollable Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {/* Search */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {t('filters.search')}
          </Typography>
          <TextField
            size="small"
            fullWidth
            placeholder={t('filters.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => onSearchChange('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Application Filter */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {t('filters.application')}
          </Typography>
          <FormControl component="fieldset" size="small">
            <RadioGroup
              value={selectedApp}
              onChange={(e) => onAppChange(e.target.value)}
            >
              <FormControlLabel
                value=""
                control={<Radio size="small" />}
                label={t('filters.allApps')}
              />
              {apps.map((app) => (
                <FormControlLabel
                  key={app}
                  value={app}
                  control={<Radio size="small" />}
                  label={app}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Log Level Filter */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {t('filters.logLevel')}
          </Typography>
          <FormGroup>
            {LOG_LEVELS.map((level) => (
              <FormControlLabel
                key={level.key}
                control={
                  <Checkbox
                    size="small"
                    checked={filters.logLevels[level.key] || false}
                    onChange={() => onToggleLogLevel(level.key)}
                    sx={{
                      color: level.color,
                      '&.Mui-checked': { color: level.color },
                    }}
                  />
                }
                label={
                  <Chip
                    label={t(`level.${level.key}`)}
                    size="small"
                    sx={{
                      backgroundColor: level.color,
                      color: 'black',
                      fontWeight: 500,
                    }}
                  />
                }
              />
            ))}
          </FormGroup>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Time Period Filter */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {t('filters.timePeriod')}
          </Typography>
          <FormControl component="fieldset" size="small">
            <RadioGroup
              value={timePeriod}
              onChange={(e) => onTimePeriodChange(e.target.value)}
            >
              {TIME_PERIODS.map((period) => (
                <FormControlLabel
                  key={period.value}
                  value={period.value}
                  control={<Radio size="small" />}
                  label={t(`period.${period.value}`)}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </Box>

        {/* Active Tag Filters */}
        {tagFilters.length > 0 && (
          <>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('filters.activeTags')}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {tagFilters.map((tag, index) => (
                  <Chip
                    key={`${tag.key}-${tag.value}-${index}`}
                    label={`${tag.key}: ${tag.value}`}
                    size="small"
                    onDelete={() => onRemoveTagFilter(index)}
                    variant="outlined"
                  />
                ))}
              </Box>
            </Box>
          </>
        )}
      </Box>

      {/* Footer Actions */}
      <Box
        sx={{
          p: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          gap: 1,
        }}
      >
        <Button
          variant="contained"
          size="small"
          fullWidth
          onClick={onApply}
        >
          {t('filters.apply')}
        </Button>
        <Button
          variant="outlined"
          size="small"
          fullWidth
          onClick={onClear}
        >
          {t('filters.clear')}
        </Button>
      </Box>
    </Paper>
  );
};

export default CallsLogSidebar;
