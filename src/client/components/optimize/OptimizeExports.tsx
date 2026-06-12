/**
 * Customer-facing print/export documents for the Optimize module.
 *
 * Three documents, all using the same "Export / Print" pattern lifted from
 * ScopeOfWorkDocument: build the full HTML in memory, open it in a new tab
 * via window.open(), trigger the native print dialog. The customer hits
 * Cmd-P → Save as PDF.
 *
 *   <ExportImpactAssessmentButton assessment={…} account={…} />
 *   <ExportTechStackButton items={…} account={…} />
 *   <ExportAccountSummaryButton account={…} assessment={…} techStack={…} roadmap={…} />
 *
 * Branded with the same navy/green/grey palette as the SOW. All three docs
 * share a cover-page block, a section-heading style, and a footer, defined
 * once in the shared CSS shell below.
 */

import logoUrl from "../../assets/packetfusion-fullcolor.png";
import surveyDef from "../../assets/client_impact_assessment_unified_v1.json";
import { solutionTypeLabel } from "../../../shared/solutionTypes";
import type {
  ImpactAssessment,
  OptimizeAccount,
  RoadmapItem,
  TechStackItem,
} from "../../lib/api";

// ── Brand constants (mirrors ScopeOfWorkDocument) ──────────────────────────
const PF_NAVY  = "#003B5C";
const PF_GREEN = "#17C662";
const PF_GREY  = "#D9E1E2";

// Health-band + TIME-rating colors (mirrors OptimizeAccountPage)
const HEALTH_BAND_COLORS: Record<string, string> = {
  at_risk:        "#d13438",
  limited_value:  "#f59e0b",
  emerging_value: "#0b9aad",
  realized_value: "#22c55e",
};
const HEALTH_BAND_LABELS: Record<string, string> = {
  at_risk:        "At Risk",
  limited_value:  "Limited Value",
  emerging_value: "Emerging Value",
  realized_value: "Realized Value",
};
const TIME_COLORS: Record<string, string> = {
  invest:    "#22c55e",
  tolerate:  "#f59e0b",
  migrate:   "#0b9aad",
  eliminate: "#d13438",
};
const TIME_LABELS: Record<string, string> = {
  invest:    "Invest",
  tolerate:  "Tolerate",
  migrate:   "Migrate",
  eliminate: "Eliminate",
};
const TECH_AREA_LABELS: Record<string, string> = {
  ai:         "AI / Automation",
  uc:         "Unified Communications",
  security:   "Security",
  network:    "Network",
  datacenter: "Datacenter",
  backup_dr:  "Backup & DR",
  tem:        "Telecom Expense Management",
  other:      "Other",
};
const SECTION_LABELS: Record<string, string> = {
  adoption:          "Adoption & Usage",
  operationalImpact: "Operational Impact",
  experienceImpact:  "Experience & Outcome Impact",
  aiAutomation:      "AI & Automation",
  satisfaction:      "Satisfaction & Next Steps",
};

// ── Survey-JSON helpers (mirrors ImpactAssessmentDetail) ───────────────────
type FieldDef = {
  id: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[];
  scaleMin?: number;
  scaleMax?: number;
  minLabel?: string;
  maxLabel?: string;
  scored?: boolean;
};

const ALL_FIELDS: Record<string, FieldDef> = {};
for (const section of surveyDef.sections) {
  for (const field of section.fields) {
    ALL_FIELDS[field.id] = field as FieldDef;
  }
}
const SECTION_FIELD_IDS: Record<string, string[]> = {};
for (const section of surveyDef.sections) {
  const cat = (section as { sectionCategory?: string }).sectionCategory;
  if (cat) SECTION_FIELD_IDS[cat] = section.fields.map((f) => f.id);
}

function formatAnswerValue(field: FieldDef, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (field.type === "single_select" && field.options) {
    return field.options.find((o) => o.value === value)?.label ?? String(value);
  }
  if (field.type === "multi_select" && field.options && Array.isArray(value)) {
    if (value.length === 0) return null;
    return value.map((v) => field.options!.find((o) => o.value === v)?.label ?? v).join(", ");
  }
  if (field.type === "rating") {
    return `${value}${field.scaleMax ? ` / ${field.scaleMax}` : ""}`;
  }
  if (field.type === "textarea" || field.type === "text") {
    return String(value);
  }
  return null;
}

