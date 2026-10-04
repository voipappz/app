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

# Playwright needs the app running, and each test target needs the same
# start-wait-stop dance. One implementation in bin/, called from each.
SERVE = PORT=$(PORT) bin/dev-serve.sh
STOP  = PORT=$(PORT) $(M) stop >/dev/null

# The login gate: a valid token for the API in .env before anything that talks
# to it. Reuses the cached token while it is valid, signs in again otherwise.
LOGIN = TOKEN="$(TOKEN)" bin/onboard.sh

# Every target in one place so `check-make` can prove each still has a rule.
# Add a target: add it here.
PHONY_TARGETS := help setup install browsers env dev build preview serve stop \
                 lint fix unit check test test-list report doctor secrets \
                 docker-build docker-run check-make clean \
                 kamal-config kamal-push deploy destinations onboard

.PHONY: $(PHONY_TARGETS)
.DEFAULT_GOAL := help

# ONE list, generated from the `##` comments on the rules themselves, so it can
# never drift from what the Makefile actually does. Every target appears --
# nothing hidden -- grouped by the `##@` section it lives under.
help: ## Show this help
	@printf '\n\033[1mWorkflow:\033[0m  setup -> dev -> test -> check -> push\n'
	@awk 'BEGIN { FS = ":.*## "; pad = "                              " } \
	     /^##@ / { printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next } \
	     /^[a-zA-Z0-9_%-]+:.*## / { \
	       desc = $$2; label = $$1; \
	       if (match(desc, /^\[[^]]*\] /)) { label = label " " substr(desc, 1, RLENGTH - 1); desc = substr(desc, RLENGTH + 1) } \
	       printf "  \033[36m%s\033[0m%s %s\n", label, substr(pad, 1, 28 - length(label)), desc \
	     }' $(firstword $(MAKEFILE_LIST))
	@printf '\n\033[2many spec is its own target:  make test-users   make test-dids   (make test-list)\033[0m\n\n'

##@ Setup

# ONE command from a fresh clone to a machine that can run the app and the
# suite. Idempotent, so it is also what to run when you do not know the state.
setup: ## [DOCKER=1] Everything a fresh clone needs: node, .env, dependencies, browsers
	@if [ -z "$(DOCKER)" ]; then bin/dev-host-tools.sh; else echo "DOCKER=1: skipping host node"; fi
	@$(M) env
	@$(M) install
	@if [ -z "$(DOCKER)" ]; then $(M) browsers; else echo "browsers live in the test image"; fi
	@echo
	@echo "Ready. Put real values in .env, then:  make dev$(if $(DOCKER), DOCKER=1,)"

# `npm ci` is the reproducible one and needs a lockfile in sync with
# package.json; `npm install` is the forgiving fallback for a repo without one.
install: ## [DOCKER=1] Install node dependencies (npm ci when a lockfile is present)
	@if [ -n "$(DOCKER)" ]; then $(DC) run --rm --no-deps -T app npm ci; \
	 elif [ -f package-lock.json ]; then $(NPM) ci; else $(NPM) install; fi

browsers: ## Install the Playwright browser the suite drives
	$(NPM) exec -- playwright install $(BROWSER) --with-deps

# Never overwrites an existing .env: that file holds the only copy of your
# credentials, and a clobber is silent and unrecoverable.
onboard: ## [TOKEN=1] Make sure there is a valid login token for the API
	@$(LOGIN)

env: ## Create .env from .env.example (never overwrites an existing one)
	@if [ -f .env ]; then echo ".env exists, leaving it alone"; \
	 else cp .env.example .env; echo "created .env from .env.example -- fill it in"; fi

##@ Develop

dev: ## [PORT=3000 DOCKER=1] Check the login token, then start the dev server
	@$(LOGIN)
	@if [ -n "$(DOCKER)" ]; then $(DC) up app; else $(NPM) run dev -- --port $(PORT); fi

build: ## [DOCKER=1] Build the production bundle
	@if [ -n "$(DOCKER)" ]; then $(DC) run --rm -T build; else $(NPM) run build; fi

preview: ## Serve the production build locally
	$(NPM) run preview

# The background server the test targets use. It refuses a port held by another
# app rather than testing against it -- see the comment in bin/dev-serve.sh.
serve: ## [PORT=3000] Check the login token, start the dev server in the background and wait for it
	@$(LOGIN)
	@$(SERVE)

# One line, one decision: `exit 0` would end only its own line, and make runs
# each recipe line in a fresh shell.
stop: ## [PORT=3000] Stop a server this Makefile started
	@if [ -f /tmp/vite-$(PORT).pid ]; then \
	   kill "$$(cat /tmp/vite-$(PORT).pid)" 2>/dev/null || true; \
	   rm -f /tmp/vite-$(PORT).pid; echo "stopped :$(PORT)"; \
	 else echo "nothing to stop on :$(PORT)"; fi

##@ Quality

lint: ## Run ESLint over the working tree
	$(NPM) run lint

fix: ## Run ESLint with --fix
	$(NPM) exec -- eslint . --fix

unit: ## Run the Vitest unit suite
	$(NPM) run test:unit:run

# The gate a PR has to pass, in CI's order, so a red CI is reproducible here.
check: ## check-make, secrets, lint, unit and a build -- the pre-push gate
	@$(M) check-make
	@$(M) secrets
	@$(M) lint
	@$(M) unit
	@$(M) build
	@echo; echo "check: all green"

