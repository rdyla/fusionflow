import type { Bindings } from "../types";
import { getSharePointLocations } from "../services/graphService";

/**
 * Resolve a customer's SharePoint document-library root URL.
 *
 * Returns the cached `customers.sharepoint_url` when set; otherwise lazily
 * backfills it from the Dynamics document locations linked to the customer's
 * CRM account (most customers get a default SP location on CRM provisioning),
 * caches it, and returns it. Returns null when the customer has no CRM account
 * or Dynamics returns no document locations.
 *
 * Shared by the project- and solution-side SharePoint folder routes so both
 * resolve the same customer root identically.
 */
export async function resolveCustomerSharePointUrl(
  env: Bindings,
  db: D1Database,
  customerId: string
): Promise<string | null> {
  const customer = await db
    .prepare("SELECT sharepoint_url, crm_account_id FROM customers WHERE id = ? LIMIT 1")
    .bind(customerId)
    .first<{ sharepoint_url: string | null; crm_account_id: string | null }>();
  if (!customer) return null;
  if (customer.sharepoint_url) return customer.sharepoint_url;
  if (!customer.crm_account_id) return null;

  try {
    const locations = await getSharePointLocations(env, customer.crm_account_id);
    const first = locations[0]?.absoluteUrl;
    if (!first) return null;
    await db
      .prepare("UPDATE customers SET sharepoint_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(first, customerId)
      .run();
    return first;
  } catch (err) {
    console.warn(`[resolveCustomerSharePointUrl] Dynamics lookup failed for customer ${customerId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
