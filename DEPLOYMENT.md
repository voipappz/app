# Deployment

Production deploys go through **Kamal** — one image (built from
`Dockerfile.production`) serving the built React bundle and the deno-api BFF
from the same process (`api/app.ts`, `STATIC_DIR=/app/dist`).

## Ship

```bash
make deploy   # kamal build → registry push → container swap on prod
make ship     # git push + make deploy in one shot
make status   # local git + prod health + deployed version (set PROD_URL in .env)
```

**Always deploy via the Makefile, not raw `kamal deploy`** — `make deploy`
sources `.kamal/secrets` so the ERB substitutions in `config/deploy.yml`
resolve (Kamal only auto-sources that file for the registry password).

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
