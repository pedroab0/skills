---
name: generate-meta-repo
description: 'Generates, updates, and maintains a Manifest-based Multi-root Workspace (Meta-Repo) from user-provided repositories, files, architectural guidelines, or organizational context. Produces and synchronizes the declarative manifest (repos.json), zero-dependency Node.js orchestration scripts (bootstrap, service runner, CLI installer, manifest validator), Makefile, Docker Compose dev stack, multi-root IDE workspace (*.code-workspace), and layered AI governance files (AGENTS.md, CLAUDE.md, README.md). Use when the user asks to create, scaffold, update, evolve, or add/remove repositories and services in a meta-repo or multi-root workspace.'
---

# Generate Meta-Repo (Manifest-Based Multi-Root Workspace)

Scaffolds a production-ready **Meta-Repo** (governance shell, local environment orchestrator, and specification hub) from scratch or **evolves an existing Meta-Repo** when new repositories, stacks, infrastructure, or governance rules are added or modified.

> **MANDATORY PREREQUISITE**: Before creating or updating any file, you **MUST read [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md)**. This `SKILL.md` defines the execution workflow and guardrails; all canonical script implementations, `Makefile` targets, architectural patterns, and entry file templates live in [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md). Never improvise scripts or templates from memory. Requires Node.js >= 18 for the generated `.mjs` scripts (zero external dependencies).

## Workflow

Copy this checklist and track your progress:

```
Meta-Repo Progress:
- [ ] Phase 1: Read meta-repo-architecture-guide.md, ingest context, detect mode (new vs. update), and map topology
- [ ] Phase 2: Generate or update single source of truth (repos.json & .gitignore)
- [ ] Phase 3: Generate or update zero-dependency scripts, global CLI, and Makefile from the guide
- [ ] Phase 4: Configure or sync Docker Compose dev stack and CI workflow
- [ ] Phase 5: Generate or sync entry files, AI governance, and *.code-workspace
- [ ] Phase 6: Validate, bootstrap/migrate repos, and verify zero drift
```

### Phase 1: Read `meta-repo-architecture-guide.md`, ingest context, detect mode, and map topology

1. **Read the guide first**: read [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md) (Sections 1–8) to load all architectural patterns, exact script source code, and templates into context.
2. **Detect execution mode**:
   - **New Meta-Repo (From Scratch)**: target workspace has no `repos.json` yet; execute full scaffolding across Phases 2–6.
   - **Evolution / Update Mode (Existing Meta-Repo)**: `repos.json` already exists; read current `repos.json`, `Makefile`, `docker-compose.dev.yml`, `*.code-workspace`, `AGENTS.md`, `CLAUDE.md`, and `README.md`, and apply **surgical updates** to keep the ecosystem 100% synchronized without overwriting custom user rules or unrelated targets.
3. **Extract context & inspect existing local clones**:
   - Analyze all repository URLs, local paths, config files (`package.json`, `go.mod`, `docker-compose*`, `Makefile`, `AGENTS.md`), and guidelines provided by the user.
   - If repositories are **already cloned on the user's machine**, inspect them directly (`git -C <path> remote get-url origin`, default branch, lockfiles, `package.json` scripts, `Dockerfile`, `.env.example`) to auto-detect `remote`, `stack`, `port`, `dev`, and `checks`.
4. **Evaluate fit (Sections 2 & 8.2)**: verify against the Decision Criteria in [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md). Note pure monorepo (`pnpm` + Turborepo/Nx) or alternative tools (`git submodule`, Google `repo`, `meta`, `mani`, `gita`) when applicable, or proceed directly when requested.
5. **Map repositories (Sections 3 & 4, including Section 4.6)**: for each new or modified repository, determine:
   - `name` (`^[a-z][a-z0-9-]*$`), `path` (`apps/*`, `services/*`, `libs/*`, `legacy/*`), and `remote` (SSH/HTTPS URL, or `null` if local-only).
   - **Companion IaC / Deploy repositories (Section 4.6)**: when repositories have dedicated sibling IaC/deploy/infra repos (`*-iac`, `*-deploy`, `*-infra`), never nest one Git repo inside another; group each pair side-by-side inside a neutral parent folder (e.g., `apps/frontend/frontend` + `apps/frontend/frontend-iac`) with `"category": "iac"`, matching `"product"`, and `"companion"` / `"companionOf"` fields.
   - `stack`, `category` (`frontend`, `backend`, `library`, `iac`, `legacy`), and optional `product` domain.
   - Runnable metadata: `port`, `run` (`"docker"` for backend/infra or `"host"` for frontends/mobile), and `dev` command (for `"host"`).
   - Optional `branch` (default `main`), `ref` (pinned tag/SHA, Section 4.5), and `checks` (`lint`, `typecheck`, `test`).
