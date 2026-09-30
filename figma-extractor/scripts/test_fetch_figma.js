#!/usr/bin/env node

const assert = require('assert');
const {
  loadEnv,
  parseEnvLine,
  parseFigmaUrl,
  normalizeNodeId,
  getAuthHeaders,
  formatRgba,
  simplifyFills,
  normalizePropKey,
  normalizeComponentProps,
  buildVariableMap,
  pruneFigmaNode,
  parseArguments,
  formatApiError,
} = require('./fetch_figma.js');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('--- Running Figma Extractor Unit Tests ---');

// 0. Environment Parsing Tests
test('parseEnvLine: parses double-quoted value and strips trailing comments', () => {
  const line = 'export FIGMA_ACCESS_TOKEN="figd_abc123" # personal token';
  const res = parseEnvLine(line);
  assert.deepStrictEqual(res, { key: 'FIGMA_ACCESS_TOKEN', val: 'figd_abc123' });
});

test('parseEnvLine: parses single-quoted value and strips trailing comments', () => {
  const line = "FIGMA_ACCESS_TOKEN='figd_xyz789' # comment with quotes";
  const res = parseEnvLine(line);
  assert.deepStrictEqual(res, { key: 'FIGMA_ACCESS_TOKEN', val: 'figd_xyz789' });
});

test('parseEnvLine: parses unquoted value and strips trailing comments', () => {
  const line = 'FIGMA_ACCESS_TOKEN=figd_plain_token # dev token';
  const res = parseEnvLine(line);
  assert.deepStrictEqual(res, { key: 'FIGMA_ACCESS_TOKEN', val: 'figd_plain_token' });
});

test('parseEnvLine: parses value containing equal sign', () => {
  const line = 'FIGMA_OAUTH="abc=123=xyz"';
  const res = parseEnvLine(line);
  assert.deepStrictEqual(res, { key: 'FIGMA_OAUTH', val: 'abc=123=xyz' });
});

test('parseEnvLine: returns null for comments, empty lines, and lines without equal sign', () => {
  assert.strictEqual(parseEnvLine('# FIGMA_TOKEN=123'), null);
  assert.strictEqual(parseEnvLine(''), null);
  assert.strictEqual(parseEnvLine('export FIGMA_TOKEN'), null);
});

// 1. URL Parsing Tests
test('parseFigmaUrl: extracts fileKey and nodeId with hyphens', () => {
  const url = 'https://www.figma.com/design/1KP9pVQ1ptZzHa3Gcpr6ta/Consulta-e-pagamento?node-id=4023-474&t=abcd';
  const res = parseFigmaUrl(url);
  assert.strictEqual(res.fileKey, '1KP9pVQ1ptZzHa3Gcpr6ta');
  assert.strictEqual(res.nodeId, '4023:474');
});

test('parseFigmaUrl: handles /file/ URL with encoded colon', () => {
  const url = 'https://www.figma.com/file/ABCD1234efgh5678ijkl/Design-System?node-id=0%3A1';
  const res = parseFigmaUrl(url);
  assert.strictEqual(res.fileKey, 'ABCD1234efgh5678ijkl');
  assert.strictEqual(res.nodeId, '0:1');
});

test('parseFigmaUrl: handles /board/ FigJam URL', () => {
  const url = 'https://www.figma.com/board/FigJamKey1234567890/Sticky-Notes?node-id=10-20';
  const res = parseFigmaUrl(url);
  assert.strictEqual(res.fileKey, 'FigJamKey1234567890');
  assert.strictEqual(res.nodeId, '10:20');
});

test('parseFigmaUrl: handles URL without node-id', () => {
  const url = 'https://www.figma.com/design/1KP9pVQ1ptZzHa3Gcpr6ta/App-Design';
  const res = parseFigmaUrl(url);
  assert.strictEqual(res.fileKey, '1KP9pVQ1ptZzHa3Gcpr6ta');
  assert.strictEqual(res.nodeId, null);
});

// 2. Node ID Normalization Tests
test('normalizeNodeId: preserves colons and converts hyphens', () => {
  assert.strictEqual(normalizeNodeId('4023-474'), '4023:474');
  assert.strictEqual(normalizeNodeId('0:1'), '0:1');
  assert.strictEqual(normalizeNodeId('4023:474'), '4023:474');
  assert.strictEqual(normalizeNodeId('0-0'), '0:0');
  assert.strictEqual(normalizeNodeId('0%3A1'), '0:1');
  assert.strictEqual(normalizeNodeId(':123:456:'), '123:456');
  assert.strictEqual(normalizeNodeId(null), null);
});

