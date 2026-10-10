---
name: figma-to-code
description: 'Directly convert Figma designs into clean, production-ready UI code in a single turn using the Figma REST API. Trigger this skill whenever the user provides a Figma link and asks to generate, code, build, or implement UI components directly without an intermediate specification review.'
---

# Figma To Code Skill

Directly convert Figma designs into clean, production-ready UI components in a single turn. 

This skill connects to the Figma REST API, extracts a compact design-system-aware AST, resolves variables into semantic design tokens, and immediately generates the target component code grounded in your project's existing design system and components.

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

## Tier 1 Quota Conservation: AST-Only by Default

> [!IMPORTANT]
> **Figma Starter plans enforce a strict limit of 20 Tier 1 requests/month.**
> Both `GET /v1/files/:key/nodes` and `GET /v1/images/:key` count as Tier 1 endpoints.
>
> 1. **Default to AST-only extraction**: Extracting AST without `-i` consumes **only 1 Tier 1 call**. The JSON AST contains 100% of layout rules (flexbox, padding, gap), dimensions, hex colors, corner radii, and text content needed for code generation.
> 2. **DO NOT pass `-i` / `--image` by default**: Only add `-i` if the user explicitly requests downloading a visual preview screenshot.

---

## Agent Execution Instructions

To extract and build UI from a Figma URL, run `fetch_figma.js` from the skill's scripts directory:

```bash
# Recommended: Extract compact AST (1 Tier 1 call)
node <skill-dir>/scripts/fetch_figma.js "<FigmaURL>"

# Optional: With companion preview image (2 Tier 1 calls)
node <skill-dir>/scripts/fetch_figma.js "<FigmaURL>" -i
```

**Script Path Resolution**:
- **Global Antigravity install**: `node ~/.gemini/config/skills/figma-to-code/scripts/fetch_figma.js "<FigmaURL>"`
- **Global Claude Code install**: `node ~/.claude/skills/figma-to-code/scripts/fetch_figma.js "<FigmaURL>"`
- **Project local install**: `node figma-to-code/scripts/fetch_figma.js "<FigmaURL>"`

---

## Usage & Command Formats

### 1. Basic One-Shot Code Generation

```bash
# Standard extraction (1 Tier 1 call - recommended)
node figma-to-code/scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474"

# Optional: With preview image (2 Tier 1 calls)
node figma-to-code/scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474" -i

# Collapse internal layers of component instances into props (guides agent to reuse existing components)
node figma-to-code/scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474" --shallow-instances
```

### 2. CLI Flags Reference

| Flag | Shorthand | Description |
| :--- | :--- | :--- |
| `--image`, `--download-image` | `-i` | Download and save rendered preview image from Figma (Tier 1 call; optional). |
| `--image-path <path>` | `-o <path>` | Custom local file path to save preview image (implies `--image`). |
| `--tokens`, `--variables` | | Output only the design token dictionary (colors, spacing, radii) for theme setup. |
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

## Output Structure & Design-System Awareness

### 1. Resolved Design Tokens
When a layer uses Figma variables (design tokens), the extractor attaches semantic token names alongside the computed values:

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

## How to Build Components from the Extracted Data

When synthesizing code from the output:

1. **Using Existing UI Components**:
   - For `INSTANCE` nodes with resolved `component.name` and `props`:
     - Check if your codebase already has this component (e.g. `<Button />`, `<Input />`, `<Modal />`).
     - Directly render: `<Button variant="primary" size="large" hasIcon>Confirm Order</Button>` instead of building raw HTML divs.
2. **Applying Semantic Design Tokens**:
   - When a `token` is present (e.g., `colors/brand/primary`, `spacing/md`):
     - Map to your project's Tailwind class (`bg-brand-primary`, `p-md`, `rounded-lg`) or CSS variable (`var(--color-brand-primary)`).
     - Avoid hardcoding hex colors or pixel values when tokens are available.
3. **Layout & Flexbox**:
   - `HORIZONTAL` $\rightarrow$ `flex flex-row` (`display: flex; flex-direction: row;`).
   - `VERTICAL` $\rightarrow$ `flex flex-col` (`display: flex; flex-direction: column;`).
   - `itemSpacing` $\rightarrow$ CSS `gap`.
   - `primaryAxisAlignItems` & `counterAxisAlignItems` $\rightarrow$ `justify-*` and `items-*`.
4. **Icon & Vector Resolution Hierarchy**:
   - For `VECTOR` nodes or icon instances, normalize the name (strip prefixes `icon/`, `ic_`, `ico-`).
   - **Step 1 (Targeted Local Assets/Components)**: Look for matching files in `components/icons/`, `src/assets/`, or `public/` (e.g. `<SearchIcon />`, `/icons/search.svg`). Avoid unbounded repo searches.
   - **Step 2 (Installed Icon Library)**: If not found, import from packages in `package.json` (e.g., `lucide-react`, `@heroicons/react`).
   - **Step 3 (Semantic Fallback)**: If not found, render an accessible placeholder (`<span className="..." aria-hidden="true" />`) with a `TODO: Missing icon 'name'` comment. Never hallucinate raw SVG `<path d="...">` coordinates.
5. **Image Layer Handling (`fills: [{ type: "IMAGE" }]`)**:
   - Focus exclusively on applying the exact styling from the Figma spec: dimensions (`width`, `height`), border radius (`rounded-*`), and scale mode (`scaleMode: "FILL"` $\rightarrow$ `object-cover`, `"FIT"` $\rightarrow$ `object-contain`).
   - Do **NOT** attempt to resolve, fetch, or hallucinate image files or external URLs (never invent Unsplash or third-party links).
   - Render a standard `<img>` tag with `src=""` and a concise `TODO` comment specifying the target image layer.
6. **Visual Verification**:
   - Inspect the downloaded preview image (`output.image.path`) to ensure pixel-perfect fidelity.

---

## Error Handling & Troubleshooting

- **Token Expired / Missing (`FIGMA_TOKEN_EXPIRED_OR_INVALID` / `isTokenExpiredOrInvalid`)**:
  - Alert the user that their Figma access token is missing, invalid, or expired.
  - Instruct the user to create a token in **Figma Settings $\rightarrow$ Personal Access Tokens** and export `FIGMA_ACCESS_TOKEN=your_token` or update `.env`.
- **Node Not Found**:
  - Alert the user that the node ID could not be found in the specified file.
- **Corporate Proxy / Self-Signed SSL (`FIGMA_SSL_CERTIFICATE_ERROR`)**:
  - Instruct the user to add `FIGMA_IGNORE_SSL=true` to `.env` or export it in their environment.
- **Rate Limited (`FIGMA_RATE_LIMIT_EXCEEDED` / `FIGMA_CIRCUIT_BREAKER_ACTIVE`)**:
  - Figma REST API has strict per-minute and monthly rate limits. If rate limited or the circuit breaker trips, report the cooldown to the user and suggest duplicating the file in Figma Drafts to get a fresh URL.
