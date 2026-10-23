import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Drawer, Stack, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import { config } from '../../config.js';
import { type } from '../../theme/tokens.js';
import ApiDocsMenu from './ApiDocsMenu.jsx';
import {
  filterSpec, groupByTag, indexOperations, matches, searchWords,
} from './openapiIndex.js';

const MENU_WIDTH = 300;
const SEARCH_DEBOUNCE_MS = 250;

const publicFetchOptions = {
  credentials: 'omit',
  headers: { Accept: 'application/json' },
};

// Swagger UI ships its own light-only stylesheet; every colour here is a
// palette variable (theme.vars), so it follows the app's dark mode.
const swaggerSx = (theme) => {
  const p = (theme.vars || theme).palette;
  const text = p.text.primary;
  const muted = p.text.secondary;
  const border = p.divider;
  return {
    flex: '1 1 0', minWidth: 0, minHeight: 0, overflowY: 'auto', p: { xs: 1.5, md: 2.5 },
    color: text,
    '& .swagger-ui': { fontFamily: 'inherit', color: text },
    '& .swagger-ui .information-container, & .swagger-ui .filter-container': { display: 'none' },
    '& .swagger-ui .wrapper': { padding: 0, maxWidth: '100%' },
    '& .swagger-ui code, & .swagger-ui pre, & .swagger-ui .opblock-summary-path, & .swagger-ui .opblock-summary-operation-id': {
      fontFamily: type.mono,
    },
    '& .swagger-ui .scheme-container': {
      background: 'transparent', boxShadow: 'none', padding: '0 0 12px', margin: 0,
    },
    '& .swagger-ui .opblock-tag': {
      borderBottom: `1px solid ${border}`, color: text, fontSize: '1rem', fontFamily: 'inherit',
    },
    '& .swagger-ui .opblock-tag small, & .swagger-ui .opblock-summary-description': { color: muted, fontFamily: 'inherit' },
    '& .swagger-ui .opblock': {
      border: `1px solid ${border}`, borderRadius: `${theme.shape.borderRadius}px`, boxShadow: 'none',
      background: p.background.paper,
    },
    '& .swagger-ui .opblock .opblock-summary': { borderColor: border },
    '& .swagger-ui .opblock-summary-path, & .swagger-ui .opblock .opblock-summary-path__deprecated': { color: text },
    '& .swagger-ui .opblock-description-wrapper p, & .swagger-ui .opblock-title_normal p, & .swagger-ui .markdown p': {
      color: muted,
    },
    '& .swagger-ui .opblock .opblock-section-header': {
      background: p.surface.muted, boxShadow: 'none',
    },
    '& .swagger-ui .opblock .opblock-section-header h4, & .swagger-ui .tab li, & .swagger-ui .opblock-title, & .swagger-ui label': {
      color: text, fontFamily: 'inherit',
    },
    '& .swagger-ui table thead tr td, & .swagger-ui table thead tr th': {
      borderColor: border, color: muted,
    },
    '& .swagger-ui .parameter__name, & .swagger-ui .parameter__type, & .swagger-ui .parameter__in, & .swagger-ui .response-col_status, & .swagger-ui .response-col_links, & .swagger-ui .model-title, & .swagger-ui .model': {
      color: text,
    },
    '& .swagger-ui .model-box, & .swagger-ui section.models': {
      border: `1px solid ${border}`, background: p.background.paper,
    },
    '& .swagger-ui section.models h4, & .swagger-ui section.models .model-container': { color: text, background: 'transparent' },
    '& .swagger-ui input[type=text], & .swagger-ui input[type=password], & .swagger-ui input[type=search], & .swagger-ui textarea, & .swagger-ui select': {
      background: p.background.paper, color: text, border: `1px solid ${border}`,
      borderRadius: `${theme.shape.borderRadius}px`, fontFamily: 'inherit', boxShadow: 'none',
    },
    '& .swagger-ui .btn': {
      boxShadow: 'none', borderRadius: `${theme.shape.borderRadius}px`, fontFamily: 'inherit',
      color: text, borderColor: border,
    },
    '& .swagger-ui .btn.execute': { background: p.primary.main, borderColor: p.primary.main, color: p.primary.contrastText },
    '& .swagger-ui svg:not(:root)': { fill: 'currentColor' },
  };
};

