/**
 * SOW HTML builder. Pure function (variant + context) → printable HTML.
 *
 * Replaces the inline 900-line buildSowHtml in the old ScopeOfWorkDocument.
 * The new SOW mirrors the May-2026 services SOW template (docx) — cover
 * page → executive summary → engagement snapshot → pricing summary →
 * key dates → numbered sections 1-13 → signature.
 */

import type { SowVariant, SowBuildContext, PhaseSection, OptionalService, Deliverable } from "./types";
import {
  SHARED_OUT_OF_SCOPE,
  SHARED_ASSUMPTIONS,
  CUSTOMER_RESPONSIBILITIES_GROUPS,
  RACI_ROWS,
  CADENCE_ROWS,
  ESCALATION_ROWS,
  TIMELINE_MILESTONES,
  CHANGE_MANAGEMENT_STEPS,
  ACCEPTANCE_DELIVERABLE_STEPS,
  E911_FOOTNOTE,
} from "./sections";

// PF SOW palette mirrors the docx (and the old renderer's SOW_NAVY/GREEN/GREY).
const NAVY  = "#003B5C";
const GREEN = "#17C662";
const GREY  = "#D9E1E2";

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "[MM/DD/YYYY]";
  // Accept YYYY-MM-DD or full ISO
  try {
    const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  } catch { return String(iso); }
}

function bullets(items: string[]): string {
  if (items.length === 0) return "";
  return `<ul>${items.map((it) => `<li>${it}</li>`).join("")}</ul>`;
}

function fillScopeQuantity(q: string, ctx: SowBuildContext): string {
  return q
    .replace("{locations}", esc(ctx.locationCount))
    .replace("{primary}",   esc(ctx.primarySeatCount))
    .replace("{dids}",      esc(ctx.ditNumbers))
    .replace("{meetings}",  esc(ctx.meetingsCount))
    .replace("{golives}",   esc(ctx.goLiveCount));
}

// ── Sections ─────────────────────────────────────────────────────────────────

function coverPage(variant: SowVariant, ctx: SowBuildContext, logoUrl: string): string {
  // Faithful port of the docx title page:
  //   - Logo at top-left, "Confidential" stamp at top-right
  //   - "STATEMENT OF WORK" large title
  //   - Subtitle = variant.productLine ("Zoom UCaaS Professional Services")
  //   - "Document Control" header
  //   - 2-column PREPARED FOR / PREPARED BY block
  //   - SOW Details two-column table (Number, Issue Date, MSA, Project Ref, Status)
  //   - Revision History table
  //   - Confidentiality notice at the bottom
  //
  // All of that lives on one cover page; the executive summary and the rest
  // of the doc come on subsequent pages.

  const stubBanner = variant.isStub
    ? `<div class="stub-banner">STUB — content for ${esc(variant.productLine)} is placeholder. Do not issue without review.</div>`
    : "";

  const preparedForLines: string[] = [esc(ctx.customerName)];
  if (ctx.customerPrimaryContact?.name)  preparedForLines.push(esc(ctx.customerPrimaryContact.name));
  if (ctx.customerPrimaryContact?.title) preparedForLines.push(esc(ctx.customerPrimaryContact.title));
  if (ctx.customerPrimaryContact?.email) preparedForLines.push(`${esc(ctx.customerPrimaryContact.email)}${ctx.customerPrimaryContact.phone ? `  |  ${esc(ctx.customerPrimaryContact.phone)}` : ""}`);
  if (ctx.customerAddress)               preparedForLines.push(esc(ctx.customerAddress));

  const preparedByLines: string[] = ["Packet Fusion, Inc.", esc(ctx.preparedBy.name)];
  if (ctx.preparedBy.title) preparedByLines.push(esc(ctx.preparedBy.title));
  if (ctx.preparedBy.email) preparedByLines.push(`${esc(ctx.preparedBy.email)}${ctx.preparedBy.phone ? `  |  ${esc(ctx.preparedBy.phone)}` : ""}`);

  const detailsRows = [
    { label: "SOW Number",        value: esc(ctx.sowNumber) },
    { label: "Issue Date",        value: esc(ctx.issueDateText) },
    { label: "Master Agreement",  value: `Packet Fusion Master Services Agreement dated ${esc(fmtDate(ctx.msaDate))}` },
    { label: "Project Reference", value: esc(ctx.projectReference) },
    { label: "SOW Status",        value: esc(ctx.statusText) },
  ];

  const revisionRows = ctx.revisions.length > 0
    ? ctx.revisions.map((r) => `
        <tr>
          <td>${esc(r.version)}</td>
          <td>${esc(fmtDate(r.saved_at))}</td>
          <td>${esc(r.saved_by_name ?? "")}</td>
          <td>${esc(r.note ?? "")}</td>
        </tr>`).join("")
    : `<tr><td colspan="4" class="muted" style="text-align:center;">No revisions recorded yet.</td></tr>`;

  return `
    <section class="cover">
      ${stubBanner}

      <div class="cover-head">
        <img src="${logoUrl}" alt="Packet Fusion" class="cover-logo" />
        <div class="cover-confidential">CONFIDENTIAL</div>
      </div>

      <div class="cover-title-block">
        <div class="cover-title">STATEMENT OF WORK</div>
        <div class="cover-subtitle">${esc(variant.productLine)}</div>
      </div>

      <div class="cover-section-header">Document Control</div>

      <table class="cover-prepared">
        <thead>
          <tr>
            <th>PREPARED FOR</th>
            <th>PREPARED BY</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${preparedForLines.map((l) => `<div>${l}</div>`).join("")}</td>
            <td>${preparedByLines.map((l) => `<div>${l}</div>`).join("")}</td>
          </tr>
        </tbody>
      </table>

      <table class="cover-details">
        <tbody>
          ${detailsRows.map((r) => `<tr><th>${esc(r.label)}</th><td>${r.value}</td></tr>`).join("")}
        </tbody>
      </table>

      <div class="cover-section-header" style="margin-top:18px;">Revision History</div>
      <table class="data-table cover-revisions">
        <thead><tr><th>Version</th><th>Date</th><th>Author</th><th>Description of Change</th></tr></thead>
        <tbody>${revisionRows}</tbody>
      </table>

      <p class="confidentiality"><strong>Confidentiality Notice.</strong> This document contains confidential and proprietary information of Packet Fusion, Inc. and the Customer named above. It is provided solely for the purpose of evaluating and executing the services described herein and may not be reproduced, distributed, or disclosed to any third party without the prior written consent of Packet Fusion.</p>
    </section>
  `;
}

