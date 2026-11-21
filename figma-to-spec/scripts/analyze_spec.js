#!/usr/bin/env node

/**
 * Spec Analyzer CLI for figma-to-spec
 * https://github.com/pedroab0/skills
 *
 * Deeply analyzes extracted Figma node specifications (.specs/*.json) offline
 * and generates structured Markdown or JSON reports (layout tree, full copy
 * inventory, component instances & prop matrices, design tokens, typography
 * scale, normalized icons, and image assets) without loading huge raw ASTs
 * into agent context.
 *
 * Usage:
 *   node analyze_spec.js .specs/card.json [--markdown] [--json] [--output <path>]
 *   node analyze_spec.js card --markdown --max-depth 6
 */

const fs = require('fs');
const path = require('path');

// ANSI colors & styling
const isColorSupported = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);
const style = {
  bold: (t) => (isColorSupported ? `\x1b[1m${t}\x1b[0m` : t),
  dim: (t) => (isColorSupported ? `\x1b[2m${t}\x1b[0m` : t),
  green: (t) => (isColorSupported ? `\x1b[32m${t}\x1b[0m` : t),
  cyan: (t) => (isColorSupported ? `\x1b[36m${t}\x1b[0m` : t),
  yellow: (t) => (isColorSupported ? `\x1b[33m${t}\x1b[0m` : t),
};

const DEFAULT_MAX_DEPTH = 6;
const MAX_TEXT_ENTRIES = 120;

// -----------------------------------------------------------------------------
// Path & Encoding Resolution
// -----------------------------------------------------------------------------

function decodeTextBuffer(buf) {
  if (!Buffer.isBuffer(buf)) {
    const str = String(buf || '');
    return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str;
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le', 2);
  }
  const str = buf.toString('utf8');
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str;
}

function resolveSpecPath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Please specify a specification file (e.g. .specs/card.json or card)');
  }

  const raw = inputPath.trim();
  const candidates = [
    raw,
    raw.endsWith('.json') ? raw : `${raw}.json`,
    path.join('.specs', raw),
    path.join('.specs', raw.endsWith('.json') ? raw : `${raw}.json`),
    path.join(process.cwd(), '.specs', raw.endsWith('.json') ? raw : `${raw}.json`),
  ];

  for (const c of candidates) {
    const resolved = path.resolve(c);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }

  throw new Error(`Spec file not found for "${inputPath}". Looked in:\n  • ${candidates.slice(0, 3).join('\n  • ')}`);
}

function getDefaultOutputPath(specFilePath, isJson = false) {
  const dir = specFilePath ? path.dirname(specFilePath) : path.resolve('.specs');
  const rawBase = specFilePath ? path.basename(specFilePath, path.extname(specFilePath)) : '';
  const cleanBase = rawBase.replace(/-ui\.spec$|\.spec$/i, '').trim();
  if (isJson) {
    return path.join(dir, cleanBase ? `${cleanBase}-analysis.json` : 'ui.analysis.json');
  }
  return path.join(dir, cleanBase ? `${cleanBase}-ui.spec.md` : 'ui.spec.md');
}

// -----------------------------------------------------------------------------
// Normalization & Formatting Helpers
// -----------------------------------------------------------------------------

