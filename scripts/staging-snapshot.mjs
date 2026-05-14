#!/usr/bin/env node
/**
 * Dumps the *remote* staging D1 database to a timestamped SQL file under
 * scripts/snapshots/. Used to capture state before swapping in demo seed
 * data for screenshot/promo-video shoots — restore later with
 * `npm run staging:restore -- <file>`.
 *
 * Data-only (no schema). The DB already has the schema from migrations;
 * we only need the rows.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const snapshotsDir = resolve(repoRoot, "scripts", "snapshots");
mkdirSync(snapshotsDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
const outFile = resolve(snapshotsDir, `staging-${ts}.sql`);

console.log(`→ Exporting fusionflow-staging (remote) to ${outFile}`);

const res = spawnSync(
  "npx",
  [
    "wrangler",
    "d1",
    "export",
    "fusionflow-staging",
    "--env", "staging",
    "--remote",
    "--no-schema",
    `--output=${outFile}`,
  ],
  { stdio: "inherit", shell: true, cwd: repoRoot },
);

if (res.status !== 0) {
  console.error(`✗ Snapshot failed (exit ${res.status})`);
  process.exit(res.status ?? 1);
}

console.log(`✓ Snapshot written: ${outFile}`);
console.log(`  Restore later with:  npm run staging:restore -- ${outFile}`);
