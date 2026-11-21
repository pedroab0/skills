#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { repos } = JSON.parse(readFileSync(join(ROOT, "repos.json"), "utf-8"));
const runnable = repos.filter((r) => r.run);
const requested = process.argv.slice(2);

if (requested.length === 0) {
  console.log("\n  Available services:\n");
  for (const r of runnable) {
    console.log(`  ${r.name.padEnd(18)} ${r.path.padEnd(22)} :${String(r.port ?? "-").padEnd(6)} [${r.run}]`);
  }
  const example = runnable.slice(0, 2).map((r) => r.name).join(" ") || "service-a service-b";
  console.log(`\n  Usage: make run S="${example}"   (BUILD=1 forces rebuild)\n`);
  process.exit(0);
}

const unknown = requested.filter((name) => !runnable.some((r) => r.name === name));
if (unknown.length > 0) {
  console.error(`Unknown service(s): ${unknown.join(", ")}. Run 'make run' to list available services.`);
  process.exit(1);
}

const selected = runnable.filter((r) => requested.includes(r.name));
const dockerNames = selected.filter((r) => r.run === "docker").map((r) => r.name);
const hostRepos = selected.filter((r) => r.run === "host");
const compose = ["compose", "-f", join(ROOT, "docker-compose.dev.yml")];
const children = [];

function stopAll() {
  for (const child of children) child.kill("SIGTERM");
  if (dockerNames.length > 0) spawnSync("docker", [...compose, "stop", ...dockerNames], { stdio: "inherit" });
  process.exit(0);
}
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

if (dockerNames.length > 0) {
  const build = process.env.BUILD ? ["--build"] : [];
  const up = spawnSync("docker", [...compose, "up", "-d", "--wait", ...build, ...dockerNames], { stdio: "inherit" });
  if (up.status !== 0) process.exit(up.status ?? 1);
  if (hostRepos.length === 0) children.push(spawn("docker", [...compose, "logs", "-f", ...dockerNames], { stdio: "inherit" }));
}

for (const repo of hostRepos) {
  // Command comes from the versioned manifest (trusted source), so shell: true is safe here
  children.push(spawn(repo.dev ?? "pnpm dev", { cwd: join(ROOT, repo.path), shell: true, stdio: "inherit" }));
}
