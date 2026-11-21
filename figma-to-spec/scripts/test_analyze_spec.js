const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const {
  decodeTextBuffer,
  resolveSpecPath,
  getDefaultOutputPath,
  normalizeIconName,
  analyzeSpec,
  formatMarkdownSpec,
  formatTerminalSummary,
  parseCliArgs,
} = require('./analyze_spec.js');

console.log('--- Running figma-to-spec Analyzer Unit Tests ---');

// 1. decodeTextBuffer (UTF-8, UTF-8 BOM, UTF-16LE BOM)
assert.strictEqual(decodeTextBuffer(Buffer.from('{"a":1}', 'utf8')), '{"a":1}');
assert.strictEqual(decodeTextBuffer(Buffer.from('\uFEFF{"a":1}', 'utf8')), '{"a":1}');
const utf16Buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('{"a":2}', 'utf16le')]);
assert.strictEqual(decodeTextBuffer(utf16Buf), '{"a":2}');
console.log('  ✓ decodeTextBuffer: handles UTF-8, UTF-8 BOM, and UTF-16LE BOM');

// 2. normalizeIconName
assert.strictEqual(normalizeIconName('icon/arrow-up-right'), 'arrow-up-right');
assert.strictEqual(normalizeIconName('ic_search'), 'search');
assert.strictEqual(normalizeIconName('ico-chevron_left'), 'chevron-left');
assert.strictEqual(normalizeIconName('Icons/User Profile'), 'user-profile');
console.log('  ✓ normalizeIconName: strips common icon prefixes and normalizes separators');

// 3. parseCliArgs & getDefaultOutputPath
const parsedFlags = parseCliArgs(['.specs/card.json', '--markdown', '--output', '.specs/card-ui.spec.md', '--max-depth', '4', '--no-tree']);
assert.strictEqual(parsedFlags.target, '.specs/card.json');
assert.strictEqual(parsedFlags.markdown, true);
assert.strictEqual(parsedFlags.outputPath, '.specs/card-ui.spec.md');
assert.strictEqual(parsedFlags.maxDepth, 4);
assert.strictEqual(parsedFlags.includeTree, false);

const parsedAutoOut = parseCliArgs(['card', '--markdown', '--output']);
assert.strictEqual(parsedAutoOut.outputPath, 'AUTO');
assert.strictEqual(getDefaultOutputPath('/tmp/.specs/checkout.json'), '/tmp/.specs/checkout-ui.spec.md');
assert.strictEqual(getDefaultOutputPath(''), path.join(path.resolve('.specs'), 'ui.spec.md'));
assert.throws(() => parseCliArgs(['card', '--max-depth', '0']), /Invalid --max-depth/);
assert.throws(() => parseCliArgs(['card', '--max-depth', 'abc']), /Invalid --max-depth/);
assert.throws(() => parseCliArgs(['card', '--max-depth']), /requires a positive integer/);
console.log('  ✓ parseCliArgs & getDefaultOutputPath: parses all CLI flags, validates --max-depth, and resolves *-ui.spec.md / ui.spec.md defaults');

// 3b. Defensive input validation ("solve, don't punt")
assert.throws(
  () => analyzeSpec({ tokens: { colors: { primary: '#1877F2' } } }),
  /tokens-only dictionary/,
);
assert.throws(() => analyzeSpec({}), /no Figma node tree found/);
assert.throws(() => analyzeSpec(null), /expected a JSON object/);
console.log('  ✓ analyzeSpec validation: rejects tokens-only dictionaries and empty/malformed AST inputs with clear errors');

