# Figma To Code

A lightweight, token-efficient skill designed for AI coding agents to turn Figma designs into clean UI code.

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

## How It Works (Step-by-Step)

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

5. **Visual Asset Download & Delivery**  
   Downloads a sharp PNG preview of the frame to a local folder and delivers the cleaned data directly to the AI agent.

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

### 2. Invoking via AI Coding Agent
Flags are **completely optional** — you do not have to specify any flags:
- **Default (No flags needed)**: Simply share a Figma link or ask the agent to inspect a frame. The agent detects the link and runs the extractor automatically with default settings (clean, token-optimized JSON).
- **Optional Guidance**: You can optionally guide the agent using natural language or by mentioning specific flags:
  - *"Inspect this frame and download a preview image"* (agent uses `--image` or `-i`).
  - *"Only extract the design tokens from this file"* (agent uses `--tokens`).
  - *"Collapse component sub-layers into props"* (agent uses `--shallow-instances`).
- **Tip (Guarantee Autonomous Invocation)**: To ensure the agent never skips the extractor and never estimates CSS without extracting, add this suggestion to your project's `GEMINI.md` or `AGENTS.md`:
  ```markdown
  ## Figma UI Development
  Whenever a Figma link is provided or you are asked to build UI from Figma:
  1. Use the `figma-to-code` skill to extract design tokens, component props, and preview images.
  2. Ground all styling and component props in the extracted data rather than guessing CSS.
  ```

### 3. Manual Command Formats
You can also run the script directly from your terminal:

```bash
# Basic JSON extraction (compact layout & styling to stdout)
node figma-to-code/scripts/fetch_figma.js "<FigmaURL>"

# JSON + automatically download a rendered image preview
node figma-to-code/scripts/fetch_figma.js "<FigmaURL>" -i

# Save preview image to a custom local path
node figma-to-code/scripts/fetch_figma.js "<FigmaURL>" -o ./.specs/preview.png

# Extract only design tokens (colors, spacing, radii)
node figma-to-code/scripts/fetch_figma.js "<FigmaURL>" --tokens

# Collapse component layers into clean props
node figma-to-code/scripts/fetch_figma.js "<FigmaURL>" -i --shallow-instances
```

---

## Available Flags

| Flag | Shorthand | Description |
| :--- | :--- | :--- |
| `--image`, `--download-image` | `-i` | Download and save rendered preview image from Figma (Tier 1 call; optional). |
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

- **Agent Instruction Guide (`SKILL.md`)**: The core skill definition read by AI agents (Antigravity, Claude Code, Cursor, Codex) containing workflow triggers and pair-programming guidelines.
- **Core Extraction Script (`scripts/fetch_figma.js`)**: The standalone, zero-dependency Node.js script that interfaces with the Figma REST API, resolves tokens, prunes the AST, and downloads preview images.
- **Unit Test Suite (`scripts/test_fetch_figma.js`)**: A suite of 39 automated unit tests verifying URL parsing, token formatting, component prop cleaning, rate-limit gates, and node pruning without requiring network access.
- **Specification Directory (`.specs/`)**: The local workspace directory where downloaded image previews are stored for multimodal visual inspection.
- **Reference Documentation (`README.md`)**: This guide explaining architecture, MCP comparison, and operational flags.

---

## How AI Agents Build UI From This Data

- **Use Existing Components**: When the output identifies a component name and props, the agent imports that component instead of building it from scratch.
- **Apply Design Tokens**: When spacing or color tokens are present, the agent applies framework classes (like Tailwind) or CSS variables instead of hardcoded numbers.
- **Match Flexbox Layout**: Layout directions, gaps, and alignments directly translate to standard CSS Flexbox or Grid properties.
- **Cross-Check Visually**: The agent inspects the downloaded preview image to ensure the final code matches the designer's intent.
