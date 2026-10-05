# VoIPappz App

A React admin and end-user portal for the [VoIPappz](https://voipappz.io) telephony
platform — the browser front end for a multi-tenant PBX: numbers, routing, queues,
IVRs, extensions, call reporting and live monitoring.

It is a **single-page app with no backend of its own.** Everything it displays
comes from a [`voipappz-api`](#the-api-this-app-talks-to) instance you point it at,
so the repository is also usable as a **template**: clone it, aim `VITE_API_BASE_URL`
at your own API, and you have a working operations console to build on.

```bash
git clone https://github.com/voipappz/app.git && cd app
make setup          # dependencies, then asks for the API and your login, and signs in
make dev            # http://localhost:3000
```

`make` on its own lists the six commands: setup, onboard, dev, test, check, deploy.

---

## Contents

- [What you get](#what-you-get)
- [Getting started](#getting-started)
- [The API this app talks to](#the-api-this-app-talks-to)
- [How it is put together](#how-it-is-put-together)
- [Everyday commands](#everyday-commands)
- [Testing](#testing)
- [Working with AI agents](#working-with-ai-agents)
- [Deployment](#deployment)
- [Using this as a template](#using-this-as-a-template)
- [Contributing](#contributing)

---

## What you get

**53 feature areas** under `src/components/`, among them:

| Area | Screens |
|---|---|
| **Telephony** | DIDs, Extensions, Queues, IVR & PBX routing, Bridges, Providers, Numbers |
| **Operations** | Live calls, Call log, Reports, Health monitor, Logs hub, Events |
| **Tenancy** | Customers, Environments, Users, ACLs, Accounts, Settings |
| **Commercial** | Plans, Tariffs, Subscriptions, Billing, Transactions |
| **Building** | Schema/Appz builder, Workflows, Bots, VML script editor, Dashboard builder |
| **End user** | Portal dashboard, softphone dock, messages, conversations |

Plus the things that make it pleasant to operate: a command palette, a guided
tour, a dashboard builder, and an in-app API docs browser.

**The stack**

| | |
|---|---|
| React 19, Vite 6 | app and build |
| Material-UI v7 | component library |
| TanStack Query v5 | server state, caching, background refetch |
| Sentry | error reporting (optional) |
| Vitest | 23 unit test files |
| Playwright | 62 end-to-end specs |

---

## Getting started

### Requirements

A reachable `voipappz-api` instance, and Node — but you do not have to install
Node yourself. The version is pinned in `mise.toml` (and `.nvmrc`, and
`package.json` engines, all reading 22, which is what CI runs), and `make setup`
installs it via [mise](https://mise.jdx.dev) or `nvm` if your system Node is
older.

That matters because the failure is otherwise unreadable: on Node 14, `npm ci`
dies with `Cannot read property '@dnd-kit/core' of undefined` — npm 6 unable to
parse a lockfileVersion 3 file — which names no version and looks like a broken
repository. `make setup` checks the version first and says so instead.

Docker only if you want to build the container image — **or if you would rather
not install Node at all**, in which case Docker is the only requirement:

```bash
make setup DOCKER=1     # no host Node involved
make dev   DOCKER=1     # still http://localhost:3000
make test  DOCKER=1
```

Everything runs in a container with the repo bind-mounted, so you edit files
normally and hot reload still works. It publishes the same port as the host
path, so the address is the same either way.

### Setup

```bash
make setup
```

It creates `.env` from `.env.example` (never overwriting an existing one),
installs the dependencies and the Playwright browser.

Then fill in `.env`:

```bash
VITE_API_BASE_URL=https://your-api-host.example.com   # the API to talk to
TEST_EMAIL=you@example.com                            # an account in that API
TEST_PASSWORD=...                                     # its password
VA_TEST_OTP=...                                       # only if the API has OTP on
```

`make dev` and `make test` check the login first (`make onboard` runs the same
check alone) and stop with the reason if it fails.

**`.env` is gitignored and must stay that way.** It is the only place real
credentials belong. `make check` fails if anything credential-shaped
reaches a file git would publish, and CI runs the same check.

### Check your setup

```bash
make onboard
```

prints `token valid for <api> as <email>`, or which value is missing.

It never prints a credential value — only whether one is set.

---

## The API this app talks to

This app renders `voipappz-api`. That API is the authority on every request and
response shape, and it publishes its own contract:

| What | Where |
|---|---|
| **OpenAPI contract** | `{VITE_API_BASE_URL}/tasks/openapi.json` |
| **MCP server** (for AI agents) | `{VITE_API_BASE_URL}/tasks/mcp` — HTTP transport |
| **Agent skills** | `{VITE_API_BASE_URL}/tasks/agent-skills/use-voipappz-api/` |

Fetch the OpenAPI document before writing a new API call. A path copied from an
older document is contract drift until the live contract confirms it.

### Authentication is a two-step OTP flow

```
POST /auth/login?email=…&password=…      ->  { otp_sent: true, temp_token }
POST /auth/otp/verify?temp_token=…&code=…&email=…&password=…
                                          ->  { access, refresh, csrf }
```

Send `access` as `Authorization: Bearer <token>`. Five failed attempts lock the
account for 15 minutes, which in practice is the most common cause of a suite
that suddenly fails at login.

`VA_TEST_OTP` is a **test-only** bypass the API accepts in place of an emailed
code. It still validates email and password. It must never be enabled on a
production API.

### Requests are form-encoded, and updates are PATCH

Not JSON — including `/auth`. This trips up everyone once:

```js
const body = new URLSearchParams();
body.append('name', 'Support queue');
body.append('enabled', 'true');
await apiService.patch(url, body);      // PATCH to update, never PUT
```

### The dev server proxies, so the browser only sees localhost

`vite.config.js` forwards `/api`, `/auth`, `/recordings` and `/tasks` to
`VITE_API_BASE_URL`. No CORS configuration, and no API host in the browser's
address bar.

---

## How it is put together

### Component and hook separation

Every feature directory holds presentation, logic and styles as separate files:

```
src/components/Users/
├── Users.jsx     # presentation — what it looks like
├── Users.js      # a custom hook — state, API calls, filters, pagination
└── Users.css     # styles
```

The `.jsx` renders; the `.js` decides. A screen's behaviour can be read without
reading its markup, and its markup can be changed without touching its logic.

### Multi-tenancy runs through context

`CustomerEnvironmentContext` holds the selected customer and environment, and
every scoped API call reads from it. Selections persist in `localStorage`, so a
reload keeps you where you were. Adding a screen means consuming that context —
not threading a `customer_uuid` through props.

### Where things live

```
src/
├── components/     53 feature areas (Users, DIDs, Queues, Reports, …)
├── context/        global state — customer/environment, auth, theme
├── hooks/          shared hooks
├── services/
│   └── api/        one module per resource; all HTTP lives here
├── config/         runtime configuration
└── theme/          MUI theme
tests/              62 Playwright specs, one per screen
bin/                dev helpers the Makefile calls
docs/               architecture and integration notes
```

New screens follow the existing shape: a component, a hook, an API service
module, and one spec named after the screen.

---

## Everyday commands

`make` lists all six:

| Command | What it does |
|---|---|
| `make setup` | Fresh clone → ready to run |
| `make onboard` | Check the login token for the API (`TOKEN=1` prints it) |
| `make dev` | Check the login, then the dev server on :3000 |
| `make test` | Check the login, then the Playwright suite (`SPEC=users` for one spec, `HEADED=1` to watch) |
| `make check` | **The pre-push gate:** secrets, lint, unit, build |
| `make deploy DEST=x` | Build, push and swap the container (an operator runs this) |

`DOCKER=1` runs setup, dev and test in a container, with no host Node.

---

## Testing

Two suites, different jobs:

**Vitest** (part of `make check`) covers services and hooks in isolation — no network.
Fast enough to run constantly.

**Playwright** (`make test`) drives a real browser against a **real API** with
real credentials. There are no mocks. A spec passes when the API returns 2xx and
the screen renders what came back.

```bash
make test                        # everything
make test SPEC=users             # one spec
make test SPEC=dids HEADED=1     # watch it
```

Specs share one authenticated session via `tests/auth-fixture.ts`, so the login
runs once rather than 62 times.

Because the suite needs credentials, it is skipped on pull requests from forks —
those cannot read repository secrets. `make check` is the gate a fork
contributor can pass.

---

## Working with AI agents

The repo carries instructions so an agent picks up the conventions instead of
guessing at them:

| File | For |
|---|---|
| `CLAUDE.md` | Claude Code — commands, API patterns, testing rules |
| `AGENTS.md` | Other agent tooling |
| `.agents/skills/` | Task-scoped skills (e.g. maintaining the API docs UI) |

The API's own skills — `use-voipappz-api` for integration work, and its MCP
server at `{API}/tasks/mcp` — are served from the API host, so an agent can read
the live contract rather than a copy that has drifted.

---

## Deployment

The image is a static bundle served by nginx, built from a self-contained
multi-stage `Dockerfile`:

```bash
docker build -t voipappz-admin .
docker run --rm -p 3000:80 voipappz-admin
```

```bash
docker pull ghcr.io/voipappz/app:latest
```

Published to GHCR by `.github/workflows/release.yml` **on version tags only** —
`v1.2.3` publishes `1.2.3`, `1.2`, and `latest`.

> **`VITE_*` values are baked in at build time.** The API host is chosen when the
> image is built, not when the container starts, so an image built for one API
> cannot be repointed with `docker run -e`. A second environment needs a second
> build:
> ```bash
> docker build --build-arg VITE_API_BASE_URL=https://other-api.example.com -t app:other .
> ```

The `Docker image` job in `ci.yml` builds the image on every pull request, and
every push to `main` also publishes the private Docker Hub images
`nirlevi/va-admin:release-gh-<run>` and `nirlevi/va-admin:latest` (using the
`DOCKER_PASS` repository secret; without it the image is built but not pushed).

---

## Using this as a template

Click **Use this template**, then:

1. `make setup` and point `VITE_API_BASE_URL` at your API.
2. Add repository secrets for CI — `VITE_API_BASE_URL`, `TEST_EMAIL`,
   `TEST_PASSWORD`, `VA_TEST_OTP` — under *Settings → Secrets and variables →
   Actions*. Without them the `check` job still runs; only `e2e` is skipped.
3. Delete the screens you do not need. Each is a self-contained directory under
   `src/components/` plus one spec in `tests/`.
4. Delete the `docker` job in `.github/workflows/ci.yml` unless you publish to
   Docker Hub.

What you inherit: the Makefile and `bin/` helpers, the auth fixture and the
62-spec pattern, the multi-tenant context, ~40 resource API modules, CI, the
GHCR release pipeline, the secret scanner, and the agent instructions.

---

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) has the detail. The short version: run
`make check` before you push, one spec file per screen, and never commit a
credential.

Security issues go through
[a private advisory](https://github.com/voipappz/app/security/advisories/new),
not a public issue — see [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE) © 2026 VoIPappz
