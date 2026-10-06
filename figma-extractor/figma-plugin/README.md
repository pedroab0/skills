# Figma Node JSON Extractor

Inspect, copy, and export compact, design-system-aware Node JSON and high-resolution companion preview images directly from **Figma Desktop** for AI coding assistants (Claude Code, Antigravity, Cursor) and frontend engineering.

---

## Key Features

* **Design-System Aware**: Resolves layout flexbox rules (`layoutMode`, `padding`, `gap`), dimensions, hex colors, corner radii, and component variants into clean props.
* **Token-Optimized AST**: Strips vector paths, render masks, and matrix transforms, reducing payload size by up to 85% compared to raw Figma document trees.
* **Companion Preview**: Automatically renders high-resolution PNG reference images alongside the JSON contract.
* **Fast Local Handoff**: Runs locally inside your Figma client using the official Figma Plugin API (`figma.currentPage.selection`) with zero API credentials required.

---

## Installation in Figma

### Option A: Install from Figma Community (Recommended)
1. Open Figma (Desktop app or Web browser).
2. Go to **Plugins** or the **Figma Community**.
3. Search for **Figma Node JSON Extractor**.
4. Click **Open in...** or **Save** to add it to your plugin library.

### Option B: Manual Installation (Developer / Local Backup)
If you are developing locally or running from this repository:
1. Open the **Figma Desktop app**.
2. In the top-left menu, navigate to:
   $$\text{Plugins} \longrightarrow \text{Development} \longrightarrow \text{Import plugin from manifest...}$$
3. Select this file from your disk:
   ```text
   figma-extractor/figma-plugin/manifest.json
   ```
4. The plugin is now permanently loaded under **Plugins** $\rightarrow$ **Development**.

---

## How to Extract Node JSON

1. **Select any frame or component** on your canvas (e.g., Transaction Card, Navbar, Modal).
2. Right-click the element $\rightarrow$ **Plugins** $\rightarrow$ **Figma Node JSON Extractor** (or press `⌥ ⌘ P` to re-run).
3. In the plugin popup, choose your export format:
   * **📋 Copy Node JSON**: Copies the clean AST specification directly to your clipboard (ready to paste into chat).
   * **💾 .json**: Downloads `<name>.json` containing layout, dimensions, tokens, and props.
   * **🖼 .png**: Downloads the high-resolution 2x visual preview image.
   * **📦 Both (.zip)**: Downloads `<name>.specs.zip` containing both files in a single archive.
4. Place the downloaded files into your project's `./.specs/` folder:
   ```text
   my-app/
   └── .specs/
       ├── card.json
       └── card.png
   ```

---

## How to Tell Your Agent to Build the UI

Once the specification is in `./.specs/`, simply instruct your agent in Antigravity, Claude Code, or Cursor:

```text
Build the component from .specs/card.json
```

The agent will activate **`figma-node-builder`** and synthesize the component directly from the local specification contract without needing access to the Figma REST API.
