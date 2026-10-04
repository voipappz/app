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
    // Vitest's default is 5000ms, which is too tight for the DataGrid specs on
    // a loaded machine. PortalCalls' "full filtered count" test renders a
    // 25-row grid and chains four sequential awaits; it spends ~3.5s of the
    // budget on a fast run and timed out on two runs out of three, which makes
    // the suite a coin flip rather than a gate. The cost is real but small:
    // vitest's own summary reports jsdom being built 48 times for ~30% of
    // total time, so the environment, not the assertions, is the slow part.
    // A genuine hang still fails -- 15s later instead of 5s.
    testTimeout: 15000,
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