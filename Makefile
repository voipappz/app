.PHONY: help dev check-mothership up down build verify test push deploy ship status

# ── Config (override on the CLI or in .env) ─────────────────────────────────
# The mothership base — read from .env (VITE_MOTHERSHIP_URL), else the cloud.
MOTHERSHIP ?= $(shell sed -n 's/^VITE_MOTHERSHIP_URL=//p' .env 2>/dev/null | head -1 | tr -d '\r"')
MOTHERSHIP := $(if $(MOTHERSHIP),$(MOTHERSHIP),https://cloud.voipappz.io)

# Local stack endpoints
DENO_API ?= http://localhost:4001
WEB_APP  ?= http://localhost:4200

# Production URL for `make status` — set PROD_URL in .env (or on the CLI).
PROD_URL ?= $(shell sed -n 's/^PROD_URL=//p' .env 2>/dev/null | head -1 | tr -d '\r"')

.DEFAULT_GOAL := help

help: ## Show this help
	@awk 'BEGIN{FS=":.*## ";printf "\nmake \033[36m<target>\033[0m\n\n"} \
	      /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-16s\033[0m %s\n",$$1,$$2}' $(MAKEFILE_LIST)

dev: check-mothership ## Run the app: deno-api (Docker) + host Vite with HMR
	docker compose up -d deno-api          # backend extras: /ws events, calls-per-hour, transcripts
	-docker compose stop react-app-tichman # free :4200 so host Vite (HMR) can bind it
	@echo "deno-api → :4001 · Vite → $(WEB_APP) (proxies /api → mothership $(MOTHERSHIP))"
	npm run dev

check-mothership: ## Verify the mothership (VITE_MOTHERSHIP_URL) is reachable
	@echo "==> Mothership (override: MOTHERSHIP=https://<host>)"
	@code=$$(curl -s -o /dev/null -w '%{http_code}' "$(MOTHERSHIP)/tasks/customer_portal_data" --max-time 5); \
	  case $$code in [234]*) s="OK ($$code)";; *) s="UNREACHABLE ($$code) — set VITE_MOTHERSHIP_URL in .env";; esac; \
	  printf "  %-11s %-34s %s\n" "mothership" "$(MOTHERSHIP)" "$$s"

up: ## Start the full Docker stack (web + deno-api)
	docker compose up -d react-app-tichman deno-api
	@echo "web → $(WEB_APP)   deno-api → $(DENO_API)"

down: ## Stop all services
	docker compose down

build: ## Production build → dist/
	npm run build

verify: ## Health check: deno-api, web, and the /health dependency report
	@echo "==> Services"
	@printf "  %-9s %-30s " "deno-api" "$(DENO_API)/test"; curl -sf -o /dev/null "$(DENO_API)/test" && echo OK || echo DOWN
	@printf "  %-9s %-30s " "web/vite" "$(WEB_APP)/";      curl -sf -o /dev/null "$(WEB_APP)/"     && echo OK || echo DOWN
	@echo "==> Dependencies (reported by $(DENO_API)/health)"
	@curl -s "$(DENO_API)/health" | python3 -c "import sys,json;d=json.load(sys.stdin);c=d.get('checks',{});[print('  %-9s %-5s %s'%(k,v.get('status','?').upper(),'('+v['detail']+')' if v.get('detail') else '')) for k,v in c.items()];print('  %-9s %s'%('overall',d.get('status','?').upper()))" 2>/dev/null || echo "  health endpoint unreachable"

test: ## Run all Playwright tests (needs the app running)
	npx playwright test

# Kamal (ruby gem) must be on PATH; .kamal/secrets is sourced for ERB
# substitution in config/deploy.yml (Kamal only auto-sources it for the
# registry password). Override with KAMAL=/path/to/kamal if needed.
KAMAL ?= kamal

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
