#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(SKILL_ROOT, 'templates');

const TEMPLATE_ENTRIES = [
  { src: path.join('scripts', 'bootstrap.mjs'), dest: path.join('scripts', 'bootstrap.mjs'), executable: true, ci: false },
  { src: path.join('scripts', 'run.mjs'), dest: path.join('scripts', 'run.mjs'), executable: true, ci: false },
  { src: path.join('scripts', 'install-cli.mjs'), dest: path.join('scripts', 'install-cli.mjs'), executable: true, ci: false },
  { src: path.join('scripts', 'check-manifest.mjs'), dest: path.join('scripts', 'check-manifest.mjs'), executable: true, ci: false },
  { src: 'meta-repo.yml', dest: path.join('.github', 'workflows', 'meta-repo.yml'), executable: false, ci: true },
];

function printHelp() {
  console.log(`Usage: node copy_templates.js <target-dir> [options]

Copies bundled zero-dependency meta-repo scripts (scripts/*.mjs) and CI workflow
(.github/workflows/meta-repo.yml) into <target-dir>. Skips existing files by default.

Options:
  --force, -f      Overwrite existing script and workflow files
  --no-ci          Skip copying .github/workflows/meta-repo.yml
  --dry-run        Preview actions without creating or modifying files
  --help, -h       Show this help message
`);
}

function parseArgs(argv) {
  const opts = {
    targetDir: null,
    force: false,
    noCi: false,
    dryRun: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--force' || arg === '-f') {
      opts.force = true;
    } else if (arg === '--no-ci') {
      opts.noCi = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!opts.targetDir) {
      opts.targetDir = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return opts;
}

function copyTemplates(targetDir, options = {}) {
  const { force = false, noCi = false, dryRun = false } = options;
  const resolvedTarget = path.resolve(targetDir);
  const summary = { copied: [], skipped: [] };

  for (const entry of TEMPLATE_ENTRIES) {
    if (noCi && entry.ci) continue;

    const srcPath = path.join(TEMPLATES_DIR, entry.src);
    const destPath = path.join(resolvedTarget, entry.dest);
    const relDest = entry.dest.split(path.sep).join('/');

    if (!fs.existsSync(srcPath)) {
      throw new Error(`Missing bundled template: ${srcPath}`);
    }

    if (fs.existsSync(destPath) && !force) {
      summary.skipped.push(relDest);
      continue;
    }

    if (!dryRun) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      if (entry.executable && process.platform !== 'win32') {
        try {
          fs.chmodSync(destPath, 0o755);
        } catch (_) {}
      }
    }

    summary.copied.push(relDest);
  }

  return summary;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}\nRun with --help for usage.`);
    process.exit(1);
  }

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (!opts.targetDir) {
    console.error('Error: Missing <target-dir>.\nRun with --help for usage.');
    process.exit(1);
  }

  const summary = copyTemplates(opts.targetDir, opts);
  const prefix = opts.dryRun ? '(dry-run) ' : '';

  for (const file of summary.copied) {
    console.log(`${prefix}[COPY] ${file}`);
  }
  for (const file of summary.skipped) {
    console.log(`${prefix}[SKIP] ${file} (already exists; pass --force to overwrite)`);
  }

  console.log(`\n${prefix}Copied: ${summary.copied.length} · Skipped: ${summary.skipped.length}`);
}

if (require.main === module) {
  main();
}

module.exports = { copyTemplates, parseArgs, TEMPLATE_ENTRIES };
