import type { AuthContext } from "../types";

/** Internal staff (anyone whose role isn't `client`). Used for staff-only routes. */
export function isInternal(role: string): boolean {
  return role !== "client";
}

/** Has the additive support-supervisor flag — gates the digest email feature.
 *  Clients can never be supervisors regardless of flag value. */
export function isSupportSupervisor(auth: AuthContext): boolean {
  return isInternal(auth.role) && auth.user.is_support_supervisor === 1;
}
