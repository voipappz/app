# Repository agent instructions

Read `CLAUDE.md` before changing this repository; it is the concise source of
architecture, commands and conventions. Use the repository-scoped
`$develop-voipappz-portal` skill for Deno/Vite implementation, verification,
Core-NATS/EventCdr work, and documentation updates.

Preserve existing uncommitted changes. Keep browser requests same-origin,
never expose secrets through `VITE_*`, and do not deploy unless the user asks.
Run the verification matrix required by the files changed; use
`npm run verify:push` for the complete local gate and `make act-api` for changes
to Deno, Core NATS, reconciliation, DuckDB, health or the API CI job.
