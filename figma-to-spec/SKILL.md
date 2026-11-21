---
name: figma-to-spec
description: 'Generates structured Markdown UI handoff and implementation specifications (.specs/*-ui.spec.md) from Figma URLs or extracted Figma AST specs (.specs/*.json), covering layout hierarchy, copy inventory, component instances, design tokens, assets, and optional host codebase mapping with gap analysis. Use whenever the user shares a figma.com link or .specs/*.json file and asks to document, summarize, break down a screen, audit tokens/copy, run a gap analysis, or write a UI handoff or implementation spec without writing application code. For raw JSON extraction only, use figma-extractor; for building UI code from a spec, use figma-node-builder; for direct one-shot UI coding from a Figma URL, use figma-to-code.'
---

# Figma To Spec (UI Specification & Handoff)

Turns a Figma URL or an extracted **AST spec** (`.specs/<name>.json`) into a structured, human- and agent-readable **UI spec** (default `.specs/<name>-ui.spec.md`, or `.specs/ui.spec.md` when unnamed) for technical handoff and functional review.

Requires Node.js >= 16.7. Scripts have zero external dependencies (no `npm install`).

## Boundaries

- Output **only** the **UI spec** (`.specs/<name>-ui.spec.md`, fallback `.specs/ui.spec.md`, or a user-specified `.md` path) and the cached **AST spec** (`.specs/<name>.json`) when ingesting a Figma URL. **Never create or edit application code** (`.tsx`, `.vue`, `.html`, `.css`, ...).
- **Never open Figma URLs with browser tools** (Playwright, Puppeteer, Chrome DevTools). The Figma canvas is WebGL, so there is no DOM to read. Do not search for local browser binaries.
- **API errors are final**: report them to the user. Never retry in a loop or fall back to scraping.

## Workflow

Copy this checklist and track your progress:

```
Spec Progress:
- [ ] 1. Resolve AST spec (local .specs/*.json offline, or fetch once from Figma URL)
- [ ] 2. Analyze the AST spec with analyze_spec.js
- [ ] 3. Detect host codebase context (skip cleanly if standalone)
- [ ] 4. Write the UI spec (.specs/<name>-ui.spec.md)
- [ ] 5. Verify the UI spec and hand off
```

**1. Resolve the AST spec**

- **Local AST spec provided** (e.g. `.specs/card.json` or `card`): proceed directly to Step 2 (**0 API calls**).
- **Figma URL provided**: run `fetch_figma.js` **once** (1 Tier 1 API call; reuses `.specs/<name>.json` with 0 calls if it already exists; pass `--force` only when explicitly asked to refresh):

```bash
node "<skill-dir>/scripts/fetch_figma.js" "<FigmaURL>" --spec <name>
```

If stderr returns a JSON error payload, follow [Errors](#errors) and stop.

**2. Analyze the AST spec**

Run the analyzer with `--markdown` instead of reading large raw JSON into context:

```bash
node "<skill-dir>/scripts/analyze_spec.js" .specs/<name>.json --markdown
```

For large frames or alternate output formats (`--max-depth`, `--no-tree`, `--json`, `--output`), see [REFERENCE.md](REFERENCE.md). Read specific sections of the raw AST spec only when the analyzer output is not enough. If a companion `.specs/<name>.png` exists, inspect it to verify visual hierarchy and states.

**3. Detect host codebase context (Dual Mode)**

Check whether the current workspace is an application codebase (`package.json`, `components/ui/`, `src/components/`, `tailwind.config.*`, `theme.css`, `globals.css`, or local icon folders):

- **Codebase mode**: map Figma `INSTANCE` components to existing primitives, semantic tokens to theme variables/classes, icons to local assets or installed icon packages, and record missing items as **Implementation Gaps**.
- **Standalone mode** (no host codebase, or user requested a design-only spec): skip codebase mapping cleanly without erroring or inventing file paths.

**4. Write the UI spec**

Follow the Markdown blueprint in [REFERENCE.md](REFERENCE.md) and write `.specs/<name>-ui.spec.md` (fallback `.specs/ui.spec.md` when unnamed, or the exact path requested by the user):

- Ground all dimensions, copy, component props, colors, typography, icons, and image layers strictly in the analyzer output (and companion `.png`, if present).
- Separate semantic design tokens from raw un-tokenized hex values; never invent hex colors, raw SVG `<path d="...">` strings, or external image URLs.
- Include Section 6 (**Codebase Mapping & Implementation Gaps**) only in codebase mode.

**5. Verify and hand off**

Before finishing, audit the written UI spec and fix any issue found:

1. Every metric, text string, token, component prop, and asset matches the analyzer output (no invented values or URLs).
2. In standalone mode, no fabricated codebase paths appear; in codebase mode, every mapped file/package actually exists in the workspace.
3. No application source files were created or modified.

Report the saved UI spec path, summarize key components/tokens and any gaps or open questions, and note that implementation can proceed later with `figma-node-builder`.

All CLI flags, the UI spec blueprint, OS token setup, and proxy options: see [REFERENCE.md](REFERENCE.md) (located at `<skill-dir>/REFERENCE.md`).

## Resolving `<skill-dir>`

Substitute `<skill-dir>` with the directory where this skill is installed, keeping double quotes around script paths (Windows/macOS/Linux):

- **Standard skills (`SKILL.md`)**: the parent directory of this `SKILL.md` file.
- **Cursor rule (`.cursor/rules/figma-to-spec.mdc`)**: the sibling `.cursor/skills/figma-to-spec` directory.

## Quota rules (Zero-Hammer Protocol)

When ingesting a Figma URL:

1. Run `fetch_figma.js` **once** per target frame or component. **Never retry in a loop.**
2. **Do not pass `-i`** unless the user explicitly asks for a preview image.
3. Prefer reusing existing `.specs/<name>.json` AST specs whenever available (0 API calls).

## Errors

| Error code | Action |
| :--- | :--- |
| `FIGMA_ACCESS_TOKEN is not set` / `FIGMA_TOKEN_EXPIRED_OR_INVALID` | Tell the user the token is missing, invalid, or expired. They create one in **Figma Settings → Personal Access Tokens** and set `FIGMA_ACCESS_TOKEN` (OS setup in [REFERENCE.md](REFERENCE.md)). |
| Node not found | Report that the `node-id` does not exist in the file. |
| `FIGMA_SSL_CERTIFICATE_ERROR` | Corporate proxy or self-signed certificate: suggest `FIGMA_IGNORE_SSL=true` in `.env`. |
| `FIGMA_RATE_LIMIT_EXCEEDED` / `FIGMA_CIRCUIT_BREAKER_ACTIVE` | Report the cooldown. Suggest duplicating the file in Figma Drafts or exporting the selection with the companion [Node JSON Extractor](https://www.figma.com/community/plugin/1691244420692136789/node-json-extractor) plugin into `.specs/<name>.json`, then running `figma-to-spec` offline. |
