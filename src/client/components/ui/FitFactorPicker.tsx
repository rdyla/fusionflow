/**
 * Modern segmented 1-5 selector for fit scoring (replaces a dated dropdown).
 * Five equal cells in a rounded track; the selected cell is filled with a
 * red→green score-scaled accent, and the active band caption shows beneath.
 */

const FIT_VALUES = [1, 2, 3, 4, 5] as const;

// Red (poor) → green (excellent) ramp, indexed by score.
const SCORE_COLOR: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "#d13438",
  2: "#f97316",
  3: "#f59e0b",
  4: "#84cc16",
  5: "#22c55e",
};

type Props = {
  value: number | null;
  onChange: (next: number) => void;
  /** Caption shown under each value (e.g. FUNCTIONAL_FIT_LABELS). */
  labels: Record<1 | 2 | 3 | 4 | 5, string>;
  disabled?: boolean;
  id?: string;
};

export function FitFactorPicker({ value, onChange, labels, disabled, id }: Props) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(5, (value ?? 0) + 1) || 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(1, (value ?? 6) - 1));
    }
  }

  const caption = value ? labels[value as 1 | 2 | 3 | 4 | 5] : "Not yet rated";

  return (
    <div>
      <div
        id={id}
        role="radiogroup"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 4,
          padding: 4,
          borderRadius: 10,
          border: "1px solid #c8d5e8",
          background: "#f8fafc",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {FIT_VALUES.map((n) => {
          const selected = value === n;
          const color = SCORE_COLOR[n];
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              title={labels[n]}
              disabled={disabled}
              onClick={() => onChange(n)}
              style={{
                appearance: "none",
                border: "none",
                borderRadius: 7,
                padding: "9px 0",
                fontSize: 16,
                fontWeight: 700,
                cursor: disabled ? "not-allowed" : "pointer",
                background: selected ? color : "#ffffff",
                color: selected ? "#ffffff" : "#64748b",
                boxShadow: selected ? `0 1px 4px ${color}66` : "inset 0 0 0 1px #e2e8f0",
                transition: "background 0.12s, color 0.12s, box-shadow 0.12s",
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          fontWeight: value ? 600 : 400,
          color: value ? SCORE_COLOR[value as 1 | 2 | 3 | 4 | 5] : "#94a3b8",
        }}
      >
        {caption}
      </div>
    </div>
  );
}
