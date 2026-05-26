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

function coverPage(variant: SowVariant, ctx: SowBuildContext, logoUrl: string, heroImageUrl: string | null, forWord: boolean): string {
  // The docx title page is a full-bleed hero illustration (navy/teal cloud +
  // UCaaS ecosystem) with the title text overlaid. Document Control + the
  // metadata/revision tables sit on page 2.
  //
  // If the variant declares a heroImageKey AND the client resolved a URL for
  // it, we render the hero variant of the cover. Stubs and variants without
  // hero artwork fall back to a text-only cover (still has the logo header,
  // title, subtitle — just no illustration).
  //
  // Word export note: Word doesn't reliably honor CSS background-image on
  // <section> elements, so the print path renders the hero as a background
  // image with overlaid white text. For the Word path we restructure: render
  // the hero as a full-width <img> followed by the title block beneath, with
  // dark text on white. That way the illustration survives the export and
  // the cover still reads as a cover when opened in Word.

  const stubBanner = variant.isStub
    ? `<div class="stub-banner">STUB — content for ${esc(variant.productLine)} is placeholder. Do not issue without review.</div>`
    : "";

  if (heroImageUrl && forWord) {
    // Word-friendly cover: hero as inline <img>, text below.
    return `
      <section class="cover cover--word">
        ${stubBanner}
        <div class="cover-head">
          <img src="${logoUrl}" alt="Packet Fusion" class="cover-logo" />
          <div class="cover-confidential">CONFIDENTIAL</div>
        </div>
        <div style="margin: 18px 0;">
          <img src="${heroImageUrl}" alt="" style="width:100%; max-width:100%; display:block;" />
        </div>
        <div class="cover-title-block">
          <div class="cover-title">STATEMENT OF WORK</div>
          <div class="cover-subtitle">${esc(variant.productLine)}</div>
          <div class="cover-customer-line" style="margin-top:18px;">Prepared for <strong>${esc(ctx.customerName)}</strong></div>
          <div class="cover-issue-line">${esc(ctx.issueDateText)}  ·  ${esc(ctx.sowNumber)}</div>
        </div>
      </section>
    `;
  }

  if (heroImageUrl) {
    return `
      <section class="cover cover--hero" style="background-image: linear-gradient(rgba(0,30,50,0.05), rgba(0,30,50,0.25)), url('${heroImageUrl}');">
        <div class="cover-inner">
          ${stubBanner}
          <div class="cover-head">
            <img src="${logoUrl}" alt="Packet Fusion" class="cover-logo cover-logo--on-hero" />
            <div class="cover-confidential cover-confidential--on-hero">CONFIDENTIAL</div>
          </div>
          <div class="cover-hero-text">
            <div class="cover-title cover-title--on-hero">STATEMENT OF WORK</div>
            <div class="cover-subtitle cover-subtitle--on-hero">${esc(variant.productLine)}</div>
            <div class="cover-customer-line">Prepared for <strong>${esc(ctx.customerName)}</strong></div>
            <div class="cover-issue-line">${esc(ctx.issueDateText)}  ·  ${esc(ctx.sowNumber)}</div>
          </div>
        </div>
      </section>
    `;
  }

  // Fallback (no hero): text-only cover with the logo header + title block.
  return `
    <section class="cover">
      ${stubBanner}
      <div class="cover-head">
        <img src="${logoUrl}" alt="Packet Fusion" class="cover-logo" />
        <div class="cover-confidential">CONFIDENTIAL</div>
      </div>
      <div class="cover-title-block cover-title-block--center">
        <div class="cover-title">STATEMENT OF WORK</div>
        <div class="cover-subtitle">${esc(variant.productLine)}</div>
        <div class="cover-customer-line" style="margin-top:24px;">Prepared for <strong>${esc(ctx.customerName)}</strong></div>
        <div class="cover-issue-line">${esc(ctx.issueDateText)}  ·  ${esc(ctx.sowNumber)}</div>
      </div>
    </section>
  `;
}

