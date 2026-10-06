#!/usr/bin/env node

/**
 * Spec Inspector CLI for figma-node-builder
 * https://github.com/pedroab0/skills
 *
 * Inspects extracted Figma node specifications (.specs/*.json) and generates
 * a compact, design-system-grounded report (layout, tokens, components, gaps)
 * without requiring the agent to load the entire JSON AST into context.
 *
 * Usage:
 *   node inspect_spec.js .specs/card.json
 *   node inspect_spec.js card [--markdown] [--json]
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
  magenta: (t) => (isColorSupported ? `\x1b[35m${t}\x1b[0m` : t),
};

// -----------------------------------------------------------------------------
// Path Resolution
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// AST Traversal & Analysis
// -----------------------------------------------------------------------------

function inspectSpec(specData, specFilePath = '') {
  // 1. Locate root node
  let root = specData;
  if (specData && specData.node) {
    root = specData.node;
  } else if (specData && specData.document) {
    root = specData.document;
  }

  const stats = {
    totalNodes: 0,
    maxDepth: 0,
    typesCount: {},
  };

  const tokens = {
    colors: new Map(), // token or hex -> count
    spacing: new Map(), // token or value -> count
    radii: new Map(), // token or value -> count
    totalTokensFound: 0,
  };

  const instances = new Map(); // componentName -> Array<props>
  const typography = {
    fontFamilies: new Set(),
    fontSizes: new Set(),
    fontWeights: new Set(),
    textSamples: [],
    totalTextLayers: 0,
  };

  function addToken(type, nameOrValue, detail = '') {
    if (!nameOrValue) return;
    tokens.totalTokensFound++;
    const key = String(nameOrValue);
    const existing = tokens[type].get(key);
    if (existing) {
      existing.count++;
    } else {
      tokens[type].set(key, { count: 1, detail });
    }
  }

  // Recursive AST traversal
  function walk(node, depth = 1) {
    if (!node || typeof node !== 'object') return;

    stats.totalNodes++;
    if (depth > stats.maxDepth) stats.maxDepth = depth;

    const type = node.type || 'UNKNOWN';
    stats.typesCount[type] = (stats.typesCount[type] || 0) + 1;

    // Component Instances
    if (type === 'INSTANCE' || (node.component && node.component.name)) {
      const compName = (node.component && node.component.name) || node.name || 'Component';
      const props = node.props || {};
      if (!instances.has(compName)) {
        instances.set(compName, []);
      }
      instances.get(compName).push(props);
    }

    // Layout Tokens
    if (node.itemSpacingToken) {
      addToken('spacing', node.itemSpacingToken, `${node.itemSpacing}px`);
    }
    if (node.paddingToken) {
      addToken('spacing', node.paddingToken);
    }
    if (node.cornerRadiusToken) {
      addToken('radii', node.cornerRadiusToken, `${node.cornerRadius}px`);
    }

    // Color Fills
    if (Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.token) {
          addToken('colors', fill.token, fill.color || '');
        } else if (fill.color) {
          addToken('colors', fill.color, 'raw hex');
        }
      }
    }

    // Strokes
    if (Array.isArray(node.strokes)) {
      for (const stroke of node.strokes) {
        if (stroke.token) {
          addToken('colors', stroke.token, stroke.color || '');
        } else if (stroke.color) {
          addToken('colors', stroke.color, 'raw hex');
        }
      }
    }

    // Typography & Text
    if (type === 'TEXT') {
      typography.totalTextLayers++;
      if (node.characters && typography.textSamples.length < 5) {
        const cleanText = node.characters.trim().replace(/\s+/g, ' ');
        if (cleanText && !typography.textSamples.includes(cleanText)) {
          typography.textSamples.push(cleanText.length > 40 ? cleanText.slice(0, 37) + '...' : cleanText);
        }
      }

      const styleObj = node.style || node.typography || {};
      if (styleObj.fontFamily) typography.fontFamilies.add(styleObj.fontFamily);
      if (styleObj.fontSize) typography.fontSizes.add(Math.round(styleObj.fontSize));
      if (styleObj.fontWeight) typography.fontWeights.add(styleObj.fontWeight);
    }

    // Traverse children
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child, depth + 1);
      }
    }
  }

  walk(root, 1);

  // Companion Preview Image Resolution
  let companionImage = null;
  if (specFilePath) {
    const dir = path.dirname(specFilePath);
    const baseName = path.basename(specFilePath, '.json');
    const companionPngPath = path.join(dir, `${baseName}.png`);
    const exists = fs.existsSync(companionPngPath);
    companionImage = {
      path: companionPngPath,
      exists,
    };
  } else if (specData && specData.image && specData.image.path) {
    companionImage = {
      path: specData.image.path,
      exists: fs.existsSync(specData.image.path),
    };
  }

  // Extract Root Layout Info
  const rootLayout = {
    name: root.name || 'Root',
    type: root.type || 'FRAME',
    width: root.bounds ? root.bounds.width : null,
    height: root.bounds ? root.bounds.height : null,
    layoutMode: root.layoutMode || 'NONE',
    itemSpacing: root.itemSpacing || 0,
    itemSpacingToken: root.itemSpacingToken || null,
    padding: root.padding || null,
    paddingToken: root.paddingToken || null,
    cornerRadius: root.cornerRadius || null,
    cornerRadiusToken: root.cornerRadiusToken || null,
  };

  return {
    specFilePath,
    rootLayout,
    stats,
    tokens,
    instances,
    typography,
    companionImage,
  };
}

// -----------------------------------------------------------------------------
// Terminal Report Formatter
// -----------------------------------------------------------------------------

function formatTerminalReport(data) {
  const lines = [];
  const { rootLayout, tokens, instances, typography, companionImage, specFilePath } = data;

  const fileSize = specFilePath && fs.existsSync(specFilePath)
    ? `(${ (fs.statSync(specFilePath).size / 1024).toFixed(1) } KB)`
    : '';

  lines.push(`\n${style.bold(style.cyan('◆'))}  ${style.bold('Figma Spec Inspector')}`);
  lines.push(`${style.dim('│')}  ${style.bold('Spec:')}    ${specFilePath || 'stdin'} ${style.dim(fileSize)}`);

  if (companionImage) {
    const status = companionImage.exists ? style.green('[Found]') : style.yellow('[Missing preview image]');
    lines.push(`${style.dim('│')}  ${style.bold('Preview:')} ${companionImage.path} ${status}`);
  }
  lines.push(style.dim('│'));

  // 1. Root Dimensions & Layout
  lines.push(`${style.cyan('◇')}  ${style.bold('Root Dimensions & Layout:')}`);
  lines.push(`${style.dim('│')}  • ${style.bold('Component:')} "${rootLayout.name}" ${style.dim(`(${rootLayout.type})`)}`);

  const dimStr = rootLayout.width && rootLayout.height ? `${rootLayout.width} × ${rootLayout.height} px` : 'Fluid / Unspecified';
  lines.push(`${style.dim('│')}  • ${style.bold('Dimensions:')} ${style.cyan(dimStr)}`);

  let modeStr = 'Absolute / Static';
  if (rootLayout.layoutMode === 'VERTICAL') modeStr = 'Vertical Flex (Column)';
  else if (rootLayout.layoutMode === 'HORIZONTAL') modeStr = 'Horizontal Flex (Row)';
  lines.push(`${style.dim('│')}  • ${style.bold('Layout Mode:')} ${modeStr}`);

  if (rootLayout.padding) {
    const p = rootLayout.padding;
    const tokenStr = rootLayout.paddingToken ? ` ${style.cyan(`(${rootLayout.paddingToken})`)}` : '';
    lines.push(`${style.dim('│')}  • ${style.bold('Padding:')} T:${p.top} R:${p.right} B:${p.bottom} L:${p.left} px${tokenStr}`);
  }

  if (rootLayout.itemSpacing) {
    const tokenStr = rootLayout.itemSpacingToken ? ` ${style.cyan(`(${rootLayout.itemSpacingToken})`)}` : '';
    lines.push(`${style.dim('│')}  • ${style.bold('Item Spacing (Gap):')} ${rootLayout.itemSpacing} px${tokenStr}`);
  }

  if (rootLayout.cornerRadius) {
    const tokenStr = rootLayout.cornerRadiusToken ? ` ${style.cyan(`(${rootLayout.cornerRadiusToken})`)}` : '';
    lines.push(`${style.dim('│')}  • ${style.bold('Corner Radius:')} ${rootLayout.cornerRadius} px${tokenStr}`);
  }
  lines.push(style.dim('│'));

  // 2. Design Tokens Used
  const colorCount = tokens.colors.size;
  const spacingCount = tokens.spacing.size;
  const radiiCount = tokens.radii.size;
  const totalTokens = colorCount + spacingCount + radiiCount;

  lines.push(`${style.cyan('◇')}  ${style.bold(`Design Tokens & Colors (${totalTokens} total):`)}`);
  if (colorCount > 0) {
    const colorItems = Array.from(tokens.colors.entries())
      .slice(0, 5)
      .map(([k, v]) => `${k}${v.detail && v.detail !== 'raw hex' ? ` (${v.detail})` : ''}`)
      .join(', ');
    const more = colorCount > 5 ? style.dim(` +${colorCount - 5} more`) : '';
    lines.push(`${style.dim('│')}  • ${style.bold('Colors')} (${colorCount}): ${colorItems}${more}`);
  }
  if (spacingCount > 0) {
    const spacingItems = Array.from(tokens.spacing.keys()).join(', ');
    lines.push(`${style.dim('│')}  • ${style.bold('Spacing')} (${spacingCount}): ${spacingItems}`);
  }
  if (radiiCount > 0) {
    const radiiItems = Array.from(tokens.radii.keys()).join(', ');
    lines.push(`${style.dim('│')}  • ${style.bold('Radii')} (${radiiCount}): ${radiiItems}`);
  }
  if (totalTokens === 0) {
    lines.push(`${style.dim('│')}  • ${style.dim('No bound tokens found (raw inline values used)')}`);
  }
  lines.push(style.dim('│'));

  // 3. Component Instances
  const instanceTotal = Array.from(instances.values()).reduce((acc, arr) => acc + arr.length, 0);
  lines.push(`${style.cyan('◇')}  ${style.bold(`Component Instances (${instanceTotal} instance${instanceTotal === 1 ? '' : 's'} across ${instances.size} component${instances.size === 1 ? '' : 's'}):`)}`);

  if (instances.size > 0) {
    for (const [compName, usages] of instances.entries()) {
      lines.push(`${style.dim('│')}  • ${style.bold(style.cyan(`<${compName} />`))} ${style.dim(`(${usages.length}x)`)}`);
      // Display sample distinct prop shapes
      const propSamples = usages.slice(0, 2);
      for (const p of propSamples) {
        const propKeys = Object.keys(p);
        if (propKeys.length > 0) {
          const formattedProps = propKeys
            .map((k) => `${k}=${JSON.stringify(p[k])}`)
            .join(' ');
          lines.push(`${style.dim('│')}    ${style.dim('↳ Props:')} ${formattedProps}`);
        }
      }
    }
  } else {
    lines.push(`${style.dim('│')}  • ${style.dim('None (atomic frame / layout without external component instances)')}`);
  }
  lines.push(style.dim('│'));

  // 4. Component Gaps (Action Items for Host Codebase)
  lines.push(`${style.cyan('◇')}  ${style.bold('Component Gaps & Codebase Checklist:')}`);
  if (instances.size > 0) {
    lines.push(`${style.dim('│')}  ${style.dim('Verify these primitives exist in your project before synthesizing:')}`);
    for (const [compName, usages] of instances.entries()) {
      lines.push(`${style.dim('│')}  [ ] ${style.bold(`<${compName} />`)} ${style.dim(`(used ${usages.length} time${usages.length === 1 ? '' : 's'})`)}`);
    }
  } else {
    lines.push(`${style.dim('│')}  ${style.green('✓')} No external component dependencies required.`);
  }
  lines.push(style.dim('│'));

  // 5. Typography & Text
  if (typography.totalTextLayers > 0) {
    lines.push(`${style.cyan('◇')}  ${style.bold(`Typography & Text (${typography.totalTextLayers} layer${typography.totalTextLayers === 1 ? '' : 's'}):`)}`);
    const fonts = Array.from(typography.fontFamilies).join(', ') || 'Default';
    const sizes = Array.from(typography.fontSizes).sort((a, b) => a - b).map((s) => `${s}px`).join(', ') || 'N/A';
    const weights = Array.from(typography.fontWeights).sort().join(', ') || 'Regular';
    lines.push(`${style.dim('│')}  • ${style.bold('Fonts:')} ${fonts} ${style.dim(`| Sizes: ${sizes} | Weights: ${weights}`)}`);

    if (typography.textSamples.length > 0) {
      lines.push(`${style.dim('│')}  • ${style.bold('Content Samples:')} ${typography.textSamples.map((s) => `"${s}"`).join(', ')}`);
    }
    lines.push(style.dim('│'));
  }

  lines.push(`${style.green('✔')}  ${style.bold('Inspection complete.')} ${style.dim(`Analyzed ${data.stats.totalNodes} nodes down to depth ${data.stats.maxDepth}.`)}`);
  lines.push(`${style.dim('└')}  ${style.dim('Ready for Phase 3 (Grounded Synthesis) with figma-node-builder.')}\n`);

  return lines.join('\n');
}

// -----------------------------------------------------------------------------
// Markdown Report Formatter (For agent plans & artifacts)
// -----------------------------------------------------------------------------

function formatMarkdownReport(data) {
  const { rootLayout, tokens, instances, typography, companionImage, specFilePath } = data;
  const lines = [];

  const specName = path.basename(specFilePath || 'spec.json');
  lines.push(`### 📐 Figma Spec Summary: \`${specName}\`\n`);

  // Overview Table
  lines.push(`| Metric | Specification |`);
  lines.push(`| :--- | :--- |`);
  lines.push(`| **Component Name** | \`${rootLayout.name}\` (${rootLayout.type}) |`);
  const dimStr = rootLayout.width && rootLayout.height ? `${rootLayout.width}×${rootLayout.height}px` : 'Fluid';
  lines.push(`| **Root Dimensions** | \`${dimStr}\` |`);

  let modeStr = 'Absolute / Static';
  if (rootLayout.layoutMode === 'VERTICAL') modeStr = 'Vertical Flex (Column)';
  else if (rootLayout.layoutMode === 'HORIZONTAL') modeStr = 'Horizontal Flex (Row)';
  lines.push(`| **Layout Mode** | ${modeStr} |`);

  if (rootLayout.itemSpacing) {
    const token = rootLayout.itemSpacingToken ? ` (\`${rootLayout.itemSpacingToken}\`)` : '';
    lines.push(`| **Item Spacing (Gap)** | ${rootLayout.itemSpacing}px${token} |`);
  }

  if (companionImage) {
    const status = companionImage.exists ? '✅ Available' : '⚠️ Missing';
    lines.push(`| **Companion Image** | \`${path.basename(companionImage.path)}\` (${status}) |`);
  }
  lines.push('');

  // Design Tokens
  lines.push(`#### 🎨 Design Tokens & Styles`);
  if (tokens.colors.size > 0) {
    const colors = Array.from(tokens.colors.keys()).slice(0, 6).map((c) => `\`${c}\``).join(', ');
    lines.push(`- **Colors**: ${colors}`);
  }
  if (tokens.spacing.size > 0) {
    lines.push(`- **Spacing**: ${Array.from(tokens.spacing.keys()).map((s) => `\`${s}\``).join(', ')}`);
  }
  if (tokens.radii.size > 0) {
    lines.push(`- **Radii**: ${Array.from(tokens.radii.keys()).map((r) => `\`${r}\``).join(', ')}`);
  }
  lines.push('');

  // Component Checklist
  lines.push(`#### 🧩 Sub-Component Checklist`);
  if (instances.size > 0) {
    lines.push(`| Component | Occurrences | Sample Props | Status |`);
    lines.push(`| :--- | :--- | :--- | :--- |`);
    for (const [compName, usages] of instances.entries()) {
      const firstProps = usages[0] ? Object.keys(usages[0]).map((k) => `${k}=${JSON.stringify(usages[0][k])}`).join(' ') : 'none';
      lines.push(`| \`<${compName} />\` | ${usages.length} | \`${firstProps.slice(0, 45)}\` | \`[ ] Verify in codebase\` |`);
    }
  } else {
    lines.push(`- No external component instances detected.`);
  }
  lines.push('');

  // Typography
  if (typography.totalTextLayers > 0) {
    lines.push(`#### 🔤 Typography`);
    const fonts = Array.from(typography.fontFamilies).join(', ') || 'System default';
    const sizes = Array.from(typography.fontSizes).sort((a, b) => a - b).map((s) => `${s}px`).join(', ');
    lines.push(`- **Families**: ${fonts}`);
    lines.push(`- **Font Sizes**: ${sizes}`);
    lines.push('');
  }

  return lines.join('\n');
}

// -----------------------------------------------------------------------------
// CLI Execution
// -----------------------------------------------------------------------------

function printUsage() {
  console.log(`
Spec Inspector CLI - figma-node-builder
Summarize extracted Figma node hierarchies without loading raw JSON into agent context.

Usage:
  node inspect_spec.js <path-or-name> [options]

Arguments:
  <path-or-name>       Path to JSON spec (e.g. .specs/card.json) or shorthand (e.g. card)

Options:
  --markdown, -m       Output clean GitHub Flavored Markdown (for plans & walkthroughs)
  --json, -j           Output structured JSON summary
  --help, -h           Show this help message

Examples:
  node inspect_spec.js .specs/card.json
  node inspect_spec.js card
  node inspect_spec.js card --markdown
`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const isMarkdown = args.includes('--markdown') || args.includes('-m');
  const isJson = args.includes('--json') || args.includes('-j');
  const positional = args.filter((a) => !a.startsWith('-'));

  if (positional.length === 0) {
    console.error('Error: Missing spec file argument.');
    printUsage();
    process.exit(1);
  }

  try {
    const resolvedPath = resolveSpecPath(positional[0]);
    const rawContent = fs.readFileSync(resolvedPath, 'utf8');
    const parsedData = JSON.parse(rawContent);

    const inspection = inspectSpec(parsedData, resolvedPath);

    if (isJson) {
      console.log(JSON.stringify(inspection, (key, value) => {
        if (value instanceof Set) return Array.from(value);
        if (value instanceof Map) return Object.fromEntries(value);
        return value;
      }, 2));
    } else if (isMarkdown) {
      console.log(formatMarkdownReport(inspection));
    } else {
      console.log(formatTerminalReport(inspection));
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
  resolveSpecPath,
  inspectSpec,
  formatTerminalReport,
  formatMarkdownReport,
};
