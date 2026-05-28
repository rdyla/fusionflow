/**
 * Variant resolver — picks the right SowVariant for a given solution.
 *
 * Single-type solutions resolve to one variant directly. Combo solutions
 * (multiple canonical solution_types) resolve each type independently and
 * then run them through mergeVariants() to produce one unified combo
 * variant — stages merge with dedupe, scope-at-a-glance unions, snapshot
 * tiles get curated across all variants. See ../merge.ts.
 */

import type { SowVariant } from "../types";
import { mergeVariants } from "../merge";
import { ZOOM_UCAAS_VARIANT } from "./zoomUcaas";
import {
  ZOOM_CCAAS_STUB,
  ZOOM_CI_STUB,
  ZOOM_VA_STUB,
  RC_UCAAS_STUB,
  RC_CCAAS_STUB,
  RC_AIR_STUB,
} from "./stubs";

function resolveSingle(vendor: string | null, solutionType: string): SowVariant {
  const t = solutionType.toLowerCase();
  const v = (vendor ?? "").toLowerCase();

  if (v === "zoom") {
    if (t === "ucaas")  return ZOOM_UCAAS_VARIANT;
    if (t === "ccaas")  return ZOOM_CCAAS_STUB;
    if (t === "ci" || t === "zoom_ra") return ZOOM_CI_STUB;
    if (t === "va" || t === "zoom_va") return ZOOM_VA_STUB;
  }
  if (v === "ringcentral" || v === "rc") {
    if (t === "ucaas")  return RC_UCAAS_STUB;
    if (t === "ccaas")  return RC_CCAAS_STUB;
    if (t === "rc_air" || t === "air") return RC_AIR_STUB;
    if (t === "ci" || t === "rc_ace")  return ZOOM_CI_STUB;
  }
  // Fallback — Zoom UCaaS shape with a stub banner is better than a blank doc.
  return { ...ZOOM_UCAAS_VARIANT, isStub: true };
}

/**
 * Resolve to the appropriate variant. For combo solutions (multiple
 * solution_types), this returns the merged variant produced by
 * mergeVariants().
 */
export function resolveSowVariant(vendor: string | null, solutionTypes: string[]): SowVariant {
  const types = solutionTypes.filter((t) => !!t && t.trim().length > 0);
  if (types.length === 0) return { ...ZOOM_UCAAS_VARIANT, isStub: true };
  if (types.length === 1) return resolveSingle(vendor, types[0]);

  // Combo — resolve each, then merge. We preserve the caller's order so the
  // primary solution_type's content leads the combined product line / project
  // reference / cover.
  const variants = types.map((t) => resolveSingle(vendor, t));
  return mergeVariants(variants);
}

export { ZOOM_UCAAS_VARIANT };
