/**
 * One-off SOW generator — Expert Institute (Zoom Virtual Agent completion +
 * Auto Dialer → Salesforce Sales Engagement integration).
 *
 * WHY THIS IS A SCRIPT AND NOT A VARIANT
 * --------------------------------------
 * The in-app SOW builder (src/shared/sowTemplate/) renders a fixed 12-section
 * document whose shared sections are hard-wired for UCaaS/CCaaS migrations:
 * number porting FOCs, LOAs/CSRs, E911 registered addresses, PoE ports, a
 * six-stage go-live methodology, per-site go-live acceptance, 50/50 invoicing
 * against a cutover. None of that applies to a bucket-of-consulting-hours
 * engagement with two workstreams, three phases and a feasibility gate.
 *
 * Rather than bend the catalog (a real feature PR through staging) for a
 * single quote, this script reproduces the same document — same palette, CSS,
 * hero cover, Document Control page, signature block — with the Expert
 * Institute content substituted for the sections that don't transfer. The CSS
 * below is a snapshot of buildHtml.ts `styles()` as of PR 554; if the app
 * template gets restyled, this one-off won't follow it.
 *
 * Source content: src/client/assets/expert-institute-sow-content.md
 * The md's "Notes for Brett" section is internal and is deliberately NOT
 * rendered.
 *
 * USAGE
 *   node scripts/build-expert-institute-sow.mjs [flags]
 *
 *   --rate=225                 Blended consulting rate ($/hr). Omit and the
 *                              doc renders rate/total placeholders and a
 *                              DRAFT watermark — it is not issuable without a
 *                              rate, which is Brett's call.
 *   --customer="Expert Institute, LLC"
 *                              Legal entity name printed throughout. Default
 *                              "Expert Institute".
 *   --msa-date=2024-05-01      MSA execution date. Omitted → "[MM/DD/YYYY]".
 *   --sow=V1                   SOW number on the cover. Default "V1 (draft)".
 *   --prepared-by="Ryan Dyla"  --prepared-title=…  --prepared-email=…
 *   --issue-date=2026-08-03    Issue date. Default: today.
 *   --out=path.html            Output path. Default dist/sow/Expert_Institute_SOW.html
 *
 * Output is a single self-contained HTML file (logo + hero embedded as data
 * URIs). Open it in Chrome/Edge and Print → Save as PDF, letter, default
 * margins, "Background graphics" ON.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "src", "client", "assets");

// ── CLI ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
function flag(name, fallback = null) {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
}

/** Blended consulting rate, $/hr. Confirmed at $165 — override with --rate. */
const DEFAULT_RATE = 165;

const RATE = (() => {
  const raw = flag("rate");
  if (raw === null) return DEFAULT_RATE;
  if (raw === true) return null; // bare --rate = "blank it out, pricing pending"
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
})();

const CUSTOMER     = String(flag("customer", "Expert Institute"));
const MSA_DATE     = flag("msa-date", null);
const SOW_NUMBER   = String(flag("sow", "V1 (draft)"));
const ISSUE_DATE   = flag("issue-date", null);
const PREPARED_BY  = String(flag("prepared-by", "Ryan Dyla"));
const PREPARED_TTL = String(flag("prepared-title", "Solution Architect"));
const PREPARED_EML = String(flag("prepared-email", "rdyla@packetfusion.com"));
const OUT_PATH     = path.resolve(ROOT, String(flag("out", path.join("dist", "sow", "Expert_Institute_SOW.html"))));

// ── Engagement data — everything customer-specific lives here ────────────────

// Cover subtitle. Keep it to a single line — the hero art's bright cloud sits
// directly under line two, and green-on-green there is unreadable in print.
const PRODUCT_LINE = "Virtual Agent & Auto Dialer Integration";
const PROJECT_REF  = `Zoom Virtual Agent Completion & Auto Dialer–Salesforce Integration – ${CUSTOMER}`;

/**
 * Level of effort. `phase` drives the phase subtotals and the invoicing
 * schedule; `hours: 0` with `noCharge: true` renders "No charge".
 *
 * RECONCILIATION NOTE. The source md's Workstream B line items summed to 31
 * against a stated subtotal of 27 (and a phase split of 13/10/17 that also
 * implies 27) — Phase 3's rows came to 21 against a stated 17, exactly 4 hours
 * over. Resolved by folding the standalone 4-hour "Authentication, phone
 * normalisation, idempotency, retry and logging" line into the 10-hour
 * middleware build line: merged, not dropped, so no scope language is lost.
 * The assertions below fail the build if any edit breaks the arithmetic.
 */
const LOE = [
  { ws: "A", phase: 1, activity: "Current-state discovery and documentation", hours: 0, noCharge: true },
  { ws: "A", phase: 1, activity: "Territory data model discovery", hours: 2 },
  { ws: "A", phase: 1, activity: "Territory lookup tool build", hours: 3 },
  { ws: "A", phase: 1, activity: "Agent flow extension — zip capture, representative presentation, transfer or schedule", hours: 3 },
  { ws: "A", phase: 1, activity: "Testing across four inbound paths", hours: 3 },
  { ws: "A", phase: 1, activity: "Documentation", hours: 2 },
  { ws: "B", phase: 2, activity: "Auto Dialer API validation", hours: 3 },
  { ws: "B", phase: 2, activity: "Sales Engagement cadence advance feasibility", hours: 5 },
  { ws: "B", phase: 2, activity: "Salesforce prerequisite specification", hours: 2 },
  { ws: "B", phase: 3, activity: "Middleware build — history polling, disposition mapping, Salesforce write, cadence advance, including authentication, phone normalisation, idempotency, retry and logging", hours: 10 },
  { ws: "B", phase: 3, activity: "Deployment", hours: 1 },
  { ws: "B", phase: 3, activity: "Disposition mapping configuration", hours: 1 },
  { ws: "B", phase: 3, activity: "Testing with Customer BDR team", hours: 3 },
  { ws: "B", phase: 3, activity: "Operational runbook", hours: 2 },
];

