/**
 * Plausible-date guards, shared by the client and the worker.
 *
 * Why this exists: `<input type="date">` reports a partially-typed year as a
 * zero-padded value — typing "2026" passes through 0002 → 0020 → 0202 → 2026,
 * and a year entered as "26" lands as 0026. Several date cells in this app save
 * on `onChange` (i.e. per keystroke), so those intermediates reached D1. A bare
 * `^\d{4}-\d{2}-\d{2}$` shape check accepts every one of them: four digits is
 * four digits.
 *
 * The damage is disproportionate on Gantt views, which scale their axis off
 * min/max of the dates they're given. A single year-26 row stretched the MedVet
 * Timeline span to ~2000 years and squashed every real bar into a 1px sliver at
 * the far right edge (2026 dates landed at 99.98% of the width).
 *
 * So: validate at the input, reject at the API, and never let an out-of-window
 * value bound a chart axis.
 */

/** Inclusive window for any user-entered business date in this app. */
export const PLAN_DATE_MIN = "2000-01-01";
export const PLAN_DATE_MAX = "2100-12-31";

const ISO_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
/** Date, optionally followed by a time — SQLite's CURRENT_TIMESTAMP writes
 *  "YYYY-MM-DD HH:MM:SS"; ISO payloads use "YYYY-MM-DDTHH:MM:SSZ". */
const ISO_DATETIME_SHAPE = /^\d{4}-\d{2}-\d{2}[ T][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?$/;

/**
 * True when `d` is a real calendar date inside the plausible window.
 * Rejects both out-of-range years (0026, 0202) and non-existent days
 * (2026-02-31), which the shape check alone lets through.
 */
export function isPlanDate(d: string | null | undefined): d is string {
  if (!d || !ISO_DATE_SHAPE.test(d)) return false;
  if (d < PLAN_DATE_MIN || d > PLAN_DATE_MAX) return false;
  // Round-trip to reject days that don't exist in that month. Note the NaN
  // check must come first: a month like "2026-13-01" yields an Invalid Date,
  // and calling .toISOString() on that THROWS RangeError rather than returning
  // a mismatch — which would surface as a crashed render or a 500.
  const ms = Date.parse(d + "T00:00:00Z");
  if (Number.isNaN(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === d;
}

/** As isPlanDate, but also accepts a date carrying a time component. */
export function isPlanTimestamp(d: string | null | undefined): d is string {
  if (!d) return false;
  if (ISO_DATE_SHAPE.test(d)) return isPlanDate(d);
  if (!ISO_DATETIME_SHAPE.test(d)) return false;
  return isPlanDate(d.slice(0, 10));
}

/**
 * Epoch ms for a plausible date, else null. Use this to build chart axes so an
 * out-of-window value can't bound the scale.
 */
export function planDateMs(d: string | null | undefined): number | null {
  if (!isPlanDate(d)) return null;
  const ms = Date.parse(d + "T00:00:00");
  return Number.isNaN(ms) ? null : ms;
}

/** Same, tolerating a time component (e.g. a stamped completed_at). */
export function planTimestampMs(d: string | null | undefined): number | null {
  if (!isPlanTimestamp(d)) return null;
  const ms = Date.parse(d.slice(0, 10) + "T00:00:00");
  return Number.isNaN(ms) ? null : ms;
}

/** Message shown to the user (and returned by the API) on rejection. */
export const PLAN_DATE_ERROR = `Date must be a real date between ${PLAN_DATE_MIN} and ${PLAN_DATE_MAX}`;

/**
 * For date inputs that persist on every `change` (i.e. per keystroke): commit a
 * cleared field or a plausible date, and swallow the half-typed intermediates.
 * Without this, typing a year fires a save — and now a rejection — for 0002,
 * 0020 and 0202 on the way to 2026.
 */
export function commitIfPlanDate(value: string, commit: (v: string | null) => void): void {
  if (!value) { commit(null); return; }
  if (isPlanDate(value)) commit(value);
}
