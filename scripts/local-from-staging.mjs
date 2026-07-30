#!/usr/bin/env node
/**
 * Rebuilds the LOCAL D1 as a replica of staging:
 *
 *   1. wipe the local D1 state
 *   2. replay every migration (`wrangler d1 migrations apply --local`)
 *   3. export staging's rows (data-only, no schema)
 *   4. load those rows into the local DB
 *
 * Step 2 works because the migration chain replays cleanly from scratch again
 * — 0033 used to reference `dynamics_account_id` before 0047 added it, which
 * killed the replay at 0033 and took 0034 with it. See that file's header.
 *
 * Data-only is the right split: the schema comes from migrations (so local
 * matches what a fresh deploy would build) and only the rows come from
 * staging. Verified equivalent to a live schema export — 58 tables / 647
 * columns identical, minus two artifacts prod carries that no migration
 * creates and nothing reads (`milestones`, `projects.crm_case_number`).
 *
 *   npm run db:local:from-staging              # export fresh from staging
 *   npm run db:local:from-staging -- <file>    # reuse an existing snapshot
 *   npm run db:local:from-staging -- --schema-only
 *
 * Note: the dump lands in scripts/snapshots/ (gitignored). It holds real
 * staging rows, so treat it as such.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotsDir = resolve(repoRoot, "scripts", "snapshots");

const argv = process.argv.slice(2);
const schemaOnly = argv.includes("--schema-only");
const reuseFile = argv.find((a) => !a.startsWith("--"));

const run = (label, args) => {
  console.log(`\n→ ${label}`);
  const res = spawnSync("npx", args, { stdio: "inherit", shell: true, cwd: repoRoot });
  if (res.status !== 0) {
    console.error(`✗ ${label} failed (exit ${res.status})`);
    process.exit(res.status ?? 1);
  }
};

// ── 1 + 2: fresh schema straight from the migration chain ───────────────────
// Removing the local D1 dir is what makes this a true from-scratch rebuild;
// `migrations apply` alone would only add what's missing.
const localD1 = resolve(repoRoot, ".wrangler", "state", "v3", "d1");
if (existsSync(localD1)) {
  console.log(`→ Wiping local D1 state (${localD1})`);
  spawnSync(process.platform === "win32" ? "cmd" : "rm",
    process.platform === "win32" ? ["/c", "rmdir", "/s", "/q", localD1] : ["-rf", localD1],
    { stdio: "inherit", shell: false });
}
run("Applying migrations to local D1", ["wrangler", "d1", "migrations", "apply", "fusionflow", "--local"]);

if (schemaOnly) {
  console.log("\n✓ Local D1 rebuilt (schema only — no rows loaded).");
  process.exit(0);
}

// ── 3: staging rows ─────────────────────────────────────────────────────────
let dumpFile = reuseFile ? resolve(repoRoot, reuseFile) : null;
if (dumpFile && !existsSync(dumpFile)) {
  console.error(`✗ No such snapshot: ${dumpFile}`);
  process.exit(1);
}
if (!dumpFile) {
  mkdirSync(snapshotsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  dumpFile = resolve(snapshotsDir, `staging-data-${ts}.sql`);
  run(`Exporting staging rows → ${dumpFile}`, [
    "wrangler", "d1", "export", "fusionflow-staging",
    "--env", "staging", "--remote", "--no-schema", `--output=${dumpFile}`,
  ]);
}

// ── 4: clear migration-seeded rows so the import is a true mirror ───────────
// Several migrations seed reference data (templates / template_stages /
// template_tasks, app_settings, …), so the tables aren't empty after a replay
// and a plain import collides ("UNIQUE constraint failed: templates.id").
// Emptying every data table first is both collision-proof and the correct
// semantics: mirroring staging means staging's rows, not a merge.
const listed = spawnSync("npx", [
  "wrangler", "d1", "execute", "fusionflow", "--local", "--json",
  "--command", `"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'"`,
], { shell: true, cwd: repoRoot, encoding: "utf8" });
if (listed.status !== 0) {
  console.error("✗ Could not list local tables");
  process.exit(listed.status ?? 1);
}
// wrangler prints a banner before the JSON; take from the first bracket.
const jsonText = listed.stdout.slice(listed.stdout.indexOf("["));
const tables = JSON.parse(jsonText)[0].results.map((r) => r.name);

const wipeFile = resolve(snapshotsDir, "_local-wipe.sql");
writeFileSync(wipeFile,
  ["PRAGMA defer_foreign_keys=TRUE;", ...tables.map((t) => `DELETE FROM "${t}";`)].join("\n"));
run(`Clearing ${tables.length} local tables before import`, [
  "wrangler", "d1", "execute", "fusionflow", "--local", `--file=${wipeFile}`,
]);

// ── 5: load staging's rows ──────────────────────────────────────────────────
// The export also carries wrangler's own d1_migrations rows, which would
// collide with what `migrations apply` just wrote. Strip them — local migration
// state belongs to the schema we just built, not to staging's history. The
// export writes one INSERT per line, so a line filter won't split row data.
const raw = readFileSync(dumpFile, "utf8");
const lines = raw.split(/\r?\n/);
const kept = lines.filter((l) => !/^INSERT INTO\s+["'`]?d1_migrations["'`]?/i.test(l));
// Always land the filtered copy in scripts/snapshots/ (gitignored) — a dump
// passed in from elsewhere shouldn't leave staging rows in a tracked directory.
const loadFile = resolve(snapshotsDir, "_local-load.sql");
writeFileSync(loadFile, kept.join("\n"));
console.log(`\n→ Filtered ${lines.length - kept.length} d1_migrations row(s) out of the dump`);

run(`Loading rows into local D1 from ${loadFile}`, [
  "wrangler", "d1", "execute", "fusionflow", "--local", `--file=${loadFile}`,
]);

console.log(`\n✓ Local D1 now mirrors staging.`);
console.log(`  Snapshot kept at: ${dumpFile}`);
console.log(`  Start the app:    npm run dev`);
