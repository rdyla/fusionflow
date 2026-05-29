/**
 * Combo SOW merger — unifies two or more SowVariants into a single variant
 * for projects with multiple solution_types (UCaaS + CCaaS, UCaaS + CI, etc.).
 *
 * Strategy (per Ryan's spec):
 *   - § 2 stage activities: one unified chain with merged bullets per stage.
 *     Identical bullets across variants are deduped (case-insensitive trim).
 *   - § 1.3 Scope at a Glance: union of all rows, deduped by element name.
 *   - Engagement Snapshot tiles: 4 representative tiles drawn from the
 *     combined pool — Locations + each variant's primary seat + final go-live.
 *   - § 2.9 Engineering & Integration: union, deduped.
 *   - § 2.10 Optional services (bullets + priced table): union, deduped by
 *     bullet text / table row name.
 *   - § 3 Deliverables: union, deduped by name. ID collisions get a suffix.
 *   - Hero image: the first variant's heroImageKey wins.
 *   - isStub: true if ANY variant in the combo is a stub.
 *   - Training: longest "included" string wins (heuristic for completeness).
 *   - E911 footnote: shown if any variant requests it.
 */

import type { SowVariant, SnapshotTile, OptionalService, Deliverable, StageSection } from "./types";

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const key = it.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function mergeStages(variants: SowVariant[]): StageSection[] {
  // Pivot by stage number ("2.2", "2.3", …). Use the first variant that
  // declares each number as the structural anchor (title, intro come from
  // it); merge bullets / subsections from the others on top.
  const byNumber = new Map<string, StageSection>();

  for (const variant of variants) {
    for (const stage of variant.stages) {
      const existing = byNumber.get(stage.number);
      if (!existing) {
        // First time we see this stage — clone it (deep-ish, but StageSection
        // bullets/subsections are arrays of primitives or shallow objects).
        byNumber.set(stage.number, {
          number: stage.number,
          title: stage.title,
          intro: stage.intro,
          bullets: stage.bullets ? [...stage.bullets] : undefined,
          subsections: stage.subsections ? stage.subsections.map((s) => ({
            number: s.number, title: s.title, intro: s.intro, bullets: [...s.bullets],
          })) : undefined,
        });
        continue;
      }
      // Merge top-level bullets.
      if (stage.bullets && stage.bullets.length > 0) {
        existing.bullets = dedupeStrings([...(existing.bullets ?? []), ...stage.bullets]);
      }
      // Merge subsections.
      if (stage.subsections && stage.subsections.length > 0) {
        if (!existing.subsections) existing.subsections = [];
        for (const sub of stage.subsections) {
          // Match by subsection number first, else by title (case-insensitive).
          const matched = existing.subsections.find((s) =>
            (sub.number && s.number === sub.number) ||
            (sub.title && s.title && s.title.toLowerCase() === sub.title.toLowerCase())
          );
          if (matched) {
            matched.bullets = dedupeStrings([...matched.bullets, ...sub.bullets]);
            if (!matched.intro && sub.intro) matched.intro = sub.intro;
          } else {
            existing.subsections.push({
              number: sub.number, title: sub.title, intro: sub.intro, bullets: [...sub.bullets],
            });
          }
        }
      }
    }
  }

  // Sort by stage number ("2.2" < "2.3" < … < "2.7").
  return [...byNumber.values()].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

function mergeOptionalServices(variants: SowVariant[]): OptionalService[] {
  const out: OptionalService[] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    for (const svc of v.optionalServicesTable) {
      const key = svc.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(svc);
    }
  }
  return out;
}

function mergeDeliverables(variants: SowVariant[]): Deliverable[] {
  // Dedupe by name (case-insensitive). When variants have the same name
  // with different IDs, the first variant's ID wins; subsequent IDs get
  // renumbered so the final list reads D1, D2, … consecutively.
  const out: Deliverable[] = [];
  const seenNames = new Set<string>();
  for (const v of variants) {
    for (const d of v.deliverables) {
      const key = d.name.trim().toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      out.push(d);
    }
  }
  return out.map((d, i) => ({ ...d, id: `D${i + 1}` }));
}

