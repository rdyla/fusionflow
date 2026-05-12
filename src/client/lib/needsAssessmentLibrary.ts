/**
 * Unified Needs Assessment composer.
 *
 * The library at src/client/assets/needs_assessment_library_v1.json carries
 * questions and SOR sections tagged with the `solution_types` array they
 * apply to. For a given solution's `solution_types` (e.g. ["ucaas","ccaas"])
 * the composer produces:
 *   - a flat survey shape `{ sections, statementOfRequirements }` that the
 *     existing NeedsAssessmentWizard + NeedsAssessmentSOR components consume,
 *   - an answer migration helper that maps legacy stored answer keys into
 *     the new canonical IDs (phase_1_scope_summary → scope_summary, the
 *     four CI customization Y/Ns → customizations_required, etc.),
 *   - a per-type answer splitter that turns the unified answers blob into
 *     the per-(solution_id, solution_type) records the server still stores.
 *
 * The library is the single source of truth; per-type JSONs are deprecated
 * but kept on disk until the legacy code paths are removed.
 */

import library from "../assets/needs_assessment_library_v1.json";

// ── Library types ──────────────────────────────────────────────────────

export type SolutionTypeKey = "ucaas" | "ccaas" | "va" | "ci";

type LibraryOption = { value: string; label: string };

type LibraryShowIf = {
  field: string;
  operator: "notEquals" | "containsAny" | "contains";
  value: string | string[];
};

type LibraryItemSchemaProp = {
  type: string;
  label: string;
  required?: boolean;
  options?: LibraryOption[];
};

type LibraryQuestion = {
  id: string;
  section_id: string;
  solution_types: SolutionTypeKey[];
  type: string;
  label: string;
  required?: boolean;
  order: number;
  description?: string;
  options?: LibraryOption[];
  options_by_solution_type?: Partial<Record<SolutionTypeKey, LibraryOption[]>>;
  optionsSourceField?: string;
  itemSchema?: { type: string; properties: Record<string, LibraryItemSchemaProp> };
  showIf?: LibraryShowIf;
};

type LibrarySection = {
  id: string;
  title: string;
  order: number;
  solution_types: SolutionTypeKey[];
};

type LibrarySorSection = {
  id: string;
  title: string;
  order: number;
  solution_types: SolutionTypeKey[];
  source_fields: string[];
};

type Library = {
  id: string;
  version: string;
  supported_solution_types: SolutionTypeKey[];
  sections: LibrarySection[];
  questions: LibraryQuestion[];
  sor_sections: LibrarySorSection[];
};

const LIBRARY = library as Library;

// ── Composed shape consumed by the wizard / SOR components ────────────
// Mirrors the legacy SurveyJson shape so the existing components don't
// need re-architecting; only their input source changes.

export type ComposedFieldDef = {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: LibraryOption[];
  optionsSourceField?: string;
  itemSchema?: { type: string; properties: Record<string, LibraryItemSchemaProp> };
  showIf?: LibraryShowIf;
  description?: string;
  /** Solutions this question belongs to. Surfaced for save-side splitting. */
  solution_types: SolutionTypeKey[];
};

export type ComposedSection = {
  id: string;
  title: string;
  fields: ComposedFieldDef[];
};

export type ComposedSorSection = {
  id: string;
  title: string;
  sourceFields: string[];
};

export type ComposedAssessment = {
  sections: ComposedSection[];
  statementOfRequirements: { sections: ComposedSorSection[] };
};

// ── Compose for a given solution's solution_types ─────────────────────

/** Returns true if the two arrays share at least one solution type. */
function intersects(a: readonly SolutionTypeKey[], b: readonly SolutionTypeKey[]): boolean {
  return a.some((t) => b.includes(t));
}

/**
 * Build a survey shape filtered to a solution's solution_types. Sections
 * that have no visible questions for those types are dropped. Within each
 * question, `options_by_solution_type` is collapsed to the union of options
 * for the intersecting types (dedup by value, first-seen order).
 */
