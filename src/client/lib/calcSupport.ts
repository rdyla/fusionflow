export interface OppFormData {
  oppType: "UCaaS Only" | "CCaaS Only" | "UCaaS + CCaaS" | "Advanced Applications";
  ucaasUsers: number;
  ccaasLicensing: number;
  implSow: number;
  term: number;
  contractStart: string;
  contractEnd: string;
  /** Estimated close date for the bound D365 CloudCare opportunity (yyyy-MM-dd).
   *  Distinct from contract start/end — when the deal is expected to close. */
  estimatedCloseDate: string;
  /** am_revenuesource on the CloudCare opp: Installed Base (930680000) |
   *  New Logo (930680001) | null (unset). */
  revenueSource: number | null;
  /** Vendor for am_OpportunityVendors on the CloudCare opp. */
  oppVendor: "" | "zoom" | "zoom_resell" | "ringcentral";
  afterHoursRate: number;
  advancedTaskRate: number;
  msoEnabled: boolean;
  msoTier: string;
  msoFee: number;
  advAppEnabled: boolean;
  advAppPlatform: "zoom" | "ringcentral" | "other" | "";
  advAppProducts: string[];
  advAppOtherDesc: string;
  ovrUcaas: number | null;
  ovrCcaas: number | null;
  ovrImpl: number | null;
  ovrMso: number | null;
  ovrAdvApp: number | null;
  // Additional line items. kind defaults to "charge" when absent (backward compat
  // with pre-discount saved versions).
  //   charge           → price is a positive dollar amount added to annual
  //   discount_amount  → price is a dollar amount subtracted from annual
  //   discount_percent → price is a percentage (0-100) applied to the pre-custom
  //                      annual subtotal and subtracted
  customLines: { label: string; price: number; kind?: "charge" | "discount_amount" | "discount_percent" }[];
  /** Per-year discount schedule, index 0 = Year 1. A value reduces only that
   *  contract year (e.g. SPIFF offsets Year 1, smaller credit Year 2, full
   *  price thereafter). Sparse/short arrays are fine — missing years = no
   *  discount. Entries beyond `term` are ignored by the calc. */
  yearlyDiscounts?: number[];
  customInclusions: { label: string; blurb: string }[];
  customerName: string;
  notes: string;
}

export interface OppCalcResult {
  ucaasSup: number;
  ccaasSup: number;
  implSup: number;
  msoSup: number;
  customTotal: number;
  /** Per-year recurring total before custom lines (the standing service annual). */
  preCustomAnnual: number;
  /** Recurring annual investment (preCustomAnnual + recurring custom charges). */
  annual: number;
  /** Discount applied to each contract year, index 0 = Year 1. Length === term.
   *  A discount in year N reduces ONLY that year (e.g. a provider SPIFF offsets
   *  Year 1; a smaller credit in Year 2; full price thereafter). */
  discountByYear: number[];
  /** Sum of discountByYear — total promotional credit across the whole term. */
  totalDiscount: number;
  /** annual * term − totalDiscount. */
  tcv: number;
  ucaasCalc: number;
  ccaasCalc: number;
  implCalc: number;
  msoCalc: number;
  advAppCalc: number;
  advAppSup: number;
  advAppOverridden: boolean;
  ucaasOverridden: boolean;
  ccaasOverridden: boolean;
  implOverridden: boolean;
  msoOverridden: boolean;
  msoEnabled: boolean;
  minApplied: boolean;
}

export interface CsProposal {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  customerId: string | null;
  customerName: string | null;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
  latestCalc: OppCalcResult | null;
}

export interface CsVersion {
  id: string;
  versionNum: number;
  label: string | null;
  data: OppFormData;
  calc: OppCalcResult;
  savedAt: string;
  createdBy: string;
}

export interface CsProposalDetail extends CsProposal {
  versions: CsVersion[];
  /** Bound D365 CloudCare opportunity id, created on first version save once a
   *  CRM-linked customer is set. Null until then. */
  crmOpportunityId: string | null;
}

