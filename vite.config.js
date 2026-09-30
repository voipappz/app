import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// Which packages share a vendor chunk (see manualChunks below).
const VENDOR_CHUNKS = {
  vendor: ['react', 'react-dom', 'react-router', 'scheduler', '@remix-run/router'],
  mui: ['@mui/material', '@mui/icons-material', '@mui/x-data-grid', '@mui/x-date-pickers', '@mui/x-date-pickers-pro', '@emotion/react', '@emotion/styled'],
  dates: ['date-fns', 'moment', 'react-date-range'],
  viz: ['d3'],
  net: ['axios'],
}

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory
  const env = loadEnv(mode, process.cwd(), '')

  // Dev-server / HMR knobs. These come from the *container* environment
  // (docker-compose sets them) so local `npm run dev` keeps its defaults
  // (port 3000, native fs events, browser-inferred HMR host).
  //
  // Behind Docker the HMR WebSocket must be told the host/port the *browser*
  // reaches — Vite can't infer it from inside the container — and file watching
  // over a mounted volume needs polling. Set VITE_HMR_CLIENT_PORT to the host
  // port you published (e.g. 5174) to fix "failed to connect to websocket".
  const devPort = Number(process.env.VITE_DEV_PORT || 3000)
  const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT
    ? Number(process.env.VITE_HMR_CLIENT_PORT)
    : undefined
  const hmrHost = process.env.VITE_HMR_HOST || 'localhost'
  const usePolling = process.env.VITE_USE_POLLING === 'true'

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    plugins: [react()],
    //base: '/admin/',
    server: {
      port: devPort,
      host: true, // Allow external access
      // Only pin HMR when a client port is provided (Docker). Otherwise leave it
      // as `true` so local dev keeps Vite's default browser-inferred connection.
      hmr: hmrClientPort
        ? { host: hmrHost, protocol: 'ws', clientPort: hmrClientPort }
        : true,
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        '35.157.19.1',
        'cloud.voipappz.io',
        '.voipappz.io' // Allow all subdomains
      ],
      watch: {
        usePolling, // fs events don't cross the Docker volume boundary reliably
        ignored: [
          '**/node_modules/**',
          '**/playwright-report/**',
          '**/test-results/**',
          '**/tests/**',
          '**/coverage/**',
          '**/.git/**',
          '**/dist/**'
        ]
      },
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          secure: true
        },
        '/auth': {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          secure: true
        },
        '/recordings': {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          secure: true
        },
        '/tasks': {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          secure: true
        },
        '/custom': {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          secure: true
        },
        '/ai': {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          secure: true
        },
        '/health': {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          secure: true
        }
      }
    },
    
    build: {
      target: 'es2022',
      sourcemap: false,

      rollupOptions: {
        input: 'index.html',
        output: {
          // A function, not a { chunk: [packages] } map: Vite 8's bundler
          // (Rolldown) only takes the function form. Same chunks as before.
          manualChunks(id) {
            const match = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//)
            if (!match) return undefined
            return Object.keys(VENDOR_CHUNKS).find((chunk) => VENDOR_CHUNKS[chunk].includes(match[1]))
          }
        }
      },
      chunkSizeWarningLimit: 10000
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'es2022'
      }
    },
    esbuild: {
      target: 'es2022'
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    }
  }
})
