// Template entry point — boots the HTTP + WebSocket server.
//
// deno-api is a thin BFF over the engine (voipappz-api), with NO local store:
//   - PostgREST → calls/history (read by the browser directly)
//   - cable     → live events relayed to /ws for the Dashboard (as-is)
//   - engine    → call transcripts (read on request, api/engine.ts)
//   - Supabase  → optional `users` table only (no app data)
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './config.ts';
import { startServer } from './server.ts';

// Optional auth/users client — only built when configured. The app boots fine
// without it (auth is the accounts-table login proxy; reads are PostgREST/engine).
const supabase = SUPABASE_URL
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : (console.warn("⚠️  SUPABASE_URL unset — optional users table disabled"), null);

startServer(supabase);
setInterval(() => {}, 60_000);
