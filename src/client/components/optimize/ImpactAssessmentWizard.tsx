import { useState } from "react";
import { api, type ImpactAssessment } from "../../lib/api";
import surveyDef from "../../assets/client_impact_assessment_unified_v1.json";

interface Props {
  projectId: string;
  accountName: string;
  onComplete: (assessment: ImpactAssessment) => void;
  onCancel: () => void;
}

type SurveySection = (typeof surveyDef.sections)[number];
type SurveyField = SurveySection["fields"][number];

// Maps each deployable solution to its solution type category
const SOLUTION_TO_TYPE: Record<string, string> = {
  zoom_ucaas: "ucaas",
  ringcentral_ucaas: "ucaas",
  zoom_contact_center: "ccaas",
  ringcx: "ccaas",
  zoom_revenue_accelerator: "ci",
  ringcentral_ace: "ci",
  zoom_virtual_agent: "virtual_agent",
  ringcentral_air: "virtual_agent",
};

function deriveSolutionTypes(deployed: string[]): string[] {
  const types = new Set(deployed.map((s) => SOLUTION_TO_TYPE[s]).filter(Boolean));
  return Array.from(types);
}

function getSelectedSolutionTypes(answers: Record<string, unknown>): string[] {
  const val = answers["solution_types"];
  if (Array.isArray(val)) return val as string[];
  return [];
}

function fieldApplies(field: SurveyField, solutionTypes: string[]): boolean {
  const appliesTo = (field as { appliesTo?: string[] }).appliesTo;
  if (!appliesTo) return true; // deployment_context fields have no appliesTo
  return appliesTo.some((t) => solutionTypes.includes(t));
}

function sectionHasApplicableFields(section: SurveySection, solutionTypes: string[]): boolean {
  if (section.id === "deployment_context") return true;
  return section.fields.some((f) => fieldApplies(f, solutionTypes));
}

