# Deploying the admin

The admin is a static React bundle served by nginx from one container
(`Dockerfile`). It is deployed with [Kamal](https://kamal-deploy.org) from this
repo: `config/deploy.yml` is the base, `config/deploy.<dest>.yml` is one
destination, `.kamal/hooks/` runs before the build and after the swap, and the
Makefile's `Deploy` section is the only way anyone should invoke it.

```
make deploy DEST=connectix   # build, push, swap, smoke-check
```

Kamal came here from the portal repo (voipappz/connectix), which ran it
against four live destinations between August and September 2026 and then
moved its own deploys to xamal. Everything below was **measured there**, not
reasoned about. Each item cost a real deploy; none of it is discoverable from
Kamal's documentation.

## This repo is public

Nothing sensitive is tracked. The rule is stricter than "no passwords":

| Tracked | Not tracked (gitignored) |
|---|---|
| `config/deploy.yml`, `config/deploy.<dest>.yml` | `.kamal/secrets`, `.kamal/secrets-common`, `.kamal/secrets.<dest>` — the registry token |
| `.kamal/hooks/**` | `.kamal/env.<dest>` — the host's address, SSH user, port and key path |
| `.kamal/secrets.example`, `.kamal/env.example` | `.kamal/*.key`, `.kamal/*.pem` |

A destination file names only what is public anyway: the site's hostname (it
is in DNS) and the API the bundle talks to (it is in the bundle). The host is
read from `.kamal/env.<dest>` through ERB, and a missing value stops
`kamal config` with a message naming the file. `make check` scans the tree
before every push; keep it that way.

## Setting up a destination

1. `cp .kamal/env.example .kamal/env.<dest>` and fill in `KAMAL_HOST` and, if
   the host is not root on 22 with `~/.ssh/id_ed25519`, the SSH values.
2. `cp .kamal/secrets.example .kamal/secrets-common` and put the Docker Hub
   token in it. **A destination deploy reads `secrets-common` and
   `secrets.<dest>`, never `.kamal/secrets`.** The error when this is wrong
   is `Secret 'KAMAL_REGISTRY_PASSWORD' not found, no secret files
   (.kamal/secrets-common, .kamal/secrets.<dest>) provided`.
3. DNS: an A record for the hostname in `proxy.hosts` pointing at the host.
   kamal-proxy obtains the certificate with Let's Encrypt's HTTP-01 challenge
   on the first request. A name that does not resolve to the box fails the
   challenge; the deploy still reports success and the site answers a TLS
   error. Port 80 must be free on the host for the challenge.
4. `make deploy DEST=<dest>`. A person runs this, never an agent or CI.

## Vite bakes the API into the bundle

`VITE_API_BASE_URL` is inlined at build time. An image built for one API
cannot be repointed at another with an environment variable at run time. So
the API is a **build arg in the destination file**, and one destination is one
API and one image. Nothing goes under `env:` for the app itself; nginx reads
none of it.

## The DEST guard

Without `-d`, Kamal reads `config/deploy.yml`. In the portal that base file
named a real host, a different one from every destination, with a different
image. A dropped `DEST=` therefore did not fail: it deployed, somewhere else,
and the first sign was a timeout against a host nobody meant to touch.

Two locks here. The Makefile refuses a missing `DEST` and a missing
`.kamal/env.<dest>`. The base file's host is `dest-required.invalid`, so even
a hand-run `kamal deploy` without `-d` stops at SSH.

## Hooks are POSIX sh

Hooks run inside the Kamal image, which is Alpine and ships no bash. A
`#!/usr/bin/env bash` shebang fails every deploy with
`env: can't execute 'bash'`, which Kamal reports as the useless
`pre-build exit status: 32512`. No arrays, no `[[`, and no curl: the image has
busybox `wget` only, and the hooks fall back to it.

## The post-deploy hook must be armed

The smoke checks probe only when `KAMAL_HEALTHCHECK_URL` names the deployed
site. In the portal the hook existed for weeks and never ran: the Makefile
passed the variable through and never set it, so every deploy printed
"skipping smoke checks" in three milliseconds and reported success.

Here `make deploy` derives the URL from the destination's own `proxy.hosts`
line, so it is never written down twice and cannot drift when a site moves.

