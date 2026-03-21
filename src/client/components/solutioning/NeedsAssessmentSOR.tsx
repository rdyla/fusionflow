import { type NeedsAssessment } from "../../lib/api";
import surveyJson from "../../assets/ci_needs_assessment_unified_v1.json";
import logoUrl from "../../assets/packetfusionlogo.png";

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldOption = { value: string; label: string };

type FieldDef = {
  id: string;
  type: string;
  label: string;
  options?: FieldOption[];
};

type SectionDef = {
  id: string;
  fields: FieldDef[];
};

// Build a flat map of field id → field definition for label lookups
const ALL_FIELDS = (surveyJson.sections as SectionDef[]).flatMap((s) => s.fields);
const FIELD_MAP: Record<string, FieldDef> = {};
for (const f of ALL_FIELDS) {
  FIELD_MAP[f.id] = f;
}

// ── Readiness colors ──────────────────────────────────────────────────────────

const READINESS_CONFIG: Record<string, { label: string; color: string }> = {
  ready:        { label: "Ready to Design",    color: "#22c55e" },
  mostly_ready: { label: "Mostly Ready",        color: "#0b9aad" },
  needs_work:   { label: "Needs Preparation",   color: "#f59e0b" },
  not_ready:    { label: "Not Ready",           color: "#d13438" },
};

// ── Value formatter ───────────────────────────────────────────────────────────

