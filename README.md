# Skills

A curated collection of modular, production-ready skills developed for AI coding agents (such as Claude Code, OpenCode, Codex, Google Antigravity, and Cursor).

Each skill in this repository is designed to give AI assistants specialized, autonomous capabilities while maintaining:
- **Token Efficiency**: Pruning unnecessary data and noise to keep agent context windows lean and fast.
- **Zero or Minimal Dependencies**: Standalone scripts that execute on demand without fragile background daemons.
- **Domain Intelligence**: Structured, context-aware outputs (such as resolved design tokens and component props) that allow agents to generate production-quality code.

---

## Available Skills

| Skill | Description | Documentation |
| :--- | :--- | :--- |
| **[`figma-extractor`](./figma-extractor)** | Design-system-aware extractor that pulls compact UI layout trees, design tokens, component instance props, and rendered preview images directly from Figma via the REST API. | [Skill Guide](./figma-extractor/README.md) · [Agent Instructions (`SKILL.md`)](./figma-extractor/SKILL.md) |

---

## How to Use These Skills

All skills follow the open Agent Skills standard (`SKILL.md` format) and can be used across multiple AI coding assistants:

### 1. Claude Code

Claude Code supports skills both locally within a repository or globally across your user profile.

- **Project-Level Installation**:
  ```bash
  mkdir -p .claude/skills
  ln -s /path/to/skills/figma-extractor .claude/skills/figma-extractor
  ```

- **Global Installation (All Projects)**:
  ```bash
  mkdir -p ~/.claude/skills
  ln -s /path/to/skills/figma-extractor ~/.claude/skills/figma-extractor
  ```

- **Usage & Activation**:
  - **Automatic**: Claude Code inspects `SKILL.md` descriptions on startup and loads the skill automatically whenever your prompt matches (e.g. sharing a Figma URL or asking to extract UI).
  - **Manual Slash Command**: Run `/figma-extractor <FigmaURL>` directly in the chat.
  - **Project Rule Grounding**: You can guide Claude Code to consistently prioritize this skill by adding this snippet to `CLAUDE.md`:
    ```markdown
    ## Figma UI Development
    Whenever a Figma link is provided:
    1. Run the `figma-extractor` skill to pull layout, tokens, and preview images:
       node <path-to-skill>/scripts/fetch_figma.js "<FigmaURL>" -i
    2. Ground UI code in the extracted data rather than guessing CSS.
    ```

---

### 2. OpenCode

OpenCode discovers skills from project or user configuration directories, maintaining full compatibility with the open `SKILL.md` standard.

- **Project-Level Installation**:
  ```bash
  mkdir -p .opencode/skills
  ln -s /path/to/skills/figma-extractor .opencode/skills/figma-extractor
  ```
  *(Note: OpenCode also recognizes `.claude/skills/` if you share configuration across agents).*

- **Global Installation (All Projects)**:
  ```bash
  mkdir -p ~/.config/opencode/skills
  ln -s /path/to/skills/figma-extractor ~/.config/opencode/skills/figma-extractor
  ```

- **Usage & Activation**:
  - OpenCode automatically registers available skills upon startup.
  - Invoke it in conversation (e.g. *"Inspect this Figma frame and extract the layout"*) or via slash command `/figma-extractor`.

---

### 3. Codex

Codex utilizes **Progressive Disclosure** to discover skill metadata at startup and load the full instructions on demand.

- **Project-Level Installation**:
  ```bash
  mkdir -p .agents/skills
  ln -s /path/to/skills/figma-extractor .agents/skills/figma-extractor
  ```

- **Global Installation (All Projects)**:
  ```bash
  mkdir -p ~/.codex/skills
  ln -s /path/to/skills/figma-extractor ~/.codex/skills/figma-extractor
  ```

- **Usage & Activation**:
  - Codex scans `~/.codex/skills/` and `.agents/skills/` for `SKILL.md` metadata.
  - When you prompt Codex with a Figma link or design extraction task, it automatically pulls in the skill instructions and runs the bundled script.

---

### 4. Google Antigravity / Gemini CLI

Symlink or copy the skill into your Antigravity skills directory:
```bash
ln -s /path/to/skills/figma-extractor ~/.gemini/antigravity-cli/skills/figma-extractor
```
Antigravity automatically registers the skill and triggers it when relevant.

---

### 5. Manual Terminal Usage

All skills include standalone executable scripts that can be run directly from any terminal:
```bash
# Example: extract JSON layout and download preview image
node figma-extractor/scripts/fetch_figma.js "<FigmaURL>" -i
```

---

## Repository Structure

```text
skills/
├── README.md                 # Curated skills repository overview (this file)
└── figma-extractor/          # Turn Figma designs into clean UI code
    ├── SKILL.md              # Agent skill definition & guidelines
    ├── README.md             # In-depth skill documentation & CLI flags
    └── scripts/              # Standalone Node.js extraction scripts & tests
```

---

## Adding New Skills

When adding new skills to this curation:
1. Create a dedicated directory: `<skill-name>/`
2. Include a `SKILL.md` with standard YAML frontmatter (`name`, `description`) and agent instructions.
3. Provide a `README.md` with detailed skill-specific documentation and manual execution flags.
4. Keep scripts self-contained with minimal external dependencies.
5. Update this root `README.md` catalog to list the new skill.
