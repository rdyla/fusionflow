/**
 * Shared primitives for the task-list exports — CSV escaping plus the
 * print-document shell (brand CSS, cover page, footer, print dialog).
 *
 * Two consumers today: project/TaskExports (the standard Tasks tab) and
 * customPlan/CustomPlanExports (the throwaway MedVet Asana plan). They differ
 * in row model — sections vs stages, one date vs two, flat vs nested — so each
 * builds its own rows and its own document body and shares only what's here.
 *
 * The CSS is a trimmed descendant of the OptimizeExports / ScopeOfWorkDocument
 * shell rather than an import from it. Those are customer-facing collateral
 * with their own layout vocabulary; coupling them means a tweak to a cover page
 * reflows unrelated documents.
 */

import logoUrl from "../assets/packetfusion-fullcolor.png";

// ── Brand constants (mirrors OptimizeExports / ScopeOfWorkDocument) ─────────
export const PF_NAVY  = "#003B5C";
export const PF_GREEN = "#17C662";
export const PF_GREY  = "#D9E1E2";

/** Same palette the Tasks tab uses for status text and stage badges. */
export const STATUS_COLOR: Record<string, string> = {
  completed:   "#059669",
  in_progress: "#0891b2",
  not_started: "#94a3b8",
  blocked:     "#d13438",
};

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/** Quote-and-escape one cell. The leading-character guard stops Excel/Sheets
 *  from evaluating a task title like "=cmd|…" as a formula on open; "-" is
 *  deliberately not guarded since titles legitimately start with a dash far
 *  more often than they start a formula. */
