/**
 * Scope of Work renderer — thin orchestrator on top of buildSowHtml.
 *
 * Replaces the previous 900-line inline renderer. Today's flow:
 *   1. Build a SowBuildContext from solution + needs assessment + labor estimates
 *      + sowData (sizing form) + sowMetadata (cover-page fields + revisions).
 *   2. Resolve the variant by solution.vendor + solution.solution_types[0].
 *   3. Call buildSowHtml() and pop a print window.
 *
 * The preview card stays small: it confirms what variant will render + flags
 * any missing data (needs assessment, labor estimate, or sizing-mode inputs)
 * before the PM clicks Export.
 */

import { useEffect, useState } from "react";
import type { NeedsAssessment, LaborEstimate, Solution, User } from "../../lib/api";
import type { SowData } from "./SowSizingForm";
import { calcSowTotal, calcBasicSowTotal, DEFAULT_BLENDED_RATE } from "../../../shared/sowAddOns";
import { calcUcaasBasicBreakdown, getUcaasTieredTier } from "../../../shared/ucaasBasicPricing";
import { buildSowHtml } from "../../../shared/sowTemplate/buildHtml";
import { resolveSowVariant } from "../../../shared/sowTemplate/variants";
import type { SowBuildContext } from "../../../shared/sowTemplate/types";
import { api } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";
import logoUrl from "../../assets/packetfusion-fullcolor.png";
import zoomUcaasHero from "../../assets/sow-hero-zoom-ucaas.jpg";
import heroUcaasGeneric from "../../assets/sow bg 1.png";
import heroCcaas        from "../../assets/sow bg 4.png";
import heroAiData       from "../../assets/sow bg 3.png";
// sow bg 2 (security/infra) reserved for future MSO / managed-services variants.

// Per-variant hero illustration map. Variants without an entry get a clean
// text-only cover (logo + title centered) — no broken-image fallback.
const HERO_URLS: Record<string, string> = {
  zoom_ucaas:     zoomUcaasHero,    // The docx-sourced UCaaS ecosystem hero
  ucaas_generic:  heroUcaasGeneric, // Shared between non-Zoom UCaaS variants
  ccaas:          heroCcaas,        // Contact center (Zoom + RingCentral)
  ai_data:        heroAiData,       // CI / VA / RC AIR — AI/data imagery
};

// ── Sow metadata blob shape (mirrors server) ─────────────────────────────────

export type SowRevision = {
  version: string;
  saved_at: string;
  saved_by_user_id: string | null;
  saved_by_name: string | null;
  note?: string | null;
};
export type SowMetadata = {
  msa_date?: string | null;
  revisions: SowRevision[];
};

export function parseSowMetadata(blob: string | null | undefined): SowMetadata {
  if (!blob) return { revisions: [] };
  try {
    const p = JSON.parse(blob) as Partial<SowMetadata>;
    return {
      msa_date: p.msa_date ?? null,
      revisions: Array.isArray(p.revisions) ? p.revisions : [],
    };
  } catch {
    return { revisions: [] };
  }
}

type Props = {
  solution: Solution;
  needsAssessment: NeedsAssessment | null;
  laborEstimates: LaborEstimate[];
  /** Free-form scope-of-work text from the solution. Currently unused by the
   *  new renderer (the template's Section 2 is hard-coded per variant) but
   *  kept on the prop interface for backwards compatibility with callers. */
  scopeText: string;
  sowData?: SowData | null;
  sowMetadata?: SowMetadata | null;
  currentUser: User | null;
  /** Called after a "Generate Version" click so the parent can refresh the
   *  solution row and re-render with the new revision. */
  onMetadataChanged?: () => void;
};

