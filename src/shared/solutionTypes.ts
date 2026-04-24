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

/** Tolerant reader: accepts a JSON array string, a legacy single-string value, or nullish. */
export function parseSolutionTypes(raw: unknown): SolutionType[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter(isSolutionType);
  if (typeof raw !== "string") return [];
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(isSolutionType);
    } catch {
      /* fall through to legacy single-value handling */
    }
  }
  return isSolutionType(s) ? [s] : [];
}

export function serializeSolutionTypes(types: readonly SolutionType[]): string {
  return JSON.stringify(types);
}

/** Human label, tolerant of unknown inputs (returns the raw string for unknowns). */
export function solutionTypeLabel(type: string | null | undefined): string {
  if (!type) return "";
  return isSolutionType(type) ? SOLUTION_TYPE_LABELS[type] : type;
}

/**
 * Server helper — turns a DB row's `solution_types` JSON string into the typed array
 * before returning to the client. Used at every SELECT-path return site so the API
 * contract is `solution_types: SolutionType[]`, not `solution_types: string` (JSON).
 */
export function normalizeSolutionTypesField<T extends { solution_types?: unknown }>(row: T): T & { solution_types: SolutionType[] } {
  return { ...row, solution_types: parseSolutionTypes(row.solution_types) };
}
