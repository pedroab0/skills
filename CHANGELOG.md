# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.6.0] - 2026-11-20

### Added
- **First-Class OpenAI Codex Support (`bin/cli.js`)**: Added `codex` (and `--agent codex-cli` alias) to the interactive agent picker, `--agent all`, `--help`, and `getAgentConfigs()` with `$CODEX_HOME/skills` (default `~/.codex/skills`) for global installs, `.agents/skills` for workspace-local installs, and automatic local/global installation detection.
- **Claude Code & OpenCode Config-Dir Overrides and Aliases**: Added `$CLAUDE_CONFIG_DIR` support (default `~/.claude`) with `--agent claude-code` alias, and `$OPENCODE_CONFIG_DIR` support (falling back to `$XDG_CONFIG_HOME/opencode`, default `~/.config/opencode`) with `--agent opencode-cli` alias, plus workspace-local `.claude` and `.opencode` detection.
- **Expanded Installer E2E Test Coverage (`test/test_cli.js`)**: Added end-to-end CLI tests covering local and custom-env global installs for OpenAI Codex (`CODEX_HOME`), Claude Code (`CLAUDE_CONFIG_DIR`), and OpenCode (`OPENCODE_CONFIG_DIR` and `XDG_CONFIG_HOME` fallback), bringing the CLI suite to 19/19 tests.

### Changed
- **Documentation & Package Metadata**: Updated `package.json` description and keywords (`codex`), `README.md` Supported Agents badge, Quick Install examples, Manual Installation Guide paths table, and skill READMEs (`evals/README.md`, `figma-extractor/README.md`, `figma-extractor/figma-plugin/README.md`, `generate-meta-repo/README.md`) to reflect Codex, Claude Code, and OpenCode paths and env overrides.

---

## [1.5.0] - 2026-11-20

### Added
- **`figma-to-spec` Skill**: New Spec-Driven Development (SDD) skill that turns a Figma URL or an extracted `.specs/<name>.json` AST into a structured Markdown UI handoff and implementation specification (`.specs/<name>-ui.spec.md`, fallback `.specs/ui.spec.md`) covering layout hierarchy, copy inventory, component instances, design tokens, assets, and optional host codebase mapping with gap analysis — without writing application code.
- **Zero-Dependency Offline Spec Analyzer (`figma-to-spec/scripts/analyze_spec.js`)**: Deterministic Node.js analyzer supporting `--markdown`, `--json`, `--output`, `--max-depth`, and `--no-tree` flags, UTF-8/UTF-16LE BOM decoding, shorthand `.specs/` path resolution, and companion `.png` detection, backed by `test_analyze_spec.js`.
- **Installer & SDD Suite Integration**: Added `figma-to-spec` to the interactive CLI (`bin/cli.js`) as Preset 5 (`--skill figma-to-spec`) and expanded the SDD Suite (`--skill sdd`, Preset 2) to install `figma-extractor`, `figma-to-spec`, and `figma-node-builder` together.
- **Evaluation Rubrics for `figma-to-spec`**: Added `evals/figma-to-spec.json` and updated `evals/figma-to-code.json` and `evals/README.md` to test spec generation and trigger disambiguation across Figma skills.
- **Companion IaC / Deploy Repositories Pattern (`generate-meta-repo`)**: Added Section 4.6 (*Parent Grouping Folder Pattern*) in `generate-meta-repo/meta-repo-architecture-guide.md` and integrated it into `generate-meta-repo/SKILL.md` for pairing sibling `*-iac` / `*-deploy` / `*-infra` repos inside neutral parent folders with `bootstrap-iac` and `.code-workspace` `git.autoRepositoryDetection: "subFolders"`.

