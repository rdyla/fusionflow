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

/**
 * Today's calendar date in the USER'S zone, as "YYYY-MM-DD".
 *
 * Use this for anything that means "today" to a person: a default date on a
 * form, an overdue comparison, an upcoming-vs-past split, a document's issue
 * date.
 *
 * NEVER use `new Date().toISOString().slice(0, 10)` for that. toISOString()
 * converts to UTC, so it returns TOMORROW's date for every user west of
 * Greenwich once local time passes (24:00 − offset):
 *
 *   US Pacific  — 5:00 pm PDT / 4:00 pm PST
 *   US Eastern  — 8:00 pm EDT / 7:00 pm EST
 *
 * That's how time entries were defaulting to the next day when logged late in
 * the afternoon, and how tasks due today rendered as overdue every evening.
 * Note Pacific users hit it EARLIER in the working day than Eastern ones, so
 * this was never an Eastern-timezone problem.
 *
 * Local date PARTS, not a UTC string — no zone conversion happens at all, so
 * the result is whatever date the user's own calendar shows.
 */
export function todayLocalIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
