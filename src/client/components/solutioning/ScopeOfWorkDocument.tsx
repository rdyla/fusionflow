import type { NeedsAssessment, LaborEstimate, Solution } from "../../lib/api";
import type { SowData } from "./SowSizingForm";
import { calcSowTotal, calcBasicSowTotal, DEFAULT_BLENDED_RATE, type AddOn } from "../../../shared/sowAddOns";
import { calcUcaasBasicBreakdown, getUcaasTieredTier } from "../../../shared/ucaasBasicPricing";
import logoUrl from "../../assets/packetfusion-fullcolor.png";

// ── Constants ─────────────────────────────────────────────────────────────────

// SOW-scoped brand palette. Derived from the docs/SOW reference bundle (logo →
// hex sample). Slightly different from the rest of the app (which uses #03395f
// navy and #22c55e green). Scoped here intentionally — the SOW lives in its
// own visual context and these values are the on-brand snapshot for customer
// deliverables.
const SOW_NAVY  = "#003B5C";
const SOW_GREEN = "#17C662";
const SOW_GREY  = "#D9E1E2";

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

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Combine final_hours from every per-type labor estimate into one workstream → hours map. */
function unifyFinalHours(estimates: LaborEstimate[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const le of estimates) {
    const fh = le.final_hours ?? {};
    for (const ws of Object.keys(fh)) {
      out[ws] = (out[ws] ?? 0) + (fh[ws] ?? 0);
    }
  }
  return out;
}