### Changed
- **Figma Skill Disambiguation & Docs**: Updated `README.md`, `AGENTS.md`, `figma-extractor/SKILL.md`, `figma-node-builder/SKILL.md`, and `figma-to-code/SKILL.md` to clearly distinguish raw JSON extraction (`figma-extractor`), Markdown UI spec generation (`figma-to-spec`), offline UI implementation (`figma-node-builder`), and one-shot code generation (`figma-to-code`).
- **Expanded `generate-meta-repo` Workflow & Guardrails**: Added explicit Node.js `>= 18` requirement, tighter Phase 1–6 operational steps, zero-drift validation against `repos.json`, and an Architectural Guardrails summary in `generate-meta-repo/SKILL.md`.
- **Updated npm Tarball Size Budget**: Adjusted documented lean npm package ceiling from `< 100 kB` to `< 150 kB` in `AGENTS.md` and `CLAUDE.md` to accommodate the expanded 5-skill suite.

### Fixed
- **CLI Binary Collision (`npx skills`)**: Renamed the `package.json` `bin` entry from `skills` to `pedroab0-skills` (with unit test coverage in `test/test_cli.js`) to avoid shadowing the global `npx skills` CLI.

---

## [1.4.1] - 2026-11-09

### Fixed
- **Figma Community Submission Compliance**: Renamed companion desktop plugin from *Figma Node JSON Extractor* to *Node JSON Extractor* across plugin manifest (`manifest.json`), UI (`ui.html`), backend (`code.js`), and all documentation to comply with Figma trademark and brand naming policies for community approvals.

---

## [1.4.0] - 2026-11-03

### Added
- **`generate-meta-repo` Skill**: New Architecture & Workspace Engineering skill that scaffolds a Manifest-based Multi-root Workspace (Meta-Repo) with `repos.json`, zero-dependency Node.js orchestration scripts (`bootstrap.mjs`, `run.mjs`, `install-cli.mjs`, `check-manifest.mjs`), `Makefile`, Docker Compose dev stack, `.code-workspace`, and layered AI governance (`AGENTS.md`, `CLAUDE.md`).
- **Comprehensive Meta-Repo Architecture Guide**: Added deep blueprint reference `generate-meta-repo/meta-repo-architecture-guide.md` covering the 7 core workspace guidelines, execution modes, and Day-2 evolution workflows.
- **Installer Integration (Preset 6)**: Added `generate-meta-repo` to interactive installer `bin/cli.js` (`npx @pedroab0/skills`) and non-interactive flags (`--skill generate-meta-repo`).
- **Evaluation Rubric for Meta-Repo**: Added `evals/generate-meta-repo.json` covering greenfield polyglot scaffolding, migration of existing local clones, and incremental workspace evolution.
- **Enforced Evaluation Rubric Linter**: Updated `test/test_skills.js` to ensure every skill in `SKILL_DIRS` has an evaluation rubric with at least 3 scenarios.

### Changed
- **General-Purpose Agent Skills Positioning**: Re-scoped repository catalog and documentation from a Figma-only presentation to an open-source suite of Agent Skills spanning multiple software engineering domains (Architecture & Workspaces, Design & Spec-Driven Development, and Community Roadmap).
- **Categorized Catalog & Workflows**: Restructured `README.md` with domain categorization, multi-domain Mermaid workflows, and a streamlined manual installation matrix across Claude Code, Antigravity, OpenCode, Kiro, and Cursor.
- **Layered Agent Governance (`AGENTS.md`)**: Reorganized agent guidelines into universal skill standards (zero runtime external dependencies, progressive disclosure, token budget) and domain-specific rules (Figma/SDD vs Meta-Repo/Architecture).
- **Package Metadata**: Expanded `package.json` keywords to include `agent-skills`, `ai-skills`, `meta-repo`, and `developer-tools`.

---

## [1.3.0] - 2026-10-25