function normalizeIconName(rawName) {
  if (!rawName || typeof rawName !== 'string') return 'icon';
  let cleaned = rawName.trim();
  cleaned = cleaned.replace(/^(?:icons?|ic|ico)[\/_\-\s]+/i, '');
  cleaned = cleaned.replace(/[\/_\s]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return cleaned || rawName.trim().toLowerCase();
}

function isIconLikeName(name) {
  if (!name || typeof name !== 'string') return false;
  return /^(?:icons?|ic|ico)[\/_\-\s]/i.test(name.trim());
}

function formatDimensions(bounds) {
  if (!bounds || (bounds.width == null && bounds.height == null)) return null;
  const w = bounds.width != null ? Math.round(bounds.width) : '?';
  const h = bounds.height != null ? Math.round(bounds.height) : '?';
  return `${w}×${h}px`;
}

function formatPadding(padding) {
  if (!padding || typeof padding !== 'object') return null;
  const { top = 0, right = 0, bottom = 0, left = 0 } = padding;
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return null;
  if (top === right && right === bottom && bottom === left) return `${top}px`;
  if (top === bottom && left === right) return `${top}px ${right}px`;
  return `${top}px ${right}px ${bottom}px ${left}px`;
}

function formatPropsSummary(props) {
  if (!props || typeof props !== 'object') return '';
  const keys = Object.keys(props);
  if (keys.length === 0) return '';
  return keys.map((k) => `${k}=${JSON.stringify(props[k])}`).join(' ');
}

function escapeMarkdownCell(str) {
  return String(str == null ? '' : str)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function getPrimaryColorSummary(fills) {
  if (!Array.isArray(fills) || fills.length === 0) return '';
  const solid = fills.find((f) => f && (f.token || f.color));
  if (!solid) return '';
  if (solid.token && solid.color) return `\`${solid.token}\` (\`${solid.color}\`)`;
  if (solid.token) return `\`${solid.token}\``;
  return `\`${solid.color}\``;
}

// -----------------------------------------------------------------------------
// Deep AST Traversal & Analysis
// -----------------------------------------------------------------------------

function analyzeSpec(specData, specFilePath = '', options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth) && options.maxDepth > 0 ? options.maxDepth : DEFAULT_MAX_DEPTH;

  if (!specData || typeof specData !== 'object' || Array.isArray(specData)) {
    throw new Error('Invalid AST spec: expected a JSON object containing a Figma node tree.');
  }

  let root = specData;
  if (specData.node && typeof specData.node === 'object') {
    root = specData.node;
  } else if (specData.document && typeof specData.document === 'object') {
    root = specData.document;
  }

  const hasNodeStructure = Boolean(
    root &&
      typeof root === 'object' &&
      (root.type || Array.isArray(root.children) || root.bounds || root.layoutMode),
  );
  if (!hasNodeStructure) {
    if (specData.tokens || specData.variables) {
      throw new Error(
        'This file is a tokens-only dictionary (no Figma node tree). Extract a frame AST spec without --tokens before running analyze_spec.js.',
      );
    }
    throw new Error(
      'Invalid AST spec: no Figma node tree found (expected top-level "node", "document", or node fields such as "type" and "children").',
    );
  }

  const meta = {
    fileKey: (specData && specData.fileKey) || null,
    fileName: (specData && specData.fileName) || null,
    nodeId: (specData && specData.nodeId) || null,
    lastModified: (specData && specData.lastModified) || null,
  };

  const stats = {
    totalNodes: 0,
    maxDepth: 0,
    typesCount: {},
  };

  const tokens = {
    semanticColors: new Map(), // token -> { hex, count, roles: Set }
    rawColors: new Map(), // hex -> { count, roles: Set }
    spacing: new Map(), // token -> { value, count }
    radii: new Map(), // token -> { value, count }
    effects: new Map(), // label -> count
  };

  const instances = new Map(); // componentName -> { count, variants: Set, propShapes: Map<string, number>, parents: Set }
  const textInventory = [];
  const typographyScale = new Map(); // key -> { fontFamily, fontSize, fontWeight, lineHeightPx, count }
  const icons = new Map(); // normalizedName -> { rawNames: Set, dimensions: Set, count }
  const images = []; // { name, dimensions, scaleMode, cornerRadius, cornerRadiusToken }
  const treeLines = [];

  function addSemanticColor(tokenName, hex, role) {
    if (!tokenName) return;
    const key = String(tokenName);
    let entry = tokens.semanticColors.get(key);
    if (!entry) {
      entry = { hex: hex || '', count: 0, roles: new Set() };
      tokens.semanticColors.set(key, entry);
    }
    entry.count++;
    if (hex && !entry.hex) entry.hex = hex;
    if (role) entry.roles.add(role);
  }

  function addRawColor(hex, role) {
    if (!hex) return;
    const key = String(hex).toUpperCase();
    let entry = tokens.rawColors.get(key);
    if (!entry) {
      entry = { count: 0, roles: new Set() };
      tokens.rawColors.set(key, entry);
    }
    entry.count++;
    if (role) entry.roles.add(role);
  }

  function addScaleToken(map, tokenName, value) {
    if (!tokenName) return;
    const key = String(tokenName);
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      if (value && !existing.value) existing.value = value;
    } else {
      map.set(key, { value: value || '', count: 1 });
    }
  }

  function recordIcon(rawName, bounds) {
    const normalized = normalizeIconName(rawName);
    let entry = icons.get(normalized);
    if (!entry) {
      entry = { rawNames: new Set(), dimensions: new Set(), count: 0 };
      icons.set(normalized, entry);
    }
    entry.count++;
    if (rawName) entry.rawNames.add(rawName);
    const dim = formatDimensions(bounds);
    if (dim) entry.dimensions.add(dim);
  }

  function formatTreeNode(node, depth) {
    const indent = '  '.repeat(depth - 1);
    const type = node.type || 'UNKNOWN';
    const name = node.name || 'Unnamed';
    const parts = [];

    if (type === 'INSTANCE' && node.component && node.component.name) {
      parts.push(`<${node.component.name} />`);
      const propStr = formatPropsSummary(node.props);
      if (propStr) parts.push(`{${propStr.slice(0, 60)}${propStr.length > 60 ? '...' : ''}}`);
    }

    if (node.layoutMode && node.layoutMode !== 'NONE') {
      const dir = node.layoutMode === 'HORIZONTAL' ? 'row' : 'col';
      const layoutBits = [dir];
      if (node.layoutWrap === 'WRAP') layoutBits.push('wrap');
      if (node.itemSpacing != null && node.itemSpacing !== 0) {
        layoutBits.push(node.itemSpacingToken ? `gap:${node.itemSpacing}px(${node.itemSpacingToken})` : `gap:${node.itemSpacing}px`);
      }
      const pad = formatPadding(node.padding);
      if (pad) {
        layoutBits.push(node.paddingToken ? `pad:${pad}(${node.paddingToken})` : `pad:${pad}`);
      }
      parts.push(`[${layoutBits.join(', ')}]`);
    }

    const dim = formatDimensions(node.bounds);
    if (dim && (depth === 1 || type === 'FRAME' || type === 'COMPONENT' || type === 'INSTANCE' || node.isSvg)) {
      parts.push(dim);
    }

    if (type === 'TEXT' && node.characters) {
      const clean = node.characters.trim().replace(/\s+/g, ' ');
      if (clean) {
        const preview = clean.length > 48 ? `${clean.slice(0, 45)}...` : clean;
        parts.push(`"${preview}"`);
      }
    }

    const suffix = parts.length > 0 ? ` — ${parts.join(' ')}` : '';
    return `${indent}- **${name}** \`${type}\`${suffix}`;
  }

  function walk(node, depth = 1, parentName = null) {
    if (!node || typeof node !== 'object') return;

    stats.totalNodes++;
    if (depth > stats.maxDepth) stats.maxDepth = depth;

    const type = node.type || 'UNKNOWN';
    stats.typesCount[type] = (stats.typesCount[type] || 0) + 1;

    if (depth <= maxDepth) {
      treeLines.push(formatTreeNode(node, depth));
    }

    // Component Instances
    const isInstance = type === 'INSTANCE' || Boolean(node.component && node.component.name);
    if (isInstance) {
      const compName = (node.component && node.component.name) || node.name || 'Component';
      let entry = instances.get(compName);
      if (!entry) {
        entry = { count: 0, variants: new Set(), propShapes: new Map(), parents: new Set() };
        instances.set(compName, entry);
      }
      entry.count++;
      if (node.component && node.component.variant) {
        entry.variants.add(node.component.variant);
      }
      const shape = formatPropsSummary(node.props) || '(default)';
      entry.propShapes.set(shape, (entry.propShapes.get(shape) || 0) + 1);
      if (parentName) entry.parents.add(parentName);

      if (isIconLikeName(compName) || isIconLikeName(node.name)) {
        recordIcon(compName || node.name, node.bounds);
      }
    }

    // Icons / Vectors
    if (type === 'VECTOR' || node.isSvg === true || (!isInstance && isIconLikeName(node.name))) {
      recordIcon(node.name || 'vector', node.bounds);
    }

    // Spacing & Radii Tokens
    if (node.itemSpacingToken) {
      addScaleToken(tokens.spacing, node.itemSpacingToken, node.itemSpacing != null ? `${node.itemSpacing}px` : '');
    }
    if (node.paddingToken) {
      const padVal = formatPadding(node.padding);
      addScaleToken(tokens.spacing, node.paddingToken, padVal || '');
    }
    if (node.cornerRadiusToken) {
      addScaleToken(tokens.radii, node.cornerRadiusToken, node.cornerRadius != null ? `${node.cornerRadius}px` : '');
    }

    // Fills (Colors + Images)
    if (Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (!fill || typeof fill !== 'object') continue;
        if (fill.type === 'IMAGE') {
          images.push({
            name: node.name || 'Image',
            dimensions: formatDimensions(node.bounds) || 'Fluid',
            scaleMode: fill.scaleMode || 'FILL',
            cornerRadius: node.cornerRadius != null ? `${node.cornerRadius}px` : null,
            cornerRadiusToken: node.cornerRadiusToken || null,
          });
        } else if (fill.token) {
          addSemanticColor(fill.token, fill.color || '', 'fill');
        } else if (fill.color) {
          addRawColor(fill.color, 'fill');
        }
      }
    }

    // Strokes
    if (Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (!stroke || typeof stroke !== 'object') continue;
        if (stroke.token) {
          addSemanticColor(stroke.token, stroke.color || '', 'stroke');
        } else if (stroke.color) {
          addRawColor(stroke.color, 'stroke');
        }
      }
    }

    // Effects
    if (Array.isArray(node.effects)) {
      for (const eff of node.effects) {
        if (!eff || typeof eff !== 'object') continue;
        const effType = eff.type || 'EFFECT';
        const parts = [effType];
        if (eff.radius != null) parts.push(`blur:${eff.radius}px`);
        if (eff.offset && (eff.offset.x != null || eff.offset.y != null)) {
          parts.push(`offset:${eff.offset.x || 0},${eff.offset.y || 0}`);
        }
        if (eff.color) parts.push(eff.color);
        const key = parts.join(' ');
        tokens.effects.set(key, (tokens.effects.get(key) || 0) + 1);
      }
    }

    // Typography & Text Inventory
    if (type === 'TEXT') {
      const styleObj = node.typography || node.style || {};
      const fontFamily = styleObj.fontFamily || 'Default';
      const fontSize = styleObj.fontSize != null ? Math.round(styleObj.fontSize) : null;
      const fontWeight = styleObj.fontWeight != null ? styleObj.fontWeight : null;
      const lineHeightPx = styleObj.lineHeightPx != null ? Math.round(styleObj.lineHeightPx) : null;

      const scaleKey = `${fontFamily}|${fontSize || ''}|${fontWeight || ''}|${lineHeightPx || ''}`;
      const existingScale = typographyScale.get(scaleKey);
      if (existingScale) {
        existingScale.count++;
      } else {
        typographyScale.set(scaleKey, {
          fontFamily,
          fontSize,
          fontWeight,
          lineHeightPx,
          count: 1,
        });
      }

      const cleanText = typeof node.characters === 'string' ? node.characters.trim().replace(/\s+/g, ' ') : '';
      if (cleanText && textInventory.length < MAX_TEXT_ENTRIES) {
        const typoSummary = [
          fontFamily,
          fontSize != null ? `${fontSize}px` : null,
          fontWeight != null ? `w${fontWeight}` : null,
          lineHeightPx != null ? `lh:${lineHeightPx}px` : null,
        ]
          .filter(Boolean)
          .join(' / ');

        textInventory.push({
          layer: node.name || 'Text',
          text: cleanText,
          typography: typoSummary,
          color: getPrimaryColorSummary(node.fills),
          parent: parentName || null,
        });
      }
    }

    // Traverse children
    if (Array.isArray(node.children)) {
      const currentName = node.name || parentName;
      for (const child of node.children) {
        walk(child, depth + 1, currentName);
      }
    }
  }

  walk(root, 1, null);

  // Companion Preview Image Resolution
  let companionImage = null;
  if (specFilePath) {
    const dir = path.dirname(specFilePath);
    const baseName = path.basename(specFilePath, '.json');
    const companionPngPath = path.join(dir, `${baseName}.png`);
    companionImage = {
      path: companionPngPath,
      exists: fs.existsSync(companionPngPath),
    };
  } else if (specData && specData.image && specData.image.path) {
    companionImage = {
      path: specData.image.path,
      exists: fs.existsSync(specData.image.path),
    };
  }

  const rootLayout = {
    name: root.name || 'Root',
    type: root.type || 'FRAME',
    width: root.bounds ? root.bounds.width : null,
    height: root.bounds ? root.bounds.height : null,
    layoutMode: root.layoutMode || 'NONE',
    layoutWrap: root.layoutWrap || null,
    primaryAxisAlignItems: root.primaryAxisAlignItems || null,
    counterAxisAlignItems: root.counterAxisAlignItems || null,
    itemSpacing: root.itemSpacing || 0,
    itemSpacingToken: root.itemSpacingToken || null,
    padding: root.padding || null,
    paddingToken: root.paddingToken || null,
    cornerRadius: root.cornerRadius || null,
    cornerRadiusToken: root.cornerRadiusToken || null,
  };

  return {
    specFilePath,
    meta,
    rootLayout,
    stats,
    treeLines,
    maxDepthUsed: maxDepth,
    textInventory,
    typographyScale,
    instances,
    tokens,
    icons,
    images,
    companionImage,
  };
}

