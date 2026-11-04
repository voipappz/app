---
name: verify-change
description: Check that a change works before saying it is done. Use after every code change, and when the person asks "does it work?" or reports something broken.
---

# Verify a change

1. **Gate.** `make gate`: ESLint and the unit tests (vitest), transcript in
   `tmp/gate.log`. Fix every failure your change caused. Read the log rather
   than guessing.
2. **The screen's spec.** Find the screen's name (skill `find-screen`). If
   `tests/<name>.spec.ts` exists (e.g. `tests/extensions.spec.ts`), run
   `make test SPEC=<name>`. It checks the API login first and reuses the dev
   server that is already running. Never call `npx playwright` directly.
3. **Live API.** When the change depends on what the API returns, confirm it
   with the `voipappz` MCP tools (read-only) instead of assuming.
4. **The preview.** The dev server has hot reload, so the change is already in
   the previews. Don't start or restart it.
   - Admin: <http://admin.localhost:3000/admin>
   - User: <http://user.localhost:3000/>
   A user only reaches routes whose ACL key their session grants
   (`src/routing/routeAccess.js`); check both previews when a change touches
   shared screens.
5. **Text and layout changes** also need Hebrew and phone width (skill
   `translations`).
6. **Report in plain language:** what changed, what you checked (gate result,
   spec result), and exactly where to look: "Open the Admin preview → Devices,
   click Add device".

Don't run `make deploy`, don't push, and don't read `.env` or `.env.token` to
debug a login. If `make test` stops at the login gate, say so.
