/**
 * SOW template — variant interface + shared types.
 *
 * The new SOW is structured by 13 numbered sections (cover + 1..13). Most
 * sections are vendor/solution-type agnostic — Out of Scope, Assumptions,
 * Customer Responsibilities, Governance, Change Management, Acceptance,
 * Terms, Signature — and live in src/shared/sowTemplate/sections.ts
 * verbatim.
 *
 * Variant-specific content (full title, snapshot tiles, stage activities in
 * § 2, deliverables, optional services, pricing labels) is supplied by each
 * SowVariant. The renderer picks the variant by the solution's primary
 * solution_type (or vendor, for vendor-tied variants). Combo solutions
 * (UCaaS + CCaaS) get a merge-aware handling in a follow-up PR; for now
 * combos resolve to the variant of the first solution_type and add a note.
 */

export type SowSolutionTypeKey =
  | "ucaas"
  | "ccaas"
  | "ci"          // Conversation Intelligence (Zoom Revenue Accelerator / RingCentral ACE)
  | "va"          // Virtual Agent (Zoom AI Virtual Agent / RingCentral AVA)
  | "rc_air"      // RingCentral AIR (AI Receptionist)
  | "wfm"         // Workforce Management (Zoom Contact Center WFM) — CCaaS add-on
  | "qm";         // Quality Management (Zoom Contact Center QM) — CCaaS add-on

export type SowVendorKey = "zoom" | "ringcentral" | "tbd";

/**
 * Inputs the renderer has when building a SOW. Variants use this to compute
 * snapshot tile values, pricing summaries, etc. without needing direct DB
 * access — the renderer assembles everything once at the top.
 */
export type SowBuildContext = {
  customerName: string;
  customerAddress?: string | null;
  customerPrimaryContact?: { name: string; title?: string | null; email?: string | null; phone?: string | null } | null;
  preparedBy: { name: string; title?: string | null; email?: string | null; phone?: string | null };
  /** Project reference line on the cover ("Zoom UCaaS Migration – {short}"). */
  projectReference: string;
  /** SOW number (auto-iterated V1, V2, ...). Falls back to "V1 (draft)" when
   *  no revisions exist yet — i.e. PM hasn't clicked "Generate Version". */
  sowNumber: string;
  /** Issue date — defaults to today; renders as "Month DD, YYYY". */
  issueDateText: string;
  /** PM-entered MSA date (YYYY-MM-DD) or null. */
  msaDate: string | null;
  /** PM-entered target go-live date (YYYY-MM-DD). When set, Key Dates rows
   *  on the cover are derived backward from this date — Planning Complete,
   *  Port Orders Submitted, UAT, Go-Live, and Project Closure all compute
   *  from this + the duration band. When null, those rows render as
   *  "[MM/DD/YYYY]" placeholders just like they did before this feature. */
  targetGoLiveDate: string | null;
  /** Total-project duration band — drives the Planning/Port-Orders offsets
   *  on the Key Dates table. "8_12_weeks" is the default assumption when
   *  go-live is set but band isn't. */
  durationBand: "4_6_weeks" | "6_8_weeks" | "8_12_weeks" | "custom" | null;
  /** When durationBand === "custom", the explicit week count. Ignored
   *  otherwise. */
  customWeeks: number | null;
  /** SOW Status — pulled from the solution status. */
  statusText: string;
  /** Revision history rows for the cover-page table. */
  revisions: Array<{ version: string; saved_at: string; saved_by_name: string | null; note?: string | null }>;
  /** Engagement Snapshot tile values — variants drive the labels + computed values via SnapshotField. */
  /** Total fee in USD (from calcSowTotal). May be 0 for fully-discounted SOWs. */
  feeTotal: number;
  /** Discount line value (negative). Renders as "($25,017.00)" in the pricing
   *  summary when non-zero. Use null to omit the discount row. */
  feeDiscount: number | null;
  /** Final project total after discount. */
  projectTotal: number;
  /** Optional zoom-reseller / budgetary flags carried over from the existing
   *  ScopeOfWorkDocument renderer. */
  isBudgetary: boolean;
  isZoomReseller: boolean;
  /** Number of locations / sites in scope — drives snapshot + section 1.3. */
  locationCount: number;
  /** Primary "seat" count — legacy single number (UCaaS users). Kept as a
   *  fallback for tiles/rows not yet migrated to a per-type count (e.g. rc_air).
   *  Prefer the per-type counts below so a combo SOW shows distinct numbers. */
  primarySeatCount: number;
  /** Per-type headline counts. Each scope row / snapshot tile reads its own so
   *  a combo SOW (UCaaS + CCaaS + VA …) doesn't print the same number for all.
   *  Sourced from sow_data: ucaas users sum, ccaas.agents, ci.licensed_seats,
   *  and VA = count of enabled VA channels (voice + chat + sms). */
  ucaasSeatCount: number;
  ccaasAgentCount: number;
  ciSeatCount: number;
  vaWorkflowCount: number;
  /** Optional secondary counts that variants may use (DIDs, Meetings, queues, etc.). */
  ditNumbers: number;          // DIDs to port
  meetingsCount: number;       // Zoom Meetings licenses (UCaaS variants)
  goLiveCount: number;         // Discrete go-live events (often = locationCount, may differ for staggered cutovers)
};