// -----------------------------------------------------------------------------
// Markdown Specification Formatter
// -----------------------------------------------------------------------------

function formatMarkdownSpec(data, options = {}) {
  const includeTree = options.includeTree !== false;
  const {
    specFilePath,
    meta,
    rootLayout,
    stats,
    treeLines,
    maxDepthUsed,
    textInventory,
    typographyScale,
    instances,
    tokens,
    icons,
    images,
    companionImage,
  } = data;

  const lines = [];
  const specLabel = specFilePath ? path.basename(specFilePath) : 'spec.json';
  const dimStr = rootLayout.width != null && rootLayout.height != null
    ? `${Math.round(rootLayout.width)}×${Math.round(rootLayout.height)}px`
    : 'Fluid';

  let layoutModeStr = 'Absolute / Static';
  if (rootLayout.layoutMode === 'VERTICAL') layoutModeStr = 'Vertical Flex (Column)';
  else if (rootLayout.layoutMode === 'HORIZONTAL') layoutModeStr = 'Horizontal Flex (Row)';

  lines.push(`# ${rootLayout.name} — UI & Functional Specification`);
  lines.push('');

  const metaParts = [`Source: \`${specLabel}\``, `Dimensions: \`${dimStr}\``];
  if (companionImage && companionImage.exists) {
    metaParts.push(`Preview: \`${path.basename(companionImage.path)}\``);
  }
  if (meta.fileKey) {
    metaParts.push(`Figma File: \`${meta.fileKey}\`${meta.nodeId ? ` (Node \`${meta.nodeId}\`)` : ''}`);
  }
  lines.push(`> ${metaParts.join(' | ')}`);
  lines.push('');

  // 1. Overview
  lines.push('## 1. Overview');
  lines.push('');
  lines.push('| Property | Value |');
  lines.push('| :--- | :--- |');
  lines.push(`| **Root Frame** | \`${escapeMarkdownCell(rootLayout.name)}\` (\`${rootLayout.type}\`) |`);
  lines.push(`| **Dimensions** | \`${dimStr}\` |`);
  lines.push(`| **Layout Mode** | ${layoutModeStr}${rootLayout.layoutWrap === 'WRAP' ? ' (Wrap)' : ''} |`);
  if (rootLayout.padding) {
    const padStr = formatPadding(rootLayout.padding) || '0px';
    const tokenSuffix = rootLayout.paddingToken ? ` (\`${rootLayout.paddingToken}\`)` : '';
    lines.push(`| **Padding** | \`${padStr}\`${tokenSuffix} |`);
  }
  if (rootLayout.itemSpacing) {
    const tokenSuffix = rootLayout.itemSpacingToken ? ` (\`${rootLayout.itemSpacingToken}\`)` : '';
    lines.push(`| **Item Spacing (Gap)** | \`${rootLayout.itemSpacing}px\`${tokenSuffix} |`);
  }
  if (rootLayout.cornerRadius) {
    const tokenSuffix = rootLayout.cornerRadiusToken ? ` (\`${rootLayout.cornerRadiusToken}\`)` : '';
    lines.push(`| **Corner Radius** | \`${rootLayout.cornerRadius}px\`${tokenSuffix} |`);
  }
  lines.push(`| **AST Metrics** | ${stats.totalNodes} nodes (max depth ${stats.maxDepth}) |`);
  if (companionImage) {
    lines.push(`| **Companion Preview** | \`${path.basename(companionImage.path)}\` (${companionImage.exists ? 'Available' : 'Not downloaded'}) |`);
  }
  lines.push('');

  // 2. Copy & Text Inventory
  lines.push('## 2. Copy & Text Inventory');
  lines.push('');
  if (textInventory.length > 0) {
    lines.push('| Layer | Text | Typography | Color / Token |');
    lines.push('| :--- | :--- | :--- | :--- |');
    for (const item of textInventory) {
      lines.push(
        `| \`${escapeMarkdownCell(item.layer)}\` | ${escapeMarkdownCell(item.text)} | ${escapeMarkdownCell(item.typography)} | ${item.color || '—'} |`,
      );
    }
  } else {
    lines.push('_No text layers found in this specification._');
  }
  lines.push('');

  // 3. Layout & Structure Tree
  if (includeTree) {
    lines.push(`## 3. Layout & Structure Tree (up to depth ${maxDepthUsed})`);
    lines.push('');
    for (const tl of treeLines) {
      lines.push(tl);
    }
    if (stats.maxDepth > maxDepthUsed) {
      lines.push('');
      lines.push(`_Tree truncated at depth ${maxDepthUsed} of ${stats.maxDepth}. Re-run with \`--max-depth ${stats.maxDepth}\` for full depth._`);
    }
    lines.push('');
  }

  // 4. Component Inventory
  lines.push('## 4. Component Inventory');
  lines.push('');
  if (instances.size > 0) {
    lines.push('| Component | Count | Prop / Variant Shapes | Parent Contexts |');
    lines.push('| :--- | :--- | :--- | :--- |');
    for (const [compName, info] of instances.entries()) {
      const shapes = Array.from(info.propShapes.entries())
        .slice(0, 4)
        .map(([shape, cnt]) => (cnt > 1 ? `\`${escapeMarkdownCell(shape)}\` (${cnt}x)` : `\`${escapeMarkdownCell(shape)}\``))
        .join(', ');
      const parents = Array.from(info.parents).slice(0, 3).map((p) => `\`${escapeMarkdownCell(p)}\``).join(', ') || 'Root';
      lines.push(`| \`${escapeMarkdownCell(compName)}\` | ${info.count} | ${shapes} | ${parents} |`);
    }
  } else {
    lines.push('_No external component instances detected (atomic layout)._');
  }
  lines.push('');

  // 5. Design Tokens & Visual System
  lines.push('## 5. Design Tokens & Visual System');
  lines.push('');

  lines.push('### Semantic Color Tokens');
  lines.push('');
  if (tokens.semanticColors.size > 0) {
    lines.push('| Token | Fallback Hex | Roles | Uses |');
    lines.push('| :--- | :--- | :--- | :--- |');
    for (const [tokenName, info] of tokens.semanticColors.entries()) {
      lines.push(`| \`${escapeMarkdownCell(tokenName)}\` | ${info.hex ? `\`${info.hex}\`` : '—'} | ${Array.from(info.roles).join(', ')} | ${info.count} |`);
    }
  } else {
    lines.push('_No bound color tokens detected._');
  }
  lines.push('');

  if (tokens.rawColors.size > 0) {
    lines.push('### Raw / Un-tokenized Colors');
    lines.push('');
    lines.push('| Hex | Roles | Uses |');
    lines.push('| :--- | :--- | :--- |');
    for (const [hex, info] of tokens.rawColors.entries()) {
      lines.push(`| \`${hex}\` | ${Array.from(info.roles).join(', ')} | ${info.count} |`);
    }
    lines.push('');
  }

  lines.push('### Spacing, Radii & Effects');
  lines.push('');
  if (tokens.spacing.size > 0) {
    const items = Array.from(tokens.spacing.entries()).map(([k, v]) => `\`${k}\`${v.value ? ` (${v.value})` : ''} ×${v.count}`);
    lines.push(`- **Spacing Tokens**: ${items.join(', ')}`);
  }
  if (tokens.radii.size > 0) {
    const items = Array.from(tokens.radii.entries()).map(([k, v]) => `\`${k}\`${v.value ? ` (${v.value})` : ''} ×${v.count}`);
    lines.push(`- **Radius Tokens**: ${items.join(', ')}`);
  }
  if (tokens.effects.size > 0) {
    const items = Array.from(tokens.effects.entries()).map(([k, cnt]) => `\`${k}\` ×${cnt}`);
    lines.push(`- **Effects**: ${items.join(', ')}`);
  }
  if (tokens.spacing.size === 0 && tokens.radii.size === 0 && tokens.effects.size === 0) {
    lines.push('_No bound spacing, radius tokens, or effects detected._');
  }
  lines.push('');

  lines.push('### Typography Scale');
  lines.push('');
  if (typographyScale.size > 0) {
    lines.push('| Font Family | Size | Weight | Line Height | Uses |');
    lines.push('| :--- | :--- | :--- | :--- | :--- |');
    const sorted = Array.from(typographyScale.values()).sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0));
    for (const t of sorted) {
      lines.push(
        `| ${escapeMarkdownCell(t.fontFamily)} | ${t.fontSize != null ? `${t.fontSize}px` : '—'} | ${t.fontWeight != null ? t.fontWeight : '—'} | ${t.lineHeightPx != null ? `${t.lineHeightPx}px` : '—'} | ${t.count} |`,
      );
    }
  } else {
    lines.push('_No typography styles detected._');
  }
  lines.push('');

  lines.push('### Icons & Image Assets');
  lines.push('');
  if (icons.size > 0) {
    lines.push('**Icons / Vectors:**');
    lines.push('');
    lines.push('| Normalized Name | Raw Layer Name(s) | Dimensions | Uses |');
    lines.push('| :--- | :--- | :--- | :--- |');
    for (const [norm, info] of icons.entries()) {
      const rawList = Array.from(info.rawNames).slice(0, 3).map((r) => `\`${escapeMarkdownCell(r)}\``).join(', ');
      const dims = Array.from(info.dimensions).slice(0, 2).join(', ') || '—';
      lines.push(`| \`${escapeMarkdownCell(norm)}\` | ${rawList} | ${dims} | ${info.count} |`);
    }
    lines.push('');
  }
  if (images.length > 0) {
    lines.push('**Image Fills:**');
    lines.push('');
    lines.push('| Layer | Dimensions | Scale Mode | Corner Radius |');
    lines.push('| :--- | :--- | :--- | :--- |');
    for (const img of images) {
      const rad = img.cornerRadiusToken
        ? `\`${img.cornerRadiusToken}\`${img.cornerRadius ? ` (${img.cornerRadius})` : ''}`
        : img.cornerRadius || '—';
      lines.push(`| \`${escapeMarkdownCell(img.name)}\` | \`${img.dimensions}\` | \`${img.scaleMode}\` | ${rad} |`);
    }
    lines.push('');
  }
  if (icons.size === 0 && images.length === 0) {
    lines.push('_No icon vectors or image fills detected._');
    lines.push('');
  }

  return lines.join('\n');
}

