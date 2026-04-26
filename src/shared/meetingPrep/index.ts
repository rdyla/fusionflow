/**
 * Meeting-prep engine — shared module surface.
 *
 * Re-exports types + helpers and provides `getCatalogFor(meetingType)` so the
 * client modal and server route can stay generic over the meeting type.
 */

export {
  MEETING_TYPES,
  MEETING_TYPE_LABELS,
  isMeetingType,
  sectionsApplicableToTypes,
  applyMeetingPrepSectionDefaults,
} from "./types";
export type { MeetingType, MeetingPrepSectionMeta } from "./types";

import type { MeetingType, MeetingPrepSectionMeta } from "./types";
import { KICKOFF_CATALOG } from "./kickoff";
export { KICKOFF_CATALOG, KICKOFF_SECTION_IDS, isKickoffSectionId, type KickoffSectionId } from "./kickoff";

const CATALOGS: Record<MeetingType, readonly MeetingPrepSectionMeta[]> = {
  kickoff: KICKOFF_CATALOG,
};

/** Returns the section catalog for a given meeting type. */
export function getCatalogFor(meetingType: MeetingType): readonly MeetingPrepSectionMeta[] {
  return CATALOGS[meetingType];
}
