const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { getAvailableSkills, getAgentConfigs, installSkill } = require('../bin/cli.js');

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

  // 4. installSkill - Cursor .mdc rule creation
  const cursorRulesDir = path.join(tmpDir, 'cursor-project', '.cursor', 'rules');
  const cursorRes = installSkill(figmaExtractor, cursorRulesDir, false, true);
  assert.strictEqual(cursorRes.isCursorRule, true);
  assert.ok(fs.existsSync(path.join(cursorRulesDir, 'figma-extractor.mdc')));
  const mdcContent = fs.readFileSync(path.join(cursorRulesDir, 'figma-extractor.mdc'), 'utf8');
  assert.ok(mdcContent.includes('---'));
  assert.ok(mdcContent.includes('globs: *'));
  console.log('  ✓ installSkill: generates .mdc rule for Cursor');

  // 5. CLI invocation --list
  const listOutput = execSync('node ./bin/cli.js --list', { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.ok(listOutput.includes('figma-extractor'));
  assert.ok(listOutput.includes('figma-node-builder'));
  assert.ok(listOutput.includes('figma-to-code'));
  console.log('  ✓ cli --list: lists all available skills');

  // 6. CLI non-TTY interactive selection preset 1 (All skills on Enter)
  const destDir1 = path.join(tmpDir, 'dest-1');
  execSync(`printf "\\n" | node ./bin/cli.js --dest ${destDir1}`, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(destDir1, 'figma-to-code')));
  assert.ok(fs.existsSync(path.join(destDir1, 'figma-extractor')));
  assert.ok(fs.existsSync(path.join(destDir1, 'figma-node-builder')));
  console.log('  ✓ cli preset 1: [Enter] installs all skills');

  // 7. CLI non-TTY interactive selection preset 2 (SDD Suite)
  const destDir2 = path.join(tmpDir, 'dest-2');
  execSync(`printf "2\\n" | node ./bin/cli.js --dest ${destDir2}`, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(destDir2, 'figma-extractor')));
  assert.ok(fs.existsSync(path.join(destDir2, 'figma-node-builder')));
  assert.ok(!fs.existsSync(path.join(destDir2, 'figma-to-code')));
  console.log('  ✓ cli preset 2: [2] installs SDD suite (figma-extractor + figma-node-builder)');

  // 8. CLI non-TTY interactive selection preset 3 (figma-to-code only)
  const destDir3 = path.join(tmpDir, 'dest-3');
  execSync(`printf "3\\n" | node ./bin/cli.js --dest ${destDir3}`, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(destDir3, 'figma-to-code')));
  assert.ok(!fs.existsSync(path.join(destDir3, 'figma-extractor')));
  assert.ok(!fs.existsSync(path.join(destDir3, 'figma-node-builder')));
  console.log('  ✓ cli preset 3: [3] installs figma-to-code only');

  // 9. CLI non-TTY interactive selection preset 4 (figma-extractor only)
  const destDir4 = path.join(tmpDir, 'dest-4');
  execSync(`printf "4\\n" | node ./bin/cli.js --dest ${destDir4}`, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(destDir4, 'figma-extractor')));
  assert.ok(!fs.existsSync(path.join(destDir4, 'figma-to-code')));
  console.log('  ✓ cli preset 4: [4] installs figma-extractor only');

  // 10. CLI non-TTY interactive selection preset 5 (figma-node-builder only)
  const destDir5 = path.join(tmpDir, 'dest-5');
  execSync(`printf "5\\n" | node ./bin/cli.js --dest ${destDir5}`, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(destDir5, 'figma-node-builder')));
  assert.ok(!fs.existsSync(path.join(destDir5, 'figma-to-code')));
  console.log('  ✓ cli preset 5: [5] installs figma-node-builder only');

  // 11. CLI cancellation via 'q'
  const cancelOutput = execSync('printf "q\\n" | node ./bin/cli.js', { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.ok(cancelOutput.includes('Installation cancelled'));
  console.log('  ✓ cli cancellation: exits cleanly when user inputs cancel command');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('\nResults: 11/11 CLI tests passed.\n');
