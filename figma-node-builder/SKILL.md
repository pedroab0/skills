---
name: figma-node-builder
description: 'Builds production-ready UI components from previously extracted Figma spec files (.specs/*.json) and optional preview images (.specs/*.png), reusing the host project components, design tokens, and icon library. Works offline with no Figma API calls. Use when the user asks to implement, build, or code a component or screen from an existing .specs file, or approves implementation after a figma-extractor run.'
---

# Figma Node Builder (SDD Implementation Layer)

Builds UI code from an extracted **spec** (`.specs/<name>.json`, the pruned Figma node tree with resolved tokens and component props) and its optional preview image (`.specs/<name>.png`). Works entirely offline: no Figma API calls or tokens.

Requires Node.js >= 16.7 for the inspector script (zero dependencies, no `npm install`).

## Workflow

Copy this checklist and track your progress:

```
Implementation Progress:
- [ ] Phase 1: Discover the host project (stack, UI primitives, tokens, icons)
- [ ] Phase 2: Inspect the spec and map it to the codebase
- [ ] Phase 3: Build the component following the build rules
- [ ] Phase 4: Validate and fix
```

### Phase 1: Discover the host project

Before writing code, ground the implementation in the existing project:

1. **Framework and styling**: check `package.json` for React, Vue, Svelte, Angular, Next.js, Tailwind CSS, styled-components, or plain CSS.
2. **UI primitives**: inspect `components/ui/`, `src/components/`, or design system libraries (shadcn/ui, Radix, MUI) for reusable components (`Button`, `Input`, `Card`, `Badge`).
3. **Design tokens**: inspect `tailwind.config.*`, `theme.css`, or `globals.css` for color, spacing, and radius scales.
4. **Icons**: check `package.json` for icon packages (`lucide-react`, `@heroicons/react`, `phosphor-react`) and local icon folders (`components/icons/`, `src/assets/`, `public/`).

### Phase 2: Inspect the spec and map it to the codebase

Run the inspector instead of reading the raw JSON into context (resolve `<skill-dir>` as described below):

```bash
node "<skill-dir>/scripts/inspect_spec.js" .specs/<name>.json --markdown
```

Use `--json` instead of `--markdown` for a structured summary (or `--help` / `-h` for CLI options). Then:

- **Component instances**: match each `INSTANCE` `component.name` against existing codebase components and note its `props`.
- **Design tokens**: map each `token` (`colors/brand/primary`, `spacing/md`, `radii/lg`) to the project CSS variables or Tailwind classes.
- **Gaps**: list sub-components and tokens that do not exist yet and must be created.

Read specific parts of the raw spec only when the inspector summary is not enough.

### Phase 3: Build the component

Follow the [Build rules](#build-rules), adapting syntax to the stack detected in Phase 1.

### Phase 4: Validate and fix

1. Run the project's existing checks: `typecheck` or `lint` scripts from `package.json`, or `npx tsc --noEmit` when TypeScript is already installed. Never install new dependencies to do this.
2. If checks fail in the files you created or changed, fix them and run the checks again. Repeat until they pass.
3. Report pre-existing failures in other files instead of fixing them.
4. If `.specs/<name>.png` exists, compare it visually with the result. If it does not exist, rely strictly on the metrics in the spec.

## Build rules

1. **Reuse existing components (no div soup)**: when an `INSTANCE` matches an existing component, import and render it with the spec props. Never rebuild existing primitives from raw elements.
   ```tsx
   // Correct
   <Button variant="primary" size="large" hasIcon>Confirm Order</Button>
   // Forbidden
   <div className="flex bg-blue-500 rounded p-2 text-white">Confirm Order</div>
   ```
2. **Layout**: `layoutMode: "HORIZONTAL"` → flex row; `"VERTICAL"` → flex column; `itemSpacing` → `gap`; `padding` → padding; `primaryAxisAlignItems` / `counterAxisAlignItems` → `justify-*` / `items-*`. Prefer the matching `*Token` when present.
3. **Colors and typography**: never guess values. Use the semantic `token` when present, otherwise the exact hex `color`. Map font size, weight, and line height to existing typography tokens or classes.
4. **Icons and vectors** (`VECTOR` nodes, `isSvg: true`, or icon instances): normalize the name by stripping `icon/`, `ic_`, `ico-` (`icon/search` → `search`), then resolve in order:
   1. Local assets or components in `components/icons/`, `src/assets/`, or `public/` only (no repo-wide searches).
   2. The icon library installed in `package.json` (e.g. `import { Search } from 'lucide-react'`).
   3. An accessible placeholder with a `TODO: Missing icon 'search'` comment. Never invent raw SVG `<path d="...">` coordinates.
5. **Image fills** (`fills: [{ type: "IMAGE" }]`): apply only the spec styling (size, radius, `scaleMode: "FILL"` → `object-cover`, `"FIT"` → `object-contain`). Never fetch or invent image URLs:
   ```tsx
   {/* TODO: Add image source for 'User Avatar' (48x48) */}
   <img src="" alt="User Avatar" className="w-12 h-12 rounded-full object-cover" />
   ```

## Spec field reference

| Field | Meaning | Code mapping |
| :--- | :--- | :--- |
| `type` | `FRAME`, `INSTANCE`, `TEXT`, `VECTOR` | Container, component import, typography tag, or icon (rule 4). |
| `layoutMode` | `HORIZONTAL` / `VERTICAL` auto-layout | `flex flex-row` / `flex flex-col`. |
| `itemSpacing` / `itemSpacingToken` | Gap between children | `gap-*` or `gap: Xpx`. |
| `padding` / `paddingToken` | `{ top, right, bottom, left }` | `p-*`, `px-*`, `py-*` or `padding`. |
| `cornerRadius` / `cornerRadiusToken` | Border radius | `rounded-*` or `border-radius`. |
| `component.name` | Master component of an `INSTANCE` | Import name (`import { Button } from '@/components/ui/button'`). |
| `props` | Normalized variant and boolean props | Component props (`<Component {...props} />`). |
| `bounds` | `{ width, height }` | Sizing (`w-*`, `h-*`, `max-w-*`). |
| `fills` | `SOLID`, `IMAGE`, gradients | Background, gradient, or `<img>` (rule 5). |
| `characters` / `typography` | Text content and font metrics | Text node with mapped typography classes. |

## Resolving `<skill-dir>`

Substitute `<skill-dir>` with the directory where this skill is installed, keeping the double quotes around the script path (Windows/macOS/Linux):

- **Standard skills (`SKILL.md`)**: the parent directory of this `SKILL.md` file.
- **Cursor rule (`.cursor/rules/figma-node-builder.mdc`)**: the sibling `.cursor/skills/figma-node-builder` directory.
