/**
 * Variant resolver — thin wrapper around the catalog assembler.
 *
 * Pre-catalog (PRs <= 309) this module held seven monolithic SowVariant
 * objects (one full Zoom UCaaS + six stubs) and merged them at runtime
 * for combo SOWs. The catalog refactor replaces both pieces with a
 * tagged-block model in `../catalog/` — entries declare which
 * (vendor, solution_types) they apply to, and the assembler composes a
 * full variant from the matching set. Combo SOWs become natural
 * composition; new tech types are additive (add catalog entries, no
 * new variant file).
 *
 * This file stays for back-compat with downstream callers that import
 * `resolveSowVariant`. Internally it just delegates.
 */

import type { SowVariant } from "../types";
import { assembleSowFromCatalog } from "../catalog/assemble";

export function resolveSowVariant(vendor: string | null, solutionTypes: string[]): SowVariant {
  return assembleSowFromCatalog(vendor, solutionTypes);
}