export function composeAssessment(solutionTypes: readonly SolutionTypeKey[]): ComposedAssessment {
  const types: SolutionTypeKey[] = solutionTypes.filter((t) =>
    LIBRARY.supported_solution_types.includes(t)
  );
  if (types.length === 0) {
    return { sections: [], statementOfRequirements: { sections: [] } };
  }

  const sectionsById = new Map<string, ComposedSection>();
  for (const sec of LIBRARY.sections) {
    if (!intersects(sec.solution_types, types)) continue;
    sectionsById.set(sec.id, { id: sec.id, title: sec.title, fields: [] });
  }

  // Filter + assign questions to sections, preserving library order.
  const sortedQuestions = [...LIBRARY.questions].sort((a, b) => {
    const sa = LIBRARY.sections.find((s) => s.id === a.section_id)?.order ?? 999;
    const sb = LIBRARY.sections.find((s) => s.id === b.section_id)?.order ?? 999;
    if (sa !== sb) return sa - sb;
    return a.order - b.order;
  });

  for (const q of sortedQuestions) {
    if (!intersects(q.solution_types, types)) continue;
    const sec = sectionsById.get(q.section_id);
    if (!sec) continue;

    // Resolve options: union across the intersecting types.
    let options: LibraryOption[] | undefined = q.options;
    if (q.options_by_solution_type) {
      const merged: LibraryOption[] = [];
      const seen = new Set<string>();
      for (const t of types) {
        const opts = q.options_by_solution_type[t];
        if (!opts) continue;
        for (const o of opts) {
          if (seen.has(o.value)) continue;
          seen.add(o.value);
          merged.push(o);
        }
      }
      options = merged.length > 0 ? merged : undefined;
    }

    sec.fields.push({
      id: q.id,
      type: q.type,
      label: q.label,
      required: q.required,
      options,
      optionsSourceField: q.optionsSourceField,
      itemSchema: q.itemSchema,
      showIf: q.showIf,
      description: q.description,
      solution_types: q.solution_types,
    });
  }

  // Drop sections that ended up empty after filtering.
  const sections: ComposedSection[] = LIBRARY.sections
    .filter((s) => sectionsById.has(s.id))
    .map((s) => sectionsById.get(s.id)!)
    .filter((s) => s.fields.length > 0);

  // SOR sections: filter to those overlapping the solution's types; filter
  // source_fields to those whose owning question intersects the types.
  const questionById = new Map<string, LibraryQuestion>();
  for (const q of LIBRARY.questions) questionById.set(q.id, q);

  const sorSections: ComposedSorSection[] = LIBRARY.sor_sections
    .filter((s) => intersects(s.solution_types, types))
    .map((s) => ({
      id: s.id,
      title: s.title,
      sourceFields: s.source_fields.filter((fid) => {
        const q = questionById.get(fid);
        if (!q) return false;
        return intersects(q.solution_types, types);
      }),
    }))
    .filter((s) => s.sourceFields.length > 0);

  return { sections, statementOfRequirements: { sections: sorSections } };
}

// ── Answer migration: legacy keys → canonical IDs ─────────────────────

/** Map of legacy field IDs to their canonical replacements (1:1 renames). */
const LEGACY_RENAMES: Record<string, string> = {
  phase_1_scope_summary: "scope_summary",
  channels_required_phase_1: "channels_required",
  crm_integration_required_phase_1: "crm_integration_required",
  current_phone_system: "current_platform_in_use",
  current_platform: "current_platform_in_use",
};

/**
 * Old CI customization Y/N booleans collapse into the `customizations_required`
 * multi_select. When an old answer says `custom_trackers_required: "yes"`,
 * we want `customizations_required: ["custom_trackers", …]` on read.
 */
const CUSTOMIZATIONS_COLLAPSE: Record<string, string> = {
  custom_trackers_required: "custom_trackers",
  custom_scorecards_required: "custom_scorecards",
  role_specific_views_required: "role_specific_views",
  team_specific_templates_required: "team_specific_templates",
};

/**
 * Phase-variant option values that no longer exist. When loading an existing
 * answer like `fax_or_analog_required: "yes_phase_1"`, collapse to "yes".
 */
const PHASE_OPTION_COLLAPSE: Record<string, string> = {
  yes_phase_1: "yes",
  yes_future_phase: "yes",
};

const PHASE_COLLAPSE_FIELDS = new Set(["fax_or_analog_required", "call_recording_required"]);

