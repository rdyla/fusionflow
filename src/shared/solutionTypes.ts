/**
 * Canonical solution type enum + display metadata.
 *
 * Consumed by both client (src/client) and server (src/server). Each tsconfig
 * includes this `src/shared` directory. If you add a new SolutionType, update
 * every map below; the TS Record<SolutionType, ...> constraint will flag gaps.
 */

export const SOLUTION_TYPES = ["ucaas", "ccaas", "va", "ci", "wfm", "qm"] as const;
export type SolutionType = typeof SOLUTION_TYPES[number];

export const SOLUTION_TYPE_LABELS: Record<SolutionType, string> = {
  ucaas: "UCaaS",
  ccaas: "CCaaS",
  va: "Virtual Agent",
  ci: "Conversation Intelligence",
  wfm: "Workforce Management",
  qm: "Quality Management",
};

export const SOLUTION_TYPE_COLORS: Record<SolutionType, string> = {
  ucaas: "#2563eb",
  ccaas: "#0891b2",
  va: "#7c3aed",
  ci: "#0b9aad",
  wfm: "#d97706",
  qm: "#059669",
};

export function isSolutionType(v: unknown): v is SolutionType {
  return typeof v === "string" && (SOLUTION_TYPES as readonly string[]).includes(v);
}

/**
 * Legacy aliases — maps historical, non-canonical keys still in DB/asset JSON/scoring
 * internals to their canonical SolutionType. Retire each alias only after the underlying
 * call sites have been migrated.
 *
 * - `virtual_agent` (long form used by the Optimize scoring engine, labor config, and
 *   impact_assessments.solution_types rows pre-dating the shared enum) → `va`.
 */
const LEGACY_ALIASES: Record<string, SolutionType> = {
  virtual_agent: "va",
};

/** Returns the canonical SolutionType for a raw string, resolving legacy aliases. Returns null for unrecognized values. */
export function canonicalizeSolutionType(v: string): SolutionType | null {
  if (isSolutionType(v)) return v;
  return LEGACY_ALIASES[v] ?? null;
}

/** Tolerant reader: accepts a JSON array string, a legacy single-string value, or nullish. Legacy aliases are folded to canonical. */
export function parseSolutionTypes(raw: unknown): SolutionType[] {
  if (raw == null) return [];
  const pickCanonical = (v: unknown): v is SolutionType => typeof v === "string" && canonicalizeSolutionType(v) !== null;
  const toCanonical = (v: string): SolutionType => canonicalizeSolutionType(v) ?? (v as SolutionType);
  if (Array.isArray(raw)) return raw.filter(pickCanonical).map(toCanonical);
  if (typeof raw !== "string") return [];
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(pickCanonical).map(toCanonical);
    } catch {
      /* fall through to legacy single-value handling */
    }
  }
  const canonical = canonicalizeSolutionType(s);
  return canonical ? [canonical] : [];
}

export function serializeSolutionTypes(types: readonly SolutionType[]): string {
  return JSON.stringify(types);
}

/** Human label, tolerant of unknown inputs and legacy aliases (returns the raw string for unknowns). */
export function solutionTypeLabel(type: string | null | undefined): string {
  if (!type) return "";
  const canonical = canonicalizeSolutionType(type);
  return canonical ? SOLUTION_TYPE_LABELS[canonical] : type;
}

/**
 * Server helper — turns a DB row's `solution_types` JSON string into the typed array
 * before returning to the client. Used at every SELECT-path return site so the API
 * contract is `solution_types: SolutionType[]`, not `solution_types: string` (JSON).
 */
export function normalizeSolutionTypesField<T extends { solution_types?: unknown }>(row: T): T & { solution_types: SolutionType[] } {
  return { ...row, solution_types: parseSolutionTypes(row.solution_types) };
}

// ── Other Technologies (non-canonical solution types) ─────────────────────────
// Separate from the core SolutionType enum because they don't participate in the
// needs-assessment / labor / SOW logic — they're descriptive only. Stored on
// `solutions.other_technologies` as a JSON array.

export const OTHER_TECHNOLOGIES = [
  "bdr", "connectivity", "colocation", "cyber_security", "daas",
  "help_desk", "iaas", "mobility", "managed_services", "managed_cloud",
  "sdwan", "tem", "other",
] as const;
export type OtherTechnology = typeof OTHER_TECHNOLOGIES[number];

export const OTHER_TECHNOLOGY_LABELS: Record<OtherTechnology, string> = {
  bdr: "Backup & Disaster Recovery",
  connectivity: "Connectivity",
  colocation: "Colocation",
  cyber_security: "Cyber Security",
  daas: "Desktop as a Service",
  help_desk: "Help Desk",
  iaas: "Infrastructure as a Service",
  mobility: "Mobility (Corporate Cellular)",
  managed_services: "Managed Services",
  managed_cloud: "Managed Public Cloud",
  sdwan: "SD-WAN / SASE / Aggregation",
  tem: "Technology Expense Management",
  other: "Other Technology Discovery",
};

export function isOtherTechnology(v: unknown): v is OtherTechnology {
  return typeof v === "string" && (OTHER_TECHNOLOGIES as readonly string[]).includes(v);
}

/** Tolerant reader: accepts JSON array string, legacy single-string, or nullish. Unknown values dropped. */
export function parseOtherTechnologies(raw: unknown): OtherTechnology[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter(isOtherTechnology);
  if (typeof raw !== "string") return [];
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(isOtherTechnology);
    } catch {
      /* fall through */
    }
  }
  return isOtherTechnology(s) ? [s] : [];
}

export function serializeOtherTechnologies(techs: readonly OtherTechnology[]): string {
  return JSON.stringify(techs);
}

/** Server helper — normalize `other_technologies` on a SELECT row. */
export function normalizeOtherTechnologiesField<T extends { other_technologies?: unknown }>(row: T): T & { other_technologies: OtherTechnology[] } {
  return { ...row, other_technologies: parseOtherTechnologies(row.other_technologies) };
}

/** Combined helper — both solution_types + other_technologies on a solutions SELECT row. */
export function normalizeSolutionRow<T extends Record<string, unknown>>(row: T): T & { solution_types: SolutionType[]; other_technologies: OtherTechnology[] } {
  return {
    ...row,
    solution_types: parseSolutionTypes(row.solution_types),
    other_technologies: parseOtherTechnologies(row.other_technologies),
  };
}

/** Human label for a single other-tech key, tolerant of unknown inputs. */
export function otherTechnologyLabel(t: string | null | undefined): string {
  if (!t) return "";
  return isOtherTechnology(t) ? OTHER_TECHNOLOGY_LABELS[t] : t;
}
