import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// https://vite.dev/config/
// Serves the dev MCP at /voipappz/mcp: registered before the package's own
// middleware, it rewrites the voipappz path onto the package's.
const DEV_MCP_PATH = '/voipappz/mcp'
const voipappzMcpPath = () => ({
  name: 'voipappz-dev-mcp-path',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === DEV_MCP_PATH || req.url?.startsWith(`${DEV_MCP_PATH}?`) || req.url?.startsWith(`${DEV_MCP_PATH}/`)) {
        req.url = `/tidewave/mcp${req.url.slice(DEV_MCP_PATH.length)}`
      }
      next()
    })
  }
})

export default defineConfig(async ({ command, mode, isPreview }) => {
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

  // The VoipAppz dev MCP: an MCP server on this dev server at /voipappz/mcp
  // that gives a coding agent (Builder's, or Claude Code) the dev server's
  // logs, source locations, version-pinned docs and code evaluation in the
  // Vite process. Built on the `tidewave` npm package (Apache-2.0), whose own
  // path is fixed; the voipappz path is rewritten onto it. Dev server only:
  // imported lazily, because importing it patches console; `vite build` and
  // `vite preview` never load it. VITE_DEV_MCP=off leaves it out of a dev run.
  // Why each option: src/builder-client/README.md.
  const plugins = [react()]
  if (command === 'serve' && !isPreview && process.env.VITE_DEV_MCP !== 'off') {
    const { default: devMcp } = await import('tidewave/vite-plugin')
    plugins.push(voipappzMcpPath(), devMcp({
      host: 'localhost',
      allowRemoteAccess: false,
      toolbar: false
    }))
  }

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    plugins,
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
          manualChunks: {
            'vendor': [
              'react',
              'react-dom',
              'react-router',
              'scheduler',
              '@remix-run/router'
            ],
            'mui': [
              '@mui/material',
              '@mui/icons-material',
              '@mui/x-data-grid',
              '@mui/x-date-pickers',
              '@mui/x-date-pickers-pro',
              '@emotion/react',
              '@emotion/styled'
            ],
            'dates': [
              'date-fns',
              'moment',
              'react-date-range'
            ],
            'viz': ['d3'],
            'net': ['axios']
          }
        }
      },
      chunkSizeWarningLimit: 10000
    },
    optimizeDeps: {
      // Bundle these at startup. If Vite discovers react-i18next mid-session it
      // re-bundles deps, the open tab mixes two React copies, and hooks crash
      // with "dispatcher is null".
      include: ['react', 'react-dom', 'react-i18next', 'i18next'],
      esbuildOptions: {
        target: 'es2022'
      }
    },
    esbuild: {
      target: 'es2022'
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        // Shared chat UI package (also consumed by VoipAppz Builder)
        '@voipappz/chat-ui': resolve(__dirname, 'packages/chat-ui/src/index.js')
      }
    }
  }
})
