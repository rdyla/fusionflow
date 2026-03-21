import { useState } from "react";
import type { ImpactAssessment } from "../../lib/api";

interface Props {
  assessment: ImpactAssessment;
  previousAssessment?: ImpactAssessment;
  onBack: () => void;
  onDelete: () => void;
}

const HEALTH_BAND_COLORS: Record<string, string> = {
  at_risk: "#d13438",
  limited_value: "#f59e0b",
  emerging_value: "#0b9aad",
  realized_value: "#22c55e",
};

const HEALTH_BAND_LABELS: Record<string, string> = {
  at_risk: "At Risk",
  limited_value: "Limited Value",
  emerging_value: "Emerging Value",
  realized_value: "Realized Value",
};

const SECTION_LABELS: Record<string, string> = {
  adoption: "Adoption & Usage",
  operationalImpact: "Operational Impact",
  experienceImpact: "Experience & Outcome Impact",
  aiAutomation: "AI & Automation",
  satisfaction: "Satisfaction & Next Steps",
};

const SOLUTION_TYPE_LABELS: Record<string, string> = {
  ucaas: "UCaaS",
  ccaas: "CCaaS / Contact Center",
  ci: "Conversational Intelligence",
  virtual_agent: "Virtual Agent",
};

const VALUE_DRIVER_LABELS: Record<string, string> = {
  training: "Training",
  feature_enablement: "Feature enablement",
  integrations: "Integrations",
  reporting_analytics: "Reporting / analytics",
  workflow_optimization: "Workflow optimization",
  ai_tuning: "AI tuning",
  change_management: "Change management",
};

