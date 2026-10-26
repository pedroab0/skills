const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getAvailableSkills, parseFrontmatterField } = require('../bin/cli.js');

console.log('--- Running Agent Skills Best-Practices Linter & Parity Tests ---');

const ROOT_DIR = path.resolve(__dirname, '..');
const SKILL_DIRS = ['figma-extractor', 'figma-node-builder', 'figma-to-code'];
const RESERVED_WORDS = ['anthropic', 'claude'];

function parseFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n*([\s\S]*)$/);
  assert.ok(match, `File ${filePath} must contain YAML frontmatter`);
  return {
    rawFrontmatter: match[1],
    body: match[2],
    name: parseFrontmatterField(content, 'name'),
    description: parseFrontmatterField(content, 'description'),
  };
}

function extractHelpFlags(scriptPath) {
  const output = execSync(`node "${scriptPath}" --help`, { encoding: 'utf8' });
  const flags = new Set();
  const optionsMatch = output.match(/Options:\r?\n([\s\S]*?)(?:\r?\n\r?\n[A-Z]|$)/);
  if (!optionsMatch) return flags;
  const lines = optionsMatch[1].split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) continue;
    const flagPart = trimmed.split(/\s{2,}/)[0];
    const extracted = flagPart.match(/(--[a-z0-9-]+|-[a-zA-Z])/g);
    if (extracted) {
      for (const f of extracted) {
        flags.add(f);
      }
    }
  }
  return flags;
}

const discoveredSkills = getAvailableSkills();
assert.strictEqual(discoveredSkills.length, 3, 'Must discover all 3 skills');

for (const skillDir of SKILL_DIRS) {
  const skillPath = path.join(ROOT_DIR, skillDir);
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  assert.ok(fs.existsSync(skillMdPath), `SKILL.md must exist in ${skillDir}`);

  const { name, description, body } = parseFrontmatter(skillMdPath);

  // 1. Name validation
  assert.strictEqual(name, skillDir, `Skill name in frontmatter must match directory name "${skillDir}"`);
  assert.ok(/^[a-z0-9-]{1,64}$/.test(name), `Skill name "${name}" must be 1-64 lowercase alphanumeric + hyphens`);
  for (const reserved of RESERVED_WORDS) {
    assert.ok(!name.toLowerCase().includes(reserved), `Skill name "${name}" cannot contain reserved word "${reserved}"`);
  }

  // 2. Description validation (Anthropic Agent Skills specification)
  assert.ok(description && description.length > 0, `Description in ${skillDir} must not be empty`);
  assert.ok(
    description.length <= 1024,
    `Description in ${skillDir} must be <= 1024 characters (current: ${description.length})`,
  );
  assert.ok(!/<[^>]+>/.test(description), `Description in ${skillDir} must not contain XML or HTML tags`);
  assert.ok(!/\b(I can|You can)\b/i.test(description), `Description in ${skillDir} must avoid first/second person phrases`);
  assert.ok(
    /^[A-Z][a-z]+s\b/.test(description),
    `Description in ${skillDir} must start with a 3rd person singular verb (e.g. "Extracts", "Builds", "Converts")`,
  );

  // CLI discovery integration
  const discovered = discoveredSkills.find((s) => s.name === skillDir);
  assert.ok(discovered, `Skill ${skillDir} must be discovered by CLI`);
  assert.strictEqual(
    discovered.description,
    description,
    `CLI discovery description must match parsed frontmatter without truncation`,
  );

  // 3. Token budget (< 500 lines for SKILL.md body)
  const bodyLines = body.split(/\r?\n/).length;
  assert.ok(
    bodyLines < 500,
    `SKILL.md body in ${skillDir} must be under 500 lines (current: ${bodyLines})`,
  );

  // 4. Windows paths check
  assert.ok(
    !body.includes('scripts\\') && !body.includes('reference\\'),
    `SKILL.md in ${skillDir} must use forward slashes for cross-platform execution`,
  );

  // 5. Relative links validation in SKILL.md and any markdown files
  const mdFiles = fs.readdirSync(skillPath).filter((f) => f.endsWith('.md'));
  for (const mdFile of mdFiles) {
    const mdContent = fs.readFileSync(path.join(skillPath, mdFile), 'utf8');
    const linkRegex = /\]\((?!https?:|#|\/)([^)\s#]+\.md)(#[^)]*)?\)/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(mdContent)) !== null) {
      const targetRel = linkMatch[1];
      assert.ok(
        !targetRel.includes('../'),
        `Link "${targetRel}" in ${skillDir}/${mdFile} must not navigate up; keep references 1 level deep`,
      );
      const targetFull = path.join(skillPath, targetRel);
      assert.ok(
        fs.existsSync(targetFull),
        `Relative markdown link "${targetRel}" in ${skillDir}/${mdFile} must resolve to an existing file`,
      );
    }

    // 6. Large reference files (>100 lines) must have a table of contents
    const totalLines = mdContent.split(/\r?\n/).length;
    if (totalLines > 100 && mdFile !== 'README.md' && mdFile !== 'SKILL.md') {
      assert.ok(
        mdContent.includes('## Contents') || mdContent.includes('## Table of Contents'),
        `${skillDir}/${mdFile} has ${totalLines} lines (>100) and must include a table of contents (## Contents)`,
      );
    }
  }

  console.log(`  ✓ ${skillDir}: frontmatter, conciseness (${bodyLines} lines), links & 1-level references verified`);
}

// 7. CLI flags parity checks between scripts and documentation
console.log('  Verifying script CLI flags parity with documentation...');

// 7a. figma-extractor
const extractorHelpFlags = extractHelpFlags(path.join(ROOT_DIR, 'figma-extractor', 'scripts', 'fetch_figma.js'));
const extractorRefContent = fs.readFileSync(path.join(ROOT_DIR, 'figma-extractor', 'REFERENCE.md'), 'utf8');
for (const flag of extractorHelpFlags) {
  assert.ok(
    extractorRefContent.includes(flag),
    `Flag "${flag}" from fetch_figma.js --help must be documented in figma-extractor/REFERENCE.md`,
  );
}

// 7b. figma-to-code
const toCodeHelpFlags = extractHelpFlags(path.join(ROOT_DIR, 'figma-to-code', 'scripts', 'fetch_figma.js'));
const toCodeRefContent = fs.readFileSync(path.join(ROOT_DIR, 'figma-to-code', 'REFERENCE.md'), 'utf8');
for (const flag of toCodeHelpFlags) {
  assert.ok(
    toCodeRefContent.includes(flag),
    `Flag "${flag}" from fetch_figma.js --help must be documented in figma-to-code/REFERENCE.md`,
  );
}

// 7c. figma-node-builder inspect_spec.js
const inspectorHelpFlags = extractHelpFlags(path.join(ROOT_DIR, 'figma-node-builder', 'scripts', 'inspect_spec.js'));
const nodeBuilderSkillContent = fs.readFileSync(path.join(ROOT_DIR, 'figma-node-builder', 'SKILL.md'), 'utf8');
for (const flag of inspectorHelpFlags) {
  assert.ok(
    nodeBuilderSkillContent.includes(flag),
    `Flag "${flag}" from inspect_spec.js --help must be documented in figma-node-builder/SKILL.md`,
  );
}

console.log('  ✓ CLI flags parity: 100% of executable flags are documented across reference and skill files.');
console.log('\nResults: All agent skills conform to Anthropic Agent Skills best practices.\n');
