# The whole developer loop for this app: clone -> `make setup` -> `make dev`.
# `make` with no target lists every option; README.md has the reasons.

# Safe defaults, applied to every recipe below:
#   bash, not /bin/sh   -- the recipes use $(...), [[ and pipes
#   -e                  -- a failing command fails the target instead of the
#                          recipe carrying on and reporting success
#   -o pipefail         -- ... including a failure in the middle of a pipe
#   --no-print-directory-- no "Entering directory" noise around every sub-make
#   no builtin rules    -- nothing here compiles a .c from a .o; skipping the
#                          implicit ruleset makes every invocation faster
# `-u` is deliberately NOT set: SPEC, CI and DOCKER_* are legitimately unset
# most of the time and the recipes test for that.
SHELL       := /usr/bin/env bash
.SHELLFLAGS := -e -o pipefail -c
MAKEFLAGS   += --no-print-directory --no-builtin-rules --no-builtin-variables
.SUFFIXES:
.DELETE_ON_ERROR:

PORT      ?= 3000
BROWSER   ?= chromium
SPEC      ?=
IMAGE     ?= ghcr.io/voipappz/app
TAG       ?= dev

# M := $(MAKE) is the sub-make shorthand, so no target may take M= on the
# command line -- it would replace every recursive call with the value.
M := $(MAKE)

# Every npm call goes through this wrapper, which finds the node this repo pins
# even when the shell's PATH has an older one. A bare `npm` in a recipe picked
# up a system Node 14 on a machine that had the pinned 22 installed.
NPM := bin/npm.sh

# The no-host-node path: DOCKER=1 on setup/install/dev/build/test runs the job
# in a container instead (see docker-compose.yml). Compose is a docker
# subcommand (v2) on some machines and a separate binary (v1) on others;
# hardcoding one dies on the other with what reads as a broken stack.
DC ?= $(shell if docker compose version >/dev/null 2>&1; then echo 'docker compose'; \
              elif command -v docker-compose >/dev/null 2>&1; then echo 'docker-compose'; \
              else echo 'docker compose'; fi)

# Playwright needs the app running: start it in the background, stop it after.
SERVE = PORT=$(PORT) bin/dev-serve.sh
STOP  = kill "$$(cat /tmp/vite-$(PORT).pid 2>/dev/null)" 2>/dev/null || true; rm -f /tmp/vite-$(PORT).pid

# The login gate: a valid token for the API in .env before anything that talks
# to it. Reuses the cached token while it is valid, signs in again otherwise.
LOGIN = TOKEN="$(TOKEN)" bin/onboard.sh

.PHONY: help setup onboard dev test check deploy
.DEFAULT_GOAL := help

help: ## Show this help
	@printf '\n\033[1mWorkflow:\033[0m  setup -> onboard -> dev -> test -> check -> push\n\n'
	@awk 'BEGIN { FS = ":.*## "; pad = "                              " } \
	     /^[a-zA-Z0-9_-]+:.*## / { \
	       desc = $$2; label = $$1; \
	       if (match(desc, /^\[[^]]*\] /)) { label = label " " substr(desc, 1, RLENGTH - 1); desc = substr(desc, RLENGTH + 1) } \
	       printf "  \033[36m%s\033[0m%s %s\n", label, substr(pad, 1, 28 - length(label)), desc \
	     }' $(firstword $(MAKEFILE_LIST))
	@echo

# ONE command from a fresh clone to a machine that can run the app and the
# suite. Idempotent, so it is also what to run when you do not know the state.
# .env is never overwritten: it holds the only copy of your credentials.
setup: ## [DOCKER=1] Everything a fresh clone needs, then asks for your login and signs in
	@if [ -z "$(DOCKER)" ]; then bin/dev-host-tools.sh; fi
	@[ -f .env ] || { cp .env.example .env; echo "created .env from .env.example"; }
	@if [ -n "$(DOCKER)" ]; then $(DC) run --rm --no-deps -T app npm ci; else $(NPM) ci; fi
	@if [ -z "$(DOCKER)" ]; then $(NPM) exec -- playwright install $(BROWSER) --with-deps; fi
	@$(LOGIN)
	@echo; echo "Ready:  make dev"

onboard: ## [TOKEN=1] Check the login token for the API; asks for the login if missing
	@$(LOGIN)

dev: ## [PORT=3000 DOCKER=1] Check the login token, then start the dev server
	@$(LOGIN)
	@if [ -n "$(DOCKER)" ]; then $(DC) up app; else $(NPM) run dev -- --port $(PORT); fi

test: ## [SPEC=users HEADED=1 DOCKER=1] Check the login token, then run Playwright specs
	@$(LOGIN)
	@if [ -n "$(DOCKER)" ]; then \
	   $(DC) run --rm -T test; \
	 else \
	   $(SERVE); \
	   $(NPM) exec -- playwright test $(if $(SPEC),tests/$(SPEC).spec.ts,) \
	     --project=$(BROWSER) $(if $(HEADED),--headed,--reporter=line); \
	   status=$$?; $(STOP); exit $$status; \
	 fi

# The gate a PR has to pass, in CI's order, so a red CI is reproducible here.
check: ## Secrets scan, lint, unit tests and a build -- the pre-push gate
	@bin/check-secrets.sh
	@$(NPM) run lint
	@$(NPM) run test:unit:run
	@$(NPM) run build
	@echo; echo "check: all green"

# --- Deploy: kamal, from this repo ---

