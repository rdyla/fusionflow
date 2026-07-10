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
import { calcSowTotal, calcBasicSowTotal, DEFAULT_BLENDED_RATE, type AddOn } from "../../../shared/sowAddOns";
import { calcUcaasBasicBreakdown, getUcaasTieredTier, sowDataToBasicInputs } from "../../../shared/ucaasBasicPricing";
import { parseCcaasComboInputs, isComboMode, sowDataToComboInputs, calcCcaasComboBreakdown } from "../../../shared/ccaasComboPricing";
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
/** Total-duration band; drives the Key Dates table. "custom" pairs with `custom_weeks`. */
export type SowDurationBand = "4_6_weeks" | "6_8_weeks" | "8_12_weeks" | "custom";

export type SowMetadata = {
  msa_date?: string | null;
  /** PM-entered target go-live (YYYY-MM-DD). When set, the SOW's Key Dates
   *  table auto-derives Kickoff/Planning/Port/UAT/Closure rows from it. */
  target_go_live_date?: string | null;
  duration_band?: SowDurationBand | null;
  /** Only used when duration_band === "custom". */
  custom_weeks?: number | null;
  /** Overrides the customer name printed throughout the SOW. Set when the
   *  record's display name is a DBA but the contract needs the full legal
   *  entity name. Blank → falls back to solution.customer_name. */
  customer_legal_name?: string | null;
  revisions: SowRevision[];
};