// -----------------------------------------------------------------------------
// Terminal Summary Formatter
// -----------------------------------------------------------------------------

function formatTerminalSummary(data) {
  const { specFilePath, rootLayout, stats, textInventory, instances, tokens, icons, images, companionImage } = data;
  const lines = [];
  const fileSize = specFilePath && fs.existsSync(specFilePath)
    ? `(${(fs.statSync(specFilePath).size / 1024).toFixed(1)} KB)`
    : '';
  const dimStr = rootLayout.width != null && rootLayout.height != null
    ? `${Math.round(rootLayout.width)} × ${Math.round(rootLayout.height)} px`
    : 'Fluid';

  lines.push(`\n${style.bold(style.cyan('◆'))}  ${style.bold('Figma Spec Analyzer (figma-to-spec)')}`);
  lines.push(`${style.dim('│')}  ${style.bold('Spec:')}       ${specFilePath || 'inline'} ${style.dim(fileSize)}`);
  lines.push(`${style.dim('│')}  ${style.bold('Root:')}       "${rootLayout.name}" (${rootLayout.type}, ${style.cyan(dimStr)}, ${rootLayout.layoutMode})`);
  if (companionImage) {
    const status = companionImage.exists ? style.green('[Found]') : style.yellow('[Not downloaded]');
    lines.push(`${style.dim('│')}  ${style.bold('Preview:')}    ${companionImage.path} ${status}`);
  }
  lines.push(`${style.dim('│')}  ${style.bold('Nodes:')}      ${stats.totalNodes} nodes (max depth ${stats.maxDepth})`);
  lines.push(`${style.dim('│')}  ${style.bold('Components:')} ${instances.size} unique component(s)`);
  lines.push(`${style.dim('│')}  ${style.bold('Copy:')}       ${textInventory.length} text layer(s)`);
  lines.push(`${style.dim('│')}  ${style.bold('Tokens:')}     ${tokens.semanticColors.size} semantic colors, ${tokens.rawColors.size} raw hex, ${tokens.spacing.size} spacing, ${tokens.radii.size} radii`);
  lines.push(`${style.dim('│')}  ${style.bold('Assets:')}     ${icons.size} icon(s), ${images.length} image layer(s)`);
  lines.push(`${style.green('✔')}  ${style.bold('Analysis complete.')} ${style.dim('Pass --markdown or --output <path> to emit the full spec scaffold.')}\n`);

  return lines.join('\n');
}

