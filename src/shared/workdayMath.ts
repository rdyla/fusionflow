/**
 * Workday math for the Timeline Builder.
 *
 * Mirrors Excel's WORKDAY() — skips Saturdays + Sundays. No holiday
 * calendar yet (PMs handle holidays by overriding individual dates).
 *
 * Dates are passed and returned as `YYYY-MM-DD` strings (the format the
 * rest of the app uses for SQLite TEXT date columns). Internal math
 * routes through UTC Date objects so we don't drift across DST.
 */

/** Parse `YYYY-MM-DD` into a UTC Date at midnight. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Format a UTC Date as `YYYY-MM-DD`. */
export function formatISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** True if the given UTC Date falls on Saturday (6) or Sunday (0). */
export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Round a date forward (or stay put) until it's a workday. */
function bumpToWorkday(date: Date, direction: 1 | -1): Date {
  const d = new Date(date);
  while (isWeekend(d)) d.setUTCDate(d.getUTCDate() + direction);
  return d;
}

/**
 * Excel WORKDAY(start, days). Adds `days` workdays to `start`, skipping
 * weekends. Negative `days` walks backwards. The start date itself is
 * not counted — `WORKDAY('2026-08-21' Fri, 1) === '2026-08-24' Mon`.
 */
export function workday(startIso: string, days: number): string {
  const date = parseISODate(startIso);
  if (days === 0) return formatISODate(bumpToWorkday(date, 1));

  const step = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + step);
    if (!isWeekend(date)) remaining--;
  }
  return formatISODate(date);
}

/**
 * Count workdays between two ISO dates (inclusive of start, exclusive of
 * end — i.e., `workdaysBetween(a, workday(a, n)) === n`). Useful for
 * computing total project duration to backfill an initial start date
 * from a target go-live.
 */
export function workdaysBetween(startIso: string, endIso: string): number {
  const start = parseISODate(startIso);
  const end = parseISODate(endIso);
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    if (!isWeekend(cursor)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/** Stage input for the chain computer. */
export type StageInput = {
  id: string;
  working_days: number;
  /** If set, this stage's Start is pinned (manual override); upstream
   *  stages are unaffected, downstream chain from this stage's End. */
  pinned_start?: string | null;
  /** If set, this stage's End is pinned (manual override). When both
   *  pinned_start and pinned_end are set, working_days is ignored for
   *  this stage and the pin wins. */
  pinned_end?: string | null;
};

export type StageResult = {
  id: string;
  start: string;
  end: string;
};

/**
 * Chain stages forward from an anchor start date, using WORKDAY math.
 *
 * - Each stage's End = WORKDAY(Start, working_days).
 * - Next stage's Start = WORKDAY(prev End, 1) — i.e., the next workday.
 * - If a stage has `pinned_start` or `pinned_end`, that value is honored
 *   and the chain resumes from it.
 *
 * Returns one result per stage, in order.
 */
export function chainForward(anchorStartIso: string, stages: StageInput[]): StageResult[] {
  const results: StageResult[] = [];
  let cursorIso = bumpToWorkdayIso(anchorStartIso);

  for (const stage of stages) {
    const start = stage.pinned_start ?? cursorIso;
    const end = stage.pinned_end ?? workday(start, Math.max(stage.working_days, 0));
    results.push({ id: stage.id, start, end });
    cursorIso = workday(end, 1);
  }
  return results;
}

/**
 * Back-compute an anchor start date from a target go-live and total
 * working days across all stages. The result is the earliest start that,
 * chained forward, lands a final stage end on or before the go-live.
 */
export function startFromGoLive(goLiveIso: string, totalWorkingDays: number): string {
  const goLive = bumpToWorkdayIso(goLiveIso);
  if (totalWorkingDays <= 0) return goLive;
  // The chain produces N working days, then increments by 1 to advance to
  // the next stage. For a single timeline ending ON the go-live, the
  // start = workday(goLive, -(N - 1)) where N is total working days, so
  // that workday(start, N-1) === goLive.
  return workday(goLive, -(totalWorkingDays - 1));
}

function bumpToWorkdayIso(iso: string): string {
  const d = parseISODate(iso);
  return formatISODate(bumpToWorkday(d, 1));
}