// 3. Auth Headers Tests
test('getAuthHeaders: legacy PAT uses X-Figma-Token', () => {
  const headers = getAuthHeaders('figma_pat_123456789');
  assert.deepStrictEqual(headers, { 'X-Figma-Token': 'figma_pat_123456789' });
});

test('getAuthHeaders: figd_ PAT token uses X-Figma-Token', () => {
  const headers = getAuthHeaders('figd_abcdef123456');
  assert.deepStrictEqual(headers, { 'X-Figma-Token': 'figd_abcdef123456' });
});

test('getAuthHeaders: Bearer prefix token passes through', () => {
  const headers = getAuthHeaders('Bearer custom_oauth_token');
  assert.deepStrictEqual(headers, { Authorization: 'Bearer custom_oauth_token' });
});

// 4. Color formatting Tests
test('formatRgba: converts solid colors to uppercase HEX', () => {
  assert.strictEqual(formatRgba({ r: 1, g: 0, b: 0, a: 1 }), '#FF0000');
  assert.strictEqual(formatRgba({ r: 0, g: 1, b: 0, a: 1 }), '#00FF00');
  assert.strictEqual(formatRgba({ r: 0, g: 0, b: 1, a: 1 }), '#0000FF');
});

test('formatRgba: converts semi-transparent colors to rgba string', () => {
  const rgba = formatRgba({ r: 0, g: 0.5, b: 1, a: 0.8 });
  assert.strictEqual(rgba, 'rgba(0, 128, 255, 0.8)');
});

test('formatRgba: combines color.a and fill opacity correctly', () => {
  const rgba = formatRgba({ r: 1, g: 0, b: 0, a: 1 }, 0.5);
  assert.strictEqual(rgba, 'rgba(255, 0, 0, 0.5)');
});

test('formatRgba: clamps RGB values below 0 and above 1', () => {
  assert.strictEqual(formatRgba({ r: -0.1, g: 1.2, b: 0.5, a: 1 }), '#00FF80');
});

test('formatRgba: clamps alpha values above 1', () => {
  assert.strictEqual(formatRgba({ r: 1, g: 0, b: 0, a: 1.5 }, 1.2), '#FF0000');
});

// 5. Component Props Normalization Tests
test('normalizePropKey: strips hash and converts to camelCase', () => {
  assert.strictEqual(normalizePropKey('Variant#1234:56'), 'variant');
  assert.strictEqual(normalizePropKey('Has Icon#402:1'), 'hasIcon');
  assert.strictEqual(normalizePropKey('Button Size#999'), 'buttonSize');
  assert.strictEqual(normalizePropKey('state'), 'state');
});

test('normalizePropKey: handles Unicode letters and Portuguese/Spanish accents', () => {
  assert.strictEqual(normalizePropKey('Opção Selecionada'), 'opçãoSelecionada');
  assert.strictEqual(normalizePropKey('Ícone Ativo#123'), 'íconeAtivo');
  assert.strictEqual(normalizePropKey('Configuração Geral'), 'configuraçãoGeral');
  assert.strictEqual(normalizePropKey('Has Icon?'), 'hasIcon');
});

test('normalizeComponentProps: cleans values and keys', () => {
  const rawProps = {
    'Variant#123': { type: 'VARIANT', value: 'Primary' },
    'Has Icon#456': { type: 'BOOLEAN', value: true },
    'Label#789': { type: 'TEXT', value: 'Confirm Order' },
  };
  const cleaned = normalizeComponentProps(rawProps);
  assert.deepStrictEqual(cleaned, {
    variant: 'Primary',
    hasIcon: true,
    label: 'Confirm Order',
  });
});

