# ============================================================
# inven-Tory — Makefile
# Works on Linux, macOS, and Windows (via Git Bash or WSL).
# ============================================================

# --------------- Python venv discovery (cross-OS) ----------
ifeq ($(OS),Windows_NT)
    PYTHON := .venv/Scripts/python
    PIP    := .venv/Scripts/pip
else
    PYTHON := .venv/bin/python
    PIP    := .venv/bin/pip
endif

# --------------- Targets -----------------------------------

.PHONY: help lint lint-check test setup-hooks

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# Fix-and-verify: always ruff --fix BEFORE black (never the reverse).
lint: ## Auto-fix imports (ruff) then format (black), then verify both clean
	@echo "==> [1/4] ruff --fix ..."
	$(PYTHON) -m ruff check --fix services/ packages/
	@echo "==> [2/4] black ..."
	$(PYTHON) -m black services/ packages/
	@echo "==> [3/4] ruff check (verify) ..."
	$(PYTHON) -m ruff check services/ packages/
	@echo "==> [4/4] black --check (verify) ..."
	$(PYTHON) -m black --check services/ packages/
	@echo "All lint checks passed"

# Read-only gate — same checks that CI and the pre-push hook run.
lint-check: ## Check only (no auto-fix). Fails if anything needs fixing.
	@echo "==> ruff check ..."
	$(PYTHON) -m ruff check services/ packages/
	@echo "==> black --check ..."
	$(PYTHON) -m black --check services/ packages/
	@echo "All lint checks passed"

test: ## Run the full Python test suite
	$(PYTHON) -m pytest packages/domain/tests packages/storage/tests -v

setup-hooks: ## Wire .githooks/ as the local Git hooks directory
	git config core.hooksPath .githooks
	@echo "Git hooks configured -> .githooks/"
	@echo "Run 'make lint' before committing to keep CI green."