// Title-page now embeds the revision history; the separate revisionHistory()
// section that used to follow the cover is no longer needed.
function revisionHistory(_ctx: SowBuildContext): string { return ""; }

function executiveSummary(variant: SowVariant, ctx: SowBuildContext): string {
  return `
    <section class="page-section">
      <h2>Executive Summary</h2>
      <p>Packet Fusion is pleased to partner with <strong>${esc(ctx.customerName)}</strong> (the "Customer") on the deployment of <strong>${esc(variant.productLine)}</strong>. This Statement of Work ("SOW") defines the services, deliverables, schedule, fees, and shared responsibilities for that engagement.</p>
      <p>Our objective is a seamless cutover to the new platform — completed on schedule, with verified service quality, with users prepared to be productive on day one, and with a documented hand-off to Customer administrators for ongoing operation.</p>
    </section>
  `;
}

function snapshotAndPricing(variant: SowVariant, ctx: SowBuildContext): string {
  const tiles = variant.snapshotTiles.map((t) => `
    <div class="snap-tile">
      <div class="snap-value">${esc(t.value(ctx))}</div>
      <div class="snap-label">${esc(t.label)}</div>
    </div>
  `).join("");

  const pricing = `
    <table class="data-table pricing-summary">
      <tbody>
        <tr><td>Professional Services</td><td class="num">${esc(fmtMoney(ctx.feeTotal))}</td></tr>
        ${ctx.feeDiscount !== null && ctx.feeDiscount !== 0
          ? `<tr><td>Packet Fusion Preferred Client Discount</td><td class="num">(${esc(fmtMoney(Math.abs(ctx.feeDiscount)))})</td></tr>`
          : ""}
        <tr class="total-row"><td><strong>Project Total</strong></td><td class="num"><strong>${esc(fmtMoney(ctx.projectTotal))}</strong></td></tr>
      </tbody>
    </table>
    <p class="muted">Optional services are listed in Section 9 and may be added by mutual written agreement.</p>
  `;

  return `
    <section class="page-section">
      <h3>Engagement Snapshot</h3>
      <div class="snap-grid">${tiles}</div>
      <h3>Pricing Summary</h3>
      ${pricing}
    </section>
  `;
}

