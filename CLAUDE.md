# CLAUDE.md — Guidelines for Claude Code

This file provides context and quick commands for Claude Code when working in the `@pedroab0/skills` repository.
For comprehensive architectural rules, standards, and security protocols, refer to [`AGENTS.md`](file:///Users/pedrobarbosa/projects/skills/AGENTS.md).

---

## Key Commands

```bash
# Run full test suite (108 unit tests + skills linter)
npm test

# Run only the Agent Skills best-practices linter & flag parity check
npm run test:skills

# Check lean npm tarball packaging (< 100 kB)
npm run pack:check

# Run skills installer locally
npm run install-skills
node bin/cli.js --list
```

---

## Critical Operational Rules

1. **NEVER commit without explicit user permission**:
   - Always present a summary of changes and ask for approval before running `git commit`. The user reviews diffs manually.
2. **NEVER run `git push` or `npm publish` without permission**:
   - Only the user authorizes remote pushes and version releases.
3. **Zero external dependencies in scripts**:
   - Scripts in `scripts/` (`fetch_figma.js`, `inspect_spec.js`) strictly use Node.js built-ins (`fs`, `path`, `https`, `http`, `os`, `url`, `crypto`). No `npm install`.
4. **Anthropic Agent Skills standard**:
   - Frontmatter YAML descriptions strictly in 3rd person singular (`Extracts...`, `Builds...`, `Converts...`).
   - Token budget: keep `SKILL.md` body concise (< 500 lines, target: ~70-110 lines).
   - Progressive disclosure: exhaustive CLI flags, AST schemas, and proxy/token setups belong in `REFERENCE.md` at 1 level depth.
5. **Protection of local files and demo folders**:
   - User's local test files (e.g. `teste.json`) must never be staged, modified, or deleted.
   - Folders named `demo/`, `demos/`, or `playground/` must never be tracked in Git or included in npm packages.
6. **Repository Language**:
   - All files tracked in this repository (code, docs, comments, commit messages) must be written in **English**.

For full specifications on design tokens, component rules (Anti-Div Soup), icon resolution, and release protocols, read [`AGENTS.md`](file:///Users/pedrobarbosa/projects/skills/AGENTS.md).
