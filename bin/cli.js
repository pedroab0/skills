#!/usr/bin/env node

/**
 * Skills Installer CLI
 * https://github.com/pedroab0/skills
 *
 * Install curated AI agent skills for Claude Code, Cursor, Antigravity, and OpenCode.
 * Usage: npx github:pedroab0/skills [options]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// ANSI colors & styling
const isColorSupported = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);
const style = {
  bold: (t) => (isColorSupported ? `\x1b[1m${t}\x1b[0m` : t),
  dim: (t) => (isColorSupported ? `\x1b[2m${t}\x1b[0m` : t),
  green: (t) => (isColorSupported ? `\x1b[32m${t}\x1b[0m` : t),
  cyan: (t) => (isColorSupported ? `\x1b[36m${t}\x1b[0m` : t),
  yellow: (t) => (isColorSupported ? `\x1b[33m${t}\x1b[0m` : t),
  red: (t) => (isColorSupported ? `\x1b[31m${t}\x1b[0m` : t),
};

const ROOT_DIR = path.resolve(__dirname, '..');

// Visual Tree / Clack-style Icons
const ui = {
  header: (title) => console.log(`\n${style.bold(style.cyan('◆'))}  ${style.bold(title)}`),
  bar: () => console.log(style.dim('│')),
  step: (title) => console.log(`${style.cyan('◇')}  ${style.bold(title)}`),
  item: (text) => console.log(`${style.dim('│')}  ${text}`),
  itemActive: (text) => console.log(`${style.dim('│')}  ${style.cyan('●')} ${text}`),
  itemInactive: (text) => console.log(`${style.dim('│')}  ${style.dim('○')} ${text}`),
  confirmed: (text) => console.log(`${style.dim('│')}\n${style.green('✔')}  ${text}\n${style.dim('│')}`),
  done: (text) => console.log(`${style.green('✔')}  ${style.bold(text)}\n${style.dim('└')}  ${style.dim('https://github.com/pedroab0/skills')}\n`),
  cancel: () => console.log(`${style.dim('│')}\n${style.yellow('✖')}  ${style.yellow('Installation cancelled.')}\n${style.dim('└')}\n`),
};

function printBanner() {
  ui.header(`Skills Installer ${style.dim('(by @pedroab0)')}`);
  ui.item(style.dim('Curated AI Agent Skills for Claude Code, Antigravity, Cursor & OpenCode'));
  ui.item(style.dim('https://github.com/pedroab0/skills'));
  ui.bar();
}

function printUsage() {
  console.log(`
${style.bold('Usage:')}
  npx github:pedroab0/skills [options]

${style.bold('Options:')}
  --agent <name>       Target agent: claude, antigravity, cursor, opencode, all
  --skill <name>       Skill to install (or comma-separated, or "all", "sdd")
  --global             Install globally (available across all projects on your machine)
  --local              Install in current project workspace only
  --dest <path>        Custom destination directory
  --symlink            Create symlinks instead of copying (recommended for local repos)
  --list, -l           List available skills and exit
  --help, -h           Show this help message

${style.bold('Examples:')}
  npx github:pedroab0/skills
  npx github:pedroab0/skills --agent claude --skill all
  npx github:pedroab0/skills --agent antigravity --skill figma-extractor,figma-node-builder
  npx github:pedroab0/skills --dest ~/.claude/skills --skill figma-to-code
`);
}

// -----------------------------------------------------------------------------
// Skill Discovery
// -----------------------------------------------------------------------------

function getAvailableSkills() {
  const skills = [];
  try {
    const entries = fs.readdirSync(ROOT_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'bin' && entry.name !== 'node_modules') {
        const skillPath = path.join(ROOT_DIR, entry.name);
        const skillMdPath = path.join(skillPath, 'SKILL.md');
        if (fs.existsSync(skillMdPath)) {
          let description = '';
          try {
            const content = fs.readFileSync(skillMdPath, 'utf8');
            const match = content.match(/description:\s*['"]?([^'"\n\r]+)['"]?/);
            if (match) {
              description = match[1].trim();
            }
          } catch (_) {}
          skills.push({
            name: entry.name,
            path: skillPath,
            description: description || 'AI agent skill',
          });
        }
      }
    }
  } catch (err) {
    console.error('Error scanning skills:', err.message);
  }
  return skills;
}

// -----------------------------------------------------------------------------
// Agent Detection & Configurations
// -----------------------------------------------------------------------------

function getAgentConfigs(cwd) {
  const home = os.homedir();
  return {
    claude: {
      name: 'Claude Code',
      globalPath: path.join(home, '.claude', 'skills'),
      localPath: path.join(cwd, '.claude', 'skills'),
      isDetected: fs.existsSync(path.join(home, '.claude')),
    },
    antigravity: {
      name: 'Google Antigravity',
      globalPath: path.join(home, '.gemini', 'antigravity-cli', 'skills'),
      localPath: path.join(cwd, '.gemini', 'skills'),
      isDetected: fs.existsSync(path.join(home, '.gemini', 'antigravity-cli')),
    },
    cursor: {
      name: 'Cursor',
      globalPath: path.join(home, '.cursor', 'rules'),
      localPath: path.join(cwd, '.cursor', 'rules'),
      isDetected: fs.existsSync(path.join(cwd, '.cursor')) || fs.existsSync(path.join(home, '.cursor')),
      isCursorRule: true,
    },
    opencode: {
      name: 'OpenCode',
      globalPath: path.join(home, '.config', 'opencode', 'skills'),
      localPath: path.join(cwd, '.opencode', 'skills'),
      isDetected: fs.existsSync(path.join(home, '.config', 'opencode')),
    },
  };
}

// -----------------------------------------------------------------------------
// Interactive Selection & Keypress Handling
// -----------------------------------------------------------------------------

let nonTTYLineIterator = null;
let nonTTYInterface = null;
async function readLineNonTTY(promptQuery) {
  process.stdout.write(`${style.cyan('◆')}  ${promptQuery}`);
  if (!nonTTYLineIterator) {
    nonTTYInterface = readline.createInterface({
      input: process.stdin,
      terminal: false,
    });
    nonTTYLineIterator = nonTTYInterface[Symbol.asyncIterator]();
  }
  const next = await nonTTYLineIterator.next();
  return next.done ? '' : next.value;
}

function getTerminalRows(text) {
  const cols = process.stdout.columns || 80;
  const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  return Math.max(1, Math.ceil(clean.length / cols));
}

// Ensure terminal cursor is restored on exit
process.on('exit', () => {
  process.stdout.write('\x1b[?25h');
});
process.on('SIGINT', () => {
  process.stdout.write('\x1b[?25h');
  ui.cancel();
  process.exit(0);
});

/**
 * Interactive select prompt with keyboard navigation (↑/↓, numbers 1-9, Enter to confirm, ESC to cancel).
 * Automatically falls back to line-based input when running in non-TTY (CI / piped) environments.
 */
