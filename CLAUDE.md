# CLAUDE.md

Guidance for Claude Code in this repository: the VoIPappz admin console and
user portal, a React 19 + Vite + MUI app that talks to `voipappz-api`.

## Working in Builder

When VoipAppz Builder runs you, you are in a git worktree of this repo on the
branch `builder/work`, and the person you talk to may not be a developer.

- **Git.** Don't push, open pull requests, switch branches or rewrite history.
  Builder handles that. Leave the changes in the worktree.
- **Dev server.** It is already running with hot reload. Don't start, stop or
  restart it (`make dev`, `npm run dev`, `vite`); saving a file updates the
  previews.
- **Previews.** One app, two front doors (the route decides, `src/App.jsx`):
  - Admin: <http://admin.localhost:3000/admin>, the Account sign-in, then the
    admin console (customers, environments, every screen).
  - User: <http://user.localhost:3000/>, the User sign-in, then the same console
    filtered by the user's ACL.
  Each host keeps its own sign-in. Check the one your change affects, or both
  when it touches shared screens.
- **Verify.** Run `make gate` (lint and unit tests) after every change. If
  `tests/<name>.spec.ts` covers the screen, also run `make test SPEC=<name>`.
  It reuses the running dev server.
- **Secrets.** Never read, print or commit `.env` or `.env.token`.
- **Don't edit unless asked:** `src/builder-client/` (Builder's own chat UI),
  `.kamal/`, `config/deploy*.yml`, `nginx.conf`, `package-lock.json` and other
  lockfiles.
- **Never deploy.** Never run `make deploy` (see Deploy below).
- **Live API.** Use the `voipappz` MCP tools (read-only) to check what the API
  really returns before you guess at a field or an endpoint.
- **Replies.** Use plain language. Say what changed and which preview page to
  look at (for example "open Admin → Routes").

Skills in `.claude/skills/`: `find-screen`, `add-api-call`, `translations`,
`verify-change`.

## Commands

`make` lists the targets. Never hand-write a command a target already covers.

| Target | What it does |
| --- | --- |
| `make setup` | Fresh clone to a runnable state: node, `npm ci`, `.env`, login |
| `make onboard` | Checks the API login token (dev and test run it first) |
| `make dev` | Login check, then the dev server on `PORT` (3000) |
| `make gate` | Lint and unit tests (`vitest`), transcript in `tmp/gate.log` |
| `make test SPEC=users` | Playwright, one spec (`tests/users.spec.ts`); no `SPEC` runs all |
| `make check` | Secrets scan, lint, unit tests, build: the pre-push gate |
| `make tenant CUSTOMER=x EMAIL=x` | Creates a customer with Account and User logins (root login) |

`DOCKER=1` runs setup, dev, test and gate in a node:22 container, for a host
that cannot run the pinned node. All npm calls go through `bin/npm.sh`.

## Checks and CI

Local checks are allowed and expected: `make gate` after a change,
`make test SPEC=<name>` for the screen you touched, `make check` before a push.
Run Playwright only through `make test`, never `npx playwright` directly.

CI (`.github/workflows/ci.yml`, GitHub Actions) is the gate for every push and
pull request: lint, unit, build, dependency audit (`npm run security-scan`),
`nginx.conf` syntax and translations; Playwright when the four test secrets
exist (it skips with a notice otherwise); a Docker image build, published as
`nirlevi/va-admin:release-gh-<run>` and `:latest` only from `main`. After a push:

```bash
gh run list --branch "$(git branch --show-current)" --workflow ci.yml --limit 3
gh run watch <run-id> --exit-status
gh run view <run-id> --log-failed        # output of the failing step
```

## API and login

- The API is whatever `VITE_API_BASE_URL` in `.env` names; `make onboard`
  offers `https://switch.voipappz.io` by default. The Vite dev server proxies
  `/api`, `/auth`, `/tasks`, `/recordings` and `/custom` to it
  (`vite.config.js`), so the browser only talks to localhost.
- Login is two steps: `POST /auth/login?email=&password=` returns
  `{ otp_sent, temp_token }`; `POST /auth/otp/verify` with `temp_token`, `code`,
  `email`, `password` returns `access`, `refresh`, `csrf`. Tests use
  `VA_TEST_OTP` as the code (a test-only bypass) through `tests/auth-fixture.ts`.
  Five failed logins lock the account for 15 minutes.
- Writes are form URL encoded, never JSON: `POST` to create, `PATCH` (not `PUT`)
  to update, built with `toFormData` from `src/services/apiService.js`.
  Endpoint wrappers live in `src/services/api/*Api.js` (skill `add-api-call`).

## Architecture

- `src/App.jsx`: every route, lazy-loaded screens, `ProtectedRoute` with the
  route's ACL key (`src/routing/routeAccess.js`).
- `src/config/navConfig.js`: sidebar items, their paths and ACL keys.
- `src/components/<Area>/`: one folder per screen. The usual split is
  `Name.jsx` (UI), `Name.js` (hook with state and API calls), `Name.css`.
- `src/context/`: `AuthContext`, `UserAuthContext`,
  `CustomerEnvironmentContext` (selected customer and environments),
  `SoftphoneContext`, and others.
