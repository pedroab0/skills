# Figma Extractor Reference

## Contents

- Token setup
- Corporate proxy and SSL
- CLI flags
- Output spec schema
- Rate-limit gate internals

## Token setup

A Figma Personal Access Token (or OAuth token) is required. The user creates one in **Figma Settings → Personal Access Tokens**. The script reads `FIGMA_ACCESS_TOKEN` (or `FIGMA_TOKEN`) from the environment, from `.env` / `.env.local` in the working directory, from `~/.env`, and from shell profiles.

| Platform | Command for the user |
| :--- | :--- |
| macOS / Linux | `export FIGMA_ACCESS_TOKEN="figd_your_token_here"` in `~/.zshrc` or `~/.bashrc` |
| Windows (PowerShell) | `[Environment]::SetEnvironmentVariable("FIGMA_ACCESS_TOKEN", "figd_your_token_here", "User")` |
| Any (workspace) | `FIGMA_ACCESS_TOKEN=figd_your_token_here` in `.env` |

## Corporate proxy and SSL

Behind a corporate proxy with self-signed certificates, the script fails with `FIGMA_SSL_CERTIFICATE_ERROR`. The user can disable certificate verification for Figma requests:

```env
FIGMA_IGNORE_SSL=true
```

## CLI flags

```bash
node "<skill-dir>/scripts/fetch_figma.js" <FigmaURL> [options]
node "<skill-dir>/scripts/fetch_figma.js" <fileKey> [nodeId] [options]
```

| Flag | Shorthand | Description |
| :--- | :--- | :--- |
| `--spec <name>` | | Save `./.specs/<name>.json` (and `<name>.png` with `-i`). Reuses an existing spec with 0 API calls. |
| `--image`, `--download-image` | `-i` | Download the rendered preview image (+1 Tier 1 call). |
| `--image-path <path>`, `--output <path>` | `-o <path>` | Destination path for the preview image (implies `--image`). |
| `--force`, `--fresh` | `-f` | Ignore the existing local spec/preview and re-fetch from Figma. |
| `--tokens`, `--variables` | | Output only the design token dictionary (colors, spacing, radii). |
| `--shallow-instances` | | Collapse internal layers of component instances into props. |
| `--include-tokens` | | Include the full design token dictionary alongside the node tree. |
| `--include-ids` | | Keep internal Figma node IDs on each node. |
| `--pretty` | | Pretty-print JSON with 2-space indentation (default is compact). |
| `--raw` | | Return the full, unpruned Figma API response. Large; avoid unless debugging. |
| `--depth <number>` | | Limit node tree traversal depth (e.g. `--depth 2` for an overview). |
| `--scale <1\|2\|3\|4>` | | Preview render scale (default: `2`). |
| `--format <png\|svg\|jpg\|pdf>` | | Preview image format (default: `png`). |
| `--no-variables` | | Skip querying `/variables/local`. |
| `--help` | `-h` | Show the help message. |

## Output spec schema

Each node keeps only properties that differ from Figma defaults. Hidden layers are dropped. Pure vector groups collapse into a single `VECTOR` node with `isSvg: true`.

| Field | Meaning |
| :--- | :--- |
| `name`, `type` | Layer name and node type (`FRAME`, `INSTANCE`, `TEXT`, `VECTOR`, ...). |
| `bounds` | `{ width, height }` render dimensions. |
| `layoutMode`, `layoutWrap`, `primaryAxisAlignItems`, `counterAxisAlignItems` | Auto-layout direction and alignment. |
| `layoutGrow`, `layoutAlign`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | Child sizing constraints. |
| `padding` / `paddingToken`, `itemSpacing` / `itemSpacingToken` | Spacing values and bound tokens. |
| `cornerRadius` / `cornerRadiusToken`, `cornerRadii` | Uniform or per-corner radius. |
| `fills`, `strokes`, `effects`, `opacity` | Paints (hex `color` + optional `token`), borders, shadows/blurs. |
| `characters`, `typography` | Text content and `fontFamily`, `fontSize`, `fontWeight`, `lineHeightPx`, `letterSpacing`, `textAlignHorizontal`, `textAlignVertical`. |
| `component`, `props` | Master component `name`/`variant` and normalized instance props. |
| `children` | Child nodes. |
| `image` | Present when `-i` was used: preview `path`, or `error`. |

### Resolved design tokens

When a layer is bound to Figma variables, the semantic token name is attached next to the computed fallback value:

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
  "fills": [{ "type": "SOLID", "color": "#1877F2", "token": "colors/brand/primary" }]
}
```

### Normalized component instances

Figma property hashes (`Label#12:3`) become clean props linked to the master component:

```json
{
  "name": "Submit Button",
  "type": "INSTANCE",
  "component": { "name": "Button", "variant": "Variant=Primary, Size=Large" },
  "props": { "variant": "Primary", "size": "Large", "hasIcon": true, "label": "Confirm Order" },
  "bounds": { "width": 140, "height": 44 }
}
```

## Rate-limit gate internals

The script protects the file quota automatically. No agent action is needed beyond the Zero-Hammer rules in `SKILL.md`.

- **Sliding window**: at most 5 requests per minute per file key (Figma throttles at roughly 10/min).
- **Pacing**: at least 2.5 s between consecutive requests.
- **Circuit breaker**: after an HTTP 429, the lockout end time is stored in `~/.figma_ratelimit.json`. Later calls to that file key fail immediately with `FIGMA_CIRCUIT_BREAKER_ACTIVE` and send no network traffic, so the lockout is not extended.
