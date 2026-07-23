import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import fs from 'fs'

// Dev HTTPS: WebRTC getUserMedia (the softphone mic) only works in a SECURE
// context — HTTPS or localhost. Accessed via a LAN/public IP over plain http the
// browser blocks the mic and calls fail ("Media devices not available in insecure
// contexts"). If a self-signed dev cert exists (certs/, openssl-generated), serve
// over HTTPS so the phone can dial from any host.
const DEV_KEY = resolve(__dirname, 'certs/dev-key.pem')
const DEV_CRT = resolve(__dirname, 'certs/dev-cert.pem')
const devHttps = fs.existsSync(DEV_KEY) && fs.existsSync(DEV_CRT)
  ? { key: fs.readFileSync(DEV_KEY), cert: fs.readFileSync(DEV_CRT) }
  : undefined

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    // deno-api now serves everything (calls/events store + app endpoints) on a
    // single port, so the proxy needs just two upstreams: deno-api and the
    // external cloud API. The browser only ever talks to Vite; it forwards
    // internally, so the app works however it's reached and deno-api's port is
    // never exposed. Override hosts via VITE_DENO_API_TARGET / VITE_API_TARGET.
    server: {
      host: '0.0.0.0',
      port: 4200,
      https: devHttps,
    proxy: (() => {
      const DENO = process.env.VITE_DENO_API_TARGET || 'http://localhost:4001';
      // PostgREST is reached through KONG (the host gateway), which owns the
      // /rest/v1 route and strips it before PostgREST — same path as prod. Kong
      // is host-networked on :8000; from the react-app container it's the gateway.
      // PostgREST itself binds loopback-only (127.0.0.1:3001), so never target it
      // directly from a container.
      const POSTGREST = process.env.VITE_POSTGREST_TARGET || 'http://127.0.0.1:8000';
      return {
        // External upstream API (cloud). All data reads go here now — PostgREST
        // is gone; the app talks only to voipappz-api /api/*.
        '/api': { target: process.env.VITE_API_TARGET || 'https://cloud.voipappz.io', changeOrigin: true, secure: true },
        // deno-api: app endpoints, the worker (transcription/recording), the
        // account login proxy (/auth/login → PostgREST /rpc/login), and the live
        // WS. NB: /auth/login (not /login) so it doesn't shadow the SPA's /login
        // page route.
        '/auth/login':   { target: DENO, changeOrigin: true },
        '/deno-api':     { target: DENO, changeOrigin: true, rewrite: (p) => p.replace(/^\/deno-api/, '') },
        '/events-api':   { target: DENO, changeOrigin: true, rewrite: (p) => p.replace(/^\/events-api/, '') },
        '/ws/events':    { target: DENO, changeOrigin: true, ws: true },
      };
    })(),
  },
  build: {
    sourcemap: false, // Disable sourcemap in production to reduce size
    rollupOptions: {
      output: {
        // Simpler chunking strategy to avoid React compatibility issues
        manualChunks: {
          // Keep React and related libraries in one chunk to prevent compatibility issues
          'vendor': [
            'react',
            'react-dom',
            'react-router-dom',
            'scheduler'
          ],
          // UI components - all MUI together
          'mui': [
            '@mui/material',
            '@mui/icons-material',
            '@emotion/react',
            '@emotion/styled'
          ]
        }
      }
    },
    // Increase the warning limit to avoid warning for moderately sized chunks
    chunkSizeWarningLimit: 1000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
  }
})