##@ Test

# ONE target for Playwright. SPEC= narrows it, HEADED=1 and DEBUG=1 are flags
# rather than separate targets, because two names for one action is a question
# every reader has to answer before they can use either.
test: ## [SPEC=x HEADED=1 DEBUG=1 DOCKER=1] Check the login token, then run Playwright specs
	@$(LOGIN)
	@if [ -n "$(DOCKER)" ]; then \
	   $(DC) run --rm -T test; \
	 else \
	   $(SERVE); \
	   $(if $(DEBUG),PWDEBUG=1 ,)$(NPM) exec -- playwright test \
	     $(if $(SPEC),tests/$(SPEC).spec.ts,) \
	     --project=$(BROWSER) $(if $(HEADED),--headed,) $(if $(DEBUG),--debug,) \
	     $(if $(or $(HEADED),$(DEBUG)),,--reporter=line); \
	   status=$$?; $(STOP); exit $$status; \
	 fi

# Any spec name is its own target -- `make test-users`, `make test-dids` --
# without a hand-written rule per spec. The 60 copy-pasted targets this
# replaced drifted: some passed --timeout, some did not, and three named a
# spec file that had been renamed. An explicit rule always beats this pattern,
# so test-list below still resolves to its own rule.
test-%: ## Run one spec by name (make test-users, make test-dids, ...)
	@$(M) test SPEC=$*

test-list: ## List every spec name you can pass to SPEC= or test-<name>
	@ls tests/*.spec.ts | sed 's|tests/||; s|\.spec\.ts||' | sort | \
	   { column -c 100 2>/dev/null || cat; }

report: ## Open the last Playwright HTML report
	$(NPM) exec -- playwright show-report

##@ Docker

docker-build: ## [TAG=dev] Build the container image
	docker build -t $(IMAGE):$(TAG) .

docker-run: ## [TAG=dev PORT=3000] Run the built image against your .env
	docker run --rm -p $(PORT):80 --env-file .env $(IMAGE):$(TAG)

##@ Maintenance

doctor: ## Tooling, configuration and whether the API answers -- read-only
	@bin/doctor.sh

secrets: ## Scan everything git would publish for live credentials
	@bin/check-secrets.sh

# A .PHONY target with no rule is not an error: make prints "Nothing to be
# done" and exits 0, so a deleted rule looks like a working `make check` that
# silently skips a step. CI runs this.
check-make: ## Fail if any .PHONY target has no rule (CI runs this)
	@missing=""; \
	 for t in $(PHONY_TARGETS); do \
	   grep -qE "^$$t:" $(firstword $(MAKEFILE_LIST)) || missing="$$missing $$t"; \
	 done; \
	 if [ -n "$$missing" ]; then \
	   echo "Makefile: .PHONY targets with no rule:$$missing"; exit 1; \
	 fi; \
	 echo "check-make: all $(words $(PHONY_TARGETS)) targets have a rule"

clean: ## Remove build output, test artifacts and stray server logs
	rm -rf dist test-results playwright-report coverage test-results.json
	rm -f /tmp/vite-*.log /tmp/vite-*.pid
	@echo "clean"

##@ Deploy — kamal, from this repo

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

kamal-config: ## [DEST=x] Render the resolved kamal config and change nothing
	$(require_dest)
	$(KAMAL) config -d $(DEST)

# Separate from deploy because the image push is the step this network fails:
# Docker Hub answers `invalid content range` on an interrupted layer upload,
# and retrying the whole deploy to get past it wastes the container swap too.
# Build layers are cached, so a retry here costs minutes.
kamal-push: ## [DEST=x] Build and push the image only, no container swap
	$(require_dest)
	$(KAMAL) build push -d $(DEST)

# The address the post-deploy hook probes, derived from the destination's own
# `proxy.hosts` rather than written down twice. In the portal the hook existed
# for weeks and always SKIPPED: the variable was passed through and never set,
# so every deploy printed "skipping smoke checks" and reported success.
dest_url = https://$(shell awk '/^proxy:/{p=1} p&&/^ *- /{gsub(/^ *- /,"");print;exit}' config/deploy.$(DEST).yml)

deploy: ## [DEST=x] Build, push and swap the container — make deploy DEST=connectix
	$(require_dest)
	@echo "==> post-deploy smoke checks will run against $(dest_url)"
	KAMAL_HEALTHCHECK_URL=$(dest_url) $(KAMAL) deploy -d $(DEST)

# There is no single "production": one destination per host, each with its own
# hostname and API. This lists them rather than pretending one URL speaks for
# all. Host addresses are not shown — they are not in git.
destinations: ## The kamal destinations this repo can deploy to
	@echo "=== Destinations (config/) ==="
	@for f in config/deploy.*.yml; do \
	  d=$$(basename $$f .yml | sed 's/deploy\.//'); \
	  site=$$(awk '/^proxy:/{p=1} p&&/^ *- /{gsub(/^ *- /,"");print;exit}' $$f); \
	  api=$$(sed -n 's/^ *VITE_API_BASE_URL: *//p' $$f | head -1); \
	  env=$$( test -f .kamal/env.$$d && echo "env ok" || echo "NO .kamal/env.$$d" ); \
	  printf "  %-12s %-32s api %-36s %s\n" "$$d" "$$site" "$$api" "$$env"; \
	done
