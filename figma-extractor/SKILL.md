---
name: figma-extractor
description: 'Extract compact JSON node hierarchies, design tokens, component instance props, and automated preview images from Figma using the Figma REST API. Trigger this skill whenever the user mentions Figma node extraction, provides a Figma link, asks to inspect a Figma frame/component, or requests implementing UI designs using existing components or design tokens.'
---

# Figma Extractor Skill

Extract design node metadata, component hierarchies, design tokens/variables, and rendered preview images directly from Figma via the Figma REST API. 

This skill is **Design-System Aware** and serves as a high-performance, token-efficient, zero-dependency alternative to Figma MCP servers across AI coding agents (Antigravity, OpenCode, Codex, Claude Code, Cursor, etc.).

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

## Agent Execution Instructions

To execute the extractor from the workspace or skill directory, run:

```bash
node <path-to-skill>/scripts/fetch_figma.js <FigmaURL_or_FileKey> [options]
```
*(If the skill is in the workspace root or standard skill folders, use `node scripts/fetch_figma.js`)*.

---

## Usage & Command Formats

### 1. Basic Extraction

Extract node metadata directly using a full Figma share URL or file key:

```bash
# JSON only (Compact, token-optimized AST with resolved tokens & props)
node scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474"

# JSON + Automatically download rendered PNG preview image
node scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474" --image

# Or with short flag -i
node scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474" -i

# Save preview image to a specific custom path
node scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474" -o ./.specs/preview.png
```

### 2. Design Tokens & Component Modes

```bash
# Export only the file's design token dictionary (colors, spacing, radii)
node scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name" --tokens

# Collapse internal layers of component instances (encourages using existing components)
node scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474" --shallow-instances

# Pretty-print formatted JSON (for human inspection)
node scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474" --pretty
```

### 3. CLI Flags Reference

| Flag | Shorthand | Description |
| :--- | :--- | :--- |
| `--image`, `--download-image` | `-i` | Download and save rendered preview image from Figma. |
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
4. **Visual Verification**:
   - If an image preview was downloaded (`output.image.path`), visually inspect the image file to verify component aesthetics and alignment.

---

## Error Handling & Troubleshooting

- **Token Expired / Missing (`FIGMA_TOKEN_EXPIRED_OR_INVALID` / `isTokenExpiredOrInvalid`)**:
  - Alert the user that their Figma access token is missing, invalid, or expired.
  - Instruct the user to create a token in **Figma Settings $\rightarrow$ Personal Access Tokens** and export `FIGMA_ACCESS_TOKEN=your_token` or update `.env`.
- **Node Not Found**:
  - Alert the user that the node ID could not be found in the specified file.
- **Corporate Proxy / Self-Signed SSL (`FIGMA_SSL_CERTIFICATE_ERROR`)**:
  - Instruct the user to add `FIGMA_IGNORE_SSL=true` to `.env` or export it in their environment.
- **Rate Limited (`FIGMA_RATE_LIMIT_EXCEEDED`)**:
  - Figma REST API has per-minute rate limits. Pause execution briefly before retrying.
