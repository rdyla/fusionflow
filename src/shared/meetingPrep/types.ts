/**
 * Meeting-prep email engine — shared types.
 *
 * The engine generalizes the welcome-email pattern (PR #62) to support multiple
 * project lifecycle meetings (kickoff, discovery, design review, ...). Each
 * meeting type has its own catalog of optional sections, its own body
 * renderer, and its own type-specific form fields, but all share:
 *   - the modal/form/preview/send UX in the client
 *   - the route + draft schema + Graph email send on the server
 *   - the section toggle pattern (id + label + appliesTo + defaultEnabled)
 *
 * Adding a new meeting type means: add the id to MeetingType, drop a catalog
 * file alongside `kickoff.ts`, add a renderer alongside the server-side
 * `kickoff.ts`, and (if needed) drop type-specific form fields in the
 * client. No engine changes needed.
 */

import type { SolutionType } from "../solutionTypes";

/** Canonical lifecycle meeting types this engine supports. Add new ones here. */
export const MEETING_TYPES = ["kickoff", "discovery", "design_review", "uat", "go_live"] as const;
export type MeetingType = typeof MEETING_TYPES[number];

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  kickoff:       "Kickoff",
  discovery:     "Discovery",
  design_review: "Design Review",
  uat:           "UAT",
  go_live:       "Go-Live",
};

export function isMeetingType(v: unknown): v is MeetingType {
  return typeof v === "string" && (MEETING_TYPES as readonly string[]).includes(v);
}

/**
 * Shape of one toggleable section in a meeting-prep email's catalog. Same
 * structure as the previous `WelcomeSectionMeta` from PR #62; lifted up so
 * every meeting type uses the same metadata model.
 *
 * `id` is loosely typed as `string` here because each meeting type narrows
 * its own union of section ids in its catalog file (see `kickoff.ts`).
 */
export type MeetingPrepSectionMeta = {
  id: string;
  /** Checkbox label in the modal AND heading used in the rendered email block. */
  label: string;
  /** `"all"` = every project; `SolutionType[]` = only when project has at least one of these types. */
  appliesTo: "all" | readonly SolutionType[];
  /** If the client omits this section's id from the draft payload, this is the assumed value. */
  defaultEnabled: boolean;
};

/** Filter a catalog to sections applicable to the given project's solution types. */
export function sectionsApplicableToTypes(
  catalog: readonly MeetingPrepSectionMeta[],
  types: readonly SolutionType[]
): readonly MeetingPrepSectionMeta[] {
  return catalog.filter((s) =>
    s.appliesTo === "all" || s.appliesTo.some((t) => types.includes(t))
  );
}

/**
 * Produce the final enabled/disabled section map for a given catalog +
 * project + raw client toggle map:
 *   - Only includes sections applicable to the project's solution types
 *   - Client values win; missing keys fall back to each section's `defaultEnabled`
 */
export function applyMeetingPrepSectionDefaults(
  catalog: readonly MeetingPrepSectionMeta[],
  raw: Readonly<Partial<Record<string, boolean>>>,
  types: readonly SolutionType[]
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const meta of sectionsApplicableToTypes(catalog, types)) {
    out[meta.id] = raw[meta.id] ?? meta.defaultEnabled;
  }
  return out;
}