function buildSowHtml(
  solution: Solution,
  needsAssessment: NeedsAssessment | null,
  laborEstimates: LaborEstimate[],
  scopeText: string,
  logo: string,
  sowData?: SowData | null,
): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const logoAbsolute = logo.startsWith("http") ? logo : `${window.location.origin}${logo}`;
  const customerName = solution.customer_name || "Customer";
  // Multi-type solutions get a joined label (e.g. "UCaaS / CCaaS") so the SOW document
  // title + header reflect every type the customer is scoped to.
  const solutionTypeLabel = solution.solution_types.map((t) => TYPE_LABELS[t] ?? t).filter(Boolean).join(" / ");
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

  function section(num: string, title: string, content: string): string {
    return `
    <div class="sow-section">
      <div class="sow-section-title">${esc(num)} &nbsp; ${esc(title)}</div>
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

  // ── Section 2.1: Work Breakdown ───────────────────────────────────────────
  // Customer-facing SOW: show the computed hour counts only. No ranges, no
  // complexity multipliers, no confidence bands, no risk flags — those are
  // internal planning aids and stay on the Labor Estimate tab.
  // Hours are unified across every per-type labor estimate so combo solutions
  // render one workstreams table rather than N copies.
  const unifiedHours = unifyFinalHours(laborEstimates);
  const laborHoursTotal = laborEstimates.reduce((sum, le) => sum + (le.total_expected ?? 0), 0);
  const hasLabor = laborEstimates.length > 0;

  // Basic-mode pricing branch: a flat tier price by seat count instead of
  // (laborHours × rate). Workstream list still renders so the customer sees
  // scope, but the "Total Estimated Effort: Xh" footer is suppressed (there
  // is no labor model in basic mode).
  const isTiered = solution.pricing_mode === "tiered";
  const isBasic  = solution.pricing_mode === "basic";
  const isFlat   = isTiered || isBasic;
  const tieredTier = isTiered ? getUcaasTieredTier(solution.basic_seat_count) : null;
  const basicBreakdown = isBasic && solution.basic_inputs
    ? calcUcaasBasicBreakdown(solution.basic_inputs, solution.blended_rate || DEFAULT_BLENDED_RATE)
    : null;

  const wbsRows = WORKSTREAM_ORDER
    .filter((ws) => hasLabor ? (unifiedHours[ws] ?? 0) > 0 : true)
    .map((ws, i) => {
      const deliverable = WORKSTREAM_DELIVERABLES[ws] ?? "";
      const rowClass = i % 2 === 0 ? "even" : "odd";
      return `<tr class="${rowClass}">
        <td class="ws-name">${esc(WORKSTREAM_LABELS[ws] ?? ws)}</td>
        <td class="ws-deliverable">${esc(deliverable)}</td>
      </tr>`;
    }).join("");

  const wbsFooter = (hasLabor && !isFlat)
    ? `<tr class="total-row">
        <td><strong>Total Estimated Effort</strong></td>
        <td class="ws-total"><strong>${laborHoursTotal}h</strong></td>
      </tr>`
    : "";

  const wbsHtml = wbsRows
    ? `<table class="wbs-table">
        <thead><tr>
          <th class="ws-name">Workstream</th>
          <th class="ws-deliverable">Key Deliverables</th>
        </tr></thead>
        <tbody>${wbsRows}${wbsFooter}</tbody>
      </table>`
    : `<p class="na-note">${isFlat
        ? "Workstream list is generated from the standard UCaaS deployment scope."
        : "A labor estimate has not yet been generated for this solution."}</p>`;

  // ── Section 2.2: Project Investment ──────────────────────────────────────
  // Customer-facing rendering deliberately hides the blended rate. We don't
  // show a labor pricing line (rate × hours math would let the customer back
  // out the rate), and hours-kind add-ons display only the hours commitment,
  // not their dollar effect. Fixed-amount charges and discounts are shown
  // because the dollar IS the relevant unit. SOW Total at the bottom is the
  // only aggregate dollar figure the customer sees.
  const addOns: AddOn[] = solution.add_ons ?? [];
  const blendedRate = solution.blended_rate || DEFAULT_BLENDED_RATE;
  // Pre-add-on subtotal for the calc. Tiered uses tier price, basic uses
  // the formula breakdown total, advanced uses (laborHours × rate).
  const flatSubtotal = isTiered
    ? (tieredTier?.price ?? 0)
    : (isBasic ? (basicBreakdown?.total ?? 0) : 0);
  const breakdown = isFlat
    ? calcBasicSowTotal(flatSubtotal, addOns, blendedRate)
    : calcSowTotal(laborHoursTotal, addOns, blendedRate);

  // Flat-mode investment block: render the components as discrete line items
  // so the customer sees what they're paying for. Description + quantity
  // only — no per-unit rate, no PM math (internal pricing mechanics stay
  // internal). Tiered: a single line. Basic: implementation, optional
  // training, optional devices, PM.
  const flatLineItems: { desc: string; detail: string; amount: number }[] = [];
  if (isTiered && tieredTier) {
    const seats = Number(solution.basic_seat_count) || 0;
    const seatLabel = seats === 1 ? "1 seat" : `${seats} seats`;
    flatLineItems.push({
      desc: "UCaaS Implementation",
      detail: seatLabel,
      amount: tieredTier.price,
    });
  } else if (isBasic && basicBreakdown && solution.basic_inputs) {
    const inputs = solution.basic_inputs;
    const userLabel = inputs.users === 1 ? "1 user" : `${inputs.users} users`;
    const sitesLabel = inputs.sites > 1 ? `, ${inputs.sites} sites` : "";
    flatLineItems.push({
      desc: "UCaaS Implementation",
      detail: `${userLabel}${sitesLabel}`,
      amount: basicBreakdown.laborSubtotal,
    });
    if (inputs.training_sessions > 0) {
      flatLineItems.push({
        desc: "Training Sessions",
        detail: inputs.training_sessions === 1 ? "1 session" : `${inputs.training_sessions} sessions`,
        amount: basicBreakdown.trainingTotal,
      });
    }
    if (inputs.onsite_devices > 0) {
      flatLineItems.push({
        desc: "On-site Device Installation",
        detail: inputs.onsite_devices === 1 ? "1 device" : `${inputs.onsite_devices} devices`,
        amount: basicBreakdown.deviceInstallTotal,
      });
    }
    flatLineItems.push({
      desc: "Project Management",
      detail: "",
      amount: basicBreakdown.pm,
    });
  }

  const flatLineItemsHtml = flatLineItems.map((item) => (
    `<div class="investment-item">
       <div class="ii-desc">${esc(item.desc)}${item.detail ? `<div class="ii-note">${esc(item.detail)}</div>` : ""}</div>
       <div class="ii-detail">${fmtUsd(item.amount)}</div>
     </div>`
  )).join("");

  const investmentItems = addOns.map((a, i) => {
    const dollar = breakdown.addOnEffects[i]?.dollar ?? 0;
    const isDiscount = dollar < 0;
    let detail = "";
    switch (a.kind) {
      case "hours":            detail = `${a.value} hours`; break;
      case "amount":           detail = fmtUsd(a.value); break;
      case "discount_amount":  detail = `${fmtUsd(a.value)} off`; break;
      case "discount_percent": detail = `${a.value}% off`; break;
    }
    const labelText = a.label || (isDiscount ? "Discount" : "Custom Scope Item");
    const noteHtml = a.note ? `<div class="ii-note">${esc(a.note)}</div>` : "";
    return `<div class="investment-item${isDiscount ? " discount" : ""}">
      <div class="ii-desc">${esc(labelText)}${noteHtml}</div>
      <div class="ii-detail">${esc(detail)}</div>
    </div>`;
  }).join("");

  const hasInvestment = flatLineItems.length > 0 || hasLabor || addOns.length > 0;

  const investmentItemsHtml = (flatLineItemsHtml || addOns.length > 0)
    ? `<div class="investment-items-heading">${isFlat ? "Project Investment" : "Custom Scope Items"}</div>
       <div class="investment-items">${flatLineItemsHtml}${investmentItems}</div>`
    : "";

  const totalHtml = hasInvestment
    ? `<div class="investment-total">
        <span class="it-label">Total Investment</span>
        <span class="it-amount">${fmtUsd(breakdown.total)}</span>
      </div>`
    : "";

  const paymentTermsHtml = hasInvestment
    ? `<p class="prose" style="margin-top:14px;">Investment covers Packet Fusion-delivered professional services only. Platform licensing, recurring usage charges, taxes, and fees are quoted separately and are not included in this SOW. Payment terms: 50% invoiced upon SOW signature; 50% upon Customer acceptance. Net 30. All amounts USD.</p>`
    : "";

  const investmentHtml = hasInvestment
    ? `${investmentItemsHtml}${totalHtml}${paymentTermsHtml}`
    : `<p class="na-note">${isFlat
        ? "Fill the calculator inputs on the Labor tab to populate pricing."
        : "Investment details will be available once a labor estimate is generated."}</p>`;

  // ── Section 3: Assumptions & Customer Responsibilities ───────────────────
  // Expanded from a single block into the bundle's section breakdown:
  //   3.1 Customer Prerequisites (NA-derived table)
  //   3.2 Customer Responsibilities (verbatim boilerplate from bundle §5.2)
  //   3.3 Out of Scope (verbatim boilerplate from bundle §5.3)
  //   3.4 Standard Assumptions (verbatim boilerplate from bundle §5.4)
  //   3.5 Delays & Changes (verbatim Change Order language from bundle §5.5)
  const prereqs       = ans(a, "customer_prerequisites_before_design");
  const contentInputs = ans(a, "customer_must_provide_content_inputs");
  const crmAdmin      = ans(a, "crm_admin_owner");
  const sandbox       = ans(a, "sandbox_testing_required");
  const signoff       = ans(a, "signoff_roles");
  const programOwner  = ans(a, "program_owner_function") || ans(a, "platform_admin_owner");

  const prereqRows = [
    dataRow("Customer Prerequisites", prereqs),
    dataRow("Content / Data Inputs", contentInputs),
    dataRow("CRM Administrator", crmAdmin),
    dataRow("Program / Platform Owner", programOwner),
    dataRow("Sandbox / Test Environment", sandbox),
    dataRow("Customer Sign-off Roles", signoff),
  ].filter(Boolean).join("");

  const prereqsHtml = prereqRows
    ? `<table><tbody>${prereqRows}</tbody></table>`
    : `<p class="na-note">Customer prerequisites will be confirmed during the discovery phase.</p>`;

  const customerRespHtml = `
    <p class="prose">The Customer is responsible for the aspects of the engagement not specifically included in this SOW, including:</p>
    <ul class="prose-list">
      <li>Providing timely access to key stakeholders for discovery, design, UAT, and training sessions.</li>
      <li>Designating a project sponsor with authority to make scope and prioritization decisions.</li>
      <li>Supplying all content, data, scripts, and source materials required for the configured solution.</li>
      <li>Maintaining the existing platform, licensing, and entitlements during this engagement.</li>
      <li>Ensuring any APIs or systems to be integrated are available, documented, and authenticated.</li>
      <li>Managing end-user change management and internal communications.</li>
      <li>Reviewing and approving configuration workbooks, design documents, and test results within agreed SLAs.</li>
    </ul>`;

  const outOfScopeHtml = `
    <p class="prose">The following are not included in this SOW and, if required, will be addressed by separate written agreement:</p>
    <ul class="prose-list">
      <li>Modifications to existing infrastructure, dial plan, or call routing outside the items configured under this SOW.</li>
      <li>Channels or modalities not listed in scope above — may be added in a future phase.</li>
      <li>Integrations with third-party systems beyond those specifically identified during Discovery.</li>
      <li>Network, firewall, or telephony remediation outside the items configured under this SOW.</li>
      <li>Ongoing tier-1/2/3 support of the deployed solution following hypercare exit.</li>
    </ul>`;

  const stdAssumptionsHtml = `
    <p class="prose">The following standard assumptions apply to this engagement:</p>
    <ul class="prose-list">
      <li>All work will be performed remotely unless otherwise agreed in writing.</li>
      <li>This estimate is based on information available at the time of assessment and may be revised following formal Discovery.</li>
      <li>Pricing and effort assumptions are valid for 60 days from the date of this document.</li>
      <li>Customer is responsible for end-user change management and internal communications.</li>
      <li>Third-party systems not listed in scope are excluded unless separately agreed in writing.</li>
    </ul>`;

  const delaysChangesHtml = `
    <p class="prose">Changes to this SOW shall be made only in a mutually executed written change between Packet Fusion and Customer (a &ldquo;Change Order&rdquo;), outlining the requested change and its effect on the Services, including without limitation the fees and the timeline as determined by mutual agreement of both parties. Any delays in the performance of consulting services or delivery of deliverables caused by the Customer &mdash; including without limitation delays in completing and returning Customer documentation required during design or UAT &mdash; may result in an adjustment of the project timeline and additional fees. Any changes or additions to the Services described in this SOW shall be requested by a Change Order and may result in additional fees.</p>`;

  const assumptionsHtml = [
    section("3.1", "Customer Prerequisites", prereqsHtml),
    section("3.2", "Customer Responsibilities", customerRespHtml),
    section("3.3", "Out of Scope", outOfScopeHtml),
    section("3.4", "Standard Assumptions", stdAssumptionsHtml),
    section("3.5", "Delays & Changes", delaysChangesHtml),
  ].join("");

  // ── Section 4: Acceptance & Sign-Off ────────────────────────────────────
  const acceptanceCriteriaHtml = `
    <p class="prose">The engagement will be deemed complete and accepted when all of the following conditions are satisfied:</p>
    <ul class="prose-list">
      <li>The agreed scope has been configured, deployed, and is operational per the approved solution design.</li>
      <li>User Acceptance Testing has been executed and signed off by the Customer&rsquo;s designated representative.</li>
      <li>As-built documentation, admin guides, and runbooks have been delivered.</li>
      <li>Knowledge transfer sessions with the Customer&rsquo;s administrators and end users have been completed.</li>
      <li>The hypercare period has concluded without unresolved critical issues.</li>
    </ul>`;

  const acceptanceHtml = section("4.1", "Acceptance Criteria", acceptanceCriteriaHtml);

  // ── Put it all together ────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(customerName)} — Statement of Work</title>
  <link rel="stylesheet" href="https://use.typekit.net/dty1vuu.css"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'avenir-lt-pro', 'Segoe UI', system-ui, -apple-system, Arial, sans-serif;
      font-size: 10.5pt;
      color: #1e293b;
      background: #fff;
    }
    .page { max-width: 820px; margin: 0 auto; padding: 48px 56px; }

    /* ── Cover ─────────────────────────── */
    .cover { padding-bottom: 36px; margin-bottom: 32px; }
    .cover-banner {
      background: ${SOW_GREY};
      /* Bleed edge-to-edge by negating the .page padding (48px top, 56px sides).
         Padding compensates so the logo stays where it was visually. */
      margin: -48px -56px 56px;
      padding: 50px 56px 22px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .cover-banner img { height: 60px; width: auto; display: block; }
    .cover-eyebrow { font-size: 10pt; font-weight: 700; color: ${SOW_GREEN}; text-transform: uppercase; letter-spacing: 0.18em; margin-bottom: 16px; }
    .cover-title { font-size: 38pt; font-weight: 800; color: ${SOW_NAVY}; letter-spacing: -0.02em; line-height: 1.05; margin-bottom: 28px; }
    .cover-for { font-size: 10.5pt; color: #64748b; margin-bottom: 6px; }
    .cover-customer { font-size: 22pt; font-weight: 800; color: ${SOW_NAVY}; letter-spacing: -0.01em; line-height: 1.1; margin-bottom: 8px; }
    .cover-engagement { font-size: 12pt; color: #64748b; font-style: italic; margin-bottom: 36px; }
    .cover-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding-top: 22px; border-top: 2px solid ${SOW_GREEN}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover-meta-item { padding-right: 20px; }
    .cover-meta-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; color: ${SOW_GREEN}; margin-bottom: 5px; }
    .cover-meta-value { font-size: 11pt; font-weight: 700; color: ${SOW_NAVY}; line-height: 1.3; }
    .cover-msa {
      margin-top: 36px;
      padding-top: 18px;
      border-top: 2px solid ${SOW_GREEN};
      font-size: 8.5pt;
      color: #64748b;
      font-style: italic;
      line-height: 1.6;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }

    /* ── Section heading ───────────────── */
    .section-heading { margin: 40px 0 22px; padding-bottom: 6px; border-bottom: 2px solid ${SOW_GREEN}; -webkit-print-color-adjust: exact; print-color-adjust: exact; page-break-after: avoid; break-after: avoid; }
    .section-heading-text { font-size: 14pt; font-weight: 800; color: ${SOW_NAVY}; letter-spacing: -0.01em; }

    /* ── SOW sections ──────────────────── */
    .sow-section { border-left: 3px solid ${SOW_GREEN}; margin-bottom: 24px; page-break-inside: avoid; padding-left: 16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sow-section-title { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px; color: ${SOW_GREEN}; page-break-after: avoid; break-after: avoid; }

    /* ── Tables ────────────────────────── */
    table { width: 100%; border-collapse: collapse; }
    .lc { width: 32%; font-size: 9.5pt; font-weight: 600; color: #64748b; padding: 6px 16px 6px 0; vertical-align: top; border-bottom: 1px solid #f1f5f9; }
    .vc { font-size: 9.5pt; color: #1e293b; line-height: 1.6; padding: 6px 0; vertical-align: top; border-bottom: 1px solid #f1f5f9; }

    /* ── WBS table ─────────────────────── */
    .wbs-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .wbs-table thead tr { background: ${SOW_NAVY}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .wbs-table thead th { padding: 9px 12px; color: #fff; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: 0.06em; font-size: 7.5pt; }
    .ws-name { width: 30%; }
    .ws-deliverable { width: 70%; }
    .wbs-table tbody tr.even { background: #f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .wbs-table tbody tr.odd { background: #fff; }
    .wbs-table tbody td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; color: #334155; line-height: 1.5; }
    .total-row td { background: ${SOW_GREY} !important; font-weight: 700; border-top: 2px solid ${SOW_GREEN}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .total-row td.ws-total { color: ${SOW_GREEN}; text-align: right; white-space: nowrap; }

    /* ── Investment block ──────────────── */
    .investment-items-heading { font-size: 8pt; font-weight: 700; color: ${SOW_GREEN}; text-transform: uppercase; letter-spacing: 0.16em; margin-bottom: 8px; }
    .investment-items { margin-bottom: 18px; }
    .investment-item { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .investment-item:last-child { border-bottom: none; }
    .investment-item .ii-desc { font-size: 9.5pt; color: #1e293b; font-weight: 600; flex: 1; }
    .investment-item .ii-detail { font-size: 9.5pt; color: ${SOW_NAVY}; font-weight: 700; white-space: nowrap; }
    .investment-item.discount .ii-desc,
    .investment-item.discount .ii-detail { color: #047857; }
    .investment-item .ii-note { font-size: 8.5pt; color: #64748b; font-style: italic; font-weight: 400; margin-top: 3px; }
    .investment-total { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; background: ${SOW_GREY}; border-top: 2px solid ${SOW_GREEN}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .investment-total .it-label { font-size: 11pt; font-weight: 800; color: ${SOW_NAVY}; text-transform: uppercase; letter-spacing: 0.04em; }
    .investment-total .it-amount { font-size: 14pt; font-weight: 800; color: ${SOW_GREEN}; white-space: nowrap; }

    /* ── Notes/prose ───────────────────── */
    .na-note { font-size: 9.5pt; color: #94a3b8; font-style: italic; }
    .prose { font-size: 9.5pt; color: #475569; line-height: 1.6; margin-bottom: 8px; }
    .prose-list { padding-left: 18px; margin-top: 4px; }
    .prose-list li { font-size: 9.5pt; color: #475569; line-height: 1.7; page-break-inside: avoid; }

    /* ── Sign-off ──────────────────────── */
    .signoff { margin-top: 40px; page-break-inside: avoid; }
    .signoff-body p { font-size: 9.5pt; color: #475569; line-height: 1.6; margin-bottom: 28px; }
    .signoff-rule { border-top: 2px solid ${SOW_GREEN}; margin: 24px 0 32px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 48px; }
    .sig-col-eyebrow { font-size: 8pt; font-weight: 700; color: ${SOW_GREEN}; text-transform: uppercase; letter-spacing: 0.22em; margin-bottom: 6px; }
    .sig-col-name { font-size: 14pt; font-weight: 800; color: ${SOW_NAVY}; line-height: 1.2; margin-bottom: 18px; letter-spacing: -0.01em; }
    .sig-field { margin-bottom: 18px; }
    .sig-field-line { border-bottom: 1px solid #94a3b8; height: 28px; }
    .sig-field-label { font-size: 7pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.18em; padding-top: 5px; }

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
    <div class="cover-banner">
      <img src="${logoAbsolute}" alt="Packet Fusion" onerror="this.style.display='none'"/>
    </div>
    <div class="cover-eyebrow">Professional Services</div>
    <div class="cover-title">Statement of Work</div>
    <div class="cover-for">Prepared for</div>
    <div class="cover-customer">${esc(customerName)}</div>
    ${platformLabel ? `<div class="cover-engagement">${esc(platformLabel)} Deployment</div>` : ""}
    <div class="cover-meta">
      <div class="cover-meta-item">
        <div class="cover-meta-label">Platform</div>
        <div class="cover-meta-value">${esc(platformLabel)}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Prepared By</div>
        <div class="cover-meta-value">Packet Fusion, Inc.</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Date</div>
        <div class="cover-meta-value">${today}</div>
      </div>
    </div>
    <div class="cover-msa">
      This Statement of Work (&ldquo;SOW&rdquo;) is executed by Packet Fusion, Inc. (&ldquo;Packet Fusion&rdquo;) and ${esc(customerName)} (&ldquo;Customer&rdquo;) pursuant to, and is subject to, the Packet Fusion Master Services Agreement executed by Customer and Packet Fusion. Capitalized terms used in this SOW but not otherwise defined shall have the respective meanings given to them in the Master Services Agreement.
    </div>
  </div>

  <!-- Section heading: Engagement Overview -->
  <div class="section-heading">
    <div class="section-heading-text">1. Engagement Overview</div>
  </div>

  ${section("1.1", "Engagement Objectives", objectivesHtml)}
  ${section("1.2", "Scope of Work", scopeHtml)}
  ${sizingHtml ? section("1.3", "Confirmed Solution Sizing", sizingHtml) : ""}

  <!-- Section heading: Delivery Plan -->
  <div class="section-heading">
    <div class="section-heading-text">2. Delivery Plan</div>
  </div>

  ${section("2.1", "Work Breakdown & Deliverables", wbsHtml)}
  ${section("2.2", "Project Investment", investmentHtml)}

  <!-- Section heading: Assumptions & Responsibilities -->
  <div class="section-heading">
    <div class="section-heading-text">3. Assumptions &amp; Responsibilities</div>
  </div>

  ${assumptionsHtml}

  <!-- Section heading: Acceptance & Sign-Off -->
  <div class="section-heading">
    <div class="section-heading-text">4. Acceptance &amp; Sign-Off</div>
  </div>

  ${acceptanceHtml}

  <!-- Sign-Off block -->
  <div class="signoff">
    <div class="signoff-body">
      <p>By signing below, the undersigned parties agree to the scope, deliverables, and effort estimates described in this Statement of Work. Packet Fusion, Inc. will proceed with resource planning and project initiation upon receipt of this signed document.</p>
      <div class="signoff-rule"></div>
      <div class="sig-grid">
        <div>
          <div class="sig-col-eyebrow">Customer</div>
          <div class="sig-col-name">${esc(customerName)}</div>
          <div class="sig-field"><div class="sig-field-line"></div><div class="sig-field-label">Authorized Signature</div></div>
          <div class="sig-field"><div class="sig-field-line"></div><div class="sig-field-label">Printed Name</div></div>
          <div class="sig-field"><div class="sig-field-line"></div><div class="sig-field-label">Title</div></div>
          <div class="sig-field"><div class="sig-field-line"></div><div class="sig-field-label">Date</div></div>
        </div>
        <div>
          <div class="sig-col-eyebrow">Service Provider</div>
          <div class="sig-col-name">Packet Fusion, Inc.</div>
          <div class="sig-field"><div class="sig-field-line"></div><div class="sig-field-label">Authorized Signature</div></div>
          <div class="sig-field"><div class="sig-field-line"></div><div class="sig-field-label">Printed Name</div></div>
          <div class="sig-field"><div class="sig-field-line"></div><div class="sig-field-label">Title</div></div>
          <div class="sig-field"><div class="sig-field-line"></div><div class="sig-field-label">Date</div></div>
        </div>
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
  /** Every per-type labor estimate. Hours are unified across them in the rendered SOW. */
  laborEstimates: LaborEstimate[];
  scopeText: string;
  sowData?: SowData | null;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScopeOfWorkDocument({ solution, needsAssessment, laborEstimates, scopeText, sowData }: Props) {
  const customerName = solution.customer_name || "Customer";
  // Multi-type solutions get a joined label (e.g. "UCaaS / CCaaS") so the SOW document
  // title + header reflect every type the customer is scoped to.
  const solutionTypeLabel = solution.solution_types.map((t) => TYPE_LABELS[t] ?? t).filter(Boolean).join(" / ");
  const vendorLabel = VENDOR_LABELS[solution.vendor] ?? solution.vendor ?? "";
  const platformLabel = [vendorLabel !== "TBD" ? vendorLabel : null, solutionTypeLabel].filter(Boolean).join(" – ");
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const hasNa = needsAssessment !== null;
  const hasEstimate = laborEstimates.length > 0;
  const previewUnifiedHours = unifyFinalHours(laborEstimates);
  const previewLaborTotal = laborEstimates.reduce((sum, le) => sum + (le.total_expected ?? 0), 0);
  const isTieredMode  = solution.pricing_mode === "tiered";
  const isBasicMode   = solution.pricing_mode === "basic";
  const isFlatMode    = isTieredMode || isBasicMode;
  const previewTieredTier = isTieredMode ? getUcaasTieredTier(solution.basic_seat_count) : null;
  const previewBasicBreakdown = isBasicMode && solution.basic_inputs
    ? calcUcaasBasicBreakdown(solution.basic_inputs, solution.blended_rate || DEFAULT_BLENDED_RATE)
    : null;
  const previewFlatReady = (isTieredMode && previewTieredTier) || (isBasicMode && previewBasicBreakdown);

  function openPrintWindow() {
    const html = buildSowHtml(solution, needsAssessment, laborEstimates, scopeText, logoUrl, sowData);
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
          {!hasEstimate && !isFlatMode && <span style={{ color: "#f59e0b" }}>⚠ No labor estimate — effort section will be blank</span>}
          {isFlatMode && !previewFlatReady && <span style={{ color: "#f59e0b" }}>⚠ {isTieredMode ? "Tiered" : "Basic"} pricing mode — fill the calculator inputs on the Labor tab to populate the SOW total</span>}
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
        {(hasEstimate || isFlatMode) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#03395f", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Work Breakdown
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "#64748b", fontWeight: 600, borderBottom: "2px solid #e2e8f0" }}>Workstream</th>
                </tr>
              </thead>
              <tbody>
                {WORKSTREAM_ORDER
                  .filter((ws) => isFlatMode ? true : (previewUnifiedHours[ws] ?? 0) > 0)
                  .map((ws) => (
                    <tr key={ws} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 12px", color: "#334155" }}>{WORKSTREAM_LABELS[ws]}</td>
                    </tr>
                  ))}
                {!isFlatMode && (
                  <tr style={{ borderTop: "2px solid #0b9aad", background: "#f0f9ff" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "#03395f", display: "flex", justifyContent: "space-between" }}>
                      <span>Total Estimated Effort</span>
                      <span>{previewLaborTotal}h</span>
                    </td>
                  </tr>
                )}
                {isTieredMode && previewTieredTier && (() => {
                  const seats = Number(solution.basic_seat_count) || 0;
                  const seatLabel = seats === 1 ? "1 seat" : `${seats} seats`;
                  return (
                    <tr style={{ borderTop: "2px solid #17C662", background: "#f0fdf4" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: "#03395f", display: "flex", justifyContent: "space-between" }}>
                        <span>UCaaS Implementation ({seatLabel})</span>
                        <span>${previewTieredTier.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </td>
                    </tr>
                  );
                })()}
                {isBasicMode && previewBasicBreakdown && solution.basic_inputs && (() => {
                  const users = solution.basic_inputs.users;
                  const userLabel = users === 1 ? "1 user" : `${users} users`;
                  return (
                    <tr style={{ borderTop: "2px solid #17C662", background: "#f0fdf4" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: "#03395f", display: "flex", justifyContent: "space-between" }}>
                        <span>UCaaS Implementation ({userLabel})</span>
                        <span>${previewBasicBreakdown.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        )}

        {!hasEstimate && !isFlatMode && (
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
