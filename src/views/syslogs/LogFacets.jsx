import { useState } from 'react';
import { Box, Typography, Paper, IconButton, CircularProgress } from '@mui/material';
import { formatNumber } from '../../utils/numberUtils';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

const LEVEL_COLORS = {
  // Fixed status steps (critical / warning) for the levels that ARE a state;
  // the informational levels take categorical slots. Validated with the
  // dataviz skill's palette checks.
  emerg: '#d03b3b', alert: '#d03b3b', crit: '#d03b3b', err: '#d03b3b', error: '#d03b3b',
  warning: '#fab219', warn: '#fab219', notice: '#1baf7a', info: '#2a78d6', debug: '#8a8a85',
};
const SHOWN = 8;

/**
 * The explorer's facet column, Datadog-style: each facet lists the values the
 * SERVER counted over the whole window, with their counts. Clicking a value
 * filters by it; clicking the selected value clears it.
 *
 * The aggregate lowercases tag values, so `canonical` maps a counted value
 * back to the exact name the filter needs (an app or node name as the server
 * lists it); values with no match are used as counted.
 */
export default function LogFacets({ facets = [], counts = {}, selected = {}, onSelect, canonical = (_, v) => v, loading }) {
  const [closed, setClosed] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (setter, key) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <Paper
      elevation={0}
      data-testid="syslog-facets"
      sx={{ width: 220, flexShrink: 0, overflow: 'auto', border: '1px solid var(--mui-palette-divider)', borderRadius: 1, bgcolor: 'var(--mui-palette-background-paper)', display: { xs: 'none', md: 'block' } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.25, py: 0.75, borderBottom: '1px solid var(--mui-palette-divider)' }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>Facets</Typography>
        {loading && <CircularProgress size={11} sx={{ ml: 'auto' }} />}
      </Box>
      {facets.map((facet) => {
        const values = counts[facet.key] || [];
        const current = selected[facet.param] || '';
        const isOpen = !closed.has(facet.key);
        const all = expanded.has(facet.key);
        const list = all ? values : values.slice(0, SHOWN);
        return (
          <Box key={facet.key} component="section" aria-label={`${facet.label} facet`} sx={{ borderBottom: '1px solid var(--mui-palette-divider)' }}>
            <Box
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => toggle(setClosed, facet.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(setClosed, facet.key); }}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
            >
              {isOpen ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{facet.label}</Typography>
              {current && <Typography sx={{ ml: 'auto', fontSize: '0.65rem', color: 'primary.main' }}>1 selected</Typography>}
            </Box>
            {isOpen && (
              <Box sx={{ pb: 0.5 }}>
                {list.length === 0 && (
                  <Typography sx={{ px: 1.5, py: 0.25, fontSize: '0.7rem', color: 'text.secondary' }}>{loading ? 'Counting…' : 'No values'}</Typography>
                )}
                {list.map(({ value, count }) => {
                  const name = canonical(facet.key, value);
                  const active = current && String(current).toLowerCase() === String(name).toLowerCase();
                  return (
                    <Box
                      key={value}
                      role="button"
                      tabIndex={0}
                      aria-pressed={Boolean(active)}
                      aria-label={`${facet.label} ${name}, ${count}`}
                      onClick={() => onSelect?.(facet.param, active ? '' : name)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.(facet.param, active ? '' : name); }}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 0.75, pl: 2.5, pr: 1, py: 0.2, cursor: 'pointer',
                        bgcolor: active ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      {facet.key === 'severity' && (
                        <Box sx={{ width: 8, height: 8, borderRadius: '2px', flexShrink: 0, bgcolor: LEVEL_COLORS[value] || '#94a3b8' }} />
                      )}
                      <Typography noWrap title={name} sx={{ flex: 1, minWidth: 0, fontSize: '0.72rem', fontWeight: active ? 700 : 400 }}>{name}</Typography>
                      <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(count)}</Typography>
                    </Box>
                  );
                })}
                {values.length > SHOWN && (
                  <Typography
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(setExpanded, facet.key)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(setExpanded, facet.key); }}
                    sx={{ pl: 2.5, py: 0.25, fontSize: '0.68rem', color: 'primary.main', cursor: 'pointer' }}
                  >
                    {all ? 'Show less' : `Show all ${values.length}`}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </Paper>
  );
}
