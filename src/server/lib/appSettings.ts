/**
 * App-wide runtime settings. Currently just `demo_mode` — the vendor lens
 * that silently filters list views for partner demos. Reads are cheap (single
 * keyed row); we hit D1 once per request from the endpoints that care.
 */

// "webex" is the underlying vendor value for Cisco (Cisco Webex Calling) — the
// Cisco demo lens filters projects/customers with vendor=webex.
export type DemoVendor = "zoom" | "ringcentral" | "webex" | null;

export async function getDemoVendor(db: D1Database): Promise<DemoVendor> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE key = 'demo_mode' LIMIT 1")
    .first<{ value: string | null }>();
  const v = row?.value?.toLowerCase().trim() ?? null;
  if (v === "zoom" || v === "ringcentral" || v === "webex") return v;
  return null;
}

export async function setDemoVendor(
  db: D1Database,
  value: DemoVendor,
  updatedByUserId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at, updated_by_user_id)
       VALUES ('demo_mode', ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = CURRENT_TIMESTAMP,
         updated_by_user_id = excluded.updated_by_user_id`,
    )
    .bind(value, updatedByUserId)
    .run();
}

// ── Leadership weekly summary email schedule ─────────────────────────────────
// Stored as a single JSON blob under key 'leadership_summary_schedule' — the
// generic app_settings table already stores JSON elsewhere in this app
// (solutions.add_ons etc.), and a schedule this small doesn't warrant its own
// table. hourLocal/dayOfWeek are interpreted in America/Los_Angeles (Pacific)
// by the cron check, which resolves current Pacific weekday/hour via Intl —
// that handles PST/PDT automatically, unlike a fixed-UTC cron string.

export type LeadershipSummarySchedule = {
  enabled: boolean;
  dayOfWeek: number; // 0=Sun .. 6=Sat
  hourLocal: number; // 0-23, Pacific local hour
  recipientEmails: string[];
  lastSentAt: string | null; // Pacific-local YYYY-MM-DD of the last successful send — guards against double-sends if the hourly cron check fires more than once in the target hour
};

const DEFAULT_LEADERSHIP_SUMMARY_SCHEDULE: LeadershipSummarySchedule = {
  enabled: false,
  dayOfWeek: 4, // Thursday
  hourLocal: 7,
  recipientEmails: [],
  lastSentAt: null,
};

export async function getLeadershipSummarySchedule(db: D1Database): Promise<LeadershipSummarySchedule> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE key = 'leadership_summary_schedule' LIMIT 1")
    .first<{ value: string | null }>();
  if (!row?.value) return DEFAULT_LEADERSHIP_SUMMARY_SCHEDULE;
  try {
    const parsed = JSON.parse(row.value);
    return { ...DEFAULT_LEADERSHIP_SUMMARY_SCHEDULE, ...parsed };
  } catch {
    return DEFAULT_LEADERSHIP_SUMMARY_SCHEDULE;
  }
}

export async function setLeadershipSummarySchedule(
  db: D1Database,
  schedule: LeadershipSummarySchedule,
  updatedByUserId: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at, updated_by_user_id)
       VALUES ('leadership_summary_schedule', ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = CURRENT_TIMESTAMP,
         updated_by_user_id = excluded.updated_by_user_id`,
    )
    .bind(JSON.stringify(schedule), updatedByUserId)
    .run();
}
