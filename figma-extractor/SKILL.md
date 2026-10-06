---
name: figma-extractor
description: 'Extract compact JSON node hierarchies, design tokens, component instance props, and automated preview images from Figma using the Figma REST API. Trigger this skill during the planning or specification phase whenever a Figma link is provided or when the user asks to inspect, extract, or sync design specifications and tokens from Figma into .specs/. This skill strictly produces specification artifacts and does not modify application code.'
---

# Figma Extractor Skill (SDD Spec Ingest)

Extract design node metadata, component hierarchies, design tokens/variables, and rendered preview images directly from Figma via the Figma REST API into structured specification artifacts (`.specs/`).

This skill serves as the **Specification Ingestion Layer** in a **Spec-Driven Development (SDD)** workflow. It is **Design-System Aware**, high-performance, token-efficient, and has zero external dependencies.

---

## Operational Boundary: Spec Ingestion Only

* **Specification Artifacts Only**: This skill strictly outputs machine-readable design specifications (`.specs/<name>.json`) and visual references (`.specs/<name>.png`).
* **Zero Application Code Changes**: Do **NOT** create, edit, or modify application source code (`.tsx`, `.vue`, `.html`, `.css`, etc.) while executing this skill.
* **Hand-off to Implementation**: Once specifications are generated in `./.specs/`, present a summary of the extracted tokens, components, and layout bounds. The implementation phase is handled separately by the developer or a downstream builder skill (such as `figma-node-builder`).

---

## Strict Guardrails: No Browser Scraping / Automation

> [!CAUTION]
> **NEVER use browser tools (Playwright, Puppeteer, Chrome DevTools, `browser_navigate`, `read_browser_page`) on Figma URLs.**
>
> 1. **Figma Canvas is WebGL/Wasm**: Figma renders design canvas elements inside an HTML5 `<canvas>` via WebAssembly. There are NO inspectable HTML DOM elements for frames, layers, texts, or styles. Browser automation cannot extract Figma nodes or properties.
> 2. **Never search `/Applications` for browsers**: Do not search for installed browser binaries or run browser automation scripts.
> 3. **API Errors Are Final**: If `fetch_figma.js` returns an API error (e.g., 401 Unauthorized, 403 Forbidden, or 429 Rate Limited), **report the error directly to the user**. Guide them to check their `FIGMA_ACCESS_TOKEN`, permissions, or wait out rate limits. Do NOT attempt browser scraping fallbacks.

---

## Built-in Rate-Limit Gate & Circuit Breaker

To protect your Figma file quota and prevent lockout penalties, `fetch_figma.js` enforces an automatic safety gate:
* **Max 5 requests per minute** per file key (sliding window limit).
* **2.5s inter-request pacing** between consecutive requests.
* **Persistent Circuit Breaker**: If Figma returns HTTP 429, the script records the lockout time locally in `~/.figma_ratelimit.json`. All future calls to that file key are **immediately blocked with zero network traffic**, preventing Figma from extending the lockout penalty.

### Agent Behavioral Rules (Zero-Hammer Protocol)
1. **Single-Shot Execution**: Run `fetch_figma.js` **once** per target frame or component.
2. **Never Retry on Failure**: If `fetch_figma.js` returns an error, **DO NOT retry in a loop**. Report the error directly to the user.
3. **Handling `FIGMA_CIRCUIT_BREAKER_ACTIVE`**: If the circuit breaker trips, inform the user that the file key is on cooldown, and suggest duplicating the file in Figma Drafts (Right-click $\rightarrow$ **Duplicate**) to get a fresh URL.

---

## Prerequisites

A Figma Access Token (Personal Access Token or OAuth Token) is required.

Configure it using either:
1. **Environment Variable**: `export FIGMA_ACCESS_TOKEN="figd_your_token_here"` or `export FIGMA_TOKEN="..."`
2. **Workspace `.env` File**:
   ```env
   FIGMA_ACCESS_TOKEN=figd_your_token_here
   ```

### Corporate Proxy & SSL Certificates
If you are behind a corporate proxy or firewall with self-signed SSL certificates, enable SSL verification bypass:
```env
FIGMA_IGNORE_SSL=true
```

---

## Tier 1 Quota Conservation: AST-Only by Default

> [!IMPORTANT]
> **Figma Starter plans enforce a strict limit of 20 Tier 1 requests/month.**
> Both `GET /v1/files/:key/nodes` and `GET /v1/images/:key` count as Tier 1 endpoints.
>
> 1. **Default to AST-only extraction**: Running `--spec <name>` without `-i` consumes **only 1 Tier 1 call**. The JSON AST contains 100% of layout rules (flexbox, padding, gap), dimensions, hex colors, corner radii, and text content needed for code generation.
> 2. **DO NOT pass `-i` / `--image` by default**: Only add `-i` if the user explicitly requests downloading a visual preview screenshot.
> 3. **Reuse existing specs**: If `.specs/<name>.json` exists, reuse it with **0 API calls**.

---

## Agent Execution Instructions

To extract a Figma frame or component as a specification artifact, run `fetch_figma.js` from the skill's scripts directory:

```bash
# Recommended: Atomic extraction (writes ./.specs/<name>.json - 1 Tier 1 call)
node <skill-dir>/scripts/fetch_figma.js "<FigmaURL>" --spec <name>

# Optional: With companion preview image (writes .json and .png - 2 Tier 1 calls)
node <skill-dir>/scripts/fetch_figma.js "<FigmaURL>" --spec <name> -i
```

**Script Path Resolution**:
- **Global Antigravity install**: `node ~/.gemini/config/skills/figma-extractor/scripts/fetch_figma.js "<FigmaURL>" --spec <name>`
- **Global Claude Code install**: `node ~/.claude/skills/figma-extractor/scripts/fetch_figma.js "<FigmaURL>" --spec <name>`
- **Project local install**: `node figma-extractor/scripts/fetch_figma.js "<FigmaURL>" --spec <name>`