function keyDates(ctx: SowBuildContext, kickoff: string | null, goLive: string | null): string {
  return `
    <section class="page-section">
      <h3>Key Dates</h3>
      <table class="data-table">
        <thead><tr><th>Milestone</th><th>Target Date</th><th>Owner</th></tr></thead>
        <tbody>
          <tr><td>SOW Execution</td><td>${esc(fmtDate(ctx.issueDateText))}</td><td>Joint</td></tr>
          <tr><td>Kickoff Complete</td><td>${esc(fmtDate(kickoff))}</td><td>Packet Fusion</td></tr>
          <tr><td>Planning Complete (Design Validated)</td><td>[MM/DD/YYYY]</td><td>Customer</td></tr>
          <tr><td>Port Orders Submitted</td><td>[MM/DD/YYYY]</td><td>Packet Fusion</td></tr>
          <tr><td>UAT Complete &amp; Customer Sign-off</td><td>[MM/DD/YYYY]</td><td>Joint</td></tr>
          <tr><td>Go-Live</td><td>${esc(fmtDate(goLive))}</td><td>Joint</td></tr>
          <tr><td>Project Closure &amp; Transition to CSM</td><td>[MM/DD/YYYY]</td><td>Joint</td></tr>
        </tbody>
      </table>
    </section>
  `;
}

