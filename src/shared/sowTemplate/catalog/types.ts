/**
 * SOW content catalog — types.
 *
 * Each catalog entry is a single content unit (one scope row, one
 * subsection's bullet list, one deliverable, etc.) tagged with
 * applicability metadata so the assembler can pick the right pieces
 * for a given (vendor, solution_types) tuple.
 *
 * Read this with `catalog/scopeItems.ts`, `catalog/subsections.ts`,
 * etc. open in parallel. The assembler lives in `catalog/assemble.ts`
 * and produces a fully-formed `SowVariant` from the catalog —
 * downstream renderer code in `buildHtml.ts` doesn't know the catalog
 * exists.
 */

import type { SowSolutionTypeKey, SowVendorKey, SowBuildContext } from "../types";

/** Stage identifier. Mirrors PMI stages used by the project templates
 *  (Initiation → Planning → Executing → Monitoring → Go-Live → Closing). */
export type StageKey = "initiation" | "planning" | "executing" | "monitoring" | "go_live" | "closing";

/** Tag attached to every catalog entry. The assembler keeps an entry when:
 *   - `appliesTo` is omitted or empty (applies to all solution types), OR
 *     intersects the solution's `solution_types` (at least one match).
 *   - `vendor` is omitted or empty (applies to all vendors), OR
 *     contains the solution's vendor.
 *
 *  Combo SOWs (UCaaS + CCaaS) automatically inherit every entry tagged
 *  for either side — no separate "combo" file required. Add a combo-
 *  specific entry only when the content is genuinely different from
 *  what either single-type SOW would say. */
export type Applicability = {
  appliesTo?: readonly SowSolutionTypeKey[];
  vendor?: readonly SowVendorKey[];
};

// ── Block types — one per area of the rendered SOW ───────────────────────────

export type ScopeItem = Applicability & {
  element: string;
  quantity: string;
  notes: string;
  /** Display ordering hint within Section 1.3 (lower = earlier). Default = 100. */
  sortOrder?: number;
};

/** Stage-level intro paragraph. Stages with multiple eligible intros use the
 *  highest-priority one (combo-tagged entries beat single-type entries). */
export type StageIntro = Applicability & {
  stage: StageKey;
  intro: string;
  /** Higher wins. Default = 0. Combo-tagged content typically gets priority 10. */
  priority?: number;
};

export type Subsection = Applicability & {
  stage: StageKey;
  title?: string;
  intro?: string;
  bullets: string[];
  /** Display order within the stage (lower = earlier). Default = 100. */
  sortOrder?: number;
};

export type EngineeringBullet = Applicability & {
  bullet: string;
  sortOrder?: number;
};

export type OptionalServiceBullet = Applicability & {
  bullet: string;
  sortOrder?: number;
};

export type OptionalServiceRow = Applicability & {
  name: string;
  unit: string;
  fee: string;
  sortOrder?: number;
};

export type DeliverableEntry = Applicability & {
  /** Stable name used to dedupe duplicates from multiple matching tags. */
  name: string;
  format: string;
  acceptanceCriteria: string;
  /** Sort within Section 3 (lower = earlier). Deliverables get sequential
   *  ids D1/D2/… at assembly time. */
  sortOrder?: number;
};

export type SnapshotTile = Applicability & {
  label: string;
  value: (ctx: SowBuildContext) => string | number;
  /** Higher wins when more than 4 tiles are eligible. Default = 0. */
  priority?: number;
  /** Optional metric-group key. Tiles sharing a dedupeKey collapse to the
   *  single highest-priority one, even with different labels — e.g. the
   *  several "agents" tiles (Zoom CC / RingCX / CCaaS / WFM / QM) all read the
   *  same count and must not stack three identical numbers on one snapshot.
   *  When omitted, dedupe falls back to the label. */
  dedupeKey?: string;
};

/** Variant-level metadata — product line, project reference template, hero,
 *  training paragraphs. Picked via signature match: the assembler finds the
 *  best entry whose `appliesTo` exactly matches the sorted solution_types and
 *  whose `vendor` matches. Falls back to single-type signatures when no combo
 *  entry exists. */
export type VariantMeta = Applicability & {
  productLine: string;
  projectReferenceTemplate: string;
  heroImageKey?: string;
  showE911Footnote?: boolean;
  trainingIncluded: string;
  trainingOptional?: string;
  /** Higher wins. Default = 0. Combo-specific entries use priority 10. */
  priority?: number;
};

// ── Stage metadata (number + title) — shared across all variants ────────────

export type StageMeta = {
  key: StageKey;
  number: string;
  title: string;
};

export const STAGE_ORDER: readonly StageMeta[] = [
  { key: "initiation", number: "2.2", title: "Stage 1 — Initiation" },
  { key: "planning",   number: "2.3", title: "Stage 2 — Planning" },
  { key: "executing",  number: "2.4", title: "Stage 3 — Executing" },
  { key: "monitoring", number: "2.5", title: "Stage 4 — Monitoring / Controlling" },
  { key: "go_live",    number: "2.6", title: "Stage 5 — Go Live / Production" },
  { key: "closing",    number: "2.7", title: "Stage 6 — Closing" },
] as const;

// ── Catalog bundle — what each catalog file exports ──────────────────────────

export type Catalog = {
  variantMeta:        VariantMeta[];
  snapshotTiles:      SnapshotTile[];
  scopeItems:         ScopeItem[];
  stageIntros:        StageIntro[];
  subsections:        Subsection[];
  engineering:        EngineeringBullet[];
  optionalBullets:    OptionalServiceBullet[];
  optionalRows:       OptionalServiceRow[];
  deliverables:       DeliverableEntry[];
};
