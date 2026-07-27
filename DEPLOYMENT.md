# Deployment

One artifact either way: the image built from `Dockerfile.production` serves
the React bundle and the deno-api BFF from a single process (`api/app.ts`,
`STATIC_DIR=/app/dist`). CI builds and boot-probes this exact image on every
push (the `prod-image` job).

## Option A — docker compose (on the target box)

```bash
make prod        # build the production image + run it (:8000), probes /,/test,/health
make prod-down   # stop it
```

Runtime env comes from `.env` beside the compose file (`ENGINE_URL`, cable,
Influx, PostgREST — see `.env.example`). Remember: compose does not re-read
env on restart — `docker compose --profile prod up -d --force-recreate
production` after editing.

## Option B — Kamal (from the ops machine, which has kamal installed)

```bash
make deploy   # kamal build → registry push → container swap on prod
make ship     # git push + make deploy in one shot
make status   # local git + prod health + deployed version (set PROD_URL in .env)
```

**Always deploy via the Makefile, not raw `kamal deploy`** — `make deploy`
sources `.kamal/secrets` so the ERB substitutions in `config/deploy.yml`
resolve (Kamal only auto-sources that file for the registry password). The
Makefile finds kamal on PATH or in the ops machine's rvm install.

## Configuration

| File | Role |
|---|---|
| `config/deploy.yml` | Default Kamal target (hosts, proxy, build args) |
| `config/deploy.mtn.yml`, `config/deploy.pbx20.yml` | Per-tenant deploy variants (`kamal deploy -c config/deploy.<tenant>.yml`) |
| `.kamal/secrets` | Build-time values for ERB substitution (copy from `.kamal/secrets.example`; never commit real values) |
| `/etc/voipappz/secrets.env` (on the host) | **Runtime** secrets, mounted via `--env-file`. Placed out-of-band (scp) — never in the repo, CI, or the image. |

`VITE_*` values are baked into the browser bundle at build time and are public
by design; runtime secrets must never carry the `VITE_` prefix.

## Post-deploy verification

`.kamal/hooks/post-deploy` runs automatically after the new container is
healthy and smoke-probes the live host: `/health` (dependency report), `/test`
(status), `/` (SPA serves), `POST /auth/login` with no body (expects 400 —
route mounted), and an unauthenticated transcript read (expects 401 — route
gated). A deploy is only "done" once these pass. Point it elsewhere with
`KAMAL_HEALTHCHECK_URL`.
