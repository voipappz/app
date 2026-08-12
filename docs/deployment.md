# Deployment

Everything runs through **Docker** — there is no other tooling to install.
One artifact either way: the image built from `Dockerfile.production` serves
the React bundle and the deno-api BFF from a single process (`api/app.ts`,
`STATIC_DIR=/app/dist`). CI builds and boot-probes this exact image on every
push (the `prod-image` job).

## Run production on this box

```bash
make prod        # build the production image + run it (:8000), probes /,/test,/health
make prod-down   # stop it
```

Runtime env comes from `.env` beside the compose file (`ENGINE_URL`, `NATS_URL`,
`NATS_CDR_SUBJECTS`,
optional Cable, and the local DuckDB event-store settings—see `.env.example`).
The event inspector is off in production unless `EVENT_INSPECTOR_ENABLED=1` is
deliberately supplied; when enabled it appears at `/event-explorer`. Compose does not re-read env on
restart — use `docker compose --profile prod up -d --force-recreate
production` after editing.

## Deploy to the production server

```bash
make deploy   # build image → push to registry → swap the container on prod
make ship     # git push + deploy in one shot
make status   # local git + prod health + deployed version (set PROD_URL in .env)
```

`make deploy` needs two one-time things on the machine you deploy from:

1. `cp .kamal/secrets.example .kamal/secrets` and fill in the registry
   password (gitignored — never committed).
2. An SSH key authorized on the production server.

That's it — the deploy tool itself runs inside a Docker image automatically;
nothing to install. The server/registry targets live in `config/deploy.yml`
(per-tenant variants: `config/deploy.<tenant>.yml`), and a post-deploy hook
smoke-probes the live host (`/health`, `/test`, the SPA, auth + transcript
routes) — a deploy is only "done" when those pass.
