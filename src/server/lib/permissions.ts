import type { AppUser, AuthContext } from "../types";

/** Internal staff (anyone whose role isn't `client`). Used for staff-only routes. */
export function isInternal(role: string): boolean {
  return role !== "client";
}

/** Has the additive support-supervisor flag — gates the digest email feature.
 *  Clients can never be supervisors regardless of flag value. */
export function isSupportSupervisor(auth: AuthContext): boolean {
  return isInternal(auth.role) && auth.user.is_support_supervisor === 1;
}

/**
 * Every CRM account a client session is allowed to see, for use in
 * `dynamics_account_id IN (…)` scoping.
 *
 * Client visibility is account-scoped, and a contact can legitimately belong to
 * more than one customer — sister agencies that share staff (Placer County and
 * Lake County Superior Courts) put the same person on both. Sessions carry the
 * full list in `dynamics_account_ids`.
 *
 * Falls back to the single `dynamics_account_id` so KV sessions minted before
 * multi-account support keep working unchanged until their next login (sessions
 * are cached at login time and not re-resolved per request).
 *
 * An empty result means "scope to nothing" — callers must short-circuit rather
 * than build an `IN ()`, which is a SQL syntax error.
 */
export function clientAccountIds(user: AppUser): string[] {
  if (user.dynamics_account_ids && user.dynamics_account_ids.length > 0) {
    return user.dynamics_account_ids;
  }
  return user.dynamics_account_id ? [user.dynamics_account_id] : [];
}
