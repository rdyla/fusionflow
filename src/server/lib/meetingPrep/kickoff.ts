/**
 * Kickoff meeting prep — body renderer.
 *
 * Migrated from `welcomePackage()` and `renderWelcomeSection()` in
 * `src/server/lib/emailTemplates.ts`. Same output, same section ids, same
 * dark-mode safe palette. This is the only place a new kickoff section's
 * HTML body needs to be wired up.
 */

import { base, escapeHtml, ctaButton, detail } from "../emailTemplates";
import {
  KICKOFF_CATALOG,
  type KickoffSectionId,
} from "../../../shared/meetingPrep/kickoff";
import type { SolutionType } from "../../../shared/solutionTypes";
import { psCard, teamBlock, type MeetingPrepTeamSection } from "./envelope";

export type KickoffSectionMap = Partial<Record<KickoffSectionId, boolean>>;

export type KickoffData = {
  projectName: string;
  customerName: string | null;
  pmName: string;
  pmCustomNote: string;
  portalUrl: string;
  kickoffMeetingUrl: string | null;
  kickoffWhen: string | null;
  kickoffDate: string | null;
  targetGoLiveDate: string | null;
  /** Joined display label (e.g. "UCaaS / CCaaS") for the project's solution types. */
  solution: string | null;
  solutionTypes: readonly SolutionType[];
  teamSections: MeetingPrepTeamSection[];
  distributionListEmail: string | null;
  sections: KickoffSectionMap;
};

function renderKickoffSection(
  id: KickoffSectionId,
  ctx: { distributionListEmail: string | null }
): string {
  const meta = KICKOFF_CATALOG.find((m) => m.id === id);
  if (!meta) return "";
  switch (id) {
    case "adminAccess":
      if (!ctx.distributionListEmail) return "";
      return psCard(
        meta.label,
        `To configure and support your platform, please grant administrator access in your cloud portal to
         <a href="mailto:${escapeHtml(ctx.distributionListEmail)}" style="color:#7de3f3;text-decoration:underline;">${escapeHtml(ctx.distributionListEmail)}</a>.
         This covers the implementation and ongoing support after your transition. We'll walk through the steps with your Implementation Engineer during the first technical meeting.`
      );
    case "porting":
      return psCard(
        meta.label,
        `<ul style="margin:0;padding-left:18px;">
          <li style="margin:0 0 8px;">Request a <strong>Customer Service Record (CSR)</strong> from your voice carrier(s). Carriers typically return it within a couple of business days &mdash; it lists every number and service on the account.</li>
          <li style="margin:0 0 8px;">Send us a copy of your most recent phone bill(s) and identify the <strong>authorized contact</strong> on the account.</li>
          <li style="margin:0;">Send us the list of numbers to port (analog, fax, back-office &mdash; anything that rings). Excel, CSV, or plain text works.</li>
        </ul>`
      );
    case "timeline":
      return psCard(
        meta.label,
        `Please be prepared to discuss target go-live date(s) and production timing at kickoff so we can plan resourcing accordingly.`
      );
    case "discoveryUcaas":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">UCaaS topics we'll work through during discovery. You don't need to bring answers to kickoff &mdash; these are the questions we'll explore in the coming weeks. It helps to start identifying who internally owns each topic so the right voices are at the table.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Current dial plan, extension scheme, and auto-attendant call flows</li>
           <li style="margin:0 0 8px;">Network readiness &mdash; bandwidth, QoS, LAN configuration</li>
           <li style="margin:0 0 8px;">E911 dispatchable location data</li>
           <li style="margin:0 0 8px;">Hardware logistics &mdash; phones, gateways, headsets</li>
           <li style="margin:0;">Auto-attendant + IVR redesign opportunities</li>
         </ul>`
      );
    case "discoveryCcaas":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Contact-center topics we'll work through during discovery. You don't need answers at kickoff &mdash; these are the questions that will guide the design and configuration sessions ahead.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Agent roster, skill matrix, and license assignment</li>
           <li style="margin:0 0 8px;">Queue list, skill-based routing rules, and after-hours behavior</li>
           <li style="margin:0 0 8px;">Call recording &mdash; retention period, consent / disclaimer requirements, storage location</li>
           <li style="margin:0 0 8px;">Reporting + BI integration (Power BI, Tableau, data warehouse exports)</li>
           <li style="margin:0;">Survey and post-call workflow</li>
         </ul>`
      );
    case "discoveryVa":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Virtual-agent topics we'll work through during discovery. You don't need answers at kickoff &mdash; start identifying who internally owns each topic.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Knowledge base content sources and content owners</li>
           <li style="margin:0 0 8px;">Phase 1 intent prioritization (top 10&ndash;25 intents)</li>
           <li style="margin:0 0 8px;">Escalation paths to live agents &mdash; handoff triggers and warm-transfer destinations</li>
           <li style="margin:0 0 8px;">Customer-to-system mapping and APIs to query for caller identification</li>
           <li style="margin:0;">Voice and chat channel selection</li>
         </ul>`
      );
    case "discoveryCi":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Conversation-intelligence topics we'll explore during discovery. These shape how the platform integrates with your existing systems and how supervisors will use it day-to-day.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">CRM integration prerequisites &mdash; Salesforce / HubSpot / Dynamics admin contact and OAuth scope</li>
           <li style="margin:0 0 8px;">Transcript storage compliance &mdash; retention period and PII redaction policy</li>
           <li style="margin:0 0 8px;">Scorecard and trigger-phrase design</li>
           <li style="margin:0;">Agent training and rollout plan</li>
         </ul>`
      );
    case "discoveryWfm":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Workforce-management topics we'll explore during discovery. We'll need historical data and policy inputs to model forecasts and shift plans accurately.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Twelve-month historical interval data &mdash; volume, handle time, AHT</li>
           <li style="margin:0 0 8px;">Forecasting inputs &mdash; channels, queues, skill groups, service-level targets</li>
           <li style="margin:0;">Shift, time-off, and overtime policy inputs</li>
         </ul>`
      );
    case "discoveryQm":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Quality-management topics we'll explore during discovery. These define how evaluations are scored and how feedback flows back to agents.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Scoring rubric &mdash; evaluation form and section weighting</li>
           <li style="margin:0 0 8px;">Calibration cadence and supervisor sign-off process</li>
           <li style="margin:0;">Coaching workflow &mdash; feedback loop and agent acknowledgement</li>
         </ul>`
      );
    case "ssoIdentity":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Identity and access topics we'll cover during discovery. These determine how users sign in and how licenses are provisioned.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Identity provider (Azure AD / Okta / Google) and admin contact</li>
           <li style="margin:0 0 8px;">SAML SSO setup and SCIM provisioning preferences</li>
           <li style="margin:0;">User group and role mapping for license assignment</li>
         </ul>`
      );
    case "changeManagement":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Change-management and rollout topics we'll cover during discovery. The earlier we agree on the rollout shape, the smoother go-live will be.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Internal communications plan &mdash; who's announcing the change, on what cadence</li>
           <li style="margin:0 0 8px;">Training rollout &mdash; admin training first, then end-user; live or recorded</li>
           <li style="margin:0;">Pilot group and phased cutover preferences</li>
         </ul>`
      );
  }
}