// 6. Figma Variables / Token Mapping Tests
test('buildVariableMap: formats tokens dictionary and lookup map', () => {
  const mockMeta = {
    variables: {
      'VariableID:100': {
        id: 'VariableID:100',
        name: 'colors/brand/primary',
        resolvedType: 'COLOR',
        variableSetId: 'Set:1',
        valuesByMode: { 'Mode:1': { r: 0.1, g: 0.5, b: 0.9, a: 1 } },
      },
      'VariableID:200': {
        id: 'VariableID:200',
        name: 'spacing/md',
        resolvedType: 'FLOAT',
        variableSetId: 'Set:1',
        valuesByMode: { 'Mode:1': 16 },
      },
    },
    variableSets: {
      'Set:1': { id: 'Set:1', name: 'Default', defaultModeId: 'Mode:1' },
    },
  };

  const { varMap, dictionary } = buildVariableMap(mockMeta);
  assert.strictEqual(varMap['VariableID:100'].name, 'colors/brand/primary');
  assert.strictEqual(dictionary.colors['colors/brand/primary'], '#1A80E6');
  assert.strictEqual(dictionary.spacing['spacing/md'], 16);
});

// 7. AST Pruning & Token Attachment Tests
test('pruneFigmaNode: resolves variables and component instance', () => {
  const instanceNode = {
    id: '4023:474',
    name: 'Primary Button Instance',
    type: 'INSTANCE',
    componentId: 'Comp:10',
    componentProperties: {
      'Variant#1': { type: 'VARIANT', value: 'Primary' },
      'Size#2': { type: 'VARIANT', value: 'Large' },
    },
    layoutMode: 'HORIZONTAL',
    itemSpacing: 12,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 12,
    paddingBottom: 12,
    cornerRadius: 8,
    fills: [
      {
        type: 'SOLID',
        color: { r: 0.1, g: 0.5, b: 0.9, a: 1 },
      },
    ],
    boundVariables: {
      fills: [{ type: 'VARIABLE_ALIAS', id: 'VariableID:100' }],
      itemSpacing: { type: 'VARIABLE_ALIAS', id: 'VariableID:200' },
      cornerRadius: { type: 'VARIABLE_ALIAS', id: 'VariableID:300' },
    },
    absoluteBoundingBox: { width: 140, height: 44, x: 10, y: 20 },
    // Bloated fields:
    fillGeometry: [{ path: 'M0 0' }],
    vectorData: {},
  };

  const context = {
    varMap: {
      'VariableID:100': { name: 'colors/brand/primary', resolvedType: 'COLOR' },
      'VariableID:200': { name: 'spacing/sm', resolvedType: 'FLOAT' },
      'VariableID:300': { name: 'radii/md', resolvedType: 'FLOAT' },
    },
    components: {
      'Comp:10': { id: 'Comp:10', name: 'Variant=Primary, Size=Large', componentSetId: 'Set:Button' },
    },
    componentSets: {
      'Set:Button': { id: 'Set:Button', name: 'Button' },
    },
  };

  const pruned = pruneFigmaNode(instanceNode, context);

  // Component & props resolution
  assert.strictEqual(pruned.component.name, 'Button');
  assert.deepStrictEqual(pruned.props, { variant: 'Primary', size: 'Large' });

  // Token resolution
  assert.strictEqual(pruned.fills[0].color, '#1A80E6');
  assert.strictEqual(pruned.fills[0].token, 'colors/brand/primary');
  assert.strictEqual(pruned.itemSpacingToken, 'spacing/sm');
  assert.strictEqual(pruned.cornerRadiusToken, 'radii/md');

  // Bloated fields stripped
  assert.strictEqual(pruned.fillGeometry, undefined);
  assert.strictEqual(pruned.vectorData, undefined);
});

test('pruneFigmaNode: --shallow-instances collapses children of instances', () => {
  const instanceWithChildren = {
    id: '4023:474',
    name: 'Button',
    type: 'INSTANCE',
    componentProperties: { 'Label#1': { value: 'Click' } },
    absoluteBoundingBox: { width: 120, height: 40 },
    children: [
      { id: '1', name: 'Icon Frame', type: 'FRAME', children: [] },
      { id: '2', name: 'Label', type: 'TEXT', characters: 'Click' },
    ],
  };

  const shallow = pruneFigmaNode(instanceWithChildren, {}, { shallowInstances: true });
  assert.strictEqual(shallow.type, 'INSTANCE');
  assert.deepStrictEqual(shallow.props, { label: 'Click' });
  assert.strictEqual(shallow.children, undefined);
  assert.strictEqual(shallow.bounds.width, 120);
});

