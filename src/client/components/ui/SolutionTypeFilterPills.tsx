import { SOLUTION_TYPE_COLORS, SOLUTION_TYPE_LABELS, type SolutionType } from "../../../shared/solutionTypes";

type Props = {
  available: readonly SolutionType[];
  selected: ReadonlySet<SolutionType>;
  onToggle: (type: SolutionType) => void;
  /** Hide entirely when only zero or one types exist on this project (a single-type project has nothing to filter). */
  hideWhenSingle?: boolean;
  label?: string;
};

export function SolutionTypeFilterPills({ available, selected, onToggle, hideWhenSingle = true, label = "Show:" }: Props) {
  if (hideWhenSingle && available.length <= 1) return null;
  if (available.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "#64748b", marginRight: 2 }}>{label}</span>
      {available.map((t) => {
        const active = selected.has(t);
        const color = SOLUTION_TYPE_COLORS[t];
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 999,
              border: `1px solid ${active ? color : "rgba(148,163,184,0.4)"}`,
              background: active ? color + "1a" : "transparent",
              color: active ? color : "#94a3b8",
              fontWeight: active ? 600 : 500,
              cursor: "pointer",
              lineHeight: 1.4,
            }}
          >
            {SOLUTION_TYPE_LABELS[t]}
          </button>
        );
      })}
    </div>
  );
}