- `src/i18n/`: translations and RTL helpers (see Languages and phones).
- `src/builder-client/`: Builder's chat UI, a separate entry. Not part of the app.

## Sessions: one at a time

`AuthContext` (storage `auth`) and `UserAuthContext` (storage `user_auth`) use
separate JWTs, but both sign in through `/` (`SignIn.jsx`, toggled User /
Account) and enter the same admin console. Signing in on either door ends the
other session (`src/services/sessionIsolation.js`), so requests always use the
active identity. `/admin` and `/login` only select the Account sign-in view.

An account can choose customer and environment. A user has one environment and
uses the same sidebar, top bar, and routes, filtered strictly by their ACL: a
screen or control with no ACL key is account-only. The phone drawer opens for
either session: a user's own extension registers itself
(`SoftphoneContext`). Keep account token-only Calls features (column configuration,
saved filters, and live-call count) off for user sessions; list, segments,
aggregates, and export must use the user's token. `useIsUserSession()`
identifies this branch.

Ending either session calls `forgetPerson`: `apiService` drops cached and
in-flight data and clears personal keys so identities cannot share data.

## API DevZone

Rules for `/devzone` (Swagger UI, Agent Skill readiness, AI actions) are in
AGENTS.md, imported here: @AGENTS.md

## Languages and phones

The app speaks English and Hebrew (right to left) and works from 375px up.
English is the default and must not change when a screen is converted. Before
touching a screen's text, layout, dates or tables, read
[docs/i18n-guide.md](docs/i18n-guide.md): the recipe (`useTranslation`,
`Bdi`, `ResponsiveTable`, `ResponsiveDialog`, logical sides), the checks, and
the backlog. Rule: touch it, convert it.

## Live dashboard (`/live`)

The screen reads live agent, queue and environment state from the va-crystal
node over ActionCable — not from the API, and not by polling once the socket
is up.

- **Where it connects.** `VITE_WS_URL` (e.g. `ws://localhost:14000/cable`) is
  the node's cable; `VITE_API_BASE_URL` is still the API for everything else.
  The socket must request the `actioncable-v1-json` subprotocol — without it
  the browser closes it before `welcome`, which looks exactly like a refused
  token (`useWebSocket.js`, `useCableHealth.js`).
- **Data.** `src/hooks/useLiveEntities.js` subscribes `LiveChannel` with the
  environment (a portal user's `user.environment.uuid`, or the one an account
  picks in the screen's Environment picker — `useLiveEnvironment.js`, remembered
  per customer; until then the first environment selected in the top bar) and keeps one whole document per entity; renders are coalesced
  every 250ms. That is the screen's ONLY source: it never calls the API, and
  when the cable is not delivering it shows nothing and says so. The polled
  fallback (`/api/users?action=agents`, `/api/calls`) was removed on
  2026-09-23 — the API ignores `action=agents` for a portal token and holds a
  call only after it ends, so it could not answer for this screen.
- **Identity.** The switch never publishes a name or extension, and a status
  type only when it changes. The node fills `user_name`, `extension_username`,
  `status` and `status_name` (the tenant's own name for it, from the API's
  `Status` model) into the user document from the mothership
  (`crystal.request.user.extension`) when it first sees the agent and again at
  each roll-over. The status chip shows `status_name`, coloured by `status`.
- **Midnight.** The node resets the daily fields (counters, `first_call_at`,
  `last_call_*`) at midnight in the ENVIRONMENT's timezone
  (`environments.profile.timezone`), the way the old Redis cron did. Status,
  state and identity survive it.
- **Rendering.** Column render modes come from `DEFAULT_COLUMNS` in
  `src/services/liveSettings.js` on every load (a saved column list keeps only
  order and visibility). `elapsed` is a running duration; `time` is a clock
  time (`first_call_at`). Colours are per-browser in localStorage.
- **Auth.** The node verifies the login JWT with its own `SECRET_KEY`, which
  must equal the API's signing key. For local work against a node with a
  different key, `localStorage.va_cable_token` overrides the token for the
  cable only; remove it once the node has the real key.

## Deploy

Kamal, from this repo — `make deploy DEST=x`. The tool and every lesson learned running it came from
the portal repo; [docs/deployment.md](docs/deployment.md) is the reference,
read it before touching `config/deploy*.yml` or `.kamal/`.

Two rules that follow from this repo being **public**:

- **Nothing sensitive in git.** Registry token in `.kamal/secrets-common`,
  host address and SSH details in `.kamal/env.<dest>`, both gitignored. A
  destination yaml names only the public hostname and the public API URL.
- **Never deploy.** Rendering the config and probing a live site are fine;
  `make deploy` and anything that swaps a container on a live host is the
  operator's call. Say the command, let a person run it.

`Dockerfile` (nginx) is the image kamal builds. `Dockerfile.production` was the
old React-plus-Deno image; it referenced a deleted `api/` directory and was
removed when Kamal arrived.

## History

The AngularJS/Ionic migration notes, the old schema-system notes, the TDD and
Cypress-era testing guide, and the verbose API field lists moved to
[docs/legacy-migration.md](docs/legacy-migration.md). They are history, not
current guidance.
