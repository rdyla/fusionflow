import { SOLUTION_TYPES, SOLUTION_TYPE_COLORS, SOLUTION_TYPE_LABELS, type SolutionType } from "../../../shared/solutionTypes";

type Props = {
  value: readonly SolutionType[];
  onChange: (next: SolutionType[]) => void;
  /** Set of SolutionType values to hide from the picker (e.g. to exclude not-yet-supported types on a specific form). */
  hide?: readonly SolutionType[];
  disabled?: boolean;
};

export function SolutionTypePicker({ value, onChange, hide, disabled }: Props) {
  const hidden = new Set(hide ?? []);
  const options = SOLUTION_TYPES.filter((t) => !hidden.has(t));

  function toggle(t: SolutionType) {
    if (disabled) return;
    const set = new Set(value);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    // Preserve canonical enum order in the output array.
    onChange(SOLUTION_TYPES.filter((x) => set.has(x)));
  }

  return (
    <div role="group" style={{ display: "grid", gap: 8 }}>
      {options.map((t) => {
        const checked = value.includes(t);
        const color = SOLUTION_TYPE_COLORS[t];
        return (
          <label
            key={t}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              border: `1px solid ${checked ? color + "80" : "#c8d5e8"}`,
              borderRadius: 6,
              background: checked ? color + "0f" : "#ffffff",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
              transition: "background 0.12s, border-color 0.12s",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(t)}
              disabled={disabled}
              style={{ accentColor: color, cursor: disabled ? "not-allowed" : "pointer" }}
            />
            <span style={{ fontSize: 14, fontWeight: 500, color: "#1e293b" }}>
              {SOLUTION_TYPE_LABELS[t]}
            </span>
          </label>
        );
      })}
    </div>
  );
}
