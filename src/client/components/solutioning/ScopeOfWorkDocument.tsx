import type { NeedsAssessment, LaborEstimate, Solution } from "../../lib/api";
import type { SowData } from "./SowSizingForm";
import logoUrl from "../../assets/packetfusionlogo.png";

// ── Constants ─────────────────────────────────────────────────────────────────

const WORKSTREAM_LABELS: Record<string, string> = {
  discovery_requirements:      "Discovery & Requirements",
  solution_design:             "Solution Design",
  project_management:          "Project Management",
  implementation_configuration:"Implementation & Configuration",
  integration:                 "Integration",
  migration_data_porting:      "Migration & Data Porting",
  testing_uat:                 "Testing & UAT",
  training_enablement:         "Training & Enablement",
  documentation_handover:      "Documentation & Handover",
  hypercare:                   "Hypercare",
};

const WORKSTREAM_DELIVERABLES: Record<string, string> = {
  discovery_requirements:      "Completed requirements document, current-state analysis, stakeholder interview notes",
  solution_design:             "Solution design document, architecture diagram, configuration specifications",
  project_management:          "Project plan, status reports, risk register, steering committee updates",
  implementation_configuration:"Fully configured platform per agreed specifications, configuration workbook",
  integration:                 "Integrated systems per design, integration test results, API documentation",
  migration_data_porting:      "Migrated data/numbers, cutover plan, migration test results",
  testing_uat:                 "Test plan, executed test cases, UAT sign-off, defect resolution log",
  training_enablement:         "Training sessions delivered, training materials, recorded sessions (where applicable)",
  documentation_handover:      "As-built documentation, admin guides, runbooks, knowledge transfer sessions",
  hypercare:                   "Post-go-live support, issue resolution, knowledge transition to customer team",
};

const WORKSTREAM_ORDER = Object.keys(WORKSTREAM_LABELS);

const TYPE_LABELS: Record<string, string> = {
  ucaas: "Unified Communications (UCaaS)",
  ccaas: "Contact Center (CCaaS)",
  ci:    "Conversation Intelligence",
  va:    "AI Virtual Agent",
  zoom_ra: "Zoom Revenue Accelerator",
  zoom_va: "Zoom Virtual Agent",
  rc_ace:  "RingCentral ACE",
  rc_air:  "RingCentral AIR",
};

const VENDOR_LABELS: Record<string, string> = {
  zoom:            "Zoom",
  ringcentral:     "RingCentral",
  microsoft_teams: "Microsoft Teams",
  cato:            "Cato Networks",
  microsoft:       "Microsoft",
  cisco:           "Cisco",
  tbd:             "TBD",
};

