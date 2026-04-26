/**
 * Design Review meeting prep — section catalog.
 *
 * Sent before reviewing the proposed solution design with the customer team.
 * Frames the agenda + sign-off process so attendees know what's being decided.
 */

import type { MeetingPrepSectionMeta } from "./types";

export const DESIGN_REVIEW_SECTION_IDS = [
  "designReviewAgenda",
  "designReviewSignoff",
] as const;

export type DesignReviewSectionId = typeof DESIGN_REVIEW_SECTION_IDS[number];

export const DESIGN_REVIEW_CATALOG: readonly MeetingPrepSectionMeta[] = [
  { id: "designReviewAgenda",  label: "Review Agenda",       appliesTo: "all", defaultEnabled: true },
  { id: "designReviewSignoff", label: "Sign-Off Process",    appliesTo: "all", defaultEnabled: true },
];
