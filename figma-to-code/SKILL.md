---
name: figma-to-code
description: 'Converts a Figma frame or component directly into production-ready UI code in a single pass, fetching a compact design-token-aware node tree from the Figma REST API and reusing the host project components and styles. Use when the user shares a figma.com link and explicitly asks to build, code, or implement it right away, without an intermediate spec review step. Supports React, Vue, Svelte, Angular, and plain HTML/CSS.'
---

# Figma To Code

Fetches a compact, design-token-aware node tree for a Figma frame and immediately builds the component in the host project, reusing its existing components and styles.

Requires Node.js >= 16.7. The scripts have zero dependencies (no `npm install`).

## Boundaries

- **Never open Figma URLs with browser tools** (Playwright, Puppeteer, Chrome DevTools). The Figma canvas is WebGL, so there is no DOM to read. Do not search for local browser binaries.
- **API errors are final**: report them to the user. Never fall back to scraping.
- If the user only wants to inspect, document, or plan the design, stop and suggest the `figma-extractor` skill instead.

## Workflow

Copy this checklist and track your progress:

```
Build Progress:
- [ ] 1. Discover the host project (stack, UI primitives, tokens, icons)
- [ ] 2. Fetch the node tree (once)
- [ ] 3. Build the component following the build rules
- [ ] 4. Validate and fix
```

**1. Discover the host project**: check `package.json` (framework, styling, icon library), reusable components in `components/ui/` or `src/components/`, and theme files (`tailwind.config.*`, `theme.css`, `globals.css`).

**2. Fetch the node tree** (1 Tier 1 API call; JSON is printed to stdout):

```bash
node "<skill-dir>/scripts/fetch_figma.js" "<FigmaURL>"
```

For large frames, add `--shallow-instances` (collapses instance internals into props) or `--depth 2`. All flags, the output schema, token setup per OS, and proxy options: see [REFERENCE.md](REFERENCE.md) (located at `<skill-dir>/REFERENCE.md`).

**3. Build**: follow the [Build rules](#build-rules), adapting syntax to the detected stack.

**4. Validate and fix**

1. Run the project's existing checks: `typecheck` or `lint` scripts from `package.json`, or `npx tsc --noEmit` when TypeScript is already installed. Never install new dependencies to do this.
2. If checks fail in the files you created or changed, fix them and run the checks again. Repeat until they pass.
3. Report pre-existing failures in other files instead of fixing them.
4. If a preview image was downloaded (`image.path` in the output), compare it visually with the result.

## Build rules

1. **Reuse existing components (no div soup)**: when an `INSTANCE` matches an existing component, import and render it with the spec props (`<Button variant="primary" size="large" hasIcon>Confirm Order</Button>`). Never rebuild existing primitives from raw elements.
2. **Layout**: `layoutMode: "HORIZONTAL"` → flex row; `"VERTICAL"` → flex column; `itemSpacing` → `gap`; `padding` → padding; `primaryAxisAlignItems` / `counterAxisAlignItems` → `justify-*` / `items-*`. Prefer the matching `*Token` when present.
3. **Colors and typography**: never guess values. Use the semantic `token` when present (mapped to the project CSS variable or Tailwind class), otherwise the exact hex `color`. Map font size, weight, and line height to existing typography tokens or classes.
4. **Icons and vectors** (`VECTOR` nodes, `isSvg: true`, or icon instances): normalize the name by stripping `icon/`, `ic_`, `ico-` (`icon/search` → `search`), then resolve in order:
   1. Local assets or components in `components/icons/`, `src/assets/`, or `public/` only (no repo-wide searches).
   2. The icon library installed in `package.json` (e.g. `import { Search } from 'lucide-react'`).
   3. An accessible placeholder with a `TODO: Missing icon 'search'` comment. Never invent raw SVG `<path d="...">` coordinates.
5. **Image fills** (`fills: [{ type: "IMAGE" }]`): apply only the spec styling (size, radius, `scaleMode: "FILL"` → `object-cover`, `"FIT"` → `object-contain`). Never fetch or invent image URLs. Render `<img src="" alt="...">` with a `TODO` comment naming the layer and its size.

## Resolving `<skill-dir>`

Substitute `<skill-dir>` with the directory where this skill is installed. Never guess another agent's folder, and keep the double quotes around the script path (Windows/macOS/Linux):

- **Standard skills (`SKILL.md`)**: the parent directory of this `SKILL.md` file.
- **Cursor rule (`.cursor/rules/figma-to-code.mdc`)**: the sibling `.cursor/skills/figma-to-code` directory.

## Quota rules (Zero-Hammer Protocol)

The script enforces a local rate gate and a persistent circuit breaker, but the agent must also follow these rules:

1. Run `fetch_figma.js` **once** per target frame or component. **Never retry in a loop.**
2. **Do not pass `-i`** unless the user explicitly requests a preview image. The JSON already contains layout, dimensions, colors, radii, typography, and text.
3. Figma Starter plans and View seats have very small monthly Tier 1 quotas, so every call matters.

## Errors

| Error code | Action |
| :--- | :--- |
| `FIGMA_ACCESS_TOKEN is not set` / `FIGMA_TOKEN_EXPIRED_OR_INVALID` | Tell the user the token is missing, invalid, or expired. They create one in **Figma Settings → Personal Access Tokens** and set `FIGMA_ACCESS_TOKEN` (setup per OS in REFERENCE.md). |
| Node not found | Report that the `node-id` does not exist in the file. |
| `FIGMA_SSL_CERTIFICATE_ERROR` | Corporate proxy or self-signed certificate: suggest `FIGMA_IGNORE_SSL=true` in `.env`. |
| `FIGMA_RATE_LIMIT_EXCEEDED` / `FIGMA_CIRCUIT_BREAKER_ACTIVE` | Report the cooldown. Suggest duplicating the file in Figma Drafts (Right-click → **Duplicate**) for a fresh URL, or exporting the selection with the companion [Figma Node JSON Extractor](https://www.figma.com/community/plugin/1691244420692136789/figma-node-json-extractor) plugin and building from that JSON. |
