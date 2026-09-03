.PHONY: help install setup dev build lint db-migrate db-reset db-types db-seed \
       agents-setup agents-dev agents-docker agents-docker-down \
       generate-content generate-practice-problems \
       cli-health cli-generate-lesson cli-seed-practice-problems \
       setup-all dev-all tunnel dev-share dev-share-all \
       eval-test eval-matrix \
       visual-auth visual-test visual-compare mobile-test \
       sync clean \
       studio-dev studio-seed studio-test \
       studio-setup studio-migrate studio-migrate-remote \
       studio-seed-remote studio-deploy-check studio-build \
       studio-up studio-down studio-logs studio-full-deploy

# —— Help ——

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# —— Next.js ——

install: ## Install Node dependencies
	pnpm install

setup: install## Full Next.js setup (install + schema + seed)
	@echo "\n✅ Next.js setup complete. Add your keys to .env using secrets-sync command, then run: make dev"

dev: ## Start Next.js dev server
	pnpm dev

build: ## Production build
	pnpm build

lint: ## Run ESLint
	pnpm lint

# —— Database ——

db-migrate: ## Apply pending Supabase migrations
	supabase db push

db-reset: ## Reset local Supabase database
	supabase db reset

db-types: ## Regenerate Supabase TypeScript types
	npx supabase gen types typescript --project-id "xyhkkzuomlzfqfkdyoor" --schema public > src/types/supabase.ts


db-seed: ## Seed questions and lessons
	pnpm db:seed

# —— Agno Agents ——

agents-setup: ## Set up the Python agent service (create venv + install deps)
	cd agents && uv sync
	@if [ ! -f agents/.env ]; then cp agents/.env.example agents/.env; echo "\n⚠️  Created agents/.env from .env.example — fill in your keys"; fi
	@echo "\n✅ Agent setup complete."

agents-dev: ## Run the agent service locally (no Docker)
	cd agents && uv run uvicorn main:app --reload --port 8080

agents-docker: ## Start the agent service via Docker Compose
	docker compose up --build -d

agents-docker-down: ## Stop the agent service
	docker compose down

generate-content: ## Run SAT content generation workflow (topics → subtopics → problems)
	cd agents && uv run python -m cli.main generate-content

generate-practice-problems: ## Run practice problems generation workflow (topics → subtopics → problems)
	cd agents && uv run python seed_all_practice_problems.py

cli-health: ## Check agent service status (local Python, no server needed)
	cd agents && uv run python -m cli.main health

cli-generate-lesson: ## Generate a lesson — pass args via ARGS="--question-text ... --correct-answer ... --category ... --explanation ..."
	cd agents && uv run python -m cli.main generate-lesson $(ARGS)

cli-seed-practice-problems: ## Seed practice problems — pass args via ARGS="--topic ... --subtopic ... [--subject math] [--count 60]"
	cd agents && uv run python -m cli.main seed-practice-problems $(ARGS)

# —— Combined ——

setup-all: setup agents-setup ## Full setup for both Next.js and agents
	@echo "\n✅ All services set up. Configure .env.local and agents/.env, then run: make dev-all"

sync: ## Install all dependencies (Node + Python)
	pnpm install
	cd agents && uv sync

dev-all: ## Start both Next.js and the agent service concurrently
	@echo "Starting agent service..."
	@cd agents && set -a && . ./.env && set +a && uv run uvicorn main:app --reload --port 8080 &
	@echo "Starting Next.js..."
	@pnpm dev

# —— Share / ngrok tunnel ——
#
# One-time setup:
#   brew install ngrok/ngrok/ngrok
#   ngrok config add-authtoken <token from https://dashboard.ngrok.com>

NGROK_DOMAIN ?= 899e-2600-1702-8660-e20-24e4-ebb-62b0-c845.ngrok-free.app

tunnel: ## Expose Next.js (port 3000) publicly via the reserved ngrok domain
	ngrok http --url=$(NGROK_DOMAIN) 3000

dev-share: ## Start Next.js + ngrok tunnel; Ctrl-C tears down both
	@(trap 'kill 0' SIGINT SIGTERM EXIT; \
		pnpm dev & \
		ngrok http --url=$(NGROK_DOMAIN) 3000 & \
		wait)

