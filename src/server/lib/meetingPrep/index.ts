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

export type {
  MeetingPrepTeamMember,
  MeetingPrepTeamSection,
} from "./envelope";
export { renderKickoff };
export type { KickoffData };

// Minimal type-erased data shape. Each renderer narrows its input via cast at
// the boundary; the route pre-validates the shape per meeting type before
// dispatch.
type AnyRenderer = (data: unknown) => { subject: string; html: string };

const RENDERERS: Record<MeetingType, AnyRenderer> = {
  kickoff: (d) => renderKickoff(d as KickoffData),
};

export function getRendererFor(meetingType: MeetingType): AnyRenderer {
  return RENDERERS[meetingType];
}