function pickSnapshotTiles(variants: SowVariant[]): [SnapshotTile, SnapshotTile, SnapshotTile, SnapshotTile] {
  // Always lead with Locations (every variant has it as tile 0).
  const locationsTile = variants[0].snapshotTiles[0];

  // Then take each variant's primary seat tile (variant.snapshotTiles[1]),
  // up to 3 of them. If we still have room, fill with the final go-live
  // marker so the snapshot ends on a customer-relevant number.
  const primaryTiles: SnapshotTile[] = variants.map((v) => v.snapshotTiles[1]);

  // Catch-all 4th tile when we have fewer than 3 primary seat tiles to draw on.
  // Falls back to the issue date as the last data point — better than blank.
  const filler: SnapshotTile = {
    label: "Go-live events",
    value: (ctx) => String(ctx.goLiveCount || 0),
  };

  const tiles: SnapshotTile[] = [locationsTile, ...primaryTiles.slice(0, 3)];
  while (tiles.length < 4) tiles.push(filler);
  return [tiles[0], tiles[1], tiles[2], tiles[3]] as [SnapshotTile, SnapshotTile, SnapshotTile, SnapshotTile];
}

function mergeScopeAtAGlance(variants: SowVariant[]): SowVariant["scopeAtAGlance"] {
  const out: SowVariant["scopeAtAGlance"] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    for (const row of v.scopeAtAGlance) {
      const key = row.element.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

/**
 * Merge two or more variants into a single combo variant. Caller is
 * responsible for handing variants in a consistent order — the first
 * variant's title becomes the lead in the combined product line.
 */
export function mergeVariants(variants: SowVariant[]): SowVariant {
  if (variants.length === 0) throw new Error("mergeVariants requires at least one variant");
  if (variants.length === 1) return variants[0];

  const primary = variants[0];
  const productLines = variants.map((v) => v.productLine.replace(/ Professional Services$/, ""));
  const combinedProductLine = `${productLines.join(" + ")} Professional Services`;

  // Project reference template — pick the first variant's vendor flavor and
  // join the product hints (e.g., "Zoom UCaaS + CCaaS Implementation").
  const refHints = variants.map((v) => {
    const m = v.projectReferenceTemplate.match(/^(.+?) Implementation/);
    return m ? m[1] : v.id.toUpperCase();
  });
  const combinedRefTemplate = `${refHints.join(" + ")} Implementation – {customer}`;

  return {
    id: primary.id,
    vendor: primary.vendor,
    productLine: combinedProductLine,
    projectReferenceTemplate: combinedRefTemplate,
    snapshotTiles: pickSnapshotTiles(variants),
    scopeAtAGlance: mergeScopeAtAGlance(variants),
    stages: mergeStages(variants),
    trainingIncluded: variants.map((v) => v.trainingIncluded).sort((a, b) => b.length - a.length)[0],
    trainingOptional: variants.map((v) => v.trainingOptional).filter(Boolean).sort((a, b) => (b?.length ?? 0) - (a?.length ?? 0))[0] ?? null,
    engineeringAndIntegration: dedupeStrings(variants.flatMap((v) => v.engineeringAndIntegration)),
    optionalServiceBullets: dedupeStrings(variants.flatMap((v) => v.optionalServiceBullets)),
    optionalServicesTable: mergeOptionalServices(variants),
    deliverables: mergeDeliverables(variants),
    outOfScopeOverride: undefined, // Combos fall back to the shared out-of-scope list.
    showE911Footnote: variants.some((v) => v.showE911Footnote),
    isStub: variants.some((v) => v.isStub),
    heroImageKey: variants.find((v) => v.heroImageKey)?.heroImageKey,
  };
}