6. **Determine workspace slug & CLI alias**: infer or ask for the workspace name (`acme-workspace`) and organization CLI alias (`acme`).

### Phase 2: Generate or update single source of truth (`repos.json` & `.gitignore`)

Follow **Section 4.4** and **Section 6 (Steps 1, 2, and 3)** of [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md):

1. **Workspace root**: create the target directory if needed and run `git init` if it is not already a Git repository.
2. **`repos.json`**: add, update, or recategorize repositories (e.g., moving deprecated services to `category: "legacy"`). Ensure unique `name`, `path`, and `port` values, and that every entry with `run` defines `port` (optionally add `repos.schema.json`).
3. **`.gitignore`**: ensure every top-level directory prefix in `repos.json` `path` entries (`/apps/`, `/services/`, `/libs/`, `/legacy/`, etc.) is ignored, plus `.specs/` (local AI scratchpads, distinct from versioned `specs/`), `node_modules/`, `.DS_Store`, `*.log`, and `.env` / `.env.*` (`!.env.example`).

### Phase 3: Generate or update zero-dependency scripts, global CLI, and `Makefile`

Use the canonical implementations in **Section 5** and **Section 6 (Steps 4, 5, 6, and 9)** of [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md):

1. **`scripts/bootstrap.mjs` & `scripts/run.mjs`**: copy from Steps 4 and 5 of the guide (`bootstrap.mjs` supports `--https`, `--dry-run`, `--all`, `--legacy`, `--category=`, `--product=`, skips `remote: null`, and runs `git fetch --all --prune` when `<path>/.git` already exists; `run.mjs` starts `"docker"` and `"host"` services with `BUILD=1` and `SIGINT`/`SIGTERM` cleanup).
2. **`scripts/install-cli.mjs` (Step 6)**: interactive global CLI installer (`zsh`, `bash`, `fish`) registering `<cli> <command>` (running `make --no-print-directory -C "<root>"` from any subdirectory without modifying system `make`), supporting `--name=<alias>` and `--uninstall`. Include Windows WSL2/PowerShell notes from Section 8.1 when relevant.
3. **`scripts/check-manifest.mjs` (Step 9)**: validates required fields, naming format, duplicate `name`/`path`/`port`, `run` + `port` pairing, and top-level `.gitignore` coverage.
4. **`Makefile` (Step 5)**: use literal **TAB** indentation. Derive `REPO_PATHS` from `repos.json` and include all Essential Commands from Section 5.1 (**Setup**: `help`, `bootstrap*`, `install`, `setup-cli`, `remove-cli`, `check-manifest`; **Services**: `run`, `dev-infra`, `dev-logs`, `dev-down`, `dev-down-v`; **Batch Git**: `pull`, `status`, `branches`, `checkout`, `sync-main`, `exec`), plus `bootstrap-iac` (`--category=iac`) when companion IaC repos exist (Section 4.6) and applicable Advanced Commands from Section 5.2 (`check`, `snapshot`, `db-*`, `env-*`, `link-local`, `doctor`, `ports`, `clean`, `purge`, `setup-ide`). When evolving an existing meta-repo, update `install` or `dev-infra` if a newly added repository introduces a new package manager/toolchain or infrastructure container.

### Phase 4: Configure or sync Docker Compose dev stack and CI workflow

Follow **Section 6 (Steps 7 and 9)** of [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md):

