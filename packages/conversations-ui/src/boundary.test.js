import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// The package is rendered inside Connectix (live_react) as well as the admin
// app. It must stay pure: no app imports, no network, no auth. Data arrives
// as props; actions leave as callbacks.
const here = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = [
  /from ['"]\.\.\/\.\.\/(?!node_modules)/,           // reaching into the app
  /from ['"]@\//,                                     // the app's alias
  /useAIChat|aiMockService|AIChatSidebarContext/,
  /AuthContext|UserAuthContext|['"].*\/config['"]/,
  /\bfetch\(|axios|EventSource|WebSocket|phoenix|localStorage|sessionStorage/
];

describe('conversations-ui package boundary', () => {
  const files = readdirSync(here).filter((f) => /\.(jsx?|css)$/.test(f) && !f.includes('.test.'));
  it.each(files)('%s has no app, network, storage or auth dependency', (file) => {
    const src = readFileSync(join(here, file), 'utf8');
    for (const rule of FORBIDDEN) expect(src).not.toMatch(rule);
  });
});