function documentControlPage(_variant: SowVariant, ctx: SowBuildContext): string {
  // Document Control sits on its own page after the hero cover. Carries the
  // 2-col Prepared For/By, the SOW details table, revision history, and the
  // confidentiality notice.

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
    <section class="page-section doc-control">
      <div class="cover-section-header">Document Control</div>
      <table class="cover-prepared">
        <thead>
          <tr><th>PREPARED FOR</th><th>PREPARED BY</th></tr>
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

// Title-page now embeds the revision history (or it's on the Document Control
// page); the separate revisionHistory() block is no longer needed.
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

// ── Key Dates ─────────────────────────────────────────────────────────────
//
// When PM supplies a target go-live + duration band, the renderer back-fills
// all 7 rows of the Key Dates table from it. Math runs on calendar dates so
// the row reads naturally to a customer; we don't try to skip weekends here
// (the milestones land on whatever day the math produces — close enough for
// a sales-stage SOW; the actual project plan refines after kickoff).
//
//   SOW Execution    = issue date (= today / version-stamp time)
//   Kickoff Complete = SOW Execution + 5 business days
//   Planning Complete (Design Validated) = Go-Live − planning_weeks (varies by band)
//   Port Orders Submitted                = Go-Live − port_weeks     (varies by band)
//   UAT Complete & Customer Sign-off     = Go-Live − 1 week         (fixed)
//   Go-Live                              = the supplied date
//   Project Closure & Transition to CSM  = Go-Live + 1 week         (fixed)

type BandOffsets = { planning_weeks: number; port_weeks: number; label: string };

function offsetsForBand(band: SowBuildContext["durationBand"], customWeeks: number | null): BandOffsets {
  // Planning + Port offsets scale with total project length. 8-12 weeks is the
  // standard UCaaS profile; shorter bands compress the front end.
  if (band === "4_6_weeks")  return { planning_weeks: 3, port_weeks: 3, label: "4–6 weeks" };
  if (band === "6_8_weeks")  return { planning_weeks: 5, port_weeks: 4, label: "6–8 weeks" };
  if (band === "8_12_weeks") return { planning_weeks: 6, port_weeks: 5, label: "8–12 weeks" };
  if (band === "custom" && customWeeks) {
    // Proportional scale off the 10-week reference (planning 6, port 5).
    const ratio = customWeeks / 10;
    return {
      planning_weeks: Math.max(1, Math.round(6 * ratio)),
      port_weeks:     Math.max(1, Math.round(5 * ratio)),
      label: `${customWeeks} weeks`,
    };
  }
  // Default assumption when go-live is set but band isn't.
  return { planning_weeks: 6, port_weeks: 5, label: "8–12 weeks (assumed)" };
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addBusinessDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

function keyDates(ctx: SowBuildContext): string {
  const goLive = ctx.targetGoLiveDate;
  const offsets = offsetsForBand(ctx.durationBand, ctx.customWeeks);

  // SOW execution falls on the issue date — that's the docx's convention
  // (Section 9.3 invoices SOW Execution + Go-Live, and the cover lists Issue
  // Date right above SOW Number). We parse issueDateText as a US locale string.
  const today = new Date();
  const sowExecIso = today.toISOString().slice(0, 10);

  const kickoffIso = addBusinessDaysIso(sowExecIso, 5);
  const planningIso = goLive ? addDaysIso(goLive, -offsets.planning_weeks * 7) : null;
  const portIso     = goLive ? addDaysIso(goLive, -offsets.port_weeks * 7)     : null;
  const uatIso      = goLive ? addDaysIso(goLive, -7)                          : null;
  const closureIso  = goLive ? addDaysIso(goLive,  +7)                         : null;

  const cell = (iso: string | null) => esc(fmtDate(iso));
  const planningAnnotation = goLive && (!ctx.durationBand || ctx.durationBand === null)
    ? ` <span class="muted">(assumes 8–12 wk project)</span>`
    : "";

  return `
    <section class="page-section">
      <h3>Key Dates ${goLive ? `<span class="muted" style="font-weight:400;">· ${esc(offsets.label)}</span>` : ""}</h3>
      <table class="data-table">
        <thead><tr><th>Milestone</th><th>Target Date</th><th>Owner</th></tr></thead>
        <tbody>
          <tr><td>SOW Execution</td><td>${cell(sowExecIso)}</td><td>Joint</td></tr>
          <tr><td>Kickoff Complete</td><td>${cell(kickoffIso)}</td><td>Packet Fusion</td></tr>
          <tr><td>Planning Complete (Design Validated)${planningAnnotation}</td><td>${cell(planningIso)}</td><td>Customer</td></tr>
          <tr><td>Port Orders Submitted</td><td>${cell(portIso)}</td><td>Packet Fusion</td></tr>
          <tr><td>UAT Complete &amp; Customer Sign-off</td><td>${cell(uatIso)}</td><td>Joint</td></tr>
          <tr><td>Go-Live</td><td>${cell(goLive)}</td><td>Joint</td></tr>
          <tr><td>Project Closure &amp; Transition to CSM</td><td>${cell(closureIso)}</td><td>Joint</td></tr>
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

/**
 * Total project weeks derived from the duration band. Used by Section 7
 * (Timeline & Milestones) to render week-based phase ranges. The bands map
 * to the upper end of the range so the customer sees a conservative
 * estimate; "custom" uses the explicit week count when supplied.
 */
function totalProjectWeeks(ctx: SowBuildContext): number {
  if (ctx.durationBand === "4_6_weeks") return 6;
  if (ctx.durationBand === "6_8_weeks") return 8;
  if (ctx.durationBand === "8_12_weeks") return 12;
  if (ctx.durationBand === "custom" && ctx.customWeeks && ctx.customWeeks > 0) return ctx.customWeeks;
  return 10; // default when no band is set
}

/**
 * Section 7 — Timeline & Milestones. Replaces the previously-rendered
 * Section 7 (Governance/RACI/Cadence/Escalation, now archived) and the old
 * dated-milestone table (T+N weeks). Per the May-2026 content review the
 * SOW commits only to a target go-live; phase week-ranges are illustrative
 * and tied to the proposed project duration so we don't promise specific
 * dated milestones contractually.
 */
function section7Timeline(ctx: SowBuildContext): string {
  const weeks = totalProjectWeeks(ctx);
  // Phase distribution: Initiation = wk 1, Planning ~40%, Executing overlaps
  // through ~70%, Monitoring/Controlling through ~85%, Go-Live + Closure at
  // the tail. Ranges are inclusive and rounded to whole weeks.
  const planEnd  = Math.max(2, Math.round(weeks * 0.4));
  const execEnd  = Math.max(planEnd + 1, Math.round(weeks * 0.7));
  const monEnd   = Math.max(execEnd + 1, Math.round(weeks * 0.85));
  const goLive   = Math.max(monEnd + 1, weeks - 1);
  const closing  = Math.max(goLive + 1, weeks);

  const rows: Array<{ phase: string; weeks: string }> = [
    { phase: "Initiation & Kickoff",                        weeks: "Week 1" },
    { phase: "Planning — Assessment, Design, Porting Prep", weeks: `Weeks 1–${planEnd}` },
    { phase: "Executing — Tenant Build & Porting Submission", weeks: `Weeks ${planEnd}–${execEnd}` },
    { phase: "Monitoring / Controlling — UAT & Hardware",   weeks: `Weeks ${execEnd}–${monEnd}` },
    { phase: "Go-Live & Day 1 Support",                     weeks: `Week ${goLive}` },
    { phase: "Closure & CSM Transition",                    weeks: `Week ${closing}` },
  ];

  const goLiveLine = ctx.targetGoLiveDate
    ? `<p>Anticipated go-live: <strong>${esc(fmtDate(ctx.targetGoLiveDate))}</strong>. This is the only date Packet Fusion commits to under this SOW; week-range estimates below are illustrative.</p>`
    : `<p>An anticipated go-live date will be confirmed during Planning. Week-range estimates below are illustrative and not contractual milestones.</p>`;

  return `
    <section class="page-section">
      <h1>7.  Timeline &amp; Milestones</h1>
      ${goLiveLine}
      <p>This engagement is sized for approximately <strong>${weeks} weeks</strong> from project initiation to closure. The week ranges below are typical phase distribution; specific dates are finalized in the project plan produced during Planning, based on porting Firm Order Commitments (FOCs) and Customer site readiness.</p>
      <table class="data-table">
        <thead><tr><th>Phase</th><th>Relative Weeks</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${esc(r.phase)}</td><td>${esc(r.weeks)}</td></tr>`).join("")}</tbody>
      </table>
      <p class="muted">Week 1 begins at SOW execution. Durations are working weeks and exclude federal holidays and Customer-declared blackout windows.</p>
    </section>
  `;
}

function section8Pricing(variant: SowVariant, ctx: SowBuildContext, optServices: OptionalService[]): string {
  return `
    <section class="page-section">
      <h1>8.  Pricing &amp; Payment Schedule</h1>
      <h3>8.1  Fee Summary</h3>
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

      <h3>8.2  Optional Services</h3>
      <table class="data-table">
        <thead><tr><th>Optional Service</th><th>Unit</th><th>Fee</th></tr></thead>
        <tbody>${optServices.map((o) => `<tr><td>${esc(o.name)}</td><td>${esc(o.unit)}</td><td class="num">${esc(o.fee)}</td></tr>`).join("")}</tbody>
      </table>
      <p class="muted">Optional services are added by mutual written agreement (email accepted) and invoiced upon completion of the optional engagement, unless otherwise stated.</p>

      <h3>8.3  Invoicing Milestones</h3>
      <p>Where fees are billable, Packet Fusion will invoice against the following milestones. Invoices are net 30 from issue date unless the MSA states otherwise.</p>
      <table class="data-table">
        <thead><tr><th>Trigger</th><th>Percent</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>SOW Execution</td><td>50%</td><td>Per Section 8.1</td></tr>
          <tr><td>Go-Live and Customer acceptance</td><td>50%</td><td>Per Section 8.1</td></tr>
        </tbody>
      </table>
      ${ctx.projectTotal === 0 ? `<p class="muted">Where the Preferred Client Discount results in a Project Total of $0.00, no invoices are issued for the base scope. Optional services and change orders are invoiced separately.</p>` : ""}

      <h3>8.4  Expenses</h3>
      <p>All services are delivered remotely unless otherwise stated. Any pre-approved travel will be invoiced at cost per the MSA travel &amp; expense policy.</p>

      <h3>8.5  Taxes</h3>
      <p>All fees are exclusive of applicable sales, use, and similar transaction taxes. The Customer is responsible for any such taxes other than taxes based on Packet Fusion's net income.</p>
    </section>
  `;
}

function section9ChangeMgmt(): string {
  return `
    <section class="page-section">
      <h1>9.  Change Management</h1>
      <p>Changes to scope, schedule, fees, deliverables, or assumptions require a written Change Order signed by both parties before work on the change commences. The process is intentionally lightweight but explicit:</p>
      ${CHANGE_MANAGEMENT_STEPS.map((s) => `<p><strong>${esc(s.name)}.</strong> ${esc(s.text)}</p>`).join("")}
      <p><strong>Customer-caused delay.</strong> Delays in performance or delivery caused by the Customer — including without limitation delays in completing the implementation workbook, approving the call-flow design, supplying LOAs/CSRs, or remediating network findings — may result in schedule adjustment and/or additional fees, processed through this same change-order procedure.</p>
    </section>
  `;
}

function section10Acceptance(): string {
  return `
    <section class="page-section">
      <h1>10.  Acceptance Process</h1>
      <h3>10.1  Deliverable Acceptance</h3>
      <p>For each deliverable listed in Section 3, the following process applies:</p>
      ${bullets(ACCEPTANCE_DELIVERABLE_STEPS)}

      <h3>10.2  Site Go-Live Acceptance</h3>
      <p>Each site is deemed accepted at Go-Live when: (a) ported numbers complete; (b) test calls succeed in both directions; (c) E911 returns correct location data; and (d) the Customer site lead signs off on the cutover form. Outstanding cosmetic items are captured for Day 1 Support follow-up.</p>

      <h3>10.3  Project Closure</h3>
      <p>The project is closed when: (a) all deliverables in Section 3 have been accepted; (b) all sites have completed Day 1 Support; and (c) the Project Closure Memo is signed by both PMs. Any open items at closure are deferred to a future change order or to the Customer's ongoing support relationship.</p>
    </section>
  `;
}

function section11Terms(): string {
  return `
    <section class="page-section">
      <h1>11.  Terms &amp; References</h1>
      <h3>11.1  Master Services Agreement</h3>
      <p>This SOW is governed by the Packet Fusion Master Services Agreement (the "MSA") executed between the parties and incorporated here by reference. The MSA controls all terms not expressly modified by this SOW, including confidentiality, intellectual property, warranty, indemnification, limitation of liability, term and termination, and governing law.</p>
      <h3>11.2  Confidentiality</h3>
      <p>Each party will protect the Confidential Information of the other party as required by the MSA. Project deliverables produced under this SOW are considered Confidential Information of the Customer except for Packet Fusion's pre-existing methodologies, templates, and know-how, which remain the property of Packet Fusion.</p>
      <h3>11.3  Data Handling</h3>
      <p>Packet Fusion will access only the Customer data and systems necessary to deliver the services in this SOW. Any Customer data received will be handled per the MSA and applicable privacy laws. The Customer is responsible for ensuring its vendor tenant and downstream integrations comply with its own regulatory requirements (e.g., HIPAA for covered entities).</p>
      <h3>11.4  Order of Precedence</h3>
      <p>In the event of a conflict between documents, the order of precedence is: (1) the MSA; (2) any signed Change Order to this SOW; (3) this SOW; (4) any attached appendices.</p>
      <h3>11.5  Entire Agreement</h3>
      <p>This SOW, together with the MSA and any signed Change Orders, constitutes the entire agreement of the parties with respect to its subject matter and supersedes all prior or contemporaneous communications, representations, or agreements, whether oral or written, relating to that subject matter.</p>
    </section>
  `;
}

function section12Signature(ctx: SowBuildContext): string {
  // Per Ryan: sig block names parties only — no individual names.
  // .signature-page class enforces page-break-before so the signature always
  // starts on a fresh sheet — no orphaned half-page sig blocks.
  return `
    <section class="page-section signature-page">
      <h1>12.  Authorization &amp; Signature</h1>
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
    /* The hero cover page wants zero @page margin so the illustration prints
       edge-to-edge. Named-page selector targets only the first sheet so the
       rest of the doc keeps its normal margins. */
    @page :first { margin: 0; }
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
    .cover { padding: 0; min-height: 9.6in; position: relative; page-break-after: always; }
    /* Word-export cover: hero is an inline <img>, title block sits below in
       normal text color. No @page tricks, no overlaid text — Word renders
       this faithfully. */
    .cover--word { min-height: auto; padding: 18px 0; page-break-after: always; }
    .cover--word .cover-title { font-size: 32pt; }
    .cover--word .cover-subtitle { font-size: 14pt; margin-top: 6px; }
    .cover-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 18px; border-bottom: 3px solid ${GREEN}; margin-bottom: 38px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover-logo { height: 42px; }
    .cover-confidential { font-size: 9.5pt; font-weight: 700; letter-spacing: 0.22em; color: ${GREEN}; text-transform: uppercase; }
    .cover-title-block { margin-bottom: 32px; }
    .cover-title-block--center { text-align: center; padding-top: 1.5in; }
    .cover-title { font-size: 38pt; font-weight: 800; color: ${NAVY}; letter-spacing: -0.025em; line-height: 1.02; }
    .cover-subtitle { font-size: 16pt; font-weight: 700; color: ${GREEN}; margin-top: 8px; letter-spacing: 0.01em; }
    .cover-customer-line { font-size: 13pt; color: ${NAVY}; margin-top: 18px; font-weight: 600; }
    .cover-issue-line { font-size: 10.5pt; color: #475569; margin-top: 6px; letter-spacing: 0.04em; }
    /* Hero-cover variant — illustration as the page background edge-to-edge.
       Outer .cover--hero carries the background and zero padding so the image
       bleeds to the page edges. Inner .cover-inner gives the title block + the
       logo/CONFIDENTIAL header breathing room (~0.6in inset) so the text
       doesn't touch the printed paper edges. */
    .cover--hero {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      color: #ffffff;
      padding: 0;
      margin: 0;
      min-height: 10in; /* fills a letter page top-to-bottom */
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .cover--hero .cover-inner {
      padding: 0.5in 0.6in 0.5in;
      min-height: 10in;
      display: flex;
      flex-direction: column;
    }
    .cover--hero .cover-head { border-bottom-color: rgba(255,255,255,0.4); }
    .cover-logo--on-hero { filter: brightness(0) invert(1); /* makes the logo white over the dark image */ }
    .cover-confidential--on-hero { color: #ffffff; }
    .cover-hero-text { margin-top: 0.4in; max-width: 6.5in; }
    .cover-title--on-hero { color: #ffffff; font-size: 48pt; letter-spacing: -0.03em; line-height: 1; }
    .cover-subtitle--on-hero { color: ${GREEN}; font-size: 18pt; }
    .cover--hero .cover-customer-line { color: #ffffff; font-size: 16pt; margin-top: 0.6in; }
    .cover--hero .cover-issue-line { color: rgba(255,255,255,0.85); font-size: 11pt; }
    /* Document Control page header style */
    .cover-section-header { font-size: 11pt; font-weight: 800; color: ${NAVY}; text-transform: uppercase; letter-spacing: 0.14em; padding-bottom: 4px; border-bottom: 1px solid ${GREEN}; margin: 10px 0 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc-control { page-break-after: always; }
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
    /* Signature block — always starts on its own page so the sig lines + label
       cluster never gets orphaned at the bottom of a prior section. */
    .signature-page { page-break-before: always; break-before: page; }
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
  /** Optional hero illustration URL for the cover. Resolved by the client
   *  from variant.heroImageKey. When set, the cover renders as a full-bleed
   *  hero with the title overlaid; Document Control moves to page 2. */
  heroImageUrl?: string | null;
  /** Optional: project's kickoff + go-live dates for the Key Dates table. */
  kickoffDate?: string | null;
  goLiveDate?: string | null;
  /** When true, render in a Word-friendly layout: hero as inline <img>
   *  rather than CSS background-image (Word doesn't render CSS backgrounds
   *  reliably), and skip print-only effects (watermark transform).
   *  Caller is responsible for passing data-URL images for full
   *  portability of the resulting .doc. */
  forWordExport?: boolean;
}): string {
  const { variant, ctx, logoUrl } = args;
  const heroImageUrl = args.heroImageUrl ?? null;
  const forWord = args.forWordExport === true;
  const watermark = ctx.isBudgetary
    ? `<div class="budgetary-watermark">BUDGETARY</div>`
    : "";
  const body = [
    coverPage(variant, ctx, logoUrl, heroImageUrl, forWord),
    documentControlPage(variant, ctx),
    revisionHistory(ctx),
    executiveSummary(variant, ctx),
    snapshotAndPricing(variant, ctx),
    keyDates(ctx),
    section1(variant, ctx),
    section2(variant),
    section3(variant.deliverables),
    section4(variant),
    section5(),
    section6(),
    // Section 7 was Project Approach & Governance (RACI / cadence / escalation
    // / status reporting). Removed per May-2026 content review — too detailed
    // for the customer-facing SOW; content lives in archivedForCharter.ts for
    // a future Project Charter / RFP renderer.
    section7Timeline(ctx),
    section8Pricing(variant, ctx, variant.optionalServicesTable),
    section9ChangeMgmt(),
    section10Acceptance(),
    section11Terms(),
    section12Signature(ctx),
  ].join("\n");

  return `<!doctype html><html><head><meta charset="utf-8"><title>SOW — ${esc(ctx.customerName)}</title><style>${styles()}</style></head><body>${watermark}${body}</body></html>`;
}
