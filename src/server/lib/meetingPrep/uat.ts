/**
 * UAT meeting prep — body renderer.
 */

import {
  UAT_CATALOG,
  type UatSectionId,
} from "../../../shared/meetingPrep/uat";
import { psCard, type MeetingPrepTeamSection } from "./envelope";
import { renderStandard, type StandardMeetingPrepData } from "./standardEnvelope";
import type { SolutionType } from "../../../shared/solutionTypes";

export type UatData = {
  projectName: string;
  customerName: string | null;
  pmName: string;
  pmCustomNote: string;
  portalUrl: string;
  label: string | null;
  solution: string | null;
  solutionTypes: readonly SolutionType[];
  teamSections: MeetingPrepTeamSection[];
  sections: Partial<Record<UatSectionId, boolean>>;
};

function renderSection(id: string): string {
  const meta = UAT_CATALOG.find((m) => m.id === id);
  if (!meta) return "";
  switch (id as UatSectionId) {
    case "uatAgenda":
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">User Acceptance Testing is the customer's chance to validate that the configured solution behaves as designed. We'll walk through the test plan, kick off testing, and triage anything that comes up.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Test plan walk-through &mdash; scenarios, expected results, pass/fail definitions</li>
           <li style="margin:0 0 8px;">Tester onboarding &mdash; access, environment, defect logging</li>
           <li style="margin:0;">Cadence &mdash; daily check-ins through UAT, defect triage, sign-off target date</li>
         </ul>`
      );
    case "uatAcceptanceCriteria":
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">UAT is considered passed when:</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">All scenarios in the test plan have been executed</li>
           <li style="margin:0 0 8px;">Critical and high-severity defects are resolved or have a customer-approved workaround</li>
           <li style="margin:0;">The customer's designated UAT lead has signed off in writing</li>
         </ul>`
      );
    case "uatSignoffProcess":
      return psCard(
        meta.label,
        `<p style="margin:0 0 8px;">Sign-off is a written confirmation from the customer's designated UAT lead, captured in the project portal or via reply-all email.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Sign-off triggers go-live planning &mdash; cutover scheduling, hypercare staffing</li>
           <li style="margin:0 0 8px;">Defects raised after sign-off go through standard support channels (no longer UAT)</li>
           <li style="margin:0;">Material change requests after sign-off follow the change-order process</li>
         </ul>`
      );
  }
}

export function renderUat(data: UatData): { subject: string; html: string } {
  const labelSuffix = data.label && data.label.trim() ? ` (${data.label.trim()})` : "";
  const standard: StandardMeetingPrepData = {
    title: "UAT Prep",
    subject: `UAT prep${labelSuffix} — ${data.projectName}${data.customerName ? ` · ${data.customerName}` : ""}`,
    projectName: data.projectName,
    customerName: data.customerName,
    pmName: data.pmName,
    pmCustomNote: data.pmCustomNote,
    portalUrl: data.portalUrl,
    label: data.label,
    solution: data.solution,
    solutionTypes: data.solutionTypes,
    teamSections: data.teamSections,
    catalog: UAT_CATALOG,
    sections: data.sections as Record<string, boolean>,
    renderSection,
  };
  return renderStandard(standard);
}