function formatValue(fieldId: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  const field = FIELD_MAP[fieldId];

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
    // Find field's source options via the raw JSON optionsSourceField
    const rawField = (surveyJson.sections as { fields: Array<{ id: string; optionsSourceField?: string }> }[])
      .flatMap((s) => s.fields)
      .find((f) => f.id === fieldId);
    if (rawField?.optionsSourceField) {
      const sourceF = FIELD_MAP[rawField.optionsSourceField];
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

// ── SOR section definition ────────────────────────────────────────────────────

type SorSectionDef = {
  title: string;
  fields: string[];
};

const SOR_SECTIONS: SorSectionDef[] = [
  {
    title: "Customer Goals & Success Outcomes",
    fields: [
      "business_goals",
      "top_3_priorities_ranked",
      "current_problems_to_solve",
      "success_90_days",
      "success_6_12_months",
    ],
  },
  {
    title: "In-Scope Teams & Coverage",
    fields: ["teams_in_scope", "estimated_user_count", "geographies_in_scope"],
  },
  {
    title: "Required Capabilities",
    fields: [
      "core_capabilities_required",
      "functional_must_haves",
      "reporting_requirements",
      "priority_insights",
    ],
  },
  {
    title: "Sales Playbook & Methodology Requirements",
    fields: [
      "current_sales_methodology_status",
      "current_methodologies",
      "methodology_elements_to_track",
    ],
  },
  {
    title: "CRM & Integration Requirements",
    fields: [
      "crm_in_use",
      "crm_integration_required_phase_1",
      "crm_objects_that_matter",
      "data_sync_to_crm",
      "data_sync_from_crm",
    ],
  },
  {
    title: "Customization Requirements",
    fields: [
      "custom_trackers_required",
      "tracker_types",
      "custom_scorecards_required",
      "scorecard_elements",
    ],
  },
  {
    title: "Security, Compliance & Governance",
    fields: [
      "recording_consent_requirements",
      "regional_recording_restrictions",
      "retention_requirements",
      "roles_allowed_to_access",
      "admin_only_access",
      "gdpr_or_data_residency",
    ],
  },
  {
    title: "Customer Responsibilities",
    fields: [
      "key_dependencies_before_design",
      "customer_prerequisites_before_implementation",
      "approval_criteria_for_sor",
    ],
  },
  {
    title: "Assumptions & Exclusions",
    fields: ["phase_1_vs_future_scope"],
  },
];

// ── Repeater formatter ────────────────────────────────────────────────────────

function formatRepeater(val: unknown): string {
  if (!Array.isArray(val) || val.length === 0) return "—";
  return val
    .map((row, i) => {
      if (typeof row !== "object" || row === null) return String(row);
      const parts = Object.entries(row as Record<string, string>)
        .filter(([, v]) => v)
        .map(([k, v]) => {
          const prop = FIELD_MAP[k];
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

function buildSorHtml(
  answers: Record<string, unknown>,
  customerName: string,
  solutionType: string,
  score: number,
  status: string,
  logo: string,
): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const readinessInfo = READINESS_CONFIG[status] ?? READINESS_CONFIG.not_ready;

  // Resolve absolute logo URL for the new window
  const logoAbsolute = logo.startsWith("http") ? logo : `${window.location.origin}${logo}`;

  const sectionHtml = SOR_SECTIONS.map((section) => {
    const rows = section.fields
      .map((fieldId) => {
        const fieldDef = FIELD_MAP[fieldId];
        const label = fieldDef?.label ?? fieldId;
        const val = answers[fieldId];
        const display = fieldDef?.type === "repeater" ? formatRepeater(val) : formatValue(fieldId, val);
        return { label, display };
      })
      .filter(({ display }) => display !== "—");

    if (rows.length === 0) return "";

    const rowsHtml = rows
      .map(({ label, display }) =>
        `<tr><td class="lc">${esc(label)}</td><td class="vc">${esc(display).replace(/\n/g, "<br/>")}</td></tr>`,
      )
      .join("");

    return `
      <div class="req-section">
        <div class="req-section-header">${esc(section.title)}</div>
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
      font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      color: #1e293b;
      background: #fff;
    }
    .page { max-width: 820px; margin: 0 auto; padding: 48px 56px; }

    /* ── Cover ───────────────────────────────── */
    .cover {
      text-align: center;
      padding-bottom: 40px;
      margin-bottom: 40px;
      border-bottom: 3px solid #03395f;
    }
    .cover-logo { height: 52px; width: auto; margin-bottom: 32px; }
    .cover-type {
      font-size: 28pt; font-weight: 800; color: #03395f;
      letter-spacing: -0.01em; margin-bottom: 4px;
    }
    .cover-sor-title {
      font-size: 18pt; font-weight: 300; color: #03395f;
      margin-bottom: 24px; letter-spacing: 0.04em;
    }
    .cover-for {
      font-size: 13pt; color: #64748b; margin-bottom: 8px;
    }
    .cover-customer {
      font-size: 20pt; font-weight: 700; color: #1e293b;
      margin-bottom: 28px;
    }
    .cover-tagline {
      font-size: 9pt; font-weight: 700; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 0.14em;
      margin-bottom: 6px;
    }
    .cover-prepared {
      font-size: 9pt; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 0.1em;
    }

    /* ── Readiness badge ─────────────────────── */
    .readiness-row {
      display: flex; align-items: center; gap: 16px;
      background: #f8fafc;
      border: 1px solid #dde4ef;
      border-left: 5px solid ${readinessInfo.color};
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 32px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .readiness-circle {
      width: 56px; height: 56px; border-radius: 50%;
      background: ${readinessInfo.color};
      color: #fff; font-size: 18pt; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .readiness-label { font-size: 14pt; font-weight: 700; color: #1e293b; }
    .readiness-sub { font-size: 9pt; color: #64748b; margin-top: 3px; }

    /* ── Prose sections (1.1 – 1.3) ─────────── */
    .prose-section { margin-bottom: 28px; page-break-inside: avoid; }
    .prose-section h2 {
      font-size: 12pt; font-weight: 700; color: #03395f;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid #dde4ef;
    }
    .prose-section p {
      font-size: 10.5pt; color: #334155; line-height: 1.65;
    }

    /* ── 1.4 Requirements heading ────────────── */
    .requirements-heading {
      font-size: 13pt; font-weight: 700; color: #03395f;
      margin-bottom: 20px;
      padding-bottom: 8px;
      border-bottom: 2px solid #03395f;
    }

    /* ── Requirement section cards ───────────── */
    .req-section {
      border: 1px solid #dde4ef;
      border-radius: 10px;
      margin-bottom: 20px;
      page-break-inside: avoid;
      overflow: hidden;
    }
    .req-section-header {
      background: #03395f;
      color: #fff;
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 9px 16px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table { width: 100%; border-collapse: collapse; }
    .lc {
      width: 36%;
      font-size: 10pt; font-weight: 600; color: #475569;
      padding: 8px 12px 8px 16px;
      vertical-align: top;
      border-bottom: 1px solid #f1f5f9;
    }
    .vc {
      font-size: 10pt; color: #1e293b; line-height: 1.55;
      padding: 8px 16px 8px 8px;
      vertical-align: top;
      border-bottom: 1px solid #f1f5f9;
    }
    tr:last-child .lc, tr:last-child .vc { border-bottom: none; }
    tr:nth-child(even) .lc,
    tr:nth-child(even) .vc {
      background: #f8fafc;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Sign-off block ──────────────────────── */
    .signoff {
      margin-top: 36px;
      border: 1px solid #dde4ef;
      border-radius: 10px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .signoff-header {
      background: #021e34;
      color: #fff;
      font-size: 9pt; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.1em;
      padding: 9px 16px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .signoff-body { padding: 16px 20px; }
    .signoff-body p { font-size: 10pt; color: #475569; line-height: 1.6; margin-bottom: 20px; }
    .sig-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
      margin-top: 8px;
    }
    .sig-block {}
    .sig-line {
      border-bottom: 1px solid #475569;
      height: 36px;
      margin-bottom: 6px;
    }
    .sig-label { font-size: 8.5pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; }

    /* ── Footer ──────────────────────────────── */
    .footer {
      margin-top: 32px;
      padding-top: 14px;
      border-top: 1px solid #dde4ef;
      font-size: 8pt;
      color: #94a3b8;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .footer img { height: 18px; width: auto; opacity: 0.45; }

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
    <img class="cover-logo" src="${logoAbsolute}" alt="Packet Fusion" onerror="this.style.display='none'"/>
    <div class="cover-type">${esc(solutionType)}</div>
    <div class="cover-sor-title">Statement of Requirements</div>
    <div class="cover-for">For</div>
    <div class="cover-customer">${esc(customerName)}</div>
    <div class="cover-tagline">Trusted Advisor Project &nbsp;·&nbsp; Statement of Requirements</div>
    <div class="cover-prepared">Prepared by: Packet Fusion, Inc.</div>
  </div>

  <!-- Readiness -->
  <div class="readiness-row">
    <div class="readiness-circle">${score}</div>
    <div>
      <div class="readiness-label">${esc(readinessInfo.label)}</div>
      <div class="readiness-sub">Pre-design readiness score &mdash; based on needs assessment</div>
    </div>
  </div>

  <!-- 1.1 Introduction -->
  <div class="prose-section">
    <h2>1.1 &nbsp; Introduction</h2>
    <p>${esc(customerName)} has engaged Packet Fusion, Inc. to investigate and understand their needs and then bring the industry best next-generation ${esc(solutionType)} offerings for evaluation and procurement.</p>
  </div>

  <!-- 1.2 Scope & Objectives -->
  <div class="prose-section">
    <h2>1.2 &nbsp; Scope &amp; Objectives</h2>
    <p>The purpose of this document is to establish the desired functionality to be considered for the ${esc(solutionType)} solution to be evaluated by ${esc(customerName)}. During several meetings and remote sessions, Packet Fusion has gathered the following business, workflow, and technical requirements.</p>
  </div>

  <!-- 1.3 Overview -->
  <div class="prose-section">
    <h2>1.3 &nbsp; Overview</h2>
    <p>${esc(customerName)} is looking for a robust and reliable ${esc(solutionType)} platform that will enhance sales execution, improve coaching effectiveness, and deliver measurable business outcomes through AI-driven conversation intelligence.</p>
  </div>

  <!-- 1.4 Requirements -->
  <div class="requirements-heading">1.4 &nbsp; Requirements</div>
  ${sectionHtml}

  <!-- Customer Sign-Off -->
  <div class="signoff">
    <div class="signoff-header">Customer Approval &amp; Sign-Off</div>
    <div class="signoff-body">
      <p>By signing below, the undersigned acknowledges that the requirements captured in this Statement of Requirements are accurate and complete, and authorizes Packet Fusion, Inc. to proceed with solution design and formal vendor quoting.</p>
      <div class="sig-grid">
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-label">Customer Signature</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-label">Printed Name &amp; Title</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-label">Date</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-label">Packet Fusion Representative</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <img src="${logoAbsolute}" alt="Packet Fusion" onerror="this.style.display='none'"/>
    <span>Statement of Requirements &nbsp;&middot;&nbsp; ${esc(customerName)} &nbsp;&middot;&nbsp; ${today}</span>
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
  onBack: () => void;
  onDelete: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function NeedsAssessmentSOR({
  assessment,
  customerName,
  solutionType,
  onBack,
  onDelete,
}: Props) {
  const answers = assessment.answers;
  const status = assessment.readiness_status ?? "not_ready";
  const score = assessment.readiness_score ?? 0;
  const readinessInfo = READINESS_CONFIG[status] ?? READINESS_CONFIG.not_ready;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function openPrintWindow() {
    const html = buildSorHtml(answers, customerName, solutionType, score, status, logoUrl);
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
        <button
          className="ms-btn-secondary"
          onClick={onDelete}
          style={{ marginLeft: "auto", color: "#d13438", borderColor: "#d13438" }}
        >
          Delete Assessment
        </button>
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
            <div style={{ fontSize: 13, color: "#64748b" }}>Conversational Intelligence — Pre-Design Assessment</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13, color: "#64748b" }}>
            <div><strong>Customer:</strong> {customerName}</div>
            <div><strong>Platform:</strong> {solutionType}</div>
            <div><strong>Date:</strong> {today}</div>
          </div>
        </div>
      </div>

      {/* SOR sections */}
      {SOR_SECTIONS.map((section) => {
        const rows = section.fields
          .map((fieldId) => {
            const fieldDef = FIELD_MAP[fieldId];
            const label = fieldDef?.label ?? fieldId;
            const val = answers[fieldId];
            const display = fieldDef?.type === "repeater" ? formatRepeater(val) : formatValue(fieldId, val);
            return { label, display };
          })
          .filter(({ display }) => display !== "—");

        if (rows.length === 0) return null;

        return (
          <div key={section.title} className="ms-card" style={{ marginBottom: 16, padding: "20px 24px" }}>
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
        This document was generated by FusionFlow · Packet Fusion, Inc. · {today}
      </div>
    </div>
  );
}
