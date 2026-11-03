---
name: generate-meta-repo
description: 'Generates, updates, and maintains a Manifest-based Multi-root Workspace (Meta-Repo) from user-provided repositories, files, architectural guidelines, or organizational context. Produces and synchronizes the declarative manifest (repos.json), zero-dependency Node.js orchestration scripts (bootstrap, service runner, CLI installer, manifest validator), Makefile, Docker Compose dev stack, multi-root IDE workspace (*.code-workspace), and layered AI governance files (AGENTS.md, CLAUDE.md, README.md). Use when the user asks to create, scaffold, update, evolve, or add/remove repositories and services in a meta-repo or multi-root workspace.'
---

# Generate Meta-Repo (Manifest-Based Multi-Root Workspace)

Scaffolds a production-ready **Meta-Repo** from scratch or **evolves an existing Meta-Repo** when repositories, stacks, infrastructure, or governance rules are added or modified.

> **MANDATORY PREREQUISITE**: Before creating or updating any file, you **MUST read [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md)**. This `SKILL.md` defines only the execution workflow; all canonical script implementations, `Makefile` targets, architectural patterns, and entry file templates live in [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md). Never improvise scripts or templates from memory.

## Workflow

Copy this checklist and track your progress:

```
Meta-Repo Progress:
- [ ] Phase 1: Read meta-repo-architecture-guide.md, ingest context, and map topology
- [ ] Phase 2: Generate or update single source of truth (repos.json & .gitignore)
- [ ] Phase 3: Generate or update scripts, global CLI, and Makefile from the guide
- [ ] Phase 4: Configure or sync Docker Compose dev stack and CI workflow
- [ ] Phase 5: Generate or sync entry files (README.md, AGENTS.md, CLAUDE.md, *.code-workspace)
- [ ] Phase 6: Validate, bootstrap/migrate repos, and install global CLI
```

### Phase 1: Read `meta-repo-architecture-guide.md`, ingest context, and map topology

1. **Read the guide first**: read [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md) (Sections 1–8) to load all architectural patterns, exact script source code, and templates into context.
2. **Detect execution mode**:
   - **New Meta-Repo (From Scratch)**: no `repos.json` exists yet; scaffold the full structure across Phases 2–6.
   - **Evolution Mode (Existing Meta-Repo)**: `repos.json` already exists; inspect existing workspace files and apply surgical updates so all files remain 100% synced with `repos.json` without overwriting custom user rules.
3. **Inspect user context & local clones**:
   - Parse all repository URLs, local paths, config files (`package.json`, `go.mod`, `docker-compose*`, `Makefile`, `AGENTS.md`), and guidelines provided by the user.
   - If repositories are **already cloned on the user's machine**, inspect them (`git -C <path> remote get-url origin`, default branch, lockfiles, `package.json`, `Dockerfile`, `.env.example`) to auto-detect `remote`, `stack`, `port`, `dev`, and `checks`.
4. **Evaluate fit & map topology**: check **Sections 2, 3, 4, and 8.2** of [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md). Map each repository's `name`, `path`, `remote`, `stack`, `category`, `product`, `port`, `run` (`"docker"` or `"host"`), `dev`, `branch`, `ref`, and `checks`. Confirm the workspace slug (e.g., `acme-workspace`) and CLI alias (e.g., `acme`) if ambiguous.

### Phase 2: Generate or update single source of truth (`repos.json` & `.gitignore`)

Apply **Section 4.4** and **Section 6 (Steps 1, 2, and 3)** of [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md):

1. Initialize the workspace root directory (`git init` if not yet a Git repo).
2. Create or update `repos.json` following the Step 3 schema and constraints.
3. Create or update `.gitignore` following the Step 2 template, ensuring every top-level directory prefix from `repos.json` `path` entries is ignored alongside `.specs/`.

### Phase 3: Generate or update scripts, global CLI, and `Makefile`

Use the canonical implementations in **Section 5** and **Section 6 (Steps 4, 5, 6, and 9)** of [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md):

1. Write `scripts/bootstrap.mjs` (Step 4), `scripts/run.mjs` (Step 5), `scripts/install-cli.mjs` (Step 6), and `scripts/check-manifest.mjs` (Step 9) directly from the guide's reference code.
2. Write or update `Makefile` (Step 5) using literal **TAB** indentation, including all Essential Commands (**Section 5.1**: Setup, Service Execution, Batch Git) plus any Advanced Commands (**Section 5.2**) and Windows notes (**Section 8.1**) that match the user's stacks and requirements.

### Phase 4: Configure or sync Docker Compose dev stack and CI workflow

Apply **Section 6 (Steps 7 and 9)** of [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md):

1. Create or sync `docker-compose.dev.yml` (Step 7) with healthchecked backing infrastructure and `run: "docker"` services named identically to `repos.json`.
2. Create `.github/workflows/meta-repo.yml` (Step 9) running `check-manifest.mjs` and `bootstrap.mjs --all --dry-run`.

### Phase 5: Generate or sync entry files (`README.md`, `AGENTS.md`, `CLAUDE.md`, `*.code-workspace`)

Use the templates and rules in **Section 7 (7.1–7.4)** of [meta-repo-architecture-guide.md](meta-repo-architecture-guide.md) and scaffold `docs/`, `specs/`, and `.ai/`:

1. **`README.md`**: follow the **Section 7.1** template, syncing the directory list and services/ports table with `repos.json`.
2. **`AGENTS.md`**: follow the **Section 7.2** layered global/subrepo templates (incorporating **Sections 3.1, 4.1, and 4.2** rules plus any custom user guidelines).
3. **`CLAUDE.md`**: follow the **Section 7.3** template (`@AGENTS.md` import, slash commands, `.ai/` governance, and <10-line stack snapshot).
4. **`<workspace>.code-workspace`**: follow all **7 Workspace Guidelines and the JSONC template in Section 7.4** (and create `<workspace>-legacy.code-workspace` if `legacy` repos exist).

### Phase 6: Validate, bootstrap/migrate repos, and install global CLI

1. **Validate**: run `node scripts/check-manifest.mjs && node scripts/bootstrap.mjs --all --dry-run`, verify `Makefile` recipes use literal TAB characters (`\t`), and fix any errors until validation passes.
2. **Populate repositories**: move (`mv`) approved existing local clones into `<path>` (preserving `.env`, `node_modules`, and uncommitted changes), or run `make bootstrap` (and `make install` if requested) to clone from remotes / update existing `<path>/.git` clones via `git fetch --all --prune`.
3. **Install global CLI**: run `node scripts/install-cli.mjs --name=<alias>` (when approved) or instruct the user to run `make setup-cli`, and remind them to open `<workspace>.code-workspace` (never `code .`).
