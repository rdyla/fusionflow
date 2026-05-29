/**
 * SOW catalog assembler.
 *
 * Takes a solution's `(vendor, solution_types)` tuple and walks every
 * catalog file, filtering entries whose `appliesTo` and `vendor` tags
 * are compatible. Produces a fully-formed `SowVariant` — the same
 * shape the renderer in `buildHtml.ts` already consumes, so nothing
 * downstream has to change.
 *
 * Replaces both:
 *   - `variants/index.ts::resolveSowVariant` — looking up one of seven
 *     monolithic variant files
 *   - `merge.ts::mergeVariants` — the special-case path that merged
 *     two variants for combo SOWs
 *
 * Combo SOWs are now natural composition: an entry tagged ucaas+ccaas
 * fires for both, a ucaas-only entry fires for any solution containing
 * ucaas (including the combo). Adding a new tech type means adding
 * catalog entries with that type's tag — no new variant file required.
 */

import type {
  Applicability,
  DeliverableEntry,
  SnapshotTile,
  Subsection,
  VariantMeta,
} from "./types";
import { STAGE_ORDER } from "./types";
import type {
  Deliverable,
  OptionalService,
  SnapshotTile as RenderedSnapshotTile,
  SowSolutionTypeKey,
  SowVariant,
  SowVendorKey,
  StageSection,
  StageSubsection,
} from "../types";

import { VARIANT_META, FALLBACK_VARIANT_META } from "./variantMeta";
import { SNAPSHOT_TILES } from "./snapshotTiles";
import { SCOPE_ITEMS } from "./scopeItems";
import { STAGE_INTROS, SUBSECTIONS } from "./stageContent";
import { ENGINEERING, OPTIONAL_BULLETS, OPTIONAL_ROWS } from "./services";
import { DELIVERABLES } from "./deliverables";

// ── Applicability filter ────────────────────────────────────────────────────

function matches(
  applicability: Applicability,
  solutionTypes: readonly SowSolutionTypeKey[],
  vendor: SowVendorKey,
): boolean {
  const appliesTo = applicability.appliesTo;
  const vendorFilter = applicability.vendor;
  // Type filter: untagged = applies to all; otherwise at least one match.
  const typeOk = !appliesTo || appliesTo.length === 0
    || appliesTo.some((t) => solutionTypes.includes(t));
  // Vendor filter: untagged = applies to all; otherwise vendor must match.
  const vendorOk = !vendorFilter || vendorFilter.length === 0
    || vendorFilter.includes(vendor);
  return typeOk && vendorOk;
}

// ── Variant meta picker ─────────────────────────────────────────────────────
// Find the entry whose `appliesTo` is the most-specific subset of the
// solution's types — combo signatures win over single-type fallbacks.

function pickVariantMeta(
  solutionTypes: readonly SowSolutionTypeKey[],
  vendor: SowVendorKey,
): VariantMeta {
  const eligible = VARIANT_META.filter((m) => matches(m, solutionTypes, vendor));
  if (eligible.length === 0) {
    // Build a synthetic entry from the fallback so the return shape stays valid.
    return { ...FALLBACK_VARIANT_META };
  }
  // Specificity = number of `appliesTo` keys that match the solution's types.
  // Higher specificity wins; priority breaks ties.
  function specificity(m: VariantMeta): number {
    if (!m.appliesTo || m.appliesTo.length === 0) return 0;
    return m.appliesTo.filter((t) => solutionTypes.includes(t)).length;
  }
  eligible.sort((a, b) => {
    const spec = specificity(b) - specificity(a);
    if (spec !== 0) return spec;
    return (b.priority ?? 0) - (a.priority ?? 0);
  });
  return eligible[0];
}

// ── Snapshot tiles ──────────────────────────────────────────────────────────

