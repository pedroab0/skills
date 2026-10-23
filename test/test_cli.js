const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { getAvailableSkills, getAgentConfigs, checkFigmaToken, installSkill } = require('../bin/cli.js');

console.log('--- Running CLI & Installer Unit Tests ---');

// 1. Skill Discovery
const skills = getAvailableSkills();
assert.strictEqual(skills.length, 3, 'Should discover exactly 3 skills');
const skillNames = skills.map((s) => s.name).sort();
assert.deepStrictEqual(skillNames, ['figma-extractor', 'figma-node-builder', 'figma-to-code']);
console.log('  ✓ getAvailableSkills: discovers all 3 skills');

// 2. Agent Configs
const configs = getAgentConfigs('/mock/project');
assert.ok(configs.claude, 'claude config exists');
assert.ok(configs.antigravity, 'antigravity config exists');
assert.ok(configs.antigravity.globalPath.includes(path.join('.gemini', 'config', 'skills')));
assert.ok(configs.cursor, 'cursor config exists');
assert.ok(configs.kiro, 'kiro config exists');
assert.ok(configs.kiro.globalPath.endsWith(path.join('.kiro', 'skills')));
assert.ok(configs.kiro.localPath.endsWith(path.join('.kiro', 'skills')));
assert.ok(configs.opencode, 'opencode config exists');
assert.strictEqual(configs.cursor.isCursorRule, true);
console.log('  ✓ getAgentConfigs: returns expected configurations');