1. **`docker-compose.dev.yml`**: configure backing infra (Postgres, Redis, etc.) with `healthcheck`. Add, update, or remove services where `run: "docker"` so every service name matches its `name` in `repos.json`, with matching ports, `env_file` (`required: false`), bind mounts, and `profiles` (`["<product>", "full"]`).
2. **`.github/workflows/meta-repo.yml`**: run `node scripts/check-manifest.mjs` and `node scripts/bootstrap.mjs --all --dry-run` on push and pull_request.

### Phase 5: Generate or sync entry files, AI governance, and `*.code-workspace`

Follow **Section 7 (7.1–7.4)** of [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md) and scaffold `docs/`, `specs/`, and `.ai/` (and `.specify/` if requested):

1. **`README.md` (Section 7.1)**: 5-step quickstart (`make setup-cli` and opening `<workspace>.code-workspace`, never `code .`), directory structure, local dev commands, services/ports table synced with `repos.json`, and daily commands.
2. **`AGENTS.md` (Section 7.2)**: layered hierarchy (closest `AGENTS.md` wins). Keep the Workspace Map table synced with `repos.json`; enforce Scope Boundaries (no cross-repo relative imports `../../`, typed contracts/versioned packages per Section 4.2, Expand/Contract per Section 4.1), Language, Architecture, LOC File Size Limits table, DRY, Separation of Concerns, Mandatory Pre-Commit Verification mirroring `checks`, and Git rules (commit at subrepo root, branch naming `feat/SPEC-042-...`). Generate or update subrepo `AGENTS.md` files when requested.
3. **`CLAUDE.md` (Section 7.3)**: import `@AGENTS.md` at the top (never duplicate rules), list slash commands (`/implement`, `/fix`, `/test`, `/refactor`, `/speckit.*`), `.ai/` governance pointers (`anti-patterns.md`, `session-conventions.md`, `roles/`), execution commands, and keep the <10-line stack snapshot updated.
4. **`<workspace>.code-workspace` (Section 7.4)**: follow all 7 Workspace Guidelines and the JSONC template:
   - Keep `docs`, `specs`, and `.ai` folders at the top, and sync `folders` with every active repository in `repos.json` labeled `"<Name> (<Stack>)"` (when companion IaC/deploy pairs are grouped under a neutral parent folder per **Section 4.6**, point `folders` to the parent directory and enable `"git.autoRepositoryDetection": "subFolders"` in `settings`; move `legacy` repos to `<workspace>-legacy.code-workspace`).
   - Configure `files.watcherExclude`, `search.exclude` (never excluding `docs/` or `specs/`), `files.exclude` (never excluding `**/bin`), `typescript.tsserver.maxTsServerMemory: 4096`, `typescript.tsdk`, `"non-relative"` imports, per-language formatters, and recommended extensions for all active stacks.

### Phase 6: Validate, bootstrap/migrate repos, and verify zero drift

1. **Validate manifest and dry-run**: run `node scripts/check-manifest.mjs && node scripts/bootstrap.mjs --all --dry-run`, verify `Makefile` recipes use literal TAB characters (`\t`), and confirm `README.md`, `AGENTS.md`, `docker-compose.dev.yml`, and `<workspace>.code-workspace` match `repos.json`. Fix any errors until validation passes.
2. **Populate repositories**: move (`mv`) approved existing local clones into `<path>` (preserving `.env`, `node_modules`, and uncommitted changes), or run `make bootstrap` (and `make install` if requested) to clone newly added repositories from their remotes while safely updating existing `<path>/.git` clones via `git fetch --all --prune`.
3. **Install global CLI (`make setup-cli`)**: on initial setup (or if the workspace moved), run `node scripts/install-cli.mjs --name=<alias>` when approved or instruct the user to run `make setup-cli`, and remind them to open `<workspace>.code-workspace` (never `code .`).

## Architectural guardrails

- **Single source of truth (Section 4.4)**: `repos.json` drives all paths, ports, categories, and service names across all workspace files.
- **Subproject autonomy (Section 3.1)**: never use `git submodule`, never commit subproject code into the meta-repo, and forbid cross-repo relative imports (`../../`).
- **Zero script dependencies**: `scripts/*.mjs` must use Node.js built-ins only (`node:fs`, `node:path`, `node:child_process`, `node:os`, `node:readline/promises`, `node:url`).
