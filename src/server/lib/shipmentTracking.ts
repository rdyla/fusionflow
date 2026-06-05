import type { Bindings } from "../types";
import { trackFedexShipment, isFedexConfigured } from "../services/fedexService";

type ShipmentRow = { id: string; tracking_number: string; carrier: string };

/**
 * Re-track one shipment against its carrier and cache the result. Best-effort:
 * on a failed/unconfigured carrier call it just stamps last_checked_at so a bad
 * number isn't retried every cycle. Shared by the API refresh routes and the
 * scheduled job.
 */
export async function refreshShipmentRow(env: Bindings, id: string): Promise<void> {
  const row = await env.DB
    .prepare("SELECT id, tracking_number, carrier FROM project_shipments WHERE id = ? LIMIT 1")
    .bind(id)
    .first<ShipmentRow>();
  if (!row) return;

  const result = row.carrier === "fedex" ? await trackFedexShipment(env, row.tracking_number) : null;
  if (!result) {
    await env.DB.prepare("UPDATE project_shipments SET last_checked_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
    return;
  }
  await env.DB
    .prepare("UPDATE project_shipments SET status = ?, status_detail = ?, estimated_delivery = ?, delivered = ?, last_checked_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(result.status, result.statusDetail, result.estimatedDelivery, result.delivered ? 1 : 0, id)
    .run();
}

/**
 * Scheduled refresh — runs on the 6-hour shipments cron. Re-tracks every
 * not-yet-delivered shipment not checked in the last ~5h (so a manual refresh
 * isn't immediately redone), then stops polling once delivered.
 */
export async function runShipmentTracking(env: Bindings): Promise<void> {
  if (!isFedexConfigured(env)) return;
  const rows = await env.DB
    .prepare("SELECT id FROM project_shipments WHERE delivered = 0 AND (last_checked_at IS NULL OR last_checked_at < datetime('now','-5 hours')) LIMIT 200")
    .all<{ id: string }>();
  for (const r of rows.results ?? []) {
    try { await refreshShipmentRow(env, r.id); } catch { /* keep going on the next shipment */ }
  }
}
