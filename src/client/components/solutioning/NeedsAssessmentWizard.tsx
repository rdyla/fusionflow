import { useMemo, useState } from "react";
import { api, type NeedsAssessment } from "../../lib/api";

// ── Types from JSON ────────────────────────────────────────────────────────────

type FieldOption = { value: string; label: string };

type ItemSchemaProperty = {
  type: string;
  label: string;
  required?: boolean;
  options?: FieldOption[];
};

type FieldDef = {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: FieldOption[];
  optionsSourceField?: string;
  itemSchema?: { type: string; properties: Record<string, ItemSchemaProperty> };
  showIf?: {
    field: string;
    operator: "notEquals" | "containsAny" | "contains";
    value: string | string[];
  };
};

type SectionDef = {
  id: string;
  title: string;
  fields: FieldDef[];
};

// ── ShowIf logic ──────────────────────────────────────────────────────────────

function shouldShow(field: FieldDef, answers: Record<string, unknown>): boolean {
  if (!field.showIf) return true;
  const { field: refField, operator, value } = field.showIf;
  const refVal = answers[refField];

  if (operator === "notEquals") {
    return refVal !== value;
  }
  if (operator === "containsAny") {
    const arr = Array.isArray(refVal) ? refVal : [];
    const vals = Array.isArray(value) ? value : [value];
    return vals.some((v) => arr.includes(v));
  }
  if (operator === "contains") {
    if (Array.isArray(refVal)) return refVal.includes(value as string);
    return refVal === value;
  }
  return true;
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  solutionId: string;
  solutionType: string;
  customerName: string;
  surveyJson: { sections: SectionDef[]; [key: string]: unknown };
  initialAnswers?: Record<string, unknown>;
  onComplete: (assessment: NeedsAssessment) => void;
  onCancel: () => void;
};

// ── Repeater row component ─────────────────────────────────────────────────────

type RepeaterRowProps = {
  schema: Record<string, ItemSchemaProperty>;
  value: Record<string, string>;
  onChange: (val: Record<string, string>) => void;
  onRemove: () => void;
  index: number;
};

function RepeaterRow({ schema, value, onChange, onRemove, index }: RepeaterRowProps) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, marginBottom: 8, background: "#f8fafc" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Item {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          style={{ background: "none", border: "none", color: "#d13438", cursor: "pointer", fontSize: 13, padding: "2px 6px" }}
        >
          Remove
        </button>
      </div>
      {Object.entries(schema).map(([key, prop]) => (
        <label key={key} className="ms-label" style={{ marginBottom: 8 }}>
          <span>{prop.label}</span>
          {prop.type === "textarea" ? (
            <textarea
              className="ms-input"
              rows={2}
              style={{ resize: "vertical" }}
              value={value[key] ?? ""}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            />
          ) : prop.type === "single_select" && prop.options ? (
            <select
              className="ms-input"
              value={value[key] ?? ""}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            >
              <option value="">— Select —</option>
              {prop.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className="ms-input"
              value={value[key] ?? ""}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            />
          )}
        </label>
      ))}
    </div>
  );
}

// ── Field renderer ─────────────────────────────────────────────────────────────

type FieldProps = {
  field: FieldDef;
  answers: Record<string, unknown>;
  onChange: (id: string, val: unknown) => void;
  allSections: SectionDef[];
};

