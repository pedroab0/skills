# AGENTS.md — Rules and Guidelines for AI Agents

This document defines the architecture, operational rules, code standards, Git/release protocols, and communication conventions for any autonomous AI agent (Antigravity, Claude Code, Cursor, Kiro, OpenCode, Codex, etc.) working in this repository.

---

## 1. Repository Overview (`@pedroab0/skills`)

This repository is an open-source suite of modular **Agent Skills** for frontend Spec-Driven Development (**SDD**):
- **`figma-extractor`**: Specification ingestion layer. Connects to the Figma REST API, extracts a pruned AST, resolved design tokens, and normalized component instances into `./.specs/<name>.json`.
- **`figma-node-builder`**: Implementation layer. Builds UI components in actual code (React, Vue, Svelte, Tailwind, etc.) from the local spec (`.specs/*.json`), operating 100% offline.
- **`figma-to-code`**: Direct one-shot converter. For when the user wants immediate code generated from a Figma link without intermediate spec review.
- **`bin/cli.js`**: Interactive CLI installer (`npx @pedroab0/skills`) compatible with multiple agents (Claude Code, Cursor, Kiro, Antigravity, OpenCode).
- **`figma-extractor/figma-plugin/`**: Official Figma Desktop companion plugin (*Figma Node JSON Extractor*) for zero-API exports.
- **`evals/`**: Data-driven benchmark evaluation rubrics across model tiers (Haiku, Sonnet, Opus).
- **`test/`**: Unit test suites for scripts, installer CLI, and continuous documentation parity linter (`test_skills.js`).

---

## 2. Strict Operational Rules (Mandatory)

### A. Git and Commit Protocol
1. **NEVER commit without explicit user permission**:
   - Always present a summary of changes and ask for approval before running `git commit`. The user reviews diffs manually before committing.
2. **NEVER run `git push` or publish to npm without permission**:
   - Running `git push`, creating tags, or running `npm publish` requires explicit and unequivocal user consent.
3. **Atomic Commits and Logical Separation**:
   - Separate changes into atomic commits by area of responsibility:
     - *1st*: Documentation or isolated flags (e.g., additions to `--help` and READMEs).
     - *2nd*: Conceptual skill changes and reference files (`docs(skills)`).
     - *3rd*: CLI, agent rules, and test changes (`feat(cli)` / `test(cli)`).
     - *4th*: Evaluation rubrics (`test(evals)`).
     - *5th*: Isolated version bump (`chore(release)`).
4. **Protection of User's Local Test Files**:
   - Local files such as `teste.json` or temporary specs created by the user **must never be staged (`git add`), modified, or deleted**.
5. **Prohibition of Demo Folders in Git**:
   - Directories named `demo/`, `demos/`, `playground/`, or sample apps inside skills **must never be tracked in Git** and must remain in `.gitignore`.

### B. Clean and Lean npm Packaging (< 100 kB)
- The published npm tarball must contain **strictly the execution code and skill documentation**.
- The `"files"` array in `package.json` must strictly exclude:
  - `!**/demo/**`
  - `!**/demos/**`
  - `!**/.specs/**`
  - `!**/test_*.js`
  - `!**/figma-plugin/assets/**`
  - `test/` and `evals/` directories (remain only on GitHub).
- **Always validate package size before release**: run `npm run pack:check` (or `npm pack --dry-run`) to ensure the tarball is under 100 kB (target: ~72 kB with 19 files).

### C. Zero External Dependencies in Scripts
- All scripts in `scripts/` (`fetch_figma.js`, `inspect_spec.js`) must maintain **zero external npm dependencies** (no dependencies in `node_modules`).
- Use Node.js built-in modules exclusively: `fs`, `path`, `https`, `http`, `os`, `url`, `crypto`.
- Maintain compatibility with Node.js `>= 16.7.0` (support for `fs.cpSync`, `fs.rmSync`).

---

## 3. Skill Authoring Standards (Anthropic Agent Skills Standard)

All skills in this repository must strictly adhere to the Anthropic Agent Skills best practices:

