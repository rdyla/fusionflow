import { SOLUTION_TYPE_COLORS, SOLUTION_TYPE_LABELS, parseSolutionTypes, type SolutionType } from "../../../shared/solutionTypes";

type Props = {
  /** Any shape: typed array, raw string[], JSON string, legacy single-string, null. Parsed + filtered to canonical values. */
  types: readonly string[] | string | null | undefined;
  /** Optional class to layer onto the pill wrapper (e.g. to tweak gap / inline flow). */
  className?: string;
  /** Shown when the resolved type list is empty. Pass `null` to render nothing. */
  emptyFallback?: React.ReactNode;
};

export function SolutionTypePills({ types, className, emptyFallback = <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span> }: Props) {
  const resolved: readonly SolutionType[] = parseSolutionTypes(types);

  if (resolved.length === 0) return emptyFallback as React.ReactElement;

  return (
    <span className={className} style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
      {resolved.map((t) => {
        const color = SOLUTION_TYPE_COLORS[t];
        return (
          <span
            key={t}
            className="ms-badge"
            style={{
              background: color + "1a",
              color,
              border: `1px solid ${color}40`,
            }}
          >
            {SOLUTION_TYPE_LABELS[t]}
          </span>
        );
      })}
    </span>
  );
}