// -----------------------------------------------------------------------------
// Serialization Helper
// -----------------------------------------------------------------------------

function serializeAnalysis(data) {
  return JSON.stringify(
    data,
    (key, value) => {
      if (value instanceof Set) return Array.from(value);
      if (value instanceof Map) return Object.fromEntries(value);
      return value;
    },
    2,
  );
}

// -----------------------------------------------------------------------------
// CLI Parsing & Execution
// -----------------------------------------------------------------------------

function printUsage() {
  console.log(`
Spec Analyzer CLI - figma-to-spec
Analyze extracted Figma JSON specs (.specs/*.json) offline to generate Markdown UI & functional specifications.

Usage:
  node analyze_spec.js <path-or-name> [options]

Arguments:
  <path-or-name>         Path to JSON spec (e.g. .specs/card.json) or shorthand (e.g. card)

Options:
  --markdown, -m         Output a structured GitHub Flavored Markdown specification scaffold
  --json, -j             Output the full structured JSON analysis
  --output [path], -o    Write output to a file (defaults to <dir>/<name>-ui.spec.md, or ui.spec.md)
  --max-depth <number>   Maximum depth for the structural layout tree (default: 6)
  --no-tree              Omit the structural layout tree section
  --help, -h             Show this help message

Examples:
  node analyze_spec.js .specs/card.json --markdown
  node analyze_spec.js card --markdown --output
  node analyze_spec.js card --markdown --output .specs/card-ui.spec.md
  node analyze_spec.js card --json
`);
}