// ── Helpers — pluck counts from sow_data + needs_assessment ──────────────────

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickCounts(sd: SowData | null | undefined, na: NeedsAssessment | null): {
  locations: number; users: number; dids: number; meetings: number; goLives: number;
} {
  const locations = num(sd?.shared?.sites_count);
  const phases = num(sd?.shared?.phases_count);
  const users = num(sd?.ucaas?.basic_users) + num(sd?.ucaas?.advanced_users)
              + num(sd?.ucaas?.common_area) + num(sd?.ucaas?.conference_rooms);
  const dids = num(sd?.shared?.porting_did_count);
  // No dedicated Meetings count today — fall back to user count or 0.
  const a = na?.answers ?? {};
  const meetingsCount = num((a as Record<string, unknown>)["zoom_meetings_count"]);
  const meetings = meetingsCount > 0 ? meetingsCount : 0;
  // Go-live count defaults to phases or sites, whichever's set.
  const goLives = phases > 0 ? phases : locations;
  return { locations, users, dids, meetings, goLives };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ScopeOfWorkDocument({
  solution, needsAssessment, laborEstimates, sowData, sowMetadata, currentUser, onMetadataChanged,
}: Props) {
  const { showToast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [savingMsa, setSavingMsa] = useState(false);
  const [msaDateDraft, setMsaDateDraft] = useState(sowMetadata?.msa_date ?? "");
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => { setMsaDateDraft(sowMetadata?.msa_date ?? ""); }, [sowMetadata?.msa_date]);

  const variant = resolveSowVariant(solution.vendor, solution.solution_types ?? []);
  const counts = pickCounts(sowData ?? null, needsAssessment);

  // Fee math: prefer flat (tiered / basic) when configured; otherwise compute
  // from labor totals + add-ons. Matches the old renderer's logic.
  const addOns = Array.isArray(solution.add_ons) ? solution.add_ons : [];
  const blendedRate = solution.blended_rate || DEFAULT_BLENDED_RATE;
  // Sum total_expected hours across all per-type estimates — matches the old
  // renderer's preview total for non-flat pricing modes.
  const totalLaborHours = laborEstimates.reduce((sum, e) => sum + (e.total_expected ?? 0), 0);

  let feeBreakdown;
  if (solution.pricing_mode === "tiered") {
    const tier = getUcaasTieredTier(solution.basic_seat_count);
    const basicSubtotal = tier?.price ?? 0;
    feeBreakdown = calcBasicSowTotal(basicSubtotal, addOns, blendedRate);
  } else if (solution.pricing_mode === "basic" && solution.basic_inputs) {
    const basic = calcUcaasBasicBreakdown(solution.basic_inputs, blendedRate);
    feeBreakdown = calcBasicSowTotal(basic.total, addOns, blendedRate);
  } else {
    feeBreakdown = calcSowTotal(totalLaborHours, addOns, blendedRate);
  }

  const ctx: SowBuildContext = {
    customerName: solution.customer_name || "Customer",
    customerAddress: null,
    customerPrimaryContact: null,
    preparedBy: {
      name: currentUser?.name ?? currentUser?.email ?? "Packet Fusion, Inc.",
      title: "Solution Architect",
      email: currentUser?.email ?? null,
      phone: null,
    },
    projectReference: variant.projectReferenceTemplate.replace("{customer}", solution.customer_name ?? "Customer"),
    sowNumber: sowMetadata?.revisions?.length ? sowMetadata.revisions[sowMetadata.revisions.length - 1].version : "V1 (draft)",
    issueDateText: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    msaDate: sowMetadata?.msa_date ?? null,
    statusText: solution.status === "won" ? "Executed" : solution.status === "scope" ? "Draft for Review" : "Draft",
    revisions: (sowMetadata?.revisions ?? []).map((r) => ({
      version: r.version, saved_at: r.saved_at, saved_by_name: r.saved_by_name, note: r.note,
    })),
    feeTotal:    feeBreakdown.laborSubtotal,
    feeDiscount: feeBreakdown.addOnNet < 0 ? feeBreakdown.addOnNet : null,
    projectTotal: feeBreakdown.total,
    isBudgetary:    solution.is_budgetary === 1,
    isZoomReseller: solution.is_zoom_reseller === 1,
    locationCount:   counts.locations,
    primarySeatCount: counts.users,
    ditNumbers:      counts.dids,
    meetingsCount:   counts.meetings,
    goLiveCount:     counts.goLives,
  };

  function openPrintWindow() {
    const resolve = (url: string) => url.startsWith("http") ? url : `${window.location.origin}${url}`;
    const heroAsset = variant.heroImageKey ? HERO_URLS[variant.heroImageKey] : null;
    const html = buildSowHtml({
      variant, ctx,
      logoUrl: resolve(logoUrl),
      heroImageUrl: heroAsset ? resolve(heroAsset) : null,
      kickoffDate: null,
      goLiveDate: null,
    });
    const win = window.open("", "_blank", "width=960,height=750");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  async function saveMsaDate() {
    setSavingMsa(true);
    try {
      await api.updateSowMetadata(solution.id, { msa_date: msaDateDraft || null });
      showToast("MSA date saved.", "success");
      onMetadataChanged?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save MSA date", "error");
    } finally {
      setSavingMsa(false);
    }
  }

  async function generateVersion() {
    setGenerating(true);
    try {
      const res = await api.generateSowVersion(solution.id, { note: noteDraft.trim() || null });
      showToast(`Saved ${res.new_revision.version}.`, "success");
      setNoteDraft("");
      onMetadataChanged?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to generate version", "error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button className="ms-btn-primary" onClick={openPrintWindow} style={{ background: "#03395f" }}>
          Export / Print SOW
        </button>
        {variant.isStub && (
          <span style={{ fontSize: 12, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 4, padding: "2px 8px" }}>
            ⚠ {variant.productLine} variant is a stub — content pending in a follow-up PR
          </span>
        )}
      </div>

      {/* Metadata + versioning panel */}
      <div className="ms-section-card" style={{ padding: "16px 18px", marginBottom: 16 }}>
        <div className="ms-section-title" style={{ marginBottom: 12 }}>SOW Metadata</div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 14 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#334155", display: "block", marginBottom: 4 }}>Master Services Agreement date</span>
            <input
              type="date"
              className="ms-input"
              value={msaDateDraft}
              onChange={(e) => setMsaDateDraft(e.target.value)}
              disabled={savingMsa}
              style={{ fontSize: 13 }}
            />
          </label>
          <button className="ms-btn-secondary" onClick={saveMsaDate} disabled={savingMsa} style={{ fontSize: 12 }}>
            {savingMsa ? "Saving…" : "Save MSA date"}
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 14 }}>
          <label style={{ flex: 1, minWidth: 260 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#334155", display: "block", marginBottom: 4 }}>Generate version — change description (optional)</span>
            <input
              type="text"
              className="ms-input"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="e.g. Updated phase 4 dates after customer feedback"
              disabled={generating}
              style={{ fontSize: 13, width: "100%" }}
            />
          </label>
          <button className="ms-btn-primary" onClick={generateVersion} disabled={generating} style={{ fontSize: 12 }}>
            {generating ? "Saving…" : "Generate Version"}
          </button>
        </div>

        {(sowMetadata?.revisions?.length ?? 0) > 0 ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              Revision history
            </div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#64748b" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>Version</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>Date</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>Author</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {(sowMetadata!.revisions).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 600, color: "#03395f" }}>{r.version}</td>
                    <td style={{ padding: "6px 8px", color: "#475569" }}>{new Date(r.saved_at).toLocaleString()}</td>
                    <td style={{ padding: "6px 8px", color: "#475569" }}>{r.saved_by_name ?? "—"}</td>
                    <td style={{ padding: "6px 8px", color: "#475569" }}>{r.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
            No versions yet. Click <strong>Generate Version</strong> to snapshot the current SOW as V1.
          </div>
        )}
      </div>

      <div className="ms-card" style={{ padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#03395f", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
          Variant
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>{variant.productLine}</div>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          Customer <strong>{ctx.customerName}</strong> · Locations <strong>{ctx.locationCount}</strong> ·
          {" "}Primary seats <strong>{ctx.primarySeatCount}</strong> · DIDs <strong>{ctx.ditNumbers}</strong> · Project total <strong>${ctx.projectTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>
      </div>
    </div>
  );
}