function pickSnapshotTiles(
  solutionTypes: readonly SowSolutionTypeKey[],
  vendor: SowVendorKey,
): [RenderedSnapshotTile, RenderedSnapshotTile, RenderedSnapshotTile, RenderedSnapshotTile] {
  const eligible = SNAPSHOT_TILES
    .filter((t) => matches(t, solutionTypes, vendor))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  // Dedupe by label (a vendor-tagged tile and an untagged shadow shouldn't both win).
  const seen = new Set<string>();
  const picked: SnapshotTile[] = [];
  for (const t of eligible) {
    if (seen.has(t.label)) continue;
    seen.add(t.label);
    picked.push(t);
    if (picked.length === 4) break;
  }

  // Pad with empty tiles if a thin variant somehow produced <4. Renderer
  // expects exactly 4 — keep that invariant.
  while (picked.length < 4) {
    picked.push({ label: "—", value: () => "—" });
  }

  // Drop the catalog-internal fields (appliesTo / vendor / priority) for render.
  return picked.slice(0, 4).map((t) => ({ label: t.label, value: t.value })) as
    [RenderedSnapshotTile, RenderedSnapshotTile, RenderedSnapshotTile, RenderedSnapshotTile];
}

// ── Scope at a Glance ───────────────────────────────────────────────────────

function pickScopeItems(
  solutionTypes: readonly SowSolutionTypeKey[],
  vendor: SowVendorKey,
): Array<{ element: string; quantity: string; notes: string }> {
  const eligible = SCOPE_ITEMS
    .filter((i) => matches(i, solutionTypes, vendor))
    .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100));

  // Dedupe by element name — vendor-specific entries clobber generic ones
  // because they sort to the same position; first match wins after sort.
  const seen = new Set<string>();
  const out: Array<{ element: string; quantity: string; notes: string }> = [];
  for (const i of eligible) {
    if (seen.has(i.element)) continue;
    seen.add(i.element);
    out.push({ element: i.element, quantity: i.quantity, notes: i.notes });
  }
  return out;
}

// ── Stages (intros + subsections per stage) ─────────────────────────────────

function pickStageIntro(
  stage: typeof STAGE_ORDER[number]["key"],
  solutionTypes: readonly SowSolutionTypeKey[],
  vendor: SowVendorKey,
): string | undefined {
  const eligible = STAGE_INTROS
    .filter((s) => s.stage === stage && matches(s, solutionTypes, vendor))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return eligible[0]?.intro;
}