const sumWhere = (fn) => LOE.filter(fn).reduce((s, r) => s + r.hours, 0);
const HOURS = {
  wsA:    sumWhere((r) => r.ws === "A"),
  wsB:    sumWhere((r) => r.ws === "B"),
  phase1: sumWhere((r) => r.phase === 1),
  phase2: sumWhere((r) => r.phase === 2),
  phase3: sumWhere((r) => r.phase === 3),
  total:  sumWhere(() => true),
};

// Fail loudly rather than ship a quote whose subtotals don't foot.
(function assertHours() {
  const errs = [];
  if (HOURS.wsA + HOURS.wsB !== HOURS.total) errs.push(`workstream subtotals ${HOURS.wsA}+${HOURS.wsB} != total ${HOURS.total}`);
  if (HOURS.phase1 + HOURS.phase2 + HOURS.phase3 !== HOURS.total) errs.push(`phase subtotals ${HOURS.phase1}+${HOURS.phase2}+${HOURS.phase3} != total ${HOURS.total}`);
  if (HOURS.total !== 40) errs.push(`total is ${HOURS.total}, expected the quoted 40 — intentional? update this assertion`);
  if (errs.length) {
    console.error("Level-of-effort arithmetic does not foot:\n  - " + errs.join("\n  - "));
    process.exit(1);
  }
})();

const PHASES = [
  {
    num: 1,
    name: "Virtual Agent completion",
    hours: HOURS.phase1,
    focus: "Extend the existing production Virtual Agent so new prospects are routed to their territory representative.",
    gate: "Proceeds on SOW execution. Scope is well understood and builds on comparable Packet Fusion Virtual Agent deployments.",
  },
  {
    num: 2,
    name: "Auto Dialer feasibility",
    hours: HOURS.phase2,
    focus: "Validate the Auto Dialer API surface and confirm that a Sales Engagement cadence step can be advanced through a supported programmatic interface. Deliverable is a written finding and a confirmed build estimate.",
    gate: "Proceeds on SOW execution; may run in parallel with Phase 1.",
  },
  {
    num: 3,
    name: "Auto Dialer integration build",
    hours: HOURS.phase3,
    focus: "Build, deploy and hand over the middleware that reflects Auto Dialer call outcomes into Salesforce and advances the cadence step.",
    gate: "Proceeds on the Customer's written approval of the Phase 2 finding.",
  },
];

const SNAPSHOT_TILES = [
  { value: 2,            label: "Workstreams" },
  { value: PHASES.length, label: "Delivery Phases" },
  { value: HOURS.total,  label: "Consulting Hours" },
  { value: 1,            label: "Feasibility Gate" },
];

const EXEC_SUMMARY = [
  `Packet Fusion is pleased to partner with <strong>${esc(CUSTOMER)}</strong> (the &ldquo;Customer&rdquo;) to complete and extend the Customer's existing Zoom AI Virtual Agent deployment and to deliver a custom integration between Zoom Auto Dialer and Salesforce Sales Engagement.`,
  `The Customer has completed a Zoom Virtual Agent proof of concept, built by Zoom, which is live in production and handling inbound calls: the agent identifies callers by email address, performs a Salesforce lookup, and either transfers the caller to their account owner or schedules a meeting with that representative. Separately, the Customer has been piloting Zoom Auto Dialer for outbound BDR activity.`,
  `Two gaps remain. New prospects with no Salesforce record are captured as a Lead and told that someone will call back, rather than being routed to a territory representative as existing contacts are. And Auto Dialer call outcomes do not reach Salesforce Sales Engagement, so contacts do not progress through their assigned cadence.`,
  `This engagement closes both gaps. Because the Virtual Agent work builds on a functional POC and the Auto Dialer integration depends on a small number of platform behaviours that must be validated before they can be priced, the engagement is structured as a bucket of consulting hours delivered in three phases, with a feasibility gate before the largest build activity.`,
];

const BUSINESS_OBJECTIVES = [
  "Route inbound prospects to the correct territory representative at the point of contact, rather than capturing a Lead for later follow-up.",
  "Give new prospects the same live transfer and self-scheduling experience currently available to established contacts.",
  "Reflect Auto Dialer call activity and dispositions in Salesforce automatically, so BDR contacts progress through their Sales Engagement cadence without manual intervention.",
  "Preserve the configuration and behaviour already built during the Virtual Agent POC.",
  "Establish supported, documented integration patterns the Customer's Salesforce administrator can maintain.",
];

const SCOPE_AT_A_GLANCE = [
  { element: "Workstreams",                  quantity: "2",                        notes: "Virtual Agent completion; Auto Dialer to Sales Engagement integration." },
  { element: "Delivery phases",              quantity: String(PHASES.length),      notes: "Phase 3 proceeds on written approval of the Phase 2 feasibility finding." },
  { element: "Consulting hours",             quantity: `${HOURS.total} hours`,     notes: "Single pooled allocation, not ring-fenced per activity." },
  { element: "Zoom AI Virtual Agent",        quantity: "1 existing production agent", notes: "Extended in place; POC configuration preserved." },
  { element: "Virtual Agent inbound paths tested", quantity: "4",                  notes: "Known contact; new prospect; representative answers; representative does not answer." },
  { element: "Zoom Auto Dialer",             quantity: "1 tenant",                 notes: "Zoom Phone capability. Not Zoom Contact Center Outbound Campaigns." },
  { element: "Salesforce integration",       quantity: "1 middleware service",     notes: "Scheduled polling of Auto Dialer call history; five-minute interval." },
  { element: "Delivery mode",                quantity: "Remote",                   notes: "Packet Fusion business hours." },
  { element: "End-user training",            quantity: "Not included",             notes: "See Section 4." },
];

const WORKSTREAM_A = {
  number: "2.2",
  title: "Workstream A — Virtual Agent Completion",
  intro: "Packet Fusion will extend the existing production Virtual Agent to route new prospects to a territory representative:",
  bullets: [
    "Add zip code capture to the prospect path, following Lead creation.",
    "Build a Salesforce lookup returning the territory representative associated with a supplied zip code.",
    "Extend the agent flow so that, once a representative is identified, the caller is offered the same options available to an established contact: live transfer to that representative, or self-scheduling.",
    "Write the collected zip code to the Lead record so downstream account assignment on Lead conversion behaves consistently with existing Customer automation.",
    "Test across four inbound paths: known contact, new prospect, representative answers, representative does not answer.",
  ],
  outro: "Workstream A assumes the territory lookup can be performed through the existing Zoom Salesforce MCP connection. If a direct API call is required, the Salesforce prerequisites in Deliverable 3 become a Phase 1 precondition.",
};

