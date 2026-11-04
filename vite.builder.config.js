import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// VoipAppz Builder's chat (src/builder-client), built on its own: Builder's
// release CI runs `npm run build:builder` and ships dist-builder/ inside the
// installer, where Builder's local server serves it at /builder/. One
// client.js and one client.css, so Builder's page loads exactly two files.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [react()],
  base: './',
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist-builder',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      input: 'src/builder-client/main.jsx',
      output: {
        entryFileNames: 'client.js',
        inlineDynamicImports: true,
        assetFileNames: (asset) =>
          (asset.names?.[0] ?? asset.name ?? '').endsWith('.css') ? 'client.css' : 'assets/[name]-[hash][extname]'
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@voipappz/chat-ui': resolve(__dirname, 'packages/chat-ui/src/index.js')
    }
  }
})
