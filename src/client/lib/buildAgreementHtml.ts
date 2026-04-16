import type { OppFormData, OppCalcResult } from "./calcSupport";
import { getMsoTier } from "./msoTiers";

function escHtml(s: string | number | boolean): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtFull(n: number): string {
  return "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string): string {
  if (!iso) return "MM/DD/YYYY";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function sharedStyles(): string {
  return `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #f0f4f8; padding: 20px; }

      .agreement-doc { background: #fff; color: #1c2333; border-radius: 12px; overflow: hidden; font-family: 'IBM Plex Sans', sans-serif; font-size: 13.5px; line-height: 1.75; box-shadow: 0 4px 32px rgba(0,0,0,0.18); }
      .agreement-doc .doc-letterhead { background: #ffffff; border-bottom: 3px solid #0d1b2e; padding: 28px 52px 24px; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
      .agreement-doc .lh-wordmark { font-family: 'DM Serif Display', serif; font-size: 22px; color: #0d1b2e; letter-spacing: 0.01em; margin-bottom: 2px; }
      .agreement-doc .lh-tagline { font-size: 11px; color: #94a3b8; letter-spacing: 0.12em; text-transform: uppercase; }
      .agreement-doc .lh-doc-type { font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #007d6e; margin-bottom: 4px; text-align: right; }
      .agreement-doc .lh-doc-date { font-size: 12px; color: #64748b; text-align: right; }
      .agreement-doc .doc-title-band { background: #f8fafc; border-bottom: 1px solid #e4eaf2; padding: 28px 52px 24px; }
      .agreement-doc .doc-prepared-for { font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px; }
      .agreement-doc .doc-customer-name { font-family: 'DM Serif Display', serif; font-size: 30px; color: #0d1b2e; line-height: 1.2; margin-bottom: 10px; }
      .agreement-doc .doc-type-pill { display: inline-block; background: #e8f5f2; color: #007d6e; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; border: 1px solid #b2dfdb; }
      .agreement-doc .doc-body { padding: 36px 52px 48px; }
      .agreement-doc .doc-intro { color: #4a5568; font-size: 13.5px; line-height: 1.8; margin-bottom: 32px; padding-bottom: 28px; border-bottom: 1px solid #e8edf4; }
      .agreement-doc .doc-intro strong { color: #0d1b2e; font-weight: 600; }
      .agreement-doc .section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; margin-top: 32px; }
      .agreement-doc .section-header:first-child { margin-top: 0; }
      .agreement-doc .section-num { width: 28px; height: 28px; border-radius: 50%; background: #0d1b2e; color: #fff; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: 'IBM Plex Mono', monospace; }
      .agreement-doc .section-title { font-size: 14px; font-weight: 700; color: #0d1b2e; letter-spacing: 0.02em; }
      .agreement-doc .section-divider { flex: 1; height: 1px; background: #e4eaf2; }
      .agreement-doc .pricing-wrap { border: 1px solid #e4eaf2; border-radius: 10px; overflow: hidden; margin-bottom: 8px; }
      .agreement-doc .pricing-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .agreement-doc .pricing-table thead tr { background: #f1f5f9; border-bottom: 1px solid #e4eaf2; }
      .agreement-doc .pricing-table th { padding: 10px 16px; text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; }
      .agreement-doc .pricing-table th.price-col { text-align: right; }
      .agreement-doc .pricing-table td { padding: 14px 16px; color: #374151; vertical-align: middle; border-bottom: 1px solid #f1f5f9; }
      .agreement-doc .pricing-table tbody tr:last-child td { border-bottom: none; }
      .agreement-doc .pricing-table .price-col { font-family: 'IBM Plex Mono', monospace; font-weight: 600; text-align: right; color: #0d1b2e; white-space: nowrap; font-size: 14px; }
      .agreement-doc .pricing-table .label-cell { font-weight: 600; color: #1e293b; }
      .agreement-doc .pricing-table .sub-cell { font-size: 12px; color: #64748b; margin-top: 2px; }
      .agreement-doc .pricing-table tfoot td { background: #f8fafc; border-top: 1px solid #e4eaf2; font-size: 11px; color: #94a3b8; font-style: italic; padding: 10px 16px; }
      .agreement-doc .pricing-note { font-size: 12px; color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 8px 14px; margin-bottom: 20px; }
      .agreement-doc .price-summary { display: grid; grid-template-columns: 1fr 1px 1fr; margin: 28px 0; border: 1px solid #e4eaf2; border-radius: 10px; overflow: hidden; }
      .agreement-doc .price-summary-cell { padding: 20px 24px; background: #f8fafc; }
      .agreement-doc .price-summary-cell.accent { background: #0d1b2e; }
      .agreement-doc .price-summary-divider { background: #e4eaf2; }
      .agreement-doc .ps-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px; }
      .agreement-doc .price-summary-cell.accent .ps-label { color: rgba(255,255,255,0.45); }
      .agreement-doc .ps-value { font-family: 'DM Serif Display', serif; font-size: 30px; color: #0d1b2e; line-height: 1.1; }
      .agreement-doc .price-summary-cell.accent .ps-value { color: #4dd0c4; }
      .agreement-doc .ps-sub { font-size: 11px; color: #94a3b8; margin-top: 3px; }
      .agreement-doc .price-summary-cell.accent .ps-sub { color: rgba(255,255,255,0.35); }
      .agreement-doc .coverage-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 4px; }
      .agreement-doc .coverage-card { border: 1px solid #e8edf4; border-radius: 8px; padding: 14px 16px; border-left: 3px solid #00796b; background: #fff; }
      .agreement-doc .coverage-card-title { font-size: 12.5px; font-weight: 700; color: #1e293b; margin-bottom: 4px; line-height: 1.3; }
      .agreement-doc .coverage-card-desc { font-size: 12px; color: #64748b; line-height: 1.6; }
      .agreement-doc .mac-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 4px; }
      .agreement-doc .mac-item { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; color: #374151; padding: 8px 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e8edf4; }
      .agreement-doc .mac-dot { width: 5px; height: 5px; border-radius: 50%; background: #00796b; margin-top: 6px; flex-shrink: 0; }
      .agreement-doc .scope-block { background: #fafafa; border: 1px solid #e8edf4; border-radius: 10px; padding: 18px 22px; margin-bottom: 4px; }
      .agreement-doc .scope-intro { font-size: 12.5px; color: #64748b; margin-bottom: 14px; line-height: 1.6; }
      .agreement-doc .scope-item { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f4f8; }
      .agreement-doc .scope-item:last-child { border-bottom: none; padding-bottom: 0; }
      .agreement-doc .scope-label { font-size: 13px; font-weight: 600; color: #374151; }
      .agreement-doc .scope-desc { font-size: 12px; color: #94a3b8; margin-top: 2px; line-height: 1.5; }
      .agreement-doc .scope-tag { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #b0bec5; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 3px 8px; white-space: nowrap; flex-shrink: 0; margin-top: 2px; }
      .agreement-doc .term-panel { background: #f8fafc; border: 1px solid #e4eaf2; border-radius: 10px; padding: 22px 24px; margin-bottom: 4px; }
      .agreement-doc .term-dates { display: grid; grid-template-columns: repeat(3,1fr); gap: 1px; background: #e4eaf2; border-radius: 8px; overflow: hidden; margin-bottom: 18px; }
      .agreement-doc .term-date-cell { background: #fff; padding: 12px 16px; }
      .agreement-doc .term-date-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; }
      .agreement-doc .term-date-val { font-size: 13px; font-weight: 600; color: #0d1b2e; }
      .agreement-doc .term-prose { font-size: 12.5px; color: #4a5568; line-height: 1.8; }
      .agreement-doc .term-prose p { margin-bottom: 8px; }
      .agreement-doc .term-prose p:last-child { margin-bottom: 0; }
      .agreement-doc .sig-band { background: #f8fafc; border-top: 1px solid #e4eaf2; padding: 36px 52px; margin-top: 32px; }
      .agreement-doc .sig-band-title { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #94a3b8; margin-bottom: 24px; text-align: center; }
      .agreement-doc .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
      .agreement-doc .sig-party-name { font-size: 15px; font-weight: 700; color: #0d1b2e; margin-bottom: 20px; padding-bottom: 8px; border-bottom: 2px solid #0d1b2e; }
      .agreement-doc .sig-row { margin-bottom: 20px; }
      .agreement-doc .sig-line { height: 32px; border-bottom: 1px solid #cbd5e1; margin-bottom: 4px; }
      .agreement-doc .sig-field-label { font-size: 10px; color: #94a3b8; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }

      .sig-doc { background: #fff; color: #1a202c; border-radius: 10px; overflow: hidden; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; line-height: 1.7; box-shadow: 0 4px 32px rgba(0,0,0,0.18); }
      .sig-doc .sd-top-rule { height: 4px; background: #0d1b2e; }
      .sig-doc .sd-header { padding: 24px 44px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; gap: 20px; background: #fff; }
      .sig-doc .sd-wordmark { font-family: 'DM Serif Display', serif; font-size: 20px; color: #0d1b2e; margin-bottom: 2px; }
      .sig-doc .sd-tagline { font-size: 10px; color: #94a3b8; letter-spacing: 0.1em; text-transform: uppercase; }
      .sig-doc .sd-doc-info { text-align: right; }
      .sig-doc .sd-doc-label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #0d1b2e; margin-bottom: 3px; }
      .sig-doc .sd-doc-ref { font-size: 11px; color: #64748b; font-family: 'IBM Plex Mono', monospace; }
      .sig-doc .sd-parties { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #e2e8f0; }
      .sig-doc .sd-party { padding: 16px 28px; border-right: 1px solid #e2e8f0; background: #f8fafc; }
      .sig-doc .sd-party:last-child { border-right: none; }
      .sig-doc .sd-party-role { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #94a3b8; margin-bottom: 3px; }
      .sig-doc .sd-party-name { font-size: 14px; font-weight: 700; color: #0d1b2e; }
      .sig-doc .sd-party-sub { font-size: 11px; color: #64748b; margin-top: 1px; }
      .sig-doc .sd-body { padding: 20px 44px 28px; }
      .sig-doc .sd-recital { font-size: 12.5px; color: #4a5568; line-height: 1.7; padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid #f0f4f8; }
      .sig-doc .sd-recital strong { color: #0d1b2e; }
      .sig-doc .sd-section-label { font-size: 9px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; margin-top: 16px; padding-bottom: 4px; border-bottom: 1px solid #f0f4f8; }
      .sig-doc .sd-line-item { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #f7fafc; gap: 12px; }
      .sig-doc .sd-line-item:last-child { border-bottom: none; }
      .sig-doc .sdli-desc { flex: 1; }
      .sig-doc .sdli-name { font-size: 13px; font-weight: 600; color: #1e293b; }
      .sig-doc .sdli-note { font-size: 11px; color: #94a3b8; margin-top: 2px; }
      .sig-doc .sdli-qty { font-size: 12px; color: #64748b; text-align: right; min-width: 80px; font-family: 'IBM Plex Mono', monospace; }
      .sig-doc .sdli-price { font-size: 14px; font-weight: 700; color: #0d1b2e; text-align: right; min-width: 110px; font-family: 'IBM Plex Mono', monospace; }
      .sig-doc .sd-totals { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-top: 14px; }
      .sig-doc .sd-total-row { display: flex; justify-content: space-between; align-items: center; padding: 11px 16px; border-bottom: 1px solid #f0f4f8; }
      .sig-doc .sd-total-row:last-child { border-bottom: none; }
      .sig-doc .sd-total-row.grand { background: #0d1b2e; padding: 14px 18px; }
      .sig-doc .sd-total-label { color: #64748b; font-size: 12px; }
      .sig-doc .sd-total-row.grand .sd-total-label { color: rgba(255,255,255,0.5); font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
      .sig-doc .sd-total-val { font-family: 'IBM Plex Mono', monospace; font-weight: 600; color: #0d1b2e; }
      .sig-doc .sd-total-row.grand .sd-total-val { font-family: 'DM Serif Display', serif; font-size: 26px; color: #4dd0c4; font-weight: 400; }
      .sig-doc .sd-coverage-list { list-style: none; padding: 0; margin: 0; }
      .sig-doc .sd-coverage-list li { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid #f7fafc; align-items: flex-start; font-size: 12.5px; color: #374151; }
      .sig-doc .sd-coverage-list li:last-child { border-bottom: none; }
      .sig-doc .sd-cov-num { font-family: 'IBM Plex Mono', monospace; font-size: 10px; font-weight: 600; color: #b0bec5; min-width: 20px; margin-top: 2px; }
      .sig-doc .sd-cov-body strong { color: #1e293b; }
      .sig-doc .sd-scope { font-size: 12px; color: #64748b; line-height: 1.7; background: #fafbfc; border: 1px solid #e8edf4; border-radius: 6px; padding: 12px 16px; }
      .sig-doc .sd-term { font-size: 12.5px; color: #374151; line-height: 1.8; }
      .sig-doc .sd-term strong { color: #0d1b2e; }
      .sig-doc .sd-term-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px 16px; margin-top: 10px; font-size: 12.5px; color: #166534; font-weight: 500; line-height: 1.6; }
      .sig-doc .sd-sig-section { margin-top: 20px; padding-top: 16px; border-top: 2px solid #0d1b2e; }
      .sig-doc .sd-sig-preamble { font-size: 11.5px; color: #64748b; line-height: 1.7; margin-bottom: 20px; }
      .sig-doc .sd-sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
      .sig-doc .sd-sig-party-label { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #94a3b8; margin-bottom: 3px; }
      .sig-doc .sd-sig-party-name { font-size: 14px; font-weight: 700; color: #0d1b2e; margin-bottom: 18px; }
      .sig-doc .sd-sig-field { margin-bottom: 14px; }
      .sig-doc .sd-sig-line { height: 30px; border-bottom: 1px solid #1e293b; margin-bottom: 4px; }
      .sig-doc .sd-sig-field-label { font-size: 9px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #94a3b8; }
      .sig-doc .sd-footer { margin-top: 20px; padding-top: 14px; border-top: 1px solid #f0f4f8; font-size: 10px; color: #b0bec5; text-align: center; line-height: 1.6; }

      @media print {
        body { background: #fff; padding: 0; margin: 0; }
        .agreement-doc, .sig-doc { box-shadow: none !important; border-radius: 0 !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .agreement-doc .section-header { break-after: avoid; page-break-after: avoid; }
        .agreement-doc .pricing-wrap, .agreement-doc .price-summary, .agreement-doc .coverage-grid,
        .agreement-doc .coverage-card, .agreement-doc .scope-block, .agreement-doc .term-panel,
        .agreement-doc .mac-item, .agreement-doc .pricing-note, .agreement-doc .doc-intro,
        .sig-doc .sd-parties, .sig-doc .sd-totals, .sig-doc .sd-recital, .sig-doc .sd-term-box, .sig-doc .sd-scope
        { break-inside: avoid; page-break-inside: avoid; }
        .agreement-doc .sig-band { break-inside: avoid; page-break-inside: avoid; break-before: avoid-page; page-break-before: avoid; }
        .sig-doc .sd-sig-section { break-inside: avoid; page-break-inside: avoid; }
        .mso-section, .mso-card, .mso-panels, .mso-sla-table, .mso-note { break-inside: avoid; page-break-inside: avoid; }
        .agreement-doc .pricing-table tr, .sig-doc .sd-line-item, .sig-doc .sd-total-row { break-inside: avoid; page-break-inside: avoid; }
      }
    </style>
  `;
}

function sdSigFields(): string {
  return `
    <div class="sd-sig-field"><div class="sd-sig-line"></div><div class="sd-sig-field-label">Authorized Signature</div></div>
    <div class="sd-sig-field"><div class="sd-sig-line"></div><div class="sd-sig-field-label">Printed Name</div></div>
    <div class="sd-sig-field"><div class="sd-sig-line"></div><div class="sd-sig-field-label">Title</div></div>
    <div class="sd-sig-field"><div class="sd-sig-line"></div><div class="sd-sig-field-label">Date</div></div>
  `;
}

function docSigRows(): string {
  return `
    <div class="sig-row"><div class="sig-line"></div><div class="sig-field-label">Authorized Signature</div></div>
    <div class="sig-row"><div class="sig-line"></div><div class="sig-field-label">Printed Name</div></div>
    <div class="sig-row"><div class="sig-line"></div><div class="sig-field-label">Title</div></div>
    <div class="sig-row"><div class="sig-line"></div><div class="sig-field-label">Date</div></div>
  `;
}

function buildMsoSection(d: OppFormData, calc: OppCalcResult): string {
  if (!calc.msoEnabled) return "";

  const tierMeta     = getMsoTier(d.msoTier || "");
  const tierLabel    = tierMeta?.label    ?? "Custom";
  const tierEngineer = tierMeta?.engineer ?? "As scoped per SOW";
  const tierAlloc    = tierMeta?.allocation ?? "\u2014";
  const tierSLA      = tierMeta?.sla      ?? "P1: 15 min \u00b7 P2: 1 hr \u00b7 P3: 4 hrs \u00b7 24/7/365";
  const tierScope    = tierMeta?.scope    ?? "As mutually agreed";
  const tierCoverage = tierMeta?.coverage ?? "Engineering resource allocation is defined per the agreed scope of work.";
  const panels       = tierMeta?.panels   ?? [
    ["Engineer Resource",        "Allocated per agreed scope of work."],
    ["MACD Management",          "Adds, moves, changes, and deletes handled by certified engineers."],
    ["Platform Configuration",   "Configuration and optimization per environment needs."],
    ["Health Monitoring",        "Periodic environment health checks."],
    ["Monthly Reporting",        "Environment summary and change log delivered monthly."],
    ["Business Reviews",         "Strategic review cadence per engagement scope."],
    ["Vendor Coordination",      "Vendor escalation management on your behalf."],
    ["Engineering Response SLA", "P1: 15 min \u00b7 P2: 1 hr \u00b7 P3: 4 hrs \u00b7 24/7/365."],
  ];

  type SlaRow = [string, string, string, string, string, string];
  const slaRows: SlaRow[] = (d.msoTier === "essentials") ? [
    ["P1 Critical", "fee2e2", "991b1b", "Service outage \u2014 platform-wide",                      "30 min",        "Escalate through team coverage"],
    ["P2 High",     "fef3c7", "92400e", "Significant degradation or multiple users affected",        "2 hrs",         "1 business day"],
    ["P3 Normal",   "e8f5f2", "007d6e", "General issues, how-to questions",                          "Next bus. day", "3 business days"],
  ] : [
    ["P1 Critical", "fee2e2", "991b1b", "Service outage \u2014 platform-wide",                      "15 min",        "Escalate with executive alignment"],
    ["P2 High",     "fef3c7", "92400e", "Significant degradation or multiple users affected",        "1 hr",          "1 business day"],
    ["P3 Normal",   "e8f5f2", "007d6e", "General issues, how-to questions",                          "4 hrs",         "3 business days"],
  ];

  const hoursNote = d.msoTier === "essentials"
    ? "business hours, with escalation coverage outside those windows"
    : "all hours, 24/7/365";

  return `
    <div class="mso-section" style="border-top:3px solid #00b8a0;margin-top:30px;padding-top:22px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;color:#00b8a0;text-transform:uppercase;">CloudSupport\u207a MSO Add-On</div>
        <div style="flex:1;height:1px;background:rgba(0,184,160,0.2);"></div>
      </div>
      <div class="mso-card" style="background:linear-gradient(135deg,#0d1b2e 0%,#0f2540 100%);border-radius:10px;padding:20px 22px;margin-bottom:18px;color:#fff;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;color:#00b8a0;text-transform:uppercase;margin-bottom:8px;">Engineering Resource Model</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
          <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;">${escHtml(tierLabel)}</span>
          <span style="font-size:12px;font-weight:600;color:#94c9c3;">${escHtml(tierEngineer)}</span>
        </div>
        <div style="font-size:12.5px;color:#cbd5e1;line-height:1.65;margin-bottom:14px;max-width:580px;">${escHtml(tierCoverage)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
          <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:7px;padding:10px 12px;">
            <div style="font-size:10px;font-weight:600;letter-spacing:0.08em;color:#00b8a0;text-transform:uppercase;margin-bottom:4px;">Allocation</div>
            <div style="font-size:11.5px;color:#e2e8f0;line-height:1.5;">${escHtml(tierAlloc)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:7px;padding:10px 12px;">
            <div style="font-size:10px;font-weight:600;letter-spacing:0.08em;color:#00b8a0;text-transform:uppercase;margin-bottom:4px;">Best For</div>
            <div style="font-size:11.5px;color:#e2e8f0;line-height:1.5;">${escHtml(tierScope)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:7px;padding:10px 12px;">
            <div style="font-size:10px;font-weight:600;letter-spacing:0.08em;color:#00b8a0;text-transform:uppercase;margin-bottom:4px;">Engineering SLA</div>
            <div style="font-size:11.5px;color:#e2e8f0;line-height:1.5;">${escHtml(tierSLA)}</div>
          </div>
        </div>
      </div>
      <div class="mso-panels" style="margin-bottom:18px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#0d1b2e;margin-bottom:10px;">What Your Engineer Delivers</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">
          ${panels.map(([title, desc]) => `
          <div style="background:#f8fafc;border:1px solid #e4eaf2;border-left:3px solid #00b8a0;border-radius:7px;padding:11px 13px;break-inside:avoid;page-break-inside:avoid;">
            <div style="font-size:11.5px;font-weight:700;color:#0d1b2e;margin-bottom:3px;">${title}</div>
            <div style="font-size:11px;color:#64748b;line-height:1.55;">${desc}</div>
          </div>`).join("")}
        </div>
      </div>
      <div class="mso-sla-table" style="margin-bottom:14px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#0d1b2e;margin-bottom:10px;">Engineering Response SLA</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#0d1b2e;color:#fff;">
          <th style="padding:9px 12px;text-align:left;font-weight:600;letter-spacing:0.04em;">Priority</th>
          <th style="padding:9px 12px;text-align:left;font-weight:600;letter-spacing:0.04em;">Scenario</th>
          <th style="padding:9px 12px;text-align:center;font-weight:600;letter-spacing:0.04em;">Engineer Response</th>
          <th style="padding:9px 12px;text-align:center;font-weight:600;letter-spacing:0.04em;">Resolution Target</th>
        </tr></thead>
        <tbody>
          ${slaRows.map(([label, bg, fg, desc, resp, res], i) => `
          <tr style="border-bottom:1px solid #f1f5f9;break-inside:avoid;page-break-inside:avoid;${i % 2 === 1 ? "background:#fafbfc;" : ""}">
            <td style="padding:10px 12px;"><span style="display:inline-block;background:#${bg};color:#${fg};font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:4px;">${label}</span></td>
            <td style="padding:10px 12px;color:#374151;">${desc}</td>
            <td style="padding:10px 12px;text-align:center;font-weight:700;color:#0d1b2e;font-family:'IBM Plex Mono',monospace;">${resp}</td>
            <td style="padding:10px 12px;text-align:center;color:#64748b;">${res}</td>
          </tr>`).join("")}
        </tbody>
        <tfoot><tr><td colspan="4" style="padding:7px 12px;font-size:10.5px;color:#94a3b8;font-style:italic;background:#f8fafc;border-top:1px solid #e4eaf2;">All response times apply to ${hoursNote}. Engineer response means direct contact \u2014 not a queue or triage step.</td></tr></tfoot>
        </table>
      </div>
      <div class="mso-note" style="background:#f0faf8;border:1px solid rgba(0,184,160,0.25);border-radius:7px;padding:11px 14px;font-size:12px;color:#374151;line-height:1.6;">
        The CloudSupport<sup style="font-size:9px;">+</sup> MSO Add-On is billed annually at <strong>${fmtFull(calc.msoSup)}/yr</strong> and co-terms with this Agreement. The engineering resource model (${escHtml(tierLabel)} \u2014 ${escHtml(tierEngineer)}) is committed for the full Agreement term. The MSO Add-On automatically renews with this Agreement unless cancelled in writing at least 30 days prior to renewal.
      </div>
    </div>
  `;
}

const PRODUCT_SCOPE: Record<string, { title: string; bullets: string[] }> = {
  "Zoom Revenue Accelerator (ZRA)": {
    title: "Zoom Revenue Accelerator (ZRA)",
    bullets: [
      "Support for call recording, transcription, and conversation intelligence features",
      "Assistance with configuration of trackers, keywords, and coaching insights",
      "Troubleshooting CRM integrations (e.g., Salesforce, HubSpot) related to ZRA",
      "Support for reporting dashboards and performance analytics",
      "Guidance on optimization of sales workflows and coaching metrics",
    ],
  },
  "Zoom AI Expert Assist": {
    title: "Zoom AI Expert Assist",
    bullets: [
      "Support for real-time agent assist configuration, including knowledge surfacing and recommendations",
      "Troubleshooting AI-driven suggestions, workflows, and data integrations",
      "Assistance with knowledge base connections and content tuning",
      "Ongoing optimization of AI models based on usage and feedback",
      "Support for reporting and agent performance insights",
    ],
  },
  "Zoom Virtual Agent (ZVA)": {
    title: "Zoom Virtual Agent (ZVA)",
    bullets: [
      "Ongoing support for Virtual Agent configuration, including intents, flows, and routing logic",
      "Updates and optimization of conversational experiences based on business needs and performance trends",
      "Troubleshooting of bot behavior, escalation paths, and handoff to live agents",
      "Support for knowledge base integrations and content updates",
      "Assistance with reporting, analytics, and deflection optimization",
    ],
  },
  "Zoom Quality Management (QM)": {
    title: "Zoom Quality Management (QM)",
    bullets: [
      "Support for call evaluation forms, scoring models, and workflows",
      "Assistance with calibration sessions and evaluator alignment",
      "Troubleshooting recording access, evaluation workflows, and reporting",
      "Support for QM reporting dashboards and analytics",
      "Guidance on best practices for agent performance management",
    ],
  },
  "Zoom Workforce Management (WFM)": {
    title: "Zoom Workforce Management (WFM)",
    bullets: [
      "Support for forecasting, scheduling, and adherence configuration",
      "Assistance with shift planning, intraday management, and schedule adjustments",
      "Troubleshooting WFM integrations with CCaaS and workforce data sources",
      "Support for reporting dashboards and workforce analytics",
      "Guidance on optimizing agent utilization and scheduling efficiency",
    ],
  },
  "RingCX AI (RAIR)": {
    title: "RingCentral AIR \u2014 AI Receptionist",
    bullets: [
      "Ongoing support for AI Receptionist configuration, including call handling logic, greetings, and routing rules",
      "Updates to business hours, call flows, and escalation paths to live agents or extensions",
      "Troubleshooting call routing issues, recognition errors, and caller experience gaps",
      "Assistance with directory updates and name/intent recognition tuning",
      "Guidance on optimizing automation to improve caller experience and reduce misroutes",
    ],
  },
  "RingSense (AI Conversation Intelligence)": {
    title: "RingSense \u2014 AI Conversation Intelligence",
    bullets: [
      "Support for call recording, transcription, and AI-driven conversation analysis features",
      "Assistance with configuration of keywords, trackers, and coaching insights",
      "Troubleshooting CRM integrations (e.g., Salesforce, HubSpot) related to RingSense",
      "Support for reporting dashboards, scorecards, and performance analytics",
      "Guidance on optimizing coaching workflows and agent performance programs",
    ],
  },
  "RingCX AVA": {
    title: "RingCentral AVA \u2014 AI Virtual Agent",
    bullets: [
      "Ongoing support for Virtual Agent configuration, including intents, dialog flows, and escalation logic",
      "Updates and optimization of conversational experiences across voice and digital channels",
      "Troubleshooting bot performance, fallback handling, and agent handoff workflows",
      "Support for knowledge base integrations and content updates",
      "Assistance with analytics, reporting, and containment/deflection optimization",
    ],
  },
  "RingCX ACE": {
    title: "RingCentral ACE \u2014 Conversation Intelligence",
    bullets: [
      "Support for call recording, transcription, and AI-driven conversation analysis features",
      "Assistance with configuration of keywords, trackers, and coaching insights",
      "Troubleshooting CRM integrations (e.g., Salesforce, HubSpot) related to ACE",
      "Support for reporting dashboards, scorecards, and performance analytics",
      "Guidance on optimizing coaching workflows and agent performance programs",
    ],
  },
};

const ADV_APP_GENERAL_NOTES = [
  "Support includes configuration updates and optimization within the existing deployed environment",
  "Net-new builds, major redesigns, or custom integrations may require a separate Statement of Work (SOW)",
  "Third-party integrations and custom API workflows are supported on a best-effort basis unless otherwise scoped",
];

export function buildProposalHtml(oppName: string, d: OppFormData, calc: OppCalcResult, versionNum: number): string {
  const type = d.oppType || "UCaaS + CCaaS";
  const customer = d.customerName || oppName || "[Customer Name]";
  const term = d.term || 3;
  const startDate = fmtDate(d.contractStart);
  const endDate = fmtDate(d.contractEnd);
  const users = d.ucaasUsers || 0;
  const ccaasLic = d.ccaasLicensing || 0;
  const afterHours = d.afterHoursRate ?? 165;
  const advRate = d.advancedTaskRate ?? 145;
  const verStr = versionNum === 0 ? "Draft" : `v${versionNum}`;

  const ucaasTierLabel =
    users <= 0 ? "\u2014" :
    users <= 100 ? "Starter" :
    users <= 500 ? "Business" :
    users <= 2000 ? "Professional" : "Enterprise";

  const showUCaaS  = type === "UCaaS Only" || type === "UCaaS + CCaaS";
  const showCCaaS  = type === "CCaaS Only" || type === "UCaaS + CCaaS";
  const showAdvApp = type === "Advanced Applications" || d.advAppEnabled === true;
  const proposalTierMeta = getMsoTier(d.msoTier || "");

  const RC_PRODUCT_LABELS: Record<string, string> = {
    ace: "ACE \u2014 Conversation Intelligence",
    ava: "AVA \u2014 Virtual Agent",
    air: "AIR \u2014 AI Receptionist",
  };
  const advPlatformLabel =
    d.advAppPlatform === "zoom" ? "Zoom" :
    d.advAppPlatform === "ringcentral" ? "RingCentral" :
    d.advAppOtherDesc || "Other";
  const advProductLabels = (d.advAppProducts ?? []).map(p =>
    d.advAppPlatform === "ringcentral" ? (RC_PRODUCT_LABELS[p] ?? p) : p
  );

  let secN = 0;
  const secNum = () => { secN++; return secN; };

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const typeLabel =
    type === "CCaaS Only"           ? "CCaaS" :
    type === "UCaaS Only"           ? "UCaaS" :
    type === "Advanced Applications" ? "Advanced Applications" :
    "UCaaS and CCaaS";

  const ucaasSection = showUCaaS ? `
      <div class="section-header">
        <div class="section-num">${secNum()}</div>
        <div class="section-title">UCaaS CloudSupport</div>
        <div class="section-divider"></div>
      </div>
      <p style="font-size:12.5px;color:#64748b;margin-bottom:12px;">Pricing is based on the number of active UCaaS seats and billed annually.</p>
      <div class="pricing-wrap">
        <table class="pricing-table">
          <thead><tr><th>Service Tier</th><th>Active Seats</th><th>Billing Cycle</th><th class="price-col">Annual Investment</th></tr></thead>
          <tbody>
            <tr>
              <td><div class="label-cell">${ucaasTierLabel}</div><div class="sub-cell">UCaaS CloudSupport</div></td>
              <td style="font-family:'IBM Plex Mono',monospace;font-weight:600;color:#1e293b;">${users > 0 ? users.toLocaleString("en-US") : "\u2014"}</td>
              <td style="font-size:12px;color:#64748b;">Annual, auto-renewing</td>
              <td class="price-col">${users > 0 ? fmtFull(calc.ucaasSup) : "\u2014"}</td>
            </tr>
          </tbody>
          <tfoot><tr><td colspan="4">Auto-renews and co-terms with Customer\u2019s Master Services Agreement or Subscription Term</td></tr></tfoot>
        </table>
      </div>
      ${calc.minApplied ? '<div class="pricing-note">Annual minimum of $2,500.00 applied \u2014 seat count pricing falls below the baseline commitment.</div>' : ""}
  ` : "";

  const implSow = d.implSow || 0;
  const ccaasTotal = calc.ccaasSup + calc.implSup;
  const ccaasSection = showCCaaS ? `
      <div class="section-header">
        <div class="section-num">${secNum()}</div>
        <div class="section-title">CCaaS CloudSupport${showUCaaS ? " \u2014 Additional to UCaaS" : ""}</div>
        <div class="section-divider"></div>
      </div>
      <div class="pricing-wrap">
        <table class="pricing-table">
          <thead><tr><th>Component</th><th class="price-col">Annual Investment</th></tr></thead>
          <tbody>
            ${ccaasTotal > 0
              ? `<tr>
              <td><div class="label-cell">CCaaS CloudSupport</div><div class="sub-cell">CCaaS CloudSupport \u00b7 Annual, auto-renewing</div></td>
              <td class="price-col">${fmtFull(ccaasTotal)}</td>
            </tr>`
              : `<tr><td colspan="2" style="color:#94a3b8;font-style:italic;text-align:center;padding:20px;">No CCaaS components configured</td></tr>`}
          </tbody>
          <tfoot><tr><td colspan="2">Usage, consumption, DIDs, and telco charges are excluded from CCaaS licensing. Auto-renews and co-terms with Customer\u2019s Subscription Term.</td></tr></tfoot>
        </table>
      </div>
  ` : "";

  const advAppProducts = d.advAppProducts ?? [];
  const advAppScopeHtml = (advAppProducts.length > 0 || d.advAppPlatform === "other") ? `
    <div style="margin-top:20px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:14px;">Scope of Support</div>
      ${advAppProducts.map(p => {
        const scope = PRODUCT_SCOPE[p];
        if (!scope) return "";
        return `
          <div style="margin-bottom:16px;">
            <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:6px;">${escHtml(scope.title)}</div>
            <ul style="margin:0;padding-left:20px;color:#374151;font-size:12.5px;line-height:1.75;">
              ${scope.bullets.map(b => `<li style="margin-bottom:2px;">${escHtml(b)}</li>`).join("")}
            </ul>
          </div>`;
      }).join("")}
      ${d.advAppPlatform === "other" && d.advAppOtherDesc ? `
        <div style="margin-bottom:16px;">
          <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:6px;">${escHtml(d.advAppOtherDesc)}</div>
          <p style="margin:0;font-size:12.5px;color:#64748b;font-style:italic;">Scope of support to be defined in accordance with the delivered solution.</p>
        </div>` : ""}
      <div style="margin-top:16px;padding:10px 14px;background:#f8fafc;border-left:3px solid #00b8a0;border-radius:0 6px 6px 0;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">General Notes</div>
        <ul style="margin:0;padding-left:20px;color:#374151;font-size:12px;line-height:1.75;">
          ${ADV_APP_GENERAL_NOTES.map(n => `<li style="margin-bottom:2px;">${escHtml(n)}</li>`).join("")}
        </ul>
      </div>
    </div>` : "";

  const advAppSection = showAdvApp ? `
      <div class="section-header">
        <div class="section-num">${secNum()}</div>
        <div class="section-title">Advanced Applications Support \u2014 ${escHtml(advPlatformLabel)}</div>
        <div class="section-divider"></div>
      </div>
      <div class="pricing-wrap">
        <table class="pricing-table">
          <thead><tr><th>Platform</th><th>Applications Covered</th><th class="price-col">Annual Investment</th></tr></thead>
          <tbody>
            <tr>
              <td><div class="label-cell">${escHtml(advPlatformLabel)}</div></td>
              <td>
                ${advProductLabels.length > 0
                  ? advProductLabels.map(p => `<div style="font-size:12.5px;color:#374151;line-height:1.8;">\u2022 ${escHtml(p)}</div>`).join("")
                  : `<span style="color:#94a3b8;font-style:italic;">No specific applications selected</span>`
                }
              </td>
              <td class="price-col">${calc.advAppSup > 0 ? fmtFull(calc.advAppSup) : "Included"}</td>
            </tr>
          </tbody>
          <tfoot><tr><td colspan="3">${calc.advAppSup > 0 ? "Includes $2,500 base fee plus 20% of implementation SOW. " : "Advanced Applications support included within CCaaS CloudSupport engagement. "}Auto-renews and co-terms with Customer\u2019s Subscription Term.</td></tr></tfoot>
        </table>
      </div>
      ${advAppScopeHtml}
  ` : "";

  const msoSection = calc.msoEnabled ? `
      <div class="section-header">
        <div class="section-num">${secNum()}</div>
        <div class="section-title" style="color:#007d6e;">CloudSupport<sup style="font-size:9px;">+</sup> MSO Add-On \u2014 ${escHtml(proposalTierMeta?.label ?? "Custom")}</div>
        <div class="section-divider"></div>
      </div>
      <div class="pricing-wrap">
        <table class="pricing-table">
          <thead><tr><th>MSO Tier</th><th>Engineer Allocation</th><th class="price-col">Annual Investment</th></tr></thead>
          <tbody>
            <tr>
              <td><div class="label-cell">${escHtml(proposalTierMeta?.label ?? "Custom")}</div></td>
              <td style="font-size:12px;color:#64748b;">${escHtml((proposalTierMeta?.engineer ?? "As scoped").split(" (")[0])}</td>
              <td class="price-col" style="color:#007d6e;">${fmtFull(calc.msoSup)}</td>
            </tr>
          </tbody>
        </table>
      </div>
  ` : "";

  const customSection = (d.customLines && d.customLines.length > 0) ? `
      <div class="section-header">
        <div class="section-num">${secNum()}</div>
        <div class="section-title">Custom Pricing Adjustments</div>
        <div class="section-divider"></div>
      </div>
      <div class="pricing-wrap">
        <table class="pricing-table">
          <thead><tr><th>Description</th><th class="price-col">Annual</th></tr></thead>
          <tbody>
            ${d.customLines.map(l => `<tr><td class="label-cell">${escHtml(l.label)}</td><td class="price-col">${fmtFull(l.price || 0)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
  ` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudSupport Agreement \u2014 ${escHtml(customer)}</title>
  ${sharedStyles()}
</head>
<body>
<div class="agreement-doc">
  <div class="doc-letterhead">
    <div>
      <div class="lh-wordmark">Packet Fusion</div>
      <div class="lh-tagline">Cloud Communications</div>
    </div>
    <div>
      <div class="lh-doc-type">${calc.msoEnabled ? "CloudSupport + MSO Agreement" : "CloudSupport Agreement"}</div>
      <div class="lh-doc-date">${verStr} &nbsp;\u00b7&nbsp; ${today}</div>
    </div>
  </div>
  <div class="doc-title-band">
    <div class="doc-prepared-for">Prepared for</div>
    <div class="doc-customer-name">${escHtml(customer)}</div>
    <span class="doc-type-pill">${escHtml(type)}${calc.msoEnabled ? " + MSO" : ""}</span>
  </div>
  <div class="doc-body">
    <p class="doc-intro">
      ${showAdvApp
        ? `Packet Fusion\u2019s <strong>CloudSupport for Advanced Applications</strong> provides dedicated support for your <strong>${escHtml(advPlatformLabel)}</strong> implementation${advProductLabels.length > 0 ? `, covering ${advProductLabels.map(p => `<strong>${escHtml(p)}</strong>`).join(", ")}` : ""}. Our team brings deep expertise in AI-powered applications to ensure your investment is configured, maintained, and continuously optimized.`
        : `Packet Fusion\u2019s <strong>CloudSupport</strong> combines priority response times, proactive system optimization, and personalized growth strategies to maximize your organization\u2019s investment across your entire ${typeLabel} landscape \u2014 including collaboration, voice, and contact center applications. Whether it\u2019s troubleshooting, updates, or long-term planning, our CloudSupport ensures your collaboration solutions perform efficiently and scale with your business needs.`
      }
    </p>
    ${ucaasSection}
    ${ccaasSection}
    ${advAppSection}
    ${customSection}
    ${msoSection}
    <div class="price-summary">
      <div class="price-summary-cell accent">
        <div class="ps-label">Total Annual Investment</div>
        <div class="ps-value">${fmtFull(calc.annual)}</div>
        <div class="ps-sub">Billed annually \u00b7 Auto-renewing</div>
      </div>
      <div class="price-summary-divider"></div>
      <div class="price-summary-cell">
        <div class="ps-label">Total Contract Value \u00b7 ${term}-Year Term</div>
        <div class="ps-value" style="color:#0d1b2e;font-size:26px;">${fmtFull(calc.tcv)}</div>
        <div class="ps-sub">${startDate} \u2013 ${endDate}</div>
      </div>
    </div>
    <div class="section-header">
      <div class="section-num">${secNum()}</div>
      <div class="section-title">What\u2019s Included in Your CloudSupport Plan</div>
      <div class="section-divider"></div>
    </div>
    <div class="coverage-grid">
      <div class="coverage-card"><div class="coverage-card-title">Adds, Moves &amp; Changes During Business Hours</div><div class="coverage-card-desc">Provided at no additional charge from 7:00 am \u2013 5:00 pm PST. Timely updates with no extra billing.</div></div>
      <div class="coverage-card"><div class="coverage-card-title">After-Hours Support at ${fmtFull(afterHours)}/hr</div><div class="coverage-card-desc">Discounted labor for engagements over 30 minutes outside standard business hours \u2014 ideal for multi-timezone operations.</div></div>
      <div class="coverage-card"><div class="coverage-card-title">Advanced Task Rate at ${fmtFull(advRate)}/hr</div><div class="coverage-card-desc">Preferred pricing for new call flows, advanced user setups, third-party integrations, and API or custom development.</div></div>
      <div class="coverage-card"><div class="coverage-card-title">Proactive SLA Guarantees</div><div class="coverage-card-desc">Standard requests responded to within 4 hours. Critical or emergency situations receive a 30-minute response commitment.</div></div>
      <div class="coverage-card"><div class="coverage-card-title">Packet Fusion Customer Portal Access</div><div class="coverage-card-desc">Submit and track support tickets, review historical case records, and receive real-time status updates in one place.</div></div>
      <div class="coverage-card"><div class="coverage-card-title">Quarterly Optimization &amp; User Coaching</div><div class="coverage-card-desc">Proactive system reviews, call flow audits, quarterly end-user training sessions, and strategic advisory for growth and scalability.</div></div>
      <div class="coverage-card" style="grid-column:1/-1;"><div class="coverage-card-title">Manufacturer Direct Support Option</div><div class="coverage-card-desc">Retain full flexibility to engage directly with the manufacturer\u2019s support team at any time, giving your organization an additional layer of troubleshooting resources.</div></div>
    </div>
    <div class="section-header" style="margin-top:28px;">
      <div class="section-num">${secNum()}</div>
      <div class="section-title">Included Adds, Moves &amp; Changes</div>
      <div class="section-divider"></div>
    </div>
    <div class="mac-grid">
      <div class="mac-item"><div class="mac-dot"></div>Name and extension changes</div>
      <div class="mac-item"><div class="mac-dot"></div>Call groups, queues, auto receptionists &amp; schedules</div>
      <div class="mac-item"><div class="mac-dot"></div>Minor call flow adjustments (30 minutes or less)</div>
      <div class="mac-item"><div class="mac-dot"></div>Troubleshooting &amp; resolving common technical issues</div>
      <div class="mac-item"><div class="mac-dot"></div>User questions and feature guidance</div>
      <div class="mac-item"><div class="mac-dot"></div>Activating new licenses or reassigning existing ones</div>
    </div>
    <div class="section-header" style="margin-top:28px;">
      <div class="section-num">${secNum()}</div>
      <div class="section-title">Outside Scope of Support</div>
      <div class="section-divider"></div>
    </div>
    <div class="scope-block">
      <div class="scope-intro">The following services fall outside the standard CloudSupport agreement and are available as separately scoped engagements at preferred partner rates.</div>
      <div class="scope-item"><div style="flex:1;"><div class="scope-label">Major Call Flow Overhauls</div><div class="scope-desc">Designing or implementing significant structural changes to existing call flow configurations.</div></div><div class="scope-tag">Separate SOW</div></div>
      <div class="scope-item"><div style="flex:1;"><div class="scope-label">New Integration Deployments</div><div class="scope-desc">Full deployment or integration of new solutions, such as transitioning to a provider contact center platform.</div></div><div class="scope-tag">Separate SOW</div></div>
    </div>
    <div class="section-header" style="margin-top:28px;">
      <div class="section-num">${secNum()}</div>
      <div class="section-title">Term &amp; Renewal</div>
      <div class="section-divider"></div>
    </div>
    <div class="term-panel">
      <div class="term-dates">
        <div class="term-date-cell"><div class="term-date-label">Start Date</div><div class="term-date-val">${startDate}</div></div>
        <div class="term-date-cell"><div class="term-date-label">End Date</div><div class="term-date-val">${endDate}</div></div>
        <div class="term-date-cell"><div class="term-date-label">Term Length</div><div class="term-date-val">${term} Year${term > 1 ? "s" : ""}</div></div>
      </div>
      <div class="term-prose">
        <p>CloudSupport services are sold to align and co-term with the Customer\u2019s Packet Fusion agreement and/or underlying provider subscription term. Unless otherwise stated in writing, CloudSupport will automatically renew for the duration of the applicable renewal term.</p>
        <p>This <strong>${term}-year</strong> term will be billed annually at <strong>${fmtFull(calc.annual)}</strong> per year, for a total contract value of <strong>${fmtFull(calc.tcv)}</strong>.${term > 1 ? ` Pricing is subject to escalation upon renewal at ${endDate}.` : ""}</p>
      </div>
    </div>
    ${buildMsoSection(d, calc)}
  </div>
  <div class="sig-band">
    <div class="sig-band-title">Authorization &amp; Agreement</div>
    <div class="sig-grid">
      <div><div class="sig-party-name">Packet Fusion, Inc.</div>${docSigRows()}</div>
      <div><div class="sig-party-name">${escHtml(customer)}</div>${docSigRows()}</div>
    </div>
  </div>
</div>
</body>
</html>`;
}

export function buildSignatureHtml(oppName: string, d: OppFormData, calc: OppCalcResult, versionNum: number): string {
  const type = d.oppType || "UCaaS + CCaaS";
  const customer = d.customerName || oppName || "[Customer Name]";
  const term = d.term || 3;
  const startDate = fmtDate(d.contractStart);
  const endDate = fmtDate(d.contractEnd);
  const users = d.ucaasUsers || 0;
  const ccaasLic = d.ccaasLicensing || 0;
  const afterHours = d.afterHoursRate ?? 165;
  const advRate = d.advancedTaskRate ?? 145;
  const refNum = `PF-${new Date().getFullYear()}-${String(versionNum).padStart(3, "0")}`;
  const showUCaaS = type !== "CCaaS Only";
  const showCCaaS = type !== "UCaaS Only";
  const ucaasTierLabel =
    users <= 0 ? "\u2014" :
    users <= 100 ? "Starter" :
    users <= 500 ? "Business" :
    users <= 2000 ? "Professional" : "Enterprise";
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const ucaasLineItem = (showUCaaS && users > 0) ? `
      <div class="sd-line-item">
        <div class="sdli-desc">
          <div class="sdli-name">UCaaS CloudSupport \u2014 ${ucaasTierLabel}${calc.ucaasOverridden ? ' <span style="font-size:10px;font-weight:600;color:#007d6e;background:#e8f5f2;border:1px solid #b2dfdb;border-radius:3px;padding:1px 6px;margin-left:4px;">custom</span>' : ""}</div>
          <div class="sdli-note">UCaaS CloudSupport \u00b7 ${users.toLocaleString("en-US")} active seats</div>
        </div>
        <div class="sdli-qty">${users.toLocaleString("en-US")} seats</div>
        <div class="sdli-price">${fmtFull(calc.ucaasSup)}/yr</div>
      </div>` : "";

  const sigImplSow = d.implSow || 0;
  const sigCcaasTotal = calc.ccaasSup + calc.implSup;
  const ccaasLineItem = showCCaaS && sigCcaasTotal > 0 ? `
      <div class="sd-line-item">
        <div class="sdli-desc">
          <div class="sdli-name">CCaaS CloudSupport</div>
          <div class="sdli-note">CCaaS CloudSupport \u00b7 Annual, auto-renewing</div>
        </div>
        <div class="sdli-qty">\u2014</div>
        <div class="sdli-price">${fmtFull(sigCcaasTotal)}/yr</div>
      </div>` : "";

  const customLineItems = (d.customLines && d.customLines.length > 0)
    ? d.customLines.map(l => `
      <div class="sd-line-item">
        <div class="sdli-desc"><div class="sdli-name">${escHtml(l.label)}</div><div class="sdli-note">Custom line item</div></div>
        <div class="sdli-qty">\u2014</div>
        <div class="sdli-price">${fmtFull(l.price || 0)}/yr</div>
      </div>`).join("")
    : "";

  const sigTierMeta = getMsoTier(d.msoTier || "");
  const msoLineItem = calc.msoEnabled ? `
      <div class="sd-line-item" style="border-left:3px solid #00b8a0;padding-left:12px;margin-top:4px;">
        <div class="sdli-desc">
          <div class="sdli-name" style="color:#007d6e;">CloudSupport<sup style="font-size:8px;">+</sup> MSO \u2014 ${escHtml(sigTierMeta?.label ?? "Custom")}</div>
          <div class="sdli-note">${escHtml(sigTierMeta?.engineer ?? "As scoped")} \u00b7 ${escHtml(sigTierMeta?.allocation ?? "\u2014")}</div>
        </div>
        <div class="sdli-qty">\u2014</div>
        <div class="sdli-price" style="color:#007d6e;">${fmtFull(calc.msoSup)}/yr</div>
      </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloudSupport Agreement \u2014 ${escHtml(customer)}</title>
  ${sharedStyles()}
</head>
<body>
<div class="sig-doc">
  <div class="sd-top-rule"></div>
  <div class="sd-header">
    <div>
      <div class="sd-wordmark">Packet Fusion</div>
      <div class="sd-tagline">Cloud Communications</div>
    </div>
    <div class="sd-doc-info">
      <div class="sd-doc-label">${calc.msoEnabled ? "CloudSupport + MSO Agreement" : "CloudSupport Agreement"}</div>
      <div class="sd-doc-ref">${refNum} &nbsp;\u00b7&nbsp; ${today}</div>
    </div>
  </div>
  <div class="sd-parties">
    <div class="sd-party">
      <div class="sd-party-role">Service Provider</div>
      <div class="sd-party-name">Packet Fusion, Inc.</div>
      <div class="sd-party-sub">${calc.msoEnabled ? "CloudSupport + MSO Services" : "CloudSupport Services"}</div>
    </div>
    <div class="sd-party">
      <div class="sd-party-role">Customer</div>
      <div class="sd-party-name">${escHtml(customer)}</div>
      <div class="sd-party-sub">${escHtml(type)}${calc.msoEnabled ? " + MSO" : ""}</div>
    </div>
  </div>
  <div class="sd-body">
    <p class="sd-recital">
      This CloudSupport Agreement (\u201cAgreement\u201d) is entered into between <strong>Packet Fusion, Inc.</strong> (\u201cProvider\u201d) and <strong>${escHtml(customer)}</strong> (\u201cCustomer\u201d). Provider agrees to deliver the CloudSupport services described herein for the term and pricing set forth below, in accordance with the terms of the Customer\u2019s underlying Packet Fusion Master Services Agreement.
    </p>
    <div class="sd-section-label">Service &amp; Pricing Schedule</div>
    ${ucaasLineItem}
    ${ccaasLineItem}
    ${customLineItems}
    ${msoLineItem}
    <div class="sd-totals">
      <div class="sd-total-row"><span class="sd-total-label">${calc.msoEnabled ? "Annual CloudSupport + MSO Investment" : "Annual CloudSupport Investment"}</span><span class="sd-total-val">${fmtFull(calc.annual)}</span></div>
      <div class="sd-total-row"><span class="sd-total-label">Term Length</span><span class="sd-total-val" style="font-family:'IBM Plex Sans',sans-serif;">${term} Year${term > 1 ? "s" : ""} &nbsp;(${startDate} \u2013 ${endDate})</span></div>
      <div class="sd-total-row grand"><span class="sd-total-label">Total Contract Value</span><span class="sd-total-val">${fmtFull(calc.tcv)}</span></div>
    </div>
    <div class="sd-section-label" style="margin-top:18px;">Support Coverage</div>
    <ul class="sd-coverage-list">
      <li><span class="sd-cov-num">01</span><span class="sd-cov-body"><strong>Business Hours MACs (7am\u20135pm PST)</strong> \u2014 Simple adds, moves, and changes at no additional charge during standard business hours.</span></li>
      <li><span class="sd-cov-num">02</span><span class="sd-cov-body"><strong>After-Hours Labor at ${fmtFull(afterHours)}/hr</strong> \u2014 Discounted rate for support engagements over 30 minutes outside business hours.</span></li>
      <li><span class="sd-cov-num">03</span><span class="sd-cov-body"><strong>Advanced Task Rate at ${fmtFull(advRate)}/hr</strong> \u2014 Preferred pricing for new call flows, integrations, API work, and advanced configurations.</span></li>
      <li><span class="sd-cov-num">04</span><span class="sd-cov-body"><strong>SLA Guarantees</strong> \u2014 4-hour response for standard requests; 30-minute response for priority or emergency issues.</span></li>
      <li><span class="sd-cov-num">05</span><span class="sd-cov-body"><strong>Customer Portal Access</strong> \u2014 Ticket submission, case history, and real-time status updates via the Packet Fusion portal.</span></li>
      <li><span class="sd-cov-num">06</span><span class="sd-cov-body"><strong>Quarterly Optimization &amp; Coaching</strong> \u2014 System reviews, call flow audits, end-user training, and strategic planning sessions.</span></li>
      <li><span class="sd-cov-num">07</span><span class="sd-cov-body"><strong>Manufacturer Support Access</strong> \u2014 Option to engage directly with manufacturer support alongside Packet Fusion coverage.</span></li>
    </ul>
    <div class="sd-section-label" style="margin-top:18px;">Outside Scope of Agreement</div>
    <div class="sd-scope">
      <p style="font-size:12px;color:#64748b;margin-bottom:10px;">The following are available as separately scoped engagements at preferred partner rates:</p>
      <div style="display:flex;flex-direction:column;gap:7px;">
        <div style="display:flex;align-items:flex-start;gap:10px;font-size:12.5px;color:#374151;"><span style="width:18px;height:18px;border-radius:50%;background:#f1f5f9;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#94a3b8;flex-shrink:0;margin-top:1px;">1</span><div><strong style="color:#1e293b;">Major Call Flow Overhauls</strong> \u2014 Significant structural redesign of existing call flow configurations.</div></div>
        <div style="display:flex;align-items:flex-start;gap:10px;font-size:12.5px;color:#374151;"><span style="width:18px;height:18px;border-radius:50%;background:#f1f5f9;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#94a3b8;flex-shrink:0;margin-top:1px;">2</span><div><strong style="color:#1e293b;">New Integration or Solution Deployments</strong> \u2014 Full deployment of new platforms, such as transitioning to a new contact center solution.</div></div>
      </div>
      <p style="font-size:11px;color:#94a3b8;margin-top:10px;margin-bottom:0;">Contact your Packet Fusion account team for a scoped proposal on either item.</p>
    </div>
    <div class="sd-section-label" style="margin-top:18px;">Term &amp; Renewal</div>
    <div class="sd-term">
      <p>This Agreement co-terms with Customer\u2019s Packet Fusion Master Services Agreement and/or underlying provider subscription. Unless cancelled in writing${calc.msoEnabled ? " at least 30 days prior to renewal" : ""}, CloudSupport${calc.msoEnabled ? " and the MSO Add-On" : ""} will automatically renew for successive terms at the then-current renewal rate.</p>
      <div class="sd-term-box">
        This ${term}-year Agreement is billed annually at <strong>${fmtFull(calc.annual)}</strong> per year, for a total contract value of <strong>${fmtFull(calc.tcv)}</strong>.${calc.msoEnabled ? ` Includes CloudSupport base services plus the MSO Add-On (${escHtml(sigTierMeta?.label ?? "Custom")} \u2014 ${escHtml(sigTierMeta?.engineer ?? "As scoped")}).` : ""} Term: ${startDate} through ${endDate}.${term > 1 ? " Pricing is subject to escalation upon renewal." : ""}
      </div>
    </div>
    ${calc.msoEnabled ? `
    <div class="sd-section-label" style="margin-top:18px;">MSO Add-On</div>
    <div style="background:#f0faf8;border:1px solid rgba(0,184,160,0.25);border-radius:7px;padding:11px 14px;font-size:12px;color:#374151;line-height:1.6;">
      The CloudSupport<sup style="font-size:9px;">+</sup> MSO Add-On (<strong>${escHtml(sigTierMeta?.label ?? "Custom")}</strong> \u2014 ${escHtml(sigTierMeta?.allocation ?? "\u2014")}) is billed annually at <strong>${fmtFull(calc.msoSup)}/yr</strong> and co-terms with this Agreement for the full ${term}-year term. Automatically renews unless cancelled in writing at least 30 days prior to renewal.
    </div>` : ""}
    <div class="sd-sig-section">
      <p class="sd-sig-preamble">By signing below, each party agrees to the terms of this ${calc.msoEnabled ? "CloudSupport + MSO Agreement" : "CloudSupport Agreement"}. This Agreement is legally binding upon execution by both parties and is incorporated into the Customer\u2019s Master Services Agreement with Packet Fusion, Inc.</p>
      <div class="sd-sig-grid">
        <div><div class="sd-sig-party-label">Service Provider</div><div class="sd-sig-party-name">Packet Fusion, Inc.</div>${sdSigFields()}</div>
        <div><div class="sd-sig-party-label">Customer</div><div class="sd-sig-party-name">${escHtml(customer)}</div>${sdSigFields()}</div>
      </div>
      <div class="sd-footer">
        Packet Fusion, Inc. &nbsp;\u00b7&nbsp; ${calc.msoEnabled ? "CloudSupport + MSO Agreement" : "CloudSupport Agreement"} &nbsp;\u00b7&nbsp; ${refNum} &nbsp;\u00b7&nbsp; ${fmtFull(calc.annual)}/yr &nbsp;\u00b7&nbsp; ${term}-Year Term${calc.msoEnabled && sigTierMeta ? ` \u00b7 MSO: ${escHtml(sigTierMeta.label)}` : ""}<br>
        This document is confidential and intended solely for the named parties.
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}