function getHealthBandForScore(score: number): string {
  if (score >= 80) return "realized_value";
  if (score >= 60) return "emerging_value";
  if (score >= 40) return "limited_value";
  return "at_risk";
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = HEALTH_BAND_COLORS[getHealthBandForScore(score)] ?? "#94a3b8";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "#475569" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{score}</span>
      </div>
      <div style={{ height: 6, background: "rgba(0,0,0,0.06)", borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${score}%`,
            background: color,
            borderRadius: 4,
            transition: "width 0.4s",
          }}
        />
      </div>
    </div>
  );
}

export default function ImpactAssessmentDetail({ assessment, previousAssessment, onBack, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const healthColor = HEALTH_BAND_COLORS[assessment.health_band ?? ""] ?? "#94a3b8";
  const healthLabel = HEALTH_BAND_LABELS[assessment.health_band ?? ""] ?? assessment.health_band ?? "—";

  const delta = previousAssessment?.overall_score != null && assessment.overall_score != null
    ? assessment.overall_score - previousAssessment.overall_score
    : null;

  const biggestWin = assessment.answers?.biggest_win as string | undefined;
  const biggestChallenge = assessment.answers?.biggest_challenge as string | undefined;
  const nextDrivers = assessment.answers?.next_30_60_day_value_drivers as string[] | undefined;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 20 }}
      >
        ← Back to Assessments
      </button>

      {/* Header card */}
      <div className="ms-card" style={{ padding: "24px 28px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <span
                className="ms-badge"
                style={{
                  background: `${healthColor}1a`,
                  color: healthColor,
                  border: `1px solid ${healthColor}40`,
                  fontWeight: 700,
                  fontSize: 13,
                  padding: "4px 12px",
                }}
              >
                {healthLabel}
              </span>
              {assessment.solution_types.map((t) => (
                <span
                  key={t}
                  className="ms-badge"
                  style={{ background: "rgba(99,193,234,0.1)", color: "#63c1ea", border: "1px solid rgba(99,193,234,0.25)" }}
                >
                  {SOLUTION_TYPE_LABELS[t] ?? t}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              {assessment.conducted_date}
              {assessment.conducted_by_name && (
                <span> &bull; by {assessment.conducted_by_name}</span>
              )}
            </div>
          </div>

          {/* Scores */}
          <div style={{ display: "flex", gap: 24 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 42, fontWeight: 800, color: healthColor, lineHeight: 1 }}>
                {assessment.overall_score ?? "—"}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>
                Overall Score
              </div>
            </div>
            {assessment.confidence_score != null && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 42, fontWeight: 800, color: assessment.confidence_score >= 80 ? "#22c55e" : assessment.confidence_score >= 60 ? "#f59e0b" : "#d13438", lineHeight: 1 }}>
                  {assessment.confidence_score}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>
                  Confidence
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Trend */}
        {delta !== null && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#64748b" }}>vs. previous assessment:</span>
            <span style={{ fontWeight: 700, fontSize: 15, color: delta > 0 ? "#22c55e" : delta < 0 ? "#d13438" : "#94a3b8" }}>
              {delta > 0 ? "+" : ""}{delta} {delta > 0 ? "▲" : delta < 0 ? "▼" : "→"}
            </span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              (was {previousAssessment?.overall_score})
            </span>
          </div>
        )}
      </div>

      {/* Section scores */}
      {assessment.section_scores && Object.keys(assessment.section_scores).length > 0 && (
        <div className="ms-card" style={{ padding: "20px 24px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 16 }}>
            Section Scores
          </div>
          {Object.entries(assessment.section_scores).map(([key, score]) => (
            <ScoreBar key={key} label={SECTION_LABELS[key] ?? key} score={score} />
          ))}
        </div>
      )}

      {/* Solution scores */}
      {assessment.solution_scores && Object.keys(assessment.solution_scores).length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
          {Object.entries(assessment.solution_scores).map(([sol, score]) => {
            const band = getHealthBandForScore(score);
            const color = HEALTH_BAND_COLORS[band];
            const bandLabel = HEALTH_BAND_LABELS[band];
            return (
              <div key={sol} className="ms-card" style={{ padding: "16px 18px", borderTop: `3px solid ${color}` }}>
                <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                  {SOLUTION_TYPE_LABELS[sol] ?? sol}
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
                <div style={{ fontSize: 11, marginTop: 4, color, fontWeight: 600 }}>{bandLabel}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Insights */}
      {assessment.insights && assessment.insights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 10 }}>
            Insights
          </div>
          {assessment.insights.map((insight, i) => (
            <div
              key={i}
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 10,
                fontSize: 13,
                color: "#92400e",
                lineHeight: 1.6,
              }}
            >
              {insight}
            </div>
          ))}
        </div>
      )}

      {/* Recommended actions */}
      {assessment.recommended_actions && assessment.recommended_actions.length > 0 && (
        <div className="ms-card" style={{ padding: "20px 24px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 12 }}>
            Recommended Actions
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            {assessment.recommended_actions.map((action) => (
              <li key={action} style={{ fontSize: 13, color: "#334155", lineHeight: 1.5, textTransform: "capitalize" }}>
                {action.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Customer context */}
      {(biggestWin || biggestChallenge || (nextDrivers && nextDrivers.length > 0)) && (
        <div className="ms-card" style={{ padding: "20px 24px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 16 }}>
            Customer Context
          </div>
          {biggestWin && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Biggest Win</div>
              <p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{biggestWin}</p>
            </div>
          )}
          {biggestChallenge && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Biggest Challenge</div>
              <p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{biggestChallenge}</p>
            </div>
          )}
          {nextDrivers && nextDrivers.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#63c1ea", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Next 30-60 Day Value Drivers</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {nextDrivers.map((d) => (
                  <span key={d} className="ms-badge" style={{ background: "rgba(99,193,234,0.1)", color: "#0b9aad", border: "1px solid rgba(99,193,234,0.25)" }}>
                    {VALUE_DRIVER_LABELS[d] ?? d}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        {confirmDelete ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#d13438" }}>Delete this assessment?</span>
            <button
              className="ms-btn-ghost"
              onClick={() => { setConfirmDelete(false); onDelete(); }}
              style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}
            >
              Yes, Delete
            </button>
            <button className="ms-btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        ) : (
          <button
            className="ms-btn-ghost"
            onClick={() => setConfirmDelete(true)}
            style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}
          >
            Delete Assessment
          </button>
        )}
      </div>
    </div>
  );
}
