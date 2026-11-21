# Meta-Repo Implementation Blueprint

> Core scaffolding specification for `repos.json`, `.gitignore`, Companion IaC layout, `Makefile`, `docker-compose.dev.yml`, and the bundled zero-dependency scripts and CI templates.

## Contents

1. [Root Repository Layout](#1-root-repository-layout)
2. [`.gitignore`](#2-gitignore)
3. [Declarative Manifest (`repos.json`)](#3-declarative-manifest-reposjson)
4. [Companion IaC / Deploy Repositories (Parent Grouping Folder Pattern)](#4-companion-iac--deploy-repositories-parent-grouping-folder-pattern)
5. [Bundled Zero-Dependency Scripts & CI Templates](#5-bundled-zero-dependency-scripts--ci-templates)
6. [`Makefile` Blueprint](#6-makefile-blueprint)
7. [Local Orchestrator (`docker-compose.dev.yml`)](#7-local-orchestrator-docker-composedevyml)

> [!NOTE]
> **Fictional organization used in examples**: examples below use **Acme** (`web-portal` `apps/web-portal` Next.js/frontend/checkout `:3000` host, `mobile-app` `apps/mobile` React Native/frontend/checkout, `checkout-api` `services/checkout` Node.js/backend/checkout `:4001` docker, `billing-api` `services/billing` Go/backend/billing `:4002` docker, `shared-libs` `libs/shared` Turborepo/library, `legacy-monolith` `legacy/monolith` PHP/legacy). Replace them with the user's repositories.

---

## 1. Root Repository Layout

```text
acme-workspace/
├── .ai/                        # Engineering rules, anti-patterns, roles, and workflows
├── .github/workflows/          # Meta-repo CI pipeline (copied from templates/meta-repo.yml)
├── .specify/                   # (Optional) Specification templates (e.g., Speckit)
├── docs/                       # Macro architecture docs, ADRs, and operational runbooks
├── specs/                      # Cross-repo feature technical specifications (versioned)
├── scripts/                    # Zero-dep Node.js >= 18 scripts (copied from templates/scripts/)
│   ├── bootstrap.mjs           # Cloning/updating with filters and dry-run
│   ├── run.mjs                 # Manifest-driven service runner (docker + host)
│   ├── install-cli.mjs         # Interactive global CLI installer (zsh/bash/fish)
│   └── check-manifest.mjs      # Manifest and .gitignore validator
├── .gitignore                  # Ignores cloned subproject folders
├── AGENTS.md                   # Global rules and workspace map for AI agents
├── CLAUDE.md                   # Claude Code entry point (imports AGENTS.md)
├── Makefile                    # Unified command interface
├── README.md                   # Human onboarding portal
├── acme.code-workspace         # Multi-root editor configuration
├── docker-compose.dev.yml      # Shared infrastructure and containerized services
└── repos.json                  # Declarative manifest: single source of truth
```

> [!NOTE]
> **Role of Entry and Documentation Folders**:
> * `docs/`: Durable organizational decisions (ADRs), architecture diagrams (C4 model), and operational guides.
> * `specs/`: Feature specifications; **versioned** and treated as the source of truth for requirements.
> * `AGENTS.md` / `CLAUDE.md` / `README.md` / `*.code-workspace`: See [entry-files.md](entry-files.md).

---

## 2. `.gitignore`

The meta-repo **never versions subproject code**. Every top-level directory prefix used in `repos.json` `path` entries must appear here as `/<prefix>/` (validated by `scripts/check-manifest.mjs`):

```gitignore
# === Subprojects cloned via manifest (each has its own Git repository) ===
# Keep in sync with "path" entries in repos.json — validated by `make check-manifest`.
/apps/
/services/
/libs/
/legacy/

# === Local generated artifacts (e.g., design extractions, AI scratchpads) ===
# Note: distinct from specs/, which is versioned and acts as the source of truth.
.specs/

# === Workspace ===
node_modules/
.DS_Store
*.log
.env
.env.*
!.env.example
```

---

## 3. Declarative Manifest (`repos.json`)

**Single source of truth**: `Makefile` derives `REPO_PATHS` from `repos.json`, `scripts/run.mjs` reads ports and execution modes from it, `scripts/check-manifest.mjs` validates `.gitignore` coverage against it, and every `docker` service name in `docker-compose.dev.yml` matches `name`.

**Fields**:
- **Required**: `name` (`^[a-z][a-z0-9-]*$`, unique), `path` (unique), `category` (`frontend`, `backend`, `library`, `iac`, `legacy`, etc.).
- **Optional**: `remote` (SSH/HTTPS URL, or `null` for local-only repositories — skipped safely by `bootstrap.mjs`), `product`, `stack`, `port` (required and unique whenever `run` is set), `run` (`"docker"` or `"host"`), `dev` (dev command for `"host"` services, defaults to `"pnpm dev"`), `branch` (defaults to remote default), `ref` (pinned tag or commit SHA), `companion` / `companionOf` (for sibling IaC/deploy pairs), and `checks` (`lint`, `typecheck`, `test` commands used by agents and `make check`).

```json
{
  "version": 1,
  "repos": [
    {
      "name": "web-portal",
      "path": "apps/web-portal",
      "remote": "git@github.com:acme/web-portal.git",
      "stack": "nextjs",
      "category": "frontend",
      "product": "checkout",
      "port": 3000,
      "run": "host",
      "dev": "pnpm dev",
      "checks": { "lint": "pnpm biome check .", "typecheck": "pnpm tsc --noEmit", "test": "pnpm test" }
    },
    {
      "name": "mobile-app",
      "path": "apps/mobile",
      "remote": "git@github.com:acme/mobile-app.git",
      "stack": "react-native",
      "category": "frontend",
      "product": "checkout"
    },
    {
      "name": "checkout-api",
      "path": "services/checkout",
      "remote": "git@github.com:acme/checkout-api.git",
      "stack": "nodejs",
      "category": "backend",
      "product": "checkout",
      "port": 4001,
      "run": "docker",
      "checks": { "lint": "pnpm biome check .", "typecheck": "pnpm tsc --noEmit", "test": "pnpm test" }
    },
    {
      "name": "billing-api",
      "path": "services/billing",
      "remote": "git@github.com:acme/billing-api.git",
      "stack": "go",
      "category": "backend",
      "product": "billing",
      "port": 4002,
      "run": "docker",
      "checks": { "lint": "go vet ./...", "test": "go test ./..." }
    },
    {
      "name": "shared-libs",
      "path": "libs/shared",
      "remote": "git@github.com:acme/shared-libs.git",
      "stack": "turborepo",
      "category": "library"
    },
    {
      "name": "legacy-monolith",
      "path": "legacy/monolith",
      "remote": "git@github.com:acme/legacy-monolith.git",
      "stack": "php",
      "category": "legacy",
      "branch": "master"
    }
  ]
}
```

> [!TIP]
> For editor autocomplete and inline validation, you can also create a `repos.schema.json` (JSON Schema) and reference it via `"$schema"` in `repos.json`. `scripts/check-manifest.mjs` remains the authoritative check in CI.

---

## 4. Companion IaC / Deploy Repositories (Parent Grouping Folder Pattern)

When application or service repositories have dedicated sibling repositories for Infrastructure-as-Code or GitOps deployment (`*-iac`, `*-deploy`, `*-infra` in Terraform, Helm, Kustomize, Pulumi, or CDK):

* **Never nest one Git repository inside another**: cloning `frontend-iac` inside the `frontend` Git working tree would pollute `frontend`'s `git status` and `.gitignore`.
* **Group pairs inside a neutral parent folder (pseudo-folder)**: place the code repository and its companion IaC/deploy repository side-by-side inside a plain parent directory (with no `.git` of its own):
  ```text
  apps/frontend/                      # Neutral parent folder (no .git)
  ├── frontend/                       # Git repo 1: application code (category: "frontend")
  └── frontend-iac/                   # Git repo 2: IaC / deploy manifests (category: "iac")
  ```
  *(Or at the top level as `frontend/frontend` and `frontend/frontend-iac`, with `/frontend/` in the root `.gitignore`.)*
* **Manifest pairing & selective cloning**:
  * Assign `"category": "iac"` (or `"deploy"` / `"infra"`), the same `"product"` as the sibling service, and optional `"companion": "frontend-iac"` / `"companionOf": "frontend"` fields in `repos.json`.
  * `make bootstrap-product PRODUCT=checkout` clones both the application and its IaC sibling together; add a `bootstrap-iac` target (`@node scripts/bootstrap.mjs --category=iac $(ARGS)`) to clone only IaC repositories across the organization.
* **IDE pseudo-folder view (`*.code-workspace`)**: point a single `folders` entry to the neutral parent directory (`{ "name": "Frontend (Next.js + IaC)", "path": "apps/frontend" }`) and set `"git.autoRepositoryDetection": "subFolders"` in `settings` so the editor displays one tree node while tracking both Git repositories independently.

---

## 5. Bundled Zero-Dependency Scripts & CI Templates

All four Node.js (`>= 18`) scripts and the GitHub Actions workflow are shipped ready to copy inside `<skill-dir>/templates/`. They are **100% organization-agnostic** (reading `repos.json`, `.gitignore`, and the workspace folder name dynamically) and require **zero manual edits**.

Copy them cross-platform in one command (never transcribe from memory):

```bash
node "<skill-dir>/scripts/copy_templates.js" "<workspace>"
```

**`copy_templates.js` flags**:
- `--force`, `-f`: overwrite existing script and workflow files (by default, existing files are skipped to protect customized scripts in Evolution Mode).
- `--no-ci`: skip copying `.github/workflows/meta-repo.yml`.
- `--dry-run`: preview copy/skip actions without writing files.
- `--help`, `-h`: display usage and options.

| Template Source (inside `<skill-dir>`) | Target Destination | Behavior & Flags |
| :--- | :--- | :--- |
| `templates/scripts/bootstrap.mjs` | `scripts/bootstrap.mjs` | Clones missing repos (`--branch`, optional `ref` checkout) and updates existing `<path>/.git` clones via `git fetch --all --prune`. Skips `remote: null`. Flags: `--https`, `--dry-run`, `--all`, `--legacy`, `--category=<cat>`, `--product=<prod>`. |
| `templates/scripts/run.mjs` | `scripts/run.mjs` | Lists runnable services (`run` field) when called with no args; starts `"docker"` services via `docker compose up -d --wait` (honors `BUILD=1`) and `"host"` services via `repo.dev` (`pnpm dev` fallback); cleans up on `SIGINT`/`SIGTERM`. |
| `templates/scripts/install-cli.mjs` | `scripts/install-cli.mjs` | Interactive global CLI installer (`zsh`, `bash`, `fish`). Registers `<alias> <command>` running `make --no-print-directory -C "<root>"` from any subdirectory without modifying system `make`. Supports `--name=<alias>` and `--uninstall`. Records the workspace's absolute path (re-run `make setup-cli` if moved). |
| `templates/scripts/check-manifest.mjs` | `scripts/check-manifest.mjs` | Validates required fields (`name`, `path`, `category`), lowercase hyphenated `name`, clean relative forward-slash `path`, valid `run` + `port` pairing, duplicate `name`/`path`/`port`, nested-repo path prevention, `companion`/`companionOf` references, and top-level `.gitignore` coverage (`/<top>/`). |
| `templates/meta-repo.yml` | `.github/workflows/meta-repo.yml` | Runs `node scripts/check-manifest.mjs` and `node scripts/bootstrap.mjs --all --dry-run` on `push` and `pull_request` (Node 20). |

---

## 6. `Makefile` Blueprint

The repository list is **derived from `repos.json`**; no paths are hardcoded. Only cloned repositories (containing `.git`) are processed.

> [!NOTE]
> Makefile recipes require literal **TAB** (`\t`) indentation (not spaces). Verify tabs before finishing Phase 6.

```makefile
# === Acme Workspace Makefile ===
SHELL         := /bin/bash
.DEFAULT_GOAL := help
COMPOSE       := docker compose -f docker-compose.dev.yml

# Single source of truth: paths derived from repos.json (optional filter CATEGORY=<name>)
REPO_PATHS = $(shell node -p "require('./repos.json').repos.filter(r => !'$(CATEGORY)' || r.category === '$(CATEGORY)').map(r => r.path).join(' ')")

# Iterates only over cloned repositories. Usage: @$(FOR_EACH) <command using $$p>; done
FOR_EACH = for p in $(REPO_PATHS); do [ -d "$$p/.git" ] || continue;

.PHONY: help bootstrap bootstrap-frontend bootstrap-product bootstrap-legacy bootstrap-all \
        bootstrap-https install setup-cli remove-cli check-manifest run dev-infra dev-logs \
        dev-down dev-down-v pull status branches checkout sync-main exec

help: ## List all available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Setup ─────────────────────────────────────────────────
bootstrap: ## Clone/update active repositories (excludes legacy). Extra flags: ARGS="--dry-run"
	@node scripts/bootstrap.mjs $(ARGS)

bootstrap-frontend: ## Clone only frontend repositories
	@node scripts/bootstrap.mjs --category=frontend $(ARGS)

bootstrap-product: ## Clone a single product: make bootstrap-product PRODUCT=checkout
	@test -n "$(PRODUCT)" || { echo "Specify PRODUCT=<name>"; exit 1; }
	@node scripts/bootstrap.mjs --product=$(PRODUCT) $(ARGS)

bootstrap-legacy: ## Clone only legacy repositories
	@node scripts/bootstrap.mjs --legacy $(ARGS)

bootstrap-all: ## Clone the entire ecosystem (including legacy)
	@node scripts/bootstrap.mjs --all $(ARGS)

bootstrap-https: ## Same as bootstrap, using HTTPS
	@node scripts/bootstrap.mjs --https $(ARGS)

install: ## Install dependencies in each cloned repository (auto-detected by lockfile)
	@$(FOR_EACH) \
		if [ -f "$$p/pnpm-lock.yaml" ]; then echo "── $$p (pnpm)"; (cd "$$p" && pnpm install --frozen-lockfile) || echo "✗ $$p"; \
		elif [ -f "$$p/go.mod" ]; then echo "── $$p (go)"; (cd "$$p" && go mod download) || echo "✗ $$p"; fi; \
	done

setup-cli: ## Install the global workspace CLI into your shell (zsh/bash/fish)
	@node scripts/install-cli.mjs

remove-cli: ## Remove the global workspace CLI from your shell
	@node scripts/install-cli.mjs --uninstall

check-manifest: ## Validate repos.json and .gitignore coverage
	@node scripts/check-manifest.mjs

# ── Services ──────────────────────────────────────────────
run: ## List services or start selected ones: make run S="checkout-api web-portal"
	@node scripts/run.mjs $(S)

dev-infra: ## Start only infrastructure (postgres, redis) in the background
	@$(COMPOSE) up -d --wait postgres redis

dev-logs: ## Follow logs across all containers
	@$(COMPOSE) logs -f

dev-down: ## Stop all containers (preserves volumes)
	@$(COMPOSE) --profile full down

dev-down-v: ## Stop all containers and remove volumes (clean slate)
	@$(COMPOSE) --profile full down -v

# ── Batch Git ─────────────────────────────────────────────
pull: ## git pull --rebase --autostash across all repositories
	@$(FOR_EACH) echo "── $$p"; git -C "$$p" pull --rebase --autostash --quiet || echo "✗ $$p"; done

status: ## Short git status across all repositories
	@$(FOR_EACH) \
		changes=$$(git -C "$$p" status --short); branch=$$(git -C "$$p" branch --show-current); \
		if [ -n "$$changes" ]; then echo "── $$p ($$branch)"; echo "$$changes"; else echo "── $$p ($$branch) ✓"; fi; \
	done

branches: ## Show active branch for each repository
	@printf "%-30s %s\n" "REPOSITORY" "BRANCH"
	@$(FOR_EACH) printf "%-30s %s\n" "$$p" "$$(git -C "$$p" branch --show-current)"; done

checkout: ## Switch branch where it exists: make checkout BRANCH=feat/SPEC-042
	@test -n "$(BRANCH)" || { echo "Specify BRANCH=<name>"; exit 1; }
	@$(FOR_EACH) \
		if git -C "$$p" rev-parse --verify --quiet "$(BRANCH)" >/dev/null || \
		   git -C "$$p" rev-parse --verify --quiet "origin/$(BRANCH)" >/dev/null; then \
			git -C "$$p" checkout --quiet "$(BRANCH)" && echo "✓ $$p"; \
		else echo "· $$p (branch not found)"; fi; \
	done

sync-main: ## Update each repository's default branch without leaving the current branch
	@$(FOR_EACH) \
		def=$$(git -C "$$p" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null); \
		def=$${def#origin/}; def=$${def:-main}; \
		if [ "$$(git -C "$$p" branch --show-current)" = "$$def" ]; then \
			git -C "$$p" pull --ff-only --quiet; \
		else \
			git -C "$$p" fetch --quiet origin "$$def:$$def"; \
		fi && echo "✓ $$p ($$def)" || echo "✗ $$p ($$def)"; \
	done

exec: ## Run a command in each repository: make exec CMD="git log -1 --oneline" [CATEGORY=backend]
	@test -n '$(CMD)' || { echo 'Specify CMD="<command>"'; exit 1; }
	@$(FOR_EACH) echo "── $$p"; (cd "$$p" && $(CMD)) || echo "✗ $$p"; done
```

**Tailoring rules**:
- Extend `install` for every package manager present in the workspace (e.g., `package-lock.json` → `npm ci`, `yarn.lock` → `yarn install --frozen-lockfile`, `uv.lock` → `uv sync`, `pyproject.toml` → `poetry install`/`pip install -e .`, `Cargo.toml` → `cargo fetch`, `composer.json` → `composer install`).
- Update `dev-infra` to list the actual backing infrastructure services defined in `docker-compose.dev.yml`.
- Add `bootstrap-iac` (`@node scripts/bootstrap.mjs --category=iac $(ARGS)`) and include it in `.PHONY` when companion IaC repositories exist.
- For optional advanced targets (`check`, `snapshot`, `db-*`, `env-*`, `link-local`, `doctor`, `ports`, `clean`, `purge`, `setup-ide`), see [reference.md](reference.md).

> [!TIP]
> If `origin/HEAD` is missing in an older clone, set it with `git remote set-head origin --auto`.

---

## 7. Local Orchestrator (`docker-compose.dev.yml`)

Infrastructure containers define `healthcheck`; application services where `run: "docker"` use the exact same service name as `name` in `repos.json`, matching ports, optional `.env` loading (`required: false`), bind mounts, and `profiles`:

```yaml
# Convention: each service name matches its "name" in repos.json
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: dev_user
      POSTGRES_PASSWORD: dev_password # local development credential only
    ports: ["5432:5432"]
    volumes: ["postgres_data:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev_user"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 10

  checkout-api:
    build:
      context: ./services/checkout
      dockerfile: Dockerfile.dev
    env_file:
      - path: ./services/checkout/.env
        required: false
    ports: ["4001:4001"]
    volumes:
      - ./services/checkout:/app # hot-reload via bind mount
      - /app/node_modules        # preserve container node_modules
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    profiles: ["checkout", "full"]

  billing-api:
    build:
      context: ./services/billing
      dockerfile: Dockerfile.dev
    env_file:
      - path: ./services/billing/.env
        required: false
    ports: ["4002:4002"]
    volumes: ["./services/billing:/app"]
    depends_on:
      postgres: { condition: service_healthy }
    profiles: ["billing", "full"]

volumes:
  postgres_data:
```

> [!NOTE]
> Services with `profiles` only start when their profile is activated **or** when explicitly named on the command line (as `make run S="..."` does). `env_file` with `required: false` requires Docker Compose 2.24+.
