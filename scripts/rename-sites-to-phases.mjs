#!/usr/bin/env node
// One-shot rename helper for the sites → phases sweep (migration 0093).
// Operates ONLY on the files that hold project_sites / site_id / SitesPanel
// references — global sweep is unsafe here because "site" appears in many
// unrelated contexts (SharePoint sites, website URLs, physical-location
// counts in the SOW Sizing form, etc.).
//
// Run from repo root: node scripts/rename-sites-to-phases.mjs

import { readFileSync, writeFileSync } from "node:fs";

// Files in scope — verified by `grep -lE "\bproject_sites\b|\bsite_id\b|SitesPanel"`
// at PR-prep time. Excludes:
//   - migration files (historical, don't rewrite)
//   - SOW Sizing / Handoff / Scope-of-Work renderers (they use sites_count,
//     sites_notes for physical-location counts — different concept)
//   - graphService.ts (SharePoint site references)
//   - apolloService / prospecting (website_url)
const FILES = [
  "src/client/components/meetingPrep/MeetingPrepModal.tsx",
  "src/client/components/project/ProjectDashboardTab.tsx",
  "src/client/components/project/SitesPanel.tsx",
  "src/client/lib/api.ts",
  "src/client/pages/ProjectDetailPage.tsx",
  "src/server/lib/healthScore.ts",
  "src/server/routes/meetingPrep.ts",
  "src/server/routes/sites.ts",
  "src/server/routes/stakeholder.ts",
  "src/server/routes/templates.ts",
];

function applyRename(src) {
  let out = src;

  // 1. Explicit identifier renames — these are unambiguous in any of the
  // scoped files. SQL table + FK columns + the panel component.
  const explicit = [
    ["project_sites", "phases"],
    ["site_id",       "phase_id"],
    ["SitesPanel",    "PhasesPanel"],
  ];
  for (const [from, to] of explicit) {
    out = out.split(from).join(to);
  }

  // 2. camelCase / PascalCase compound prefixes (`siteCheck`, `siteName`,
  // `SiteCard`, etc.). Only matches `site`/`Site` immediately followed by an
  // uppercase letter so it doesn't eat unrelated words.
  out = out.replace(/site([A-Z][a-zA-Z0-9]*)/g, "phase$1");
  out = out.replace(/sites([A-Z][a-zA-Z0-9]*)/g, "phases$1");
  out = out.replace(/Site([A-Z][a-zA-Z0-9]*)/g, "Phase$1");
  out = out.replace(/Sites([A-Z][a-zA-Z0-9]*)/g, "Phases$1");

  // 3. Compound suffix (`setSites`, `addSite`, etc.) — Site/Sites at the
  // end of an identifier with a lowercase letter immediately before.
  out = out.replace(/([a-z])Sites\b/g, "$1Phases");
  out = out.replace(/([a-z])Site\b/g, "$1Phase");

  // 4. Stand-alone words (variable / property / display strings).
  out = out.replace(/\bsites\b/g, "phases");
  out = out.replace(/\bSites\b/g, "Phases");
  out = out.replace(/\bsite\b/g, "phase");
  out = out.replace(/\bSite\b/g, "Phase");

  return out;
}

let scanned = 0;
let modified = 0;
for (const rel of FILES) {
  let src;
  try {
    src = readFileSync(rel, "utf8");
  } catch (err) {
    console.warn("skipping", rel, "—", err.message);
    continue;
  }
  scanned++;
  const out = applyRename(src);
  if (out !== src) {
    writeFileSync(rel, out);
    modified++;
    console.log("rewrote", rel);
  }
}
console.log(`\nscanned ${scanned} files · rewrote ${modified}`);