### A. Strict 3rd-Person YAML Frontmatter
- `name` field:
  - 1 to 64 characters, lowercase alphanumeric and hyphens only (`^[a-z0-9-]{1,64}$`).
  - Prohibited reserved keywords: `"anthropic"`, `"claude"`.
- `description` field:
  - Max 1,024 characters. Non-empty.
  - **Always in the 3rd person singular**: must begin with an English present-tense verb (e.g., `Extracts...`, `Builds...`, `Converts...`).
  - **Prohibited imperative** (`Extract...`, `Build...`) and 1st/2nd person (`I can...`, `You can...`).
  - **Prohibited XML or HTML tags** (`<name>`, `<div>`).
  - Must state both **what the skill does** and **clear trigger conditions/keywords** for when to activate it.
  - **Mandatory disambiguation**: explicitly distinguish between spec planning/ingestion (`figma-extractor`) and direct one-shot code generation (`figma-to-code`).

### B. Token Budget (< 500 lines in `SKILL.md`)
- The context window is a public good. Keep the body of `SKILL.md` concise (target: 70 to 110 lines).
- Do not explain theoretical concepts LLMs already understand (e.g., how WebGL works, what flexbox is, standard bash commands).
- Focus on **operational behavioral rules**, **workflows**, and **guardrails**.

### C. Progressive Disclosure
- `SKILL.md` is an executive high-level summary.
- Dense reference materials not needed on every turn must be extracted into `REFERENCE.md` at the root of the skill:
  - Comprehensive CLI flag tables.
  - AST JSON schemas and long output examples.
  - OS-specific environment variable setup (PowerShell, Bash, Zsh) and SSL proxy guides.
  - Internal rate-limit and circuit breaker mechanics.
- **Maximum 1 level depth**: file references from `SKILL.md` must be at 1 level depth (`[REFERENCE.md](REFERENCE.md)`).
- Reference files with more than 100 lines must include a `## Contents` table of contents.

### D. Copyable Checklists and Bounded Feedback Loops
- Replace static diagrams with **copyable operational Markdown checklists** that the agent copies into its response and checks off (`- [ ] Step 1...`).
- **Feedback Loop (Validate & Fix)**:
  - Instruct the agent to run project integrity checks (`typecheck`, `tsc --noEmit`, or `lint`) if configured in the host project.
  - **Never install new dependencies** just to run validation.
  - Fix only errors in files created or modified by the agent itself.
  - Report pre-existing errors in other files without attempting to refactor them.

### E. Cross-Platform Path Compatibility
- Always use standard forward slashes (`/`) in documentation file paths and scripts, even for Windows environments.
- Always wrap script paths in double quotes in command examples: `node "<skill-dir>/scripts/fetch_figma.js"`.

---

## 4. Architecture and Code Guidelines

### A. Zero-Hammer Protocol (Rate-Limit & Quota Protection)
- The Figma API enforces tight monthly Tier 1 rate limits on Starter plans and View seats.
- **AST-only by default**: `fetch_figma.js` runs without `-i` by default (consuming only 1 Tier 1 call). Only download PNG previews when explicitly requested by the user.
- **Single-Shot Execution**: the script is executed **exactly once** per frame or component. **Never retry in a loop upon errors**.
- **Persistent Circuit Breaker**: HTTP 429 errors record the cooldown lockout in `~/.figma_ratelimit.json`. Subsequent requests are blocked locally without network traffic.
- **Proactive Reuse**: if `.specs/<name>.json` exists locally, the script reuses the local spec with 0 API calls, unless `--force` or `-f` is provided.
- **Strict Anti-Scraping Rule**: never attempt to scrape Figma URLs using Playwright, Puppeteer, or Chrome DevTools (the Figma canvas is rendered via WebGL/Wasm and has no inspectable HTML DOM).