const menuPaneSx = {
  width: MENU_WIDTH, flex: `0 0 ${MENU_WIDTH}px`, minHeight: 0,
  borderInlineEnd: 1, borderColor: 'divider', bgcolor: 'background.paper',
};

/** Swagger is the DevZone screen. MCP lives in its dedicated workspace. */
export default function ApiDocs() {
  const { access } = useAuth();
  const { isDarkMode } = useThemeMode();
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState('');
  const apiBaseUrl = config.apiBaseUrl.replace(/\/$/, '');
  const serverUrl = apiBaseUrl || window.location.origin;
  const openApiUrl = `${apiBaseUrl}/tasks/openapi.json`;

  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', isDarkMode);
    return () => document.documentElement.classList.remove('dark-mode');
  }, [isDarkMode]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    fetch(openApiUrl, publicFetchOptions)
      .then((response) => {
        if (!response.ok) throw new Error(`OpenAPI document returned HTTP ${response.status}`);
        return response.json();
      })
      .then((document) => {
        if (!cancelled) setSpec({
          ...document,
          servers: [{ url: serverUrl, description: 'Current API environment' }],
        });
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || 'Unable to load the OpenAPI document');
      });
    return () => { cancelled = true; };
  }, [openApiUrl, serverUrl]);

  const requestInterceptor = useMemo(() => (request) => {
    if (access) request.headers = { ...(request.headers || {}), Authorization: `Bearer ${access}` };
    return request;
  }, [access]);

  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [words, setWords] = useState([]);
  const [selection, setSelection] = useState(null);
  const contentRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setWords(searchWords(query)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const rows = useMemo(() => indexOperations(spec), [spec]);
  const groups = useMemo(
    () => groupByTag(spec, rows.filter((row) => matches(row, words))),
    [spec, rows, words],
  );
  const shownSpec = useMemo(() => filterSpec(spec, { words, selection }), [spec, words, selection]);

  const select = (next) => {
    setSelection(next);
    if (!wide) setMenuOpen(false);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };

  const menu = (
    <ApiDocsMenu
      groups={groups} query={query} onQueryChange={setQuery}
      selection={selection} onSelect={select} total={rows.length}
    />
  );

  return (
    <Box sx={{ display: 'flex', flex: '1 1 0', minHeight: 0, height: '100%' }}>
      {spec && wide && <Box sx={menuPaneSx}>{menu}</Box>}
      {spec && !wide && (
        <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} PaperProps={{ sx: { width: MENU_WIDTH } }}>
          {menu}
        </Drawer>
      )}
      <Box sx={swaggerSx} ref={contentRef} data-testid="swagger-screen">
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
              {selection?.tag || 'API Reference'}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {selection?.path
                ? `${selection.method.toUpperCase()} ${selection.path}`
                : 'Explore the live VoipAppz contract and try requests against this environment.'}
            </Typography>
          </Box>
          {spec && !wide && (
            <Button size="small" variant="outlined" startIcon={<MenuIcon />} onClick={() => setMenuOpen(true)}>
              Categories
            </Button>
          )}
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}
        {!error && !spec && (
          <Box sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={30} aria-label="Loading API reference" />
          </Box>
        )}
        {spec && !Object.keys(shownSpec.paths).length && (
          <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
            No endpoints match &ldquo;{query.trim()}&rdquo;.
          </Typography>
        )}
        {spec && Object.keys(shownSpec.paths).length > 0 && (
          <SwaggerUI
            spec={shownSpec} requestInterceptor={requestInterceptor} deepLinking docExpansion="list"
            defaultModelsExpandDepth={1} defaultModelExpandDepth={1} displayRequestDuration
            tryItOutEnabled validatorUrl={null}
          />
        )}
      </Box>
    </Box>
  );
}
