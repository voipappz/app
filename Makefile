.PHONY: help dev check-mothership up down verify backup truncate test push deploy ship status

# Production URL for `make status` — read from .env / env, no hardcoded host.
# Set PROD_URL=https://your-host in .env (or pass PROD_URL=... on the CLI).
PROD_URL ?= $(shell sed -n 's/^PROD_URL=//p' .env 2>/dev/null | head -1 | tr -d '\r"')
DUCKDB_UI_PORT ?= 4213

# Local stack endpoints (override on the CLI, e.g. `make verify DENO_API=http://host:4001`)
DENO_API  ?= http://localhost:4001
WEB_APP   ?= http://localhost:4200
# ── Mothership data plane (PostgREST/Kong + cable) ──────────────────────────
# The app (deno + Vite) is LOCAL; PostgREST, Kong and the cable belong to the
# mothership. Local on this box, but override to point at a remote mothership:
#   make dev KONG=http://mothership:8000 CABLE_ADDR=mothership:6000
# gateway → PostgREST (/rest/v1, /rpc/login). NB: no inline comment — make would
# fold the trailing spaces into the value and corrupt the URL.
KONG      ?= http://localhost:8000
# Cable server (va-crystal ActionCable) — the live call-event source.
CABLE_ADDR ?= 127.0.0.1:6000
CABLE_HOST  = $(firstword $(subst :, ,$(CABLE_ADDR)))
CABLE_PORT  = $(lastword  $(subst :, ,$(CABLE_ADDR)))

# Supabase (hosted Postgres) is the system of record. Creds come from .env
# (SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL) and are used via the REST API.
# SUPABASE_TABLES empty = auto-discover every table from the REST schema.
BACKUP_DIR      ?= backups
SUPABASE_TABLES ?=

.DEFAULT_GOAL := help

help: ## Show this help
	@awk 'BEGIN{FS=":.*## ";printf "\nmake \033[36m<target>\033[0m\n\n"} \
	      /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-8s\033[0m %s\n",$$1,$$2}' $(MAKEFILE_LIST)

dev: check-mothership ## Run the app locally (deno-api + Vite), connected to the mothership data plane
	docker compose up -d deno-api          # backend brain: login proxy, cable→DuckDB, /ws, worker
	-docker compose stop react-app         # free :4200 so host Vite (HMR) can bind it
	@echo "deno-api → :4001 · Vite → http://localhost:4200 (proxies to deno :4001 + Kong $(KONG))"
	npm run dev

check-mothership: ## Verify the mothership data plane (PostgREST/Kong + cable) is reachable
	@echo "==> Mothership data plane (override: KONG=… CABLE_ADDR=…)"
	@code=$$(curl -s -o /dev/null -w '%{http_code}' "$(KONG)/rest/v1/" --max-time 5); \
	  case $$code in [234]*) s="OK ($$code)";; *) s="DOWN ($$code) — set KONG=http://<mothership>:8000";; esac; \
	  printf "  %-10s %-28s %s\n" "postgrest" "$(KONG)/rest/v1" "$$s"
	@if timeout 3 bash -c '</dev/tcp/$(CABLE_HOST)/$(CABLE_PORT)' 2>/dev/null; then s="OK"; \
	  else s="DOWN — set CABLE_ADDR=<mothership>:6000"; fi; \
	  printf "  %-10s %-28s %s\n" "cable" "$(CABLE_ADDR)" "$$s"

up: ## Start the full app stack in Docker (web + API)
	docker compose up -d react-app deno-api
	@echo "web → http://localhost:4200   api → http://localhost:4001"

down: ## Stop all services
	docker compose down


verify: ## Check all assets are OK (API, web, cable server, DuckDB, Supabase)
	@echo "==> Services"
	@printf "  %-9s %-30s " "deno-api" "$(DENO_API)/test"; curl -sf -o /dev/null "$(DENO_API)/test" && echo OK || echo DOWN
	@printf "  %-9s %-30s " "web/vite" "$(WEB_APP)/";      curl -sf -o /dev/null "$(WEB_APP)/"     && echo OK || echo DOWN
	@echo "==> Cable server (va-crystal ActionCable — the live call-event source)"
	@printf "  %-9s %-30s " "cable" "$(CABLE_ADDR)"; python3 -c "import socket,sys;h,p='$(CABLE_ADDR)'.split(':');s=socket.socket();s.settimeout(2);sys.exit(s.connect_ex((h,int(p))))" && echo OK || echo DOWN
	@echo "==> Dependencies (reported by $(DENO_API)/health)"
	@curl -s "$(DENO_API)/health" | python3 -c "import sys,json;d=json.load(sys.stdin);c=d.get('checks',{});[print('  %-9s %-5s %s'%(k,v.get('status','?').upper(),'('+v['detail']+')' if v.get('detail') else '')) for k,v in c.items()];print('  %-9s %s'%('overall',d.get('status','?').upper()))" 2>/dev/null || echo "  health endpoint unreachable"

