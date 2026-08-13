import { useState } from "react";
import { useToast } from "../ui/ToastProvider";
import { useIsMobile } from "../../hooks/useIsMobile";
import { todayLocalIso } from "../../lib/dates";

// ── Zoom 11x Agency SPIFF rate table ─────────────────────────────────────────
// Program period: Feb 1 – Jul 31, 2026. Source: Zoom 11x Agency SPIFF Terms & Conditions.

type ProductKey = "phone" | "cc" | "workvivo" | "wholestack";
type ContractKey = "24-35" | "36plus";
type BillingKey = "monthly" | "annual" | "annualPrepay";
type InnerTab = "upload" | "calc" | "log";

type RateOption = { contract: ContractKey; billing: BillingKey; multiplier: number };

const RATES: Record<ProductKey, { label: string; options: RateOption[] }> = {
  phone: {
    label: "Zoom Phone",
    options: [
      { contract: "24-35", billing: "monthly", multiplier: 4 },
      { contract: "24-35", billing: "annual", multiplier: 4 },
      { contract: "36plus", billing: "monthly", multiplier: 6 },
      { contract: "36plus", billing: "annual", multiplier: 6 },
    ],
  },
  cc: {
    label: "Zoom Contact Center and/or Zoom Virtual Agent",
    options: [
      { contract: "24-35", billing: "monthly", multiplier: 4 },
      { contract: "24-35", billing: "annual", multiplier: 6 },
      { contract: "36plus", billing: "annual", multiplier: 9 },
    ],
  },
  workvivo: {
    label: "Workvivo Platform / Add-on",
    options: [
      { contract: "36plus", billing: "monthly", multiplier: 4 },
      { contract: "36plus", billing: "annual", multiplier: 4 },
    ],
  },
  wholestack: {
    label: "The Whole Stack",
    options: [{ contract: "36plus", billing: "annualPrepay", multiplier: 11 }],
  },
};

const CONTRACT_LABELS: Record<ContractKey, string> = {
  "24-35": "24–35 months",
  "36plus": "36+ months",
};
const BILLING_LABELS: Record<BillingKey, string> = {
  monthly: "Monthly",
  annual: "Annual",
  annualPrepay: "Annual Prepay",
};

const ELIGIBILITY_ITEMS: { id: string; label: string; warning: string }[] = [
  {
    id: "elig1",
    label: "This is a Newly Invoiced Sale or Upsell (not a renewal, overage, support, or professional services)",
    warning: "Deal may not be a Newly Invoiced Sale or Upsell",
  },
  {
    id: "elig2",
    label: "Not a Partner Assist, Renewal, or Bill-on-Behalf opportunity",
    warning: "Deal may be a Partner Assist, Renewal, or Bill-on-Behalf opportunity",
  },
  {
    id: "elig3",
    label: "Discount off list price is less than 50%",
    warning: "Discount off list price may be 50% or greater",
  },
  {
    id: "elig4",
    label: "Not a Zoom EDU SKU (unless Zoom Workplace for Education)",
    warning: "Deal may involve an ineligible Zoom EDU SKU",
  },
  {
    id: "elig5",
    label: "Deal Registration is submitted and the deal will close within the Program Period (Feb 1 – Jul 31, 2026)",
    warning: "Deal Registration may not be submitted, or the deal may close outside the Program Period",
  },
  {
    id: "elig6",
    label: "This SPIFF is not being combined/stacked with any other Zoom Workplace, Phone, or Contact Center incentive",
    warning: "This SPIFF may be improperly stacked with another incentive",
  },
];

type Extraction = {
  customer: string;
  product: ProductKey;
  contract: ContractKey;
  billing: BillingKey;
  mrr: string;
  freeMonths: string;
};

type ParseStatus =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

type LogEntry = {
  date: string;
  rep: string;
  customer: string;
  product: string;
  multiplier: string;
  qualifyingMrr: number;
  payout: number;
  flags: string;
};

type CalcResult = {
  amount: number;
  tierLabel: string;
  breakdownRows: { label: string; value: string }[];
  warnings: string[];
  upfrontNote: string | null;
  lastCalc: LogEntry;
};

