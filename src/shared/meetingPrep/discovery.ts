/**
 * Discovery meeting prep — section catalog.
 *
 * Discovery is the one meeting type that often happens MORE THAN ONCE per
 * project (e.g. "Discovery: Network Architecture", "Discovery: Call Flows").
 * The `label` field on each `meeting_prep_sends` row distinguishes them; the
 * catalog itself stays generic — PMs use the label to scope each session.
 */

import type { MeetingPrepSectionMeta } from "./types";

export const DISCOVERY_SECTION_IDS = [
  "discoveryAgenda",
  "discoveryAttendees",
  "discoveryComeWith",
] as const;

export type DiscoverySectionId = typeof DISCOVERY_SECTION_IDS[number];

export const DISCOVERY_CATALOG: readonly MeetingPrepSectionMeta[] = [
  { id: "discoveryAgenda",    label: "Session Agenda",          appliesTo: "all", defaultEnabled: true },
  { id: "discoveryAttendees", label: "Recommended Attendees",   appliesTo: "all", defaultEnabled: true },
  { id: "discoveryComeWith",  label: "Topics to Think About",   appliesTo: "all", defaultEnabled: true },
];