// 4. analyzeSpec & formatMarkdownSpec on rich mock AST
const mockSpec = {
  fileKey: 'ABC123XYZ',
  nodeId: '10:20',
  node: {
    name: 'Checkout Summary',
    type: 'FRAME',
    bounds: { width: 400, height: 520 },
    layoutMode: 'VERTICAL',
    itemSpacing: 16,
    itemSpacingToken: 'spacing/md',
    padding: { top: 24, right: 24, bottom: 24, left: 24 },
    paddingToken: 'spacing/lg',
    cornerRadius: 12,
    cornerRadiusToken: 'radii/lg',
    fills: [{ type: 'SOLID', color: '#FFFFFF', token: 'colors/surface/card' }],
    effects: [{ type: 'DROP_SHADOW', radius: 12, offset: { x: 0, y: 4 }, color: '#0000001A' }],
    children: [
      {
        name: 'Header',
        type: 'FRAME',
        layoutMode: 'HORIZONTAL',
        itemSpacing: 12,
        bounds: { width: 352, height: 48 },
        children: [
          {
            name: 'Avatar',
            type: 'RECTANGLE',
            bounds: { width: 48, height: 48 },
            cornerRadius: 24,
            cornerRadiusToken: 'radii/full',
            fills: [{ type: 'IMAGE', scaleMode: 'FILL' }],
          },
          {
            name: 'Title',
            type: 'TEXT',
            characters: 'Order Confirmation',
            typography: { fontFamily: 'Inter', fontSize: 20, fontWeight: 600, lineHeightPx: 28 },
            fills: [{ type: 'SOLID', color: '#111827', token: 'colors/text/primary' }],
          },
          {
            name: 'icon/arrow-right',
            type: 'VECTOR',
            isSvg: true,
            bounds: { width: 20, height: 20 },
          },
        ],
      },
      {
        name: 'Subtitle',
        type: 'TEXT',
        characters: 'Review your items before paying.',
        typography: { fontFamily: 'Inter', fontSize: 14, fontWeight: 400, lineHeightPx: 20 },
        fills: [{ type: 'SOLID', color: '#6B7280' }],
      },
      {
        name: 'Primary CTA',
        type: 'INSTANCE',
        bounds: { width: 352, height: 44 },
        component: { name: 'Button', variant: 'Variant=Primary, Size=Large' },
        props: { variant: 'Primary', size: 'Large', hasIcon: true },
        strokes: [{ type: 'SOLID', color: '#1877F2', token: 'colors/brand/primary' }],
      },
      {
        name: 'Cancel CTA',
        type: 'INSTANCE',
        bounds: { width: 352, height: 44 },
        component: { name: 'Button', variant: 'Variant=Ghost, Size=Large' },
        props: { variant: 'Ghost', size: 'Large' },
      },
    ],
  },
};

const analysis = analyzeSpec(mockSpec, '');
assert.strictEqual(analysis.rootLayout.name, 'Checkout Summary');
assert.strictEqual(analysis.rootLayout.width, 400);
assert.strictEqual(analysis.stats.totalNodes, 8);
assert.strictEqual(analysis.textInventory.length, 2);
assert.strictEqual(analysis.textInventory[0].text, 'Order Confirmation');
assert.strictEqual(analysis.textInventory[1].text, 'Review your items before paying.');
assert.strictEqual(analysis.instances.get('Button').count, 2);
assert.strictEqual(analysis.instances.get('Button').propShapes.size, 2);
assert.ok(analysis.tokens.semanticColors.has('colors/surface/card'));
assert.ok(analysis.tokens.semanticColors.has('colors/brand/primary'));
assert.ok(analysis.tokens.rawColors.has('#6B7280'));
assert.ok(analysis.tokens.spacing.has('spacing/md'));
assert.ok(analysis.tokens.radii.has('radii/lg'));
assert.strictEqual(analysis.tokens.effects.size, 1);
assert.strictEqual(analysis.typographyScale.size, 2);
assert.ok(analysis.icons.has('arrow-right'));
assert.strictEqual(analysis.images.length, 1);
assert.strictEqual(analysis.images[0].scaleMode, 'FILL');
console.log('  ✓ analyzeSpec: extracts layout, full copy inventory, instances, tokens, typography, icons, and images');

