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

## Working on it

Run Builder (see its README); it starts `npm run dev` in its worktree
(`../app-builder`) and this code reloads there as you edit. Locally only
`npm run lint` runs; the unit tests run in CI. How the whole system fits
together: [docs/how-it-works.md](https://github.com/voipappz/builder/blob/main/docs/how-it-works.md).
