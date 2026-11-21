#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARK_START = "# >>> meta-repo CLI >>>";
const MARK_END = "# <<< meta-repo CLI <<<";
const VALID_NAME = /^[a-z][a-z0-9_-]{1,30}$/;
const RESERVED = new Set(["git", "make", "node", "npm", "pnpm", "docker", "code", "test", "cd", "ls", "rm", "sh", "bash", "zsh", "fish", "sudo"]);

const args = process.argv.slice(2);
const uninstall = args.includes("--uninstall");
const nameArg = args.find((a) => a.startsWith("--name="))?.split("=")[1];

function detectRcFile() {
  const shell = process.env.SHELL ?? "";
  const home = homedir();
  if (shell.endsWith("zsh")) return { kind: "posix", file: join(process.env.ZDOTDIR ?? home, ".zshrc") };
  if (shell.endsWith("bash")) {
    const profile = join(home, ".bash_profile");
    return { kind: "posix", file: existsSync(profile) ? profile : join(home, ".bashrc") };
  }
  if (shell.endsWith("fish")) return { kind: "fish", file: join(home, ".config", "fish", "config.fish") };
  return null;
}

// Safe: only called with names already validated against VALID_NAME
const commandExists = (name) => spawnSync("sh", ["-c", `command -v ${name}`], { stdio: "ignore" }).status === 0;

function validate(name) {
  if (!VALID_NAME.test(name)) return "use lowercase letters, numbers, '-' or '_', starting with a letter (2–31 chars)";
  if (RESERVED.has(name) || commandExists(name)) return `'${name}' is already an existing system command`;
  return null;
}

function stripBlock(content) {
  const start = content.indexOf(MARK_START);
  const end = content.indexOf(MARK_END);
  if (start === -1 || end === -1) return content;
  return (content.slice(0, start) + content.slice(end + MARK_END.length)).replace(/\n{3,}/g, "\n\n");
}

function buildBlock(kind, name) {
  const cmd = `make --no-print-directory -C "${ROOT}"`;
  const body = kind === "fish" ? `function ${name}\n    ${cmd} $argv\nend` : `${name}() {\n  ${cmd} "$@"\n}`;
  return `${MARK_START}\n${body}\n${MARK_END}\n`;
}

async function askName(defaultName) {
  if (nameArg) return nameArg;
  if (!process.stdin.isTTY) return defaultName; // non-interactive fallback
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (await rl.question(`  CLI command name [${defaultName}]: `)).trim().toLowerCase();
      const candidate = answer || defaultName;
      const error = validate(candidate);
      if (!error) return candidate;
      console.log(`  ✗ ${error}. Please try again.`);
    }
  } finally {
    rl.close();
  }
}

const target = detectRcFile();
if (!target) {
  console.error(`Unsupported shell: ${process.env.SHELL ?? "unknown"}. On Windows, use WSL2 or add a PowerShell function manually to $PROFILE.`);
  process.exit(1);
}

mkdirSync(dirname(target.file), { recursive: true });
const current = existsSync(target.file) ? readFileSync(target.file, "utf-8") : "";
const cleaned = stripBlock(current);

if (uninstall) {
  writeFileSync(target.file, cleaned);
  console.log(`✓ CLI removed from ${target.file}. Open a new terminal to apply.`);
  process.exit(0);
}

const sanitized = basename(ROOT).toLowerCase().replace(/[^a-z0-9_-]/g, "");
const defaultName = VALID_NAME.test(sanitized) ? sanitized : "workspace";

console.log("\n  Workspace CLI Installer\n  ───────────────────────");
const name = await askName(defaultName);
const error = validate(name);
if (error) {
  console.error(`  ✗ ${error}.`);
  process.exit(1);
}

const prefix = cleaned.trimEnd();
const block = buildBlock(target.kind, name);
writeFileSync(target.file, prefix ? `${prefix}\n\n${block}` : block);
console.log(`\n  ✓ Command '${name}' configured in ${target.file}`);
console.log(`  → Activate now with: source ${target.file}`);
console.log(`  → Run '${name} <command>' (e.g., '${name} status') from any subdirectory.\n`);
