# Generate Meta-Repo (`generate-meta-repo`)

Autonomous **Architecture & Workspace Engineering** skill for AI coding assistants (Claude Code, Google Antigravity, Cursor, Kiro, OpenCode, Codex).

Scaffolds and maintains a **Manifest-based Multi-root Workspace (Meta-Repo)** that coordinates independent Git repositories, shared dev infrastructure, and layered AI governance without `git submodule` fragility.

---

## What is a Meta-Repo & Why Use It?

The **Meta-Repo** is the pragmatic middle ground between monolithic monorepos and scattered multi-repos:
- **Central Governance Shell**: Coordinates repositories without absorbing their Git history or business logic.
- **Onboarding in Minutes**: Replaces multi-day environment setup with `make bootstrap && make run`.
- **Zero Submodule Fragility**: Uses a declarative JSON manifest instead of fragile `git submodule` pointers.
- **Cross-Repo AI Context**: Layered `AGENTS.md` and `CLAUDE.md` give AI agents macro visibility across services.

---

## Key Benefits

1. **Subproject Autonomy**: Sub-repos remain 100% independent Git repositories with their own remotes, CI/CD, and permissions. Standalone clones continue to work.
2. **Conflict-Free Polyglot**: Next.js, Go, Node, Python, and legacy stacks coexist without a single forced build tool.
3. **Hybrid Dev Execution**: Docker for backing infra/APIs (OS parity); native host execution for frontends (hot-reload).
4. **Zero External Dependencies**: All orchestration scripts (`scripts/*.mjs`) use Node.js built-ins (`fs`, `path`, `child_process`).
5. **Layered AI Governance**: Root `AGENTS.md` and `CLAUDE.md` govern architecture boundaries, while subrepos keep local rules.
6. **Global Shell CLI**: Shell installer generates a global workspace alias (e.g. `acme run`, `acme status`) callable from any folder.

---

## How It Works

### The Declarative Manifest Pattern
- **`repos.json` (Single Source of Truth)**: Declares all repositories, paths, remotes, ports, stacks, execution modes (`docker` vs `host`), and checks.
- **Strict Directory Isolation**: Root `.gitignore` ignores all subproject directories (`/apps/`, `/services/`). Sub-repo code is never committed to the meta-repo.
- **Automated Synchronization**: Manifest updates cascade automatically to the `Makefile`, Docker Compose, and IDE configurations.

### Execution Modes
- **Greenfield**: Scaffolds a new workspace from scratch given repository URLs or stack requirements.
- **Evolution**: Surgically updates `repos.json` and syncs configs when adding/removing services without overwriting user rules.
- **Local Migration**: Moves existing local clones into the meta-repo hierarchy preserving `.env` files and uncommitted work.

---

## What Gets Generated

```text
<workspace>/
├── repos.json             # Manifest (single source of truth)
├── Makefile               # Unified interface (bootstrap, run, status)
├── docker-compose.dev.yml # Backing infra and docker services
├── *.code-workspace       # Multi-root IDE configuration
├── AGENTS.md / CLAUDE.md  # Layered AI governance & architecture map
├── README.md              # 5-step human onboarding portal
├── scripts/               # Zero-dep Node.js orchestration (bootstrap, runner, CLI)
├── .github/workflows/     # CI pipeline (manifest check + dry-run bootstrap)
└── docs/ & specs/         # ADRs, C4 diagrams, and feature specifications
```

---

## How to Use It

### 1. Prompting Your AI Assistant
* **Scaffold Platform**:
  > "Use `generate-meta-repo` to scaffold an acme-workspace (alias: acme) with web-portal (Next.js, port 3000, host), checkout-api (Node.js, port 4001, docker), and Postgres 16."
* **Migrate Local Clones**:
  > "Organize our local folders (../web-portal, ../orders-api) into a new meta-repo preserving .env files and local changes."
* **Evolve Workspace**:
  > "Update our acme-workspace: add notification-worker (Python/uv, port 4003, docker) and deprecate legacy-monolith."

### 2. Operating the Workspace (Developer Guide)
| Command | Action |
| :--- | :--- |
| `make setup-cli` | Installs global shell CLI alias (`<alias>`) into developer's shell |
| `make bootstrap` | Clones missing repositories or updates existing clones (`git fetch --prune`) |
| `make run` | Starts infra + docker services + host frontends concurrently |
| `make status` | Displays git branch, uncommitted diffs, and sync state across all repos |
| `make pull` | Fetches and rebases all repositories on their default branches |
| `make check` | Validates `repos.json` integrity and `.gitignore` coverage |

---

## Deep Dive Documentation

* [`SKILL.md`](SKILL.md) — The 6-Phase AI Agent Execution Procedure.
* [`meta-repo-architecture-guide.md`](meta-repo-architecture-guide.md) — Complete 1,200+ line technical architecture blueprint.
