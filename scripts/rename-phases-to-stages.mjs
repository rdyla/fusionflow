#!/usr/bin/env node
// One-shot rename helper for the phases → stages sweep (migration 0092).
// Skips JSON assets and a small set of customer-rollout-phase identifiers
// that are NOT lifecycle concepts.
//
// Run from repo root: node scripts/rename-phases-to-stages.mjs

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["src/server", "src/client", "src/shared"];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".wrangler", ".vscode"]);
const SKIP_EXTS = new Set([".json", ".lock", ".png", ".jpg", ".svg", ".pdf", ".ico", ".woff", ".woff2"]);
// Files that contain customer-rollout-phase identifiers (phase_1_*, future_phase_*,
// yes_phase_1, etc.) — those refer to the customer's deployment phases, not our
// project lifecycle. We skip these files entirely; the next rename PR (sites →
// phases) will not touch them either.
const SKIP_FILES = new Set([
  "src/client/lib/needsAssessmentLibrary.ts",
  "src/client/components/solutioning/SowSizingForm.tsx",
]);

// Compound identifiers we want preserved untouched. Each is replaced with a
// sentinel before the global sweep and restored after. This is the safety
// belt for any English-adjective "phased" / customer-rollout strings.
const PRESERVE = [
  "phased_scope",
  "phased cutover",
  "phased methodology",
  "PMI-aligned phased",
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (st.isFile()) yield full;
  }
}

function applyRename(src) {
  // Step 1: stash preserved phrases behind sentinels.
  const sentinels = new Map();
  let stashed = src;
  PRESERVE.forEach((needle, i) => {
    const token = `__PRESERVE_${i}__`;
    if (stashed.includes(needle)) {
      sentinels.set(token, needle);
      stashed = stashed.split(needle).join(token);
    }
  });

  let out = stashed;

  // Step 2: explicit identifier-level renames (compound names where word
  // boundaries won't catch a Phase/phases sitting mid-identifier).
  const explicit = [
    ["template_phases", "template_stages"],
    ["TemplatePhase", "TemplateStage"],
    ["templatePhases", "templateStages"],
    ["PHASE_KEYWORDS", "STAGE_KEYWORDS"],
  ];
  for (const [from, to] of explicit) {
    out = out.split(from).join(to);
  }

  // Step 3: snake_case lifecycle fields — narrowly scoped so we don't catch
  // `phase_1` / `phased_scope` / etc.
  const snake = [
    ["phase_id", "stage_id"],
    ["phase_name", "stage_name"],
    ["phase_count", "stage_count"],
    ["phase_progress", "stage_progress"],
    ["phase_columns", "stage_columns"],
    ["phase_pattern", "stage_pattern"],
    // NOTE: phases_count / phases_notes are NOT renamed — they refer to
    // customer rollout phases (go-lives), which align with the new "phases"
    // concept after the sites→phases follow-up rename.
    ["phases_created", "stages_created"],
    ["phases_inserted", "stages_inserted"],
    ["phases_shifted", "stages_shifted"],
  ];
  for (const [from, to] of snake) {
    out = out.split(from).join(to);
  }

  // Step 4: camelCase / PascalCase compound identifiers. `phase` followed by
  // an uppercase letter (or `phases` followed by uppercase) — rename just
  // the phase/phases prefix.
  out = out.replace(/phase([A-Z][a-zA-Z0-9]*)/g, "stage$1");
  out = out.replace(/Phase([A-Z][a-zA-Z0-9]*)/g, "Stage$1");
  out = out.replace(/phases([A-Z][a-zA-Z0-9]*)/g, "stages$1");
  out = out.replace(/Phases([A-Z][a-zA-Z0-9]*)/g, "Stages$1");

  // Step 4b: Phase/Phases at the END of an identifier (preceded by a
  // lowercase letter). Covers `updatePhase`, `deletePhase`, `newPhases`,
  // `setPhases`, `collapsedPhases`, etc. The trailing `\b` keeps
  // `Phased` adjective forms from matching (no boundary inside `Phased`).
  out = out.replace(/([a-z])Phases\b/g, "$1Stages");
  out = out.replace(/([a-z])Phase\b/g, "$1Stage");

  // Step 4c: snake_case lifecycle word in the middle of compound id (covers
  // `_phase_breakdown`, etc.). The `_1`/`_2` rollout-phase ids are excluded
  // because we don't touch *_phase_<digit>.
  out = out.replace(/_phase_(?=[a-zA-Z])/g, "_stage_");

  // Step 5: stand-alone words via word boundaries.
  out = out.replace(/\bphases\b/g, "stages");
  out = out.replace(/\bPhases\b/g, "Stages");
  out = out.replace(/\bphase\b/g, "stage");
  out = out.replace(/\bPhase\b/g, "Stage");

  // Step 6: restore the preserved phrases.
  for (const [token, original] of sentinels) {
    out = out.split(token).join(original);
  }

  return out;
}

let scanned = 0;
let modified = 0;
for (const root of ROOTS) {
  try {
    statSync(root);
  } catch {
    continue;
  }
  for (const file of walk(root)) {
    if (SKIP_EXTS.has(extname(file))) continue;
    const rel = file.replace(/\\/g, "/");
    if (SKIP_FILES.has(rel)) continue;
    scanned++;
    const src = readFileSync(file, "utf8");
    if (!/[pP]hase/.test(src)) continue;
    const out = applyRename(src);
    if (out !== src) {
      writeFileSync(file, out);
      modified++;
      console.log("rewrote", rel);
    }
  }
}
console.log(`\nscanned ${scanned} files · rewrote ${modified}`);
