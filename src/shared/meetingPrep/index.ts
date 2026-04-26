/**
 * Meeting-prep engine — shared module surface.
 *
 * Re-exports types + helpers and provides `getCatalogFor(meetingType)` so the
 * client modal and server route stay generic over the meeting type.
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
import { DISCOVERY_CATALOG } from "./discovery";
import { DESIGN_REVIEW_CATALOG } from "./designReview";
import { UAT_CATALOG } from "./uat";
import { GO_LIVE_CATALOG } from "./goLive";

export { KICKOFF_CATALOG, KICKOFF_SECTION_IDS, isKickoffSectionId, type KickoffSectionId } from "./kickoff";
export { DISCOVERY_CATALOG, DISCOVERY_SECTION_IDS, type DiscoverySectionId } from "./discovery";
export { DESIGN_REVIEW_CATALOG, DESIGN_REVIEW_SECTION_IDS, type DesignReviewSectionId } from "./designReview";
export { UAT_CATALOG, UAT_SECTION_IDS, type UatSectionId } from "./uat";
export { GO_LIVE_CATALOG, GO_LIVE_SECTION_IDS, type GoLiveSectionId } from "./goLive";

const CATALOGS: Record<MeetingType, readonly MeetingPrepSectionMeta[]> = {
  kickoff:       KICKOFF_CATALOG,
  discovery:     DISCOVERY_CATALOG,
  design_review: DESIGN_REVIEW_CATALOG,
  uat:           UAT_CATALOG,
  go_live:       GO_LIVE_CATALOG,
};

/** Returns the section catalog for a given meeting type. */
export function getCatalogFor(meetingType: MeetingType): readonly MeetingPrepSectionMeta[] {
  return CATALOGS[meetingType];
}
