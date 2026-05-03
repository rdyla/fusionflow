/**
 * SOW add-on line items + pricing math.
 *
 * Mirrors the CloudSupport custom-line pattern (src/client/lib/calcSupport.ts):
 * a list of items where each is either an upcharge or a discount, evaluated
 * against a pre-add-on labor subtotal. The SOW model adds an `hours` kind
 * (priced at the blended rate) since SOW work is hour-based.
 *
 * Lives on `solutions.add_ons` (JSON), `solutions.blended_rate` (REAL),
 * `solutions.sow_total_amount` (REAL, derived). The total is recomputed on
 * solution PATCH that touches add_ons or blended_rate.
 */

export const ADD_ON_KINDS = ["hours", "amount", "discount_amount", "discount_percent"] as const;
export type AddOnKind = typeof ADD_ON_KINDS[number];

export const ADD_ON_KIND_LABELS: Record<AddOnKind, string> = {
  hours:            "Hours",
  amount:           "Charge ($)",
  discount_amount:  "Discount ($)",
  discount_percent: "Discount (%)",
};

export type AddOn = {
  id: string;
  label: string;
  kind: AddOnKind;
  /** hours: number of hours; amount/discount_amount: dollars; discount_percent: 0–100. */
  value: number;
  note?: string;
};

export const DEFAULT_BLENDED_RATE = 165;

export function isAddOnKind(v: unknown): v is AddOnKind {
  return typeof v === "string" && (ADD_ON_KINDS as readonly string[]).includes(v);
}

/** Tolerant reader: accepts JSON array string or array; drops malformed entries. */
export function parseAddOns(raw: unknown): AddOn[] {
  if (raw == null) return [];
  let arr: unknown = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (!s.startsWith("[")) return [];
    try { arr = JSON.parse(s); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: AddOn[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === "string" && obj.id ? obj.id : null;
    const label = typeof obj.label === "string" ? obj.label : "";
    const kind = isAddOnKind(obj.kind) ? obj.kind : null;
    const value = typeof obj.value === "number" && Number.isFinite(obj.value) ? obj.value : 0;
    const note = typeof obj.note === "string" && obj.note ? obj.note : undefined;
    if (!id || !kind) continue;
    out.push({ id, label, kind, value, ...(note ? { note } : {}) });
  }
  return out;
}

export function serializeAddOns(addOns: readonly AddOn[]): string {
  return JSON.stringify(addOns);
}

/** Per-add-on dollar effect against a pre-add-on labor subtotal at the given rate.
 *  Charges/hours are positive; discounts are negative. */
export function addOnDollar(addOn: AddOn, laborSubtotal: number, rate: number): number {
  const v = Number(addOn.value) || 0;
  switch (addOn.kind) {
    case "hours":            return v * rate;
    case "amount":           return v;
    case "discount_amount":  return -v;
    case "discount_percent": return -laborSubtotal * (v / 100);
  }
}

export interface SowTotalBreakdown {
  laborHours: number;
  laborSubtotal: number;
  addOnEffects: { id: string; dollar: number }[];
  addOnNet: number;
  total: number;
}

/** Compute the SOW total. `laborHours` is the sum of final_hours across all
 *  workstreams (and across all per-type labor estimates for multi-typed
 *  solutions). `rate` is `solutions.blended_rate`. */
export function calcSowTotal(
  laborHours: number,
  addOns: readonly AddOn[],
  rate: number,
): SowTotalBreakdown {
  const safeHours = Number(laborHours) || 0;
  const safeRate  = Number(rate) || DEFAULT_BLENDED_RATE;
  const laborSubtotal = safeHours * safeRate;
  const addOnEffects = addOns.map((a) => ({ id: a.id, dollar: addOnDollar(a, laborSubtotal, safeRate) }));
  const addOnNet = addOnEffects.reduce((sum, e) => sum + e.dollar, 0);
  return {
    laborHours: safeHours,
    laborSubtotal,
    addOnEffects,
    addOnNet,
    total: laborSubtotal + addOnNet,
  };
}

/** Server helper — extracts `add_ons` from a solutions row and returns the parsed array. */
export function readAddOnsFromRow<T extends { add_ons?: unknown }>(row: T): AddOn[] {
  return parseAddOns(row.add_ons);
}

/** Basic-mode SOW total. Uses the pre-computed basic-mode subtotal as the
 *  pre-add-on basis instead of (laborHours × rate). Add-on math is identical:
 *  hours-kind add-ons still bill at the blended rate, percentage discounts
 *  apply to the basic subtotal. Returned shape matches calcSowTotal so the
 *  UI doesn't need to fork. */
export function calcBasicSowTotal(
  basicSubtotal: number,
  addOns: readonly AddOn[],
  rate: number,
): SowTotalBreakdown {
  const safePrice = Number(basicSubtotal) || 0;
  const safeRate  = Number(rate) || DEFAULT_BLENDED_RATE;
  const addOnEffects = addOns.map((a) => ({ id: a.id, dollar: addOnDollar(a, safePrice, safeRate) }));
  const addOnNet = addOnEffects.reduce((sum, e) => sum + e.dollar, 0);
  return {
    laborHours: 0,
    laborSubtotal: safePrice,
    addOnEffects,
    addOnNet,
    total: safePrice + addOnNet,
  };
}