### B. Anti-Div Soup and Visual Fidelity in Builder
- **Primitive Component Reuse**: when an AST node is of type `INSTANCE` and has an equivalent component in the host project (`Button`, `Input`, `Card`, `Badge`), **import and render the component directly with matching props**. Never reconstruct the component out of generic styled `<div>` elements.
- **Semantic Design Tokens**: if the `token` property is present (`colors/brand/primary`, `spacing/md`, `radii/lg`), map it to the host theme's CSS variable or utility class (Tailwind). Do not hardcode arbitrary raw hex values.
- **Icon Resolution Hierarchy**:
  1. Local component icon asset in `components/icons/`, `src/assets/`, `public/`.
  2. Installed icon library in `package.json` (`lucide-react`, `@heroicons/react`, etc.).
  3. Accessible semantic placeholder (`<span aria-hidden="true" />`) with comment `TODO: Missing icon 'name'`. **Never hallucinate complex SVG `<path d="...">` coordinates**.
- **Image Layers**: style the container only (`width`, `height`, `rounded`, `object-cover` for `scaleMode: FILL`) and render `<img src="" alt="..." />` with a `TODO` comment. **Never invent external image URLs (e.g. Unsplash placeholders)**.

---

## 5. Installer Integration & Agent Rules (`bin/cli.js`)

- **Frontmatter Parser**: `bin/cli.js` uses `parseFrontmatterField(content, field)` supporting:
  - YAML-escaped single quotes (`''`).
  - JSON-escaped double quotes (`\"`).
  - Unquoted plain strings.
  - Never replace with naive regex that breaks on internal apostrophes.
- **Cursor Rules (`.mdc`)**:
  - Rules generated in `.cursor/rules/<skill>.mdc` must set `alwaysApply: false` (Agent Requested mode) to prevent attaching skill prompts to unrelated files.
  - The `description` field must be serialized with `JSON.stringify`.
  - Markdown relative links must be automatically rewritten by `rewriteRelativeLinksForCursor` to `](../skills/<skill>/<file>.md)`.

---

## 6. Testing, Quality & Continuous Validation

Before proposing or committing any changes:
1. **Run the test suite**:
   ```bash
   npm test
   ```
   Must run and pass 100% of tests:
   - `figma-extractor/scripts/test_fetch_figma.js` (parsing, circuit breaker, AST, and plugin tests).
   - `figma-to-code/scripts/test_fetch_figma.js` (direct extraction tests).
   - `figma-node-builder/scripts/test_inspect_spec.js` (spec inspector tests).
   - `test/test_cli.js` (cross-agent installer, frontmatter parser, and Cursor rules tests).
   - `test/test_skills.js` (continuous best practices linter and 100% CLI flag parity check).
2. **Validate npm package integrity**:
   ```bash
   npm run pack:check
   ```
   Ensure no files from `demo/`, `test/`, `evals/`, or `test_*.js` are included, and total size is < 100 kB.

---

## 7. Standard Release Procedure

When publishing a new release:
1. **Version Definition (SemVer)**:
   - Patch (`1.x.y`): Bug fixes, documentation adjustments.
   - Minor (`1.y.0`): New flags, AST optimizations, compatibility improvements.
2. **Update `package.json`**:
   - Bump `"version"`.
   - Commit: `git commit -m "chore(release): bump version to x.y.z"`.
3. **Create Git Tag**:
   - `git tag -a vx.y.z -m "vx.y.z"`
4. **Push to Remote**:
   - `git push origin main --tags`
5. **Publish to npm**:
   - `npm publish` (user enters OTP if required).
6. **Create GitHub Release (`gh`)**:
   - Run `gh release create vx.y.z --title "..." --notes "..." --latest` with detailed markdown changelog.

---

## 8. Communication Style and Language Conventions

- **Repository Language**:
  - **All files tracked in the repository MUST be written in English**: code, documentation, Markdown files, scripts, comments, commit messages, PR descriptions, and agent configuration files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, etc.).
- **Tone & Format**:
  - Concise, structured, and direct GitHub-flavored Markdown.
- **Mandatory Clickable Links**:
  - Always create clickable links with `file:///...` for all referenced files and directories (e.g., [`package.json`](file:///Users/pedrobarbosa/projects/skills/package.json)).
- **Transparency & Confirmation**:
  - Never assume permission to commit or push code. Explain what was changed, present test/packaging diagnostics, and await explicit instructions to proceed.
