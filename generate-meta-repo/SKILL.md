---
name: generate-meta-repo
description: 'Generates, updates, and maintains a Manifest-based Multi-root Workspace (Meta-Repo) from user-provided repositories, files, architectural guidelines, or organizational context. Produces and synchronizes the declarative manifest (repos.json), zero-dependency Node.js orchestration scripts (bootstrap, service runner, CLI installer, manifest validator), Makefile, Docker Compose dev stack, multi-root IDE workspace (*.code-workspace), and layered AI governance files (AGENTS.md, CLAUDE.md, README.md). Use when the user asks to create, scaffold, update, evolve, or add/remove repositories and services in a meta-repo or multi-root workspace.'
---

# Generate Meta-Repo (Manifest-Based Multi-Root Workspace)

Scaffolds a production-ready **Meta-Repo** from scratch or **evolves an existing Meta-Repo** without `git submodule` fragility. Requires Node.js >= 18 for the generated `.mjs` scripts (zero external dependencies).

## Progressive Disclosure — Reference Map

Load only what the current execution mode and phase require:

| Asset | When to use |
| :--- | :--- |
| `scripts/copy_templates.js` | **Greenfield (Phases 3–4)**: run once to copy `templates/scripts/*.mjs` and `templates/meta-repo.yml` verbatim (skips existing files by default; zero edits needed). |
| [blueprint.md](blueprint.md) | **Greenfield (Phases 2–4)**: mandatory before writing `repos.json`, `.gitignore`, `Makefile`, or `docker-compose.dev.yml`. **Evolution**: read only when adding Companion IaC, new Makefile targets/stacks, or Docker services. |
| [entry-files.md](entry-files.md) | **Greenfield (Phase 5)**: mandatory before writing `README.md`, `AGENTS.md`, `CLAUDE.md`, or `*.code-workspace`. **Evolution**: read only when creating missing entry files or updating IDE guidelines. |
| [reference.md](reference.md) | **On-demand only**: adoption criteria vs. monorepo/alternatives, optional Advanced Makefile commands, Expand/Contract patterns, or Windows/WSL2 setup. |

## Workflow

Copy this checklist and track your progress:

```
Meta-Repo Progress:
- [ ] Phase 1: Detect mode (greenfield vs. evolution), inspect clones/context, and map topology
- [ ] Phase 2: Generate or update single source of truth (repos.json & .gitignore)
- [ ] Phase 3: Copy bundled scripts/CI and generate or update Makefile
- [ ] Phase 4: Configure or sync Docker Compose dev stack
- [ ] Phase 5: Generate or sync entry files, AI governance, and *.code-workspace
- [ ] Phase 6: Validate, bootstrap/migrate repos, and verify zero drift
```

### Phase 1: Detect mode, ingest context, and map topology

1. **Detect mode**:
   - **Greenfield** (no `repos.json`): execute Phases 2–6. Read [blueprint.md](blueprint.md) for Phases 2–4 and [entry-files.md](entry-files.md) for Phase 5.
   - **Evolution** (`repos.json` exists): read the workspace's existing files (`repos.json`, `.gitignore`, `Makefile`, `docker-compose.dev.yml`, `*.code-workspace`, `AGENTS.md`, `CLAUDE.md`, `README.md`) and apply **surgical updates** without overwriting custom rules, unrelated targets, or existing `scripts/*.mjs`.
2. **Inspect local clones**: for repos already on disk, inspect `git -C <path> remote get-url origin`, default branch, lockfiles, scripts, `Dockerfile`, and `.env.example` to auto-detect `remote`, `stack`, `port`, `dev`, and `checks`.
3. **Evaluate fit (only if asked or pure JS/TS monorepo)**: check [reference.md](reference.md); otherwise proceed.
4. **Map topology**: assign `name` (`^[a-z][a-z0-9-]*$`), `path`, `remote` (or `null` if local-only), `stack`, `category` (`frontend`, `backend`, `library`, `iac`, `legacy`), optional `product`, `port`/`run` (`"docker"`/`"host"`)/`dev`, `branch`/`ref`, and `checks`. For **Companion IaC** (`*-iac`/`*-deploy`), never nest Git repos — pair siblings inside a neutral parent folder (see [blueprint.md](blueprint.md)).
5. **Determine workspace slug & CLI alias**: infer or ask (e.g., `acme-workspace` / `acme`).

### Phase 2: Single source of truth (`repos.json` & `.gitignore`)