### Added
- **Anthropic Agent Skills Alignment**: Conformed all skills (`figma-extractor`, `figma-node-builder`, `figma-to-code`) to the official Anthropic Agent Skills standard (`best-practices`).
- **Progressive Disclosure (`REFERENCE.md`)**: Extracted detailed CLI flag tables, OS token configurations, proxy setups, and AST JSON schemas into dedicated `REFERENCE.md` files (`figma-extractor/REFERENCE.md` and `figma-to-code/REFERENCE.md`).
- **Interactive Workflow Checklists**: Added copyable Markdown checklists (`Extraction Progress`, `Implementation Progress`, `Build Progress`) for agents to track multi-step execution.
- **Continuous Skills Linter (`test/test_skills.js`)**: Integrated automated linting into `npm test` verifying frontmatter standards, token budgets (<500 lines), relative link integrity, and 100% flag parity between executable `--help` and documentation.
- **Agent Evaluation Suite (`evals/`)**: Added 9 data-driven evaluation rubrics across Haiku, Sonnet, and Opus testing models.
- **Bounded Validation Feedback Loops**: Added Phase 4 protocol in builders to execute project `typecheck`/`lint` without installing extra packages.
- **Cursor Rule Link Rewriter**: Automatically rewrites relative markdown links in `.cursor/rules/*.mdc` to `](../skills/<skill>/<file>.md)`.

### Changed
- **Token Budget Optimization**: Reduced prompt body lines in `SKILL.md` by over 50% across the suite (from 526 lines to 260 lines total).
- **Frontmatter Descriptions**: Rewritten in 3rd person singular with distinct triggers, eliminating ambiguity between spec ingestion (`figma-extractor`) and direct one-shot generation (`figma-to-code`).
- **Cursor Rule Mode**: Generated `.cursor/rules/*.mdc` rules now use `alwaysApply: false` (Agent Requested mode) instead of eager `globs: *`, saving thousands of context tokens per query.
- **Frontmatter Parser**: Robust parser `parseFrontmatterField` in `bin/cli.js` supporting single quotes (`''`), double quotes, and plain strings without truncation.

---

## [1.2.0] - 2026-10-25

### Added
- **Intelligent Vector Subtree Collapsing**: Prunes SVG subtrees, vector graphics, logos, and illustration groups into single `VECTOR` leaf nodes with `isSvg: true`, cutting payload sizes by ~85%.
- **Icon Instance Pruning**: Prunes internal vector stroke children from icon instances while retaining component metadata, variant properties, and inherited colors.
- **Masked Image Group Collapsing**: Collapses photo mask layers into single image fill nodes.
- **Typography & Font Fallbacks**: Handled `figma.mixed` typography ranges with automatic `(0, 1)` range lookups, numeric `fontWeight`, and pixel conversion for `PERCENT` line-heights.
- **Unit Test Suite**: Full test suite with 108 tests covering AST pruning, plugin sandbox execution, circuit breakers, and cross-agent CLI installer.

### Fixed
- **Figma Plugin Clipboard Permissions**: Fixed copy button failing in Figma Desktop sandboxed null-origin iframes via synchronous `copyUsingExecCommand` fallback.
- **Figma Dynamic-Page Compatibility**: Resolved instance master components via `getMainComponentAsync()`.

### Changed
- **Package Slimming (-98.8%)**: Excluded local `demo/` apps, test suites, and heavy marketing assets from npm distribution tarball (reduced from 5.2 MB to ~73 kB).

---

## [1.1.0] - 2026-10-25

### Added
- **Windows PowerShell Support**: Added detection and parsing of UTF-16LE Windows PowerShell profile files (`$PROFILE`) and `[Environment]::SetEnvironmentVariable`.
- **Kiro IDE & CLI Compatibility**: Added first-class installation support for Kiro via `.kiro/skills` and `$KIRO_HOME/skills`.
- **Figma Desktop Plugin Release**: Initial release of the *Node JSON Extractor* desktop plugin for zero-API exports.

---

## [1.0.1] - 2026-10-12

### Fixed
- Rate limit handling and CLI path resolution across nested workspaces.

---

## [1.0.0] - 2026-10-06

### Added
- Initial public release of `@pedroab0/skills` suite: `figma-extractor`, `figma-node-builder`, `figma-to-code`, and interactive installer CLI.