What the hook checks for a static site: TLS is served, `/` and `/index.html`
answer, a made-up deep route answers 200 (the SPA fallback), `index.html`
carries `Cache-Control: no-store` (nginx silently drops a server-level header
when a location adds its own, and that regression ships green), and the
refusals: `/package.json`, `/.env` and `/.git/HEAD` must 404. A gate is proven
by what it refuses, not by what it answers.

## The image push is the fragile step

`builder.driver: docker`, not the default `docker-container`. The default runs
buildkit in its own container and pushes from inside it. On the network these
deploys run from, that upload stalled dead three times in a row: frozen at
`exporting to registry` with zero bytes of traffic and zero CPU for minutes,
after a successful build. The same image pushed first try with `docker push`,
which uploads from the daemon in the host's network namespace. MTU was 1500
everywhere, so it was the container's egress, not fragmentation.

Docker Hub also answers `invalid content range` on an interrupted layer
upload. Retrying the deploy gets past it; build layers are cached, so the
retry costs minutes.

`~/.docker` is mounted read-write into the Kamal container on purpose: buildx
writes builder activity files there, and a read-only mount fails the build
with "read-only file system" long after the image has been built.

## Not from a git worktree

Kamal derives the image version from the commit sha, so it needs the
repository visible inside its container. A `git worktree` checkout has a `.git`
*file* pointing at the main checkout's `.git/worktrees/...`, which is not
mounted, and every command fails with
`Can't use commit hash as version, no git repository found in /workdir`.
Deploy from a normal clone (measured while setting this up).

## What a deploy does on the host

Kamal starts the new container, health-checks it through kamal-proxy, and
only then stops the old one. Both run for a few seconds. For a static site
that is harmless. For the portal it meant two single-writer database owners
fighting; it is worth knowing the overlap exists.

Kamal tags images by commit sha. Rewriting history orphans the tag of a
running container; redeploy afterwards to restore traceability.

An SSH timeout while *releasing the deploy lock* is not a failed deploy.
Check what is actually running before retrying, and `kamal lock release` if
it is stuck.

## Sharing a host

Kamal runs one kamal-proxy per host and routes by `Host` header. Two Kamal
apps on one box each add their hostname under `proxy.hosts` and get their own
certificate. The connectix destination does this beside the portal today.

Two tools that both want ports 80 and 443 cannot share a host: kamal-proxy and
Caddy, for instance. When the portal moves to xamal, which fronts with Caddy,
the admin either moves to another host or is served another way. Decide that
before the cut-over.

## Rollback

```
kamal rollback -d <dest>          # from inside the kamal image: make target coming when needed
docker logs $(docker ps --filter label=service=voipappz-admin -q | head -1) --tail 60
```

The previous container is kept stopped on the host; rollback restarts it and
switches the proxy back.

## Never from an agent

Building, rendering the config and probing a deployed site are fine for an
agent to do. `make deploy`, pushing a tag anything reads as `:latest`, and
recreating a container on a live host are an operator's calls. Say what the
command is and let a person run it.

## Onboarding a customer on switch

1. **Login.** On the API host (voipappz-api), the operator runs
   `make tenant CUSTOMER=<name> EMAIL=<admin@customer>`. It prints the email
   and password. Give the developers or agents those two values. OTP is off by
   default; only if it is enabled on the API do they also need its `VA_TEST_OTP` code.
2. **Connect.** In this repo, `make setup`. It asks for the API address
   (Enter for `https://switch.voipappz.io`), email and password, saves them to
   `.env` and signs in. There is no separate auth URL: sign-in goes to
   `/auth/*` on the API. `make dev` and `make test` check the token first;
   the cached token (`.env.token`) is reused while valid. `make onboard
   TOKEN=1` prints it for curl or an agent.
3. **Phone.** The customer's environment needs `domain` and `wss_server` set.
   The browser phone reads both from the user's environment.
4. **Own hostname.** Add `config/deploy.<customer>.yml` with `proxy.hosts` and
   `VITE_API_BASE_URL: https://switch.voipappz.io`. The customer adds a DNS A
   record, switch adds the hostname to its CORS policy, and an operator runs
   `make deploy DEST=<customer>`.