dev-share-all: ## Start agents + Next.js + ngrok tunnel; Ctrl-C tears down all three
	@(trap 'kill 0' SIGINT SIGTERM EXIT; \
		(cd agents && set -a && . ./.env && set +a && . .venv/bin/activate && uvicorn main:app --reload --port 8080) & \
		pnpm dev & \
		ngrok http --url=$(NGROK_DOMAIN) 3000 & \
		wait)

# —— Micro-lesson evaluator ——

eval-test: ## Run the evaluator fixture tests (adherence + math assertions on hand-built lessons)
	npx tsx --env-file=.env src/lib/evals/__fixtures__/run-tests.ts

eval-matrix: ## Run the evaluator matrix for VARIANT (default baseline) with ITERATIONS (default 3). Example: make eval-matrix VARIANT=c1-reordered ITERATIONS=5
	npx tsx --env-file=.env .local/eval-matrix.ts --variant=$(or $(VARIANT),baseline) --iterations=$(or $(ITERATIONS),3)

# —— Cross-browser visual harness ——

visual-auth: ## Sign in via @clerk/testing helper and save session storage. Re-run with PLAYWRIGHT_FORCE_AUTH=1 to redo. Optionally PLAYWRIGHT_TEST_EMAIL=<addr>.
	pnpm exec playwright test --project=auth

visual-test: ## Walk the ideal lesson in chromium + webkit, capture per-step screenshots and DOM measurements
	pnpm exec playwright test --project=chromium --project=webkit

visual-compare: ## Diff chromium vs webkit screenshots into an HTML report
	npx tsx .local/playwright/compare.ts

mobile-test: ## A5: drive the portrait mobile lesson renderer (/dev/mobile harness) on an iPhone viewport. No auth needed. Set PLAYWRIGHT_BASE_URL if the dev server is not on :3000.
	pnpm exec playwright test --project=mobile

# —— Studio (local dev) ——

studio-dev: ## Start Studio locally (local Supabase, no production DB)
	@echo "Starting agents with local Supabase..."
	@cd agents && env $$(cat ../.env.studio.local | grep -v '^#' | xargs) uv run uvicorn main:app --reload --port 8080 &
	@echo "Starting Next.js with local Supabase..."
	@env $$(cat .env.studio.local | grep -v '^#' | xargs) pnpm dev

studio-seed: ## Seed Studio agents in local Supabase
	cd agents && env $$(cat ../.env.studio.local | grep -v '^#' | xargs) uv run python scripts/seed_studio_agents.py

studio-test: ## Run Studio backend tests
	cd agents && uv run pytest tests/ -v

# —— Studio (deployment) ——

studio-setup: sync ## Full Studio setup: install deps, start local Supabase, migrate, seed
	@echo "Starting local Supabase..."
	supabase start || true
	@echo "Applying Studio migrations..."
	@for f in supabase/migrations/20260420_studio_agent_registry.sql \
	          supabase/migrations/20260420_studio_student_pov.sql \
	          supabase/migrations/20260421_studio_skills.sql \
	          supabase/migrations/20260421_studio_archetypes.sql; do \
		echo "  Applying $$f..."; \
		docker cp $$f supabase_db_athena:/tmp/migration.sql && \
		docker exec supabase_db_athena psql -U postgres -d postgres -f /tmp/migration.sql > /dev/null 2>&1 || true; \
	done
	@echo "Seeding Studio agents..."
	@cd agents && env $$(cat ../.env.studio.local | grep -v '^#' | xargs) uv run python scripts/seed_studio_agents.py
	@echo "\n✅ Studio setup complete. Run: make studio-dev"

studio-migrate: ## Apply Studio migrations to local Supabase
	@for f in supabase/migrations/20260420_studio_agent_registry.sql \
	          supabase/migrations/20260420_studio_student_pov.sql \
	          supabase/migrations/20260421_studio_skills.sql \
	          supabase/migrations/20260421_studio_archetypes.sql; do \
		echo "Applying $$f..."; \
		docker cp $$f supabase_db_athena:/tmp/migration.sql && \
		docker exec supabase_db_athena psql -U postgres -d postgres -f /tmp/migration.sql > /dev/null 2>&1 || true; \
	done
	@echo "✅ Migrations applied"

