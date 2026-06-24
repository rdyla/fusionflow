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
