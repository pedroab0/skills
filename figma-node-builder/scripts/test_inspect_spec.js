#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  resolveSpecPath,
  inspectSpec,
  formatTerminalReport,
  formatMarkdownReport,
} = require('./inspect_spec.js');

console.log('--- Running Spec Inspector Unit Tests ---');

// Mock Node AST tree
const mockSpec = {
  name: 'Product Card',
  type: 'FRAME',
  bounds: { width: 360, height: 480 },
  layoutMode: 'VERTICAL',
  itemSpacing: 16,
  itemSpacingToken: 'spacing/md',
  padding: { top: 24, right: 24, bottom: 24, left: 24 },
  paddingToken: 'spacing/lg',
  cornerRadius: 12,
  cornerRadiusToken: 'radii/lg',
  fills: [{ type: 'SOLID', color: '#FFFFFF', token: 'color/surface' }],
  children: [
    {
      name: 'Badge Instance',
      type: 'INSTANCE',
      component: { name: 'Badge' },
      props: { variant: 'success', label: 'In Stock' },
    },
    {
      name: 'Title',
      type: 'TEXT',
      characters: 'Wireless Noise-Canceling Headphones',
      style: {
        fontFamily: 'Inter',
        fontSize: 20,
        fontWeight: 700,
      },
      fills: [{ type: 'SOLID', color: '#111827', token: 'color/text-primary' }],
    },
    {
      name: 'Description',
      type: 'TEXT',
      characters: 'Premium audio experience with active noise cancellation.',
      style: {
        fontFamily: 'Inter',
        fontSize: 14,
        fontWeight: 400,
      },
    },
    {
      name: 'Action Button',
      type: 'INSTANCE',
      component: { name: 'Button' },
      props: { variant: 'primary', size: 'md', hasIcon: true },
    },
    {
      name: 'Secondary Button',
      type: 'INSTANCE',
      component: { name: 'Button' },
      props: { variant: 'outline', size: 'md' },
    },
  ],
};

// 1. inspectSpec: dimensions and layout
const report = inspectSpec(mockSpec, '/mock/.specs/card.json');
assert.strictEqual(report.rootLayout.name, 'Product Card');
assert.strictEqual(report.rootLayout.width, 360);
assert.strictEqual(report.rootLayout.height, 480);
assert.strictEqual(report.rootLayout.layoutMode, 'VERTICAL');
assert.strictEqual(report.rootLayout.itemSpacing, 16);
assert.strictEqual(report.rootLayout.itemSpacingToken, 'spacing/md');
assert.strictEqual(report.rootLayout.paddingToken, 'spacing/lg');
console.log('  ✓ inspectSpec: correctly extracts root dimensions and auto-layout metrics');

// 2. inspectSpec: tokens
assert.ok(report.tokens.colors.has('color/surface'), 'Includes surface color token');
assert.ok(report.tokens.colors.has('color/text-primary'), 'Includes text color token');
assert.ok(report.tokens.spacing.has('spacing/md'), 'Includes spacing/md token');
assert.ok(report.tokens.radii.has('radii/lg'), 'Includes radii/lg token');
console.log('  ✓ inspectSpec: aggregates design tokens across colors, spacing, and radii');

// 3. inspectSpec: component instances & gaps
assert.strictEqual(report.instances.size, 2, 'Detects 2 distinct components');
assert.strictEqual(report.instances.get('Button').length, 2, 'Detects 2 Button instances');
assert.strictEqual(report.instances.get('Badge').length, 1, 'Detects 1 Badge instance');
assert.strictEqual(report.instances.get('Button')[0].variant, 'primary');
assert.strictEqual(report.instances.get('Button')[1].variant, 'outline');
console.log('  ✓ inspectSpec: aggregates component instances and variant prop shapes');

// 4. inspectSpec: typography
assert.strictEqual(report.typography.totalTextLayers, 2);
assert.ok(report.typography.fontFamilies.has('Inter'));
assert.ok(report.typography.fontSizes.has(20));
assert.ok(report.typography.fontSizes.has(14));
assert.ok(report.typography.fontWeights.has(700));
console.log('  ✓ inspectSpec: extracts font families, sizes, weights, and text samples');

// 5. formatTerminalReport & formatMarkdownReport
const terminalText = formatTerminalReport(report);
assert.ok(terminalText.includes('Product Card'));
assert.ok(terminalText.includes('Vertical Flex (Column)'));
assert.ok(terminalText.includes('<Button />'));
assert.ok(terminalText.includes('<Badge />'));
assert.ok(terminalText.includes('Component Gaps & Codebase Checklist'));
console.log('  ✓ formatTerminalReport: formats clean box-drawing terminal report');

const markdownText = formatMarkdownReport(report);
assert.ok(markdownText.includes('### 📐 Figma Spec Summary: `card.json`'));
assert.ok(markdownText.includes('`<Button />`'));
assert.ok(markdownText.includes('`spacing/md`'));
console.log('  ✓ formatMarkdownReport: formats Markdown table and component checklist');

// 6. resolveSpecPath: resolution from disk
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-test-'));
try {
  const specsSubdir = path.join(tmpDir, '.specs');
  fs.mkdirSync(specsSubdir, { recursive: true });
  const testFile = path.join(specsSubdir, 'product.json');
  fs.writeFileSync(testFile, JSON.stringify(mockSpec), 'utf8');

  // Direct path
  assert.strictEqual(resolveSpecPath(testFile), testFile);

  // Shorthand in cwd
  const origCwd = process.cwd();
  try {
    process.chdir(tmpDir);
    const expected = fs.realpathSync(path.resolve(specsSubdir, 'product.json'));
    assert.strictEqual(fs.realpathSync(resolveSpecPath('product')), expected);
    assert.strictEqual(fs.realpathSync(resolveSpecPath('.specs/product')), expected);
    assert.strictEqual(fs.realpathSync(resolveSpecPath('.specs/product.json')), expected);
    console.log('  ✓ resolveSpecPath: resolves direct files, shorthand names, and .specs/ subdirectories');
  } finally {
    process.chdir(origCwd);
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('\nResults: 6/6 Spec Inspector tests passed.\n');
