#!/usr/bin/env node
/**
 * Restores a snapshot SQL file back into the *remote* staging D1 database.
 *
 *   npm run staging:restore -- scripts/snapshots/staging-2026-05-14_10-30-00.sql
 *
 * Two passes:
 *   1. Wipe data tables (staging-wipe-data.sql) so the snapshot's INSERTs
 *      don't collide with rows seeded by the demo-seed run that we're
 *      reverting.
 *   2. Replay the snapshot file.
 *
 * Users / templates / app_settings / labor_config are *not* wiped — those
 * are kept stable across snapshot/seed cycles.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wipeSql = resolve(repoRoot, "scripts", "staging-wipe-data.sql");

const snapshotArg = process.argv[2];
if (!snapshotArg) {
  console.error("Usage: npm run staging:restore -- <path-to-snapshot.sql>");
  process.exit(1);
}
const snapshotPath = resolve(repoRoot, snapshotArg);
if (!existsSync(snapshotPath)) {
  console.error(`✗ Snapshot file not found: ${snapshotPath}`);
  process.exit(1);
}

// `wrangler d1 export --no-schema` includes rows for D1's own bookkeeping
// table d1_migrations (and possibly sqlite_*/_cf_* internals). Those rows
// already exist on the target DB, so replaying them collides on PRIMARY
// KEY. Strip them to a filtered copy before handing to wrangler.
const SYSTEM_TABLE_INSERT = /^INSERT\s+INTO\s+["'`]?(d1_migrations|sqlite_[a-z_]+|_cf_[a-z_]+)["'`]?\s/i;
const filteredPath = `${snapshotPath}.filtered.sql`;
const original = readFileSync(snapshotPath, "utf8");
const filteredLines = original.split(/\r?\n/).filter((line) => !SYSTEM_TABLE_INSERT.test(line));
const droppedCount = original.split(/\r?\n/).length - filteredLines.length;
writeFileSync(filteredPath, filteredLines.join("\n"), "utf8");
if (droppedCount > 0) {
  console.log(`→ Filtered ${droppedCount} system-table INSERT line(s) from snapshot`);
}

function executeSql(label, file) {
  console.log(`→ ${label}: ${file}`);
  const res = spawnSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "fusionflow-staging",
      "--env", "staging",
      "--remote",
      `--file=${file}`,
    ],
    { stdio: "inherit", shell: true, cwd: repoRoot },
  );
  if (res.status !== 0) {
    console.error(`✗ ${label} failed (exit ${res.status})`);
    process.exit(res.status ?? 1);
  }
}

executeSql("Wipe data tables", wipeSql);
executeSql("Replay snapshot",   filteredPath);

console.log("✓ Restore complete.");
