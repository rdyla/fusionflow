#!/usr/bin/env node
/**
 * Wraps `wrangler d1 execute ... --file=staging-demo-seed.sql` with a
 * snapshot-existence check so the user can't accidentally blow away
 * staging data without a restore point.
 *
 * Hard-stops unless one of:
 *   * `--force` is passed (e.g. you just took a snapshot a moment ago and
 *     don't want the check), or
 *   * there is at least one file under scripts/snapshots/.
 *
 *   npm run staging:demo-seed
 *   npm run staging:demo-seed -- --force
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot     = resolve(new URL("..", import.meta.url).pathname);
const snapshotsDir = resolve(repoRoot, "scripts", "snapshots");
const seedFile     = resolve(repoRoot, "scripts", "staging-demo-seed.sql");

const force = process.argv.includes("--force");

function hasSnapshot() {
  if (!existsSync(snapshotsDir)) return false;
  return readdirSync(snapshotsDir)
    .filter((f) => f.endsWith(".sql"))
    .some((f) => statSync(resolve(snapshotsDir, f)).size > 0);
}

if (!force && !hasSnapshot()) {
  console.error("✗ No snapshot found under scripts/snapshots/.");
  console.error("");
  console.error("  Running the demo seed will WIPE all customer / solution /");
  console.error("  project / optimize data on STAGING. Take a snapshot first:");
  console.error("");
  console.error("    npm run staging:snapshot");
  console.error("");
  console.error("  Then re-run this command. (Bypass with `-- --force` once");
  console.error("  you've confirmed a snapshot exists outside this directory.)");
  process.exit(1);
}

console.log("→ Executing demo seed against fusionflow-staging (remote)");

const res = spawnSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    "fusionflow-staging",
    "--env", "staging",
    "--remote",
    `--file=${seedFile}`,
  ],
  { stdio: "inherit", shell: true, cwd: repoRoot },
);

if (res.status !== 0) {
  console.error(`✗ Demo seed failed (exit ${res.status})`);
  process.exit(res.status ?? 1);
}

console.log("✓ Demo seed applied. Take your screenshots, then restore with:");
console.log("    npm run staging:restore -- scripts/snapshots/<your-snapshot>.sql");
