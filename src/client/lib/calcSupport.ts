export interface OppFormData {
  oppType: "UCaaS Only" | "CCaaS Only" | "UCaaS + CCaaS" | "Advanced Applications";
  ucaasUsers: number;
  ccaasLicensing: number;
  implSow: number;
  term: number;
  contractStart: string;
  contractEnd: string;
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
  customLines: { label: string; price: number }[];
  customerName: string;
  notes: string;
}

export interface OppCalcResult {
  ucaasSup: number;
  ccaasSup: number;
  implSup: number;
  msoSup: number;
  customTotal: number;
  annual: number;
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

  const customTotal = (d.customLines ?? []).reduce((sum, l) => sum + (Number(l.price) || 0), 0);
  const annual = ucaasSup + ccaasSup + implSup + advAppSup + (msoEnabled ? msoSup : 0) + customTotal;
  const tcv    = annual * term;

  return {
    ucaasSup, ccaasSup, implSup, advAppSup, msoSup, customTotal, annual, tcv,
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

export const DEFAULT_FORM_DATA: OppFormData = {
  oppType: "UCaaS Only",
  ucaasUsers: 0,
  ccaasLicensing: 0,
  implSow: 0,
  term: 1,
  contractStart: "",
  contractEnd: "",
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
  customerName: "",
  notes: "",
};