// ── HTML helpers ────────────────────────────────────────────────────────────
function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Render YYYY-MM-DD without the time-of-day suffix, parsed as UTC so we
  // don't drift across timezones.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

// ── Shared CSS shell ────────────────────────────────────────────────────────
const SHARED_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'avenir-lt-pro', 'Segoe UI', system-ui, -apple-system, Arial, sans-serif;
    font-size: 10.5pt;
    color: #1e293b;
    background: #fff;
  }
  .page { max-width: 820px; margin: 0 auto; padding: 48px 56px; }

  /* Cover */
  .cover { padding-bottom: 32px; margin-bottom: 28px; }
  .cover-banner {
    background: ${PF_GREY};
    margin: -48px -56px 48px;
    padding: 50px 56px 22px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .cover-banner img { height: 60px; width: auto; display: block; }
  .cover-eyebrow { font-size: 10pt; font-weight: 700; color: ${PF_GREEN}; text-transform: uppercase; letter-spacing: 0.18em; margin-bottom: 16px; }
  .cover-title { font-size: 34pt; font-weight: 800; color: ${PF_NAVY}; letter-spacing: -0.02em; line-height: 1.05; margin-bottom: 24px; }
  .cover-for { font-size: 10.5pt; color: #64748b; margin-bottom: 6px; }
  .cover-customer { font-size: 20pt; font-weight: 800; color: ${PF_NAVY}; letter-spacing: -0.01em; line-height: 1.1; margin-bottom: 28px; }
  .cover-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding-top: 22px; border-top: 2px solid ${PF_GREEN}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cover-meta-item { padding-right: 20px; }
  .cover-meta-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; color: ${PF_GREEN}; margin-bottom: 5px; }
  .cover-meta-value { font-size: 11pt; font-weight: 700; color: ${PF_NAVY}; line-height: 1.3; }

  /* Section heading */
  .section-heading { margin: 36px 0 18px; padding-bottom: 6px; border-bottom: 2px solid ${PF_GREEN}; -webkit-print-color-adjust: exact; print-color-adjust: exact; page-break-after: avoid; break-after: avoid; }
  .section-heading-text { font-size: 14pt; font-weight: 800; color: ${PF_NAVY}; letter-spacing: -0.01em; }
  .section-heading-sub { font-size: 9.5pt; color: #64748b; margin-top: 3px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; }
  .data-table thead tr { background: ${PF_NAVY}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .data-table thead th { padding: 9px 12px; color: #fff; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: 0.06em; font-size: 7.5pt; }
  .data-table tbody tr.even { background: #f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .data-table tbody tr.odd { background: #fff; }
  .data-table tbody td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; color: #1e293b; line-height: 1.5; font-size: 9.5pt; }

  /* Pills */
  .pill { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Score bar */
  .score-row { margin-bottom: 14px; page-break-inside: avoid; }
  .score-row-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .score-row-label { font-size: 10.5pt; font-weight: 600; color: #1e293b; }
  .score-row-value { font-size: 13pt; font-weight: 800; }
  .score-bar { height: 7px; background: #e2e8f0; border-radius: 4px; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .score-bar-fill { height: 100%; border-radius: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Headline score block */
  .headline { display: grid; grid-template-columns: auto 1fr auto; gap: 28px; align-items: center; padding: 22px 26px; background: ${PF_GREY}; border-left: 6px solid ${PF_GREEN}; margin-bottom: 24px; -webkit-print-color-adjust: exact; print-color-adjust: exact; page-break-inside: avoid; }
  .headline-score { font-size: 44pt; font-weight: 900; color: ${PF_NAVY}; line-height: 1; }
  .headline-meta { font-size: 8.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
  .headline-band { font-size: 14pt; font-weight: 800; }
  .headline-conf { font-size: 9.5pt; color: #475569; margin-top: 6px; }

  /* Answers block */
  .qa-grid { display: grid; gap: 12px; }
  .qa-item { padding: 10px 14px; background: #f8fafc; border-left: 3px solid #cbd5e1; page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .qa-label { font-size: 8.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; font-weight: 700; }
  .qa-value { font-size: 10.5pt; color: #1e293b; line-height: 1.55; }

  /* Lists */
  .pro-list { padding-left: 18px; margin-top: 6px; }
  .pro-list li { font-size: 10.5pt; color: #1e293b; line-height: 1.7; margin-bottom: 4px; page-break-inside: avoid; }

  /* Account header card */
  .account-card { background: ${PF_GREY}; padding: 18px 22px; margin-bottom: 24px; border-left: 4px solid ${PF_GREEN}; -webkit-print-color-adjust: exact; print-color-adjust: exact; page-break-inside: avoid; }
  .account-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .account-cell-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${PF_GREEN}; margin-bottom: 4px; }
  .account-cell-value { font-size: 11pt; font-weight: 700; color: ${PF_NAVY}; line-height: 1.3; }

  /* Footer */
  .footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 7.5pt; color: #94a3b8; display: flex; align-items: center; justify-content: space-between; }
  .footer img { height: 16px; width: auto; opacity: 0.5; }

  /* Print tip */
  .print-tip { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 16px; margin-bottom: 24px; font-size: 9.5pt; color: #92400e; display: flex; align-items: center; gap: 10px; }

  @media print {
    .print-tip { display: none !important; }
    @page { margin: 15mm 18mm; }
  }
`;

// ── Cover-page builder ──────────────────────────────────────────────────────
function coverBlock(opts: {
  eyebrow: string;
  title: string;
  customerName: string;
  meta: Array<{ label: string; value: string }>;
  logoAbsolute: string;
}): string {
  const metaHtml = opts.meta
    .map((m) => `<div class="cover-meta-item"><div class="cover-meta-label">${esc(m.label)}</div><div class="cover-meta-value">${esc(m.value)}</div></div>`)
    .join("");
  return `
    <div class="cover">
      <div class="cover-banner">
        <img src="${opts.logoAbsolute}" alt="Packet Fusion" onerror="this.style.display='none'"/>
      </div>
      <div class="cover-eyebrow">${esc(opts.eyebrow)}</div>
      <div class="cover-title">${esc(opts.title)}</div>
      <div class="cover-for">Prepared for</div>
      <div class="cover-customer">${esc(opts.customerName)}</div>
      <div class="cover-meta">${metaHtml}</div>
    </div>
  `;
}

function footerBlock(logoAbsolute: string): string {
  return `
    <div class="footer">
      <span>CloudConnect by Packet Fusion · ${esc(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }))}</span>
      <img src="${logoAbsolute}" alt="" onerror="this.style.display='none'"/>
    </div>
  `;
}

function printTip(): string {
  return `
    <div class="print-tip">
      <span style="font-size:14pt">💡</span>
      <span>In the print dialog, uncheck <strong>"Headers and footers"</strong> (Chrome) or <strong>"Print headers and footers"</strong> (Firefox/Edge) to remove the browser URL and date.</span>
    </div>
  `;
}

function openPrintWindow(html: string): void {
  const win = window.open("", "_blank", "width=960,height=750");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();

  // Wait for the logo image(s) to finish decoding before opening the print
  // dialog. Printing too early makes the browser lay images out in a default
  // (squished) box because their intrinsic aspect ratio isn't known yet — the
  // old fixed 400ms timer lost that race whenever the logo wasn't cached.
  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try { win.focus(); win.print(); } catch { /* window closed */ }
  };

  const imgs = Array.from(win.document.images);
  if (imgs.length === 0) {
    setTimeout(triggerPrint, 250);
    return;
  }

  let remaining = imgs.length;
  const onSettled = () => { remaining -= 1; if (remaining <= 0) setTimeout(triggerPrint, 120); };
  for (const img of imgs) {
    if (img.complete) onSettled();
    else {
      img.addEventListener("load", onSettled);
      img.addEventListener("error", onSettled);
    }
  }
  // Safety net: never block the dialog indefinitely if a load event misfires.
  setTimeout(triggerPrint, 2500);
}

function logoAbsoluteUrl(): string {
  return logoUrl.startsWith("http") ? logoUrl : `${window.location.origin}${logoUrl}`;
}

function customerName(account: OptimizeAccount): string {
  return account.customer_name ?? account.project_name ?? "Customer";
}

// ── Document builders ──────────────────────────────────────────────────────

function buildImpactAssessmentHtml(assessment: ImpactAssessment, account: OptimizeAccount): string {
  const logo = logoAbsoluteUrl();
  const cust = customerName(account);

  const band = assessment.health_band ?? "at_risk";
  const bandColor = HEALTH_BAND_COLORS[band] ?? "#94a3b8";
  const bandLabel = HEALTH_BAND_LABELS[band] ?? band;

  const sectionScoresHtml = Object.entries(assessment.section_scores ?? {})
    .map(([key, score]) => {
      const color =
        score >= 80 ? HEALTH_BAND_COLORS.realized_value :
        score >= 60 ? HEALTH_BAND_COLORS.emerging_value :
        score >= 40 ? HEALTH_BAND_COLORS.limited_value :
        HEALTH_BAND_COLORS.at_risk;
      return `
        <div class="score-row">
          <div class="score-row-head">
            <span class="score-row-label">${esc(SECTION_LABELS[key] ?? key)}</span>
            <span class="score-row-value" style="color:${color}">${score}</span>
          </div>
          <div class="score-bar"><div class="score-bar-fill" style="width:${score}%;background:${color}"></div></div>
        </div>
      `;
    })
    .join("");

  const solutionScoresHtml = assessment.solution_scores
    ? `
      <div class="section-heading"><div class="section-heading-text">Per-Solution Scores</div></div>
      ${Object.entries(assessment.solution_scores)
        .map(([sol, score]) => {
          const color =
            score >= 80 ? HEALTH_BAND_COLORS.realized_value :
            score >= 60 ? HEALTH_BAND_COLORS.emerging_value :
            score >= 40 ? HEALTH_BAND_COLORS.limited_value :
            HEALTH_BAND_COLORS.at_risk;
          return `
            <div class="score-row">
              <div class="score-row-head">
                <span class="score-row-label">${esc(solutionTypeLabel(sol))}</span>
                <span class="score-row-value" style="color:${color}">${score}</span>
              </div>
              <div class="score-bar"><div class="score-bar-fill" style="width:${score}%;background:${color}"></div></div>
            </div>
          `;
        })
        .join("")}
    `
    : "";

  // Build the Q&A block — every answered field grouped by section
  const answers = assessment.answers ?? {};
  const qaSections = Object.entries(SECTION_FIELD_IDS)
    .map(([cat, ids]) => {
      const rows = ids
        .map((id) => ({ field: ALL_FIELDS[id], value: (answers as Record<string, unknown>)[id] }))
        .filter(({ field, value }) => field && formatAnswerValue(field, value) !== null)
        .map(({ field, value }) => `
          <div class="qa-item">
            <div class="qa-label">${esc(field.label)}</div>
            <div class="qa-value">${esc(formatAnswerValue(field, value) ?? "")}</div>
          </div>
        `).join("");
      if (!rows) return "";
      return `
        <div class="section-heading"><div class="section-heading-text">${esc(SECTION_LABELS[cat] ?? cat)}</div></div>
        <div class="qa-grid">${rows}</div>
      `;
    })
    .join("");

  const insightsHtml = assessment.insights && assessment.insights.length > 0
    ? `
      <div class="section-heading"><div class="section-heading-text">Insights</div></div>
      <ul class="pro-list">${assessment.insights.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
    `
    : "";

  const actionsHtml = assessment.recommended_actions && assessment.recommended_actions.length > 0
    ? `
      <div class="section-heading"><div class="section-heading-text">Recommended Actions</div></div>
      <ul class="pro-list">${assessment.recommended_actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
    `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(cust)} — Impact Assessment</title>
  <link rel="stylesheet" href="https://use.typekit.net/dty1vuu.css"/>
  <style>${SHARED_CSS}</style>
</head>
<body>
<div class="page">
  ${printTip()}
  ${coverBlock({
    eyebrow: "Optimize",
    title: "Customer Impact Assessment",
    customerName: cust,
    meta: [
      { label: "Conducted",       value: formatDate(assessment.conducted_date) },
      { label: "Conducted By",    value: assessment.conducted_by_name ?? "—" },
      { label: "Solution Types",  value: (assessment.solution_types ?? []).map(solutionTypeLabel).join(" · ") || "—" },
    ],
    logoAbsolute: logo,
  })}

  <div class="headline">
    <div class="headline-score" style="color:${bandColor}">${assessment.overall_score ?? "—"}</div>
    <div>
      <div class="headline-meta">Overall Score</div>
      <div class="headline-band" style="color:${bandColor}">${esc(bandLabel)}</div>
      ${assessment.confidence_score != null ? `<div class="headline-conf">Confidence: ${assessment.confidence_score}%</div>` : ""}
    </div>
    <div></div>
  </div>

  <div class="section-heading"><div class="section-heading-text">Section Scores</div></div>
  ${sectionScoresHtml || `<p style="color:#64748b;font-size:10pt;font-style:italic">No section scores recorded.</p>`}

  ${solutionScoresHtml}

  ${insightsHtml}
  ${actionsHtml}

  <div class="section-heading"><div class="section-heading-text">Survey Responses</div></div>
  ${qaSections || `<p style="color:#64748b;font-size:10pt;font-style:italic">No responses recorded.</p>`}

  ${footerBlock(logo)}
</div>
</body>
</html>`;
}

function buildTechStackHtml(items: TechStackItem[], account: OptimizeAccount): string {
  const logo = logoAbsoluteUrl();
  const cust = customerName(account);

  const rows = items
    .map((t, i) => {
      const area = t.tech_area_label ?? TECH_AREA_LABELS[t.tech_area] ?? t.tech_area;
      const rating = t.time_rating;
      const ratingColor = rating ? TIME_COLORS[rating] : "#94a3b8";
      const ratingLabel = rating ? TIME_LABELS[rating] : "—";
      const ratingPill = rating
        ? `<span class="pill" style="background:${ratingColor}1a;color:${ratingColor};border:1px solid ${ratingColor}40">${esc(ratingLabel)}</span>`
        : "—";
      return `
        <tr class="${i % 2 === 0 ? "even" : "odd"}">
          <td style="font-weight:700;color:${PF_NAVY}">${esc(area)}</td>
          <td>${esc(t.current_vendor ?? "—")}</td>
          <td>${esc(t.current_solution ?? "—")}</td>
          <td>${ratingPill}</td>
          <td style="color:#475569;font-size:9pt">${esc(t.notes ?? "—")}</td>
        </tr>
      `;
    })
    .join("");

  // Quick TIME-rating roll-up so the customer sees the at-a-glance posture
  const tally = items.reduce<Record<string, number>>((acc, t) => {
    if (!t.time_rating) return acc;
    acc[t.time_rating] = (acc[t.time_rating] ?? 0) + 1;
    return acc;
  }, {});
  const tallyHtml = ["invest","tolerate","migrate","eliminate"]
    .map((k) => `
      <div style="text-align:center;flex:1">
        <div style="font-size:30pt;font-weight:900;color:${TIME_COLORS[k]};line-height:1">${tally[k] ?? 0}</div>
        <div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;margin-top:4px">${esc(TIME_LABELS[k])}</div>
      </div>
    `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(cust)} — Tech Stack Assessment</title>
  <link rel="stylesheet" href="https://use.typekit.net/dty1vuu.css"/>
  <style>${SHARED_CSS}</style>
</head>
<body>
<div class="page">
  ${printTip()}
  ${coverBlock({
    eyebrow: "Optimize",
    title: "Tech Stack Assessment",
    customerName: cust,
    meta: [
      { label: "Account Status", value: account.optimize_status ?? "—" },
      { label: "Areas Mapped",   value: String(items.length) },
      { label: "Issued",         value: formatDate(new Date().toISOString().slice(0,10)) },
    ],
    logoAbsolute: logo,
  })}

  <div style="display:flex;gap:20px;padding:20px 26px;background:${PF_GREY};border-left:6px solid ${PF_GREEN};margin-bottom:24px;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
    ${tallyHtml}
  </div>

  <p style="font-size:9.5pt;color:#475569;margin-bottom:18px;line-height:1.6">
    The Gartner TIME framework classifies each technology area by its strategic position. <strong>Invest</strong> represents critical, high-value areas; <strong>Tolerate</strong> covers stable, acceptable systems; <strong>Migrate</strong> identifies platforms approaching end-of-life or strategic replacement; <strong>Eliminate</strong> flags retired or redundant tooling.
  </p>

  ${items.length > 0 ? `
    <div class="section-heading"><div class="section-heading-text">Technology Areas</div></div>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:22%">Area</th>
          <th style="width:16%">Current Vendor</th>
          <th style="width:18%">Solution</th>
          <th style="width:14%">TIME Rating</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  ` : `<p style="color:#64748b;font-size:10pt;font-style:italic">No tech stack areas have been mapped yet.</p>`}

  ${footerBlock(logo)}
</div>
</body>
</html>`;
}

function buildAccountSummaryHtml(opts: {
  account: OptimizeAccount;
  assessment: ImpactAssessment | null;
  techStack: TechStackItem[];
  roadmap: RoadmapItem[];
}): string {
  const logo = logoAbsoluteUrl();
  const cust = customerName(opts.account);
  const a = opts.account;

  // Account header card
  const accountCard = `
    <div class="account-card">
      <div class="account-grid">
        <div><div class="account-cell-label">Optimize Status</div><div class="account-cell-value">${esc((a.optimize_status ?? "—").toUpperCase())}</div></div>
        <div><div class="account-cell-label">Completed</div><div class="account-cell-value">${esc(formatDate(a.graduated_at))}</div></div>
        <div><div class="account-cell-label">Next Review</div><div class="account-cell-value">${esc(a.next_review_date ?? "—")}</div></div>
        <div><div class="account-cell-label">Account Executive</div><div class="account-cell-value">${esc(a.customer_pf_ae_name ?? a.ae_name ?? "—")}</div></div>
        <div><div class="account-cell-label">Solution Architect</div><div class="account-cell-value">${esc(a.customer_pf_sa_name ?? a.sa_name ?? "—")}</div></div>
        <div><div class="account-cell-label">CSM</div><div class="account-cell-value">${esc(a.customer_pf_csm_name ?? a.csm_name ?? "—")}</div></div>
      </div>
    </div>
  `;

  // Latest assessment summary (compact form — just the score + section bars)
  const assessmentBlock = opts.assessment ? (() => {
    const ass = opts.assessment!;
    const band = ass.health_band ?? "at_risk";
    const bandColor = HEALTH_BAND_COLORS[band] ?? "#94a3b8";
    const bandLabel = HEALTH_BAND_LABELS[band] ?? band;
    const sectionBars = Object.entries(ass.section_scores ?? {})
      .map(([key, score]) => {
        const color =
          score >= 80 ? HEALTH_BAND_COLORS.realized_value :
          score >= 60 ? HEALTH_BAND_COLORS.emerging_value :
          score >= 40 ? HEALTH_BAND_COLORS.limited_value :
          HEALTH_BAND_COLORS.at_risk;
        return `
          <div class="score-row">
            <div class="score-row-head">
              <span class="score-row-label">${esc(SECTION_LABELS[key] ?? key)}</span>
              <span class="score-row-value" style="color:${color}">${score}</span>
            </div>
            <div class="score-bar"><div class="score-bar-fill" style="width:${score}%;background:${color}"></div></div>
          </div>
        `;
      }).join("");
    return `
      <div class="section-heading">
        <div class="section-heading-text">Latest Impact Assessment</div>
        <div class="section-heading-sub">Conducted ${esc(formatDate(ass.conducted_date))}${ass.conducted_by_name ? ` · ${esc(ass.conducted_by_name)}` : ""}</div>
      </div>
      <div class="headline">
        <div class="headline-score" style="color:${bandColor}">${ass.overall_score ?? "—"}</div>
        <div>
          <div class="headline-meta">Overall Score</div>
          <div class="headline-band" style="color:${bandColor}">${esc(bandLabel)}</div>
          ${ass.confidence_score != null ? `<div class="headline-conf">Confidence: ${ass.confidence_score}%</div>` : ""}
        </div>
        <div></div>
      </div>
      ${sectionBars}
    `;
  })() : `
    <div class="section-heading"><div class="section-heading-text">Latest Impact Assessment</div></div>
    <p style="color:#64748b;font-size:10pt;font-style:italic">No impact assessment has been conducted yet.</p>
  `;

  // Tech stack compact table
  const techRows = opts.techStack
    .map((t, i) => {
      const area = t.tech_area_label ?? TECH_AREA_LABELS[t.tech_area] ?? t.tech_area;
      const rating = t.time_rating;
      const ratingColor = rating ? TIME_COLORS[rating] : "#94a3b8";
      const ratingLabel = rating ? TIME_LABELS[rating] : "—";
      const ratingPill = rating
        ? `<span class="pill" style="background:${ratingColor}1a;color:${ratingColor};border:1px solid ${ratingColor}40">${esc(ratingLabel)}</span>`
        : "—";
      return `
        <tr class="${i % 2 === 0 ? "even" : "odd"}">
          <td style="font-weight:700;color:${PF_NAVY}">${esc(area)}</td>
          <td>${esc(t.current_vendor ?? "—")}</td>
          <td>${esc(t.current_solution ?? "—")}</td>
          <td>${ratingPill}</td>
        </tr>
      `;
    }).join("");
  const techBlock = opts.techStack.length > 0 ? `
    <div class="section-heading"><div class="section-heading-text">Tech Stack Snapshot</div></div>
    <table class="data-table">
      <thead>
        <tr><th style="width:30%">Area</th><th style="width:20%">Vendor</th><th style="width:30%">Solution</th><th>TIME</th></tr>
      </thead>
      <tbody>${techRows}</tbody>
    </table>
  ` : "";

  // Roadmap compact table — sorted by priority then status
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedRoadmap = [...opts.roadmap].sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
  const roadmapRows = sortedRoadmap
    .map((r, i) => `
      <tr class="${i % 2 === 0 ? "even" : "odd"}">
        <td style="font-weight:700;color:${PF_NAVY}">${esc(r.title)}</td>
        <td style="text-transform:capitalize">${esc(r.priority)}</td>
        <td style="text-transform:capitalize">${esc(r.status.replace(/_/g, " "))}</td>
        <td>${esc(r.target_date ?? "—")}</td>
      </tr>
    `).join("");
  const roadmapBlock = opts.roadmap.length > 0 ? `
    <div class="section-heading"><div class="section-heading-text">Roadmap</div></div>
    <table class="data-table">
      <thead>
        <tr><th>Item</th><th style="width:12%">Priority</th><th style="width:18%">Status</th><th style="width:18%">Target</th></tr>
      </thead>
      <tbody>${roadmapRows}</tbody>
    </table>
  ` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(cust)} — Account Summary</title>
  <link rel="stylesheet" href="https://use.typekit.net/dty1vuu.css"/>
  <style>${SHARED_CSS}</style>
</head>
<body>
<div class="page">
  ${printTip()}
  ${coverBlock({
    eyebrow: "Optimize",
    title: "Account Summary",
    customerName: cust,
    meta: [
      { label: "Issued",         value: formatDate(new Date().toISOString().slice(0,10)) },
      { label: "Optimize Status",value: a.optimize_status ?? "—" },
      { label: "Completed",      value: formatDate(a.graduated_at) },
    ],
    logoAbsolute: logo,
  })}

  ${accountCard}
  ${assessmentBlock}
  ${techBlock}
  ${roadmapBlock}

  ${footerBlock(logo)}
</div>
</body>
</html>`;
}

// ── React button components ─────────────────────────────────────────────────

type ButtonStyle = "primary" | "secondary";

function exportButton(label: string, onClick: () => void, style: ButtonStyle = "secondary") {
  const className = style === "primary" ? "ms-btn-primary" : "ms-btn-secondary";
  return (
    <button
      className={className}
      onClick={onClick}
      style={{ fontSize: 13, whiteSpace: "nowrap" }}
      title="Open a print-ready document in a new tab"
    >
      🖨 {label}
    </button>
  );
}

export function ExportImpactAssessmentButton({
  assessment,
  account,
}: {
  assessment: ImpactAssessment;
  account: OptimizeAccount;
}) {
  return exportButton("Export / Print", () => openPrintWindow(buildImpactAssessmentHtml(assessment, account)));
}

export function ExportTechStackButton({
  items,
  account,
}: {
  items: TechStackItem[];
  account: OptimizeAccount;
}) {
  return exportButton("Export / Print", () => openPrintWindow(buildTechStackHtml(items, account)));
}

export function ExportAccountSummaryButton({
  account,
  assessment,
  techStack,
  roadmap,
}: {
  account: OptimizeAccount;
  assessment: ImpactAssessment | null;
  techStack: TechStackItem[];
  roadmap: RoadmapItem[];
}) {
  return exportButton(
    "Export Account Summary",
    () => openPrintWindow(buildAccountSummaryHtml({ account, assessment, techStack, roadmap })),
    "primary",
  );
}
