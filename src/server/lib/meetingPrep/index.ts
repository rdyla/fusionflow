/**
 * Meeting-prep engine — server registry.
 *
 * Maps each `MeetingType` to its body renderer. The route uses
 * `getRendererFor(type)` to dispatch; adding a new meeting type means
 * registering its renderer here (and adding its catalog under
 * `src/shared/meetingPrep/`).
 */

import type { MeetingType } from "../../../shared/meetingPrep";
import { renderKickoff, type KickoffData } from "./kickoff";
import { renderDiscovery, type DiscoveryData } from "./discovery";
import { renderDesignReview, type DesignReviewData } from "./designReview";
import { renderUat, type UatData } from "./uat";
import { renderGoLive, type GoLiveData } from "./goLive";

export type {
  MeetingPrepTeamMember,
  MeetingPrepTeamSection,
} from "./envelope";
export { renderKickoff, renderDiscovery, renderDesignReview, renderUat, renderGoLive };
export type { KickoffData, DiscoveryData, DesignReviewData, UatData, GoLiveData };

// Type-erased dispatch. Each renderer narrows its input via cast at the
// boundary; the route pre-validates the shape per meeting type before
// dispatch.
type AnyRenderer = (data: unknown) => { subject: string; html: string };

const RENDERERS: Record<MeetingType, AnyRenderer> = {
  kickoff:       (d) => renderKickoff(d as KickoffData),
  discovery:     (d) => renderDiscovery(d as DiscoveryData),
  design_review: (d) => renderDesignReview(d as DesignReviewData),
  uat:           (d) => renderUat(d as UatData),
  go_live:       (d) => renderGoLive(d as GoLiveData),
};

export function getRendererFor(meetingType: MeetingType): AnyRenderer {
  return RENDERERS[meetingType];
}
