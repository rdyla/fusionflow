/**
 * Date-only display helpers.
 *
 * A bare date string like "2026-09-30" passed to `new Date()` is parsed as
 * UTC midnight; formatting it with toLocaleDateString in a behind-UTC zone
 * (e.g. US Pacific/Mountain) then rolls it back to "Sep 29". These helpers
 * parse the date part as LOCAL midnight so the calendar date never shifts.
 *
 * Use ONLY for date-only fields (go-live, due dates, kickoff, stage windows).
 * Do NOT use for real timestamps (created_at, recording start_time) — those
 * carry a time component and should render in local time as-is.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function localMidnight(value: string): Date {
  const dateOnly = value.slice(0, 10);
  return new Date(ISO_DATE.test(dateOnly) ? `${dateOnly}T00:00:00` : value);
}

/** Format a date-only value for display (default: "Sep 30, 2026"). */
export function formatDateOnly(
  value: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
): string {
  if (!value) return "—";
  const d = localMidnight(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-US", opts);
}

/** Calendar year of a date-only value (local-parsed, no UTC shift). */
export function yearOfDateOnly(value: string | null | undefined): number | null {
  if (!value) return null;
  const d = localMidnight(value);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}