# THE DEPLOY TOOL LIVES HERE. It came from the portal repo (voipappz/connectix),
# which ran kamal against four live destinations and then moved to xamal. Every
# lesson from that period is either a comment on the line it protects or a
# paragraph in docs/deployment.md — read that file before adding a destination.
#
# config/deploy*.yml and .kamal/ are kamal's OWN layout, relative to the
# project root, so a `kamal` run by hand from this directory does exactly what
# these targets do. Everything runs in the kamal image; no Ruby on the host.
#
# NOTHING SENSITIVE IS IN GIT — this repo is public. .kamal/secrets* (registry
# token), .kamal/env.<dest> (host address, SSH user/port/key) and any *.key or
# *.pem are ignored; the two *.example files say what each destination needs.

KAMAL_IMAGE ?= ghcr.io/basecamp/kamal:v2.12.0

# Per-destination host details, handed to the container as environment so the
# destination yaml can read them through ERB and they never appear in a
# tracked file or on the command line.
KAMAL_ENV_FILE = .kamal/env.$(DEST)

# MAIL FOR THE POST-DEPLOY HOOK. Read from .env and EXPORTED, so the values
# reach the kamal container through `-e NAME` (no `=value`) — docker forwards
# them from this process's environment, which keeps the SMTP password out of
# the command line and therefore out of `ps`. Empty when .env does not name
# them, and the hook is inert when they are empty.
dotenv = $(shell sed -n 's/^$(1)=//p' .env 2>/dev/null | grep . | head -1 | tr -d '\r"')
export ORGANIZATION_SMTP_ADDRESS        := $(call dotenv,ORGANIZATION_SMTP_ADDRESS)
export ORGANIZATION_SMTP_PORT           := $(call dotenv,ORGANIZATION_SMTP_PORT)
export ORGANIZATION_SMTP_USERNAME       := $(call dotenv,ORGANIZATION_SMTP_USERNAME)
export ORGANIZATION_SMTP_PASSWORD       := $(call dotenv,ORGANIZATION_SMTP_PASSWORD)
export ORGANIZATION_SMTP_DOMAIN         := $(call dotenv,ORGANIZATION_SMTP_DOMAIN)
export ORGANIZATION_SMTP_AUTHENTICATION := $(call dotenv,ORGANIZATION_SMTP_AUTHENTICATION)
export ORGANIZATION_SMTP_FROM           := $(call dotenv,ORGANIZATION_SMTP_FROM)
export ORGANIZATION_SMTP_TO             := $(call dotenv,ORGANIZATION_SMTP_TO)
SMTP_ENV = -e ORGANIZATION_SMTP_ADDRESS -e ORGANIZATION_SMTP_PORT \
	   -e ORGANIZATION_SMTP_USERNAME -e ORGANIZATION_SMTP_PASSWORD \
	   -e ORGANIZATION_SMTP_DOMAIN -e ORGANIZATION_SMTP_AUTHENTICATION \
	   -e ORGANIZATION_SMTP_FROM -e ORGANIZATION_SMTP_TO

# `~/.docker` is mounted READ-WRITE on purpose: buildx writes builder activity
# files there, and a read-only mount fails the build with "read-only file
# system" long after the image has been built (measured on the portal).
# GIT_CONFIG_*: the checkout is owned by your uid and kamal runs as root inside
# the container, so git refuses it as "dubious ownership" — and the
# RELEASE_SHA build arg shells out to git.
KAMAL = docker run --rm \
	  -v "$(CURDIR):/workdir" -w /workdir \
	  -v "$(HOME)/.ssh:/root/.ssh:ro" \
	  -v "$(HOME)/.docker:/root/.docker" \
	  -v /var/run/docker.sock:/var/run/docker.sock \
	  --env-file "$(KAMAL_ENV_FILE)" \
	  -e KAMAL_REGISTRY_PASSWORD -e KAMAL_HEALTHCHECK_URL $(SMTP_ENV) \
	  -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0='*' \
	  $(KAMAL_IMAGE)

# DEST IS REQUIRED, and the guard is not pedantry. Without `-d`, kamal uses
# config/deploy.yml. In the portal that file named a DIFFERENT live host with a
# DIFFERENT image from every destination, so a dropped `DEST=` did not fail —
# it deployed, somewhere else. Here the base names an unresolvable host as a
# second lock, and this guard is the first.
define require_dest
	@test -n "$(DEST)" || { \
	  echo "!! DEST is required — a bare deploy has no host to go to." >&2; \
	  echo "   make $@ DEST=<$$(ls config/deploy.*.yml 2>/dev/null | sed 's|.*deploy\.||;s|\.yml||' | paste -sd'|')>" >&2; \
	  exit 1; }
	@test -f "$(KAMAL_ENV_FILE)" || { \
	  echo "!! $(KAMAL_ENV_FILE) is missing — the host details for '$(DEST)' live there." >&2; \
	  echo "   cp .kamal/env.example $(KAMAL_ENV_FILE)   # then fill it in" >&2; \
	  exit 1; }
endef

# The address the post-deploy hook probes, derived from the destination's own
# `proxy.hosts` rather than written down twice. In the portal the hook existed
# for weeks and always SKIPPED: the variable was passed through and never set,
# so every deploy printed "skipping smoke checks" and reported success.
dest_url = https://$(shell awk '/^proxy:/{p=1} p&&/^ *- /{gsub(/^ *- /,"");print;exit}' config/deploy.$(DEST).yml)

deploy: ## [DEST=x] Build, push and swap the container — make deploy DEST=connectix
	$(require_dest)
	@echo "==> post-deploy smoke checks will run against $(dest_url)"
	KAMAL_HEALTHCHECK_URL=$(dest_url) $(KAMAL) deploy -d $(DEST)
