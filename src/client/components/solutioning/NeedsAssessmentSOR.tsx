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

  const printStyles = `
    @media print {
      .no-print { display: none !important; }
      body { background: #fff !important; }
      .ms-card { box-shadow: none !important; border: 1px solid #e2e8f0 !important; }
    }
  `;

  return (
    <div>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />

      {/* Action bar */}
      <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <button className="ms-btn-secondary" onClick={onBack}>
          ← Edit Assessment
        </button>
        <button
          className="ms-btn-primary"
          onClick={() => window.print()}
          style={{ background: "#0b9aad" }}
        >
          Print / Generate SOR
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
        style={{ marginBottom: 20, borderLeft: `4px solid ${readinessInfo.color}` }}
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
      <div className="ms-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
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

            let display: string;
            if (fieldDef?.type === "repeater") {
              display = formatRepeater(val);
            } else {
              display = formatValue(fieldId, val);
            }

            return { label, display };
          })
          .filter(({ display }) => display !== "—");

        if (rows.length === 0) return null;

        return (
          <div key={section.title} className="ms-card" style={{ marginBottom: 16 }}>
            <h3
              style={{
                margin: "0 0 16px",
                fontSize: 13,
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: 10,
              }}
            >
              {section.title}
            </h3>
            <div style={{ display: "grid", gap: 12 }}>
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
      <div className="ms-card" style={{ marginTop: 20, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
        This document was generated by FusionFlow · Packet Fusion, Inc. · {today}
      </div>
    </div>
  );
}
