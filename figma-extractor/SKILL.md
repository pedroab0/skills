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

To extract a Figma frame or component as a specification artifact:

```bash
# Extract JSON spec and download rendered PNG preview to ./.specs/
node <path-to-skill>/scripts/fetch_figma.js "<FigmaURL>" -i -o ./.specs/<name>.png > ./.specs/<name>.json
```
*(If the skill is in the workspace root or standard skill folders, use `node figma-extractor/scripts/fetch_figma.js`)*.

---

## Usage & Command Formats

### 1. Spec Extraction (Standard SDD Workflow)

Extract node metadata and download a rendered preview image directly:

```bash
# JSON AST + PNG visual preview saved to .specs/
node figma-extractor/scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474" -i -o ./.specs/card.png > ./.specs/card.json

# Shallow instances mode (collapses internal component layers into props)
node figma-extractor/scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name?node-id=4023-474" -i --shallow-instances -o ./.specs/card.png > ./.specs/card.json
```

### 2. Design Tokens Dictionary Mode

```bash
# Export only the file's design token dictionary (colors, spacing, radii)
node figma-extractor/scripts/fetch_figma.js "https://www.figma.com/design/:fileKey/:name" --tokens > ./.specs/tokens.json
```

### 3. CLI Flags Reference

| Flag | Shorthand | Description |
| :--- | :--- | :--- |
| `--image`, `--download-image` | `-i` | Download and save rendered preview image from Figma. |
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
- **Corporate Proxy / Self-Signed SSL (`FIGMA_SSL_CERTIFICATE_ERROR`)**:
  - Instruct the user to add `FIGMA_IGNORE_SSL=true` to `.env` or export it in their environment.
- **Rate Limited (`FIGMA_RATE_LIMIT_EXCEEDED`)**:
  - Figma REST API has per-minute rate limits. Pause execution briefly before retrying.