async function selectPrompt({ title, items, defaultIndex = 0, onConfirm }) {
  // Non-TTY fallback (piped input / CI environments)
  if (!process.stdin.isTTY) {
    ui.step(title);
    items.forEach((item, idx) => {
      const hintStr = item.hint ? ` ${style.dim(item.hint)}` : '';
      const badgeStr = item.badge ? ` ${item.badge}` : '';
      if (idx === defaultIndex) {
        ui.itemActive(`${idx + 1}. ${style.bold(item.label)}${hintStr}${badgeStr}`);
      } else {
        ui.itemInactive(`${idx + 1}. ${item.label}${hintStr}${badgeStr}`);
      }
    });
    ui.bar();

    const ans = await readLineNonTTY(`Enter choice [1-${items.length}, or ESC to exit, default: ${defaultIndex + 1}]: `);
    const trimmed = (ans || '').trim();
    if (['0', 'q', 'exit', 'quit'].includes(trimmed.toLowerCase())) {
      ui.cancel();
      process.exit(0);
    }

    let pickedIdx = defaultIndex;
    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= items.length) {
      pickedIdx = parsed - 1;
    } else if (trimmed) {
      const matchIdx = items.findIndex((it) => String(it.value).toLowerCase() === trimmed.toLowerCase());
      if (matchIdx !== -1) pickedIdx = matchIdx;
    }

    const picked = items[pickedIdx];
    if (onConfirm) {
      onConfirm(picked);
    } else {
      ui.confirmed(`Selected: ${style.bold(picked.label)}`);
    }
    return picked.value;
  }

  // Interactive TTY mode with arrow keys and raw mode
  return new Promise((resolve) => {
    let activeIndex = defaultIndex;
    let rowsRendered = 0;

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    // Hide terminal cursor
    process.stdout.write('\x1b[?25l');

    const restoreTerminal = () => {
      process.stdout.write('\x1b[?25h');
      if (process.stdin.setRawMode) {
        try {
          process.stdin.setRawMode(false);
        } catch (_) {}
      }
      process.stdin.removeListener('keypress', onKeypress);
      try {
        process.stdin.pause();
      } catch (_) {}
    };

    const cleanupAndExit = () => {
      restoreTerminal();
      ui.cancel();
      process.exit(0);
    };

    const render = (isInitial = false) => {
      if (isInitial) {
        ui.step(title);
      } else if (rowsRendered > 0) {
        readline.moveCursor(process.stdout, 0, -rowsRendered);
        readline.cursorTo(process.stdout, 0);
        readline.clearScreenDown(process.stdout);
      }

      const lines = [];
      items.forEach((item, idx) => {
        const isActive = idx === activeIndex;
        const num = `${idx + 1}.`;
        const hintStr = item.hint ? ` ${style.dim(item.hint)}` : '';
        const badgeStr = item.badge ? ` ${item.badge}` : '';
        if (isActive) {
          lines.push(`${style.dim('│')}  ${style.cyan('●')} ${style.bold(style.cyan(`${num} ${item.label}`))}${hintStr}${badgeStr}`);
        } else {
          lines.push(`${style.dim('│')}  ${style.dim('○')} ${style.dim(`${num} ${item.label}`)}${hintStr}${badgeStr}`);
        }
      });

      lines.push(style.dim('│'));
      lines.push(
        `${style.dim('│')}  ${style.dim('Use ')}${style.cyan('↑/↓')}${style.dim(' to navigate, ')}${style.cyan('[Enter]')}${style.dim(' or ')}${style.cyan('1-' + items.length)}${style.dim(' to select, ')}${style.dim('[ESC] to exit')}`
      );

      process.stdout.write(lines.join('\n') + '\n');
      rowsRendered = lines.reduce((acc, line) => acc + getTerminalRows(line), 0);
    };

    const confirmSelection = (selectedIndex) => {
      activeIndex = selectedIndex;

      // Erase the options + tip line
      if (rowsRendered > 0) {
        readline.moveCursor(process.stdout, 0, -rowsRendered);
        readline.cursorTo(process.stdout, 0);
        readline.clearScreenDown(process.stdout);
      }

      // Re-render the frozen list without the tip line
      const frozenLines = [];
      items.forEach((item, idx) => {
        const isActive = idx === activeIndex;
        const num = `${idx + 1}.`;
        const hintStr = item.hint ? ` ${style.dim(item.hint)}` : '';
        const badgeStr = item.badge ? ` ${item.badge}` : '';
        if (isActive) {
          frozenLines.push(`${style.dim('│')}  ${style.cyan('●')} ${style.bold(style.cyan(`${num} ${item.label}`))}${hintStr}${badgeStr}`);
        } else {
          frozenLines.push(`${style.dim('│')}  ${style.dim('○')} ${style.dim(`${num} ${item.label}`)}${hintStr}${badgeStr}`);
        }
      });
      process.stdout.write(frozenLines.join('\n') + '\n');

      restoreTerminal();

      const selected = items[activeIndex];
      if (onConfirm) {
        onConfirm(selected);
      } else {
        ui.confirmed(`Selected: ${style.bold(selected.label)}`);
      }
      resolve(selected.value);
    };

    const onKeypress = (char, key) => {
      if (!key) {
        if (char >= '1' && char <= String(items.length)) {
          confirmSelection(parseInt(char, 10) - 1);
        }
        return;
      }

      // ESC, Ctrl+C, or 'q'
      if (key.name === 'escape' || (key.ctrl && key.name === 'c') || char === 'q') {
        cleanupAndExit();
        return;
      }

      // Up arrow or 'k'
      if (key.name === 'up' || char === 'k') {
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        render(false);
        return;
      }

      // Down arrow or 'j'
      if (key.name === 'down' || char === 'j') {
        activeIndex = (activeIndex + 1) % items.length;
        render(false);
        return;
      }

      // Direct number key selection
      if (char >= '1' && char <= String(items.length)) {
        confirmSelection(parseInt(char, 10) - 1);
        return;
      }

      // Enter / Return
      if (key.name === 'return' || key.name === 'enter') {
        confirmSelection(activeIndex);
        return;
      }
    };

    process.stdin.on('keypress', onKeypress);
    render(true);
  });
}

