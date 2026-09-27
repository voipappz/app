import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Chip,
  Paper,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useState } from 'react';

/**
 * SubscriptionsFilters Component
 * Comprehensive filtering interface for subscriptions based on research findings
 */
const SubscriptionsFilters = ({
  filters,
  onFiltersChange,
  onResetFilters,
  plans,
  plansLoading,
  statuses,
  environments,
  loading
}) => {
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const handleFilterChange = (field, value) => {
    onFiltersChange({ [field]: value });
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  const getFilterCount = () => {
    return Object.values(filters).filter(value => value !== '').length;
  };

  return (
    <Paper elevation={1} sx={{ mb: 2 }}>
      <Accordion
        expanded={filtersExpanded}
        onChange={() => setFiltersExpanded(!filtersExpanded)}
        elevation={0}
        sx={{ '&:before': { display: 'none' } }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            minHeight: 56,
            '&.Mui-expanded': { minHeight: 56 },
            bgcolor: hasActiveFilters ? 'primary.50' : 'background.paper',
            borderBottom: '1px solid var(--mui-palette-divider)'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
            <FilterListIcon color={hasActiveFilters ? 'primary' : 'action'} />
            <Typography variant="h6" fontWeight={600}>
              Filters
            </Typography>
            {hasActiveFilters && (
              <Chip
                label={`${getFilterCount()} active`}
                size="small"
                color="primary"
                sx={{ height: 24, fontSize: '0.75rem' }}
              />
            )}
            <Box sx={{ flexGrow: 1 }} />
            {hasActiveFilters && (
              <Tooltip title="Clear all filters">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResetFilters();
                  }}
                  disabled={loading}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </AccordionSummary>

        <AccordionDetails sx={{ p: 3 }}>
          <Grid container spacing={2}>
            {/* Text Search Filters */}
            <Grid size={12}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                Search Filters
              </Typography>
            </Grid>
            
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Name"
                placeholder="Search by subscription name"
                value={filters.name}
                onChange={(e) => handleFilterChange('name', e.target.value)}
                InputProps={{
                  endAdornment: (
                    <SearchIcon color="action" sx={{ mr: 1 }} />
                  )
                }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Balance"
                placeholder="Search by balance amount"
                value={filters.balance}
                onChange={(e) => handleFilterChange('balance', e.target.value)}
                type="number"
                InputProps={{
                  startAdornment: <Typography variant="body2" sx={{ mr: 1, color: 'text.secondary' }}>$</Typography>
                }}
              />
            </Grid>

            {/* Dropdown Filters */}
            <Grid size={12}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, mb: 2, mt: 2 }}>
                Category Filters
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Application</InputLabel>
                <Select
                  value={filters.environment_uuid}
                  label="Application"
                  onChange={(e) => handleFilterChange('environment_uuid', e.target.value)}
                  disabled={loading}
                >
                  <MenuItem value="">All Applications</MenuItem>
                  {environments?.map(env => (
                    <MenuItem key={env.uuid} value={env.uuid}>
                      {env.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.status}
                  label="Status"
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  disabled={loading}
                >
                  <MenuItem value="">All Statuses</MenuItem>
                  {statuses?.map(status => (
                    <MenuItem key={status.value || status} value={status.value || status}>
                      {status.label || status}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Plan</InputLabel>
                <Select
                  value={filters.plan_uuid}
                  label="Plan"
                  onChange={(e) => handleFilterChange('plan_uuid', e.target.value)}
                  disabled={loading || plansLoading}
                >
                  <MenuItem value="">All Plans</MenuItem>
                  {plans?.map(plan => (
                    <MenuItem key={plan.uuid} value={plan.uuid}>
                      {plan.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Recurring</InputLabel>
                <Select
                  value={filters.recurring}
                  label="Recurring"
                  onChange={(e) => handleFilterChange('recurring', e.target.value)}
                  disabled={loading}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Date Range Filters */}
            <Grid size={12}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, mb: 2, mt: 2 }}>
                Date Range Filters
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Created Date
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  label="From"
                  type="date"
                  value={filters.created_at_from}
                  onChange={(e) => handleFilterChange('created_at_from', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  label="To"
                  type="date"
                  value={filters.created_at_to}
                  onChange={(e) => handleFilterChange('created_at_to', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Updated Date
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  label="From"
                  type="date"
                  value={filters.updated_at_from}
                  onChange={(e) => handleFilterChange('updated_at_from', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  label="To"
                  type="date"
                  value={filters.updated_at_to}
                  onChange={(e) => handleFilterChange('updated_at_to', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                End Date
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  label="From"
                  type="date"
                  value={filters.ends_at_from}
                  onChange={(e) => handleFilterChange('ends_at_from', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  label="To"
                  type="date"
                  value={filters.ends_at_to}
                  onChange={(e) => handleFilterChange('ends_at_to', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Box>
            </Grid>

            {/* Action Buttons */}
            {hasActiveFilters && (
              <Grid size={12}>
                <Box sx={{ display: 'flex', gap: 1, mt: 2, pt: 2, borderTop: '1px solid var(--mui-palette-divider)' }}>
                  <Button
                    variant="outlined"
                    color="inherit"
                    startIcon={<ClearIcon />}
                    onClick={onResetFilters}
                    disabled={loading}
                  >
                    Clear All Filters
                  </Button>
                </Box>
              </Grid>
            )}
          </Grid>
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
};

export default SubscriptionsFilters;