const mdOutput = formatMarkdownSpec(analysis);
assert.ok(mdOutput.includes('# Checkout Summary — UI & Functional Specification'));
assert.ok(mdOutput.includes('Order Confirmation'));
assert.ok(mdOutput.includes('Review your items before paying.'));
assert.ok(mdOutput.includes('## 3. Layout & Structure Tree'));
assert.ok(mdOutput.includes('`Button`'));
assert.ok(mdOutput.includes('`colors/surface/card`'));
assert.ok(mdOutput.includes('`#6B7280`'));
assert.ok(mdOutput.includes('`arrow-right`'));
assert.ok(mdOutput.includes('`Avatar`'));
assert.ok(mdOutput.includes('`FILL`'));

const mdNoTree = formatMarkdownSpec(analysis, { includeTree: false });
assert.ok(!mdNoTree.includes('## 3. Layout & Structure Tree'));

const termOutput = formatTerminalSummary(analysis);
assert.ok(termOutput.includes('Figma Spec Analyzer (figma-to-spec)'));
assert.ok(termOutput.includes('Checkout Summary'));
console.log('  ✓ formatMarkdownSpec & formatTerminalSummary: render complete Markdown & terminal reports');

// 5. Plugin bare-root format (no .node wrapper) + filesystem CLI execution
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-to-spec-test-'));
try {
  const specsDir = path.join(tmpDir, '.specs');
  fs.mkdirSync(specsDir, { recursive: true });
  const specPath = path.join(specsDir, 'checkout.json');
  const pngPath = path.join(specsDir, 'checkout.png');
  fs.writeFileSync(specPath, JSON.stringify(mockSpec.node), 'utf8');
  fs.writeFileSync(pngPath, 'fake-png-bytes', 'utf8');

  // resolveSpecPath direct & error
  assert.strictEqual(resolveSpecPath(specPath), specPath);
  assert.throws(() => resolveSpecPath(path.join(tmpDir, 'does-not-exist.json')), /Spec file not found/);

  // CLI --markdown --output (auto-default to .specs/checkout-ui.spec.md)
  const defaultOutMdPath = path.join(specsDir, 'checkout-ui.spec.md');
  const scriptPath = path.resolve(__dirname, 'analyze_spec.js');
  const cliOut = execSync(`node "${scriptPath}" checkout --markdown --output`, {
    cwd: tmpDir,
    encoding: 'utf8',
  });
  assert.ok(cliOut.includes('Wrote specification to'));
  assert.ok(cliOut.includes('checkout-ui.spec.md'));
  assert.ok(fs.existsSync(defaultOutMdPath));
  const writtenMd = fs.readFileSync(defaultOutMdPath, 'utf8');
  assert.ok(writtenMd.includes('checkout.png'));
  assert.ok(writtenMd.includes('Order Confirmation'));

  // CLI --json
  const jsonOut = execSync(`node "${scriptPath}" checkout --json`, {
    cwd: tmpDir,
    encoding: 'utf8',
  });
  const parsedJson = JSON.parse(jsonOut);
  assert.strictEqual(parsedJson.rootLayout.name, 'Checkout Summary');
  assert.strictEqual(parsedJson.companionImage.exists, true);
  assert.strictEqual(parsedJson.textInventory.length, 2);

  // CLI --help
  const helpOut = execSync(`node "${scriptPath}" --help`, { encoding: 'utf8' });
  assert.ok(helpOut.includes('--markdown'));
  assert.ok(helpOut.includes('--output'));
  assert.ok(helpOut.includes('--max-depth'));
  assert.ok(helpOut.includes('--no-tree'));

  // Malformed JSON CLI error message
  const badJsonPath = path.join(specsDir, 'broken.json');
  fs.writeFileSync(badJsonPath, '{not valid json', 'utf8');
  let badJsonErr = '';
  try {
    execSync(`node "${scriptPath}" "${badJsonPath}"`, { cwd: tmpDir, encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    badJsonErr = String(err.stderr || err.message);
  }
  assert.ok(badJsonErr.includes('Invalid JSON in'), 'Should print clear Invalid JSON error on malformed file');

  console.log('  ✓ CLI execution: resolves shorthand specs, detects companion .png, writes default --output, handles malformed JSON, and outputs --json');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('\nResults: 7/7 figma-to-spec analyzer tests passed.\n');
