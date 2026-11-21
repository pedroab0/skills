#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { repos } = JSON.parse(readFileSync(join(ROOT, "repos.json"), "utf-8"));

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const opts = {
  https: flag("https"),
  dryRun: flag("dry-run"),
  all: flag("all"),
  legacy: flag("legacy"),
  category: option("category"),
  product: option("product"),
};

function isSelected(repo) {
  if (opts.legacy) return repo.category === "legacy";
  if (!opts.all && repo.category === "legacy") return false; // exclude legacy by default
  if (opts.category && repo.category !== opts.category) return false;
  if (opts.product && repo.product !== opts.product) return false;
  return true;
}

// git@host:org/repo.git -> https://host/org/repo.git (works with any Git host)
const toHttps = (url) => url.replace(/^git@([^:]+):/, "https://$1/");

function git(gitArgs, cwd) {
  if (opts.dryRun) {
    console.log(`    (dry-run) git ${gitArgs.join(" ")}`);
    return true;
  }
  return spawnSync("git", gitArgs, { cwd, stdio: "inherit" }).status === 0;
}

const summary = { cloned: [], updated: [], skipped: [], failed: [] };

for (const repo of repos.filter(isSelected)) {
  const target = join(ROOT, repo.path);

  if (!repo.remote) {
    summary.skipped.push(`${repo.name} (no remote)`);
    continue;
  }

  const remote = opts.https ? toHttps(repo.remote) : repo.remote;

  if (existsSync(join(target, ".git"))) {
    console.log(`[UPDATE] ${repo.name}`);
    const ok = git(["fetch", "--all", "--prune"], target);
    (ok ? summary.updated : summary.failed).push(repo.name);
    continue;
  }

  console.log(`[CLONE]  ${repo.name} -> ${repo.path}`);
  if (!opts.dryRun) mkdirSync(dirname(target), { recursive: true });
  const branchArgs = repo.branch ? ["--branch", repo.branch] : [];
  let ok = git(["clone", ...branchArgs, remote, target]);
  if (ok && repo.ref) ok = git(["checkout", "--quiet", repo.ref], target); // optional ref pinning
  (ok ? summary.cloned : summary.failed).push(repo.name);
}

console.log(
  `\nCloned: ${summary.cloned.length} · Updated: ${summary.updated.length} · ` +
    `Skipped: ${summary.skipped.length} · Failed: ${summary.failed.length}`,
);
for (const item of summary.skipped) console.log(`  - skipped: ${item}`);
for (const item of summary.failed) console.log(`  ✗ failed:  ${item}`);
process.exit(summary.failed.length > 0 ? 1 : 0);
