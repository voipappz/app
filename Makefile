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

# The no-host-node path: DOCKER=1 on setup/install/dev/build/test/lint/unit/fix
# (and so on check, which just calls them) runs the job in a container instead
# (see docker-compose.yml). On a host with no usable node at all -- an old
# glibc the pinned node will not start on, say -- this is the ONLY way to lint
# or run the unit suite, which is why they take the flag too.  Compose is a docker
# subcommand (v2) on some machines and a separate binary (v1) on others;
# hardcoding one dies on the other with what reads as a broken stack.
DC ?= $(shell if docker compose version >/dev/null 2>&1; then echo 'docker compose'; \
              elif command -v docker-compose >/dev/null 2>&1; then echo 'docker-compose'; \
              else echo 'docker compose'; fi)

# Playwright needs the app running, and each test target needs the same
# start-wait-stop dance. One implementation in bin/, called from each.
SERVE = PORT=$(PORT) bin/dev-serve.sh
STOP  = PORT=$(PORT) $(M) stop >/dev/null

# Every target in one place so `check-make` can prove each still has a rule.
# Add a target: add it here.
PHONY_TARGETS := help setup install browsers env dev build preview serve stop \
                 lint fix unit check gate test test-list report doctor secrets \
                 docker-build docker-run check-make clean

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
	@if [ -n "$(DOCKER)" ]; then $(DC) run --rm --no-deps -T app sh -c 'npm ci'; \
	 elif [ -f package-lock.json ]; then $(NPM) ci; else $(NPM) install; fi

browsers: ## Install the Playwright browser the suite drives
	$(NPM) exec -- playwright install $(BROWSER) --with-deps

# Never overwrites an existing .env: that file holds the only copy of your
# credentials, and a clobber is silent and unrecoverable.
env: ## Create .env from .env.example (never overwrites an existing one)
	@if [ -f .env ]; then echo ".env exists, leaving it alone"; \
	 else cp .env.example .env; echo "created .env from .env.example -- fill it in"; fi

##@ Develop

dev: ## [PORT=3000 DOCKER=1] Start the dev server (DOCKER=1 needs no host node)
	@if [ -n "$(DOCKER)" ]; then $(DC) up app; else $(NPM) run dev -- --port $(PORT); fi

build: ## [DOCKER=1] Build the production bundle
	@if [ -n "$(DOCKER)" ]; then $(DC) run --rm -T build; else $(NPM) run build; fi

preview: ## Serve the production build locally
	$(NPM) run preview

# The background server the test targets use. It refuses a port held by another
# app rather than testing against it -- see the comment in bin/dev-serve.sh.
serve: ## [PORT=3000] Start the dev server in the background and wait for it
	@$(SERVE)

# One line, one decision: `exit 0` would end only its own line, and make runs
# each recipe line in a fresh shell.
stop: ## [PORT=3000] Stop a server this Makefile started
	@if [ -f /tmp/vite-$(PORT).pid ]; then \
	   kill "$$(cat /tmp/vite-$(PORT).pid)" 2>/dev/null || true; \
	   rm -f /tmp/vite-$(PORT).pid; echo "stopped :$(PORT)"; \
	 else echo "nothing to stop on :$(PORT)"; fi

##@ Quality

# DOCKER=1 runs the command through `sh -c` rather than passing it to
# `compose run` directly. With compose v1 (1.29 here) a directly-passed command
# executes but its output never reaches the terminal: `run -T app npm ci`
# installs all 517 packages and prints nothing, and `run app npx vitest run`
# looks like it did nothing at all. A gate that hides its own output -- and so
# reports success it has not earned -- is worse than no gate. `sh -c` restores
# it. Quote with '...' so $(DC)'s own word splitting leaves the script intact.
lint: ## [DOCKER=1] Run ESLint over the working tree
	@if [ -n "$(DOCKER)" ]; then $(DC) run --rm --no-deps -T app sh -c 'npm run lint'; \
	 else $(NPM) run lint; fi

fix: ## [DOCKER=1] Run ESLint with --fix
	@if [ -n "$(DOCKER)" ]; then $(DC) run --rm --no-deps -T app sh -c 'npm exec -- eslint . --fix'; \
	 else $(NPM) exec -- eslint . --fix; fi

unit: ## [DOCKER=1] Run the Vitest unit suite
	@if [ -n "$(DOCKER)" ]; then $(DC) run --rm --no-deps -T app sh -c 'npm run test:unit:run'; \
	 else $(NPM) run test:unit:run; fi

# lint + unit in one go, with the whole transcript kept in tmp/gate.log.
# The log is the point: the checks run in a container on a host with no node,
# so the person running them would otherwise have to copy several hundred
# lines back by hand for anyone else to read. tmp/ is already gitignored.
# Exit status is the pipeline's first command, not tee's, so a red run still
# fails the target.
gate: ## [DOCKER=1] lint + unit, transcript in tmp/gate.log
	@mkdir -p tmp
	@set -o pipefail; \
	 { $(M) lint $(if $(DOCKER),DOCKER=1); echo; $(M) unit $(if $(DOCKER),DOCKER=1); } 2>&1 | tee tmp/gate.log; \
	 status=$$?; \
	 echo; echo "gate: transcript in tmp/gate.log"; \
	 exit $$status

# The gate a PR has to pass, in CI's order, so a red CI is reproducible here.
check: ## [DOCKER=1] check-make, secrets, lint, unit and a build -- the pre-push gate
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
test: ## [SPEC=x HEADED=1 DEBUG=1 DOCKER=1] Run Playwright specs
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
