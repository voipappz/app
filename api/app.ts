// Entry point — boots the HTTP + WebSocket BFF.
//
// Deno sits IN FRONT of the built Vite bundle: it serves dist/ (SPA), terminates
// TLS when configured, relays live dashboard events over /ws (api/cable.ts), and
// is the customer-side seam for server-side integrations that must run on this
// deployment (the past DuckDB store lived here). No external dependencies, so it
// runs natively with zero install:  deno run -A api/app.ts
import { startServer } from './server.ts';

startServer();
setInterval(() => {}, 60_000);  // keep the process alive