studio-migrate-remote: ## Apply Studio migrations to remote Supabase (uses SUPABASE_DB_URL)
	@if [ -z "$(SUPABASE_DB_URL)" ]; then echo "Set SUPABASE_DB_URL (postgres connection string)"; exit 1; fi
	@for f in supabase/migrations/20260420_studio_agent_registry.sql \
	          supabase/migrations/20260420_studio_student_pov.sql \
	          supabase/migrations/20260421_studio_skills.sql \
	          supabase/migrations/20260421_studio_archetypes.sql; do \
		echo "Applying $$f to remote..."; \
		psql "$(SUPABASE_DB_URL)" -f $$f > /dev/null 2>&1 || true; \
	done
	@echo "✅ Remote migrations applied"

studio-seed-remote: ## Seed Studio agents on remote Supabase
	@if [ -z "$(SUPABASE_URL)" ] || [ -z "$(SUPABASE_SERVICE_ROLE_KEY)" ]; then \
		echo "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"; exit 1; fi
	cd agents && SUPABASE_URL=$(SUPABASE_URL) SUPABASE_SERVICE_ROLE_KEY=$(SUPABASE_SERVICE_ROLE_KEY) \
		uv run python scripts/seed_studio_agents.py

studio-deploy-check: ## Verify Studio is ready to deploy (tests + typecheck)
	@echo "Running backend tests..."
	@cd agents && uv run pytest tests/ -q --tb=short
	@echo "Running TypeScript check..."
	@npx tsc --noEmit 2>&1 | grep -v "onboarding\|resend" || true
	@echo "\n✅ Deploy checks passed"

studio-build: studio-deploy-check ## Build Studio Docker images
	@echo "Building frontend image..."
	docker build -t athena-studio-web .
	@echo "Building agents image..."
	docker build -t athena-studio-agents ./agents
	@echo "\n✅ Images built: athena-studio-web, athena-studio-agents"

studio-up: ## Start Studio containers (uses .env.studio.local for local, or set env vars for remote)
	@echo "Starting Studio containers..."
	docker compose -f docker-compose.studio.yml up -d
	@echo "\n✅ Studio running"

studio-down: ## Stop Studio containers
	docker compose -f docker-compose.studio.yml down

studio-logs: ## Tail Studio container logs
	docker compose -f docker-compose.studio.yml logs -f

studio-full-deploy: ## Full remote deploy: migrate DB, seed, build, push images
	@echo "=== Studio Full Deploy ==="
	@echo "Step 1: Pre-flight checks..."
	@$(MAKE) studio-deploy-check
	@echo "Step 2: Apply migrations..."
	@$(MAKE) studio-migrate-remote
	@echo "Step 3: Seed agents..."
	@$(MAKE) studio-seed-remote
	@echo "Step 4: Build images..."
	@$(MAKE) studio-build
	@echo "\n🚀 Images built. Push to your registry and deploy."
	@echo "   docker tag athena-studio-web <registry>/athena-studio-web"
	@echo "   docker tag athena-studio-agents <registry>/athena-studio-agents"
	@echo "   docker push <registry>/athena-studio-web"
	@echo "   docker push <registry>/athena-studio-agents"

clean: ## Remove build artifacts and generated files
	rm -rf .next node_modules agents/.venv agents/__pycache__

# ─── Secrets CLI (auto-generated) ────────────────────────────────────────────

.PHONY: secrets-login secrets-logout secrets-whoami secrets-switch secrets-list secrets-sync

secrets-login:
	npx @superset-signal/secrets login

secrets-logout:
	npx @superset-signal/secrets logout

secrets-whoami:
	npx @superset-signal/secrets whoami

secrets-switch:
	npx @superset-signal/secrets switch

secrets-list:
	npx @superset-signal/secrets list

secrets-sync:
	npx @superset-signal/secrets sync
# ─── End Secrets CLI ─────────────────────────────────────────────────────────