export function parseSowMetadata(blob: string | null | undefined): SowMetadata {
  if (!blob) return { revisions: [] };
  try {
    const p = JSON.parse(blob) as Partial<SowMetadata>;
    return {
      msa_date:            p.msa_date ?? null,
      target_go_live_date: p.target_go_live_date ?? null,
      duration_band:       p.duration_band ?? null,
      custom_weeks:        p.custom_weeks ?? null,
      customer_legal_name: p.customer_legal_name ?? null,
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
  /** Free-form Scope Notes from the solution. Rendered as subsection 1.4
   *  "Scope Notes" (after 1.3 Scope at a Glance) in the SOW
   *  (via ctx.additionalScopeNotes) when non-empty. */
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

function pickCounts(
  sd: SowData | null | undefined,
  na: NeedsAssessment | null,
  solution: Solution,
): { locations: number; users: number; ccaasAgents: number; ciSeats: number; vaWorkflows: number; dids: number; meetings: number; goLives: number; trainingSessions: number } {
  // Advanced-mode source: the SOW Sizing Form blob (sow_data).
  const sdLocations = num(sd?.shared?.sites_count);
  const sdStages    = num(sd?.shared?.phases_count);
  const sdUsers     = num(sd?.ucaas?.basic_users) + num(sd?.ucaas?.advanced_users)
                    + num(sd?.ucaas?.common_area) + num(sd?.ucaas?.conference_rooms);

  // Basic-mode fallback: PMs entering inputs through the simplified calculator
  // never populate sow_data, so the snapshot tiles + Scope at a Glance would
  // render as zeros. Pull counts from solution.basic_inputs (basic mode) or
  // solution.basic_seat_count (tiered mode) when sow_data is missing them.
  const basic = solution.basic_inputs ?? null;
  const tieredSeats = num(solution.basic_seat_count);

  const locations = sdLocations > 0 ? sdLocations : num(basic?.sites);
  const users     = sdUsers > 0
    ? sdUsers
    : (basic ? num(basic.users) : tieredSeats);
  // DIDs to port = one ported number per user/seat + any additional DIDs on
  // top (e.g. 23 users + 50 additional = 73). additional_did is the UCaaS
  // sizing form's "Additional DIDs" field.
  const additionalDids = num(sd?.ucaas?.additional_did);
  const dids      = users + additionalDids;
  const a = na?.answers ?? {};
  const meetingsCount = num((a as Record<string, unknown>)["zoom_meetings_count"]);
  const meetings = meetingsCount > 0 ? meetingsCount : 0;
  // Go-live count: phases (advanced) → basic.go_lives → locations.
  const goLives = sdStages > 0
    ? sdStages
    : (basic && num(basic.go_lives) > 0 ? num(basic.go_lives) : locations);

  // Per-type headline counts (combo SOWs need distinct numbers, not one shared
  // "primary"). Primary source is the SOW Sizing form (sow_data):
  //  - CCaaS agents: ccaas.agents
  //  - CI recorded seats: ci.licensed_seats
  //  - VA workflows: count of enabled VA channels (voice + chat + sms)
  //
  // CCaaS fallback: a basic-mode UCaaS+CCaaS combo stores the agent count in
  // basic_inputs.ccaas.agents (via CcaasComboCalculator), not sow_data. Fall
  // back to it — like the UCaaS users fallback above — so a combo/basic SOW
  // that never filled the sizing form doesn't export 0 agents (WFM/QM tiles
  // inherit this count too).
  const comboInputs = parseCcaasComboInputs(solution.basic_inputs);
  const sdCcaasAgents = num(sd?.ccaas?.agents);
  const ccaasAgents = sdCcaasAgents > 0 ? sdCcaasAgents : num(comboInputs?.ccaas?.agents);
  const ciSeats     = num(sd?.ci?.licensed_seats);
  const vaWorkflows = (sd?.va?.voice ? 1 : 0) + (sd?.va?.chat ? 1 : 0) + (sd?.va?.sms ? 1 : 0);
  // Instructor-led training sessions scoped/priced on the SOW (sow_data, then
  // basic_inputs fallback). > 0 means the "Scope at a Glance" training row
  // should show the session count, not the default "Self-paced".
  const trainingSessions = num(sd?.ucaas?.training_sessions) || num(basic?.training_sessions);

  // Combo (UCaaS+CCaaS Basic): all sizing lives in sow_data.combo (fallback to
  // legacy basic_inputs). Source the headline counts from it so the SOW shows
  // the combo's users / agents / sites / go-lives.
  if (isComboMode(solution.solution_types ?? [])) {
    const combo = sowDataToComboInputs(sd, parseCcaasComboInputs(solution.basic_inputs));
    // Combo sizes virtual agent via the calculator's ZVA Voice/Chat workflows,
    // not the sow.va channel toggles — so VA workflow count = the two ZVA
    // workflow counts (fall back to the channel-based count if no ZVA entered).
    const zvaWorkflows = (combo.zva_voice?.workflows ?? 0) + (combo.zva_chat?.workflows ?? 0);
    return {
      locations: combo.sites || locations,
      users:     combo.users || users,
      ccaasAgents: combo.ccaas?.agents ?? ccaasAgents,
      ciSeats,
      vaWorkflows: zvaWorkflows > 0 ? zvaWorkflows : vaWorkflows,
      dids:      (combo.users || users) + additionalDids,
      meetings,
      goLives:   combo.go_lives || goLives,
      trainingSessions: num(combo.training_sessions) || trainingSessions,
    };
  }

  return { locations, users, ccaasAgents, ciSeats, vaWorkflows, dids, meetings, goLives, trainingSessions };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ScopeOfWorkDocument({
  solution, needsAssessment, laborEstimates, scopeText, sowData, sowMetadata, currentUser, onMetadataChanged,
}: Props) {
  const { showToast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [savingMsa, setSavingMsa] = useState(false);
  // Customers can VIEW a generated SOW (summary + Export/Print PDF) but
  // shouldn't see any of the metadata-editing controls or version-bump
  // affordances. Derived once from currentUser.role.
  const isClient = currentUser?.role === "client";
  const [msaDateDraft, setMsaDateDraft] = useState(sowMetadata?.msa_date ?? "");
  // Drafts for the timeline-derivation inputs. When blank, the renderer
  // falls back to the needs assessment's project_context answers (target
  // go-live + project_duration_band).
  const [goLiveDraft, setGoLiveDraft]   = useState(sowMetadata?.target_go_live_date ?? "");
  const [bandDraft, setBandDraft]       = useState<string>(sowMetadata?.duration_band ?? "");
  const [customWeeksDraft, setCustomWeeksDraft] = useState<string>(sowMetadata?.custom_weeks?.toString() ?? "");
  const [savingTimeline, setSavingTimeline] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  // Legal-name override (DBA vs full entity name on the contract). Blank → use
  // the record's display name.
  const [legalNameDraft, setLegalNameDraft] = useState(sowMetadata?.customer_legal_name ?? "");
  const [savingLegalName, setSavingLegalName] = useState(false);

  useEffect(() => { setMsaDateDraft(sowMetadata?.msa_date ?? ""); }, [sowMetadata?.msa_date]);
  useEffect(() => { setLegalNameDraft(sowMetadata?.customer_legal_name ?? ""); }, [sowMetadata?.customer_legal_name]);
  useEffect(() => {
    setGoLiveDraft(sowMetadata?.target_go_live_date ?? "");
    setBandDraft(sowMetadata?.duration_band ?? "");
    setCustomWeeksDraft(sowMetadata?.custom_weeks?.toString() ?? "");
  }, [sowMetadata?.target_go_live_date, sowMetadata?.duration_band, sowMetadata?.custom_weeks]);

  const variant = resolveSowVariant(solution.vendor, solution.solution_types ?? []);
  const naAnswers = (needsAssessment?.answers ?? {}) as Record<string, unknown>;
  const counts = pickCounts(sowData ?? null, needsAssessment, solution);

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
  } else if (solution.pricing_mode === "basic" && !isComboMode(solution.solution_types ?? [])) {
    // Basic (non-combo): the consolidated SOW Sizing form is the source;
    // fall back to legacy basic_inputs for solutions not yet re-saved.
    const basic = calcUcaasBasicBreakdown(sowDataToBasicInputs(sowData ?? null, solution.basic_inputs), blendedRate);
    feeBreakdown = calcBasicSowTotal(basic.total, addOns, blendedRate);
  } else if (solution.pricing_mode === "basic" && isComboMode(solution.solution_types ?? [])) {
    // Basic combo: single source is sow_data.combo (fallback basic_inputs).
    // Combo owns its PM + bundle/final discounts and does NOT run the add-ons
    // table — match the server (recomputeSowTotal) exactly.
    const combo = calcCcaasComboBreakdown(sowDataToComboInputs(sowData ?? null, parseCcaasComboInputs(solution.basic_inputs)), blendedRate);
    // Combo price is the base; external add-ons stack on top (e.g. "2 outbound
    // dialing campaigns — $1,200"), then the total rounds UP to the next $250 —
    // same as every other mode and the server (recomputeSowTotal).
    feeBreakdown = calcBasicSowTotal(combo.finalSowPrice, addOns, blendedRate);
  } else {
    feeBreakdown = calcSowTotal(totalLaborHours, addOns, blendedRate);
  }

  // Legal-name override wins over the record's display name across the whole
  // document (cover, intro, signature block, project reference).
  const docCustomerName = sowMetadata?.customer_legal_name?.trim() || solution.customer_name || "Customer";

  const ctx: SowBuildContext = {
    customerName: docCustomerName,
    customerAddress: null,
    customerPrimaryContact: null,
    preparedBy: {
      name: currentUser?.name ?? currentUser?.email ?? "Packet Fusion, Inc.",
      title: "Solution Architect",
      email: currentUser?.email ?? null,
      phone: null,
    },
    projectReference: variant.projectReferenceTemplate.replace("{customer}", docCustomerName),
    sowNumber: sowMetadata?.revisions?.length ? sowMetadata.revisions[sowMetadata.revisions.length - 1].version : "V1 (draft)",
    issueDateText: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    msaDate: sowMetadata?.msa_date ?? null,
    // Date cascade for the Key Dates table: PM's explicit SOW form value
    // wins; otherwise pull from the needs assessment (project_context
    // section); otherwise null and the cover renders "[MM/DD/YYYY]" rows.
    targetGoLiveDate: sowMetadata?.target_go_live_date
                   ?? (naAnswers["target_go_live_date"] as string | undefined)
                   ?? null,
    durationBand: sowMetadata?.duration_band
               ?? (naAnswers["project_duration_band"] as ("4_6_weeks" | "6_8_weeks" | "8_12_weeks" | "custom" | undefined))
               ?? null,
    customWeeks: sowMetadata?.custom_weeks ?? null,
    statusText: solution.status === "won" ? "Executed" : solution.status === "scope" ? "Draft for Review" : "Draft",
    revisions: (sowMetadata?.revisions ?? []).map((r) => ({
      version: r.version, saved_at: r.saved_at, saved_by_name: r.saved_by_name, note: r.note,
    })),
    // Customer-facing pricing: a base "Professional Services" line, each add-on
    // itemized (charge or discount), then the rounded-up Project Total. The base
    // line is derived as projectTotal − Σ add-ons so the summary always foots to
    // clean numbers and the raw pre-round subtotal is never shown.
    ...(() => {
      const effects = feeBreakdown.addOnEffects ?? [];
      const addOnLines = (addOns as AddOn[])
        .map((a, i) => ({
          label: (a.label && a.label.trim()) || ((effects[i]?.dollar ?? 0) < 0 ? "Discount" : "Additional service"),
          amount: effects[i]?.dollar ?? 0,
        }))
        .filter((l) => l.amount !== 0);
      const addOnNet = addOnLines.reduce((s, l) => s + l.amount, 0);
      return {
        feeTotal: feeBreakdown.total - addOnNet,
        addOnLines,
        projectTotal: feeBreakdown.total,
      };
    })(),
    additionalScopeNotes: scopeText && scopeText.trim() ? scopeText.trim() : null,
    isBudgetary:    solution.is_budgetary === 1,
    isZoomReseller: solution.is_zoom_reseller === 1,
    locationCount:   counts.locations,
    primarySeatCount: counts.users,
    ucaasSeatCount:  counts.users,
    ccaasAgentCount: counts.ccaasAgents,
    ciSeatCount:     counts.ciSeats,
    vaWorkflowCount: counts.vaWorkflows,
    ditNumbers:      counts.dids,
    meetingsCount:   counts.meetings,
    goLiveCount:     counts.goLives,
    trainingSessions: counts.trainingSessions,
  };

  function buildSowDocHtml(): string {
    const resolve = (url: string) => url.startsWith("http") ? url : `${window.location.origin}${url}`;
    const heroAsset = variant.heroImageKey ? HERO_URLS[variant.heroImageKey] : null;
    return buildSowHtml({
      variant, ctx,
      logoUrl: resolve(logoUrl),
      heroImageUrl: heroAsset ? resolve(heroAsset) : null,
      kickoffDate: null,
      goLiveDate: null,
    });
  }

  function openPrintWindow() {
    const html = buildSowDocHtml();
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

  async function saveLegalName() {
    setSavingLegalName(true);
    try {
      await api.updateSowMetadata(solution.id, { customer_legal_name: legalNameDraft.trim() || null });
      showToast(legalNameDraft.trim() ? "Customer legal name saved." : "Legal-name override cleared.", "success");
      onMetadataChanged?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save customer legal name", "error");
    } finally {
      setSavingLegalName(false);
    }
  }

  async function saveTimeline() {
    setSavingTimeline(true);
    try {
      const band = bandDraft ? (bandDraft as "4_6_weeks" | "6_8_weeks" | "8_12_weeks" | "custom") : null;
      const custom = band === "custom" ? (parseInt(customWeeksDraft, 10) || null) : null;
      await api.updateSowMetadata(solution.id, {
        target_go_live_date: goLiveDraft || null,
        duration_band: band,
        custom_weeks: custom,
      });
      showToast("Timeline inputs saved.", "success");
      onMetadataChanged?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save timeline", "error");
    } finally {
      setSavingTimeline(false);
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
      {/* Metadata + versioning panel — staff only. Customers see only the
          Export/Print button at the bottom; they have no business poking at
          the MSA date / duration band / revision-bump controls. */}
      {!isClient && (
      <div className="ms-section-card" style={{ padding: "16px 18px", marginBottom: 16 }}>
        <div className="ms-section-title" style={{ marginBottom: 12 }}>SOW Metadata</div>

        {/* Customer legal-name override — for records tracked under a DBA whose
            contract must carry the full legal entity name. Drives every
            "Prepared for / the Customer" reference in the generated document. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 6 }}>
          <label style={{ flex: 1, minWidth: 280 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#334155", display: "block", marginBottom: 4 }}>Customer legal name (override)</span>
            <input
              type="text"
              className="ms-input"
              value={legalNameDraft}
              onChange={(e) => setLegalNameDraft(e.target.value)}
              placeholder={solution.customer_name || "Customer"}
              disabled={savingLegalName}
              style={{ fontSize: 13, width: "100%" }}
            />
          </label>
          <button className="ms-btn-secondary" onClick={saveLegalName} disabled={savingLegalName} style={{ fontSize: 12 }}>
            {savingLegalName ? "Saving…" : "Save legal name"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#64748b", marginTop: 0, marginBottom: 14 }}>
          Leave blank to use the customer's display name (<strong>{solution.customer_name || "Customer"}</strong>). Set this only when the contract must show a different legal entity name — e.g. the account is tracked under a DBA but the SOW needs the full registered name.
        </p>

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

        {/* Timeline derivation inputs — drive the Key Dates table on the SOW
            cover. Cascades through naAnswers when blank: when the PM has
            filled in `target_go_live_date` + `project_duration_band` on the
            needs assessment, these don't even need to be touched. The
            renderer will use the NA values automatically. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 6 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#334155", display: "block", marginBottom: 4 }}>Target go-live date</span>
            <input
              type="date"
              className="ms-input"
              value={goLiveDraft}
              onChange={(e) => setGoLiveDraft(e.target.value)}
              disabled={savingTimeline}
              style={{ fontSize: 13 }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#334155", display: "block", marginBottom: 4 }}>Proposed project duration</span>
            <select
              className="ms-input"
              value={bandDraft}
              onChange={(e) => setBandDraft(e.target.value)}
              disabled={savingTimeline}
              style={{ fontSize: 13 }}
            >
              <option value="">— (assume 8–12 weeks)</option>
              <option value="4_6_weeks">4–6 weeks</option>
              <option value="6_8_weeks">6–8 weeks</option>
              <option value="8_12_weeks">8–12 weeks (standard UCaaS)</option>
              <option value="custom">Custom…</option>
            </select>
          </label>
          {bandDraft === "custom" && (
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#334155", display: "block", marginBottom: 4 }}>Custom weeks</span>
              <input
                type="number"
                min={1}
                max={52}
                className="ms-input"
                value={customWeeksDraft}
                onChange={(e) => setCustomWeeksDraft(e.target.value)}
                disabled={savingTimeline}
                style={{ fontSize: 13, width: 90 }}
              />
            </label>
          )}
          <button className="ms-btn-secondary" onClick={saveTimeline} disabled={savingTimeline} style={{ fontSize: 12 }}>
            {savingTimeline ? "Saving…" : "Save timeline"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#64748b", marginTop: 0, marginBottom: 14 }}>
          When blank, the SOW falls back to the needs assessment's <em>Target go-live date</em> + <em>Proposed project duration</em> answers. The Planning Complete and Port Orders Submitted milestones scale with the chosen band; Kickoff (+5 business days from SOW exec) and Closure (+1 week from Go-Live) stay fixed.
        </p>

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
      )}

      {/* Generate the SOW — bottom of the tab, after sizing / pricing / notes. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 4 }}>
        <button className="ms-btn-primary" onClick={openPrintWindow} style={{ background: "#03395f" }}>
          Export / Print SOW
        </button>
        {variant.isStub && (
          <span style={{ fontSize: 12, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 4, padding: "2px 8px" }}>
            ⚠ {variant.productLine} variant is a stub — content pending in a follow-up PR
          </span>
        )}
      </div>
    </div>
  );
}