/** Fields that no longer exist; their stored answers are silently dropped. */
const REMOVED_FIELDS = new Set([
  "future_phase_scope_summary",
  "channels_future_phase",
  "customer_name",
  "assessment_date",
  "retention_requirements_defined",
  "compliance_needs",
  "security_or_procurement_review_required",
  "geographic_or_country_scope",
  "phase_1_vs_future_scope",
  "geographies_in_scope",
  "primary_contact_name",
  "executive_sponsor",
  "project_stage",
  "why_now",
  "is_new_or_replacement",
  "existing_platform",
  "business_deadlines",
  "customer_prerequisites_before_implementation",
  "key_dependencies_before_design",
  "internal_adoption_measurement_plan",
  "approval_criteria_for_sor",
]);

/**
 * Convert a legacy answers blob to the current library's shape. Drops
 * removed-field answers, applies renames, and collapses the four CI Y/N
 * customization booleans into a single multi_select value.
 */
export function migrateAnswers(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const customizationsCollapsed: string[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (REMOVED_FIELDS.has(key)) continue;

    // Customization Y/N collapse
    if (key in CUSTOMIZATIONS_COLLAPSE) {
      if (value === "yes") customizationsCollapsed.push(CUSTOMIZATIONS_COLLAPSE[key]);
      continue;
    }

    const targetKey = LEGACY_RENAMES[key] ?? key;

    // Phase option collapse
    let targetValue: unknown = value;
    if (PHASE_COLLAPSE_FIELDS.has(targetKey) && typeof value === "string") {
      targetValue = PHASE_OPTION_COLLAPSE[value] ?? value;
    }

    // If two legacy keys both rename to the same new key, prefer the first
    // non-empty value seen.
    if (targetKey in out && isEmpty(out[targetKey]) && !isEmpty(targetValue)) {
      out[targetKey] = targetValue;
    } else if (!(targetKey in out)) {
      out[targetKey] = targetValue;
    }
  }

  if (customizationsCollapsed.length > 0) {
    // Merge with anything already stored under the new key.
    const existing = Array.isArray(out.customizations_required)
      ? (out.customizations_required as string[])
      : [];
    const merged = Array.from(new Set([...existing, ...customizationsCollapsed]));
    out.customizations_required = merged;
  }

  return out;
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

/**
 * Merge legacy per-type answer records into one unified answers blob,
 * applying migrateAnswers along the way. When a key appears in multiple
 * type-blobs (shared question), the first non-empty value wins.
 */
export function mergeAnswersAcrossTypes(
  perType: Partial<Record<SolutionTypeKey, Record<string, unknown>>>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // Iterate in canonical type order so behavior is deterministic.
  const order: SolutionTypeKey[] = ["ucaas", "ccaas", "va", "ci"];
  for (const t of order) {
    const blob = perType[t];
    if (!blob) continue;
    const migrated = migrateAnswers(blob);
    for (const [k, v] of Object.entries(migrated)) {
      if (!(k in out) || isEmpty(out[k])) {
        out[k] = v;
      }
    }
  }
  return out;
}

// ── Save-side splitter: unified answers → per-type records ────────────

/**
 * Given a unified answers blob and the solution's canonical solution_types,
 * return a per-type map of answers. A question's answer goes into every
 * type-blob the question applies to (shared questions get duplicated, which
 * is fine — they drive each type's per-type readiness score independently).
 */
export function splitAnswersByType(
  unifiedAnswers: Record<string, unknown>,
  solutionTypes: readonly SolutionTypeKey[]
): Record<SolutionTypeKey, Record<string, unknown>> {
  const questionById = new Map<string, LibraryQuestion>();
  for (const q of LIBRARY.questions) questionById.set(q.id, q);

  const types = solutionTypes.filter((t) =>
    LIBRARY.supported_solution_types.includes(t)
  );
  const out = Object.fromEntries(
    types.map((t) => [t, {} as Record<string, unknown>])
  ) as Record<SolutionTypeKey, Record<string, unknown>>;

  for (const [fieldId, value] of Object.entries(unifiedAnswers)) {
    const q = questionById.get(fieldId);
    if (!q) {
      // Unknown field (legacy / removed) — drop. migrateAnswers should
      // already have handled this on read, so this is defensive.
      continue;
    }
    for (const t of types) {
      if (q.solution_types.includes(t)) {
        out[t][fieldId] = value;
      }
    }
  }

  return out;
}

/** Library metadata exposed for callers that need versioning / lookup. */
export const LIBRARY_VERSION = LIBRARY.version;
export const LIBRARY_SUPPORTED_TYPES = LIBRARY.supported_solution_types;