const ACCENTS = ["#0b9aad", "#03395f", "#0284c7", "#0e7490", "#1d4ed8", "#6366f1"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtAnswer(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  if (Array.isArray(val)) return val.length === 0 ? "" : val.join(", ");
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (val === "yes") return "Yes";
  if (val === "no") return "No";
  return String(val);
}

function ans(answers: Record<string, unknown>, key: string): string {
  return fmtAnswer(answers[key]);
}

// ── HTML Builder ──────────────────────────────────────────────────────────────

function buildSowHtml(
  solution: Solution,
  needsAssessment: NeedsAssessment | null,
  laborEstimate: LaborEstimate | null,
  scopeText: string,
  logo: string,
  sowData?: SowData | null,
): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const logoAbsolute = logo.startsWith("http") ? logo : `${window.location.origin}${logo}`;
  const customerName = solution.customer_name || "Customer";
  const solutionTypeLabel = TYPE_LABELS[solution.solution_type] ?? solution.solution_type;
  const vendorLabel = VENDOR_LABELS[solution.vendor] ?? solution.vendor ?? "";
  const platformLabel = [vendorLabel !== "TBD" ? vendorLabel : null, solutionTypeLabel].filter(Boolean).join(" – ");

  const a = needsAssessment?.answers ?? {};

  // ── Section helpers ────────────────────────────────────────────────────────

  function dataRow(label: string, value: string): string {
    if (!value) return "";
    return `<tr>
      <td class="lc">${esc(label)}</td>
      <td class="vc">${esc(value).replace(/\n/g, "<br/>")}</td>
    </tr>`;
  }

  function section(num: string, title: string, content: string, accentIdx = 0): string {
    const accent = ACCENTS[accentIdx % ACCENTS.length];
    return `
    <div class="sow-section" style="border-left-color:${accent}">
      <div class="sow-section-title" style="color:${accent}">${esc(num)} &nbsp; ${esc(title)}</div>
      ${content}
    </div>`;
  }

  // ── Section 1: Objectives ─────────────────────────────────────────────────
  const businessGoals    = ans(a, "business_goals");
  const currentProblems  = ans(a, "current_problems_to_solve");
  const success90        = ans(a, "success_90_days");
  const success612       = ans(a, "success_6_12_months");

  const objectivesRows = [
    dataRow("Business Goals", businessGoals),
    dataRow("Problems to Solve", currentProblems),
    dataRow("Success at 90 Days", success90),
    dataRow("Success at 6–12 Months", success612),
  ].filter(Boolean).join("");

  const objectivesHtml = objectivesRows
    ? `<table><tbody>${objectivesRows}</tbody></table>`
    : `<p class="na-note">Business objectives will be captured during the discovery phase.</p>`;

  // ── Section 2: Scope ──────────────────────────────────────────────────────
  const phase1Scope   = ans(a, "phase_1_scope_summary");
  const channels      = ans(a, "channels_required_phase_1");
  const useCases      = ans(a, "primary_use_cases") || ans(a, "top_use_cases_for_phase_1");
  const integrations  = ans(a, "crm_in_use")
    ? `CRM: ${ans(a, "crm_in_use")}${ans(a, "other_integrations_required") ? "; " + ans(a, "other_integrations_required") : ""}`
    : ans(a, "other_integrations_required");
  const migration     = ans(a, "migration_required");

  const scopeRows = [
    dataRow("Phase 1 Scope", phase1Scope),
    dataRow("Channels / Modalities", channels),
    dataRow("Use Cases", useCases),
    dataRow("Integrations", integrations),
    dataRow("Migration / Porting", migration),
    scopeText ? dataRow("Additional Scope Notes", scopeText) : "",
  ].filter(Boolean).join("");

  const scopeHtml = scopeRows
    ? `<table><tbody>${scopeRows}</tbody></table>`
    : scopeText
    ? `<p>${esc(scopeText)}</p>`
    : `<p class="na-note">Scope details will be defined during the discovery and design phase.</p>`;

  // ── Section 1.3: Confirmed Solution Sizing ───────────────────────────────
  let sizingHtml = "";
  if (sowData) {
    const rows: string[] = [];

    const hasUcaas = !!(sowData.ucaas.basic_users || sowData.ucaas.advanced_users || sowData.ucaas.common_area || sowData.ucaas.conference_rooms || sowData.ucaas.operators);
    if (hasUcaas) {
      if (sowData.ucaas.basic_users)          rows.push(dataRow("UCaaS · Basic Users",          sowData.ucaas.basic_users));
      if (sowData.ucaas.advanced_users)       rows.push(dataRow("UCaaS · Advanced Users",       sowData.ucaas.advanced_users));
      if (sowData.ucaas.common_area)          rows.push(dataRow("UCaaS · Common Area",           sowData.ucaas.common_area));
      if (sowData.ucaas.conference_rooms)     rows.push(dataRow("UCaaS · Conference Rooms",      sowData.ucaas.conference_rooms));
      if (sowData.ucaas.operators)            rows.push(dataRow("UCaaS · Operators",             sowData.ucaas.operators));
      if (sowData.ucaas.additional_did)       rows.push(dataRow("UCaaS · Additional DIDs",       sowData.ucaas.additional_did));
      if (sowData.ucaas.additional_toll_free) rows.push(dataRow("UCaaS · Toll Free Numbers",     sowData.ucaas.additional_toll_free));
      if (sowData.ucaas.ms_teams_type && sowData.ucaas.ms_teams_type !== "none") {
        rows.push(dataRow("UCaaS · MS Teams Integration", sowData.ucaas.ms_teams_type));
      }
    }

    const hasCcaas = !!(sowData.ccaas.agents || sowData.ccaas.supervisors);
    if (hasCcaas) {
      if (sowData.ccaas.agents)      rows.push(dataRow("CCaaS · Agents",      sowData.ccaas.agents));
      if (sowData.ccaas.supervisors) rows.push(dataRow("CCaaS · Supervisors", sowData.ccaas.supervisors));
      if (sowData.ccaas.admin_only)  rows.push(dataRow("CCaaS · Admin Only",  sowData.ccaas.admin_only));
      const ccChannels = (["voice","email","chat","sms","fax"] as const).filter(c => sowData.ccaas[c] === true).join(", ");
      if (ccChannels) rows.push(dataRow("CCaaS · Channels (Phase 1)", ccChannels));
      if (sowData.ccaas.byoc_carrier && sowData.ccaas.byoc_carrier !== "N/A") rows.push(dataRow("CCaaS · BYOC Carrier", sowData.ccaas.byoc_carrier));
    }

    if (sowData.ci.licensed_seats) {
      rows.push(dataRow("CI · Licensed Seats",     sowData.ci.licensed_seats));
      if (sowData.ci.recording_channels) rows.push(dataRow("CI · Recording Channels", sowData.ci.recording_channels));
      if (sowData.ci.retention_months)   rows.push(dataRow("CI · Retention (months)", sowData.ci.retention_months));
      if (sowData.ci.crm_integration && sowData.ci.crm_name) rows.push(dataRow("CI · CRM Integration", sowData.ci.crm_name));
    }

    if (sowData.va.intent_count || sowData.va.monthly_session_volume) {
      const vaChannels = (["voice","chat","sms"] as const).filter(c => sowData.va[c] === true).join(", ");
      if (vaChannels)                          rows.push(dataRow("VA · Channels",         vaChannels));
      if (sowData.va.intent_count)             rows.push(dataRow("VA · Intents (Phase 1)", sowData.va.intent_count));
      if (sowData.va.monthly_session_volume)   rows.push(dataRow("VA · Monthly Sessions",  sowData.va.monthly_session_volume));
      if (sowData.va.crm_integration && sowData.va.crm_name) rows.push(dataRow("VA · CRM Integration", sowData.va.crm_name));
      if (sowData.va.live_agent_escalation)    rows.push(dataRow("VA · Live Agent Escalation", "Yes"));
    }

    if (sowData.shared.sites_count)               rows.push(dataRow("Sites",                   sowData.shared.sites_count));
    if (sowData.shared.phases_count)              rows.push(dataRow("Phases / Go-Lives",        sowData.shared.phases_count));
    if (sowData.shared.implementation_strategy)   rows.push(dataRow("Implementation Strategy", sowData.shared.implementation_strategy));
    if (sowData.shared.porting_required === true) {
      const portingDetail = `Yes — Carrier: ${sowData.shared.porting_carrier || "TBD"}, DIDs: ${sowData.shared.porting_did_count || "TBD"}`;
      rows.push(dataRow("Number Porting", portingDetail));
    }
    if (sowData.shared.fax_count)             rows.push(dataRow("Fax Machines",         sowData.shared.fax_count));
    if (sowData.shared.ata_count)             rows.push(dataRow("ATA Adapters",          sowData.shared.ata_count));
    if (sowData.shared.overhead_paging_count) rows.push(dataRow("Overhead Paging",       sowData.shared.overhead_paging_count));
    if (sowData.shared.ip_paging_count)       rows.push(dataRow("IP Paging Speakers",    sowData.shared.ip_paging_count));
    const sowCost = sowData.shared.sow_cost_after || sowData.shared.sow_cost_before;
    if (sowCost)                              rows.push(dataRow("SOW Investment",         sowCost));
    if (sowData.additional_notes)             rows.push(dataRow("Sizing Notes",           sowData.additional_notes));

    if (rows.length > 0) {
      sizingHtml = `<table><tbody>${rows.join("")}</tbody></table>`;
    }
  }

  // ── Section 3: Work Breakdown ─────────────────────────────────────────────
  const wbsRows = WORKSTREAM_ORDER
    .filter((ws) => laborEstimate ? (laborEstimate.final_hours[ws] ?? 0) > 0 : true)
    .map((ws, i) => {
      const hours = laborEstimate ? (laborEstimate.final_hours[ws] ?? 0) : null;
      const low   = laborEstimate ? Math.round((laborEstimate.final_hours[ws] ?? 0) * 0.85) : null;
      const high  = laborEstimate ? Math.round((laborEstimate.final_hours[ws] ?? 0) * 1.15) : null;
      const deliverable = WORKSTREAM_DELIVERABLES[ws] ?? "";
      const rowClass = i % 2 === 0 ? "even" : "odd";
      return `<tr class="${rowClass}">
        <td class="ws-name">${esc(WORKSTREAM_LABELS[ws] ?? ws)}</td>
        <td class="ws-deliverable">${esc(deliverable)}</td>
        <td class="ws-hours">${hours !== null ? `${low}–${high}h` : "TBD"}</td>
      </tr>`;
    }).join("");

  const totalLow      = laborEstimate?.total_low ?? null;
  const totalExpected = laborEstimate?.total_expected ?? null;
  const totalHigh     = laborEstimate?.total_high ?? null;
  const complexity    = laborEstimate?.complexity;
  const confidence    = laborEstimate?.confidence_band ?? null;
  const riskFlags     = laborEstimate?.risk_flags ?? [];

  const wbsFooter = totalExpected
    ? `<tr class="total-row">
        <td><strong>Total Estimated Effort</strong></td>
        <td></td>
        <td class="ws-hours"><strong>${totalLow}–${totalHigh}h</strong><br/><span style="font-size:8pt;color:#64748b">Expected: ${totalExpected}h</span></td>
      </tr>`
    : "";

  const wbsHtml = wbsRows
    ? `<table class="wbs-table">
        <thead><tr>
          <th class="ws-name">Workstream</th>
          <th class="ws-deliverable">Key Deliverables</th>
          <th class="ws-hours">Effort Range</th>
        </tr></thead>
        <tbody>${wbsRows}${wbsFooter}</tbody>
      </table>`
    : `<p class="na-note">A labor estimate has not yet been generated for this solution.</p>`;

  // ── Section 4: Investment ─────────────────────────────────────────────────
  const investmentRows = [
    totalLow && totalHigh ? dataRow("Estimated Effort Range", `${totalLow} – ${totalHigh} hours`) : "",
    totalExpected ? dataRow("Expected Effort", `${totalExpected} hours`) : "",
    complexity ? dataRow("Complexity", `${complexity.band.charAt(0).toUpperCase() + complexity.band.slice(1)} (${complexity.score}/100 · ${complexity.multiplier}× multiplier)`) : "",
    confidence ? dataRow("Estimate Confidence", confidence.charAt(0).toUpperCase() + confidence.slice(1)) : "",
  ].filter(Boolean).join("");

  const flagsHtml = riskFlags.length > 0
    ? `<div class="risk-flags"><strong>Estimate Risk Flags:</strong><ul>${riskFlags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>`
    : "";

  const investmentHtml = investmentRows
    ? `<table><tbody>${investmentRows}</tbody></table>${flagsHtml}`
    : `<p class="na-note">Investment details will be available once a labor estimate is generated.</p>`;

  // ── Section 5: Assumptions & Customer Responsibilities ───────────────────
  const prereqs       = ans(a, "customer_prerequisites_before_design");
  const contentInputs = ans(a, "customer_must_provide_content_inputs");
  const crmAdmin      = ans(a, "crm_admin_owner");
  const sandbox       = ans(a, "sandbox_testing_required");
  const signoff       = ans(a, "signoff_roles");
  const programOwner  = ans(a, "program_owner_function") || ans(a, "platform_admin_owner");

  const assumptionRows = [
    dataRow("Customer Prerequisites", prereqs),
    dataRow("Content / Data Inputs", contentInputs),
    dataRow("CRM Administrator", crmAdmin),
    dataRow("Program / Platform Owner", programOwner),
    dataRow("Sandbox / Test Environment", sandbox),
    dataRow("Customer Sign-off Roles", signoff),
  ].filter(Boolean).join("");

  const stdAssumptions = `
    <div class="std-assumptions">
      <p>The following standard assumptions apply to this engagement:</p>
      <ul>
        <li>Customer will provide timely access to key stakeholders for discovery and design sessions.</li>
        <li>Customer will designate a project sponsor with authority to make scope and prioritization decisions.</li>
        <li>Third-party systems not listed in scope are excluded unless separately agreed in writing.</li>
        <li>This estimate is based on information available at time of assessment and may be revised after formal discovery.</li>
        <li>All work will be performed remotely unless otherwise agreed.</li>
        <li>Customer is responsible for end-user change management and internal communications.</li>
      </ul>
    </div>`;

  const assumptionsHtml = `${assumptionRows ? `<table><tbody>${assumptionRows}</tbody></table>` : ""}${stdAssumptions}`;

  // ── Put it all together ────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(customerName)} — Statement of Work</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, Arial, sans-serif;
      font-size: 10.5pt;
      color: #1e293b;
      background: #fff;
    }
    .page { max-width: 820px; margin: 0 auto; padding: 48px 56px; }

    /* ── Cover ─────────────────────────── */
    .cover { padding-bottom: 36px; margin-bottom: 32px; border-bottom: 1px solid #e2e8f0; }
    .cover-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
    .cover-logo { height: 44px; width: auto; }
    .cover-date { font-size: 9pt; color: #94a3b8; text-align: right; margin-top: 4px; }
    .cover-rule {
      height: 4px;
      background: linear-gradient(90deg, #03395f 0%, #0b9aad 50%, #63c1ea 100%);
      margin-bottom: 28px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .cover-type { font-size: 9pt; font-weight: 700; color: #0b9aad; text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 8px; }
    .cover-title { font-size: 26pt; font-weight: 800; color: #03395f; letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 6px; }
    .cover-for { font-size: 11pt; color: #64748b; margin-bottom: 4px; }
    .cover-customer { font-size: 17pt; font-weight: 700; color: #1e293b; margin-bottom: 20px; }
    .cover-meta { display: flex; gap: 0; border-top: 1px solid #e2e8f0; padding-top: 16px; }
    .cover-meta-item { flex: 1; padding-right: 20px; border-right: 1px solid #e2e8f0; margin-right: 20px; }
    .cover-meta-item:last-child { border-right: none; margin-right: 0; }
    .cover-meta-label { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 3px; }
    .cover-meta-value { font-size: 10pt; font-weight: 600; color: #334155; }

    /* ── Section heading ───────────────── */
    .section-heading { display: flex; align-items: center; gap: 12px; margin: 36px 0 20px; }
    .section-heading-text { font-size: 11pt; font-weight: 800; color: #03395f; text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; }
    .section-heading-rule { flex: 1; height: 2px; background: linear-gradient(90deg, #03395f, transparent); -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    /* ── SOW sections ──────────────────── */
    .sow-section { border-left: 3px solid #0b9aad; margin-bottom: 24px; page-break-inside: avoid; padding-left: 16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sow-section-title { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px; }

    /* ── Tables ────────────────────────── */
    table { width: 100%; border-collapse: collapse; }
    .lc { width: 32%; font-size: 9.5pt; font-weight: 600; color: #64748b; padding: 6px 16px 6px 0; vertical-align: top; border-bottom: 1px solid #f1f5f9; }
    .vc { font-size: 9.5pt; color: #1e293b; line-height: 1.6; padding: 6px 0; vertical-align: top; border-bottom: 1px solid #f1f5f9; }

    /* ── WBS table ─────────────────────── */
    .wbs-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .wbs-table thead tr { background: #03395f; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .wbs-table thead th { padding: 9px 12px; color: #fff; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: 0.06em; font-size: 7.5pt; }
    .ws-name { width: 25%; }
    .ws-deliverable { width: 55%; }
    .ws-hours { width: 20%; text-align: right; white-space: nowrap; }
    .wbs-table tbody tr.even { background: #f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .wbs-table tbody tr.odd { background: #fff; }
    .wbs-table tbody td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; color: #334155; line-height: 1.5; }
    .wbs-table tbody td.ws-hours { color: #0b9aad; font-weight: 700; text-align: right; }
    .total-row td { background: #f0f9ff !important; font-weight: 700; border-top: 2px solid #0b9aad; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .total-row td.ws-hours { color: #03395f; }

    /* ── Notes/prose ───────────────────── */
    .na-note { font-size: 9.5pt; color: #94a3b8; font-style: italic; }
    .std-assumptions { margin-top: 14px; }
    .std-assumptions p { font-size: 9.5pt; color: #475569; margin-bottom: 8px; }
    .std-assumptions ul { padding-left: 18px; }
    .std-assumptions li { font-size: 9.5pt; color: #475569; line-height: 1.7; }
    .risk-flags { margin-top: 10px; padding: 10px 14px; background: #fff7ed; border-left: 3px solid #f59e0b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .risk-flags strong { font-size: 9pt; color: #92400e; }
    .risk-flags ul { padding-left: 16px; margin-top: 4px; }
    .risk-flags li { font-size: 9pt; color: #92400e; line-height: 1.6; }

    /* ── Sign-off ──────────────────────── */
    .signoff { margin-top: 40px; page-break-inside: avoid; }
    .signoff-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .signoff-heading-text { font-size: 11pt; font-weight: 800; color: #03395f; text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; }
    .signoff-heading-rule { flex: 1; height: 2px; background: linear-gradient(90deg, #03395f, transparent); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .signoff-body p { font-size: 9.5pt; color: #64748b; line-height: 1.6; margin-bottom: 24px; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px 40px; }
    .sig-line { border-bottom: 1px solid #cbd5e1; height: 40px; margin-bottom: 5px; }
    .sig-label { font-size: 7.5pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; }

    /* ── Footer ────────────────────────── */
    .footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 7.5pt; color: #94a3b8; display: flex; align-items: center; justify-content: space-between; }
    .footer img { height: 16px; width: auto; opacity: 0.5; }

    /* ── Print tip ─────────────────────── */
    .print-tip { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 16px; margin-bottom: 24px; font-size: 9.5pt; color: #92400e; display: flex; align-items: center; gap: 10px; }
    @media print {
      .print-tip { display: none !important; }
      @page { margin: 15mm 18mm; }
    }
  </style>
</head>
<body>
<div class="page">

  <div class="print-tip">
    <span style="font-size:14pt">💡</span>
    <span>In the print dialog, uncheck <strong>"Headers and footers"</strong> (Chrome) or <strong>"Print headers and footers"</strong> (Firefox/Edge) to remove the browser URL and date from the page.</span>
  </div>

  <!-- Cover -->
  <div class="cover">
    <div class="cover-top">
      <img class="cover-logo" src="${logoAbsolute}" alt="Packet Fusion" onerror="this.style.display='none'"/>
      <div class="cover-date">${today}</div>
    </div>
    <div class="cover-rule"></div>
    <div class="cover-type">Professional Services</div>
    <div class="cover-title">Statement<br/>of Work</div>
    <div class="cover-for">Prepared for</div>
    <div class="cover-customer">${esc(customerName)}</div>
    <div class="cover-meta">
      <div class="cover-meta-item">
        <div class="cover-meta-label">Platform</div>
        <div class="cover-meta-value">${esc(platformLabel)}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Prepared by</div>
        <div class="cover-meta-value">Packet Fusion, Inc.</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Document Type</div>
        <div class="cover-meta-value">Statement of Work</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Date</div>
        <div class="cover-meta-value">${today}</div>
      </div>
    </div>
  </div>

  <!-- Section heading: Engagement Overview -->
  <div class="section-heading">
    <div class="section-heading-text">Engagement Overview</div>
    <div class="section-heading-rule"></div>
  </div>

  ${section("1.1", "Engagement Objectives", objectivesHtml, 0)}
  ${section("1.2", "Scope of Work", scopeHtml, 1)}
  ${sizingHtml ? section("1.3", "Confirmed Solution Sizing", sizingHtml, 2) : ""}

  <!-- Section heading: Delivery Plan -->
  <div class="section-heading">
    <div class="section-heading-text">Delivery Plan</div>
    <div class="section-heading-rule"></div>
  </div>

  ${section("2.1", "Work Breakdown & Deliverables", wbsHtml, 2)}
  ${section("2.2", "Project Investment", investmentHtml, 3)}

  <!-- Section heading: Assumptions & Responsibilities -->
  <div class="section-heading">
    <div class="section-heading-text">Assumptions &amp; Responsibilities</div>
    <div class="section-heading-rule"></div>
  </div>

  ${section("3.1", "Assumptions & Customer Responsibilities", assumptionsHtml, 4)}

  <!-- Sign-Off -->
  <div class="signoff">
    <div class="signoff-heading">
      <div class="signoff-heading-text">Acceptance &amp; Sign-Off</div>
      <div class="signoff-heading-rule"></div>
    </div>
    <div class="signoff-body">
      <p>By signing below, the undersigned parties agree to the scope, deliverables, and effort estimates described in this Statement of Work. Packet Fusion, Inc. will proceed with resource planning and project initiation upon receipt of this signed document.</p>
      <div class="sig-grid">
        <div><div class="sig-line"></div><div class="sig-label">Customer Signature</div></div>
        <div><div class="sig-line"></div><div class="sig-label">Printed Name &amp; Title</div></div>
        <div><div class="sig-line"></div><div class="sig-label">Date</div></div>
        <div><div class="sig-line"></div><div class="sig-label">Packet Fusion Representative</div></div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <img src="${logoAbsolute}" alt="Packet Fusion" onerror="this.style.display='none'"/>
    <span>${esc(customerName)} &nbsp;&middot;&nbsp; Statement of Work &nbsp;&middot;&nbsp; ${today}</span>
    <span>Packet Fusion, Inc. &nbsp;&middot;&nbsp; Confidential</span>
  </div>

</div>
</body>
</html>`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  solution: Solution;
  needsAssessment: NeedsAssessment | null;
  laborEstimate: LaborEstimate | null;
  scopeText: string;
  sowData?: SowData | null;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScopeOfWorkDocument({ solution, needsAssessment, laborEstimate, scopeText, sowData }: Props) {
  const customerName = solution.customer_name || "Customer";
  const solutionTypeLabel = TYPE_LABELS[solution.solution_type] ?? solution.solution_type;
  const vendorLabel = VENDOR_LABELS[solution.vendor] ?? solution.vendor ?? "";
  const platformLabel = [vendorLabel !== "TBD" ? vendorLabel : null, solutionTypeLabel].filter(Boolean).join(" – ");
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const hasNa = needsAssessment !== null;
  const hasEstimate = laborEstimate !== null;

  function openPrintWindow() {
    const html = buildSowHtml(solution, needsAssessment, laborEstimate, scopeText, logoUrl, sowData);
    const win = window.open("", "_blank", "width=960,height=750");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  return (
    <div>
      {/* Action bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <button className="ms-btn-primary" onClick={openPrintWindow} style={{ background: "#03395f" }}>
          Export / Print SOW
        </button>
        <div style={{ fontSize: 12, color: "#94a3b8", marginLeft: 8 }}>
          {!hasNa && <span style={{ color: "#f59e0b", marginRight: 12 }}>⚠ No needs assessment — some sections will be blank</span>}
          {!hasEstimate && <span style={{ color: "#f59e0b" }}>⚠ No labor estimate — effort section will be blank</span>}
        </div>
      </div>

      {/* Preview card */}
      <div className="ms-card" style={{ padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#03395f", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Packet Fusion, Inc.
            </div>
            <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#1e293b" }}>Statement of Work</h2>
            <div style={{ fontSize: 13, color: "#64748b" }}>{platformLabel}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13, color: "#64748b" }}>
            <div><strong>Customer:</strong> {customerName}</div>
            <div><strong>Platform:</strong> {platformLabel}</div>
            <div><strong>Date:</strong> {today}</div>
          </div>
        </div>

        {/* Workstream summary table — preview only */}
        {hasEstimate && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#03395f", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Work Breakdown
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#64748b", fontWeight: 600, borderBottom: "2px solid #e2e8f0" }}>Workstream</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "#64748b", fontWeight: 600, borderBottom: "2px solid #e2e8f0" }}>Hours (Low–High)</th>
                </tr>
              </thead>
              <tbody>
                {WORKSTREAM_ORDER.filter((ws) => (laborEstimate.final_hours[ws] ?? 0) > 0).map((ws) => {
                  const h = laborEstimate.final_hours[ws] ?? 0;
                  const low = Math.round(h * 0.85);
                  const high = Math.round(h * 1.15);
                  return (
                    <tr key={ws} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 12px", color: "#334155" }}>{WORKSTREAM_LABELS[ws]}</td>
                      <td style={{ padding: "8px 12px", color: "#0b9aad", fontWeight: 600, textAlign: "right" }}>{low}–{high}h</td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "2px solid #0b9aad", background: "#f0f9ff" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: "#03395f" }}>Total Estimated Effort</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: "#03395f", textAlign: "right" }}>
                    {laborEstimate.total_low}–{laborEstimate.total_high}h
                    <span style={{ fontWeight: 400, color: "#64748b", fontSize: 12, marginLeft: 6 }}>(Expected: {laborEstimate.total_expected}h)</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {!hasEstimate && (
          <div style={{ padding: "12px 16px", background: "#fff7ed", border: "1px solid #fde68a", borderRadius: 6, fontSize: 13, color: "#92400e", marginBottom: 16 }}>
            Generate a labor estimate on the Labor Estimate tab to populate the effort section of the SOW.
          </div>
        )}

        {!hasNa && (
          <div style={{ padding: "12px 16px", background: "#fff7ed", border: "1px solid #fde68a", borderRadius: 6, fontSize: 13, color: "#92400e" }}>
            Complete a needs assessment to populate the objectives, scope, and assumptions sections.
          </div>
        )}

        {hasNa && (() => {
          const a = needsAssessment.answers;
          const goals = a.business_goals ? String(a.business_goals) : null;
          const scope = a.phase_1_scope_summary ? String(a.phase_1_scope_summary) : null;
          return (goals || scope) ? (
            <div style={{ display: "grid", gap: 12 }}>
              {goals && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#03395f", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Business Goals</div>
                  <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{goals}</p>
                </div>
              )}
              {scope && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#03395f", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Phase 1 Scope</div>
                  <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{scope}</p>
                </div>
              )}
            </div>
          ) : null;
        })()}
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "12px 0" }}>
        This document is generated by CloudConnect by Packet Fusion, Inc. · {today}
      </div>
    </div>
  );
}
