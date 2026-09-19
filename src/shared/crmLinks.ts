/**
 * Deep links into Dynamics 365 ("CE") records.
 *
 * Requested by Brandon Keach via the roadmap table 2026-08-17 — "A link to the
 * CE resources: Opportunity, Case, Orders etc". Scoped to the resources we
 * actually hold an id for; see CRM_ENTITY below for why Orders isn't here.
 *
 * The URL form matches the one already used for case links in outbound email
 * (server/lib/notifications.ts), so there's one shape to change if the org
 * url ever moves.
 */

export const CRM_ORG_URL = "https://packetfusioncrm.crm.dynamics.com";

/** D365 logical entity names. `incident` is D365's name for a Case.
 *
 *  Deliberately does NOT include sales orders: nothing in CloudConnect stores
 *  an order id, and which entity holds them (stock `salesorder` vs a pfi_
 *  custom entity) and how they relate to a project is unconfirmed. Adding a
 *  guess here would produce links that 404 in front of a customer. */
export const CRM_ENTITY = {
  case: "incident",
  opportunity: "opportunity",
  account: "account",
} as const;

export type CrmEntity = keyof typeof CRM_ENTITY;

/** Build a CRM record deep link, or null when the id is missing — callers use
 *  the null to decide whether to render the link at all. */
export function crmRecordUrl(entity: CrmEntity, id: string | null | undefined): string | null {
  const trimmed = (id ?? "").trim();
  if (!trimmed) return null;
  return `${CRM_ORG_URL}/main.aspx?etn=${CRM_ENTITY[entity]}&id=${encodeURIComponent(trimmed)}&pagetype=entityrecord`;
}
