/**
 * Gartner TIME framework — derivation + display metadata for the Optimize
 * Tech Stack tab. Consumed by both client (src/client) and server (src/server);
 * each tsconfig includes this `src/shared` directory.
 *
 * A tech area is scored on two 1-5 axes — functional fit (business value) and
 * technical fit (technical health). The axes split at the midpoint: a score of
 * 3 or higher is "high", 2 or lower is "low". The resulting quadrant:
 *
 *                 │ Functional LOW   │ Functional HIGH
 *   Technical HIGH │ Tolerate         │ Invest
 *   Technical LOW  │ Eliminate        │ Migrate
 */

export const TIME_RATINGS = ["tolerate", "invest", "migrate", "eliminate"] as const;
export type TimeRating = typeof TIME_RATINGS[number];

/** A fit score of this value or higher counts as "high" on either axis. */
export const FIT_HIGH_THRESHOLD = 3;

/**
 * Derive the TIME rating from the two fit scores. Returns null if either score
 * is missing (so the UI can show "not yet rated" rather than a misleading letter).
 */
export function deriveTimeRating(
  functionalFit: number | null | undefined,
  technicalFit: number | null | undefined,
): TimeRating | null {
  if (functionalFit == null || technicalFit == null) return null;
  const funcHigh = functionalFit >= FIT_HIGH_THRESHOLD;
  const techHigh = technicalFit >= FIT_HIGH_THRESHOLD;
  if (techHigh) return funcHigh ? "invest" : "tolerate";
  return funcHigh ? "migrate" : "eliminate";
}

export const TIME_META: Record<TimeRating, { letter: string; label: string; color: string }> = {
  tolerate:  { letter: "T", label: "Tolerate",  color: "#f59e0b" },
  invest:    { letter: "I", label: "Invest",    color: "#22c55e" },
  migrate:   { letter: "M", label: "Migrate",   color: "#60a5fa" },
  eliminate: { letter: "E", label: "Eliminate", color: "#d13438" },
};

/** Caption shown beneath each value on the functional-fit picker. */
export const FUNCTIONAL_FIT_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Unreasonable",
  2: "Insufficient",
  3: "Appropriate",
  4: "Appropriate",
  5: "Perfect",
};

/** Caption shown beneath each value on the technical-fit picker. */
export const TECHNICAL_FIT_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Inappropriate",
  2: "Insufficient",
  3: "Adequate",
  4: "Adequate",
  5: "Fully appropriate",
};
