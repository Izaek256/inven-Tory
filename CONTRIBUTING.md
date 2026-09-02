# Contributing to INVENTORY Tory

Thank you for contributing. Please read this document before opening a branch or pull request.

---

## Table of Contents

1. [Branch naming](#branch-naming)
2. [Issue workflow](#issue-workflow)
3. [Commit style](#commit-style)
4. [Pull-request checklist](#pull-request-checklist)
5. [Coding standards](#coding-standards)
6. [CI requirements](#ci-requirements)
7. [Definition of Done](#definition-of-done)

---

## Branch naming

Every branch maps to a single GitHub Issue. Use the format:

```
feature/<issue-number>-<short-slug>
bugfix/<issue-number>-<short-slug>
hotfix/<issue-number>-<short-slug>
chore/<issue-number>-<short-slug>
```

Examples:

```
feature/01-repo-ci-setup
feature/02-domain-entities
bugfix/07-transfer-negative-stock
```

Branches are cut from `develop` and merged back into `develop` via pull request.

---

## Issue workflow

```
1. Pick up an issue from the backlog.
2. Create a branch:  git checkout -b feature/<N>-<slug> develop
3. Implement the work described in the issue's acceptance criteria.
4. Push and open a PR targeting `develop`.
5. CI must pass (lint + unit tests).
6. At least one review approval required (zero open review comments).
7. Squash and merge.
```

---

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

**Types:** `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`

**Scope:** the affected area, e.g. `api`, `desktop`, `domain`, `sync`, `ci`

Examples:

```
feat(domain): add InventoryTransaction entity
fix(sync): prevent duplicate outbox retry
docs(readme): add local setup prerequisites
ci: add ruff lint step to GitHub Actions
```

Keep the subject line under 72 characters. Use imperative mood ("add", not "added").

---

## Pull-request checklist

Before marking a PR as ready for review, confirm:

- [ ] Branch is up to date with `develop`.
- [ ] CI passes (lint + unit tests green).
- [ ] All new Python files pass `ruff check` and `black --check`.
- [ ] **All new/edited TypeScript files formatted: run `npm run format` before pushing.**
- [ ] All new TypeScript files pass `eslint` and `prettier --check`.
- [ ] New functionality is covered by unit tests.
- [ ] No `.env` files committed (only `.env.example` updates).
- [ ] No commented-out code left in the diff.
- [ ] Acceptance criteria in the issue are met.
- [ ] CHANGELOG or relevant docs updated if required.

> **Tip — one command to format everything:**
> ```bash
> npm run format          # prettier --write across all workspaces
> npm run format:check    # verify before push (same as CI)
> ```
> The pre-commit hook auto-formats staged `.ts`/`.tsx` files on every
> `git commit`, so you only need to run the above manually if you bypass
> the hook or edit files outside Git.

---

## Coding standards

### Python (`services/`, `packages/`)

| Tool | Purpose | Config |
|---|---|---|
| **ruff** | Linting (replaces flake8 + isort + pyupgrade + more) | `pyproject.toml [tool.ruff]` |
| **black** | Formatting | `pyproject.toml [tool.black]` |
| **pytest** | Unit and integration testing | `pyproject.toml [tool.pytest.ini_options]` |

Key rules:
- Target Python **3.12**; use modern syntax (`match`, `X | Y` unions, etc.).
- Line length: **100 characters**.
- Type hints are required on all public functions and methods.
- Domain entities in `packages/domain/` must have zero FastAPI/SQLAlchemy imports — pure Python.
- Follow the **offline-first, event-ledger** principle: never update a quantity directly; always produce a transaction event.

Run locally:

```bash
# Lint
ruff check services/ packages/domain/

# Format check
black --check services/ packages/domain/

# Auto-fix (lint + format)
ruff check --fix services/ packages/domain/
black services/ packages/domain/
```

### TypeScript (`apps/`)

| Tool | Purpose | Config |
|---|---|---|
| **ESLint** | Linting | `apps/*/.eslintrc.json` |
| **Prettier** | Formatting | `apps/*/.prettierrc` |
| **TypeScript** | Strict type checking | `apps/*/tsconfig.json` |

Key rules:
- `strict: true` in all `tsconfig.json` files.
- No `any` types without an explanatory comment.
- React components use functional style with hooks — no class components.
- Use `@inven-tory/shared-types` for types shared between desktop, web and mobile.

Run locally:

```bash
npm run lint --workspaces
npm run format:check --workspaces
```

### Git hooks

The repo ships with hooks in `.githooks/`:

| Hook | Trigger | What it does |
|---|---|---|
| `pre-commit` | `git commit` | Runs `prettier --write` on every staged `.ts`/`.tsx` file and re-stages it automatically. The commit always lands formatted. |
| `pre-push` | `git push` | Runs `ruff`, `black`, and `prettier --check` across all workspaces. Blocks the push if any check fails. |

Hooks are activated automatically when you run `npm install` at the repo root
(the `prepare` script runs `git config core.hooksPath .githooks`).

If you cloned before this was added, run once:

```bash
git config core.hooksPath .githooks
```

Or reinstall with:

```bash
npm install
```

---

## CI requirements

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every PR into `develop`:

| Job | What it checks |
|---|---|
| `lint-python` | `ruff check` + `black --check` on all Python |
| `lint-typescript` | ESLint + Prettier on all TS workspaces |
| `test-python` | `pytest` across `services/api/tests/` and `packages/domain/tests/` |
| `test-typescript` | `npm test` in each workspace |

**All four jobs must be green before merge.**

---

## Definition of Done

An issue is done when:

1. All acceptance criteria in the issue description are met.
2. CI is green on the PR branch.
3. At least one peer review approved with zero open comments.
4. Squash-merged into `develop`.
5. The related GitHub Issue is closed.