// 8. Argument Parsing Tests
test('parseArguments: --tokens and --shallow-instances flags', () => {
  const argv = [
    'node',
    'fetch_figma.js',
    'https://www.figma.com/design/xyz123/Test?node-id=1-2',
    '--tokens',
    '--shallow-instances',
  ];
  const res = parseArguments(argv);
  assert.strictEqual(res.fileKey, 'xyz123');
  assert.strictEqual(res.tokensOnly, true);
  assert.strictEqual(res.shallowInstances, true);
});

test('parseArguments: --pretty, --include-tokens, and --include-ids flags', () => {
  const argv = [
    'node',
    'fetch_figma.js',
    'https://www.figma.com/design/xyz123/Test?node-id=1-2',
    '--pretty',
    '--include-tokens',
    '--include-ids',
  ];
  const res = parseArguments(argv);
  assert.strictEqual(res.pretty, true);
  assert.strictEqual(res.includeTokens, true);
  assert.strictEqual(res.includeIds, true);
});

test('parseArguments: -i, --image, and -o flags', () => {
  const argv1 = ['node', 'fetch_figma.js', 'https://www.figma.com/design/xyz123/Test?node-id=1-2', '-i'];
  assert.strictEqual(parseArguments(argv1).downloadImage, true);

  const argv2 = ['node', 'fetch_figma.js', 'xyz123', '1:2', '-o', './custom.png'];
  const res2 = parseArguments(argv2);
  assert.strictEqual(res2.fileKey, 'xyz123');
  assert.strictEqual(res2.nodeId, '1:2');
  assert.strictEqual(res2.downloadImage, true);
  assert.strictEqual(res2.imagePath, './custom.png');
});

test('parseArguments: supports base URL with positional nodeId fallback', () => {
  const argv = [
    'node',
    'fetch_figma.js',
    'https://www.figma.com/design/1KP9pVQ1ptZzHa3Gcpr6ta/Consulta-e-pagamento',
    '4023-474',
  ];
  const res = parseArguments(argv);
  assert.strictEqual(res.fileKey, '1KP9pVQ1ptZzHa3Gcpr6ta');
  assert.strictEqual(res.nodeId, '4023:474');
});

test('parseArguments: URL with node-id preserves its node-id even if extra positional provided', () => {
  const argv = [
    'node',
    'fetch_figma.js',
    'https://www.figma.com/design/1KP9pVQ1ptZzHa3Gcpr6ta/Consulta-e-pagamento?node-id=10-20',
    '99-99',
  ];
  const res = parseArguments(argv);
  assert.strictEqual(res.fileKey, '1KP9pVQ1ptZzHa3Gcpr6ta');
  assert.strictEqual(res.nodeId, '10:20');
});

// 9. ID Stripping & Optimization Tests
test('pruneFigmaNode: omits node id by default and keeps it with includeIds', () => {
  const node = { id: '10:20', name: 'Header', type: 'FRAME' };
  const compact = pruneFigmaNode(node);
  assert.strictEqual(compact.id, undefined);

  const withId = pruneFigmaNode(node, {}, { includeIds: true });
  assert.strictEqual(withId.id, '10:20');
});

// 10. API Error Formatting & 429 Rate Limit Tests
test('formatApiError: formats 429 error with exact retryAfter seconds and policy', () => {
  const err = new Error('Too Many Requests');
  err.statusCode = 429;
  err.retryAfter = 45;
  err.rateLimitType = 'tier_1';

  const res = formatApiError(err);
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(res.isRateLimited, true);
  assert.strictEqual(res.retryAfter, 45);
  assert.strictEqual(res.rateLimitType, 'tier_1');
  assert.ok(res.error.includes('Please retry after 45 seconds'));
  assert.ok(res.error.includes('(Policy: tier_1)'));
});

test('formatApiError: formats 429 error without retryAfter using fallback message', () => {
  const err = new Error('Too Many Requests');
  err.statusCode = 429;

  const res = formatApiError(err);
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(res.isRateLimited, true);
  assert.strictEqual(res.retryAfter, undefined);
  assert.ok(res.error.includes('Please wait 30-60 seconds before making more requests.'));
});

test('formatApiError: formats 401/403 token expiration error', () => {
  const err = new Error('Unauthorized');
  err.statusCode = 401;

  const res = formatApiError(err);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.isTokenExpiredOrInvalid, true);
  assert.ok(res.error.includes('FIGMA_TOKEN_EXPIRED_OR_INVALID'));
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);

if (passedTests !== totalTests) {
  process.exit(1);
}