---

## Usage & Command Formats

### 1. Atomic Spec Extraction (Recommended SDD Workflow)

Extract node metadata directly into `./.specs/`:

```bash
# Atomic AST extraction (1 Tier 1 call - recommended)
node figma-extractor/scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474" --spec card

# Optional: With rendered preview image (2 Tier 1 calls)
node figma-extractor/scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474" --spec card -i

# Shallow instances mode (collapses internal component layers into clean props)
node figma-extractor/scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474" --spec card --shallow-instances
```

### 2. Design Tokens Dictionary Mode

```bash
# Export only the file's design token dictionary (colors, spacing, radii)
node figma-extractor/scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name" --tokens > ./.specs/tokens.json
```

### 3. CLI Flags Reference

| Flag | Shorthand | Description |
| :--- | :--- | :--- |
| `--spec <name>` | | **Atomic SDD mode**: Saves `./.specs/<name>.json` (add `-i` to also download preview PNG). |
| `--image`, `--download-image` | `-i` | Download and save rendered preview image from Figma (Tier 1 call; optional). |
| `--image-path <path>` | `-o <path>` | Destination path for saved preview image (e.g. `./.specs/preview.png`). |
| `--tokens`, `--variables` | | Output only the design token dictionary (colors, spacing, radii). |
| `--shallow-instances` | | Collapse internal sub-layers of component instances into clean props. |
| `--pretty` | | Pretty-print JSON with 2-space indentation (default is compact single-line JSON). |
| `--include-tokens` | | Include full design tokens dictionary alongside node AST. |
| `--include-ids` | | Retain internal Figma node IDs on each node in the tree. |
| `--raw` | | Return full, unpruned raw Figma API AST. |
| `--depth <number>` | | Limit node tree traversal depth (e.g. `--depth 2` for top-level overview). |
| `--scale <1\|2\|3\|4>` | | Render resolution multiplier for preview images (default: `2`). |
| `--format <png\|svg\|jpg>` | | Rendered image file format (default: `png`). |
| `--no-variables` | | Skip querying `/variables/local`. |
| `--help` | `-h` | Show help message. |

---

## Output Spec Structure

### 1. Resolved Design Tokens
When a layer uses Figma variables (design tokens), the extractor attaches semantic token names alongside computed fallback values:

```json
{
  "name": "Card Container",
  "type": "FRAME",
  "layoutMode": "VERTICAL",
  "padding": { "top": 16, "right": 16, "bottom": 16, "left": 16 },
  "paddingToken": "spacing/md",
  "itemSpacing": 12,
  "itemSpacingToken": "spacing/sm",
  "cornerRadius": 8,
  "cornerRadiusToken": "radii/lg",
  "fills": [
    {
      "type": "SOLID",
      "color": "#1877F2",
      "token": "colors/brand/primary"
    }
  ]
}
```

### 2. Normalized Component Instances & Props
When an `INSTANCE` node is present, internal property hashes are converted into clean JavaScript props and linked to the master component name:

```json
{
  "name": "Submit Button",
  "type": "INSTANCE",
  "component": {
    "name": "Button",
    "variant": "Variant=Primary, Size=Large"
  },
  "props": {
    "variant": "Primary",
    "size": "Large",
    "hasIcon": true,
    "label": "Confirm Order"
  },
  "bounds": { "width": 140, "height": 44 }
}
```

---

## Error Handling & Troubleshooting

- **Token Expired / Missing (`FIGMA_TOKEN_EXPIRED_OR_INVALID` / `isTokenExpiredOrInvalid`)**:
  - Alert the user that their Figma access token is missing, invalid, or expired.
  - Instruct the user to create a token in **Figma Settings → Personal Access Tokens** and export `FIGMA_ACCESS_TOKEN=your_token` or update `.env`.
- **Node Not Found**:
  - Alert the user that the node ID could not be found in the specified file.
- **Rate Limited (`FIGMA_RATE_LIMIT_EXCEEDED` / `FIGMA_CIRCUIT_BREAKER_ACTIVE`)**:
  - Figma REST API has per-minute and monthly rate limits on Starter plans. If quota is exhausted, use the companion Zero-API Figma Desktop plugin below.

---

## Local Companion: Figma Node JSON Extractor (Figma Plugin)

For developers who prefer exporting specifications directly from Figma without configuring API access tokens or consuming REST API quotas:

A companion plugin is available in `<skill-dir>/figma-plugin/`:
* **Direct Desktop Export**: Runs locally inside Figma via `figma.currentPage.selection`.
* **Zero Configuration**: No access tokens or environment variables required.
* **Identical Schema**: Produces the exact `.specs/<name>.json` AST and `.specs/<name>.png` reference image consumed by `figma-node-builder`.

### How to Install & Use
1. **Figma Community (Recommended)**: Search for **Figma Node JSON Extractor** in Figma Community / Plugins and click **Open in...** or **Save**.
2. **Manual Installation (Backup)**: In Figma Desktop, go to **Plugins** $\rightarrow$ **Development** $\rightarrow$ **Import plugin from manifest...** and select `<skill-dir>/figma-plugin/manifest.json`.
3. **Exporting Specs**: Select any frame or component $\rightarrow$ Run **Figma Node JSON Extractor**:
   * **📋 Copy Node JSON**: Copies the clean AST specification directly to your clipboard.
   * **💾 .json**: Downloads `<name>.json`.
   * **🖼 .png**: Downloads `<name>.png` (2x preview).
   * **📦 Both (.zip)**: Downloads `<name>.specs.zip` containing both files.