export function calcSupport(d: OppFormData): OppCalcResult {
  const type     = d.oppType;
  const users    = Number(d.ucaasUsers)    || 0;
  const ccaasLic = Number(d.ccaasLicensing) || 0;
  const implSow  = Number(d.implSow)        || 0;
  const term     = Number(d.term)           || 1;
  const msoEnabled = d.msoEnabled === true;
  const msoFeeRaw  = Number(d.msoFee)        || 0;

  let ucaasCalc = 0;
  let minApplied = false;
  if (type === "UCaaS Only" || type === "UCaaS + CCaaS") {
    ucaasCalc = users * 1 * 12;
    if (ucaasCalc < 2500 && users > 0) { ucaasCalc = 2500; minApplied = true; }
  }
  const ccaasCalc  = (type === "CCaaS Only" || type === "UCaaS + CCaaS") ? ccaasLic * 0.30 : 0;
  const implCalc   = (type === "CCaaS Only" || type === "UCaaS + CCaaS") ? implSow * 0.20 : 0;
  const isAdvApp   = type === "Advanced Applications" || (d.advAppEnabled === true && type === "UCaaS Only");
  const advAppCalc = isAdvApp ? 2500 + implSow * 0.20 : 0;
  const msoCalc    = msoEnabled ? msoFeeRaw : 0;

  const ucaasSup  = d.ovrUcaas  != null ? d.ovrUcaas  : ucaasCalc;
  const ccaasSup  = d.ovrCcaas  != null ? d.ovrCcaas  : ccaasCalc;
  const implSup   = d.ovrImpl   != null ? d.ovrImpl   : implCalc;
  const advAppSup = d.ovrAdvApp != null ? d.ovrAdvApp : advAppCalc;
  const msoSup    = d.ovrMso    != null ? d.ovrMso    : msoCalc;

  const preCustomAnnual = ucaasSup + ccaasSup + implSup + advAppSup + (msoEnabled ? msoSup : 0);
  // Custom charges recur every year. Discounts are NOT recurring — they apply
  // per-year via the yearlyDiscounts schedule (e.g. a SPIFF offsets Year 1 only).
  // Legacy custom-line discounts (discount_amount/percent) fold into Year 1.
  let chargeTotal = 0;
  let customLineDiscount = 0;
  for (const l of d.customLines ?? []) {
    const n = Number(l.price) || 0;
    const kind = l.kind ?? "charge";
    if (kind === "discount_percent") customLineDiscount += preCustomAnnual * (n / 100);
    else if (kind === "discount_amount") customLineDiscount += n;
    else chargeTotal += n;
  }
  const annual = preCustomAnnual + chargeTotal;          // recurring (discounts excluded)
  // Per-year discount schedule: explicit yearly entries plus legacy custom-line
  // discounts folded into Year 1. Each entry reduces only its own year.
  const discountByYear: number[] = [];
  for (let y = 0; y < term; y++) {
    const yearly = Number(d.yearlyDiscounts?.[y]) || 0;
    discountByYear.push(yearly + (y === 0 ? customLineDiscount : 0));
  }
  const totalDiscount = discountByYear.reduce((a, b) => a + b, 0);
  const customTotal = chargeTotal;                       // recurring custom charges
  const tcv = annual * term - totalDiscount;

  return {
    ucaasSup, ccaasSup, implSup, advAppSup, msoSup, customTotal, preCustomAnnual, annual, discountByYear, totalDiscount, tcv,
    ucaasCalc, ccaasCalc, implCalc, advAppCalc, msoCalc,
    advAppOverridden: d.ovrAdvApp != null,
    ucaasOverridden:  d.ovrUcaas  != null,
    ccaasOverridden:  d.ovrCcaas  != null,
    implOverridden:   d.ovrImpl   != null,
    msoOverridden:    d.ovrMso    != null,
    msoEnabled,
    minApplied,
  };
}

export function fmt(n: number): string {
  if (!n) return "$0";
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function fmtFull(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Formats a signed currency: negative numbers render as "-$1,234.56" (sign
 *  before the dollar symbol) instead of fmtFull's "$-1,234.56". */
export function fmtSigned(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "-$" : "$") + abs;
}

/** Dollar impact of a single custom line against a pre-custom annual subtotal.
 *  Charges are positive; discounts are negative. */
export function customLineDollar(
  line: { price: number; kind?: "charge" | "discount_amount" | "discount_percent" },
  preCustomAnnual: number,
): number {
  const n = Number(line.price) || 0;
  const kind = line.kind ?? "charge";
  if (kind === "discount_percent") return -preCustomAnnual * (n / 100);
  if (kind === "discount_amount")  return -n;
  return n;
}

export const DEFAULT_FORM_DATA: OppFormData = {
  oppType: "UCaaS Only",
  ucaasUsers: 0,
  ccaasLicensing: 0,
  implSow: 0,
  term: 1,
  contractStart: "",
  contractEnd: "",
  estimatedCloseDate: "",
  revenueSource: null,
  oppVendor: "",
  afterHoursRate: 165,
  advancedTaskRate: 145,
  msoEnabled: false,
  msoTier: "",
  msoFee: 0,
  advAppEnabled: false,
  advAppPlatform: "",
  advAppProducts: [],
  advAppOtherDesc: "",
  ovrUcaas:  null,
  ovrCcaas:  null,
  ovrImpl:   null,
  ovrMso:    null,
  ovrAdvApp: null,
  customLines: [],
  yearlyDiscounts: [],
  customInclusions: [],
  customerName: "",
  notes: "",
};