export function csvCell(value: string): string {
  const guarded = /^[=+@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Assemble a CSV from a header row and already-stringified data rows. Every
 *  cell is quoted, so embedded newlines and commas are safe.
 *
 *  CRLF + BOM: Excel needs the BOM to read UTF-8 (the "·" in assignee labels,
 *  the "✓" in the plan's prerequisites) as anything other than mojibake. The
 *  BOM is escaped rather than literal so it survives a copy/paste of this file.
 */
export function buildCsvText(headers: readonly string[], rows: string[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── HTML helpers ────────────────────────────────────────────────────────────

export function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function longDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function logoAbsoluteUrl(): string {
  return logoUrl.startsWith("http") ? logoUrl : `${window.location.origin}${logoUrl}`;
}

export function statusPill(status: string): string {
  const key = status.toLowerCase().replace(/ /g, "_");
  const color = STATUS_COLOR[key] ?? "#94a3b8";
  return `<span class="pill" style="background:${color}1a;color:${color};border:1px solid ${color}40">${esc(status)}</span>`;
}

// ── Print shell ─────────────────────────────────────────────────────────────

export const PRINT_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'avenir-lt-pro', 'Segoe UI', system-ui, -apple-system, Arial, sans-serif;
    font-size: 10.5pt; color: #1e293b; background: #fff;
  }
  .page { max-width: 900px; margin: 0 auto; padding: 48px 56px; }

  /* Cover */
  .cover { padding-bottom: 28px; margin-bottom: 24px; }
  .cover-banner {
    background: ${PF_GREY}; margin: -48px -56px 44px; padding: 50px 56px 22px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .cover-banner img { height: 60px; width: auto; display: block; }
  .cover-eyebrow { font-size: 10pt; font-weight: 700; color: ${PF_GREEN}; text-transform: uppercase; letter-spacing: 0.18em; margin-bottom: 16px; }
  .cover-title { font-size: 32pt; font-weight: 800; color: ${PF_NAVY}; letter-spacing: -0.02em; line-height: 1.05; margin-bottom: 22px; }
  .cover-for { font-size: 10.5pt; color: #64748b; margin-bottom: 6px; }
  .cover-customer { font-size: 20pt; font-weight: 800; color: ${PF_NAVY}; line-height: 1.1; margin-bottom: 26px; }
  .cover-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; padding-top: 20px; border-top: 2px solid ${PF_GREEN}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cover-meta-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: ${PF_GREEN}; margin-bottom: 5px; }
  .cover-meta-value { font-size: 10.5pt; font-weight: 700; color: ${PF_NAVY}; line-height: 1.3; }

  /* Roll-up strip */
  .rollup {
    display: flex; gap: 16px; padding: 18px 24px; background: ${PF_GREY};
    border-left: 6px solid ${PF_GREEN}; margin-bottom: 26px;
    page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .rollup-cell { flex: 1; text-align: center; }
  .rollup-num { font-size: 26pt; font-weight: 900; line-height: 1; }
  .rollup-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-top: 5px; }

  /* Grouped sections (stages on the standard tab, Asana sections on the plan) */
  .stage { margin-bottom: 26px; page-break-inside: auto; }
  .stage-head { margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid ${PF_GREEN}; page-break-after: avoid; break-after: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .stage-name { font-size: 13pt; font-weight: 800; color: ${PF_NAVY}; letter-spacing: -0.01em; }
  .stage-sub { font-size: 9pt; color: #64748b; margin-top: 3px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; }
  .data-table thead tr { background: ${PF_NAVY}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .data-table thead th { padding: 8px 10px; color: #fff; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: 0.06em; font-size: 7.5pt; }
  .data-table tbody tr.even { background: #f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .data-table tbody td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; line-height: 1.45; font-size: 9.5pt; page-break-inside: avoid; }
  .task-title { font-weight: 600; color: ${PF_NAVY}; }
  .task-sub { font-size: 8.5pt; color: #64748b; margin-top: 2px; line-height: 1.4; }
  .task-blocked { font-size: 8.5pt; color: #d13438; font-weight: 600; margin-top: 2px; }

  .pill { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tag { display: inline-block; padding: 1px 7px; border-radius: 3px; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.04em; background: rgba(0,59,92,0.08); color: ${PF_NAVY}; margin-right: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .overdue { color: #b45309; font-weight: 700; }
  .muted { color: #94a3b8; }

  .empty { color: #64748b; font-size: 10pt; font-style: italic; padding: 6px 0; }

  /* Out-of-range date warning (the custom plan's dates aren't validated on import) */
  .date-warning {
    background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px;
    padding: 9px 14px; margin-bottom: 20px; font-size: 9.5pt; color: #92400e;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 7.5pt; color: #94a3b8; display: flex; align-items: center; justify-content: space-between; }
  .footer img { height: 16px; width: auto; opacity: 0.5; }

  .print-tip { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 16px; margin-bottom: 24px; font-size: 9.5pt; color: #92400e; display: flex; align-items: center; gap: 10px; }

  @media print {
    .print-tip { display: none !important; }
    @page { margin: 14mm 16mm; }
  }
`;

/** Hidden when printing — tells the user how to drop the browser's own
 *  header/footer so the PDF doesn't carry a URL and timestamp. */
export function printTipBlock(): string {
  return `
    <div class="print-tip">
      <span style="font-size:14pt">💡</span>
      <span>In the print dialog, uncheck <strong>"Headers and footers"</strong> (Chrome) or <strong>"Print headers and footers"</strong> (Firefox/Edge) to remove the browser URL and date.</span>
    </div>
  `;
}

export function coverBlock(opts: {
  eyebrow: string;
  title: string;
  customerName: string;
  meta: Array<{ label: string; value: string }>;
  logo: string;
}): string {
  const metaHtml = opts.meta
    .map((m) => `<div><div class="cover-meta-label">${esc(m.label)}</div><div class="cover-meta-value">${esc(m.value)}</div></div>`)
    .join("");
  return `
    <div class="cover">
      <div class="cover-banner">
        <img src="${opts.logo}" alt="Packet Fusion" onerror="this.style.display='none'"/>
      </div>
      <div class="cover-eyebrow">${esc(opts.eyebrow)}</div>
      <div class="cover-title">${esc(opts.title)}</div>
      <div class="cover-for">Prepared for</div>
      <div class="cover-customer">${esc(opts.customerName)}</div>
      <div class="cover-meta">${metaHtml}</div>
    </div>
  `;
}

export function footerBlock(logo: string): string {
  return `
    <div class="footer">
      <span>CloudConnect by Packet Fusion · ${esc(longDate(todayIso()))}</span>
      <img src="${logo}" alt="" onerror="this.style.display='none'"/>
    </div>
  `;
}

/** Wrap a document body in the full HTML shell. `extraCss` lets a caller add
 *  document-specific rules without forking PRINT_CSS. */
export function printDocument(opts: { title: string; body: string; extraCss?: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(opts.title)}</title>
  <link rel="stylesheet" href="https://use.typekit.net/dty1vuu.css"/>
  <style>${PRINT_CSS}${opts.extraCss ?? ""}</style>
</head>
<body>
<div class="page">
${opts.body}
</div>
</body>
</html>`;
}

/** Open the doc in a new tab and fire the print dialog once images have decoded
 *  — printing earlier lays the logo out in a default squished box because its
 *  intrinsic ratio isn't known yet. (Lifted from OptimizeExports.) */
export function openPrintWindow(html: string): void {
  const win = window.open("", "_blank", "width=1000,height=780");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try { win.focus(); win.print(); } catch { /* window closed */ }
  };

  const imgs = Array.from(win.document.images);
  if (imgs.length === 0) {
    setTimeout(triggerPrint, 250);
    return;
  }
  let remaining = imgs.length;
  const onSettled = () => { remaining -= 1; if (remaining <= 0) setTimeout(triggerPrint, 120); };
  for (const img of imgs) {
    if (img.complete) onSettled();
    else {
      img.addEventListener("load", onSettled);
      img.addEventListener("error", onSettled);
    }
  }
  setTimeout(triggerPrint, 2500);
}

/** Build the standard five-cell status roll-up strip. */
export function rollupBlock(cells: Array<{ n: number; label: string; color: string }>): string {
  return `<div class="rollup">${cells.map((c) => `
    <div class="rollup-cell">
      <div class="rollup-num" style="color:${c.color}">${c.n}</div>
      <div class="rollup-label">${esc(c.label)}</div>
    </div>
  `).join("")}</div>`;
}
