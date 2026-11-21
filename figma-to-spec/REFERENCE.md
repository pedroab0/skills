# Figma To Spec Reference

## Contents

- CLI flags (`analyze_spec.js`)
- CLI flags (`fetch_figma.js`)
- Markdown specification blueprint
- Token setup
- Corporate proxy and SSL
- Rate-limit gate internals

## CLI flags (`analyze_spec.js`)

Analyze an extracted Figma **AST spec** (`.specs/*.json`) offline with 0 API calls and emit a layout tree, copy inventory, component matrix, design tokens, typography scale, icons, and image fills:

```bash
node "<skill-dir>/scripts/analyze_spec.js" <path-or-name> [options]
```

| Flag | Shorthand | Description |
| :--- | :--- | :--- |
| `--markdown` | `-m` | Output a structured GitHub Flavored Markdown UI spec scaffold (default workflow). |
| `--json` | `-j` | Output the full structured JSON analysis (tree, copy, instances, tokens, assets). |
| `--output [path]` | `-o [path]` | Write the UI spec (or JSON with `--json`) directly to a file (defaults to `<dir>/<name>-ui.spec.md`, or `ui.spec.md`). |
| `--max-depth <number>` | | Maximum depth for the structural layout tree (positive integer; default: `6`). |
| `--no-tree` | | Omit the structural layout tree section from the output. |
| `--help` | `-h` | Show the help message. |

## CLI flags (`fetch_figma.js`)

Used only when the user supplies a Figma URL instead of a local **AST spec** (`.specs/*.json`):

```bash
node "<skill-dir>/scripts/fetch_figma.js" <FigmaURL> --spec <name> [options]
node "<skill-dir>/scripts/fetch_figma.js" <fileKey> [nodeId] --spec <name> [options]
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

## Markdown specification blueprint

Use this structure when writing `.specs/<name>-ui.spec.md` (or `.specs/ui.spec.md` when unnamed). Include Section 6 only when working inside a host application codebase.

```markdown
# <Screen or Component Name> — UI & Functional Specification

> Source: `.specs/<name>.json` | Preview: `.specs/<name>.png` *(if present)* | Dimensions: `W × H px`

## 1. Overview
Concise summary of what this screen or component does, its primary user goal, and root layout behavior (`layoutMode`, padding, gap, alignment).

## 2. Functional & Content Breakdown
### User-Facing Regions
- **Header / Hero / Form / Footer**: role and behavior of each section.

### Copy & Text Inventory
| Layer | Text | Typography | Color / Token |
| :--- | :--- | :--- | :--- |
| `Title` | `"Confirm Order"` | Inter 20px / 600 (lh 28px) | `colors/text/primary` (`#111827`) |

### Interactive Elements & States
- Buttons, inputs, toggles, links, and inferred states (default, disabled, error, loading, empty).

## 3. Layout & Structure Tree
Indented hierarchy of containers, component instances, and key layout properties (`HORIZONTAL`/`VERTICAL`, `gap`, `padding`, `bounds`).

## 4. Component Inventory
| Component | Count | Variants / Props | Usage Context |
| :--- | :--- | :--- | :--- |
| `Button` | 2 | `variant="primary" size="large"`, `variant="ghost"` | Primary CTA & cancel action |

## 5. Design Tokens & Visual System
### Colors
- Semantic tokens (`colors/brand/primary` → `#1877F2`) separated from raw un-tokenized hex values.

### Spacing, Radii & Effects
- Bound spacing/radii tokens (`spacing/md`, `radii/lg`) and shadows/blurs.

### Typography Scale
- Unique `(family, size, weight, line-height)` combinations and usage counts.

### Icons & Image Assets
- **Icons**: normalized names (stripped of `icon/`, `ic_`, `ico-`) + dimensions.
- **Images**: layer name, dimensions, `scaleMode` (`FILL` → `object-cover`, `FIT` → `object-contain`), radius.

## 6. Codebase Mapping & Implementation Gaps *(Codebase Mode Only)*
### Detected Stack
- Framework, styling engine, UI primitive library, icon library.

### Reuse & Token Mapping
| Figma Item | Host Codebase Target | Status |
| :--- | :--- | :--- |
| `Button` | `@/components/ui/button` | Reuse |
| `colors/brand/primary` | `bg-primary` / `var(--primary)` | Mapped |
| `icon/arrow-right` | `ArrowRight` (`lucide-react`) | Resolved |

### Gaps & TODOs
- Missing components, tokens, icons, or image sources to create or confirm before implementation.

### Implementation Checklist
- [ ] Verify / create missing primitives and tokens
- [ ] Implement layout and wire props using `figma-node-builder`
- [ ] Validate with project typecheck / lint
```

## Token setup

A Figma Personal Access Token (or OAuth token) is only needed when passing a Figma URL (not required for local `.specs/*.json` files). The user creates one in **Figma Settings → Personal Access Tokens**. `fetch_figma.js` reads `FIGMA_ACCESS_TOKEN` (or `FIGMA_TOKEN`) from the environment, `.env` / `.env.local`, `~/.env`, and shell profiles.

| Platform | Command for the user |
| :--- | :--- |
| macOS / Linux | `export FIGMA_ACCESS_TOKEN="figd_your_token_here"` in `~/.zshrc` or `~/.bashrc` |
| Windows (PowerShell) | `[Environment]::SetEnvironmentVariable("FIGMA_ACCESS_TOKEN", "figd_your_token_here", "User")` |
| Any (workspace) | `FIGMA_ACCESS_TOKEN=figd_your_token_here` in `.env` |

## Corporate proxy and SSL

Behind a corporate proxy with self-signed certificates, `fetch_figma.js` fails with `FIGMA_SSL_CERTIFICATE_ERROR`. The user can disable certificate verification for Figma requests:

```env
FIGMA_IGNORE_SSL=true
```

## Rate-limit gate internals

When `fetch_figma.js` is used on a Figma URL, it protects the file quota automatically:

- **Sliding window**: at most 5 requests per minute per file key (Figma throttles at roughly 10/min).
- **Pacing**: at least 2.5 s between consecutive requests.
- **Circuit breaker**: after an HTTP 429, the lockout end time is stored in `~/.figma_ratelimit.json`. Later calls to that file key fail immediately with `FIGMA_CIRCUIT_BREAKER_ACTIVE` and send no network traffic, so the lockout is not extended.
