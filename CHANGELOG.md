# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **Figma Desktop Plugin Release**: Initial release of the *Figma Node JSON Extractor* desktop plugin for zero-API exports.

---

## [1.0.1] - 2026-10-12

### Fixed
- Rate limit handling and CLI path resolution across nested workspaces.

---

## [1.0.0] - 2026-10-06

### Added
- Initial public release of `@pedroab0/skills` suite: `figma-extractor`, `figma-node-builder`, `figma-to-code`, and interactive installer CLI.