// ── pdf.js loader (CDN, lazy, cached across mounts) ──────────────────────────
const PDFJS_VERSION = "3.11.174";
let pdfJsLoadPromise: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
  const existing = (window as any).pdfjsLib;
  if (existing) return Promise.resolve(existing);
  if (pdfJsLoadPromise) return pdfJsLoadPromise;
  pdfJsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
      resolve(lib);
    };
    script.onerror = () => reject(new Error("Failed to load pdf.js"));
    document.head.appendChild(script);
  });
  return pdfJsLoadPromise;
}

function parseMMDDYYYY(str: string): Date | null {
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const [mm, dd, yyyy] = parts.map((n) => parseInt(n, 10));
  return new Date(yyyy, mm - 1, dd);
}

// Best-effort field extraction from a Zoom Order/Amendment Form's text layer.
// Draft only — every field is editable before being sent to the calculator.
function extractFields(text: string): { extraction: Extraction; warnings: string[] } {
  const warnings: string[] = [];

  let customer = "";
  const custMatch = text.match(/Customer:\s*([^\n:]+?)(?=\s*(?:Account Legal Name|Contact Name|Address|$))/i);
  if (custMatch) customer = custMatch[1].trim();
  if (!customer) warnings.push("Could not confidently detect the customer name — please fill in manually.");

  let contract: ContractKey | "" = "";
  const termMatch = text.match(/Initial Paid Subscription Term:\s*(\d+)\s*Months?/i);
  const termMonths = termMatch ? parseInt(termMatch[1], 10) : null;
  if (termMonths !== null) {
    if (termMonths >= 36) contract = "36plus";
    else if (termMonths >= 24) contract = "24-35";
    else warnings.push(`Detected a ${termMonths}-month term, which is below the 24-month minimum in the SPIFF table — this deal may not qualify.`);
  } else {
    warnings.push("Could not detect the subscription term length — please confirm contract length manually.");
  }

  let freeMonths = 0;
  const freeDateMatch = text.match(/Free Period Start Date:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const paidDateMatch = text.match(/Paid Period Start Date:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (freeDateMatch && paidDateMatch) {
    const fd = parseMMDDYYYY(freeDateMatch[1]);
    const pd = parseMMDDYYYY(paidDateMatch[1]);
    if (fd && pd) {
      freeMonths = Math.max(0, pd.getFullYear() * 12 + pd.getMonth() - (fd.getFullYear() * 12 + fd.getMonth()));
    }
  }

  let mrr = 0;
  let billing: BillingKey = "monthly";
  const monthlySpendMatch = text.match(/Monthly\s*(?:\(Incremental\))?\s*Spend\s*:?\s*USD\s*([\d,]+\.\d{2})/i);
  const annualSpendMatch = text.match(/Annual\s*(?:\(Incremental\))?\s*Spend\s*:?\s*USD\s*([\d,]+\.\d{2})/i);
  if (monthlySpendMatch) {
    mrr = parseFloat(monthlySpendMatch[1].replace(/,/g, ""));
    billing = "monthly";
  } else if (annualSpendMatch) {
    mrr = parseFloat(annualSpendMatch[1].replace(/,/g, "")) / 12;
    billing = "annual";
    warnings.push("MRR was derived from an annual spend figure divided by 12 — please verify.");
  } else {
    warnings.push("Could not detect a Monthly or Annual Incremental Spend figure — please enter Qualifying MRR manually.");
  }

  const monthCount = (text.match(/\bMonth\b/g) ?? []).length;
  const yearCount = (text.match(/\bYear\b/g) ?? []).length;
  if (yearCount > monthCount) billing = "annual";

  let product: ProductKey | "" = "";
  const hasWholeStackHints =
    /Whole Stack/i.test(text) &&
    /Contact Center/i.test(text) &&
    /(Workplace Business Plus|Workplace Enterprise Plus|Workplace Enterprise Premier)/i.test(text);
  const hasCC = /Contact Center|Virtual Agent/i.test(text);
  const hasPhone = /Zoom Phone/i.test(text);
  const hasWorkvivo = /Workvivo/i.test(text);
  const hasWorkplaceBundle = /Workplace (Business|Enterprise)/i.test(text);

  if (hasWholeStackHints) {
    product = "wholestack";
  } else if (hasWorkvivo && !hasPhone && !hasCC) {
    product = "workvivo";
  } else if (hasCC && !hasPhone) {
    product = "cc";
  } else if (hasPhone) {
    product = "phone";
    if (hasWorkplaceBundle) {
      warnings.push(
        "This quote mentions both Zoom Phone and a Workplace bundle — check the \"Workplace bundle / 40% rule\" box in the Calculator if this Phone deal doesn't qualify for The Whole Stack."
      );
    }
  } else {
    warnings.push("Could not confidently detect the product/SKU category from this document — please select it manually.");
  }

  return {
    extraction: {
      customer,
      product: product || "phone",
      contract: contract || "36plus",
      billing,
      mrr: mrr ? String(Math.round(mrr)) : "",
      freeMonths: String(freeMonths),
    },
    warnings,
  };
}

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// ── Shared style fragments ───────────────────────────────────────────────────
const NAVY = "#003B5C";
const GREEN = "#17C662";
const GREY = "#D9E1E2";

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: "20px 22px",
  marginBottom: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  border: `1px solid ${GREY}`,
};
const cardTitleStyle: React.CSSProperties = {
  margin: "0 0 4px 0",
  fontSize: 16,
  color: NAVY,
  borderLeft: `4px solid ${GREEN}`,
  paddingLeft: 10,
};
const cardSubStyle: React.CSSProperties = { fontSize: 12.5, color: "#5a6b70", margin: "0 0 16px 14px" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4, marginTop: 14 };
const hintStyle: React.CSSProperties = { fontSize: 12, color: "#5a6b70", marginTop: 4 };
const checkRowStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, fontSize: 13.5 };

