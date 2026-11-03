# Generate Meta-Repo

Scaffolds a **Manifest-based Multi-root Workspace (Meta-Repo)** from your repositories, architecture docs, tech stacks, and engineering guidelines.

## Generated Workspace Layout

```text
<workspace-name>/
├── .ai/                        # Engineering rules, anti-patterns, roles, and workflows
├── .github/workflows/          # Meta-repo CI pipeline (check-manifest + dry-run bootstrap)
├── docs/                       # Macro architecture docs, ADRs, and operational runbooks
├── specs/                      # Cross-repo feature technical specifications (versioned)
├── scripts/
│   ├── bootstrap.mjs           # Selective cloning/updating with filters and --dry-run
│   ├── run.mjs                 # Manifest-driven hybrid service runner (docker + host)
│   ├── install-cli.mjs         # Interactive global shell CLI installer (zsh/bash/fish)
│   └── check-manifest.mjs      # Manifest schema and .gitignore coverage validator
├── .gitignore                  # Ignores cloned subproject folders (enforced by CI)
├── AGENTS.md                   # Global rules, LOC limits, and workspace map for AI agents
├── CLAUDE.md                   # Claude Code entry point (imports @AGENTS.md)
├── Makefile                    # Unified command interface derived from repos.json
├── README.md                   # 5-step human onboarding portal and port table
├── <name>.code-workspace       # Performance-tuned multi-root IDE configuration
├── docker-compose.dev.yml      # Shared backing infrastructure and containerized services
└── repos.json                  # Declarative manifest: the single source of truth
```

## Usage

```text
"Use generate-meta-repo to scaffold a meta-repo for Acme:
- web-portal (Next.js, frontend, port 3000, host: pnpm dev, git@github.com:acme/web-portal.git)
- checkout-api (Node.js, backend, port 4001, docker, git@github.com:acme/checkout-api.git)
- billing-api (Go, backend, port 4002, docker, git@github.com:acme/billing-api.git)
Infra: Postgres 16 and Redis 7."
```

## Documentation

- [Skill Definition (`SKILL.md`)](SKILL.md)
- [Architecture Guide & Blueprint (`meta-repo-architecture-guide.md`)](meta-repo-architecture-guide.md)