function section1(variant: SowVariant, ctx: SowBuildContext): string {
  const rows = variant.scopeAtAGlance.map((r) => `
    <tr><td>${esc(r.element)}</td><td>${esc(fillScopeQuantity(r.quantity, ctx))}</td><td>${esc(r.notes)}</td></tr>
  `).join("");

  const msaClause = ctx.isZoomReseller
    ? "Zoom Services Reseller Customer Agreement"
    : `Packet Fusion Master Services Agreement (the "MSA")`;

  return `
    <section class="page-section">
      <h1>1.  Engagement Overview</h1>
      <h3>1.1  About This SOW</h3>
      <p>This SOW is executed by Packet Fusion, Inc. ("Packet Fusion") and ${esc(ctx.customerName)} (the "Customer") under, and is subject to, the ${msaClause} executed between the parties. Capitalized terms used but not defined herein have the meanings given in the MSA. In the event of any conflict between this SOW and the MSA, the MSA controls except where this SOW expressly states otherwise.</p>
      <h3>1.2  Business Objectives</h3>
      <p>The Customer is engaging Packet Fusion to achieve the following outcomes:</p>
      <ul>
        <li>Consolidate communications on a single, cloud-delivered platform.</li>
        <li>Improve reliability and service quality through verified network readiness and a managed cutover.</li>
        <li>Reduce administrative overhead by standardizing call flows, user profiles, and policies.</li>
        <li>Enable hybrid and remote work with consistent communication experiences across locations.</li>
        <li>Provide a documented configuration and trained administrators capable of ongoing operation.</li>
      </ul>
      <h3>1.3  Scope at a Glance</h3>
      <table class="data-table">
        <thead><tr><th>Element</th><th>Quantity</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function phaseBlock(p: PhaseSection): string {
  const intro = p.intro ? `<p>${p.intro}</p>` : "";
  const directBullets = p.bullets ? bullets(p.bullets) : "";
  const subs = (p.subsections ?? []).map((s) => `
    <div class="phase-sub">
      ${s.number || s.title ? `<h4>${esc(s.number ? s.number + "  " : "")}${esc(s.title ?? "")}</h4>` : ""}
      ${s.intro ? `<p>${s.intro}</p>` : ""}
      ${bullets(s.bullets)}
    </div>
  `).join("");
  return `
    <div class="phase">
      <h3>${esc(p.number)}  ${esc(p.title)}</h3>
      ${intro}
      ${directBullets}
      ${subs}
    </div>
  `;
}

function section2(variant: SowVariant): string {
  // Delivery methodology table — fixed across variants
  const methodologyRows = [
    { num: "1", name: "Initiation",               when: "Project start",            purpose: "Establish team, internal assets, and the kickoff. Confirm scope, schedule, and tenant access." },
    { num: "2", name: "Planning",                 when: "6–8 weeks pre Go-Live",    purpose: "Assessment & design, E911, porting prep, training plan, and communications strategy." },
    { num: "3", name: "Executing",                when: "4–5 weeks pre Go-Live",    purpose: "Submit porting, build and provision the tenant, coordinate training dates." },
    { num: "4", name: "Monitoring / Controlling", when: "2–3 weeks pre Go-Live",    purpose: "Confirm FOC, deploy hardware, execute UAT, obtain UAT sign-off." },
    { num: "5", name: "Go Live / Production",     when: "1 week pre & Go-Live",     purpose: "Go/No-Go readiness, deliver training, run the Go-Live event, Day 1 support." },
    { num: "6", name: "Closing",                  when: "Post Go-Live",             purpose: "Cancel legacy services, lessons-learned, project closure, transition to CSM." },
  ];

  return `
    <section class="page-section">
      <h1>2.  Scope of Services</h1>
      <h3>2.1  Delivery Methodology</h3>
      <p>Packet Fusion delivers cloud migrations using a PMI-aligned phased methodology. Each phase has defined activities, owners, and exit criteria; the project does not advance from one phase to the next until exit criteria are met and confirmed in writing (email is acceptable). A typical engagement runs approximately 10–12 calendar weeks from project initiation through closure, with variation based on site count, number of DIDs in porting, and Customer readiness.</p>
      <table class="data-table">
        <thead><tr><th>Phase</th><th>Name</th><th>When (relative to Go Live)</th><th>Purpose</th></tr></thead>
        <tbody>
          ${methodologyRows.map((r) => `<tr><td>${esc(r.num)}</td><td>${esc(r.name)}</td><td>${esc(r.when)}</td><td>${esc(r.purpose)}</td></tr>`).join("")}
        </tbody>
      </table>
      ${variant.phases.map(phaseBlock).join("")}
      <h3>2.8  Training Services</h3>
      <p><strong>Included.</strong> ${esc(variant.trainingIncluded)}</p>
      ${variant.trainingOptional ? `<p><strong>Optional.</strong> ${esc(variant.trainingOptional)}</p>` : ""}
      <h3>2.9  Engineering &amp; Integration Services</h3>
      <p>The following services are included if explicitly indicated in the Scope at a Glance (Section 1.3) or added via change order:</p>
      ${bullets(variant.engineeringAndIntegration)}
      <h3>2.10  Optional Services</h3>
      <p>The following services are not included in the base scope and may be added by mutual written agreement. Pricing is summarized in Section 9.2.</p>
      ${bullets(variant.optionalServiceBullets)}
    </section>
  `;
}

function section3(deliverables: Deliverable[]): string {
  return `
    <section class="page-section">
      <h1>3.  Deliverables</h1>
      <p>The following deliverables will be produced under this SOW. Each deliverable is subject to the acceptance process described in Section 11.</p>
      <table class="data-table">
        <thead><tr><th>#</th><th>Deliverable</th><th>Format</th><th>Acceptance Criteria</th></tr></thead>
        <tbody>
          ${deliverables.map((d) => `<tr><td>${esc(d.id)}</td><td>${esc(d.name)}</td><td>${esc(d.format)}</td><td>${esc(d.acceptanceCriteria)}</td></tr>`).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function section4(variant: SowVariant): string {
  const items = variant.outOfScopeOverride ?? SHARED_OUT_OF_SCOPE;
  return `
    <section class="page-section">
      <h1>4.  Out of Scope</h1>
      <p>The following are explicitly out of scope for this SOW. They may be added by change order under Section 10 if the Customer wishes Packet Fusion to perform them.</p>
      ${bullets(items)}
      ${variant.showE911Footnote ? `<p>${E911_FOOTNOTE}</p>` : ""}
    </section>
  `;
}

function section5(): string {
  return `
    <section class="page-section">
      <h1>5.  Assumptions</h1>
      <p>This SOW, including the schedule and fees, is based on the following assumptions. A material change to any assumption may require a change order under Section 10.</p>
      ${bullets(SHARED_ASSUMPTIONS)}
    </section>
  `;
}

function section6(): string {
  return `
    <section class="page-section">
      <h1>6.  Customer Responsibilities</h1>
      <p>The Customer is responsible for the following throughout the engagement. Delays in any of these items may impact the project schedule and may trigger a change order.</p>
      ${CUSTOMER_RESPONSIBILITIES_GROUPS.map((g) => `
        <h3>${esc(g.number)}  ${esc(g.title)}</h3>
        ${bullets(g.bullets)}
      `).join("")}
    </section>
  `;
}

function section7(): string {
  return `
    <section class="page-section">
      <h1>7.  Project Approach &amp; Governance</h1>
      <h3>7.1  Roles &amp; Responsibilities</h3>
      <p>The following roles are committed for the duration of the engagement. R = Responsible, A = Accountable, C = Consulted, I = Informed.</p>
      <table class="data-table">
        <thead><tr><th>Activity</th><th>PF PM</th><th>PF IE</th><th>PF SA</th><th>Cust PM</th><th>Cust Tech</th><th>Cust Signer</th></tr></thead>
        <tbody>
          ${RACI_ROWS.map((r) => `<tr><td>${esc(r.activity)}</td><td>${esc(r.pm)}</td><td>${esc(r.ie)}</td><td>${esc(r.sa)}</td><td>${esc(r.cust_pm)}</td><td>${esc(r.cust_tech)}</td><td>${esc(r.cust_signer)}</td></tr>`).join("")}
        </tbody>
      </table>
      <p class="muted"><strong>Key:</strong> PF = Packet Fusion; PM = Project Manager; IE = Implementation Engineer; SA = Solution Architect; Cust = Customer; CSM = Customer Success Manager.</p>

      <h3>7.2  Communication Cadence</h3>
      <table class="data-table">
        <thead><tr><th>Forum</th><th>Frequency</th><th>Participants</th><th>Output</th></tr></thead>
        <tbody>${CADENCE_ROWS.map((r) => `<tr><td>${esc(r.forum)}</td><td>${esc(r.frequency)}</td><td>${esc(r.participants)}</td><td>${esc(r.output)}</td></tr>`).join("")}</tbody>
      </table>

      <h3>7.3  Escalation Path</h3>
      <p>Issues that cannot be resolved at the working level escalate as follows. Escalation is by mutual agreement and does not waive any party's rights under the MSA.</p>
      <table class="data-table">
        <thead><tr><th>Level</th><th>Packet Fusion</th><th>Customer</th></tr></thead>
        <tbody>${ESCALATION_ROWS.map((r) => `<tr><td>${esc(r.level)}</td><td>${esc(r.pf)}</td><td>${esc(r.cust)}</td></tr>`).join("")}</tbody>
      </table>

      <h3>7.4  Status Reporting</h3>
      <p>The Packet Fusion PM will distribute a written status report each week containing: progress against milestones, completed work, planned work, open risks and issues, decisions required, and updated forecast for upcoming milestones. The report serves as the project record of record.</p>
    </section>
  `;
}

function section8(): string {
  return `
    <section class="page-section">
      <h1>8.  Timeline &amp; Milestones</h1>
      <p>The following high-level schedule is illustrative and will be finalized in the project plan produced during Phase 1. Site-specific cutover dates are scheduled based on porting Firm Order Commitments (FOCs) and Customer site readiness.</p>
      <table class="data-table">
        <thead><tr><th>Milestone</th><th>Target</th><th>Predecessor</th></tr></thead>
        <tbody>${TIMELINE_MILESTONES.map((m) => `<tr><td>${esc(m.id)}  — ${esc(m.name)}</td><td>${esc(m.target)}</td><td>${esc(m.predecessor)}</td></tr>`).join("")}</tbody>
      </table>
      <p class="muted">"T" = SOW execution date. Durations are working weeks and exclude federal holidays and Customer-declared blackout windows.</p>
    </section>
  `;
}

function section9(variant: SowVariant, ctx: SowBuildContext, optServices: OptionalService[]): string {
  return `
    <section class="page-section">
      <h1>9.  Pricing &amp; Payment Schedule</h1>
      <h3>9.1  Fee Summary</h3>
      <table class="data-table">
        <thead><tr><th>Service</th><th>Type</th><th>Fee</th></tr></thead>
        <tbody>
          <tr><td>${esc(variant.productLine)} (base scope per Section 2)</td><td>Fixed Fee</td><td class="num">${esc(fmtMoney(ctx.feeTotal))}</td></tr>
          ${ctx.feeDiscount !== null && ctx.feeDiscount !== 0
            ? `<tr><td>Packet Fusion Preferred Client Discount</td><td>Credit</td><td class="num">(${esc(fmtMoney(Math.abs(ctx.feeDiscount)))})</td></tr>`
            : ""}
          <tr class="total-row"><td><strong>Project Total</strong></td><td></td><td class="num"><strong>${esc(fmtMoney(ctx.projectTotal))}</strong></td></tr>
        </tbody>
      </table>

      <h3>9.2  Optional Services</h3>
      <table class="data-table">
        <thead><tr><th>Optional Service</th><th>Unit</th><th>Fee</th></tr></thead>
        <tbody>${optServices.map((o) => `<tr><td>${esc(o.name)}</td><td>${esc(o.unit)}</td><td class="num">${esc(o.fee)}</td></tr>`).join("")}</tbody>
      </table>
      <p class="muted">Optional services are added by mutual written agreement (email accepted) and invoiced upon completion of the optional engagement, unless otherwise stated.</p>

      <h3>9.3  Invoicing Milestones</h3>
      <p>Where fees are billable, Packet Fusion will invoice against the following milestones. Invoices are net 30 from issue date unless the MSA states otherwise.</p>
      <table class="data-table">
        <thead><tr><th>Trigger</th><th>Percent</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>SOW Execution</td><td>50%</td><td>Per Section 9.1</td></tr>
          <tr><td>Go-Live (M9) and Customer acceptance</td><td>50%</td><td>Per Section 9.1</td></tr>
        </tbody>
      </table>
      ${ctx.projectTotal === 0 ? `<p class="muted">Where the Preferred Client Discount results in a Project Total of $0.00, no invoices are issued for the base scope. Optional services and change orders are invoiced separately.</p>` : ""}

      <h3>9.4  Expenses</h3>
      <p>All services are delivered remotely unless otherwise stated. Any pre-approved travel will be invoiced at cost per the MSA travel &amp; expense policy.</p>

      <h3>9.5  Taxes</h3>
      <p>All fees are exclusive of applicable sales, use, and similar transaction taxes. The Customer is responsible for any such taxes other than taxes based on Packet Fusion's net income.</p>
    </section>
  `;
}

function section10(): string {
  return `
    <section class="page-section">
      <h1>10.  Change Management</h1>
      <p>Changes to scope, schedule, fees, deliverables, or assumptions require a written Change Order signed by both parties before work on the change commences. The process is intentionally lightweight but explicit:</p>
      ${CHANGE_MANAGEMENT_STEPS.map((s) => `<p><strong>${esc(s.name)}.</strong> ${esc(s.text)}</p>`).join("")}
      <p><strong>Customer-caused delay.</strong> Delays in performance or delivery caused by the Customer — including without limitation delays in completing the implementation workbook, approving the call-flow design, supplying LOAs/CSRs, or remediating network findings — may result in schedule adjustment and/or additional fees, processed through this same change-order procedure.</p>
    </section>
  `;
}

function section11(): string {
  return `
    <section class="page-section">
      <h1>11.  Acceptance Process</h1>
      <h3>11.1  Deliverable Acceptance</h3>
      <p>For each deliverable listed in Section 3, the following process applies:</p>
      ${bullets(ACCEPTANCE_DELIVERABLE_STEPS)}

      <h3>11.2  Site Go-Live Acceptance</h3>
      <p>Each site is deemed accepted at Go-Live when: (a) ported numbers complete; (b) test calls succeed in both directions; (c) E911 returns correct location data; and (d) the Customer site lead signs off on the cutover form. Outstanding cosmetic items are captured for Day 1 Support follow-up.</p>

      <h3>11.3  Project Closure</h3>
      <p>The project is closed when: (a) all deliverables in Section 3 have been accepted; (b) all sites have completed Day 1 Support; and (c) the Project Closure Memo (D10) is signed by both PMs. Any open items at closure are deferred to a future change order or to the Customer's ongoing support relationship.</p>
    </section>
  `;
}

function section12(): string {
  return `
    <section class="page-section">
      <h1>12.  Terms &amp; References</h1>
      <h3>12.1  Master Services Agreement</h3>
      <p>This SOW is governed by the Packet Fusion Master Services Agreement (the "MSA") executed between the parties and incorporated here by reference. The MSA controls all terms not expressly modified by this SOW, including confidentiality, intellectual property, warranty, indemnification, limitation of liability, term and termination, and governing law.</p>
      <h3>12.2  Confidentiality</h3>
      <p>Each party will protect the Confidential Information of the other party as required by the MSA. Project deliverables produced under this SOW are considered Confidential Information of the Customer except for Packet Fusion's pre-existing methodologies, templates, and know-how, which remain the property of Packet Fusion.</p>
      <h3>12.3  Data Handling</h3>
      <p>Packet Fusion will access only the Customer data and systems necessary to deliver the services in this SOW. Any Customer data received will be handled per the MSA and applicable privacy laws. The Customer is responsible for ensuring its vendor tenant and downstream integrations comply with its own regulatory requirements (e.g., HIPAA for covered entities).</p>
      <h3>12.4  Order of Precedence</h3>
      <p>In the event of a conflict between documents, the order of precedence is: (1) the MSA; (2) any signed Change Order to this SOW; (3) this SOW; (4) any attached appendices.</p>
      <h3>12.5  Entire Agreement</h3>
      <p>This SOW, together with the MSA and any signed Change Orders, constitutes the entire agreement of the parties with respect to its subject matter and supersedes all prior or contemporaneous communications, representations, or agreements, whether oral or written, relating to that subject matter.</p>
    </section>
  `;
}

function section13(ctx: SowBuildContext): string {
  // Per Ryan: sig block names parties only — no individual names.
  return `
    <section class="page-section">
      <h1>13.  Authorization &amp; Signature</h1>
      <p>By signing below, each party agrees to the terms of this Statement of Work and authorizes Packet Fusion to proceed with the services described herein.</p>
      <table class="sig-table">
        <tbody>
          <tr>
            <td class="sig-cell">
              <div class="sig-party">PACKET FUSION, INC.</div>
              <div class="sig-line">_______________________________</div>
              <div class="sig-label">Authorized Signature</div>
              <div class="sig-line">_______________________________</div>
              <div class="sig-label">Name &amp; Title</div>
              <div class="sig-line">_______________________________</div>
              <div class="sig-label">Date</div>
            </td>
            <td class="sig-cell">
              <div class="sig-party">${esc(ctx.customerName.toUpperCase())}</div>
              <div class="sig-line">_______________________________</div>
              <div class="sig-label">Authorized Signature</div>
              <div class="sig-line">_______________________________</div>
              <div class="sig-label">Name &amp; Title</div>
              <div class="sig-line">_______________________________</div>
              <div class="sig-label">Date</div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

// ── Styles ───────────────────────────────────────────────────────────────────

function styles(): string {
  return `
    @page { size: letter; margin: 0.75in; }
    body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; font-size: 11pt; line-height: 1.45; margin: 0; }
    h1 { font-size: 18pt; color: ${NAVY}; border-bottom: 2px solid ${GREEN}; padding-bottom: 4px; margin-top: 32px; margin-bottom: 12px; }
    h2 { font-size: 15pt; color: ${NAVY}; margin-top: 24px; margin-bottom: 10px; }
    h3 { font-size: 12pt; color: ${NAVY}; margin-top: 18px; margin-bottom: 6px; }
    h4 { font-size: 11pt; color: ${NAVY}; margin-top: 12px; margin-bottom: 4px; }
    p { margin: 6px 0 10px; }
    ul { margin: 4px 0 12px 22px; padding: 0; }
    li { margin: 3px 0; }
    .muted { color: #666; font-size: 9.5pt; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .data-table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 10pt; }
    .data-table th { background: ${GREY}; color: ${NAVY}; text-align: left; padding: 6px 10px; border: 1px solid #b8c5cf; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .data-table td { padding: 6px 10px; border: 1px solid #d6dde2; vertical-align: top; }
    .pricing-summary .total-row td { border-top: 2px solid ${NAVY}; background: rgba(0,59,92,0.04); }
    .page-section { page-break-inside: auto; margin-bottom: 14px; }
    /* Cover */
    .cover { padding: 0; min-height: 9in; position: relative; page-break-after: always; }
    .cover-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 18px; border-bottom: 3px solid ${GREEN}; margin-bottom: 38px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover-logo { height: 42px; }
    .cover-confidential { font-size: 9.5pt; font-weight: 700; letter-spacing: 0.22em; color: ${GREEN}; text-transform: uppercase; }
    .cover-title-block { margin-bottom: 32px; }
    .cover-title { font-size: 38pt; font-weight: 800; color: ${NAVY}; letter-spacing: -0.025em; line-height: 1.02; }
    .cover-subtitle { font-size: 16pt; font-weight: 700; color: ${GREEN}; margin-top: 8px; letter-spacing: 0.01em; }
    .cover-section-header { font-size: 11pt; font-weight: 800; color: ${NAVY}; text-transform: uppercase; letter-spacing: 0.14em; padding-bottom: 4px; border-bottom: 1px solid ${GREEN}; margin: 10px 0 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    /* PREPARED FOR / PREPARED BY two-column table */
    .cover-prepared { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    .cover-prepared th { background: ${GREY}; color: ${NAVY}; text-align: left; padding: 6px 10px; border: 1px solid #b8c5cf; font-weight: 800; font-size: 9.5pt; letter-spacing: 0.12em; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover-prepared td { padding: 8px 10px; border: 1px solid #d6dde2; vertical-align: top; font-size: 10.5pt; color: ${NAVY}; }
    .cover-prepared td div { margin: 1px 0; }
    /* SOW Details key/value table */
    .cover-details { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    .cover-details th { background: rgba(0,59,92,0.04); color: ${NAVY}; text-align: left; padding: 6px 10px; border: 1px solid #d6dde2; font-weight: 700; font-size: 10pt; width: 30%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover-details td { padding: 6px 10px; border: 1px solid #d6dde2; font-size: 10.5pt; color: #1a1a1a; }
    .cover-revisions th { background: ${GREY}; }
    /* Snapshot tiles */
    .snap-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 8px 0 16px; }
    .snap-tile { background: rgba(0,59,92,0.04); border: 1px solid ${GREY}; border-radius: 6px; padding: 12px 14px; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .snap-value { font-size: 22pt; font-weight: 800; color: ${NAVY}; }
    .snap-label { font-size: 9pt; color: #555; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
    /* Signature block */
    .sig-table { width: 100%; margin-top: 16px; }
    .sig-cell { width: 48%; padding: 0 12px; vertical-align: top; }
    .sig-party { font-size: 11pt; font-weight: 800; color: ${NAVY}; margin-bottom: 18px; }
    .sig-line { font-family: monospace; color: #444; margin-top: 22px; }
    .sig-label { font-size: 8.5pt; color: #666; margin-top: 2px; }
    /* Stub banner */
    .stub-banner { background: #fef3c7; border: 1px solid #fde68a; color: #854d0e; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; font-size: 10pt; font-weight: 700; }
    /* Confidentiality */
    .confidentiality { font-size: 9pt; color: #555; border-top: 1px solid #ccc; padding-top: 10px; margin-top: 14px; }
    /* Budgetary watermark */
    .budgetary-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 96pt; font-weight: 900; color: rgba(0, 59, 92, 0.08); letter-spacing: 0.05em; pointer-events: none; z-index: 0; }
    /* Phase */
    .phase { margin-top: 14px; }
    .phase-sub { margin: 10px 0 4px 6px; }
  `;
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function buildSowHtml(args: {
  variant: SowVariant;
  ctx: SowBuildContext;
  logoUrl: string;
  /** Optional: project's kickoff + go-live dates for the Key Dates table. */
  kickoffDate?: string | null;
  goLiveDate?: string | null;
}): string {
  const { variant, ctx, logoUrl } = args;
  const watermark = ctx.isBudgetary
    ? `<div class="budgetary-watermark">BUDGETARY</div>`
    : "";
  const body = [
    coverPage(variant, ctx, logoUrl),
    revisionHistory(ctx),
    executiveSummary(variant, ctx),
    snapshotAndPricing(variant, ctx),
    keyDates(ctx, args.kickoffDate ?? null, args.goLiveDate ?? null),
    section1(variant, ctx),
    section2(variant),
    section3(variant.deliverables),
    section4(variant),
    section5(),
    section6(),
    section7(),
    section8(),
    section9(variant, ctx, variant.optionalServicesTable),
    section10(),
    section11(),
    section12(),
    section13(ctx),
  ].join("\n");

  return `<!doctype html><html><head><meta charset="utf-8"><title>SOW — ${esc(ctx.customerName)}</title><style>${styles()}</style></head><body>${watermark}${body}</body></html>`;
}