/** A snapshot tile on the cover page. Variants supply 4 of these. */
export type SnapshotTile = {
  label: string;
  /** Computed at render time from SowBuildContext. */
  value: (ctx: SowBuildContext) => string | number;
};

/** A bullet-point activity within a stage (Section 2.2 – 2.7). */
export type StageBullet = string;

/** A subsection within a stage ("2.3.1 Assessment & Design"). */
export type StageSubsection = {
  /** "2.3.1" — manually authored; the renderer doesn't re-number. */
  number?: string;
  title?: string;
  intro?: string;
  /** Activities — rendered as a bulleted list. */
  bullets: StageBullet[];
};

export type StageSection = {
  /** "2.2", "2.3" … etc. */
  number: string;
  /** "Stage 1 — Initiation" */
  title: string;
  /** Optional intro paragraph at the top of the stage. */
  intro?: string;
  /** Top-level bullets at the stage level (used by Initiation, Closing — short stages). */
  bullets?: StageBullet[];
  /** Sub-sections if the stage has them (Planning, Executing, etc. — long stages). */
  subsections?: StageSubsection[];
};

export type OptionalService = {
  name: string;
  unit: string;
  fee: string;
};

export type Deliverable = {
  id: string;
  name: string;
  format: string;
  acceptanceCriteria: string;
};

/**
 * The 13-section variant. Sections that don't vary across variants are
 * supplied by the section catalog with no override; variants only carry the
 * content that changes per product/vendor combo.
 */
export type SowVariant = {
  id: SowSolutionTypeKey;
  vendor: SowVendorKey;
  /** Title at the top of the cover page (above STATEMENT OF WORK). */
  productLine: string;          // "Zoom UCaaS Professional Services"
  /** Subtitle / project reference template — substitutes {customer} at render time. */
  projectReferenceTemplate: string;  // "Zoom UCaaS Migration – {customer}"
  /** Engagement Snapshot tiles — exactly 4. */
  snapshotTiles: [SnapshotTile, SnapshotTile, SnapshotTile, SnapshotTile];
  /** Section 2 stages (2.2 through 2.7). */
  stages: StageSection[];
  /** Section 2.8 Training Services — included paragraph + optional. */
  trainingIncluded: string;
  trainingOptional?: string | null;
  /** Section 2.9 Engineering & Integration — bullets. */
  engineeringAndIntegration: string[];
  /** Section 2.10 Optional Services bullets (prose) + § 9.2 priced table. */
  optionalServiceBullets: string[];
  optionalServicesTable: OptionalService[];
  /** Section 3 Deliverables. */
  deliverables: Deliverable[];
  /** Section 1.3 "Scope at a Glance" rows. */
  scopeAtAGlance: Array<{ element: string; quantity: string; notes: string }>;
  /** Section 4 — Out of Scope bullets. Variants may override; shared default
   *  comes from sections.ts. */
  outOfScopeOverride?: string[];
  /** Whether to surface the E911 footnote at the end of Section 4. */
  showE911Footnote: boolean;
  /** Whether this variant is FULLY built (false = stub with placeholder content). */
  isStub: boolean;
  /** Logical key for the cover-page hero illustration (e.g. "zoom_ucaas").
   *  Resolved to an actual asset URL by the client and passed into
   *  buildSowHtml as `heroImageUrl`. Stubs leave this undefined; the
   *  renderer skips the full-bleed hero page when not set. */
  heroImageKey?: string;
};
