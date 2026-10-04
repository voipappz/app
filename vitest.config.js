import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', 'test-results', 'playwright-report'],
    // Two budgets, and they have to be arithmetically consistent:
    //
    //   testTimeout                    caps the whole test
    //   asyncUtilTimeout (setup.js)    caps EACH findBy*/waitFor -- 5000ms
    //
    // PortalCalls' "full filtered count" test chains FOUR sequential waits, so
    // the outer budget has to clear 4 x 5000 plus render time or a merely slow
    // test dies on the outer limit before any inner one trips. 15000 did not,
    // and it failed at exactly 15000 on a loaded run (16.4s for that test,
    // 28.7s for the file, against 11.8s when it passed). 30000 covers the
    // observed worst case with room.
    //
    // It is a wide window, and that is the honest cost of the environment
    // rather than of the assertions: vitest's own summary attributes ~30% of
    // runtime to building jsdom 48 times, and this file renders a DataGrid ten
    // times. A genuine hang still fails, 30s later. The real fix is for that
    // test to need fewer round trips; until someone does that, this keeps the
    // suite a gate instead of a coin flip.
    testTimeout: 30000,
    // @mui/x-data-grid's entry imports its own .css, which Node cannot load
    // when the package is externalized. Inlining it lets Vite handle the
    // import the way it does in the app build.
    server: { deps: { inline: [/@mui\/x-data-grid/] } }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});