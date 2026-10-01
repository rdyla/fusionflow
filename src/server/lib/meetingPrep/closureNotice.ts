/**
 * Closure Notice meeting prep — body renderer.
 *
 * Sent when a customer has gone dark at project close-out and hasn't
 * responded to attempts to schedule the handoff meeting. Acknowledges the
 * outreach, confirms the project is being formally closed out anyway, and
 * introduces the Client Success Manager who owns the relationship from
 * here. Not a meeting request — there's no agenda/scheduling ask here, by
 * design.
 */

import {
  CLOSURE_NOTICE_CATALOG,
  type ClosureNoticeSectionId,
} from "../../../shared/meetingPrep/closureNotice";
import { psCard, type MeetingPrepTeamSection } from "./envelope";
import { renderStandard, type StandardMeetingPrepData } from "./standardEnvelope";
import { escapeHtml } from "../emailTemplates";
import type { SolutionType } from "../../../shared/solutionTypes";

export type ClosureNoticeData = {
  projectName: string;
  customerName: string | null;
  pmName: string;
  pmCustomNote: string;
  portalUrl: string;
  label: string | null;
  solution: string | null;
  solutionTypes: readonly SolutionType[];
  teamSections: MeetingPrepTeamSection[];
  sections: Partial<Record<ClosureNoticeSectionId, boolean>>;
  /** Pulled from the Overview tab's Account Team (customers.pf_csm_user_id)
   *  so the introduction names them directly instead of staying generic.
   *  null when the account has no CSM assigned yet. */
  csmName: string | null;
};

function renderSection(id: string, csmName: string | null): string {
  const meta = CLOSURE_NOTICE_CATALOG.find((m) => m.id === id);
  if (!meta) return "";
  switch (id as ClosureNoticeSectionId) {
    case "closureAcknowledgment":
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">We've reached out a few times to get a project closure meeting on the calendar and haven't been able to connect. Since we haven't heard back, we're moving forward with formally closing out the project on our end.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Everything delivered as part of this project remains fully in place and functional</li>
           <li style="margin:0;">Closing the project doesn't remove or change anything you're currently using &mdash; it just shifts who's looking after it day to day</li>
         </ul>`
      );
    case "csmIntroduction": {
      const whoSentence = csmName
        ? `Going forward, your primary point of contact is <strong style="color:#0b5394;">${csmName}</strong>, your Client Success Manager, introduced below.`
        : `Going forward, your primary point of contact is your Client Success Manager, introduced below.`;
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">${whoSentence}</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">They'll check in on how things are going and support your ongoing use of the platform</li>
           <li style="margin:0;">They're also your contact for future optimization &mdash; adjustments, expansions, or new capabilities as your needs change</li>
         </ul>`
      );
    }
    case "reopenTheDoor":
      return psCard(
        meta.label,
        `<p style="margin:0;">If now isn't a good time, that's completely fine &mdash; there's no deadline on reconnecting. Reply to this email whenever works, and your Client Success Manager will follow up.</p>`
      );
  }
}

export function renderClosureNotice(data: ClosureNoticeData): { subject: string; html: string } {
  const labelSuffix = data.label && data.label.trim() ? ` (${data.label.trim()})` : "";
  const standard: StandardMeetingPrepData = {
    title: "Project Closure Notice",
    subject: `Closing out your project${labelSuffix} — ${data.projectName}${data.customerName ? ` · ${data.customerName}` : ""}`,
    projectName: data.projectName,
    customerName: data.customerName,
    pmName: data.pmName,
    pmCustomNote: data.pmCustomNote,
    portalUrl: data.portalUrl,
    label: data.label,
    solution: data.solution,
    solutionTypes: data.solutionTypes,
    teamSections: data.teamSections,
    catalog: CLOSURE_NOTICE_CATALOG,
    sections: data.sections as Record<string, boolean>,
    renderSection: (id) => renderSection(id, data.csmName ? escapeHtml(data.csmName) : null),
  };
  return renderStandard(standard);
}
