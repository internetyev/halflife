# halflife — developer command surface
#
# A thin, dependency-free wrapper over the npm scripts in package.json and the
# Python test discovery, mirroring the step order in .github/workflows/ci.yml
# so `make ci` runs locally exactly what CI runs on every PR. Recipes require
# literal tabs (pinned by the [Makefile] rule in .editorconfig).
#
# The autonomous routine never runs installs (see ROUTINE.md / CONTRIBUTING.md);
# `make install` is here for the first human to clone, not for the routine.

# Fail a recipe on the first error, an unset variable, or a broken pipe.
SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c

# `make` with no target prints the help table.
.DEFAULT_GOAL := help

.PHONY: help install dev build start typecheck lint validate test test-py ci clean

help: ## List the available targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Install npm dependencies (human step — the routine never installs)
	npm install --no-fund --no-audit

dev: ## Run the Next.js dev server
	npm run dev

build: ## Production build (Next.js)
	npm run build

start: ## Serve the production build
	npm run start

typecheck: ## Type-check with tsc --noEmit
	npm run typecheck

lint: ## Lint with next lint
	npm run lint

validate: ## Validate committed seed + report + job-title JSON
	npm run validate

test: ## Run the node:test suites
	npm test

test-py: ## Run the Python unittest suites
	python3 -m unittest discover -s scripts/__tests__ -p 'test_*.py'

# Mirrors the job in .github/workflows/ci.yml (minus the install step, which the
# runner does separately). Keep this list in sync with that workflow's order.
ci: typecheck lint build validate test test-py ## Run the full CI sequence locally

clean: ## Remove build output and Python bytecode caches
	rm -rf .next
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
