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
      // The mothership (voipappz-api). ONE knob repoints a tenant: MOTHERSHIP_URL
      // in .env — unprefixed on purpose, so it can never land in the browser
      // bundle or flip the client into cross-origin direct mode. VITE_API_TARGET
      // overrides it for this proxy alone. The browser only ever sees relative
      // URLs — this proxy (dev) / the deno forwarder (prod) owns the actual host.
      //
      // VITE_MOTHERSHIP_URL is deliberately NOT read here: it means direct mode
      // to the browser clients (api.ts / mothership.ts / customerPortal.ts), and
      // a static-hosting fork that sets it must not silently retarget this proxy.
      const MOTHERSHIP = process.env.VITE_API_TARGET || env.MOTHERSHIP_URL || 'https://cloud.voipappz.io';
      return {
        // Mothership surfaces: data reads (/api/*), the user login/OTP surface
        // (/auth/user_login, /auth/user/otp/verify), and public portal branding
        // (/tasks/customer_portal_data).
        '/api':   { target: MOTHERSHIP, changeOrigin: true, secure: true },
        '/tasks': { target: MOTHERSHIP, changeOrigin: true, secure: true },
        // All /auth routes belong to the mothership user login/OTP surface.
        '/auth':         { target: MOTHERSHIP, changeOrigin: true, secure: true },
        // Optional PostgREST plane — rides deno (strips /rest/v1, 503 when off).
        '/connectors/postgrest': { target: DENO, changeOrigin: true },
        '/rest/v1':      { target: DENO, changeOrigin: true },
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