// -----------------------------------------------------------------------------
// Token Verification
// -----------------------------------------------------------------------------

function checkFigmaToken() {
  if (process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN) {
    return { found: true, source: 'environment variable' };
  }
  const home = os.homedir();
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(home, '.zshrc'),
    path.join(home, '.bashrc'),
    path.join(home, '.profile'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const text = fs.readFileSync(c, 'utf8');
        if (/FIGMA_ACCESS_TOKEN|FIGMA_TOKEN/.test(text)) {
          return { found: true, source: path.basename(c) };
        }
      } catch (_) {}
    }
  }
  return { found: false };
}

// -----------------------------------------------------------------------------
// Skill Installation Logic
// -----------------------------------------------------------------------------

function installSkill(skill, destDir, useSymlink = false, isCursor = false) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const targetPath = path.join(destDir, skill.name);

  if (isCursor) {
    const cursorSkillsDir = path.join(path.dirname(destDir), 'skills', skill.name);
    fs.mkdirSync(path.dirname(cursorSkillsDir), { recursive: true });

    if (fs.existsSync(cursorSkillsDir)) {
      fs.rmSync(cursorSkillsDir, { recursive: true, force: true });
    }
    fs.cpSync(skill.path, cursorSkillsDir, { recursive: true });

    const ruleFile = path.join(destDir, `${skill.name}.mdc`);
    const ruleContent = `---
description: ${skill.description}
globs: *
---

${fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf8')}
`;
    fs.writeFileSync(ruleFile, ruleContent, 'utf8');
    return { targetPath: ruleFile, isCursorRule: true };
  }

  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  if (useSymlink) {
    try {
      fs.symlinkSync(skill.path, targetPath, 'dir');
      return { targetPath, isSymlink: true };
    } catch (e) {
      fs.cpSync(skill.path, targetPath, { recursive: true });
      return { targetPath, isSymlink: false };
    }
  } else {
    fs.cpSync(skill.path, targetPath, { recursive: true });
    const scriptsDir = path.join(targetPath, 'scripts');
    if (fs.existsSync(scriptsDir)) {
      try {
        const scriptFiles = fs.readdirSync(scriptsDir);
        for (const f of scriptFiles) {
          if (f.endsWith('.js')) {
            fs.chmodSync(path.join(scriptsDir, f), 0o755);
          }
        }
      } catch (_) {}
    }
    return { targetPath, isSymlink: false };
  }
}

