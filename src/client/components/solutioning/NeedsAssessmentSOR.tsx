import { type NeedsAssessment } from "../../lib/api";
import surveyJson from "../../assets/ci_needs_assessment_unified_v1.json";

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

function buildSorHtml(
  answers: Record<string, unknown>,
  customerName: string,
  solutionType: string,
  score: number,
  status: string,
): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const readinessInfo = READINESS_CONFIG[status] ?? READINESS_CONFIG.not_ready;

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
      .map(
        ({ label, display }) => `
        <tr>
          <td class="label-cell">${label}</td>
          <td class="value-cell">${display.replace(/\n/g, "<br/>")}</td>
        </tr>`,
      )
      .join("");

    return `
      <div class="sor-section">
        <h3>${section.title}</h3>
        <table><tbody>${rowsHtml}</tbody></table>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${customerName} — Statement of Requirements</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      color: #1e293b;
      background: #fff;
      padding: 0;
    }
    .page { max-width: 820px; margin: 0 auto; padding: 40px 48px; }

    /* Cover header */
    .cover {
      border-bottom: 3px solid #03395f;
      padding-bottom: 28px;
      margin-bottom: 32px;
    }
    .cover-brand {
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #03395f;
      margin-bottom: 10px;
    }
    .cover-title {
      font-size: 22pt;
      font-weight: 700;
      color: #03395f;
      margin-bottom: 4px;
    }
    .cover-subtitle {
      font-size: 11pt;
      color: #64748b;
      margin-bottom: 20px;
    }
    .cover-meta {
      display: flex;
      gap: 40px;
      font-size: 10pt;
      color: #475569;
    }
    .cover-meta .meta-item { display: flex; flex-direction: column; gap: 2px; }
    .cover-meta .meta-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; }
    .cover-meta .meta-value { font-size: 11pt; font-weight: 600; color: #1e293b; }

    /* Readiness badge */
    .readiness-bar {
      display: flex;
      align-items: center;
      gap: 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid ${readinessInfo.color};
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 32px;
    }
    .readiness-score {
      width: 52px; height: 52px; border-radius: 50%;
      background: ${readinessInfo.color};
      color: #fff;
      font-size: 17pt; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .readiness-label { font-size: 14pt; font-weight: 700; color: #1e293b; }
    .readiness-sub { font-size: 9pt; color: #64748b; margin-top: 2px; }

    /* SOR sections */
    .sor-section {
      margin-bottom: 28px;
      page-break-inside: avoid;
    }
    .sor-section h3 {
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #03395f;
      padding-bottom: 8px;
      border-bottom: 1px solid #dde4ef;
      margin-bottom: 12px;
    }
    table { width: 100%; border-collapse: collapse; }
    .label-cell {
      width: 38%;
      font-size: 10pt;
      font-weight: 600;
      color: #475569;
      padding: 7px 12px 7px 0;
      vertical-align: top;
    }
    .value-cell {
      font-size: 10pt;
      color: #1e293b;
      padding: 7px 0;
      vertical-align: top;
      line-height: 1.5;
    }
    tr:nth-child(even) td { background: #f8fafc; padding-left: 8px; padding-right: 8px; border-radius: 4px; }

    /* Footer */
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #dde4ef;
      font-size: 8.5pt;
      color: #94a3b8;
      text-align: center;
    }

    /* Intro text */
    .intro {
      font-size: 10.5pt;
      color: #475569;
      line-height: 1.6;
      margin-bottom: 28px;
      padding: 14px 18px;
      background: #f0f9ff;
      border-left: 3px solid #0b9aad;
      border-radius: 0 6px 6px 0;
    }

    @media print {
      body { padding: 0; }
      .page { padding: 24px 32px; }
      .readiness-score { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .readiness-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="cover">
      <div class="cover-brand">Packet Fusion, Inc. — Trusted Advisor Program</div>
      <div class="cover-title">Statement of Requirements</div>
      <div class="cover-subtitle">Conversational Intelligence — Pre-Design Assessment</div>
      <div class="cover-meta">
        <div class="meta-item">
          <span class="meta-label">Customer</span>
          <span class="meta-value">${customerName}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Platform</span>
          <span class="meta-value">${solutionType}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Date</span>
          <span class="meta-value">${today}</span>
        </div>
      </div>
    </div>

    <div class="readiness-bar">
      <div class="readiness-score">${score}</div>
      <div>
        <div class="readiness-label">${readinessInfo.label}</div>
        <div class="readiness-sub">Overall Readiness Score — based on pre-design assessment</div>
      </div>
    </div>

    <div class="intro">
      ${customerName} has engaged Packet Fusion, Inc. to evaluate and deploy a Conversational Intelligence solution.
      This document captures the business requirements, technical environment, and success criteria gathered during
      the pre-design assessment and serves as the agreed Statement of Requirements for ${customerName}'s approval
      prior to formal quoting.
    </div>

    ${sectionHtml}

    <div class="footer">
      This Statement of Requirements was prepared by Packet Fusion, Inc. · ${today} · Generated by FusionFlow360
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
    const html = buildSorHtml(answers, customerName, solutionType, score, status);
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