function pickSubsections(
  stage: typeof STAGE_ORDER[number]["key"],
  solutionTypes: readonly SowSolutionTypeKey[],
  vendor: SowVendorKey,
): StageSubsection[] {
  const eligible = SUBSECTIONS
    .filter((s) => s.stage === stage && matches(s, solutionTypes, vendor))
    .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100));

  // Dedupe by title — vendor-tagged content overrides generic.
  const seen = new Set<string>();
  const picked: Subsection[] = [];
  for (const s of eligible) {
    const key = s.title ?? `__no-title-${picked.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(s);
  }

  return picked.map((s) => ({
    // Renderer auto-numbers within the stage if `number` is omitted; we
    // assign sequential numbers here so combo SOWs renumber sanely.
    title: s.title,
    intro: s.intro,
    bullets: s.bullets,
  }));
}

function buildStages(
  solutionTypes: readonly SowSolutionTypeKey[],
  vendor: SowVendorKey,
): StageSection[] {
  return STAGE_ORDER.map((stage) => {
    const subs = pickSubsections(stage.key, solutionTypes, vendor);
    const intro = pickStageIntro(stage.key, solutionTypes, vendor);
    // Closing stage in the original Zoom UCaaS variant uses top-level
    // `bullets` rather than subsections (it's a short stage). If only
    // one untitled subsection comes back, flatten it for that look.
    if (subs.length === 1 && !subs[0].title) {
      return {
        number: stage.number,
        title: stage.title,
        intro,
        bullets: subs[0].bullets,
      };
    }
    // Number subsections sequentially within the stage: 2.3.1 / 2.3.2 / …
    const numbered: StageSubsection[] = subs.map((s, idx) => ({
      number: `${stage.number}.${idx + 1}`,
      title: s.title,
      intro: s.intro,
      bullets: s.bullets,
    }));
    return {
      number: stage.number,
      title: stage.title,
      intro,
      subsections: numbered,
    };
  });
}

// ── Engineering / optional services / deliverables ─────────────────────────

function pickEngineering(
  solutionTypes: readonly SowSolutionTypeKey[],
  vendor: SowVendorKey,
): string[] {
  const eligible = ENGINEERING
    .filter((e) => matches(e, solutionTypes, vendor))
    .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of eligible) {
    if (seen.has(e.bullet)) continue;
    seen.add(e.bullet);
    out.push(e.bullet);
  }
  return out;
}

function pickOptionalBullets(
  solutionTypes: readonly SowSolutionTypeKey[],
  vendor: SowVendorKey,
): string[] {
  const eligible = OPTIONAL_BULLETS
    .filter((b) => matches(b, solutionTypes, vendor))
    .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of eligible) {
    if (seen.has(b.bullet)) continue;
    seen.add(b.bullet);
    out.push(b.bullet);
  }
  return out;
}

function pickOptionalRows(
  solutionTypes: readonly SowSolutionTypeKey[],
  vendor: SowVendorKey,
): OptionalService[] {
  const eligible = OPTIONAL_ROWS
    .filter((r) => matches(r, solutionTypes, vendor))
    .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100));
  const seen = new Set<string>();
  const out: OptionalService[] = [];
  for (const r of eligible) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    out.push({ name: r.name, unit: r.unit, fee: r.fee });
  }
  return out;
}

function pickDeliverables(
  solutionTypes: readonly SowSolutionTypeKey[],
  vendor: SowVendorKey,
): Deliverable[] {
  const eligible = DELIVERABLES
    .filter((d) => matches(d, solutionTypes, vendor))
    .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100));
  const seen = new Set<string>();
  const picked: DeliverableEntry[] = [];
  for (const d of eligible) {
    if (seen.has(d.name)) continue;
    seen.add(d.name);
    picked.push(d);
  }
  // Assign D1..Dn at assembly time so the rendered list is always consecutive.
  return picked.map((d, idx) => ({
    id: `D${idx + 1}`,
    name: d.name,
    format: d.format,
    acceptanceCriteria: d.acceptanceCriteria,
  }));
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Build a fully-formed SowVariant from the catalog for the given solution.
 * Drop-in replacement for the old `resolveSowVariant` + `mergeVariants`
 * combination. Returns a variant with `isStub: false` since combo composition
 * is now a first-class operation rather than a placeholder warning.
 */
export function assembleSowFromCatalog(
  vendor: string | null,
  solutionTypes: readonly string[],
): SowVariant {
  // Normalize inputs to the catalog's vocabulary. Unknown vendor falls through
  // as `tbd`; unknown solution types are filtered out so they can't match
  // anything (the renderer still produces a usable doc).
  const v: SowVendorKey = vendor === "zoom" || vendor === "ringcentral" ? vendor : "tbd";
  const allowed = new Set<SowSolutionTypeKey>(["ucaas", "ccaas", "ci", "va", "rc_air"]);
  const types = solutionTypes
    .map((t) => (t ?? "").toLowerCase())
    .filter((t): t is SowSolutionTypeKey => allowed.has(t as SowSolutionTypeKey));

  const meta = pickVariantMeta(types, v);
  const stages = buildStages(types, v);
  const snapshotTiles = pickSnapshotTiles(types, v);
  const scopeAtAGlance = pickScopeItems(types, v);
  const engineeringAndIntegration = pickEngineering(types, v);
  const optionalServiceBullets = pickOptionalBullets(types, v);
  const optionalServicesTable = pickOptionalRows(types, v);
  const deliverables = pickDeliverables(types, v);

  return {
    // Pick the first matching solution_type as the variant's "primary"
    // identifier for downstream code that branches on `variant.id`. Combo
    // SOWs report their first-listed type; nothing structural depends on
    // this beyond legacy callers (which the catalog has replaced).
    id: (types[0] ?? "ucaas") as SowSolutionTypeKey,
    vendor: v,
    productLine: meta.productLine,
    projectReferenceTemplate: meta.projectReferenceTemplate,
    heroImageKey: meta.heroImageKey,
    showE911Footnote: meta.showE911Footnote === true,
    trainingIncluded: meta.trainingIncluded,
    trainingOptional: meta.trainingOptional ?? null,
    isStub: false,
    snapshotTiles,
    scopeAtAGlance,
    stages,
    engineeringAndIntegration,
    optionalServiceBullets,
    optionalServicesTable,
    deliverables,
  };
}