function noteBoxStyle(variant: "info" | "warn" | "danger"): React.CSSProperties {
  if (variant === "danger") {
    return { background: "#FFF6F5", border: "1px solid #C0392B", borderRadius: 6, padding: "10px 12px", marginTop: 10, fontSize: 13, color: "#C0392B" };
  }
  if (variant === "warn") {
    return { background: "#FFF9E8", border: "1px solid #C9971C", borderRadius: 6, padding: "10px 12px", marginTop: 10, fontSize: 13, color: "#8a6d00" };
  }
  return { background: "#EAF7EF", border: `1px solid ${GREEN}`, borderRadius: 6, padding: "10px 12px", marginTop: 10, fontSize: 13, color: "#0d6b34" };
}

export default function CommissionsCalculator() {
  const { showToast } = useToast();
  const isMobile = useIsMobile();

  const [innerTab, setInnerTab] = useState<InnerTab>("upload");

  // Upload tab
  const [parseStatus, setParseStatus] = useState<ParseStatus>({ kind: "idle" });
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [extractWarnings, setExtractWarnings] = useState<string[]>([]);

  // Calculator tab
  const [fromUpload, setFromUpload] = useState(false);
  const [product, setProduct] = useState<ProductKey | "">("");
  const [contract, setContract] = useState<ContractKey | "">("");
  const [billing, setBilling] = useState<BillingKey | "">("");
  const [wsTier, setWsTier] = useState("");
  const [wsZcx, setWsZcx] = useState(false);
  const [phoneInWorkplace, setPhoneInWorkplace] = useState(false);
  const [mrr, setMrr] = useState("");
  const [freeMonths, setFreeMonths] = useState("0");
  const [recognizedMrr, setRecognizedMrr] = useState("");
  const [eligibility, setEligibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ELIGIBILITY_ITEMS.map((item) => [item.id, true]))
  );
  const [repName, setRepName] = useState("");
  const [custName, setCustName] = useState("");

  const [result, setResult] = useState<CalcResult | null>(null);

  // Deal log — session-only, matches the original tool (export before closing the tab)
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  function handleProductChange(next: string) {
    const value = next as ProductKey | "";
    setProduct(value);
    setContract("");
    setBilling("");
    setWsTier("");
    setWsZcx(false);
    setPhoneInWorkplace(false);
  }

  async function handleFileSelected(file: File) {
    setExtraction(null);
    setParseStatus({ kind: "loading", message: `Reading ${file.name}...` });
    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((it: any) => it.str).join(" ");
        fullText += pageText + "\n";
      }
      setParseStatus({ kind: "done", message: `Parsed ${file.name} (${pdf.numPages} page${pdf.numPages > 1 ? "s" : ""}).` });
      const { extraction: ex, warnings } = extractFields(fullText);
      setExtraction(ex);
      setExtractWarnings(warnings);
    } catch (err) {
      setParseStatus({
        kind: "error",
        message: `Could not read this PDF (${err instanceof Error ? err.message : "unknown error"}). You can still fill out the Calculator tab manually.`,
      });
    }
  }

  function sendExtractedToCalculator() {
    if (!extraction) return;
    setProduct(extraction.product);
    setContract(extraction.contract);
    setBilling(extraction.billing);
    setMrr(extraction.mrr);
    setFreeMonths(extraction.freeMonths);
    setCustName(extraction.customer);
    setFromUpload(true);
    setInnerTab("calc");
  }

  const contractOptions = product ? [...new Set(RATES[product].options.map((o) => o.contract))] : [];
  const billingOptions = product ? [...new Set(RATES[product].options.map((o) => o.billing))] : [];
  const matchedRate =
    product && contract && billing ? RATES[product].options.find((o) => o.contract === contract && o.billing === billing) : undefined;
  const multiplierPreviewText =
    product && contract && billing
      ? matchedRate
        ? `Matched tier: ${RATES[product].label} – ${CONTRACT_LABELS[contract]}, ${BILLING_LABELS[billing]} – ${matchedRate.multiplier}X MRR`
        : "This contract length / billing terms combination is not listed in the SPIFF table for this product."
      : "";

  const mrrLabel = product === "phone" && phoneInWorkplace ? "Total Zoom Workplace MRR ($)" : "Qualifying MRR ($)";
  const mrrHint =
    product === "workvivo"
      ? "Minimum deal size for Workvivo is $4,500. Enter the contractual MRR."
      : product === "wholestack"
      ? "Minimum $5,000 MRR required for The Whole Stack. Enter total qualifying MRR."
      : "Enter the contractual MRR for the Qualified SKUs (list price less discounts).";

  const freeMonthsNum = parseFloat(freeMonths) || 0;
  const showRecognizedField = freeMonthsNum > 6;
  const freePeriodNote =
    freeMonthsNum > 6
      ? `${freeMonthsNum} free/credit months exceeds the 6-month threshold — SPIFF must be paid on recognized revenue, which removes the value of the free months. Enter the recognized MRR below.`
      : freeMonthsNum > 0
      ? `${freeMonthsNum} free/credit month(s) — 6 or fewer, so SPIFF is paid on contractual MRR (no adjustment needed).`
      : "";

  function handleCalculate() {
    if (!product || !contract || !billing) {
      showToast("Please select a product, contract length, and billing terms before calculating.", "error");
      return;
    }
    const match = RATES[product].options.find((o) => o.contract === contract && o.billing === billing);
    if (!match) {
      showToast("No SPIFF rate exists for that combination of contract length and billing terms.", "error");
      return;
    }

    const warnings: string[] = [];
    const mrrNum = parseFloat(mrr) || 0;
    const recognizedNum = parseFloat(recognizedMrr) || 0;
    const multiplier = match.multiplier;
    const baseMrr = freeMonthsNum > 6 ? recognizedNum : mrrNum;
    let qualifyingMrr = baseMrr;
    let tierLabel = `${RATES[product].label} – ${CONTRACT_LABELS[contract]}, ${BILLING_LABELS[billing]}`;

    if (product === "phone" && phoneInWorkplace) {
      qualifyingMrr = baseMrr * 0.4;
      tierLabel += " (Workplace bundle – 40% Qualifying MRR rule applied)";
    }

    if (product === "wholestack") {
      if (!wsTier) warnings.push("Whole Stack requires a selected Workplace tier (Business Plus / Enterprise Plus / Enterprise Premier).");
      if (!wsZcx) warnings.push("Whole Stack requires ZCX to account for at least 10% of total license count — this is unchecked.");
      if (baseMrr < 5000) warnings.push("Whole Stack requires a $5,000 MRR minimum — entered MRR is below this threshold.");
    }
    if (product === "workvivo" && baseMrr < 4500) {
      warnings.push("Workvivo requires a minimum deal size of $4,500 — entered MRR is below this threshold.");
    }

    ELIGIBILITY_ITEMS.forEach((item) => {
      if (!eligibility[item.id]) warnings.push(item.warning);
    });

    const payout = multiplier * qualifyingMrr;

    let upfrontNote: string | null = null;
    if (freeMonthsNum >= 6 && mrrNum >= 2000) {
      upfrontNote = `Upfront bonus may apply: deals with ≥6 free/credit months and ≥$2,000 MRR ($24k ARR) qualify for 50% of SPIFF paid upfront (${fmtCurrency(
        payout * 0.5
      )}) and 50% on the standard schedule (${fmtCurrency(
        payout * 0.5
      )}). Downsells ≤50% before service start will be recalculated; downsells >50%, non-payment, or termination may trigger full clawback.`;
    }

    const lastCalc: LogEntry = {
      date: new Date().toLocaleDateString(),
      rep: repName || "—",
      customer: custName || "—",
      product: tierLabel,
      multiplier: `${multiplier}X`,
      qualifyingMrr,
      payout,
      flags: warnings.length ? `${warnings.length} flag(s)` : "None",
    };

    setResult({
      amount: payout,
      tierLabel,
      breakdownRows: [
        { label: "Qualifying MRR used", value: fmtCurrency(qualifyingMrr) },
        { label: "SPIFF Multiplier", value: `${multiplier}X` },
        { label: "Total SPIFF Payout", value: fmtCurrency(payout) },
      ],
      warnings,
      upfrontNote,
      lastCalc,
    });
  }

  function addToLog() {
    if (!result) return;
    setLogEntries((prev) => [...prev, result.lastCalc]);
    setInnerTab("log");
  }

  function clearLog() {
    if (logEntries.length === 0) return;
    if (window.confirm("Clear all logged deals? This cannot be undone (export first if needed).")) {
      setLogEntries([]);
    }
  }

  function exportCsv() {
    if (logEntries.length === 0) {
      showToast("No deals to export yet.", "error");
      return;
    }
    const headers = ["Date", "Rep", "Customer", "Product", "Multiplier", "Qualifying MRR", "SPIFF Payout", "Flags"];
    const rows = logEntries.map((e) =>
      [e.date, e.rep, e.customer, `"${e.product.replace(/"/g, '""')}"`, e.multiplier, e.qualifyingMrr, e.payout, `"${e.flags}"`].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `packetfusion-spiff-log-${todayLocalIso()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const innerTabs: { id: InnerTab; label: string }[] = [
    { id: "upload", label: "Upload Quote" },
    { id: "calc", label: "Calculator" },
    { id: "log", label: "Deal Log" },
  ];

  return (
    <div>
      <style>{`
        @keyframes spiffSpin { to { transform: rotate(360deg); } }
        .spiff-spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid ${GREY}; border-top-color: ${NAVY}; border-radius: 50%;
          animation: spiffSpin 0.8s linear infinite; vertical-align: middle; margin-right: 6px;
        }
      `}</style>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Zoom 11x Agency SPIFF Calculator</div>
        <div style={{ fontSize: 12, color: "#5a6b70" }}>Program Period: Feb 1 – Jul 31, 2026 · Zoom Confidential: Channel Partner Use Only</div>
      </div>

      {/* Inner tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `2px solid ${GREY}`, flexWrap: "wrap" }}>
        {innerTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setInnerTab(t.id)}
            style={{
              background: "none",
              border: "none",
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 700,
              color: NAVY,
              cursor: "pointer",
              borderBottom: innerTab === t.id ? `3px solid ${GREEN}` : "3px solid transparent",
              marginBottom: -2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* UPLOAD PANEL */}
      {innerTab === "upload" && (
        <div>
          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>Upload a Zoom Quote</h2>
            <p style={cardSubStyle}>
              Upload a Zoom Order Form or Amendment Form (PDF) and this will attempt to pull the fields needed for the SPIFF calculation.
              Always review extracted values before calculating — this is a draft, not a guarantee.
            </p>

            <div style={{ border: "2px dashed #b9c6c9", borderRadius: 8, padding: "28px 20px", textAlign: "center", color: "#5a6b70", fontSize: 13.5 }}>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileSelected(file);
                }}
                className="ms-input"
              />
              <div style={hintStyle}>
                Accepts Zoom Order Forms / Amendment Forms in PDF format. Nothing is uploaded anywhere — the file is read entirely in your
                browser.
              </div>
            </div>

            {parseStatus.kind !== "idle" && (
              <div style={{ marginTop: 14, fontSize: 13.5, color: parseStatus.kind === "error" ? "#C0392B" : undefined }}>
                {parseStatus.kind === "loading" && <span className="spiff-spinner" />}
                {parseStatus.message}
              </div>
            )}
          </div>

          {extraction && (
            <div style={cardStyle}>
              <h2 style={cardTitleStyle}>Extracted Details — Review Before Using</h2>
              <p style={cardSubStyle}>Edit anything that looks wrong. Product/contract/billing guesses are based on keyword matching and may need correcting.</p>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "8px 4px", borderBottom: `1px solid ${GREY}`, fontWeight: 700, color: NAVY, width: "38%" }}>Customer</td>
                    <td style={{ padding: "8px 4px", borderBottom: `1px solid ${GREY}` }}>
                      <input
                        type="text"
                        className="ms-input"
                        value={extraction.customer}
                        onChange={(e) => setExtraction({ ...extraction, customer: e.target.value })}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "8px 4px", borderBottom: `1px solid ${GREY}`, fontWeight: 700, color: NAVY }}>Detected Product</td>
                    <td style={{ padding: "8px 4px", borderBottom: `1px solid ${GREY}` }}>
                      <select
                        className="ms-input"
                        value={extraction.product}
                        onChange={(e) => setExtraction({ ...extraction, product: e.target.value as ProductKey })}
                      >
                        <option value="phone">Zoom Phone</option>
                        <option value="cc">Zoom Contact Center and/or Zoom Virtual Agent</option>
                        <option value="workvivo">Workvivo Platform / Add-on</option>
                        <option value="wholestack">The Whole Stack</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "8px 4px", borderBottom: `1px solid ${GREY}`, fontWeight: 700, color: NAVY }}>Contract Length</td>
                    <td style={{ padding: "8px 4px", borderBottom: `1px solid ${GREY}` }}>
                      <select
                        className="ms-input"
                        value={extraction.contract}
                        onChange={(e) => setExtraction({ ...extraction, contract: e.target.value as ContractKey })}
                      >
                        <option value="24-35">24–35 months</option>
                        <option value="36plus">36+ months</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "8px 4px", borderBottom: `1px solid ${GREY}`, fontWeight: 700, color: NAVY }}>Billing Terms</td>
                    <td style={{ padding: "8px 4px", borderBottom: `1px solid ${GREY}` }}>
                      <select
                        className="ms-input"
                        value={extraction.billing}
                        onChange={(e) => setExtraction({ ...extraction, billing: e.target.value as BillingKey })}
                      >
                        <option value="monthly">Monthly</option>
                        <option value="annual">Annual</option>
                        <option value="annualPrepay">Annual Prepay</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "8px 4px", borderBottom: `1px solid ${GREY}`, fontWeight: 700, color: NAVY }}>Qualifying MRR ($)</td>
                    <td style={{ padding: "8px 4px", borderBottom: `1px solid ${GREY}` }}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="ms-input"
                        value={extraction.mrr}
                        onChange={(e) => setExtraction({ ...extraction, mrr: e.target.value })}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "8px 4px", fontWeight: 700, color: NAVY }}>Free / Credit-in-Lieu Months</td>
                    <td style={{ padding: "8px 4px" }}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="ms-input"
                        value={extraction.freeMonths}
                        onChange={(e) => setExtraction({ ...extraction, freeMonths: e.target.value })}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>

              <div style={noteBoxStyle("warn")}>
                {extractWarnings.length ? (
                  <>
                    <strong>Review needed:</strong>
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      {extractWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  "Extraction looked clean, but please still double-check every field — quote formats vary."
                )}
              </div>

              <button className="ms-btn-primary" style={{ marginTop: 18 }} onClick={sendExtractedToCalculator}>
                Use These Values in Calculator
              </button>
            </div>
          )}
        </div>
      )}

      {/* CALCULATOR PANEL */}
      {innerTab === "calc" && (
        <div>
          {fromUpload && (
            <div style={noteBoxStyle("info")}>Values below were pre-filled from an uploaded quote. Double-check everything before calculating.</div>
          )}

          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>Deal Details</h2>
            <p style={cardSubStyle}>Select the product and terms to determine the SPIFF multiplier.</p>

            <label style={{ ...labelStyle, marginTop: 0 }}>Product / SKU Category</label>
            <select className="ms-input" value={product} onChange={(e) => handleProductChange(e.target.value)}>
              <option value="">Select a product...</option>
              <option value="phone">Zoom Phone</option>
              <option value="cc">Zoom Contact Center and/or Zoom Virtual Agent</option>
              <option value="workvivo">Workvivo Platform / Add-on</option>
              <option value="wholestack">The Whole Stack (Workplace + Contact Center)</option>
            </select>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Contract Length</label>
                <select className="ms-input" value={contract} onChange={(e) => setContract(e.target.value as ContractKey)} disabled={!product}>
                  <option value="">{product ? "Select..." : "Select product first"}</option>
                  {contractOptions.map((c) => (
                    <option key={c} value={c}>
                      {CONTRACT_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Billing Terms</label>
                <select className="ms-input" value={billing} onChange={(e) => setBilling(e.target.value as BillingKey)} disabled={!product}>
                  <option value="">{product ? "Select..." : "Select product first"}</option>
                  {billingOptions.map((b) => (
                    <option key={b} value={b}>
                      {BILLING_LABELS[b]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {multiplierPreviewText && <div style={noteBoxStyle("info")}>{multiplierPreviewText}</div>}

            {product === "wholestack" && (
              <div>
                <label style={labelStyle}>Workplace Tier</label>
                <select className="ms-input" value={wsTier} onChange={(e) => setWsTier(e.target.value)}>
                  <option value="">Select tier...</option>
                  <option value="bp">Workplace Business Plus</option>
                  <option value="ep">Workplace Enterprise Plus</option>
                  <option value="epp">Workplace Enterprise Premier</option>
                </select>
                <div style={checkRowStyle}>
                  <input type="checkbox" checked={wsZcx} onChange={(e) => setWsZcx(e.target.checked)} style={{ marginTop: 2 }} />
                  <label style={{ margin: 0, fontWeight: 400, color: "#1a2429" }}>
                    Zoom Contact Center (ZCX) accounts for at least 10% of total license count
                  </label>
                </div>
              </div>
            )}

            {product === "phone" && (
              <div style={checkRowStyle}>
                <input type="checkbox" checked={phoneInWorkplace} onChange={(e) => setPhoneInWorkplace(e.target.checked)} style={{ marginTop: 2 }} />
                <label style={{ margin: 0, fontWeight: 400, color: "#1a2429" }}>
                  This is a Zoom Workplace bundle that includes Zoom Phone but does NOT qualify for The Whole Stack (Qualifying MRR = 40% of
                  total Workplace MRR)
                </label>
              </div>
            )}

            <label style={labelStyle}>{mrrLabel}</label>
            <input type="number" min={0} step={1} placeholder="e.g. 2500" className="ms-input" value={mrr} onChange={(e) => setMrr(e.target.value)} />
            <div style={hintStyle}>{mrrHint}</div>
          </div>

          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>Free Periods / Credit-in-Lieu</h2>
            <p style={cardSubStyle}>Impacts how Qualifying MRR is calculated and whether an upfront bonus applies.</p>

            <label style={{ ...labelStyle, marginTop: 0 }}>Free Months or Credit-in-Lieu Months</label>
            <input type="number" min={0} step={1} className="ms-input" value={freeMonths} onChange={(e) => setFreeMonths(e.target.value)} />

            {freePeriodNote && <div style={noteBoxStyle("info")}>{freePeriodNote}</div>}

            {showRecognizedField && (
              <div>
                <label style={labelStyle}>Recognized Revenue MRR ($)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="MRR after removing free-month value"
                  className="ms-input"
                  value={recognizedMrr}
                  onChange={(e) => setRecognizedMrr(e.target.value)}
                />
                <div style={hintStyle}>More than 6 free/credit months means SPIFF is paid on recognized revenue, not contractual MRR.</div>
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>Eligibility Checklist</h2>
            <p style={cardSubStyle}>Per the Program Guide. Unchecked items will flag as warnings, not block calculation.</p>

            {ELIGIBILITY_ITEMS.map((item) => (
              <div key={item.id} style={checkRowStyle}>
                <input
                  type="checkbox"
                  checked={eligibility[item.id]}
                  onChange={(e) => setEligibility({ ...eligibility, [item.id]: e.target.checked })}
                  style={{ marginTop: 2 }}
                />
                <label style={{ margin: 0, fontWeight: 400, color: "#1a2429" }}>{item.label}</label>
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>
              Rep / Deal Info <span style={{ fontSize: 11, color: "#5a6b70", fontWeight: 400 }}>(optional — used for the Deal Log)</span>
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
              <div>
                <label style={{ ...labelStyle, marginTop: 0 }}>Rep Name</label>
                <input type="text" placeholder="e.g. Jordan Smith" className="ms-input" value={repName} onChange={(e) => setRepName(e.target.value)} />
              </div>
              <div>
                <label style={{ ...labelStyle, marginTop: 0 }}>Customer / Deal Name</label>
                <input
                  type="text"
                  placeholder="e.g. City of Mesa"
                  className="ms-input"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                />
              </div>
            </div>
          </div>

          <button className="ms-btn-primary" onClick={handleCalculate}>
            Calculate SPIFF
          </button>

          {result && (
            <div style={{ ...cardStyle, marginTop: 16 }}>
              <div style={{ background: NAVY, color: "#fff", borderRadius: 8, padding: "20px 22px", marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, color: GREY, textTransform: "uppercase", letterSpacing: "0.5px" }}>Estimated SPIFF Payout</div>
                <div style={{ fontSize: 34, fontWeight: 700, color: GREEN }}>{fmtCurrency(result.amount)}</div>
                <div style={{ marginTop: 10, fontSize: 13.5, color: "#fff" }}>{result.tierLabel}</div>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <tbody>
                  {result.breakdownRows.map((row) => (
                    <tr key={row.label}>
                      <td style={{ padding: "7px 4px", borderBottom: `1px solid ${GREY}` }}>{row.label}</td>
                      <td style={{ padding: "7px 4px", borderBottom: `1px solid ${GREY}`, textAlign: "right", fontWeight: 700, color: NAVY }}>
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {result.warnings.length > 0 && (
                <div style={noteBoxStyle("danger")}>
                  <strong>Eligibility flags — review before submitting:</strong>
                  <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.upfrontNote && <div style={noteBoxStyle("info")}>{result.upfrontNote}</div>}

              <div style={{ ...noteBoxStyle("info"), marginTop: 14 }}>
                Payment schedule: Zoom processes SPIFF payments quarterly via XTRM to the TSD, within one month following the close of each
                fiscal quarter — provided customer payment has been received.
              </div>

              <button className="ms-btn-secondary" style={{ marginTop: 18 }} onClick={addToLog}>
                Add to Deal Log
              </button>
            </div>
          )}
        </div>
      )}

      {/* LOG PANEL */}
      {innerTab === "log" && (
        <div style={cardStyle}>
          <h2 style={cardTitleStyle}>Deal Log</h2>
          <p style={cardSubStyle}>Session-based log — export to CSV before closing the page, entries are not saved automatically.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <button className="ms-btn-secondary" onClick={exportCsv}>
              Export CSV
            </button>
            <button className="ms-btn-secondary" onClick={clearLog}>
              Clear Log
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            {logEntries.length === 0 ? (
              <div style={{ color: "#5a6b70", fontSize: 13.5, padding: "16px 0", textAlign: "center" }}>
                No deals logged yet. Calculate a SPIFF and click "Add to Deal Log".
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {["Date", "Rep", "Customer", "Product", "Multiplier", "Qualifying MRR", "SPIFF Payout", "Flags"].map((h) => (
                      <th key={h} style={{ background: NAVY, color: "#fff", padding: "8px 6px", textAlign: "left" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logEntries.map((e, i) => (
                    <tr key={i} style={{ background: i % 2 === 1 ? "#F4F7F8" : undefined }}>
                      <td style={{ padding: "8px 6px", borderBottom: `1px solid ${GREY}` }}>{e.date}</td>
                      <td style={{ padding: "8px 6px", borderBottom: `1px solid ${GREY}` }}>{e.rep}</td>
                      <td style={{ padding: "8px 6px", borderBottom: `1px solid ${GREY}` }}>{e.customer}</td>
                      <td style={{ padding: "8px 6px", borderBottom: `1px solid ${GREY}` }}>{e.product}</td>
                      <td style={{ padding: "8px 6px", borderBottom: `1px solid ${GREY}` }}>{e.multiplier}</td>
                      <td style={{ padding: "8px 6px", borderBottom: `1px solid ${GREY}` }}>{fmtCurrency(e.qualifyingMrr)}</td>
                      <td style={{ padding: "8px 6px", borderBottom: `1px solid ${GREY}` }}>{fmtCurrency(e.payout)}</td>
                      <td style={{ padding: "8px 6px", borderBottom: `1px solid ${GREY}` }}>{e.flags}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
