# Figma Extractor

A lightweight, zero-dependency Node.js CLI tool and agent skill that extracts design node metadata, component hierarchies, design tokens, and rendered preview images from Figma via the Figma REST API into `./.specs/`.

This skill serves as the **Specification Ingestion Layer** in a **Spec-Driven Development (SDD)** workflow.

---

## Why Replace Figma MCP?

Standard Figma MCP (Model Context Protocol) servers are often too heavy for coding tasks. They flood your model with massive, unpruned design files and lack awareness of your design system.

### Comparison Table

| Feature | Standard Figma MCP | Figma Extractor Skill |
| :--- | :--- | :--- |
| **Token Usage** | Very heavy (50k to 150k+ tokens). Dumps raw vector points, animation curves, and internal metadata. | Ultra-compact (2k to 8k tokens). Strips out 90% of noise, keeping only layout and styles. |
| **Design System** | Returns raw values (hex color codes, exact pixel sizes). | Resolves Figma Variables into semantic tokens (primary colors, spacing scale, corner radii). |
| **Component Reuse** | Dumps every internal layer of a component, causing the AI to recreate it as generic divs. | Collapses component layers into clean props, encouraging the AI to reuse your existing components. |
| **Visual Previews** | Requires multiple slow round-trips to find and download images. | Single step: extracts the layout and downloads a rendered image preview at the same time. |
| **Reliability** | Requires a persistent background daemon that can crash, hang, or disconnect. | Zero background processes. Runs on-demand as a lightweight script with zero dependencies. |

---

## When to Still Use Figma MCP

A standard MCP server is only better if:
- You need to **write** to Figma (create layers, post comments).
- Your AI environment completely blocks command-line tools.
- Your organization enforces interactive browser-based OAuth logins instead of access tokens.

---

## How It Works in SDD

The extraction happens in a simple 5-step pipeline:

1. **Authentication & Link Parsing**  
   Reads your Figma access token and automatically parses any Figma link (file, frame, or specific component).

2. **Design Token Collection**  
   Queries Figma's local variables first to build a clean dictionary of your design tokens (colors, spacing scale, border radii, and typography).

3. **Targeted Retrieval**  
   Fetches only the specific frame or component from the Figma API instead of downloading the entire canvas.

4. **Smart Cleanup & Pruning**  
   - **Removes noise**: Discards vector bezier paths, render matrices, and prototyping data.
   - **Preserves layout**: Keeps flex direction, alignment, gap, padding, dimensions, and typography.
   - **Maps tokens**: Pairs raw values with their corresponding design token names.
   - **Simplifies components**: Replaces complex internal sub-layers with a clean component name and ready-to-use props.

5. **Specification Delivery (`.specs/`)**  
   Saves the compact JSON specification (`.specs/<name>.json`) and rendered PNG preview (`.specs/<name>.png`).

---

## How to Use the Skill

### 1. Prerequisites: Create & Set Your Figma Token

#### How to Create the Token:
1. In Figma, click your profile avatar and select **Settings**.
2. Select the **Security** tab and scroll to **Personal access tokens**.
3. Click **Generate new token**, enter a description (e.g., `ai-extractor`), and ensure read access is enabled (`File content: Read`, `Variables: Read`).
4. Copy the generated token (starts with `figd_`).

#### How to Set the Token in Terminal:
Choose one of the following terminal commands:

- **Add to your project `.env` file (Recommended)**:
  ```bash
  echo 'FIGMA_ACCESS_TOKEN="figd_your_token_here"' >> .env
  ```
- **Set for current terminal session only**:
  ```bash
  export FIGMA_ACCESS_TOKEN="figd_your_token_here"
  ```
- **Persist globally across all terminal sessions (`~/.zshrc`)**:
  ```bash
  echo 'export FIGMA_ACCESS_TOKEN="figd_your_token_here"' >> ~/.zshrc && source ~/.zshrc
  ```

*(Optional: If behind a corporate proxy with self-signed SSL certificates, run `echo 'FIGMA_IGNORE_SSL=true' >> .env`).*

### 2. Invoking via AI Coding Agent (Planning / Spec Phase)

In an SDD workflow, prompt the agent during the planning phase:
> *"Extract the design specification for this Figma frame into `.specs/`: `<FigmaURL>`"*

The agent runs `fetch_figma.js`, generates the `.specs/` artifacts, and reports the extracted tokens and components without modifying any application code.

### 3. Manual Command Formats

You can also run the script directly from your terminal:

```bash
# Recommended: Atomic extraction (automatically writes ./.specs/card.json and ./.specs/card.png)
node figma-extractor/scripts/fetch_figma.js "<FigmaURL>" --spec card

# Atomic extraction with shallow instances (collapses component internals into props)
node figma-extractor/scripts/fetch_figma.js "<FigmaURL>" --spec card --shallow-instances

# Extract only design tokens dictionary (colors, spacing, radii)
node figma-extractor/scripts/fetch_figma.js "<FigmaURL>" --tokens > ./.specs/tokens.json
```

---

## Available Flags

| Flag | Shorthand | Description |
| :--- | :--- | :--- |
| `--spec <name>` | | **Atomic SDD mode**: Automatically creates `./.specs/` and saves `<name>.json` & `<name>.png`. |
| `--image`, `--download-image` | `-i` | Automatically download and save rendered preview image from Figma. |
| `--image-path <path>` | `-o <path>` | Custom destination path for saved preview image (e.g., `./.specs/card.png`). |
| `--tokens`, `--variables` | | Export only the file's design token dictionary (colors, spacing, radii). |
| `--shallow-instances` | | Collapse internal layers of component instances into clean props. |
| `--include-tokens` | | Bundle complete design tokens dictionary alongside the node tree. |
| `--include-ids` | | Retain Figma internal node IDs in the returned output. |
| `--pretty` | | Format output with readable 2-space indentation (default is compact single-line JSON). |
| `--raw` | | Return full unpruned Figma API response without filtering. |
| `--depth <number>` | | Limit node tree traversal depth (e.g., `--depth 2` for top-level layout only). |
| `--scale <1\|2\|3\|4>` | | Multiplier for rendered image resolution (default: `2`). |
| `--format <png\|svg\|jpg>` | | Image format for downloaded preview (default: `png`). |
| `--no-variables` | | Skip querying local variables to speed up extraction. |
| `--help` | `-h` | Display command usage and available flags. |

---

## Available Resources

The skill includes the following resources:

- **Agent Instruction Guide (`SKILL.md`)**: The core skill definition read by AI agents containing workflow triggers and operational boundaries (spec ingestion only).
- **Core Extraction Script (`scripts/fetch_figma.js`)**: The standalone, zero-dependency Node.js script that interfaces with the Figma REST API, resolves tokens, prunes the AST, and downloads preview images.
- **Unit Test Suite (`scripts/test_fetch_figma.js`)**: A suite of 33 automated unit tests verifying URL parsing, token formatting, component prop cleaning, and node pruning without requiring network access.
- **Reference Documentation (`README.md`)**: This guide explaining architecture, comparison, and operational flags.

---

## The SDD Specification Contract (`.specs/`)

`figma-extractor` strictly separates **Specification** from **Implementation**:
* **`.specs/<name>.json`**: The structural AST specification containing bounds, layout directions, paddings, gaps, resolved token names, and component variant props.
* **`.specs/<name>.png`**: The visual raster reference rendered directly by Figma.

This contract is subsequently consumed during the implementation phase by human developers or specialized builder skills like [`figma-node-builder`](../figma-node-builder).