const WORKSTREAM_B = {
  number: "2.3",
  title: "Workstream B — Auto Dialer to Sales Engagement Integration",
  intro: "Packet Fusion will deliver middleware that reflects Auto Dialer call outcomes into Salesforce and advances the associated Sales Engagement cadence step:",
  bullets: [
    "Validate the Auto Dialer API surface: call list management, call history, authentication and rate limits.",
    "Confirm the supported method for advancing a Sales Engagement cadence step programmatically (see Section 2.5, Feasibility Gate).",
    "Specify the Salesforce prerequisites the Customer must provision: an external connected app and an integration user with the required object and field permissions.",
    "Build a scheduled service that polls Auto Dialer call history, matches records to Salesforce contacts, writes call activity and the selected disposition, and advances the cadence step.",
    "Map Auto Dialer dispositions to the Customer's Sales Engagement outcomes.",
    "Deploy the service and provide an operational runbook.",
  ],
  // The md said "see Section 6" for the webhook caveat, but under this
  // document's numbering that content is Assumptions (Section 5) — 6 is
  // Preconditions.
  outro: "Polling interval is five minutes, confirmed as acceptable by the Customer. Auto Dialer does not currently expose webhooks; see Section 5.",
};

const GATE_RATIONALE = `Advancing a Sales Engagement cadence step is not a standard Salesforce record write. If the required interface proves unavailable or requires an approach materially different from the one assumed here, Phase ${PHASES[2].num} effort will differ from the estimate in Section 2.4, and Packet Fusion will issue a revised estimate for the Customer's approval before continuing. Without the gate, the alternative is either an inflated contingency or a mid-project change order, and neither serves the Customer.`;

const DELIVERABLES = [
  { id: "1", phase: 1, name: "Current-state assessment of the existing Virtual Agent configuration", format: "Written document (PDF)", acceptance: "Customer confirms the documented configuration matches the agent running in production." },
  { id: "2", phase: 1, name: "Extended Virtual Agent with prospect territory routing, in production", format: "Configured Zoom Virtual Agent flow", acceptance: "Test calls across the four inbound paths in Section 2.2 complete successfully in the Customer's production tenant." },
  { id: "3", phase: 2, name: "Salesforce prerequisite specification — connected app and integration user permissions", format: "Written specification", acceptance: "Customer's Salesforce administrator confirms the specification is actionable as written." },
  { id: "4", phase: 2, name: "Auto Dialer and Sales Engagement feasibility finding, with confirmed build estimate", format: "Written finding and estimate", acceptance: "Customer approves or declines Phase 3 in writing within five (5) business days of delivery." },
  { id: "5", phase: 3, name: "Auto Dialer to Salesforce middleware, deployed", format: "Deployed service", acceptance: "A call outcome recorded in Auto Dialer appears in Salesforce with its mapped disposition, and the contact's cadence step advances, within the agreed polling interval." },
  { id: "6", phase: 3, name: "Disposition mapping configuration", format: "Configuration artifact", acceptance: "Customer confirms each Auto Dialer disposition maps to the intended Sales Engagement outcome." },
  { id: "7", phase: 3, name: "Operational runbook and handover documentation", format: "Written runbook (PDF)", acceptance: "Customer's administrator confirms the runbook covers monitoring, credential rotation, and failure recovery." },
];

const OUT_OF_SCOPE = [
  "Zoom Contact Center Outbound Campaign configuration. This engagement addresses Zoom Auto Dialer, a Zoom Phone capability, which is a separate product with a separate API.",
  "Remediation of the Virtual Agent transfer-back behaviour described in Section 6.1.",
  "Salesforce development, including Apex, Flow, and validation rule changes, other than the integration user and connected app configuration specified in Deliverable 3.",
  "Building the Salesforce to Auto Dialer list upload direction.",
  "Sales Engagement cadence design, content, or restructuring.",
  "Zoom licence procurement, including Auto Dialer seats and Virtual Agent minute commitments.",
  "Net-new Virtual Agent intents, skills, or conversational paths beyond the prospect territory routing described in Section 2.2.",
  "End user training and change management.",
];

const ASSUMPTIONS = [
  "The Virtual Agent remains in the Customer's production Zoom tenant, with POC configuration intact.",
  "Loading Salesforce lists and reports into Auto Dialer is functioning, as confirmed by the Customer. Building or remediating that direction is excluded (see Section 4).",
  "The territory lookup in Workstream A can be performed through the existing Zoom Salesforce MCP connection, as described in Section 2.2.",
  "Territory assignment by zip code is available through a queryable Salesforce object or equivalent supported interface. If the mapping exists only as a report requiring reverse-engineering, additional discovery effort applies.",
  "A five-minute polling interval between an Auto Dialer call outcome and its appearance in Salesforce is acceptable. Real-time reflection is not achievable without Auto Dialer webhooks.",
  "Auto Dialer webhooks do not become available during the engagement. Should Zoom release them mid-engagement, migrating from polling to event-driven delivery is a change to scope and will be estimated separately. It would improve latency and reduce API consumption.",
  "Salesforce API request volume associated with the polling service falls within the Customer's existing entitlement.",
  "Customer resources are available for scheduled testing, including BDR participation for Workstream B.",
  "Work is delivered remotely during Packet Fusion business hours.",
  "The work in this SOW is performed under the master pricing and terms in effect as of the SOW Issue Date.",
];

