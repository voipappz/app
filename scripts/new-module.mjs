#!/usr/bin/env node
// Scaffold a feature module in the repo's canonical shape (the Calls blueprint,
// documented in DEVELOPING.md §5): service → hook → component (+ service test).
//
//   make module NAME=Agent                  → /api/agents endpoint assumed
//   make module NAME=Agent ENDPOINT=/api/team-agents
//
// Generates:
//   src/services/<name>Api.js         endpoint + query + row normalization
//   src/services/<name>Api.test.js    unit test, mocked at the apiList boundary
//   src/components/<Name>/use<Name>s.js   the module's own hook
//   src/components/<Name>/<Name>.jsx      the page (MUI table + paging)
// then prints the two registration lines (route + menu). Never overwrites.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rawName = process.argv[2];
if (!rawName || !/^[A-Za-z][A-Za-z0-9]*$/.test(rawName)) {
  console.error('usage: make module NAME=Foo [ENDPOINT=/api/foos]   (NAME: letters/digits, e.g. Agent)');
  process.exit(1);
}
const Name = rawName[0].toUpperCase() + rawName.slice(1);   // Agent
const name = Name[0].toLowerCase() + Name.slice(1);         // agent
const plural = `${name}s`;                                  // agents
const endpoint = process.argv[3] || `/api/${plural}`;

const root = resolve(new URL('..', import.meta.url).pathname);
const files = {
  [`src/services/${name}Api.js`]: `// ${Name} service — knows the endpoint, query params, and row shape.
// Components never build URLs; they use the use${Name}s hook.
import { apiList } from '../lib/clients/api';

export function build${Name}sQuery({ page = 1, perPage = 20, search = {} } = {}) {
  const p = new URLSearchParams();
  p.set('page', String(page));
  p.set('per_page', String(perPage));
  for (const [field, value] of Object.entries(search)) {
    if (value !== undefined && value !== '') p.set(\`search[\${field}]\`, String(value));
  }
  return p.toString();
}

export function normalize${Name}(row) {
  return {
    id: row.uuid ?? row.id,
    // TODO: flatten the fields the UI needs, e.g. name: row.name,
    raw: row,
  };
}

export async function get${Name}s(opts = {}) {
  const { rows, total } = await apiList(\`${endpoint}?\${build${Name}sQuery(opts)}\`);
  return { rows: rows.map(normalize${Name}), total };
}
`,

  [`src/services/${name}Api.test.js`]: `import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock at the apiList boundary — never the network (repo convention).
vi.mock('../lib/clients/api', () => ({ apiList: vi.fn() }));
import { apiList } from '../lib/clients/api';
import { build${Name}sQuery, normalize${Name}, get${Name}s } from './${name}Api';

describe('${name}Api', () => {
  beforeEach(() => vi.mocked(apiList).mockReset());

  it('builds paged queries with search params', () => {
    expect(build${Name}sQuery({ page: 2, perPage: 10, search: { name: 'x' } }))
      .toBe('page=2&per_page=10&search%5Bname%5D=x');
  });

  it('normalizes rows and keeps the raw payload', () => {
    const n = normalize${Name}({ uuid: 'u1', extra: 1 });
    expect(n.id).toBe('u1');
    expect(n.raw.extra).toBe(1);
  });

  it('fetches through apiList and returns rows + total', async () => {
    vi.mocked(apiList).mockResolvedValue({ rows: [{ uuid: 'u1' }], total: 7 });
    const { rows, total } = await get${Name}s();
    expect(apiList).toHaveBeenCalledWith(expect.stringContaining('${endpoint}?'));
    expect(rows[0].id).toBe('u1');
    expect(total).toBe(7);
  });
});
`,

  [`src/components/${Name}/use${Name}s.js`]: `// use${Name}s — this module's own hook (repo convention: hooks are not shared
// between components). Server-side paging via the ${name}Api service.
import { useEffect, useState } from 'react';
import { get${Name}s } from '../../services/${name}Api';

export function use${Name}s({ perPage: initialPerPage = 20 } = {}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);          // zero-based for TablePagination
  const [perPage, setPerPage] = useState(initialPerPage);
  const [search, setSearch] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    get${Name}s({ page: page + 1, perPage, search })
      .then(({ rows, total }) => { if (alive) { setRows(rows); setTotal(total); setError(null); } })
      .catch((err) => { if (alive) { setRows([]); setTotal(0); setError(err); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page, perPage, search]);

  return { rows, total, page, setPage, perPage, setPerPage, search, setSearch, loading, error };
}
`,

  [`src/components/${Name}/${Name}.jsx`]: `// ${Name} — scaffolded from the Calls blueprint (DEVELOPING.md §5).
// TODO: replace the placeholder columns; reuse common/Filters.jsx for search.
import {
  Alert, Box, CircularProgress, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { use${Name}s } from './use${Name}s';

export default function ${Name}() {
  const { t } = useTranslation();
  const { rows, total, page, setPage, perPage, setPerPage, loading, error } = use${Name}s();

  if (error) return <Alert severity="warning">{error.message}</Alert>;

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>{t('menu.${plural}', '${Name}s')}</Typography>
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('common.id', 'ID')}</TableCell>
                {/* TODO: real columns from normalize${Name} */}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell align="center"><CircularProgress size={22} sx={{ my: 3 }} /></TableCell></TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.id}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={perPage}
          onRowsPerPageChange={(e) => { setPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]}
        />
      </Paper>
    </Box>
  );
}
`,
};

const created = [];
for (const [rel, content] of Object.entries(files)) {
  const abs = resolve(root, rel);
  if (existsSync(abs)) {
    console.error(`refusing to overwrite ${rel} — module already exists?`);
    process.exit(1);
  }
  mkdirSync(resolve(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
  created.push(rel);
}

console.log(`✔ ${Name} module scaffolded (endpoint ${endpoint}):`);
for (const f of created) console.log(`   ${f}`);
console.log(`
Register it (two lines):
  src/App.jsx:
    import ${Name} from './components/${Name}/${Name}.jsx';
    <Route path="/${plural}" element={<ProtectedRoute><Layout><${Name} /></Layout></ProtectedRoute>} />
  src/components/MainMenu/MainMenu.jsx (items array):
    { icon: <DashboardIcon />, text: t('menu.${plural}', '${Name}s'), path: '/${plural}', permission: 'dashboard:read' },

Then: npm run test:run   (the scaffolded service test should pass)`);
