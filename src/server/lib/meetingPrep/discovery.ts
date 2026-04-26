/**
 * Discovery meeting prep — body renderer.
 *
 * Discovery sessions are often split into focused topics (e.g. "Network
 * Architecture", "Call Flows"). The `label` field on the send distinguishes
 * them; the rendered email surfaces it as a sub-line under the title.
 */

import {
  DISCOVERY_CATALOG,
  type DiscoverySectionId,
} from "../../../shared/meetingPrep/discovery";
import { psCard, type MeetingPrepTeamSection } from "./envelope";
import { renderStandard, type StandardMeetingPrepData } from "./standardEnvelope";
import type { SolutionType } from "../../../shared/solutionTypes";

export type DiscoveryData = {
  projectName: string;
  customerName: string | null;
  pmName: string;
  pmCustomNote: string;
  portalUrl: string;
  label: string | null;
  solution: string | null;
  solutionTypes: readonly SolutionType[];
  teamSections: MeetingPrepTeamSection[];
  sections: Partial<Record<DiscoverySectionId, boolean>>;
};

function renderSection(id: string): string {
  const meta = DISCOVERY_CATALOG.find((m) => m.id === id);
  if (!meta) return "";
  switch (id as DiscoverySectionId) {
    case "discoveryAgenda":
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">We'll work through the topics below in this session. The agenda is shaped around what we already know from the needs assessment and the items we still need to confirm before design.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Recap of what's already been captured + any gaps to close</li>
           <li style="margin:0 0 8px;">Deep-dive into the focus area for this session</li>
           <li style="margin:0;">Action items + owners for any follow-up data we need</li>
         </ul>`
      );
    case "discoveryAttendees":
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">Recommended attendees for this session:</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Subject-matter experts for the topic in focus (e.g. network architect for a network-architecture session)</li>
           <li style="margin:0 0 8px;">A decision-maker who can sign off on direction</li>
           <li style="margin:0;">Optional: end-user representative if user experience is on the agenda</li>
         </ul>`
      );
    case "discoveryComeWith":
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">Topics worth thinking about ahead of time. You don't need final answers &mdash; just enough context to drive the conversation:</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Existing constraints (technical, contractual, business) that bound the design</li>
           <li style="margin:0 0 8px;">Specific outcomes you'd like this session to land on</li>
           <li style="margin:0;">Any homework / data we asked for from the prior session</li>
         </ul>`
      );
  }
}

export function renderDiscovery(data: DiscoveryData): { subject: string; html: string } {
  const labelSuffix = data.label && data.label.trim() ? ` (${data.label.trim()})` : "";
  const standard: StandardMeetingPrepData = {
    title: "Discovery Prep",
    subject: `Discovery prep${labelSuffix} — ${data.projectName}${data.customerName ? ` · ${data.customerName}` : ""}`,
    projectName: data.projectName,
    customerName: data.customerName,
    pmName: data.pmName,
    pmCustomNote: data.pmCustomNote,
    portalUrl: data.portalUrl,
    label: data.label,
    solution: data.solution,
    solutionTypes: data.solutionTypes,
    teamSections: data.teamSections,
    catalog: DISCOVERY_CATALOG,
    sections: data.sections as Record<string, boolean>,
    renderSection,
  };
  return renderStandard(standard);
}
