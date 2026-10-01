/**
 * Closure Notice meeting prep — section catalog.
 *
 * Not a meeting request — this is the final communication sent when a
 * customer has gone dark at project close-out and hasn't responded to
 * attempts to schedule a handoff meeting. It acknowledges the outreach,
 * explains the project is being formally closed out without it, and
 * introduces the Client Success Manager who owns the relationship going
 * forward. The existing "Send Another" resend flow still applies if a PM
 * needs to send it more than once (e.g. to a different contact).
 */

import type { MeetingPrepSectionMeta } from "./types";

export const CLOSURE_NOTICE_SECTION_IDS = [
  "closureAcknowledgment",
  "csmIntroduction",
  "reopenTheDoor",
] as const;

export type ClosureNoticeSectionId = typeof CLOSURE_NOTICE_SECTION_IDS[number];

export const CLOSURE_NOTICE_CATALOG: readonly MeetingPrepSectionMeta[] = [
  { id: "closureAcknowledgment", label: "Closing Out the Project",         appliesTo: "all", defaultEnabled: true },
  { id: "csmIntroduction",       label: "Meet Your Client Success Manager", appliesTo: "all", defaultEnabled: true },
  { id: "reopenTheDoor",         label: "We're Here When You're Ready",    appliesTo: "all", defaultEnabled: true },
];