# Load Supabase creds from .env and resolve the table list (explicit or auto-discovered).
# Read the two creds straight from .env (sourcing the whole file is fragile —
# values with spaces/special chars break `. ./.env`).
define _supabase_env
url=$$(sed -n 's/^VITE_SUPABASE_URL=//p' .env | head -1 | tr -d '\r"'); \
key=$$(sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' .env | head -1 | tr -d '\r"'); \
[ -n "$$url" ] && [ -n "$$key" ] || { echo "missing Supabase creds in .env (VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)"; exit 1; }; \
tables="$(SUPABASE_TABLES)"; \
[ -n "$$tables" ] || tables=$$(curl -s "$$url/rest/v1/" -H "apikey: $$key" -H "Authorization: Bearer $$key" | python3 -c "import sys,json;d=json.load(sys.stdin);print(' '.join((d.get('definitions') or d.get('components',{}).get('schemas',{})).keys()))"); \
[ -n "$$tables" ] || { echo "no tables found via REST schema"; exit 1; }
endef

backup: ## Back up Supabase data -> backups/supabase-<ts>/<table>.json (SUPABASE_TABLES to limit)
	@$(_supabase_env); \
	  ts=$$(date +%Y%m%d_%H%M%S); dir="$(BACKUP_DIR)/supabase-$$ts"; mkdir -p "$$dir"; \
	  echo "Supabase $$url"; echo "tables: $$tables"; \
	  for t in $$tables; do \
	    printf "  %-24s " "$$t"; \
	    code=$$(curl -s -o "$$dir/$$t.json" -w '%{http_code}' "$$url/rest/v1/$$t?select=*" -H "apikey: $$key" -H "Authorization: Bearer $$key"); \
	    n=$$(python3 -c "import json;print(len(json.load(open('$$dir/$$t.json'))))" 2>/dev/null || echo '?'); \
	    echo "HTTP $$code  $$n rows"; \
	  done; \
	  echo "-> $$dir"

truncate: ## DELETE all rows from Supabase tables (SUPABASE_TABLES, or all). FORCE=1 skips prompt
	@$(_supabase_env); \
	  if [ "$(FORCE)" != "1" ]; then \
	    printf "⚠️  DELETE ALL ROWS from [%s] on %s ? [y/N] " "$$tables" "$$url"; \
	    read a; [ "$$a" = y ] || [ "$$a" = Y ] || { echo aborted; exit 1; }; \
	  fi; \
	  for t in $$tables; do \
	    printf "  delete %-22s " "$$t"; \
	    code=$$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$$url/rest/v1/$$t?id=not.is.null" -H "apikey: $$key" -H "Authorization: Bearer $$key" -H "Prefer: return=minimal"); \
	    echo "HTTP $$code"; \
	  done; \
	  echo "(rows with a NULL id, or tables without an 'id' column, are not matched — pass SUPABASE_TABLES to target specific tables)"

test: ## Run all Playwright tests (needs `make dev` already running)
	npx playwright test

test-auth: ## Run only the real-Supabase auth flow tests
	npx playwright test tests/auth-real.spec.ts

# Kamal needs ruby-3.3.5 and the .kamal/secrets file sourced for ERB substitution
# in config/deploy.yml (Kamal only auto-sources it for the registry password).
KAMAL ?= $(shell test -x /home/ubuntu/.rvm/gems/ruby-3.3.5/wrappers/kamal && echo /home/ubuntu/.rvm/gems/ruby-3.3.5/wrappers/kamal || command -v kamal)

push: ## git push current branch to origin
	git push

deploy: ## Build image, push to registry, swap container on production
	@set -a; . .kamal/secrets; set +a; $(KAMAL) deploy

ship: push deploy ## git push + kamal deploy in one shot

status: ## Local git + production health + deployed version
	@echo "=== Local git ==="
	@git log --oneline -1
	@git status -sb
	@echo
	@if [ -z "$(PROD_URL)" ]; then \
	  echo "=== Production: PROD_URL not set (skip) — set PROD_URL in .env ==="; \
	else \
	  echo "=== Production ($(PROD_URL)) ==="; \
	  curl -s -o /dev/null -w "GET /      → %{http_code}\n" $(PROD_URL)/; \
	  curl -s -o /dev/null -w "GET /test  → %{http_code}\n" $(PROD_URL)/test; \
	  echo "=== Deployed version ==="; \
	  curl -s $(PROD_URL)/ | grep -oE 'src="/assets/[^"]+\.js"' | head -1 | sed 's/src="//;s/"//' \
	    | xargs -I{} curl -s "$(PROD_URL){}" | grep -oE '2026\.[0-9.]+-[a-f0-9]+' | sort -u | head -1; \
	fi