const PRECONDITIONS = [
  { lead: "Zoom resolution of the Virtual Agent transfer-back behaviour.", text: "When a call is transferred to a representative who does not answer and the caller elects to schedule via voicemail, the call currently returns to the top of the Virtual Agent and re-collects information already provided. Zoom has confirmed this is not the intended behaviour and has committed to correcting it. Packet Fusion's scope assumes handover of a Virtual Agent in which this is resolved; remediation of this behaviour is not included." },
  { lead: "Salesforce access.", text: "An external connected app and an integration user with read and write permissions on the objects and fields in scope, provisioned by the Customer's Salesforce administrator to the specification in Deliverable 3." },
  { lead: "Zoom tenant access.", text: "Administrative access to the Customer's Zoom tenant for the duration of the engagement, with validity periods sufficient to cover the delivery window." },
  { lead: "Documentation of the existing build.", text: "The current-state write-up and Salesforce MCP configuration notes from the Zoom resource who built the POC." },
  // The list-upload item was precondition 5 in the source md, carrying a
  // 6-hour contingency. Ryan confirmed CSV upload to Auto Dialer works, so it
  // is no longer a gate on starting work — it moved to Assumptions and the
  // named contingency came out of Section 8.3. Should it turn out broken,
  // remediation is out of scope (Section 4) and priced under Section 9.
];

const RESPONSIBILITIES = [
  { item: "Business requirements and acceptance decisions", owner: "Ana Griffin" },
  { item: "Commercial approval", owner: "James Palmiotto" },
  { item: "Salesforce connected app, integration user and permissions", owner: "Customer Salesforce administrator" },
  { item: "Existing build documentation and Salesforce MCP notes", owner: "Zoom" },
  { item: "Virtual Agent transfer-back remediation", owner: "Zoom" },
  { item: "Auto Dialer product guidance and feature request status", owner: "Zoom" },
  { item: "BDR availability for Workstream B testing", owner: "Customer" },
];

// Shared boilerplate — mirrors src/shared/sowTemplate/sections.ts so the
// one-off reads identically to a generated SOW.
const ACCEPTANCE_DELIVERABLE_STEPS = [
  "Packet Fusion submits the deliverable to the Customer's designated reviewer in writing (email is acceptable).",
  "The Customer reviews against the stated acceptance criteria within five (5) business days.",
  "If accepted, the Customer authorized signer confirms acceptance in writing.",
  "If rejected, the Customer provides a written list of specific, defensible deficiencies referencing the acceptance criteria. Packet Fusion remedies the deficiencies and resubmits.",
  "If the Customer does not respond within five (5) business days, the deliverable is deemed accepted.",
];