export default function ImpactAssessmentWizard({ projectId, accountName, onComplete, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const sections = surveyDef.sections as SurveySection[];
  const solutionTypes = getSelectedSolutionTypes(answers);

  // Build the list of applicable steps
  const applicableSections = sections.filter((s, idx) => {
    if (idx === 0) return true; // always show deployment_context
    return sectionHasApplicableFields(s, solutionTypes);
  });

  const currentSection = applicableSections[step];
  const totalSteps = applicableSections.length;
  const isLastStep = step === totalSteps - 1;

  function setAnswer(fieldId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
    setValidationError(null);
  }

  function toggleMultiSelect(fieldId: string, value: string) {
    const current = (answers[fieldId] as string[] | undefined) ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    const update: Record<string, unknown> = { [fieldId]: next };
    // When solutions_deployed changes, auto-derive solution_types
    if (fieldId === "solutions_deployed") {
      update["solution_types"] = deriveSolutionTypes(next);
    }
    setAnswers((prev) => ({ ...prev, ...update }));
    setValidationError(null);
  }

  function validateCurrentStep(): boolean {
    for (const field of currentSection.fields) {
      if (!(field as { required?: boolean }).required) continue;
      if (field.type === "object") return true;
      if (field.id === "customer_name" || field.id === "solution_types") continue;
      if (!fieldApplies(field, solutionTypes) && step > 0) continue;

      const val = answers[field.id];
      if (val === undefined || val === null || val === "") {
        setValidationError(`Please answer: "${field.label}"`);
        return false;
      }
      if (Array.isArray(val) && val.length === 0) {
        setValidationError(`Please select at least one option for: "${field.label}"`);
        return false;
      }
    }
    return true;
  }

  function handleNext() {
    if (!validateCurrentStep()) return;
    // After deployment_context, rebuild applicable sections with new solutionTypes
    setStep((prev) => prev + 1);
  }

  function handleBack() {
    setValidationError(null);
    setStep((prev) => prev - 1);
  }

  async function handleSubmit() {
    if (!validateCurrentStep()) return;
    setSaving(true);
    try {
      const result = await api.optimizeCreateAssessment({
        project_id: projectId,
        conducted_date: new Date().toISOString().slice(0, 10),
        solution_types: solutionTypes,
        answers,
      });
      onComplete(result);
    } catch {
      setValidationError("Failed to save assessment. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function renderField(field: SurveyField) {
    if (field.type === "object") return null;
    // customer_name is known from the account; solution_types is auto-derived from solutions_deployed
    if (field.id === "customer_name" || field.id === "solution_types") return null;
    if (step > 0 && !fieldApplies(field, solutionTypes)) return null;

    const typedField = field as SurveyField & {
      options?: { value: string; label: string; score?: number }[];
      scaleMin?: number;
      scaleMax?: number;
      minLabel?: string;
      maxLabel?: string;
      required?: boolean;
    };

    const isRequired = typedField.required === true;
    const val = answers[field.id];

    return (
      <div key={field.id} style={{ marginBottom: 20 }}>
        <label className="ms-label">
          <span style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>
            {field.label}
            {isRequired && <span style={{ color: "#d13438", marginLeft: 3 }}>*</span>}
          </span>
        </label>

        {field.type === "text" && (
          <input
            className="ms-input"
            type="text"
            value={(val as string) ?? ""}
            onChange={(e) => setAnswer(field.id, e.target.value)}
            style={{ marginTop: 6, width: "100%" }}
          />
        )}

        {field.type === "date" && (
          <input
            className="ms-input"
            type="date"
            value={(val as string) ?? ""}
            onChange={(e) => setAnswer(field.id, e.target.value)}
            style={{ marginTop: 6 }}
          />
        )}

        {field.type === "textarea" && (
          <textarea
            className="ms-input"
            rows={3}
            value={(val as string) ?? ""}
            onChange={(e) => setAnswer(field.id, e.target.value)}
            style={{ marginTop: 6, resize: "vertical", width: "100%" }}
          />
        )}

        {field.type === "single_select" && typedField.options && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {typedField.options.map((opt) => {
              const selected = val === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAnswer(field.id, opt.value)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: selected ? "2px solid #63c1ea" : "1px solid rgba(0,0,0,0.1)",
                    background: selected ? "rgba(99,193,234,0.08)" : "rgba(255,255,255,0.03)",
                    color: selected ? "#0b9aad" : "#334155",
                    fontWeight: selected ? 600 : 400,
                    cursor: "pointer",
                    fontSize: 14,
                    transition: "all 0.12s",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        {field.type === "multi_select" && typedField.options && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {typedField.options.map((opt) => {
              const selected = Array.isArray(val) && (val as string[]).includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleMultiSelect(field.id, opt.value)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 20,
                    border: selected ? "2px solid #63c1ea" : "1px solid rgba(0,0,0,0.12)",
                    background: selected ? "rgba(99,193,234,0.12)" : "rgba(255,255,255,0.03)",
                    color: selected ? "#0b9aad" : "#475569",
                    fontWeight: selected ? 600 : 400,
                    cursor: "pointer",
                    fontSize: 13,
                    transition: "all 0.12s",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        {field.type === "rating" && typedField.scaleMin !== undefined && typedField.scaleMax !== undefined && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Array.from({ length: typedField.scaleMax - typedField.scaleMin + 1 }, (_, i) => i + typedField.scaleMin!).map((n) => {
                const selected = val === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setAnswer(field.id, n)}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      border: selected ? "2px solid #63c1ea" : "1px solid rgba(0,0,0,0.12)",
                      background: selected ? "rgba(99,193,234,0.12)" : "rgba(255,255,255,0.03)",
                      color: selected ? "#0b9aad" : "#334155",
                      fontWeight: selected ? 700 : 400,
                      cursor: "pointer",
                      fontSize: 15,
                      transition: "all 0.12s",
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            {(typedField.minLabel || typedField.maxLabel) && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{typedField.minLabel}</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{typedField.maxLabel}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ms-card" style={{ padding: "32px 36px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Impact Assessment — {accountName}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1e293b" }}>
            {currentSection.title}
          </h2>
          <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>
            Step {step + 1} of {totalSteps}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 12, height: 4, background: "rgba(0,0,0,0.06)", borderRadius: 4, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              background: "#63c1ea",
              borderRadius: 4,
              width: `${((step + 1) / totalSteps) * 100}%`,
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>

      {/* Fields */}
      <div>
        {currentSection.fields.map((f) => renderField(f))}
      </div>

      {/* Validation error */}
      {validationError && (
        <div style={{ marginTop: 8, marginBottom: 8, padding: "10px 14px", borderRadius: 8, background: "rgba(209,52,56,0.08)", border: "1px solid rgba(209,52,56,0.25)", color: "#d13438", fontSize: 13 }}>
          {validationError}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "space-between" }}>
        <button
          type="button"
          className="ms-btn-secondary"
          onClick={step === 0 ? onCancel : handleBack}
        >
          {step === 0 ? "Cancel" : "Back"}
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          {!isLastStep && (
            <button type="button" className="ms-btn-primary" onClick={handleNext}>
              Next
            </button>
          )}
          {isLastStep && (
            <button
              type="button"
              className="ms-btn-primary"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? "Saving..." : "Submit Assessment"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
