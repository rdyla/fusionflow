/**
 * Go-Live meeting prep — body renderer.
 */

import {
  GO_LIVE_CATALOG,
  type GoLiveSectionId,
} from "../../../shared/meetingPrep/goLive";
import { psCard, type MeetingPrepTeamSection } from "./envelope";
import { renderStandard, type StandardMeetingPrepData } from "./standardEnvelope";
import type { SolutionType } from "../../../shared/solutionTypes";

export type GoLiveData = {
  projectName: string;
  customerName: string | null;
  pmName: string;
  pmCustomNote: string;
  portalUrl: string;
  label: string | null;
  solution: string | null;
  solutionTypes: readonly SolutionType[];
  teamSections: MeetingPrepTeamSection[];
  sections: Partial<Record<GoLiveSectionId, boolean>>;
};

function renderSection(id: string): string {
  const meta = GO_LIVE_CATALOG.find((m) => m.id === id);
  if (!meta) return "";
  switch (id as GoLiveSectionId) {
    case "goLiveCutoverPlan":
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">Cutover sequence + timing. The exact steps and window will be confirmed in this session, but the broad strokes are below so everyone arrives on the same page.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Cutover window &mdash; date, time, duration; freeze period for non-cutover changes</li>
           <li style="margin:0 0 8px;">Step-by-step sequence with owners + estimated time per step</li>
           <li style="margin:0;">Rollback plan &mdash; conditions that trigger rollback, who calls it, recovery steps</li>
         </ul>`
      );
    case "goLiveDayOfComms":
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">Communication plan for cutover day. Knowing who to reach + how, before things start, prevents stalls.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Primary bridge / chat channel for the cutover team</li>
           <li style="margin:0 0 8px;">Escalation path &mdash; PF lead, partner lead, customer decision-maker</li>
           <li style="margin:0;">Status cadence &mdash; how often we check in during the cutover window</li>
         </ul>`
      );
    case "goLiveHypercare":
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">Post-cutover hypercare expectations. The implementation team stays close for a defined period before transitioning to standard support.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Hypercare duration &mdash; typically two weeks post-cutover</li>
           <li style="margin:0 0 8px;">Support model &mdash; rapid triage of production issues, intent / config tuning based on live traffic</li>
           <li style="margin:0;">Hypercare exit &mdash; conditions that mark the project as accepted and transitioned</li>
         </ul>`
      );
  }
}

export function renderGoLive(data: GoLiveData): { subject: string; html: string } {
  const labelSuffix = data.label && data.label.trim() ? ` (${data.label.trim()})` : "";
  const standard: StandardMeetingPrepData = {
    title: "Go-Live Prep",
    subject: `Go-live prep${labelSuffix} — ${data.projectName}${data.customerName ? ` · ${data.customerName}` : ""}`,
    projectName: data.projectName,
    customerName: data.customerName,
    pmName: data.pmName,
    pmCustomNote: data.pmCustomNote,
    portalUrl: data.portalUrl,
    label: data.label,
    solution: data.solution,
    solutionTypes: data.solutionTypes,
    teamSections: data.teamSections,
    catalog: GO_LIVE_CATALOG,
    sections: data.sections as Record<string, boolean>,
    renderSection,
  };
  return renderStandard(standard);
}
