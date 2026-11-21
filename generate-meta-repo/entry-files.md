# Meta-Repo Entry Files & Governance Templates

> Guidelines and canonical templates for `README.md`, `AGENTS.md` (root & subrepo), `CLAUDE.md`, and `*.code-workspace`.

## Contents

1. [`README.md` — Human Onboarding Portal](#1-readmemd--human-onboarding-portal)
2. [`AGENTS.md` — Contract and Guardrails for AI Agents](#2-agentsmd--contract-and-guardrails-for-ai-agents)
3. [`CLAUDE.md` — Claude Code CLI Entry Point](#3-claudemd--claude-code-cli-entry-point)
4. [`*.code-workspace` — Multi-Root Configuration and IDE Performance](#4-code-workspace--multi-root-configuration-and-ide-performance)

---

## 1. `README.md` — Human Onboarding Portal

* **Target Audience**: Software engineers, DevOps, QA, and new team members.
* **Tone and Goal**: Concise and focused on getting the environment up and running in under 10 minutes.

### Template

````markdown
# Acme Workspace

Multi-root workspace for the Acme platform. This repository orchestrates all projects,
local Docker infrastructure, AI governance, and developer tooling.

## Quickstart (5-Step Onboarding)

```bash
# 1. Clone the orchestrator repository
git clone git@github.com:acme/workspace.git acme-workspace && cd acme-workspace

# 2. Clone repositories (pick according to your role)
make bootstrap                          # Active repositories (default, excludes legacy)
make bootstrap-frontend                 # Frontend repositories only
make bootstrap-product PRODUCT=checkout # Single product line only
make bootstrap-all                      # Entire ecosystem, including legacy

# 3. Install dependencies
make install

# 4. (Recommended) Install the organization CLI into your shell
make setup-cli                          # Defaults to 'acme-workspace'; press ENTER or type a custom alias

# 5. Open in the multi-root editor (do not open the root folder directly)
code acme.code-workspace
```

> [!TIP]
> Once the CLI is installed, run `<cli> <command>` (e.g., `acme status`) from **any subdirectory**.

## Directory Structure

- `apps/` — User-facing applications (web and mobile)
- `services/` — Backend API microservices
- `libs/` — Shared packages and libraries
- `legacy/` — Legacy systems (cloned on demand)
- `specs/` — Feature technical specifications
- `docs/` — Macro architecture documentation, ADRs, and runbooks

## Local Development

```bash
make dev-infra                           # Start Postgres + Redis in the background
make run                                 # List services, ports, and execution modes
make run S="checkout-api web-portal"     # Start selected services
BUILD=1 make run S="checkout-api"        # Force container image rebuild
make dev-down                            # Stop all containers (preserves data)
```

## Services and Ports

| Service | Directory | Port | Execution |
| :--- | :--- | :---: | :---: |
| `web-portal` | `apps/web-portal` | `3000` | host |
| `checkout-api` | `services/checkout` | `4001` | docker |
| `billing-api` | `services/billing` | `4002` | docker |

> Source of truth: `repos.json`. Keep this table in sync (or generate it from the manifest).

## Daily Commands

| Command | Description |
| :--- | :--- |
| `make help` | List all available commands |
| `make pull` | Sync all repositories |
| `make status` | Show git status across all repositories |
| `make branches` | Show active branch for each repository |
| `make checkout BRANCH=<name>` | Switch branch across the entire ecosystem |
| `make dev-down-v` | Stop all containers and remove volumes (clean slate) |
````

---

## 2. `AGENTS.md` — Contract and Guardrails for AI Agents

* **Target Audience**: Autonomous coding agents (Google Antigravity, Cursor, Windsurf, GitHub Copilot, Codex).
* **Tone and Goal**: Imperative, unambiguous, with machine-verifiable rules.

### Layered Hierarchy

| Layer | Location | Contents |
| :--- | :--- | :--- |
| **Global** | `AGENTS.md` at the meta-repo root | Workspace map, scope boundaries, general conventions, reference limits. |
| **Local** | `AGENTS.md` at each subrepo root | Actual lint/typecheck/test/build commands, local architecture, and exceptions to global rules. |

> [!IMPORTANT]
> **Precedence**: the `AGENTS.md` **closest** to the edited file wins. Local rules may specialize or override global ones, provided they state so explicitly.

### Template — Root `AGENTS.md`

````markdown
# AGENTS.md — Acme Workspace (Global Rules)

> This file defines GLOBAL rules. Each subrepo has its own `AGENTS.md`
> with local commands and exceptions. **Precedence: the AGENTS.md closest to the edited file wins.**

## Workspace Map
Source of truth: `repos.json` (ports, categories, verification commands).

| Repository | Path | Stack | Role |
| :--- | :--- | :--- | :--- |
| `web-portal` | `apps/web-portal` | Next.js | Customer web portal |
| `mobile-app` | `apps/mobile` | React Native | Customer mobile app |
| `checkout-api` | `services/checkout` | Node.js | Cart and orders |
| `billing-api` | `services/billing` | Go | Invoicing and payments |
| `shared-libs` | `libs/shared` | Turborepo | Shared packages |
| `legacy-monolith` | `legacy/monolith` | PHP | Legacy system (maintenance only) |

## Scope Boundaries
- Do not modify files outside the scope of the requested task.
- Never commit secrets (`.env`, keys, tokens).
- Never use relative imports across repository boundaries (`../../libs/...`); use versioned packages.
- Contract changes must follow Expand/Contract: never break consumers in a single step.

## Language
- Code and comments in English. Documentation and PRs in the language requested by the user.

## Architecture (Reference — subrepos may specialize)
- Unidirectional dependency flow: Domain ← Application ← Infrastructure ← Presentation.

## File Size Limits (Reference)
| File Type | Limit (lines) | Action if exceeded |
| :--- | :---: | :--- |
| Entity / Model | ≤ 150 | Extract Value Objects, split aggregates |
| Use Case / Service | ≤ 100 | Decompose into smaller steps |
| Controller / Handler | ≤ 150 | Extract DTOs, split routes |
| Repository | ≤ 200 | Extract query helpers |
| UI Component | ≤ 200 | Extract sub-components |
| Page / Screen | ≤ 100 | Move logic to hooks or services |
| Hook | ≤ 80 | Extract logic to services |

## DRY
Before creating any function, entity, hook, or component:
1. Search (`grep`/`glob`) for identical names or similar functionality across the workspace.
2. If something similar exists, reuse it or ask the developer whether to consolidate.

## Separation of Concerns (Examples)
- Backend: controllers/handlers use only DTOs and use cases; entities never import infrastructure (ORM, HTTP).
- Frontend: pages perform no direct API calls or business calculations; components with more than 3 effects or 8 props must be decomposed.

## Pre-Commit Verification (MANDATORY)
Before finishing any task, run the `lint`, `typecheck`, and `test` commands defined
in the modified subrepo's `AGENTS.md` (mirrored in the `checks` field of `repos.json`).
Criteria: **0 errors and 0 regressions**. No test may be removed without authorization.

## Git
- Conventional commits: `feat(<scope>): <description>`, `fix(<scope>): <description>`.
- **Git root**: each subrepo is an independent repository. Commit inside the subrepo root
  (`apps/*`, `services/*`), never at the workspace root.
- Cross-repo feature branches use the spec ID: `feat/SPEC-042-<description>`.
````

### Template — Subrepo `AGENTS.md` (e.g., `services/checkout/AGENTS.md`)

````markdown
# AGENTS.md — checkout-api

> Inherits global rules from `../../AGENTS.md`. Only local commands and exceptions are listed here.

## Verification Commands
| Step | Command |
| :--- | :--- |
| lint | `pnpm biome check .` |
| typecheck | `pnpm tsc --noEmit` |
| test | `pnpm test` |
| build | `pnpm build` |

## Local Architecture
- NestJS + Prisma. Migrations live in `prisma/migrations` (additive only).

## Exceptions to Global Rules
- `src/generated/**` is auto-generated: do not edit by hand; exempt from line limits.
````

---

## 3. `CLAUDE.md` — Claude Code CLI Entry Point

* **Target Audience**: Interactive sessions via Claude Code CLI.
* **Tone and Goal**: Practical, focused on slash commands and operational context.

> [!IMPORTANT]
> **Do not duplicate rules.** Claude Code natively supports file imports via `@path`: the `@AGENTS.md` line loads the entire `AGENTS.md` into context. Rules live in one place, and `CLAUDE.md` contains only what is specific to Claude Code.

### Template

````markdown
# CLAUDE.md — Acme Workspace

@AGENTS.md

> The rules above (imported from AGENTS.md) are mandatory. This file adds only
> Claude Code-specific context. When editing a subrepo, also follow its local AGENTS.md.

## Slash Commands

| Command | Workflow | Purpose |
| :--- | :--- | :--- |
| `/implement` | `.ai/workflows/implement.md` | Task-driven implementation |
| `/fix` | `.ai/workflows/fix.md` | Bug fixing with regression tests |
| `/test` | `.ai/workflows/test.md` | Unit and integration test creation |
| `/refactor` | `.ai/workflows/refactor.md` | Refactoring within file size limits |
| `/speckit.specify` | `.specify/` | Formal feature specification |
| `/speckit.plan` | `.specify/` | Technical plan from a specification |

## Governance (.ai/)
- `.ai/anti-patterns.md`: common pitfalls to avoid.
- `.ai/session-conventions.md`: session and memory discipline.
- `.ai/roles/`: personas (Architect, Implementer, Reviewer, Scribe).

## Execution
```bash
make run                         # list services and ports
make run S="checkout-api"        # start session dependencies
make status                      # workspace git status
```

## Current Stack Snapshot (keep under ~10 lines)
- Node.js 20+, TypeScript 5.x strict, Go 1.22, PostgreSQL 16.
- Detailed change history belongs in `docs/changelog.md`, not here (avoids bloating every session's context window).
````

---

## 4. `*.code-workspace` — Multi-Root Configuration and IDE Performance

* **Target Audience**: The code editor (VS Code, Cursor, Windsurf) and team developers.
* **Tone and Goal**: Technical and strict on performance, preventing memory exhaustion and CPU lockups caused by indexing multiple projects simultaneously.

### The 7 Workspace Guidelines

1. **Hierarchy and Semantic Naming (`folders`)**:
   * Place documentation and governance folders at the top (`docs/`, `specs/`, `.ai/`).
   * Include the stack in parentheses in folder labels (e.g., `"Web Portal (Next.js)"`, `"Billing API (Go)"`) to speed up quick file navigation (`Cmd/Ctrl + P`).
   * When services have sibling IaC/deploy repositories grouped under a parent folder (see [blueprint.md](blueprint.md)), point the workspace folder entry to the parent directory (e.g., `"path": "apps/web-portal"`) and enable `"git.autoRepositoryDetection": "subFolders"` in `settings`.
   * List only active repositories. Legacy repositories can live in a separate workspace file (e.g., `acme-legacy.code-workspace`).
2. **File Watcher Protection (`files.watcherExclude`)**:
   * Combined build and dependency folders across repositories easily exceed 500,000 files.
   * **Mandatory**: exclude `node_modules`, `dist`, `build`, `.next`, `coverage`, `.turbo`, `.cache`, and `.git/objects` from the file watcher to prevent `ENOSPC` errors and 100% CPU usage.
3. **Language Server Memory and Version**:
   * TSServer's default memory ceiling (~2–3 GB) quickly runs out across multiple projects: set `typescript.tsserver.maxTsServerMemory` to at least `4096` MB (`8192` on 32 GB+ machines).
   * Pin `typescript.tsdk` so every folder uses the same TypeScript version (path relative to the `.code-workspace` file).
   * Set `"typescript.preferences.importModuleSpecifier": "non-relative"` to avoid deep relative imports.
4. **Global Search Hygiene (`search.exclude`)**:
   * `Cmd/Ctrl + Shift + F` should return only relevant source code: exclude lockfiles, minified assets, and build folders.
   * **Never** exclude `specs/` or `docs/` from search.
5. **Standardized Formatting**:
   * Enable `editor.formatOnSave`, `files.trimTrailingWhitespace`, and `files.insertFinalNewline`, with the organization's default formatter (e.g., Biome or Prettier) pinned per language.
6. **Recommended Extensions (`extensions.recommendations`)**:
   * List official stack extensions for one-click onboarding installation.
7. **Careful Folder Exclusions**:
   * Avoid overly broad exclusions like `**/bin` in `files.exclude`: in Go projects or local scripts, `bin/` may contain relevant source files. Prefer excluding build outputs in watchers and search instead.

> [!WARNING]
> **Always open the `.code-workspace` file, never the root folder (`code .`).** The root `.gitignore` ignores `/apps/`, `/services/`, etc. With `search.useIgnoreFiles: true`, opening the root as a single folder **hides every subproject from global search**. In multi-root mode, each subproject is its own root and applies only its own `.gitignore`.

### Production Template (`acme.code-workspace`)

> [!IMPORTANT]
> **Adapt strictly to the workspace's real stacks**: point `typescript.tsdk` to an actual TypeScript repository in `repos.json` (or omit the TypeScript section when the workspace has no TypeScript repos), and include only per-language formatters and `extensions.recommendations` matching active stacks.

This file supports comments (JSONC format):

```jsonc
{
  "folders": [
    { "name": "Docs & ADRs", "path": "docs" },
    { "name": "Specs (Source of Truth)", "path": "specs" },
    { "name": "AI Governance (.ai/)", "path": ".ai" },
    { "name": "Web Portal (Next.js)", "path": "apps/web-portal" },
    { "name": "Mobile App (React Native)", "path": "apps/mobile" },
    { "name": "Checkout API (Node.js)", "path": "services/checkout" },
    { "name": "Billing API (Go)", "path": "services/billing" },
    { "name": "Shared Libs (Turborepo)", "path": "libs/shared" }
  ],
  "settings": {
    // ─── Editor ─────────────────────────────────────────────
    "editor.tabSize": 2,
    "editor.formatOnSave": true,
    "editor.minimap.enabled": false,
    "editor.bracketPairColorization.enabled": true,
    "editor.codeActionsOnSave": {
      "source.organizeImports.biome": "explicit",
      "quickfix.biome": "explicit"
    },

    // ─── Files and Watchers (critical in meta-repos) ────────
    "files.eol": "\n",
    "files.trimTrailingWhitespace": true,
    "files.insertFinalNewline": true,
    "files.exclude": {
      "**/.git": true,
      "**/node_modules": true,
      "**/.next": true,
      "**/.turbo": true,
      "**/coverage": true
    },
    "files.watcherExclude": {
      "**/node_modules/**": true,
      "**/dist/**": true,
      "**/build/**": true,
      "**/.next/**": true,
      "**/coverage/**": true,
      "**/.turbo/**": true,
      "**/.cache/**": true,
      "**/.git/objects/**": true
    },

    // ─── Global Search ──────────────────────────────────────
    "search.exclude": {
      "**/node_modules": true,
      "**/dist": true,
      "**/build": true,
      "**/coverage": true,
      "**/.next": true,
      "**/pnpm-lock.yaml": true,
      "**/package-lock.json": true,
      "**/yarn.lock": true,
      "**/go.sum": true,
      "**/*.min.js": true,
      "**/*.min.css": true
    },
    "search.useIgnoreFiles": true,

    // ─── Language Server (TypeScript) ───────────────────────
    "typescript.tsserver.maxTsServerMemory": 4096,
    "typescript.tsdk": "libs/shared/node_modules/typescript/lib",
    "typescript.preferences.importModuleSpecifier": "non-relative",
    "typescript.updateImportsOnFileMove.enabled": "always",

    // ─── Per-Language Formatters ────────────────────────────
    "[typescript]": { "editor.defaultFormatter": "biomejs.biome" },
    "[typescriptreact]": { "editor.defaultFormatter": "biomejs.biome" },
    "[javascript]": { "editor.defaultFormatter": "biomejs.biome" },
    "[json]": { "editor.defaultFormatter": "biomejs.biome" },
    "[go]": { "editor.defaultFormatter": "golang.go" }
  },
  "extensions": {
    "recommendations": [
      "biomejs.biome",
      "golang.go",
      "ms-azuretools.vscode-docker",
      "prisma.prisma",
      "bradlc.vscode-tailwindcss",
      "eamodio.gitlens"
    ]
  }
}
```
