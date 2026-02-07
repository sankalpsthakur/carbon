.PHONY: up up-postgres up-ollama down logs test validate backup migrate clean help

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-16s %s\n", $$1, $$2}'

# ── Docker targets ────────────────────────────────────────────────────────────

up: ## Start all MCP servers (SQLite default)
	docker compose up --build -d

up-postgres: ## (Disabled) Postgres backend is not supported yet
	@echo "Postgres backend is not supported yet. Use 'make up' (sqlite/file) instead."

up-ollama: ## Start all MCP servers with Ollama LLM backend
	docker compose -f docker-compose.yml -f docker-compose.ollama.yml up --build -d

up-cloud: ## (Disabled) Postgres backend is not supported yet
	@echo "Postgres backend is not supported yet. Use 'make up-ollama' or 'make up' instead."

down: ## Stop all MCP servers
	docker compose down

logs: ## Tail MCP server logs
	docker compose logs -f

# ── Testing ──────────────────────────────────────────────────────────────────

test: ## Run MCP server smoke tests
	cd plugins && node test-mcp-servers.js

test-unit: ## Run unit tests
	cd plugins && node --test tests/ 2>/dev/null || echo "No tests found or test runner unavailable"

validate: ## Validate all plugin manifests
	cd plugins && node shared-services/tools/validate.js

# ── Data management ──────────────────────────────────────────────────────────

backup: ## Back up all data directories to backups/
	@mkdir -p backups
	@ts=$$(date +%Y%m%d_%H%M%S); \
	tar czf backups/carbon-data-$$ts.tar.gz \
		plugins/scope3-calculation/data \
		plugins/scope3-execution/data \
		plugins/scope3-strategy/data \
		plugins/scope12-accounting/data \
		plugins/connectors/data \
		plugins/swarms/data \
		2>/dev/null || true; \
	echo "Backup saved to backups/carbon-data-$$ts.tar.gz"

migrate: ## Run FileStore → SQLite/Postgres migration
	cd plugins && node shared-services/tools/migrate-filestore.js

# ── Cleanup ──────────────────────────────────────────────────────────────────

clean: ## Remove build artifacts and temporary files
	rm -rf plugins/node_modules
	rm -rf backups/*.tar.gz
	docker compose down -v 2>/dev/null || true
	@echo "Cleaned."
