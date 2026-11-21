#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { repos } = JSON.parse(readFileSync(join(ROOT, "repos.json"), "utf-8"));
const ignored = new Set(readFileSync(join(ROOT, ".gitignore"), "utf-8").split("\n").map((l) => l.trim()));

const errors = [];
const seen = { name: new Set(), path: new Set(), port: new Set() };
const normalizedPaths = [];

for (const repo of repos) {
  const id = repo.name ?? "<unnamed>";
  for (const field of ["name", "path", "category"]) {
    if (!repo[field]) errors.push(`${id}: missing required field '${field}'`);
  }
  if (repo.name && !/^[a-z][a-z0-9-]*$/.test(repo.name)) errors.push(`${id}: 'name' must be lowercase alphanumeric with hyphens`);
  if (repo.run && !["docker", "host"].includes(repo.run)) errors.push(`${id}: 'run' must be 'docker' or 'host'`);
  if (repo.run && !repo.port) errors.push(`${id}: runnable services require 'port'`);

  for (const key of ["name", "path", "port"]) {
    if (repo[key] == null) continue;
    if (seen[key].has(repo[key])) errors.push(`duplicate ${key}: ${repo[key]}`);
    seen[key].add(repo[key]);
  }

  if (repo.path) {
    if (repo.path.startsWith("/") || repo.path.startsWith("./") || repo.path.includes("..") || repo.path.includes("\\")) {
      errors.push(`${id}: 'path' must be a clean relative forward-slash path (got '${repo.path}')`);
    } else {
      const cleanPath = repo.path.replace(/\/+$/, "");
      normalizedPaths.push({ id, path: cleanPath });
      const topLevel = `/${cleanPath.split("/")[0]}/`;
      if (!ignored.has(topLevel)) errors.push(`${id}: '${topLevel}' is missing from .gitignore (subproject code would be committed to the meta-repo)`);
    }
  }
}

for (const a of normalizedPaths) {
  for (const b of normalizedPaths) {
    if (a.path !== b.path && b.path.startsWith(`${a.path}/`)) {
      errors.push(`nested repository path: '${b.path}' (${b.id}) is inside '${a.path}' (${a.id}) — group sibling repos in a neutral parent folder`);
    }
  }
}

for (const repo of repos) {
  const id = repo.name ?? "<unnamed>";
  if (repo.companion && !seen.name.has(repo.companion)) errors.push(`${id}: companion '${repo.companion}' not found in repos.json`);
  if (repo.companionOf && !seen.name.has(repo.companionOf)) errors.push(`${id}: companionOf '${repo.companionOf}' not found in repos.json`);
}

if (errors.length > 0) {
  console.error(`✗ Invalid manifest (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ Valid manifest (${repos.length} repositories)`);
