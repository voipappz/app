# Builder chat client

The chat screen of [VoipAppz Builder](https://github.com/voipappz/builder).
Builder's local server serves a small page on `http://127.0.0.1:9832` that
loads `main.jsx` from this app's Vite dev server; the admin app itself never
imports anything from here.

| File | Job |
|---|---|
| `main.jsx` | Entry. Reads the page's `voipappz-builder:info` meta tag and renders `BuilderApp` with the app theme |
| `BuilderApp.jsx` | Layout: `ChatView` from `packages/chat-ui`, agent mode picker, permission bar, Admin and User previews |
| `useBuilderChat.js` | One chat with the agent: session, messages, busy state, permission requests, modes |
| `acpConnection.js` | ACP (Agent Client Protocol) as raw JSON-RPC over the server's `acp:` channel |
| `phoenixSocket.js` | Minimal Phoenix v2 websocket client for that channel |
| `BotPanel.jsx` | The Bot tab, when Builder runs a voice bot: status, restart, log, hold to talk |
| `captureWorklet.js` | Audio-thread microphone capture in 20 ms packets, served from the app's dev server (Builder's page policy allows no `blob:` scripts) |
| `botCall.js` | One call to the bot through Builder's bridge, in Earshot's native framing (PCM16 16 kHz, 20 ms packets, `speech_started`/`speech_stopped`, `clear`) |
| `chatState.js` | Maps ACP `session/update` notifications onto the chat-ui message shape (tested in `chatState.test.js`) |

## Rules

- The client never names a command, folder or credential. Builder's server
  picks the agent, its folder and its MCP servers, and enforces that the agent
  writes only in Builder's worktree of this app and uses the API read-only.
- New sessions switch to the agent's "Accept edits" mode: edits inside the
  worktree go through, commands still ask through the permission bar.
- The previews run on `admin.localhost` and `user.localhost`, so the two
  logins (kept in `localStorage` per origin) stay apart.

## Tidewave: the dev server's MCP server

The dev server Builder runs also serves
[Tidewave](https://github.com/tidewave-ai/tidewave_js) (the `tidewave` npm
package, Apache-2.0, pinned in `devDependencies`), an MCP server for the
running app. Its endpoint is on the dev server's own port:

    http://localhost:<PORT>/tidewave/mcp      # make dev: PORT=3000

It speaks MCP over streamable HTTP (POST only, JSON responses). Connect with
`?include_browser_tools=false` on the end: without it Tidewave also lists
`browser_eval` and `create_design_canvas`, which need its toolbar in a browser
tab, and the toolbar is off here (below). The four tools left:

| Tool | What the agent gets |
|---|---|
| `get_logs` | The dev server's console: the same lines `make dev` prints (HMR, compile errors, `http proxy error` from the `/api`... proxy). Filter by `level`, `grep`, `since`, `tail`. Not the browser console |
| `get_source_location` | The file and line of a module or symbol, e.g. `./src/services/apiService` or `react:useState` |
| `get_docs` | Docs for a symbol, from the exact package versions installed |
| `project_eval` | Runs JavaScript in the Vite process (no browser, no logins) |

Connecting:

- **Builder**: adds it to the agent's MCP servers like the API's, as
  `{"type": "http", "name": "tidewave", "url": "http://127.0.0.1:<PORT>/tidewave/mcp?include_browser_tools=false", "headers": []}`,
  with `<PORT>` the port it started `npm run dev` on.
- **Claude Code**, by hand next to `make dev`:
  `claude mcp add --transport http tidewave "http://localhost:3000/tidewave/mcp?include_browser_tools=false"`.

How it sits next to Builder (`vite.config.js`):

- **`vite serve` only.** The plugin is imported lazily when the command is
  `serve`, so `vite build` and `vite preview` never load it and the production
  bundle has none of it. `VITE_TIDEWAVE=off npm run dev` leaves it out.
- **Localhost only.** The dev server listens on all interfaces (`host: true`,
  for Docker), but Tidewave answers only requests from 127.0.0.1 / ::1 and
  refuses any request that carries an `Origin` header, so neither another
  machine nor a page in a browser (including the previews) can reach it. Under
  `make dev DOCKER=1` requests arrive from the Docker bridge, so it refuses
  them there.
- **Same port, no new listener.** `/tidewave/*` is on the dev server, so there
  is no port to clash with Builder's `9832` or the API's, and it collides with
  none of the proxied prefixes.
- **No toolbar.** `toolbar: false`: Tidewave would otherwise inject a script
  from tidewave.ai into `index.html`, which Builder's page policy and the
  previews do not need. `main.jsx` and the previews load exactly as before.
- **Logs are kept** in `$TMPDIR/<hash of the app folder>.tidewave.ndjson`,
  appended across runs and never trimmed; delete it to start empty.

## Working on it

Run Builder (see its README); it starts `npm run dev` in its worktree
(`../app-builder`) and this code reloads there as you edit. Locally only
`npm run lint` runs; the unit tests run in CI. How the whole system fits
together: [docs/how-it-works.md](https://github.com/voipappz/builder/blob/main/docs/how-it-works.md).
