import { type NeedsAssessment } from "../../lib/api";
import logoUrl from "../../assets/packetfusionlogo.png";

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldOption = { value: string; label: string };

type FieldDef = {
  id: string;
  type: string;
  label: string;
  options?: FieldOption[];
  optionsSourceField?: string;
};

type SectionDef = {
  id: string;
  title?: string;
  fields: FieldDef[];
};

type SorSectionDef = {
  id: string;
  title: string;
  sourceFields: string[];
};

type SurveyJson = {
  sections: SectionDef[];
  statementOfRequirements?: {
    sections: SorSectionDef[];
  };
  [key: string]: unknown;
};

// ── Readiness colors ──────────────────────────────────────────────────────────

const READINESS_CONFIG: Record<string, { label: string; color: string }> = {
  ready:               { label: "Ready to Design",    color: "#22c55e" },
  mostly_ready:        { label: "Mostly Ready",        color: "#0b9aad" },
  needs_work:          { label: "Needs Preparation",   color: "#f59e0b" },
  not_ready:           { label: "Not Ready",           color: "#d13438" },
  conditionally_ready: { label: "Conditionally Ready", color: "#f59e0b" },
};

// ── Value formatter ───────────────────────────────────────────────────────────

function formatValue(fieldId: string, val: unknown, fieldMap: Record<string, FieldDef>): string {
  if (val === null || val === undefined || val === "") return "—";
  const field = fieldMap[fieldId];

  if (Array.isArray(val)) {
    if (val.length === 0) return "—";
    // Look up labels if we have options
    if (field?.options) {
      const labelMap: Record<string, string> = {};
      for (const o of field.options) labelMap[o.value] = o.label;
      return val.map((v) => labelMap[v as string] ?? v).join(", ");
    }
    return val.join(", ");
  }

  if (typeof val === "object" && val !== null) {
    // ranked_select: { value: rank }
    const ranked = val as Record<string, number>;
    const entries = Object.entries(ranked).sort((a, b) => a[1] - b[1]);
    if (entries.length === 0) return "—";
    const labels: Record<string, string> = {};
    if (field?.optionsSourceField) {
      const sourceF = fieldMap[field.optionsSourceField];
      if (sourceF?.options) {
        for (const o of sourceF.options) labels[o.value] = o.label;
      }
    }
    const ordinals = ["1st", "2nd", "3rd"];
    return entries
      .slice(0, 3)
      .map(([v, r]) => `${ordinals[(r - 1)] ?? r + "."}: ${labels[v] ?? v}`)
      .join(", ");
  }

  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (val === "yes") return "Yes";
  if (val === "no") return "No";

  // Look up label if single_select
  if (field?.options) {
    const found = field.options.find((o) => o.value === val);
    if (found) return found.label;
  }

  return String(val);
}

// ── Repeater formatter ────────────────────────────────────────────────────────

function formatRepeater(val: unknown, fieldMap: Record<string, FieldDef>): string {
  if (!Array.isArray(val) || val.length === 0) return "—";
  return val
    .map((row, i) => {
      if (typeof row !== "object" || row === null) return String(row);
      const parts = Object.entries(row as Record<string, string>)
        .filter(([, v]) => v)
        .map(([k, v]) => {
          const prop = fieldMap[k];
          const label = prop?.label ?? k;
          return `${label}: ${v}`;
        });
      return `${i + 1}. ${parts.join(" | ")}`;
    })
    .join("\n");
}

// ── Print window generator ────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Accent colors cycling across requirement sections
const ACCENTS = ["#0b9aad", "#03395f", "#0284c7", "#0e7490", "#1d4ed8", "#6366f1", "#0891b2"];

