import type { Bindings } from "../types";
import { getAccountTeam, type AccountTeam } from "../services/dynamicsService";
import { findOrCreatePfUser } from "./crmUsers";

// How long a customer's account team is considered "fresh" before the next
// read triggers a background re-pull from Dynamics. The account team lives on
// the customer row and is shown via JOIN, so staleness is bounded by this.
const FRESH_TTL_SECONDS = 600; // 10 minutes
const freshKey = (accountId: string) => `accountteam:fresh:${accountId}`;

/**
 * Pulls the current account team from Dynamics and, when a customer is given,
 * writes the resolved AE/SA/CSM user ids onto that customer row. This is the
 * single source of the "snapshot CRM team into the DB" logic — shared by the
 * read-path SWR refresh, the daily cron sweep, and the manual force-refresh
 * endpoints so they can't drift apart. Returns the team it fetched.
 */
export async function syncAccountTeamToCustomer(
  env: Bindings,
  accountId: string,
  customerId: string | null,
): Promise<AccountTeam> {
  const team = await getAccountTeam(env, accountId);
  const [aeId, saId, csmId] = await Promise.all([
    findOrCreatePfUser(env.DB, team.ae_email, team.ae_name, "pf_ae"),
    findOrCreatePfUser(env.DB, team.sa_email, team.sa_name, "pf_sa"),
    findOrCreatePfUser(env.DB, team.csm_email, team.csm_name, "pf_csm"),
  ]);
  if (customerId) {
    // Preserve-on-null: only overwrite a role we actually resolved from CRM.
    // getAccountTeam returns an all-null team (it does NOT throw) when Dynamics
    // is unconfigured or the account fetch errors, and each role's email comes
    // from a separate best-effort systemusers fetch — so a null id means "we
    // couldn't read it", not "CRM has nobody". Writing those nulls unconditionally
    // would let an outage/misconfig blank every customer's AE/SA/CSM (and AE
    // drives access control). COALESCE keeps the last-known value in that case.
    await env.DB
      .prepare(
        `UPDATE customers SET
           pf_ae_user_id  = COALESCE(?, pf_ae_user_id),
           pf_sa_user_id  = COALESCE(?, pf_sa_user_id),
           pf_csm_user_id = COALESCE(?, pf_csm_user_id)
         WHERE id = ?`,
      )
      .bind(aeId, saId, csmId, customerId)
      .run();
  }
  return team;
}

/**
 * Stale-while-revalidate refresh for a customer's account team. The HTTP
 * response is never blocked: the customer row already holds the last-known
 * team, and this schedules a background pull from Dynamics when the freshness
 * marker has expired. The marker is set up-front so concurrent readers don't
 * each trigger a refresh. Best-effort — the daily cron sweep is the backstop.
 */
export function refreshAccountTeamIfStale(
  env: Bindings,
  ctx: ExecutionContext,
  accountId: string | null | undefined,
  customerId: string | null | undefined,
): void {
  if (!accountId || !customerId) return;
  ctx.waitUntil(
    (async () => {
      const key = freshKey(accountId);
      if (await env.KV.get(key)) return; // still fresh — nothing to do
      await env.KV.put(key, "1", { expirationTtl: FRESH_TTL_SECONDS });
      try {
        await syncAccountTeamToCustomer(env, accountId, customerId);
      } catch {
        // best-effort; the daily cron sweep will retry
      }
    })(),
  );
}

/**
 * Daily cron backstop: re-sync the account team for every customer linked to a
 * CRM account, so records nobody has opened recently still converge. Sequential
 * to stay gentle on the Dynamics API; per-customer failures are swallowed.
 */
export async function runAccountTeamSync(env: Bindings): Promise<void> {
  const { results } = await env.DB
    .prepare(
      "SELECT id, crm_account_id FROM customers WHERE crm_account_id IS NOT NULL AND crm_account_id != ''",
    )
    .all<{ id: string; crm_account_id: string }>();
  for (const cust of results ?? []) {
    try {
      await syncAccountTeamToCustomer(env, cust.crm_account_id, cust.id);
    } catch {
      // keep going — one bad account shouldn't stop the sweep
    }
  }
}