// -----------------------------------------------------------------------------
// Main Execution
// -----------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printBanner();
    printUsage();
    process.exit(0);
  }

  const availableSkills = getAvailableSkills();

  if (args.includes('--list') || args.includes('-l')) {
    printBanner();
    console.log(style.bold('Available Skills:\n'));
    for (const s of availableSkills) {
      console.log(`  • ${style.bold(style.cyan(s.name))}`);
      console.log(`    ${style.dim(s.description)}\n`);
    }
    process.exit(0);
  }

  printBanner();

  let flagAgent = null;
  let flagSkill = null;
  let flagScope = null;
  let flagDest = null;
  let flagSymlink = args.includes('--symlink');

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--agent' && args[i + 1]) {
      flagAgent = args[++i].toLowerCase();
    } else if (a === '--skill' && args[i + 1]) {
      flagSkill = args[++i];
    } else if (a === '--dest' && args[i + 1]) {
      flagDest = args[++i];
    } else if (a === '--global') {
      flagScope = 'global';
    } else if (a === '--local') {
      flagScope = 'local';
    }
  }

  // 1. SELECT SKILLS
  let selectedSkills = [];
  const figmaExtractor = availableSkills.find((s) => s.name === 'figma-extractor');
  const figmaNodeBuilder = availableSkills.find((s) => s.name === 'figma-node-builder');
  const figmaToCode = availableSkills.find((s) => s.name === 'figma-to-code');

  if (flagSkill) {
    const lower = flagSkill.toLowerCase();
    if (lower === 'all') {
      selectedSkills = availableSkills;
    } else if (lower === 'sdd' || lower === 'suite') {
      selectedSkills = [figmaExtractor, figmaNodeBuilder].filter(Boolean);
    } else {
      const names = flagSkill.split(',').map((x) => x.trim().toLowerCase());
      selectedSkills = availableSkills.filter((s) => names.includes(s.name.toLowerCase()));
      if (selectedSkills.length === 0) {
        console.error(style.yellow(`⚠ No matching skills found for "${flagSkill}".`));
        console.log(`Available skills: ${availableSkills.map((s) => s.name).join(', ')}`);
        process.exit(1);
      }
    }
  } else {
    const skillOptions = [
      {
        label: 'All skills',
        hint: '(recommended: installs figma-to-code, figma-extractor & figma-node-builder)',
        value: 'all',
      },
      {
        label: 'figma-extractor and figma-node-builder',
        hint: '- Spec-Driven Development (SDD) Suite',
        value: 'sdd',
      },
      {
        label: 'figma-to-code',
        hint: '- fast prototyping (URL ──► UI Code)',
        value: 'figma-to-code',
      },
      {
        label: 'figma-extractor',
        hint: '- Figma design scraper (extracts layout AST, tokens & preview images to .specs/)',
        value: 'figma-extractor',
      },
      {
        label: 'figma-node-builder',
        hint: '- Builds UI components from extracted Figma JSON specs (.specs/*.json)',
        value: 'figma-node-builder',
      },
    ];

    const chosenValue = await selectPrompt({
      title: 'Select skills to install:',
      items: skillOptions,
      defaultIndex: 0,
      onConfirm: (item) => {
        let skillsForChoice = [];
        if (item.value === 'all') skillsForChoice = availableSkills;
        else if (item.value === 'sdd') skillsForChoice = [figmaExtractor, figmaNodeBuilder].filter(Boolean);
        else if (item.value === 'figma-to-code') skillsForChoice = [figmaToCode].filter(Boolean);
        else if (item.value === 'figma-extractor') skillsForChoice = [figmaExtractor].filter(Boolean);
        else if (item.value === 'figma-node-builder') skillsForChoice = [figmaNodeBuilder].filter(Boolean);

        ui.confirmed(`Selected ${style.bold(skillsForChoice.length.toString())} skill(s): ${skillsForChoice.map((s) => style.cyan(s.name)).join(', ')}`);
      },
    });

    if (chosenValue === 'all') {
      selectedSkills = availableSkills;
    } else if (chosenValue === 'sdd') {
      selectedSkills = [figmaExtractor, figmaNodeBuilder].filter(Boolean);
    } else if (chosenValue === 'figma-to-code') {
      selectedSkills = [figmaToCode].filter(Boolean);
    } else if (chosenValue === 'figma-extractor') {
      selectedSkills = [figmaExtractor].filter(Boolean);
    } else if (chosenValue === 'figma-node-builder') {
      selectedSkills = [figmaNodeBuilder].filter(Boolean);
    }
  }

  // 2. SELECT AGENT / DESTINATION
  const cwd = process.cwd();
  const agentConfigs = getAgentConfigs(cwd);
  let targetDestinations = [];

  if (flagDest) {
    targetDestinations.push({
      name: 'Custom Directory',
      path: path.resolve(cwd, flagDest),
      isCursor: false,
    });
  } else if (flagAgent) {
    const isGlobal = flagScope !== 'local';
    if (flagAgent === 'all') {
      for (const [key, cfg] of Object.entries(agentConfigs)) {
        targetDestinations.push({
          name: cfg.name,
          path: isGlobal ? cfg.globalPath : cfg.localPath,
          isCursor: !!cfg.isCursorRule,
        });
      }
    } else if (agentConfigs[flagAgent]) {
      const cfg = agentConfigs[flagAgent];
      targetDestinations.push({
        name: cfg.name,
        path: isGlobal ? cfg.globalPath : cfg.localPath,
        isCursor: !!cfg.isCursorRule,
      });
    } else {
      console.error(style.yellow(`⚠ Unknown agent "${flagAgent}". Options: claude, antigravity, cursor, opencode, all`));
      process.exit(1);
    }
  } else {
    const agentsList = [
      { id: 'claude', ...agentConfigs.claude },
      { id: 'antigravity', ...agentConfigs.antigravity },
      { id: 'cursor', ...agentConfigs.cursor },
      { id: 'opencode', ...agentConfigs.opencode },
      { id: 'all', name: 'All detected agents' },
    ];

    const agentOptions = agentsList.map((ag) => ({
      label: ag.name,
      badge: ag.isDetected ? style.green('[Detected on this machine]') : '',
      value: ag,
    }));

    const selectedAgent = await selectPrompt({
      title: 'Which AI coding agent do you use?',
      items: agentOptions,
      defaultIndex: 0,
      onConfirm: (item) => {
        ui.confirmed(`Target agent: ${style.bold(item.label)}${item.value.id === 'cursor' ? ' (.cursor/rules)' : ''}`);
      },
    });

    // Scope selection (Global vs Local)
    let isGlobal = true;
    if (selectedAgent.id !== 'cursor') {
      const scopeOptions = [
        {
          label: 'Global',
          hint: '(recommended: available across all projects on this machine)',
          value: true,
        },
        {
          label: 'Local',
          hint: '(in current project workspace only)',
          value: false,
        },
      ];

      isGlobal = await selectPrompt({
        title: 'Where should skills be installed?',
        items: scopeOptions,
        defaultIndex: 0,
        onConfirm: (item) => {
          ui.confirmed(`Scope: ${style.bold(item.label)}`);
        },
      });
    }

    if (selectedAgent.id === 'all') {
      for (const [key, cfg] of Object.entries(agentConfigs)) {
        if (cfg.isDetected) {
          targetDestinations.push({
            name: cfg.name,
            path: isGlobal ? cfg.globalPath : cfg.localPath,
            isCursor: !!cfg.isCursorRule,
          });
        }
      }
      if (targetDestinations.length === 0) {
        targetDestinations.push({ name: 'Claude Code', path: agentConfigs.claude.globalPath, isCursor: false });
        targetDestinations.push({ name: 'Antigravity', path: agentConfigs.antigravity.globalPath, isCursor: false });
      }
    } else {
      const cfg = agentConfigs[selectedAgent.id];
      targetDestinations.push({
        name: cfg.name,
        path: isGlobal ? cfg.globalPath : cfg.localPath,
        isCursor: !!cfg.isCursorRule,
      });
    }
  }

  // 3. EXECUTE INSTALLATION
  ui.step('Installing skills...');
  for (const dest of targetDestinations) {
    ui.item(`${style.dim('→')} Installing for ${style.bold(dest.name)} at ${style.dim(dest.path)}`);
    for (const skill of selectedSkills) {
      try {
        const res = installSkill(skill, dest.path, flagSymlink, dest.isCursor);
        const detail = res.isCursorRule ? '(rule created)' : res.isSymlink ? '(symlinked)' : '(copied)';
        ui.item(`${style.green('✓')} ${style.bold(skill.name)} ${style.dim(detail)}`);
      } catch (err) {
        ui.item(`${style.yellow('✗')} Failed to install ${skill.name}: ${err.message}`);
      }
    }
  }
  ui.bar();

  // 4. ENVIRONMENT CHECK
  ui.step('Environment check:');
  const tokenStatus = checkFigmaToken();
  if (tokenStatus.found) {
    ui.item(`${style.green('✓')} ${style.bold('FIGMA_ACCESS_TOKEN')} detected via ${tokenStatus.source}`);
  } else {
    ui.item(`${style.yellow('⚠')} ${style.bold('FIGMA_ACCESS_TOKEN')} not detected.`);
    ui.item(`${style.dim('To scrape designs from Figma, set your token:')}`);
    ui.item(`${style.cyan('export FIGMA_ACCESS_TOKEN="figd_your_token_here"')}`);
    ui.item(`${style.dim('or add it to your project\'s .env file.')}`);
  }
  ui.bar();

  ui.done('Done! Skills are installed and ready to use.');

  if (nonTTYInterface) {
    try {
      nonTTYInterface.close();
    } catch (_) {}
  }
  try {
    process.stdin.pause();
  } catch (_) {}
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nFatal error:', err.message);
    process.exit(1);
  });
}

module.exports = {
  selectPrompt,
  getAvailableSkills,
  getAgentConfigs,
  checkFigmaToken,
  installSkill,
  main,
};