export function renderKickoff(data: KickoffData): { subject: string; html: string } {
  const projectName = escapeHtml(data.projectName);
  const customerName = escapeHtml(data.customerName ?? "");
  const pmName = escapeHtml(data.pmName);
  const noteHtml = escapeHtml(data.pmCustomNote).replace(/\r?\n/g, "<br>");

  const summaryRows = [
    data.customerName ? detail("Customer", customerName) : "",
    data.solution ? detail("Solution", escapeHtml(data.solution)) : "",
    data.kickoffDate ? detail("Kickoff", escapeHtml(data.kickoffDate)) : "",
    data.targetGoLiveDate ? detail("Target Go-Live", escapeHtml(data.targetGoLiveDate)) : "",
    detail("Project Manager", pmName),
  ].filter(Boolean).join("");

  const kickoffContent = (() => {
    if (!data.kickoffMeetingUrl) return "";
    const raw = data.kickoffMeetingUrl.trim();
    if (!raw) return "";
    // Auto-linkify standalone http(s) URLs; render everything else as-is with
    // line breaks preserved so dial-ins, access codes, and mixed free-form
    // text (RingCentral / 8x8 / Dialpad / Zoom / etc.) all render cleanly.
    const urlRe = /https?:\/\/[^\s<>"]+/g;
    const escaped = escapeHtml(raw);
    const linkified = escaped.replace(urlRe, (m) =>
      `<a href="${m}" style="color:#7de3f3;text-decoration:underline;word-break:break-all;">${m}</a>`
    );
    return linkified.replace(/\r?\n/g, "<br>");
  })();

  const kickoffWhenLine = data.kickoffWhen && data.kickoffWhen.trim()
    ? `<div style="color:#e8eef7;font-size:13px;font-weight:600;margin-bottom:8px;">${escapeHtml(data.kickoffWhen.trim())}</div>`
    : "";

  const kickoffBlock = (kickoffContent || kickoffWhenLine)
    ? `<div style="background:#14323c;border:1px solid #2a6d7e;border-radius:6px;padding:14px 18px;margin:18px 0 6px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#7de3f3;margin-bottom:6px;">Kickoff Meeting</div>
        ${kickoffWhenLine}
        ${kickoffContent ? `<div style="color:#e8eef7;font-size:14px;line-height:1.55;word-break:break-word;">${kickoffContent}</div>` : ""}
      </div>`
    : "";

  // Walk the catalog, render enabled sections applicable to this project's
  // solution types. Kickoff block sits inline between Admin Access and Porting
  // (historical layout) — preserve that placement.
  const sectionsHtml = KICKOFF_CATALOG
    .filter((meta) =>
      (meta.appliesTo === "all" || meta.appliesTo.some((t) => data.solutionTypes.includes(t))) &&
      data.sections[meta.id as KickoffSectionId] === true
    )
    .map((meta) => {
      const rendered = renderKickoffSection(meta.id as KickoffSectionId, { distributionListEmail: data.distributionListEmail });
      if (meta.id === "adminAccess" && rendered) {
        return `${rendered}${kickoffBlock}`;
      }
      return rendered;
    })
    .filter(Boolean)
    .join("");

  // If adminAccess didn't render (suppressed, disabled, or not applicable), the
  // kickoff block still needs a placement — slot it between summary and sections.
  const adminAccessRendered = data.sections.adminAccess === true && data.distributionListEmail;
  const kickoffBlockFallback = !adminAccessRendered ? kickoffBlock : "";

  const html = base(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f0f6ff;">Welcome to ${projectName}</h2>
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
    ${kickoffBlockFallback}
    ${sectionsHtml}
    ${teamBlock(data.teamSections)}
    ${ctaButton("Open Project Portal", data.portalUrl)}
  `, data.portalUrl);

  const subject = `Welcome to ${data.projectName}${data.customerName ? ` · ${data.customerName}` : ""}`;
  return { subject, html };
}
