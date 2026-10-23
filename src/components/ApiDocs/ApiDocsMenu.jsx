import { useState } from 'react';
import {
  Box, Collapse, IconButton, InputAdornment, List, ListItemButton, ListItemText, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';

// Swagger's own method colours, through the palette so they follow dark mode.
const METHOD_COLOR = {
  get: 'info.main', post: 'success.main', put: 'warning.main', patch: 'warning.main', delete: 'error.main',
};

const sameOperation = (selection, row) => selection?.path === row.path
  && selection?.method === row.method && selection?.tag === row.tag;

const MethodLabel = ({ method }) => (
  <Typography component="span" sx={{
    flex: '0 0 46px', fontFamily: 'monospace', fontSize: '0.66rem', fontWeight: 700,
    textTransform: 'uppercase', color: METHOD_COLOR[method] || 'text.secondary',
  }}>
    {method}
  </Typography>
);

/**
 * The DevZone side menu: a search box over the contract, then every category
 * (OpenAPI tag) with its operations. While a search is typed every category
 * with a match is open; otherwise a category opens when it is clicked.
 */
export default function ApiDocsMenu({
  groups, query, onQueryChange, selection, onSelect, total,
}) {
  const [open, setOpen] = useState({});
  const searching = query.trim().length > 0;
  const shown = groups.reduce((n, group) => n + group.operations.length, 0);

  const selectTag = (tag) => {
    setOpen((current) => ({ ...current, [tag]: selection?.tag === tag && !selection.path ? !current[tag] : true }));
    onSelect({ tag });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 1.5, pb: 1 }}>
        <TextField
          size="small" fullWidth autoComplete="off" placeholder="Search path, method, summary..."
          value={query} onChange={(event) => onQueryChange(event.target.value)}
          inputProps={{ 'aria-label': 'Search the API' }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            endAdornment: query && (
              <InputAdornment position="end">
                <IconButton size="small" aria-label="Clear search" onClick={() => onQueryChange('')}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          {searching ? `${shown} of ${total} endpoints` : `${groups.length} categories, ${total} endpoints`}
        </Typography>
      </Box>

      <List dense disablePadding component="nav" aria-label="API categories" sx={{ flex: 1, overflowY: 'auto', minHeight: 0, pb: 1 }}>
        <ListItemButton selected={!selection} onClick={() => onSelect(null)} sx={{ px: 1.5 }}>
          <ListItemText primary="All endpoints" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.82rem' }} />
        </ListItemButton>
        {groups.map(({ tag, operations }) => {
          const expanded = searching || !!open[tag];
          return (
            <Box key={tag}>
              <ListItemButton
                selected={selection?.tag === tag && !selection.path} onClick={() => selectTag(tag)}
                aria-expanded={expanded} sx={{ px: 1.5 }}
              >
                <ListItemText primary={tag} primaryTypographyProps={{ fontSize: '0.82rem', fontWeight: 500, noWrap: true }} />
                <Typography variant="caption" color="text.secondary" sx={{ mx: 0.5 }}>{operations.length}</Typography>
                {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </ListItemButton>
              <Collapse in={expanded} timeout="auto" unmountOnExit>
                <List dense disablePadding>
                  {operations.map((row) => (
                    <ListItemButton
                      key={`${row.method} ${row.path}`} selected={sameOperation(selection, row)}
                      onClick={() => onSelect({ tag, path: row.path, method: row.method })}
                      title={row.summary || undefined} sx={{ ps: 3, pe: 1.5, py: 0.25, gap: 0.5 }}
                    >
                      <MethodLabel method={row.method} />
                      <ListItemText
                        primary={row.path}
                        primaryTypographyProps={{ fontFamily: 'monospace', fontSize: '0.72rem', noWrap: true }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </Box>
          );
        })}
        {!groups.length && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 2, fontStyle: 'italic' }}>
            No endpoints match.
          </Typography>
        )}
      </List>
    </Box>
  );
}
