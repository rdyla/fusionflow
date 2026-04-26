/**
 * Design Review meeting prep — body renderer.
 */

import {
  DESIGN_REVIEW_CATALOG,
  type DesignReviewSectionId,
} from "../../../shared/meetingPrep/designReview";
import { psCard, type MeetingPrepTeamSection } from "./envelope";
import { renderStandard, type StandardMeetingPrepData } from "./standardEnvelope";
import type { SolutionType } from "../../../shared/solutionTypes";

export type DesignReviewData = {
  projectName: string;
  customerName: string | null;
  pmName: string;
  pmCustomNote: string;
  portalUrl: string;
  label: string | null;
  solution: string | null;
  solutionTypes: readonly SolutionType[];
  teamSections: MeetingPrepTeamSection[];
  sections: Partial<Record<DesignReviewSectionId, boolean>>;
};

function renderSection(id: string): string {
  const meta = DESIGN_REVIEW_CATALOG.find((m) => m.id === id);
  if (!meta) return "";
  switch (id as DesignReviewSectionId) {
    case "designReviewAgenda":
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">In this session we'll walk through the proposed solution design. The goal is alignment on direction, surfacing any concerns before configuration starts, and getting written sign-off so the implementation team can move forward without churn.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Walk-through of the design document + diagrams</li>
           <li style="margin:0 0 8px;">Open questions and any outstanding decisions</li>
           <li style="margin:0;">Sign-off on the design or note any items that need to be revised</li>
         </ul>`
      );
    case "designReviewSignoff":
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">After the review, the design document becomes the basis for configuration. Any subsequent changes follow the change-order process described in the SOW.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Sign-off captured by the customer's designated reviewer (typically the program owner or technical lead)</li>
           <li style="margin:0 0 8px;">Open items tracked separately and revisited before configuration begins</li>
           <li style="margin:0;">Material changes after sign-off may impact timeline or fees per the change-order language</li>
         </ul>`
      );
  }
}

export function renderDesignReview(data: DesignReviewData): { subject: string; html: string } {
  const labelSuffix = data.label && data.label.trim() ? ` (${data.label.trim()})` : "";
  const standard: StandardMeetingPrepData = {
    title: "Design Review Prep",
    subject: `Design review prep${labelSuffix} — ${data.projectName}${data.customerName ? ` · ${data.customerName}` : ""}`,
    projectName: data.projectName,
    customerName: data.customerName,
    pmName: data.pmName,
    pmCustomNote: data.pmCustomNote,
    portalUrl: data.portalUrl,
    label: data.label,
    solution: data.solution,
    solutionTypes: data.solutionTypes,
    teamSections: data.teamSections,
    catalog: DESIGN_REVIEW_CATALOG,
    sections: data.sections as Record<string, boolean>,
    renderSection,
  };
  return renderStandard(standard);
}
