---
name: figma-extractor
description: 'Extracts Figma frames and components into compact JSON spec files (.specs/*.json) with resolved design tokens, normalized component instance props, and optional preview images, using the Figma REST API. Use when the user shares a figma.com link and wants to inspect, extract, document, or plan a design before implementation, or asks to sync Figma variables and design tokens. Produces specification artifacts only and never edits application code. For immediate one-shot code generation from a Figma link, use figma-to-code instead.'
---

# Figma Extractor (SDD Spec Ingest)

Writes Figma designs to `.specs/<name>.json` (and optionally `.specs/<name>.png`) so a later implementation step can build from a fixed specification. A **spec** is the pruned Figma node tree with resolved tokens and component props.

Requires Node.js >= 16.7. The scripts have zero dependencies (no `npm install`).

## Boundaries

- Output only `.specs/` artifacts. **Never create or edit application code** (`.tsx`, `.vue`, `.html`, `.css`, ...) while using this skill.
- **Never open Figma URLs with browser tools** (Playwright, Puppeteer, Chrome DevTools). The Figma canvas is WebGL, so there is no DOM to read. Do not search for local browser binaries.
- **API errors are final**: report them to the user. Never fall back to scraping.

## Workflow

Copy this checklist and track your progress:

```
Extraction Progress:
- [ ] 1. Run the extraction (once)
- [ ] 2. Verify the result
- [ ] 3. Hand off a summary
```

**1. Run the extraction** (1 Tier 1 API call):

```bash
node "<skill-dir>/scripts/fetch_figma.js" "<FigmaURL>" --spec <name>
```

If `.specs/<name>.json` already exists, the script reuses it with 0 API calls. Pass `--force` only when the user explicitly asks to refresh the spec.

**2. Verify the result**

- Success: stdout shows `✔ Saved Figma specification` or `✔ Reusing local Figma specification`.
- Failure: stderr contains a JSON error payload. Follow [Errors](#errors). Do not retry.

**3. Hand off**: report the spec path and size, the root frame, the main component instances, and the design tokens found. Implementation is handled separately by the developer or by the `figma-node-builder` skill.

## Common variants

| Need | Command suffix |
| :--- | :--- |
| Preview PNG (only if the user asks; +1 Tier 1 call) | `--spec <name> -i` |
| Design tokens dictionary only | `--tokens --spec tokens` |
| Collapse instance internals into props | `--spec <name> --shallow-instances` |
| Top-level overview of a large frame | `--spec <name> --depth 2` |

All CLI flags, the output spec schema, token setup per OS, and proxy options: see [REFERENCE.md](REFERENCE.md) (located at `<skill-dir>/REFERENCE.md`).

## Resolving `<skill-dir>`

Substitute `<skill-dir>` with the directory where this skill is installed. Never guess another agent's folder, and keep the double quotes around the script path (Windows/macOS/Linux):

- **Standard skills (`SKILL.md`)**: the parent directory of this `SKILL.md` file.
- **Cursor rule (`.cursor/rules/figma-extractor.mdc`)**: the sibling `.cursor/skills/figma-extractor` directory.

## Quota rules (Zero-Hammer Protocol)

The script enforces a local rate gate and a persistent circuit breaker, but the agent must also follow these rules:

1. Run `fetch_figma.js` **once** per target frame or component. **Never retry in a loop.**
2. **Do not pass `-i`** unless the user explicitly requests a preview image. The JSON spec already contains layout, dimensions, colors, radii, typography, and text.
3. Figma Starter plans and View seats have very small monthly Tier 1 quotas, so every call matters. Prefer reusing existing specs.

## Errors

| Error code | Action |
| :--- | :--- |
| `FIGMA_ACCESS_TOKEN is not set` / `FIGMA_TOKEN_EXPIRED_OR_INVALID` | Tell the user the token is missing, invalid, or expired. They create one in **Figma Settings → Personal Access Tokens** and set `FIGMA_ACCESS_TOKEN` (setup per OS in REFERENCE.md). |
| Node not found | Report that the `node-id` does not exist in the file. |
| `FIGMA_SSL_CERTIFICATE_ERROR` | Corporate proxy or self-signed certificate: suggest `FIGMA_IGNORE_SSL=true` in `.env`. |
| `FIGMA_RATE_LIMIT_EXCEEDED` / `FIGMA_CIRCUIT_BREAKER_ACTIVE` | Report the cooldown. Suggest duplicating the file in Figma Drafts (Right-click → **Duplicate**) for a fresh URL, or exporting the selection with the companion [Figma Node JSON Extractor](https://www.figma.com/community/plugin/1691244420692136789/figma-node-json-extractor) plugin into `.specs/<name>.json`. |
