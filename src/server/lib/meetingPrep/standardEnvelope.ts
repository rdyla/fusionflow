/**
 * Standard meeting-prep email envelope.
 *
 * The kickoff renderer is more elaborate (kickoff block, conditional
 * placement, summary table). Discovery / design-review / UAT / go-live use
 * a simpler shared envelope: title + PM note + label sub-line + sections +
 * team + CTA. This helper bottles that pattern so each renderer is mostly
 * just its body switch.
 *
 * Each meeting type still gets its own subject, title, and section bodies —
 * those are passed in.
 */

import { base, escapeHtml, ctaButton, detail } from "../emailTemplates";
import type { SolutionType } from "../../../shared/solutionTypes";
import type { MeetingPrepSectionMeta } from "../../../shared/meetingPrep";
import { teamBlock, type MeetingPrepTeamSection } from "./envelope";

export type StandardMeetingPrepData = {
  /** Human heading inside the email (e.g. "Discovery — Network Architecture"). */
  title: string;
  /** Subject line for the email. */
  subject: string;
  projectName: string;
  customerName: string | null;
  pmName: string;
  pmCustomNote: string;
  portalUrl: string;
  /** Optional label for this specific send (e.g. "Network Architecture"). Rendered as a sub-line under the title. */
  label: string | null;
  solution: string | null;
  solutionTypes: readonly SolutionType[];
  teamSections: MeetingPrepTeamSection[];
  /** Catalog of all sections for this meeting type. */
  catalog: readonly MeetingPrepSectionMeta[];
  /** Map of section id → enabled. */
  sections: Record<string, boolean>;
  /** Render one section body. Returns "" to suppress. */
  renderSection: (id: string) => string;
};

export function renderStandard(data: StandardMeetingPrepData): { subject: string; html: string } {
  const projectName = escapeHtml(data.projectName);
  const customerName = escapeHtml(data.customerName ?? "");
  const pmName = escapeHtml(data.pmName);
  const noteHtml = escapeHtml(data.pmCustomNote).replace(/\r?\n/g, "<br>");
  const labelHtml = data.label && data.label.trim()
    ? `<div style="margin:0 0 18px;font-size:13px;color:#7de3f3;font-weight:600;letter-spacing:0.04em;">${escapeHtml(data.label.trim())}</div>`
    : "";

  const summaryRows = [
    data.customerName ? detail("Customer", customerName) : "",
    data.solution ? detail("Solution", escapeHtml(data.solution)) : "",
    detail("Project Manager", pmName),
  ].filter(Boolean).join("");

  const sectionsHtml = data.catalog
    .filter((meta) =>
      (meta.appliesTo === "all" || meta.appliesTo.some((t) => data.solutionTypes.includes(t))) &&
      data.sections[meta.id] === true
    )
    .map((meta) => data.renderSection(meta.id))
    .filter(Boolean)
    .join("");

  const html = base(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f0f6ff;">${escapeHtml(data.title)} &mdash; ${projectName}</h2>
    ${labelHtml}
    <p style="margin:0 0 18px;font-size:14px;color:rgba(240,246,255,0.6);line-height:1.6;">
      A note from <strong style="color:rgba(240,246,255,0.9);">${pmName}</strong>, your Project Manager.
    </p>
    ${data.pmCustomNote.trim()
      ? `<div style="background:rgba(255,255,255,0.04);border-left:3px solid #00c8e0;padding:14px 18px;margin:0 0 18px;font-size:14px;color:rgba(240,246,255,0.85);line-height:1.65;">${noteHtml}</div>`
      : ""}
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(240,246,255,0.5);margin-bottom:10px;">Project Summary</div>
      <table style="border-collapse:collapse;">${summaryRows}</table>
    </div>
    ${sectionsHtml}
    ${teamBlock(data.teamSections)}
    ${ctaButton("Open Project Portal", data.portalUrl)}
  `, data.portalUrl);

  return { subject: data.subject, html };
}