// 3. installSkill - standard agent copy
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'));
try {
  const figmaExtractor = skills.find((s) => s.name === 'figma-extractor');
  const res = installSkill(figmaExtractor, tmpDir, false, false);
  assert.ok(fs.existsSync(path.join(tmpDir, 'figma-extractor', 'SKILL.md')));
  assert.strictEqual(res.isSymlink, false);
  console.log('  ✓ installSkill: copies skill directory for standard agents');

  // 4. installSkill - Cursor .mdc rule creation (no duplicate frontmatter) + default workspace scope
  const cursorProjectDir = path.join(tmpDir, 'cursor-project');
  const cursorRulesDir = path.join(cursorProjectDir, '.cursor', 'rules');
  const cursorRes = installSkill(figmaExtractor, cursorRulesDir, false, true);
  assert.strictEqual(cursorRes.isCursorRule, true);
  assert.ok(fs.existsSync(path.join(cursorRulesDir, 'figma-extractor.mdc')));
  assert.ok(fs.existsSync(path.join(cursorProjectDir, '.cursor', 'skills', 'figma-extractor', 'scripts', 'fetch_figma.js')));
  const mdcContent = fs.readFileSync(path.join(cursorRulesDir, 'figma-extractor.mdc'), 'utf8');
  assert.ok(mdcContent.startsWith('---\ndescription:'));
  assert.ok(mdcContent.includes('globs: *'));
  assert.ok(!mdcContent.includes('name: figma-extractor'), 'Inner SKILL.md frontmatter should be stripped');

  // Verify --agent cursor without --global defaults to workspace-local .cursor/rules
  const cursorFlagProject = path.join(tmpDir, 'cursor-flag-project');
  fs.mkdirSync(cursorFlagProject, { recursive: true });
  execSync(`node "${path.resolve(__dirname, '..', 'bin', 'cli.js')}" --agent cursor --skill figma-to-code`, {
    cwd: cursorFlagProject,
    encoding: 'utf8',
  });
  assert.ok(fs.existsSync(path.join(cursorFlagProject, '.cursor', 'rules', 'figma-to-code.mdc')));
  assert.ok(fs.existsSync(path.join(cursorFlagProject, '.cursor', 'skills', 'figma-to-code', 'scripts', 'fetch_figma.js')));
  console.log('  ✓ installSkill & --agent cursor: creates clean .mdc rule in workspace .cursor/rules');

  // 5. CLI invocation --list
  const listOutput = execSync('node ./bin/cli.js --list', { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.ok(listOutput.includes('figma-extractor'));
  assert.ok(listOutput.includes('figma-node-builder'));
  assert.ok(listOutput.includes('figma-to-code'));
  console.log('  ✓ cli --list: lists all available skills');

  // 6. CLI non-TTY interactive selection preset 1 (All skills on Enter)
  const destDir1 = path.join(tmpDir, 'dest-1');
  execSync(`node ./bin/cli.js --dest "${destDir1}"`, { cwd: path.resolve(__dirname, '..'), input: '\n', encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(destDir1, 'figma-to-code')));
  assert.ok(fs.existsSync(path.join(destDir1, 'figma-extractor')));
  assert.ok(fs.existsSync(path.join(destDir1, 'figma-node-builder')));
  console.log('  ✓ cli preset 1: [Enter] installs all skills');

  // 7. CLI non-TTY interactive selection preset 2 (SDD Suite)
  const destDir2 = path.join(tmpDir, 'dest-2');
  execSync(`node ./bin/cli.js --dest "${destDir2}"`, { cwd: path.resolve(__dirname, '..'), input: '2\n', encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(destDir2, 'figma-extractor')));
  assert.ok(fs.existsSync(path.join(destDir2, 'figma-node-builder')));
  assert.ok(!fs.existsSync(path.join(destDir2, 'figma-to-code')));
  console.log('  ✓ cli preset 2: [2] installs SDD suite (figma-extractor + figma-node-builder)');

  // 8. CLI non-TTY interactive selection preset 3 (figma-to-code only)
  const destDir3 = path.join(tmpDir, 'dest-3');
  execSync(`node ./bin/cli.js --dest "${destDir3}"`, { cwd: path.resolve(__dirname, '..'), input: '3\n', encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(destDir3, 'figma-to-code')));
  assert.ok(!fs.existsSync(path.join(destDir3, 'figma-extractor')));
  assert.ok(!fs.existsSync(path.join(destDir3, 'figma-node-builder')));
  console.log('  ✓ cli preset 3: [3] installs figma-to-code only');

  // 9. CLI non-TTY interactive selection preset 4 (figma-extractor only)
  const destDir4 = path.join(tmpDir, 'dest-4');
  execSync(`node ./bin/cli.js --dest "${destDir4}"`, { cwd: path.resolve(__dirname, '..'), input: '4\n', encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(destDir4, 'figma-extractor')));
  assert.ok(!fs.existsSync(path.join(destDir4, 'figma-to-code')));
  console.log('  ✓ cli preset 4: [4] installs figma-extractor only');

  // 10. CLI non-TTY interactive selection preset 5 (figma-node-builder only)
  const destDir5 = path.join(tmpDir, 'dest-5');
  execSync(`node ./bin/cli.js --dest "${destDir5}"`, { cwd: path.resolve(__dirname, '..'), input: '5\n', encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(destDir5, 'figma-node-builder')));
  assert.ok(!fs.existsSync(path.join(destDir5, 'figma-to-code')));
  console.log('  ✓ cli preset 5: [5] installs figma-node-builder only');

  // 11. CLI cancellation via 'q'
  const cancelOutput = execSync('node ./bin/cli.js', { cwd: path.resolve(__dirname, '..'), input: 'q\n', encoding: 'utf8' });
  assert.ok(cancelOutput.includes('Installation cancelled'));
  console.log('  ✓ cli cancellation: exits cleanly when user inputs cancel command');

  // 12. checkFigmaToken: Windows PowerShell profile (UTF-16LE + UTF-8) & commented-out exclusion
  const mockHome = path.join(tmpDir, 'mock-win-home');
  const mockCwd = path.join(tmpDir, 'mock-win-cwd');
  const psProfileDir = path.join(mockHome, 'Documents', 'PowerShell');
  fs.mkdirSync(psProfileDir, { recursive: true });
  fs.mkdirSync(mockCwd, { recursive: true });
  const psProfilePath = path.join(psProfileDir, 'Microsoft.PowerShell_profile.ps1');

  // Commented-out token should NOT report found
  fs.writeFileSync(psProfilePath, '# $env:FIGMA_ACCESS_TOKEN="commented_out"\r\n', 'utf8');
  assert.strictEqual(checkFigmaToken({ cwd: mockCwd, home: mockHome, ignoreProcessEnv: true }).found, false);

  // UTF-16LE BOM PowerShell profile should report found
  const utf16Ps = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from('$env:FIGMA_ACCESS_TOKEN="figd_win_token"\r\n', 'utf16le'),
  ]);
  fs.writeFileSync(psProfilePath, utf16Ps);
  const psStatus = checkFigmaToken({ cwd: mockCwd, home: mockHome, ignoreProcessEnv: true });
  assert.strictEqual(psStatus.found, true);
  assert.strictEqual(psStatus.source, 'Microsoft.PowerShell_profile.ps1');
  console.log('  ✓ checkFigmaToken: detects PowerShell profile (UTF-16LE) and ignores commented tokens');

  // 13. Kiro IDE & CLI support (--agent kiro / kiro-cli / kiro-ide + KIRO_HOME)
  const kiroProjectDir = path.join(tmpDir, 'kiro-project');
  const kiroCustomHome = path.join(tmpDir, 'custom-kiro-home');
  fs.mkdirSync(kiroProjectDir, { recursive: true });

  // Local workspace install via --agent kiro-ide --local
  execSync(`node "${path.resolve(__dirname, '..', 'bin', 'cli.js')}" --agent kiro-ide --skill sdd --local`, {
    cwd: kiroProjectDir,
    encoding: 'utf8',
  });
  assert.ok(fs.existsSync(path.join(kiroProjectDir, '.kiro', 'skills', 'figma-extractor', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(kiroProjectDir, '.kiro', 'skills', 'figma-node-builder', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(kiroProjectDir, '.kiro', 'skills', 'figma-to-code')));

  // Global install honoring KIRO_HOME via --agent kiro-cli --global
  execSync(`node "${path.resolve(__dirname, '..', 'bin', 'cli.js')}" --agent kiro-cli --skill figma-to-code --global`, {
    cwd: kiroProjectDir,
    env: { ...process.env, KIRO_HOME: kiroCustomHome },
    encoding: 'utf8',
  });
  assert.ok(fs.existsSync(path.join(kiroCustomHome, 'skills', 'figma-to-code', 'SKILL.md')));
  console.log('  ✓ Kiro IDE & CLI: installs into .kiro/skills (local) and $KIRO_HOME/skills (global)');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('\nResults: 13/13 CLI tests passed.\n');
