/**
 * Pacific-time conversions for user-facing dates. Most of the team works in
 * Pacific, so a bare "2026-10-09" or "8:00" from a person means Pacific; time
 * entries themselves are stored and sent to Dynamics as UTC ISO strings.
 * Uses the IANA zone, not a fixed offset, so PST/PDT both come out right.
 */

export const PACIFIC_TZ = "America/Los_Angeles";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TZ, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function pacificParts(at: Date): Record<string, string> {
  return Object.fromEntries(partsFormatter.formatToParts(at).map((p) => [p.type, p.value]));
}

/** Minutes Pacific is offset from UTC at `at` (-480 in PST, -420 in PDT). */
function pacificOffsetMinutes(at: Date): number {
  const p = pacificParts(at);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * The UTC instant of a Pacific wall-clock time. `date` is YYYY-MM-DD, `time` is
 * HH:MM (24h). The offset is resolved twice so a time near a DST switch uses
 * the offset in force at that time, not at midnight UTC.
 */
export function pacificToUtc(date: string, time = "00:00"): Date {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) throw new Error(`Invalid date/time: ${date} ${time}`);
  const first = naive - pacificOffsetMinutes(new Date(naive)) * 60000;
  return new Date(naive - pacificOffsetMinutes(new Date(first)) * 60000);
}

/** A UTC ISO timestamp as Pacific `{ date: "YYYY-MM-DD", time: "HH:MM" }`. */
export function utcToPacific(iso: string): { date: string; time: string } {
  const p = pacificParts(new Date(iso));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Today's date in Pacific, YYYY-MM-DD. */
export function pacificToday(): string {
  return utcToPacific(new Date().toISOString()).date;
}

/** Shift a YYYY-MM-DD date by whole days (calendar arithmetic, no time zone). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