Follow [blueprint.md](blueprint.md) (Sections 1–4): create/init workspace root (`git init` if needed), write/update `repos.json` (unique `name`, `path`, `port`; every `run` defines `port`), and ensure `.gitignore` ignores every top-level `path` prefix (`/<top>/`), `.specs/`, `node_modules/`, `.DS_Store`, `*.log`, and `.env*` (`!.env.example`).

### Phase 3: Copy bundled scripts/CI and generate/update `Makefile`

Follow [blueprint.md](blueprint.md) (Sections 5–6):

1. **Copy bundled scripts & CI** (resolve `<skill-dir>` as described below):
   ```bash
   node "<skill-dir>/scripts/copy_templates.js" "<workspace>"
   ```
   Skips existing files by default (safe in Evolution Mode; pass `--force` only if explicitly asked to upgrade scripts). Never transcribe the `.mjs` scripts from memory.
2. **`Makefile`**: use literal **TAB** (`\t`) indentation, derive `REPO_PATHS` from `repos.json`, include all Essential targets (plus `bootstrap-iac` when Companion IaC repos exist), tailor `install` to workspace lockfiles and `dev-infra` to actual backing containers. Consult [reference.md](reference.md) only if adding optional Advanced targets.

### Phase 4: Configure or sync Docker Compose dev stack

Follow [blueprint.md](blueprint.md) (Section 7): configure backing infra with `healthcheck`, and sync `run: "docker"` services so every service name matches `name` in `repos.json`, with matching ports, `env_file` (`required: false`), bind mounts, and `profiles` (`["<product>", "full"]`).

### Phase 5: Entry files, AI governance, and `*.code-workspace`

Follow [entry-files.md](entry-files.md) and scaffold `docs/`, `specs/`, and `.ai/` (plus `.specify/` if requested):

1. **`README.md`**: 5-step quickstart (`make setup-cli`, open `<workspace>.code-workspace` — never `code .`), directory list, local dev commands, and ports table synced with `repos.json`.
2. **`AGENTS.md`**: layered hierarchy (closest wins), Workspace Map synced with `repos.json`, Scope Boundaries (no `../../` imports, Expand/Contract), File Size Limits, Pre-Commit Verification mirroring `checks`, and subrepo Git rules. Create/update subrepo `AGENTS.md` when requested.
3. **`CLAUDE.md`**: import `@AGENTS.md` at the top (never duplicate rules), slash commands, `.ai/` pointers, execution commands, and <10-line stack snapshot.
4. **`<workspace>.code-workspace`**: apply all 7 Workspace Guidelines (`docs`/`specs`/`.ai` first, active repos only, parent folder + `"git.autoRepositoryDetection": "subFolders"` for Companion IaC, watcher/search excludes without excluding `docs/`/`specs/` or `**/bin`, and adapt `typescript.tsdk`/formatters/extensions strictly to actual stacks).

### Phase 6: Validate, populate repos, and verify zero drift

1. Run `node scripts/check-manifest.mjs && node scripts/bootstrap.mjs --all --dry-run`, verify literal TABs in `Makefile`, and confirm zero drift across `repos.json`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `docker-compose.dev.yml`, and `*.code-workspace`. Fix any failures before finishing.
2. Move (`mv`) approved local clones into `<path>` (preserving `.env`, `node_modules`, uncommitted work) or run `make bootstrap` (`make install` if requested).
3. On initial setup (or if moved), run `node scripts/install-cli.mjs --name=<alias>` when approved or instruct the user to run `make setup-cli`, and remind them to open `<workspace>.code-workspace` (never `code .`).

## Cross-File Invariants & Guardrails

- **Single source of truth**: `repos.json` drives `Makefile` `REPO_PATHS`, `docker-compose.dev.yml` service names & ports, `README.md` ports table, `AGENTS.md` Workspace Map, and `*.code-workspace` active `folders`.
- **Subproject autonomy**: never use `git submodule`, never nest Git repos, never commit subproject code into the meta-repo, and forbid cross-repo relative imports (`../../`).
- **Zero script dependencies**: `scripts/*.mjs` use Node.js built-ins only.

## Resolving `<skill-dir>`

Substitute `<skill-dir>` with the directory where this skill is installed, keeping double quotes around the script path (Windows/macOS/Linux):

- **Standard skills (`SKILL.md`)**: the parent directory of this `SKILL.md` file.
- **Cursor rule (`.cursor/rules/generate-meta-repo.mdc`)**: the sibling `.cursor/skills/generate-meta-repo` directory.