function FieldInput({ field, answers, onChange, allSections }: FieldProps) {
  const val = answers[field.id];

  if (field.type === "info") {
    const url = (val as string) ?? "";
    const isUrl = url.startsWith("http");
    return (
      <div style={{ padding: "10px 14px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6, fontSize: 13, color: "#0369a1" }}>
        {isUrl ? (
          <a href={url} target="_blank" rel="noreferrer" style={{ color: "#0369a1", wordBreak: "break-all" }}>{url}</a>
        ) : (
          <span style={{ color: "#64748b" }}>{url || field.label}</span>
        )}
      </div>
    );
  }

  if (field.type === "text" || field.type === "date") {
    return (
      <input
        type={field.type}
        className="ms-input"
        value={(val as string) ?? ""}
        onChange={(e) => onChange(field.id, e.target.value)}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        className="ms-input"
        rows={3}
        style={{ resize: "vertical" }}
        value={(val as string) ?? ""}
        onChange={(e) => onChange(field.id, e.target.value)}
      />
    );
  }

  if (field.type === "single_select" && field.options) {
    const isShort = field.options.length <= 4;
    if (isShort) {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
          {field.options.map((opt) => (
            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
              <input
                type="radio"
                name={field.id}
                value={opt.value}
                checked={val === opt.value}
                onChange={() => onChange(field.id, opt.value)}
                style={{ accentColor: "#0b9aad" }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      );
    }
    return (
      <select
        className="ms-input"
        value={(val as string) ?? ""}
        onChange={(e) => onChange(field.id, e.target.value)}
      >
        <option value="">— Select —</option>
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === "multi_select" && field.options) {
    const selected = Array.isArray(val) ? (val as string[]) : [];
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
        {field.options.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                const next = isSelected
                  ? selected.filter((v) => v !== opt.value)
                  : [...selected, opt.value];
                onChange(field.id, next);
              }}
              style={{
                padding: "5px 12px",
                borderRadius: 20,
                border: `1px solid ${isSelected ? "#0b9aad" : "#cbd5e1"}`,
                background: isSelected ? "#e0f7fa" : "#fff",
                color: isSelected ? "#0b9aad" : "#475569",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: isSelected ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.type === "ranked_select" && field.optionsSourceField) {
    const sourceVal = answers[field.optionsSourceField];
    const sourceOptions = Array.isArray(sourceVal) ? (sourceVal as string[]) : [];
    // Get labels from source field options
    const sourceField = (allSections as SectionDef[])
      .flatMap((s) => s.fields)
      .find((f) => f.id === field.optionsSourceField);
    const optionLabels: Record<string, string> = {};
    if (sourceField?.options) {
      for (const o of sourceField.options) {
        optionLabels[o.value] = o.label;
      }
    }

    const ranked: Record<string, number> = (val != null && typeof val === "object" && !Array.isArray(val)) ? (val as Record<string, number>) : {};

    return (
      <div style={{ marginTop: 4 }}>
        {sourceOptions.length === 0 && (
          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
            Select options from the field above first.
          </p>
        )}
        {sourceOptions.map((optVal) => {
          const currentRank = ranked[optVal];
          return (
            <div key={optVal} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, flex: 1 }}>{optionLabels[optVal] ?? optVal}</span>
              {[1, 2, 3].map((rank) => (
                <button
                  key={rank}
                  type="button"
                  onClick={() => {
                    // Clear any other option with this rank, then set
                    const next = { ...ranked };
                    for (const [k, v] of Object.entries(next)) {
                      if (v === rank) delete next[k];
                    }
                    if (currentRank === rank) {
                      delete next[optVal];
                    } else {
                      next[optVal] = rank;
                    }
                    onChange(field.id, next);
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    border: `1px solid ${currentRank === rank ? "#0b9aad" : "#cbd5e1"}`,
                    background: currentRank === rank ? "#0b9aad" : "#fff",
                    color: currentRank === rank ? "#fff" : "#64748b",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {rank}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  if (field.type === "repeater" && field.itemSchema) {
    const rows = Array.isArray(val) ? (val as Record<string, string>[]) : [];
    return (
      <div style={{ marginTop: 4 }}>
        {rows.map((row, i) => (
          <RepeaterRow
            key={i}
            index={i}
            schema={field.itemSchema!.properties}
            value={row}
            onChange={(newRow) => {
              const next = [...rows];
              next[i] = newRow;
              onChange(field.id, next);
            }}
            onRemove={() => {
              const next = rows.filter((_, idx) => idx !== i);
              onChange(field.id, next);
            }}
          />
        ))}
        <button
          type="button"
          className="ms-btn-secondary"
          style={{ fontSize: 13, padding: "5px 14px" }}
          onClick={() => {
            const emptyRow: Record<string, string> = {};
            for (const k of Object.keys(field.itemSchema!.properties)) {
              emptyRow[k] = "";
            }
            onChange(field.id, [...rows, emptyRow]);
          }}
        >
          + Add Item
        </button>
      </div>
    );
  }

  return null;
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function NeedsAssessmentWizard({ solutionId, solutionType, customerName, surveyJson, initialAnswers, onComplete, onCancel }: Props) {
  const AUTO_FILLED_FIELDS = new Set(["customer_name", "assessment_date"]);

  const SECTIONS = useMemo(
    () => (surveyJson.sections as SectionDef[]).map((s) =>
      s.id === "project_context"
        ? { ...s, fields: s.fields.filter((f) => !AUTO_FILLED_FIELDS.has(f.id)) }
        : s
    ),
    [surveyJson]
  );

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers ?? {});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const totalSteps = SECTIONS.length;
  const currentSection = SECTIONS[step];

  function setAnswer(id: string, val: unknown) {
    setAnswers((prev) => ({ ...prev, [id]: val }));
  }

  function validateStep(): boolean {
    const section = SECTIONS[step];
    const missing: string[] = [];
    for (const field of section.fields) {
      if (!field.required) continue;
      if (!shouldShow(field, answers)) continue;
      const val = answers[field.id];
      if (val === null || val === undefined || val === "") {
        missing.push(field.label);
      } else if (Array.isArray(val) && val.length === 0) {
        missing.push(field.label);
      }
    }
    setErrors(missing);
    return missing.length === 0;
  }

  function handleNext() {
    if (!validateStep()) return;
    setErrors([]);
    setStep((s) => s + 1);
  }

  function handleBack() {
    setErrors([]);
    setStep((s) => s - 1);
  }

  async function handleComplete() {
    if (!validateStep()) return;
    setSaving(true);
    try {
      const merged = {
        ...answers,
        customer_name: customerName,
        assessment_date: new Date().toISOString().slice(0, 10),
      };
      const result = await api.upsertNeedsAssessment(solutionId, solutionType, { answers: merged });
      onComplete(result);
    } catch {
      setErrors(["Failed to save assessment. Please try again."]);
    } finally {
      setSaving(false);
    }
  }

  const visibleFields = currentSection.fields.filter((f) =>
    shouldShow(f, answers)
  );

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Step indicator */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {SECTIONS.map((s, i) => (
          <div
            key={s.id}
            style={{
              flex: "1 0 auto",
              minWidth: 8,
              height: 4,
              borderRadius: 2,
              background: i < step ? "#0b9aad" : i === step ? "#63c1ea" : "#e2e8f0",
            }}
          />
        ))}
      </div>

      {/* Step counter */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          Step {step + 1} of {totalSteps}
        </span>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}
        >
          Cancel
        </button>
      </div>

      {/* Section card */}
      <div className="ms-card" style={{ padding: "24px 28px" }}>
        <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
          {currentSection.title}
        </h3>

        <div style={{ display: "grid", gap: 18 }}>
          {visibleFields.map((field) => (
            <label key={field.id} className="ms-label">
              <span>
                {field.label}
                {field.required && <span style={{ color: "#d13438", marginLeft: 3 }}>*</span>}
              </span>
              <FieldInput field={field} answers={answers} onChange={setAnswer} allSections={surveyJson.sections as SectionDef[]} />
            </label>
          ))}
        </div>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div style={{ background: "#fff1f0", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px" }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#b91c1c" }}>
            Please complete the required fields:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {errors.map((e) => (
              <li key={e} style={{ fontSize: 12, color: "#b91c1c" }}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <button
          type="button"
          className="ms-btn-secondary"
          onClick={handleBack}
          disabled={step === 0}
        >
          Back
        </button>

        {step < totalSteps - 1 ? (
          <button
            type="button"
            className="ms-btn-primary"
            onClick={handleNext}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="ms-btn-primary"
            onClick={handleComplete}
            disabled={saving}
          >
            {saving ? "Saving…" : "Complete Assessment"}
          </button>
        )}
      </div>
    </div>
  );
}
