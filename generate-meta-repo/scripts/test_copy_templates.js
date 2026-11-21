const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { copyTemplates, parseArgs, TEMPLATE_ENTRIES } = require('./copy_templates.js');

console.log('--- Running Generate Meta-Repo Templates & Copier Unit Tests ---');

const SCRIPT_PATH = path.join(__dirname, 'copy_templates.js');
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-repo-test-'));

function runNode(script, args = [], cwd = tmpBase) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

try {
  // 1. parseArgs & --help
  assert.deepStrictEqual(parseArgs(['./ws']), {
    targetDir: './ws',
    force: false,
    noCi: false,
    dryRun: false,
    help: false,
  });
  assert.deepStrictEqual(parseArgs(['./ws', '-f', '--no-ci', '--dry-run']), {
    targetDir: './ws',
    force: true,
    noCi: true,
    dryRun: true,
    help: false,
  });
  assert.throws(() => parseArgs(['./ws', '--unknown']), /Unknown option/);

  const helpOutput = runNode(SCRIPT_PATH, ['--help']);
  assert.ok(helpOutput.includes('--force, -f'));
  assert.ok(helpOutput.includes('--no-ci'));
  assert.ok(helpOutput.includes('--dry-run'));
  console.log('  ✓ parseArgs & --help: parses flags cleanly and prints documented options');

  // 2. Greenfield copy + Evolution Mode skip-existing + --force overwrite
  const wsDir = path.join(tmpBase, 'ws-greenfield');
  const drySummary = copyTemplates(wsDir, { dryRun: true });
  assert.strictEqual(drySummary.copied.length, TEMPLATE_ENTRIES.length);
  assert.ok(!fs.existsSync(wsDir), 'dry-run must not create target files');

  const firstCopy = copyTemplates(wsDir);
  assert.strictEqual(firstCopy.copied.length, 5);
  assert.strictEqual(firstCopy.skipped.length, 0);
  assert.ok(fs.existsSync(path.join(wsDir, 'scripts', 'bootstrap.mjs')));
  assert.ok(fs.existsSync(path.join(wsDir, 'scripts', 'run.mjs')));
  assert.ok(fs.existsSync(path.join(wsDir, 'scripts', 'install-cli.mjs')));
  assert.ok(fs.existsSync(path.join(wsDir, 'scripts', 'check-manifest.mjs')));
  assert.ok(fs.existsSync(path.join(wsDir, '.github', 'workflows', 'meta-repo.yml')));

  // Simulate user customization in Evolution Mode
  const customMarker = '// user-custom-edit\n';
  const bootstrapPath = path.join(wsDir, 'scripts', 'bootstrap.mjs');
  fs.writeFileSync(bootstrapPath, customMarker + fs.readFileSync(bootstrapPath, 'utf8'));

  const secondCopy = copyTemplates(wsDir);
  assert.strictEqual(secondCopy.copied.length, 0);
  assert.strictEqual(secondCopy.skipped.length, 5);
  assert.ok(fs.readFileSync(bootstrapPath, 'utf8').startsWith(customMarker), 'Evolution Mode must preserve customized scripts');

  const forcedCopy = copyTemplates(wsDir, { force: true });
  assert.strictEqual(forcedCopy.copied.length, 5);
  assert.ok(!fs.readFileSync(bootstrapPath, 'utf8').startsWith(customMarker), '--force must overwrite customized scripts');

  // --no-ci skips workflow file
  const noCiDir = path.join(tmpBase, 'ws-no-ci');
  const noCiSummary = copyTemplates(noCiDir, { noCi: true });
  assert.strictEqual(noCiSummary.copied.length, 4);
  assert.ok(!fs.existsSync(path.join(noCiDir, '.github', 'workflows', 'meta-repo.yml')));
  console.log('  ✓ copyTemplates: greenfield copy, dry-run, Evolution skip protection, --force, and --no-ci');

  // 3. check-manifest.mjs: valid manifest including Companion IaC parent grouping
  fs.writeFileSync(path.join(wsDir, '.gitignore'), '/apps/\n/services/\n/legacy/\n.specs/\n');
  fs.writeFileSync(
    path.join(wsDir, 'repos.json'),
    JSON.stringify(
      {
        version: 1,
        repos: [
          {
            name: 'web-portal',
            path: 'apps/web-portal/web-portal',
            remote: 'git@github.com:acme/web-portal.git',
            category: 'frontend',
            product: 'checkout',
            port: 3000,
            run: 'host',
            dev: 'pnpm dev',
            companion: 'web-portal-iac',
          },
          {
            name: 'web-portal-iac',
            path: 'apps/web-portal/web-portal-iac',
            remote: 'git@github.com:acme/web-portal-iac.git',
            category: 'iac',
            product: 'checkout',
            companionOf: 'web-portal',
          },
          {
            name: 'checkout-api',
            path: 'services/checkout',
            remote: null,
            category: 'backend',
            product: 'checkout',
            port: 4001,
            run: 'docker',
          },
          {
            name: 'legacy-monolith',
            path: 'legacy/monolith',
            remote: 'git@github.com:acme/legacy-monolith.git',
            category: 'legacy',
            branch: 'master',
          },
        ],
      },
      null,
      2,
    ),
  );

  const validOut = runNode(path.join(wsDir, 'scripts', 'check-manifest.mjs'), [], wsDir);
  assert.ok(validOut.includes('Valid manifest (4 repositories)'));
  console.log('  ✓ check-manifest.mjs: accepts valid manifest with companion IaC sibling pair');

  // 4. check-manifest.mjs: catches nested Git repos, missing .gitignore, dangling companion, duplicate port
  const badDir = path.join(tmpBase, 'ws-bad');
  copyTemplates(badDir, { noCi: true });
  fs.writeFileSync(path.join(badDir, '.gitignore'), '/apps/\n');
  fs.writeFileSync(
    path.join(badDir, 'repos.json'),
    JSON.stringify({
      version: 1,
      repos: [
        { name: 'frontend', path: 'apps/frontend', category: 'frontend', port: 3000, run: 'host', companion: 'missing-iac' },
        { name: 'frontend-iac', path: 'apps/frontend/iac', category: 'iac' },
        { name: 'api', path: 'services/api', category: 'backend', port: 3000, run: 'docker' },
      ],
    }),
  );

  let badStderr = '';
  try {
    runNode(path.join(badDir, 'scripts', 'check-manifest.mjs'), [], badDir);
    assert.fail('check-manifest.mjs should fail on invalid manifest');
  } catch (err) {
    badStderr = err.stderr ? err.stderr.toString() : '';
  }
  assert.ok(badStderr.includes('nested repository path'), 'must reject nested repo paths');
  assert.ok(badStderr.includes("'/services/' is missing from .gitignore"), 'must reject missing .gitignore prefix');
  assert.ok(badStderr.includes("companion 'missing-iac' not found"), 'must reject dangling companion reference');
  assert.ok(badStderr.includes('duplicate port: 3000'), 'must reject duplicate ports');
  console.log('  ✓ check-manifest.mjs: catches nested repos, missing .gitignore, dangling companion, and duplicate ports');

  // 5. bootstrap.mjs --dry-run: filters, legacy exclusion, --https, and remote: null skip
  const bootDefault = runNode(path.join(wsDir, 'scripts', 'bootstrap.mjs'), ['--dry-run'], wsDir);
  assert.ok(bootDefault.includes('[CLONE]  web-portal'));
  assert.ok(bootDefault.includes('[CLONE]  web-portal-iac'));
  assert.ok(bootDefault.includes('skipped: checkout-api (no remote)'));
  assert.ok(!bootDefault.includes('legacy-monolith'), 'default bootstrap must exclude legacy repos');

  const bootIacHttps = runNode(path.join(wsDir, 'scripts', 'bootstrap.mjs'), ['--category=iac', '--https', '--dry-run'], wsDir);
  assert.ok(bootIacHttps.includes('https://github.com/acme/web-portal-iac.git'));
  assert.ok(!bootIacHttps.includes('web-portal ->'));

  const bootLegacy = runNode(path.join(wsDir, 'scripts', 'bootstrap.mjs'), ['--legacy', '--dry-run'], wsDir);
  assert.ok(bootLegacy.includes('--branch master'));
  assert.ok(bootLegacy.includes('legacy-monolith'));
  console.log('  ✓ bootstrap.mjs: dry-run honors legacy exclusion, --category=iac, --https, --legacy, and remote: null');

  // 6. run.mjs: dynamic usage output and unknown service guard
  const runList = runNode(path.join(wsDir, 'scripts', 'run.mjs'), [], wsDir);
  assert.ok(runList.includes('web-portal'));
  assert.ok(runList.includes('checkout-api'));
  assert.ok(runList.includes('make run S="web-portal checkout-api"'));

  let unknownErr = '';
  try {
    runNode(path.join(wsDir, 'scripts', 'run.mjs'), ['nonexistent-svc'], wsDir);
    assert.fail('run.mjs should fail on unknown service');
  } catch (err) {
    unknownErr = err.stderr ? err.stderr.toString() : '';
  }
  assert.ok(unknownErr.includes('Unknown service(s): nonexistent-svc'));
  console.log('  ✓ run.mjs: lists runnable services dynamically and rejects unknown service names');

  console.log('\nResults: 6/6 generate-meta-repo tests passed.\n');
} finally {
  fs.rmSync(tmpBase, { recursive: true, force: true });
}
