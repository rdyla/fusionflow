export interface OppFormData {
  oppType: "UCaaS Only" | "CCaaS Only" | "UCaaS + CCaaS" | "Advanced Applications";
  ucaasUsers: number;
  ccaasLicensing: number;
  implSow: number;
  term: number;
  contractStart: string;
  contractEnd: string;
  /** When true, prorate Year 1 if the contract dates imply a partial first year
   *  (customer signing/renewing mid-cycle). No effect when the span is a whole
   *  number of years. Defaults on for new proposals; the calculator surfaces a
   *  checkbox when proration is applicable. */
  prorateFirstYear?: boolean;
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
  /** Recurring amount billed each contract year BEFORE discounts, index 0 = Year 1.
   *  Length === term. Equals `annual` for every year unless Year 1 is prorated
   *  (then billedByYear[0] = annual × firstYearFraction). The doc pricing schedule
   *  renders these as the per-year "Annual" column. */
  billedByYear: number[];
  /** True when the contract dates imply a partial first year (the span isn't a
   *  whole number of years for the given term) — i.e., proration COULD apply. */
  prorationApplicable: boolean;
  /** True when proration is both applicable AND enabled (form.prorateFirstYear). */
  firstYearProrated: boolean;
  /** Fraction of a full year that Year 1 is billed at (1 when not prorated). */
  firstYearFraction: number;
  /** Discount applied to each contract year, index 0 = Year 1. Length === term.
   *  A discount in year N reduces ONLY that year (e.g. a provider SPIFF offsets
   *  Year 1; a smaller credit in Year 2; full price thereafter). */
  discountByYear: number[];
  /** Sum of discountByYear — total promotional credit across the whole term. */
  totalDiscount: number;
  /** sum(billedByYear) − totalDiscount. */
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

/** Parse a yyyy-MM-dd string as a local date (avoids UTC-parse off-by-one). */
function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Calendar-aware span between two dates, in fractional years (whole years +
 *  the fractional remainder of the trailing partial year). Null if unparseable
 *  or end <= start. */
function spanInYears(startStr: string, endStr: string): number | null {
  const s = parseYmd(startStr);
  const e = parseYmd(endStr);
  if (!s || !e || e.getTime() <= s.getTime()) return null;
  let whole = e.getFullYear() - s.getFullYear();
  let anniv = new Date(s.getFullYear() + whole, s.getMonth(), s.getDate());
  if (anniv.getTime() > e.getTime()) {
    whole -= 1;
    anniv = new Date(s.getFullYear() + whole, s.getMonth(), s.getDate());
  }
  const nextAnniv = new Date(anniv.getFullYear() + 1, anniv.getMonth(), anniv.getDate());
  const frac = (e.getTime() - anniv.getTime()) / (nextAnniv.getTime() - anniv.getTime());
  return whole + frac;
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

  // First-year proration: when the contract dates span a non-whole number of
  // years for the term (customer joining/renewing mid-cycle), Year 1 is a stub.
  // stub = total span − the (term−1) full years that follow it.
  const span = spanInYears(d.contractStart, d.contractEnd);
  const stubYears = span != null ? span - (term - 1) : null;
  const EPS = 0.02; // treat ~whole-year spans as not partial (rounding tolerance)
  const prorationApplicable = stubYears != null && stubYears > EPS && stubYears < 1 - EPS;
  const firstYearProrated = prorationApplicable && d.prorateFirstYear === true;
  // The detected stub fraction (regardless of whether the toggle is on) so the
  // UI can show "would prorate to X" even when unchecked. 1 when not applicable.
  const firstYearFraction = prorationApplicable ? (stubYears as number) : 1;

  // Recurring amount billed per year (before discounts): Year 1 prorated only
  // when proration is actually enabled; all other years full.
  const billedByYear: number[] = [];
  for (let y = 0; y < term; y++) {
    billedByYear.push(y === 0 && firstYearProrated ? annual * firstYearFraction : annual);
  }

  // Per-year discount schedule: explicit yearly entries plus legacy custom-line
  // discounts folded into Year 1. Each entry reduces only its own year.
  const discountByYear: number[] = [];
  for (let y = 0; y < term; y++) {
    const yearly = Number(d.yearlyDiscounts?.[y]) || 0;
    discountByYear.push(yearly + (y === 0 ? customLineDiscount : 0));
  }
  const totalDiscount = discountByYear.reduce((a, b) => a + b, 0);
  const customTotal = chargeTotal;                       // recurring custom charges
  const tcv = billedByYear.reduce((a, b) => a + b, 0) - totalDiscount;

  return {
    ucaasSup, ccaasSup, implSup, advAppSup, msoSup, customTotal, preCustomAnnual, annual,
    billedByYear, prorationApplicable, firstYearProrated, firstYearFraction,
    discountByYear, totalDiscount, tcv,
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
  prorateFirstYear: true,
  customLines: [],
  yearlyDiscounts: [],
  customInclusions: [],
  customerName: "",
  notes: "",
};
