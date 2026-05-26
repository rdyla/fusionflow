/**
 * Variant resolver — picks the right SowVariant for a given solution
 * (vendor + solution_types). Combo solutions resolve to the primary
 * solution_type; merging logic for true combo SOWs (UCaaS + CCaaS in
 * one project) is a follow-up PR.
 */

import type { SowVariant } from "../types";
import { ZOOM_UCAAS_VARIANT } from "./zoomUcaas";
import {
  ZOOM_CCAAS_STUB,
  ZOOM_CI_STUB,
  ZOOM_VA_STUB,
  RC_UCAAS_STUB,
  RC_CCAAS_STUB,
  RC_AIR_STUB,
} from "./stubs";

/**
 * Resolve to the appropriate variant. Primary keys:
 *   vendor + first canonical solution_type
 *
 * Falls back to Zoom UCaaS for unknown combinations so the renderer
 * always has something to draw — the rendered doc surfaces a stub
 * banner so PMs know it's not customer-ready.
 */
export function resolveSowVariant(vendor: string | null, solutionTypes: string[]): SowVariant {
  const primary = (solutionTypes[0] ?? "").toLowerCase();
  const vendorKey = (vendor ?? "").toLowerCase();

  if (vendorKey === "zoom") {
    if (primary === "ucaas")    return ZOOM_UCAAS_VARIANT;
    if (primary === "ccaas")    return ZOOM_CCAAS_STUB;
    if (primary === "ci"
     || primary === "zoom_ra")  return ZOOM_CI_STUB;
    if (primary === "va"
     || primary === "zoom_va")  return ZOOM_VA_STUB;
  }
  if (vendorKey === "ringcentral" || vendorKey === "rc") {
    if (primary === "ucaas")    return RC_UCAAS_STUB;
    if (primary === "ccaas")    return RC_CCAAS_STUB;
    if (primary === "rc_air"
     || primary === "air")      return RC_AIR_STUB;
    if (primary === "ci"
     || primary === "rc_ace")   return ZOOM_CI_STUB; // shape is identical; vendor labels swap in via productLine
  }

  // Fallback — Zoom UCaaS shape with a stub banner is better than a blank doc.
  return { ...ZOOM_UCAAS_VARIANT, isStub: true };
}

export { ZOOM_UCAAS_VARIANT };