function buildSorHtml(
  answers: Record<string, unknown>,
  customerName: string,
  solutionType: string,
  logo: string,
  sorSections: SorSectionDef[],
  fieldMap: Record<string, FieldDef>,
): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const logoAbsolute = logo.startsWith("http") ? logo : `${window.location.origin}${logo}`;

  const sectionHtml = sorSections.map((section, idx) => {
    const rows = section.sourceFields
      .map((fieldId) => {
        const fieldDef = fieldMap[fieldId];
        const label = fieldDef?.label ?? fieldId;
        const val = answers[fieldId];
        const display = fieldDef?.type === "repeater" ? formatRepeater(val, fieldMap) : formatValue(fieldId, val, fieldMap);
        return { label, display };
      })
      .filter(({ display }) => display !== "—");

    if (rows.length === 0) return "";

    const accent = ACCENTS[idx % ACCENTS.length];
    const rowsHtml = rows
      .map(({ label, display }, i) =>
        `<tr class="${i === rows.length - 1 ? "last-row" : ""}">
          <td class="lc">${esc(label)}</td>
          <td class="vc">${esc(display).replace(/\n/g, "<br/>")}</td>
        </tr>`,
      )
      .join("");

    return `
      <div class="req-section" style="border-left-color:${accent}">
        <div class="req-section-title" style="color:${accent}">${esc(section.title)}</div>
        <table><tbody>${rowsHtml}</tbody></table>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(customerName)} — Statement of Requirements</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, Arial, sans-serif;
      font-size: 10.5pt;
      color: #1e293b;
      background: #fff;
    }
    .page { max-width: 820px; margin: 0 auto; padding: 48px 56px; }

    /* ── Cover ───────────────────────────────── */
    .cover {
      padding-bottom: 36px;
      margin-bottom: 36px;
      border-bottom: 1px solid #e2e8f0;
    }
    .cover-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
    }
    .cover-logo { height: 44px; width: auto; }
    .cover-date { font-size: 9pt; color: #94a3b8; text-align: right; margin-top: 4px; }
    .cover-rule {
      height: 4px;
      background: linear-gradient(90deg, #03395f 0%, #0b9aad 50%, #63c1ea 100%);
      margin-bottom: 28px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .cover-type {
      font-size: 9pt; font-weight: 700; color: #0b9aad;
      text-transform: uppercase; letter-spacing: 0.14em;
      margin-bottom: 8px;
    }
    .cover-title {
      font-size: 26pt; font-weight: 800; color: #03395f;
      letter-spacing: -0.02em; line-height: 1.1;
      margin-bottom: 6px;
    }
    .cover-for { font-size: 11pt; color: #64748b; margin-bottom: 4px; }
    .cover-customer { font-size: 17pt; font-weight: 700; color: #1e293b; margin-bottom: 20px; }
    .cover-meta {
      display: flex; gap: 0;
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
    }
    .cover-meta-item {
      flex: 1;
      padding-right: 20px;
      border-right: 1px solid #e2e8f0;
      margin-right: 20px;
    }
    .cover-meta-item:last-child { border-right: none; margin-right: 0; }
    .cover-meta-label { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 3px; }
    .cover-meta-value { font-size: 10pt; font-weight: 600; color: #334155; }

    /* ── Prose sections ──────────────────────── */
    .prose-section { margin-bottom: 24px; page-break-inside: avoid; }
    .prose-heading {
      font-size: 9pt; font-weight: 700; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 0.12em;
      margin-bottom: 6px;
    }
    .prose-section p { font-size: 10pt; color: #475569; line-height: 1.7; }

    /* ── Requirements section header ─────────── */
    .requirements-heading {
      display: flex; align-items: center; gap: 12px;
      margin: 32px 0 20px;
    }
    .requirements-heading-text {
      font-size: 11pt; font-weight: 800; color: #03395f;
      text-transform: uppercase; letter-spacing: 0.08em;
      white-space: nowrap;
    }
    .requirements-heading-rule {
      flex: 1; height: 2px;
      background: linear-gradient(90deg, #03395f, transparent);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Requirement sections ────────────────── */
    .req-section {
      border-left: 3px solid #0b9aad;
      margin-bottom: 24px;
      page-break-inside: avoid;
      padding-left: 16px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .req-section-title {
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 10px;
    }
    table { width: 100%; border-collapse: collapse; }
    .lc {
      width: 34%;
      font-size: 9.5pt; font-weight: 600; color: #64748b;
      padding: 6px 16px 6px 0;
      vertical-align: top;
      border-bottom: 1px solid #f1f5f9;
    }
    .vc {
      font-size: 9.5pt; color: #1e293b; line-height: 1.6;
      padding: 6px 0;
      vertical-align: top;
      border-bottom: 1px solid #f1f5f9;
    }
    .last-row .lc, .last-row .vc { border-bottom: none; }

    /* ── Sign-off ─────────────────────────────── */
    .signoff {
      margin-top: 40px;
      page-break-inside: avoid;
    }
    .signoff-heading {
      display: flex; align-items: center; gap: 12px;
      margin-bottom: 16px;
    }
    .signoff-heading-text {
      font-size: 11pt; font-weight: 800; color: #03395f;
      text-transform: uppercase; letter-spacing: 0.08em;
      white-space: nowrap;
    }
    .signoff-heading-rule {
      flex: 1; height: 2px;
      background: linear-gradient(90deg, #03395f, transparent);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .signoff-body p { font-size: 9.5pt; color: #64748b; line-height: 1.6; margin-bottom: 24px; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px 40px; }
    .sig-line { border-bottom: 1px solid #cbd5e1; height: 40px; margin-bottom: 5px; }
    .sig-label { font-size: 7.5pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; }

    /* ── Footer ──────────────────────────────── */
    .footer {
      margin-top: 36px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-size: 7.5pt;
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .footer img { height: 16px; width: auto; opacity: 0.5; }

    /* ── Print tip (screen only) ─────────────── */
    .print-tip {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 10px 16px;
      margin-bottom: 24px;
      font-size: 9.5pt;
      color: #92400e;
      display: flex;
      align-items: center;
      gap: 10px;
    }
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
    <div class="cover-type">${esc(solutionType)}</div>
    <div class="cover-title">Statement of<br/>Requirements</div>
    <div class="cover-for">Prepared for</div>
    <div class="cover-customer">${esc(customerName)}</div>
    <div class="cover-meta">
      <div class="cover-meta-item">
        <div class="cover-meta-label">Platform</div>
        <div class="cover-meta-value">${esc(solutionType)}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Prepared by</div>
        <div class="cover-meta-value">Packet Fusion, Inc.</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Document Type</div>
        <div class="cover-meta-value">Trusted Advisor Program</div>
      </div>
    </div>
  </div>

  <!-- 1.1 Introduction -->
  <div class="prose-section">
    <div class="prose-heading">1.1 &nbsp; Introduction</div>
    <p>${esc(customerName)} has engaged Packet Fusion, Inc. to investigate and understand their needs and then bring the industry best next-generation ${esc(solutionType)} offerings for evaluation and procurement.</p>
  </div>

  <!-- 1.2 Scope & Objectives -->
  <div class="prose-section">
    <div class="prose-heading">1.2 &nbsp; Scope &amp; Objectives</div>
    <p>The purpose of this document is to establish the desired functionality to be considered for the ${esc(solutionType)} solution to be evaluated by ${esc(customerName)}. During several meetings and remote sessions, Packet Fusion has gathered the following business, workflow, and technical requirements.</p>
  </div>

  <!-- 1.3 Overview -->
  <div class="prose-section">
    <div class="prose-heading">1.3 &nbsp; Overview</div>
    <p>${esc(customerName)} is looking for a robust and reliable ${esc(solutionType)} solution that will improve customer experience, operational efficiency, and deliver measurable business outcomes.</p>
  </div>

  <!-- 1.4 Requirements -->
  <div class="requirements-heading">
    <div class="requirements-heading-text">1.4 &nbsp; Requirements</div>
    <div class="requirements-heading-rule"></div>
  </div>
  ${sectionHtml}

  <!-- Sign-Off -->
  <div class="signoff">
    <div class="signoff-heading">
      <div class="signoff-heading-text">Customer Approval &amp; Sign-Off</div>
      <div class="signoff-heading-rule"></div>
    </div>
    <div class="signoff-body">
      <p>By signing below, the undersigned acknowledges that the requirements captured in this Statement of Requirements are accurate and complete, and authorizes Packet Fusion, Inc. to proceed with solution design and formal vendor quoting.</p>
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
    <span>${esc(customerName)} &nbsp;&middot;&nbsp; Statement of Requirements &nbsp;&middot;&nbsp; ${today}</span>
    <span>Packet Fusion, Inc.</span>
  </div>

</div>
</body>
</html>`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  assessment: NeedsAssessment;
  customerName: string;
  solutionType: string;
  surveyJson: SurveyJson;
  onBack: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function NeedsAssessmentSOR({
  assessment,
  customerName,
  solutionType,
  surveyJson,
  onBack,
  onDelete,
  canDelete = true,
}: Props) {
  // Build field map and SOR sections from surveyJson
  const allFields = (surveyJson.sections as SectionDef[]).flatMap((s) => s.fields);
  const fieldMap: Record<string, FieldDef> = {};
  for (const f of allFields) {
    fieldMap[f.id] = f;
  }
  // Auto-generate SOR sections from survey sections when statementOfRequirements is absent
  const sorSections: SorSectionDef[] = surveyJson.statementOfRequirements
    ? surveyJson.statementOfRequirements.sections
    : (surveyJson.sections as SectionDef[]).map((s) => ({
        id: s.id,
        title: s.title ?? s.id,
        sourceFields: s.fields.filter((f) => f.type !== "info").map((f) => f.id),
      }));

  const answers = assessment.answers;
  const status = assessment.readiness_status ?? "not_ready";
  const score = assessment.readiness_score ?? 0;
  const readinessInfo = READINESS_CONFIG[status] ?? READINESS_CONFIG.not_ready;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function openPrintWindow() {
    const html = buildSorHtml(answers, customerName, solutionType, logoUrl, sorSections, fieldMap);
    const win = window.open("", "_blank", "width=900,height=700");
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
        <button className="ms-btn-secondary" onClick={onBack}>
          ← Edit Assessment
        </button>
        <button
          className="ms-btn-primary"
          onClick={openPrintWindow}
          style={{ background: "#0b9aad" }}
        >
          Export / Print SOR
        </button>
        {canDelete && (
          <button
            className="ms-btn-secondary"
            onClick={onDelete}
            style={{ marginLeft: "auto", color: "#d13438", borderColor: "#d13438" }}
          >
            Delete Assessment
          </button>
        )}
      </div>

      {/* Readiness banner */}
      <div
        className="ms-card"
        style={{ marginBottom: 20, padding: "16px 20px", borderLeft: `4px solid ${readinessInfo.color}` }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              background: readinessInfo.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 20,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {score}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1e293b" }}>{readinessInfo.label}</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>Overall Readiness Score</div>
          </div>
        </div>
      </div>

      {/* SOR header */}
      <div className="ms-card" style={{ marginBottom: 20, padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#03395f", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              Packet Fusion, Inc.
            </div>
            <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#1e293b" }}>
              Statement of Requirements
            </h2>
            <div style={{ fontSize: 13, color: "#64748b" }}>{solutionType} — Pre-Design Assessment</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13, color: "#64748b" }}>
            <div><strong>Customer:</strong> {customerName}</div>
            <div><strong>Platform:</strong> {solutionType}</div>
            <div><strong>Date:</strong> {today}</div>
          </div>
        </div>
      </div>

      {/* SOR sections */}
      {sorSections.map((section) => {
        const rows = section.sourceFields
          .map((fieldId) => {
            const fieldDef = fieldMap[fieldId];
            const label = fieldDef?.label ?? fieldId;
            const val = answers[fieldId];
            const display = fieldDef?.type === "repeater" ? formatRepeater(val, fieldMap) : formatValue(fieldId, val, fieldMap);
            return { label, display };
          })
          .filter(({ display }) => display !== "—");

        if (rows.length === 0) return null;

        return (
          <div key={section.id} className="ms-card" style={{ marginBottom: 16, padding: "20px 24px" }}>
            <h3
              style={{
                margin: "0 0 14px",
                fontSize: 11,
                fontWeight: 700,
                color: "#03395f",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: 10,
              }}
            >
              {section.title}
            </h3>
            <div style={{ display: "grid", gap: 10 }}>
              {rows.map(({ label, display }) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, alignItems: "start" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>{label}</span>
                  <span style={{ fontSize: 13, color: "#1e293b", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{display}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Footer */}
      <div style={{ marginTop: 20, fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>
        This document was generated by CloudConnect by Packet Fusion, Inc. · {today}
      </div>
    </div>
  );
}