const CHANGE_MANAGEMENT_STEPS = [
  { name: "Step 1 — Request",           text: "Either party submits a written change request to the other party's project contact describing the change and the reason for it." },
  { name: "Step 2 — Impact Assessment", text: "Within five (5) business days, Packet Fusion will assess the impact on scope, hours, schedule, fees, deliverables, and assumptions, and provide a written Change Order for the Customer's review." },
  { name: "Step 3 — Approval",          text: "The Change Order takes effect when signed by the authorized signers of both parties. Until then, the original SOW remains in force." },
  { name: "Step 4 — Execution",         text: "Packet Fusion incorporates the approved change into the delivery plan and tracks it through the normal status cadence." },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function money(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

/** Money-or-placeholder — the doc must not invent a rate Brett hasn't set. */
function moneyOrTbd(n) {
  return RATE === null ? `<span class="tbd">[TBD]</span>` : esc(money(n));
}

function fmtDate(iso) {
  if (!iso) return "[MM/DD/YYYY]";
  const d = new Date(String(iso).length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Bullets. Items are pre-escaped/authored HTML — keep them trusted-internal. */
function bullets(items) {
  if (!items.length) return "";
  return `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

function dataUri(file) {
  const abs = path.join(ASSETS, file);
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(abs).toString("base64")}`;
}

const hoursCell = (r) => (r.noCharge ? "No charge" : String(r.hours));

// ── Sections ─────────────────────────────────────────────────────────────────

function coverPage(logoUri, heroUri, issueDateText) {
  return `
    <!-- Gradient is heavier at the top than the app template's (0.05 → 0.25):
         this hero's bright cloud sits right under the title block, and the
         green subtitle over it is unreadable in print without the extra scrim. -->
    <section class="cover cover--hero" style="background-image: linear-gradient(rgba(0,26,44,0.62) 0%, rgba(0,26,44,0.44) 40%, rgba(0,30,50,0.22) 100%), url('${heroUri}');">
      <div class="cover-inner">
        <div class="cover-head">
          <img src="${logoUri}" alt="Packet Fusion" class="cover-logo cover-logo--on-hero" />
          <div class="cover-confidential cover-confidential--on-hero">CONFIDENTIAL</div>
        </div>
        <div class="cover-hero-text">
          <div class="cover-title cover-title--on-hero">STATEMENT OF WORK</div>
          <div class="cover-subtitle cover-subtitle--on-hero">${esc(PRODUCT_LINE)}</div>
          <div class="cover-customer-line">Prepared for <strong>${esc(CUSTOMER)}</strong></div>
          <div class="cover-issue-line">${esc(issueDateText)}  &middot;  ${esc(SOW_NUMBER)}</div>
        </div>
      </div>
    </section>
  `;
}

function documentControlPage(issueDateText) {
  const preparedFor = [esc(CUSTOMER), "Ana Griffin"];
  const preparedBy  = ["Packet Fusion, Inc.", esc(PREPARED_BY), esc(PREPARED_TTL), esc(PREPARED_EML)].filter(Boolean);

  const details = [
    { label: "SOW Number",        value: esc(SOW_NUMBER) },
    { label: "Issue Date",        value: esc(issueDateText) },
    { label: "Master Agreement",  value: `Packet Fusion Master Services Agreement dated ${esc(fmtDate(MSA_DATE))}` },
    { label: "Project Reference", value: esc(PROJECT_REF) },
    { label: "Engagement Type",   value: `Consulting hours — ${HOURS.total} hours across ${PHASES.length} phases` },
    { label: "SOW Status",        value: RATE === null ? "Draft — pricing pending" : "Draft for Review" },
  ];

  return `
    <section class="page-section doc-control">
      <div class="cover-section-header">Document Control</div>
      <table class="cover-prepared">
        <thead><tr><th>PREPARED FOR</th><th>PREPARED BY</th></tr></thead>
        <tbody>
          <tr>
            <td>${preparedFor.map((l) => `<div>${l}</div>`).join("")}</td>
            <td>${preparedBy.map((l) => `<div>${l}</div>`).join("")}</td>
          </tr>
        </tbody>
      </table>
      <table class="cover-details">
        <tbody>${details.map((r) => `<tr><th>${esc(r.label)}</th><td>${r.value}</td></tr>`).join("")}</tbody>
      </table>
      <div class="cover-section-header" style="margin-top:18px;">Revision History</div>
      <table class="data-table cover-revisions">
        <thead><tr><th>Version</th><th>Date</th><th>Author</th><th>Description of Change</th></tr></thead>
        <tbody>
          <tr><td>${esc(SOW_NUMBER)}</td><td>${esc(issueDateText)}</td><td>${esc(PREPARED_BY)}</td><td>Initial issue.</td></tr>
        </tbody>
      </table>
      <p class="confidentiality"><strong>Confidentiality Notice.</strong> This document contains confidential and proprietary information of Packet Fusion, Inc. and the Customer named above. It is provided solely for the purpose of evaluating and executing the services described herein and may not be reproduced, distributed, or disclosed to any third party without the prior written consent of Packet Fusion.</p>
    </section>
  `;
}

function executiveSummary() {
  return `
    <section class="page-section">
      <h2>Executive Summary</h2>
      ${EXEC_SUMMARY.map((p) => `<p>${p}</p>`).join("")}
    </section>
  `;
}

function snapshotAndPricing() {
  const tiles = SNAPSHOT_TILES.map((t) => `
    <div class="snap-tile">
      <div class="snap-value">${esc(t.value)}</div>
      <div class="snap-label">${esc(t.label)}</div>
    </div>
  `).join("");

  const rateLine = RATE === null
    ? `<p class="muted">Blended consulting rate and engagement total are pending commercial approval and will be inserted before issue. Hours are firm as scoped in Section 2.4.</p>`
    : `<p class="muted">Hours are drawn from a single pooled allocation. Work beyond ${HOURS.total} hours is processed under Section 9 at the same rate. Optional and additional services are added by mutual written agreement.</p>`;

  return `
    <section class="page-section">
      <h3>Engagement Snapshot</h3>
      <div class="snap-grid">${tiles}</div>
      <h3>Pricing Summary</h3>
      <table class="data-table pricing-summary">
        <tbody>
          <tr><td>Professional Services — ${esc(HOURS.total)} consulting hours</td><td class="num">${moneyOrTbd(RATE * HOURS.total)}</td></tr>
          <tr><td>Current-state discovery and documentation</td><td class="num">No charge</td></tr>
          <tr class="total-row"><td><strong>Project Total</strong></td><td class="num"><strong>${moneyOrTbd(RATE * HOURS.total)}</strong></td></tr>
        </tbody>
      </table>
      ${rateLine}
    </section>
  `;
}

function section1() {
  const rows = SCOPE_AT_A_GLANCE
    .map((r) => `<tr><td>${esc(r.element)}</td><td>${esc(r.quantity)}</td><td>${esc(r.notes)}</td></tr>`)
    .join("");

  return `
    <section class="page-section">
      <h1>1.  Engagement Overview</h1>
      <h3>1.1  About This SOW</h3>
      <p>This SOW is executed by Packet Fusion, Inc. (&ldquo;Packet Fusion&rdquo;) and ${esc(CUSTOMER)} (the &ldquo;Customer&rdquo;) under, and is subject to, the Packet Fusion Master Services Agreement (the &ldquo;MSA&rdquo;) executed between the parties. Capitalized terms used but not defined herein have the meanings given in the MSA. In the event of any conflict between this SOW and the MSA, the MSA controls except where this SOW expressly states otherwise.</p>
      <h3>1.2  Business Objectives</h3>
      <p>The Customer is engaging Packet Fusion to achieve the following outcomes:</p>
      ${bullets(BUSINESS_OBJECTIVES.map(esc))}
      <h3>1.3  Scope at a Glance</h3>
      <table class="data-table">
        <thead><tr><th>Element</th><th>Quantity</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function workstreamBlock(ws) {
  return `
    <div class="stage">
      <h3>${esc(ws.number)}  ${esc(ws.title)}</h3>
      <p>${esc(ws.intro)}</p>
      ${bullets(ws.bullets.map(esc))}
      ${ws.outro ? `<p>${esc(ws.outro)}</p>` : ""}
    </div>
  `;
}

function section2() {
  const phaseRows = PHASES.map((p) => `
    <tr>
      <td>${esc(p.num)}</td>
      <td>${esc(p.name)}</td>
      <td class="num">${esc(p.hours)}</td>
      <td>${esc(p.focus)}</td>
      <td>${esc(p.gate)}</td>
    </tr>`).join("");

  const loeRows = ["A", "B"].map((ws) => {
    const rows = LOE.filter((r) => r.ws === ws).map((r) => `
      <tr>
        <td>${esc(r.ws)}</td>
        <td>${esc(r.activity)}</td>
        <td class="num">${esc(hoursCell(r))}</td>
      </tr>`).join("");
    const subtotal = ws === "A" ? HOURS.wsA : HOURS.wsB;
    return `${rows}<tr class="subtotal-row"><td></td><td><strong>Workstream ${ws} subtotal</strong></td><td class="num"><strong>${esc(subtotal)}</strong></td></tr>`;
  }).join("");

  return `
    <section class="page-section">
      <h1>2.  Scope of Services</h1>

      <h3>2.1  Delivery Approach</h3>
      <p>This engagement is delivered as a pooled allocation of <strong>${esc(HOURS.total)} consulting hours</strong> across two workstreams and ${esc(PHASES.length)} phases. Workstream A extends a Virtual Agent already running in the Customer's production tenant. Workstream B is a custom integration whose largest build activity sits behind a feasibility gate, described in Section 2.5, so that the build is priced against confirmed platform behaviour rather than an assumption.</p>
      <table class="data-table">
        <thead><tr><th>Phase</th><th>Name</th><th>Hours</th><th>Focus</th><th>Proceeds on</th></tr></thead>
        <tbody>${phaseRows}</tbody>
      </table>

      ${workstreamBlock(WORKSTREAM_A)}
      ${workstreamBlock(WORKSTREAM_B)}

      <h3>2.4  Level of Effort</h3>
      <table class="data-table loe-table">
        <thead><tr><th>WS</th><th>Activity</th><th>Hours</th></tr></thead>
        <tbody>
          ${loeRows}
          <tr class="total-row"><td></td><td><strong>Total</strong></td><td class="num"><strong>${esc(HOURS.total)}</strong></td></tr>
        </tbody>
      </table>
      <p>Hours are drawn from a single pooled allocation and are not ring-fenced per activity. Unused hours remain available to the Customer for the duration of the engagement.</p>

      <h3>2.5  Feasibility Gate</h3>
      <p>Phase ${esc(PHASES[1].num)} (${esc(PHASES[1].hours)} hours) validates the Auto Dialer API surface and confirms that a Sales Engagement cadence step can be advanced through a supported programmatic interface. Its deliverable is a written finding and a confirmed build estimate. Phase ${esc(PHASES[2].num)} (${esc(PHASES[2].hours)} hours) proceeds only on the Customer's written approval of that finding.</p>
      <p><strong>Why the gate exists.</strong> ${esc(GATE_RATIONALE)}</p>
    </section>
  `;
}

function section3() {
  return `
    <section class="page-section">
      <h1>3.  Deliverables</h1>
      <p>The following deliverables will be produced under this SOW. Each deliverable is subject to the acceptance process described in Section 10.</p>
      <table class="data-table">
        <thead><tr><th>#</th><th>Deliverable</th><th>Phase</th><th>Format</th><th>Acceptance Criteria</th></tr></thead>
        <tbody>
          ${DELIVERABLES.map((d) => `<tr><td>${esc(d.id)}</td><td>${esc(d.name)}</td><td>${esc(d.phase)}</td><td>${esc(d.format)}</td><td>${esc(d.acceptance)}</td></tr>`).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function section4() {
  return `
    <section class="page-section">
      <h1>4.  Out of Scope</h1>
      <p>The following are explicitly out of scope for this SOW. They may be added by change order under Section 9 if the Customer wishes Packet Fusion to perform them.</p>
      ${bullets(OUT_OF_SCOPE.map(esc))}
    </section>
  `;
}

function section5() {
  return `
    <section class="page-section">
      <h1>5.  Assumptions</h1>
      <p>This SOW, including the hours and fees, is based on the following assumptions. A material change to any assumption may require a change order under Section 9.</p>
      ${bullets(ASSUMPTIONS.map(esc))}
    </section>
  `;
}

function section6() {
  return `
    <section class="page-section">
      <h1>6.  Preconditions</h1>
      <p>Work cannot begin, or will be delayed, absent the following:</p>
      <ol class="precond-list">
        ${PRECONDITIONS.map((p) => `<li><strong>${esc(p.lead)}</strong> ${esc(p.text)}</li>`).join("")}
      </ol>
    </section>
  `;
}

function section7() {
  return `
    <section class="page-section">
      <h1>7.  Customer Responsibilities</h1>
      <p>The Customer is responsible for the following throughout the engagement. Delays in any of these items may impact the delivery schedule and may trigger a change order under Section 9.</p>
      <table class="data-table">
        <thead><tr><th>Responsibility</th><th>Owner</th></tr></thead>
        <tbody>${RESPONSIBILITIES.map((r) => `<tr><td>${esc(r.item)}</td><td>${esc(r.owner)}</td></tr>`).join("")}</tbody>
      </table>
      <p class="muted">Items owned by Zoom are tracked by Packet Fusion but are not within Packet Fusion's control. Packet Fusion will escalate through its Zoom channel and report status to the Customer.</p>
    </section>
  `;
}

function section8Pricing() {
  const rateCell = RATE === null ? `<span class="tbd">[RATE TBD]</span> / hour` : `${esc(money(RATE))} / hour`;

  const feeRows = PHASES.map((p) => `
    <tr>
      <td>Phase ${esc(p.num)} — ${esc(p.name)}</td>
      <td class="num">${esc(p.hours)}</td>
      <td class="num">${moneyOrTbd(RATE * p.hours)}</td>
    </tr>`).join("");

  return `
    <section class="page-section">
      <h1>8.  Pricing &amp; Payment Schedule</h1>

      <h3>8.1  Fee Summary</h3>
      <p>Services are delivered on a time-and-materials basis against the pooled allocation in Section 2.4, at a blended consulting rate of <strong>${rateCell}</strong>.</p>
      <table class="data-table">
        <thead><tr><th>Phase</th><th>Hours</th><th>Fee</th></tr></thead>
        <tbody>
          ${feeRows}
          <tr><td>Current-state discovery and documentation</td><td class="num">&mdash;</td><td class="num">No charge</td></tr>
          <tr class="total-row"><td><strong>Project Total</strong></td><td class="num"><strong>${esc(HOURS.total)}</strong></td><td class="num"><strong>${moneyOrTbd(RATE * HOURS.total)}</strong></td></tr>
        </tbody>
      </table>
      ${RATE === null ? `<p class="tbd-note">Rate and totals pending commercial approval. This document is not for issue to the Customer until they are inserted.</p>` : ""}

      <h3>8.2  Invoicing</h3>
      <p>Packet Fusion will invoice on completion of each phase, for the hours actually consumed in that phase. Invoices are net 30 from issue date unless the MSA states otherwise.</p>
      <table class="data-table">
        <thead><tr><th>Trigger</th><th>Hours</th><th>Amount</th></tr></thead>
        <tbody>
          ${PHASES.map((p) => `<tr><td>Completion of Phase ${esc(p.num)} — ${esc(p.name)}</td><td class="num">Up to ${esc(p.hours)}</td><td class="num">${moneyOrTbd(RATE * p.hours)}</td></tr>`).join("")}
        </tbody>
      </table>
      <p class="muted">Phase ${esc(PHASES[2].num)} is invoiced only if the Customer approves the Phase ${esc(PHASES[1].num)} finding in writing and Packet Fusion proceeds with the build.</p>

      <h3>8.3  Hours Beyond the Allocation</h3>
      <p>Hours consumed beyond the ${esc(HOURS.total)}-hour allocation &mdash; including any revised Phase ${esc(PHASES[2].num)} estimate arising from the feasibility finding, and any work arising from an assumption in Section 5 proving incorrect &mdash; are quoted and approved under Section 9 before the work is performed, at the rate in Section 8.1. Unused hours are not invoiced.</p>

      <h3>8.4  Expenses</h3>
      <p>All services are delivered remotely. Any pre-approved travel would be invoiced at cost per the MSA travel &amp; expense policy.</p>

      <h3>8.5  Taxes</h3>
      <p>All fees are exclusive of applicable sales, use, and similar transaction taxes. The Customer is responsible for any such taxes other than taxes based on Packet Fusion's net income.</p>
    </section>
  `;
}

function section9ChangeMgmt() {
  return `
    <section class="page-section">
      <h1>9.  Change Management</h1>
      <p>Changes to scope, hours, schedule, fees, deliverables, or assumptions require a written Change Order signed by both parties before work on the change commences. The process is intentionally lightweight but explicit:</p>
      ${CHANGE_MANAGEMENT_STEPS.map((s) => `<p><strong>${esc(s.name)}.</strong> ${esc(s.text)}</p>`).join("")}
      <p><strong>Customer-caused delay.</strong> Delays in performance or delivery caused by the Customer or by a third party acting on the Customer's behalf &mdash; including without limitation delays in provisioning Salesforce access, supplying the existing build documentation, or making BDR resources available for testing &mdash; may result in schedule adjustment and/or additional fees, processed through this same change-order procedure.</p>
    </section>
  `;
}

function section10Acceptance() {
  return `
    <section class="page-section">
      <h1>10.  Acceptance Process</h1>
      <h3>10.1  Deliverable Acceptance</h3>
      <p>For each deliverable listed in Section 3, the following process applies:</p>
      ${bullets(ACCEPTANCE_DELIVERABLE_STEPS.map(esc))}

      <h3>10.2  Phase Gate Approval</h3>
      <p>Phase ${esc(PHASES[2].num)} does not commence until the Customer approves the Phase ${esc(PHASES[1].num)} feasibility finding (Deliverable 4) in writing. Where the finding carries a revised build estimate, that estimate is approved at the same time under Section 9. If the Customer declines to proceed, the engagement closes at the end of Phase ${esc(PHASES[1].num)} and only hours consumed are invoiced.</p>

      <h3>10.3  Engagement Closure</h3>
      <p>The engagement is closed when all deliverables for the phases the Customer elected to perform have been accepted and the operational runbook has been handed over. Any open items at closure are deferred to a future change order or to the Customer's ongoing support relationship.</p>
    </section>
  `;
}

function section11Terms() {
  return `
    <section class="page-section">
      <h1>11.  Terms &amp; References</h1>
      <h3>11.1  Master Services Agreement</h3>
      <p>This SOW is governed by the Packet Fusion Master Services Agreement (the &ldquo;MSA&rdquo;) executed between the parties and incorporated here by reference. The MSA controls all terms not expressly modified by this SOW, including confidentiality, intellectual property, warranty, indemnification, limitation of liability, term and termination, and governing law.</p>
      <h3>11.2  Confidentiality</h3>
      <p>Each party will protect the Confidential Information of the other party as required by the MSA. Project deliverables produced under this SOW are considered Confidential Information of the Customer except for Packet Fusion's pre-existing methodologies, templates, and know-how, which remain the property of Packet Fusion.</p>
      <h3>11.3  Data Handling</h3>
      <p>Packet Fusion will access only the Customer data and systems necessary to deliver the services in this SOW. The middleware described in Workstream B processes Customer call records and Salesforce contact data; it will be configured to retain only what is required to perform the reconciliation described in Section 2.3. Any Customer data received will be handled per the MSA and applicable privacy laws.</p>
      <h3>11.4  Third-Party Platforms</h3>
      <p>Delivery depends on the published behaviour of the Zoom and Salesforce platforms, including their APIs and administrative interfaces. Packet Fusion does not warrant the availability, performance, or continued behaviour of those platforms or of features the vendor has committed to but not yet released.</p>
      <h3>11.5  Order of Precedence</h3>
      <p>In the event of a conflict between documents, the order of precedence is: (1) the MSA; (2) any signed Change Order to this SOW; (3) this SOW; (4) any attached appendices.</p>
      <h3>11.6  Entire Agreement</h3>
      <p>This SOW, together with the MSA and any signed Change Orders, constitutes the entire agreement of the parties with respect to its subject matter and supersedes all prior or contemporaneous communications, representations, or agreements, whether oral or written, relating to that subject matter.</p>
    </section>
  `;
}

function section12Signature() {
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
              <div class="sig-party">${esc(CUSTOMER.toUpperCase())}</div>
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

// ── Styles — snapshot of buildHtml.ts styles() + a few one-off additions ─────

const NAVY  = "#003B5C";
const GREEN = "#17C662";
const GREY  = "#D9E1E2";

function styles() {
  return `
    @page { size: letter; margin: 0.75in; }
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
    .pricing-summary .total-row td, .data-table .total-row td { border-top: 2px solid ${NAVY}; background: rgba(0,59,92,0.04); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-section { page-break-inside: auto; margin-bottom: 14px; }
    /* Cover */
    .cover { padding: 0; min-height: 9.6in; position: relative; page-break-after: always; }
    .cover-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 18px; border-bottom: 3px solid ${GREEN}; margin-bottom: 38px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover-logo { height: 42px; }
    .cover-confidential { font-size: 9.5pt; font-weight: 700; letter-spacing: 0.22em; color: ${GREEN}; text-transform: uppercase; }
    .cover-title { font-size: 38pt; font-weight: 800; color: ${NAVY}; letter-spacing: -0.025em; line-height: 1.02; }
    .cover-subtitle { font-size: 16pt; font-weight: 700; color: ${GREEN}; margin-top: 8px; letter-spacing: 0.01em; }
    .cover-customer-line { font-size: 13pt; color: ${NAVY}; margin-top: 18px; font-weight: 600; }
    .cover-issue-line { font-size: 10.5pt; color: #475569; margin-top: 6px; letter-spacing: 0.04em; }
    .cover--hero {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      color: #ffffff;
      padding: 0;
      margin: 0;
      min-height: 10in;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .cover--hero .cover-inner { padding: 0.5in 0.6in 0.5in; min-height: 10in; display: flex; flex-direction: column; }
    .cover--hero .cover-head { border-bottom-color: rgba(255,255,255,0.4); }
    .cover-logo--on-hero { filter: brightness(0) invert(1); }
    .cover-confidential--on-hero { color: #ffffff; }
    .cover-hero-text { margin-top: 0.4in; max-width: 6.5in; }
    .cover-title--on-hero { color: #ffffff; font-size: 48pt; letter-spacing: -0.03em; line-height: 1; }
    .cover-subtitle--on-hero { color: ${GREEN}; font-size: 18pt; }
    .cover--hero .cover-customer-line { color: #ffffff; font-size: 16pt; margin-top: 0.6in; }
    .cover--hero .cover-issue-line { color: rgba(255,255,255,0.85); font-size: 11pt; }
    /* Document Control page */
    .cover-section-header { font-size: 11pt; font-weight: 800; color: ${NAVY}; text-transform: uppercase; letter-spacing: 0.14em; padding-bottom: 4px; border-bottom: 1px solid ${GREEN}; margin: 10px 0 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc-control { page-break-after: always; }
    .cover-prepared { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    .cover-prepared th { background: ${GREY}; color: ${NAVY}; text-align: left; padding: 6px 10px; border: 1px solid #b8c5cf; font-weight: 800; font-size: 9.5pt; letter-spacing: 0.12em; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover-prepared td { padding: 8px 10px; border: 1px solid #d6dde2; vertical-align: top; font-size: 10.5pt; color: ${NAVY}; }
    .cover-prepared td div { margin: 1px 0; }
    .cover-details { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    .cover-details th { background: rgba(0,59,92,0.04); color: ${NAVY}; text-align: left; padding: 6px 10px; border: 1px solid #d6dde2; font-weight: 700; font-size: 10pt; width: 30%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cover-details td { padding: 6px 10px; border: 1px solid #d6dde2; font-size: 10.5pt; color: #1a1a1a; }
    .cover-revisions th { background: ${GREY}; }
    /* Snapshot tiles */
    .snap-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 8px 0 16px; }
    .snap-tile { background: rgba(0,59,92,0.04); border: 1px solid ${GREY}; border-radius: 6px; padding: 12px 14px; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .snap-value { font-size: 22pt; font-weight: 800; color: ${NAVY}; }
    .snap-label { font-size: 9pt; color: #555; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
    /* Signature */
    .signature-page { page-break-before: always; break-before: page; }
    .sig-table { width: 100%; margin-top: 16px; }
    .sig-cell { width: 48%; padding: 0 12px; vertical-align: top; }
    .sig-party { font-size: 11pt; font-weight: 800; color: ${NAVY}; margin-bottom: 18px; }
    .sig-line { font-family: monospace; color: #444; margin-top: 22px; }
    .sig-label { font-size: 8.5pt; color: #666; margin-top: 2px; }
    .confidentiality { font-size: 9pt; color: #555; border-top: 1px solid #ccc; padding-top: 10px; margin-top: 14px; }
    .budgetary-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 96pt; font-weight: 900; color: rgba(0, 59, 92, 0.08); letter-spacing: 0.05em; pointer-events: none; z-index: 0; }
    .stage { margin-top: 14px; }
    /* One-off additions for the consulting-hours layout */
    .loe-table .subtotal-row td { background: rgba(0,59,92,0.03); border-top: 1px solid ${NAVY}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .precond-list { margin: 6px 0 12px 22px; padding: 0; }
    .precond-list li { margin: 8px 0; }
    .tbd { color: #b45309; font-weight: 700; }
    .tbd-note { font-size: 9.5pt; color: #b45309; border-left: 3px solid #f59e0b; padding-left: 10px; margin: 8px 0 12px; }
  `;
}

// ── Assemble ─────────────────────────────────────────────────────────────────

function build() {
  const logoUri = dataUri("packetfusion-fullcolor.png");
  const heroUri = dataUri("sow bg 3.png"); // ai_data hero — matches the CI/VA variants
  const issueDateText = ISSUE_DATE
    ? fmtDate(ISSUE_DATE)
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // No rate → the document is not issuable. Say so on every page.
  const watermark = RATE === null ? `<div class="budgetary-watermark">DRAFT</div>` : "";

  const body = [
    coverPage(logoUri, heroUri, issueDateText),
    documentControlPage(issueDateText),
    executiveSummary(),
    snapshotAndPricing(),
    section1(),
    section2(),
    section3(),
    section4(),
    section5(),
    section6(),
    section7(),
    section8Pricing(),
    section9ChangeMgmt(),
    section10Acceptance(),
    section11Terms(),
    section12Signature(),
  ].join("\n");

  return `<!doctype html><html><head><meta charset="utf-8"><title>SOW — ${esc(CUSTOMER)}</title><style>${styles()}</style></head><body>${watermark}${body}</body></html>`;
}

const html = build();
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, html, "utf8");

console.log(`Wrote ${OUT_PATH} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Hours: A=${HOURS.wsA}  B=${HOURS.wsB}  total=${HOURS.total}  |  phases ${PHASES.map((p) => `${p.num}:${p.hours}`).join("  ")}`);
if (RATE === null) {
  console.log(`Rate: not set — rendered [TBD] placeholders + DRAFT watermark. Re-run with --rate=NNN once Brett confirms.`);
} else {
  console.log(`Rate: ${money(RATE)}/hr  →  project total ${money(RATE * HOURS.total)}`);
}
console.log(`Open in Chrome/Edge → Print → Save as PDF (letter, Background graphics ON).`);