function parseCliArgs(argv) {
  const result = {
    help: false,
    markdown: false,
    json: false,
    outputPath: null,
    maxDepth: DEFAULT_MAX_DEPTH,
    includeTree: true,
    target: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--markdown' || arg === '-m') {
      result.markdown = true;
    } else if (arg === '--json' || arg === '-j') {
      result.json = true;
    } else if (arg === '--output' || arg === '-o') {
      if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
        result.outputPath = argv[++i];
      } else {
        result.outputPath = 'AUTO';
      }
    } else if (arg === '--max-depth') {
      const nextVal = argv[i + 1];
      if (!nextVal || nextVal.startsWith('-')) {
        throw new Error('Option --max-depth requires a positive integer (e.g. --max-depth 4).');
      }
      const parsed = Number(argv[++i]);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid --max-depth value "${nextVal}". Expected a positive integer (e.g. --max-depth 4).`);
      }
      result.maxDepth = parsed;
    } else if (arg === '--no-tree') {
      result.includeTree = false;
    } else if (!arg.startsWith('-') && !result.target) {
      result.target = arg;
    }
  }

  return result;
}

function main() {
  const args = process.argv.slice(2);

  try {
    const parsed = parseCliArgs(args);

    if (args.length === 0 || parsed.help) {
      printUsage();
      process.exit(0);
    }

    if (!parsed.target) {
      console.error('Error: Missing spec file argument.');
      printUsage();
      process.exit(1);
    }

    const resolvedPath = resolveSpecPath(parsed.target);
    const rawContent = decodeTextBuffer(fs.readFileSync(resolvedPath));
    let specJson;
    try {
      specJson = JSON.parse(rawContent);
    } catch (parseErr) {
      throw new Error(`Invalid JSON in "${resolvedPath}": ${parseErr.message}`);
    }

    const analysis = analyzeSpec(specJson, resolvedPath, { maxDepth: parsed.maxDepth });

    if (parsed.outputPath) {
      const outContent = parsed.json
        ? serializeAnalysis(analysis)
        : formatMarkdownSpec(analysis, { includeTree: parsed.includeTree });
      const resolvedOut =
        parsed.outputPath === 'AUTO'
          ? getDefaultOutputPath(resolvedPath, parsed.json)
          : path.resolve(parsed.outputPath);
      const displayOut =
        parsed.outputPath === 'AUTO'
          ? path.relative(process.cwd(), resolvedOut) || resolvedOut
          : parsed.outputPath;
      fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
      fs.writeFileSync(resolvedOut, outContent, 'utf8');
      const sizeKb = (Buffer.byteLength(outContent, 'utf8') / 1024).toFixed(1);
      console.log(`✔ Wrote specification to ${displayOut} (${sizeKb} KB)`);
    } else if (parsed.json) {
      console.log(serializeAnalysis(analysis));
    } else if (parsed.markdown) {
      console.log(formatMarkdownSpec(analysis, { includeTree: parsed.includeTree }));
    } else {
      console.log(formatTerminalSummary(analysis));
    }
  } catch (err) {
    console.error(`\n✖ ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  decodeTextBuffer,
  resolveSpecPath,
  getDefaultOutputPath,
  normalizeIconName,
  analyzeSpec,
  formatMarkdownSpec,
  formatTerminalSummary,
  serializeAnalysis,
  parseCliArgs,
};
