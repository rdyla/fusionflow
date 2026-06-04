import { useEffect, useState } from "react";
import { api, type AddOn, type Solution } from "../../lib/api";
import {
  ADD_ON_KINDS,
  ADD_ON_KIND_LABELS,
  DEFAULT_BLENDED_RATE,
  calcSowTotal,
  calcBasicSowTotal,
  type AddOnKind,
} from "../../../shared/sowAddOns";
import { calcUcaasBasicBreakdown, getUcaasTieredTier, sowDataToBasicInputs } from "../../../shared/ucaasBasicPricing";
import {
  APP_LABELS,
  ANALOG_LABELS,
  calcCcaasComboBreakdown,
  isComboMode,
  parseCcaasComboInputs,
  sowDataToComboInputs,
  type AppKey,
} from "../../../shared/ccaasComboPricing";

type Props = {
  solution: Solution;
  /** Aggregated final hours across every type's labor estimate. Used in
   *  Advanced mode for the labor subtotal display. Ignored in Basic mode. */
  laborHoursTotal: number;
  canEdit: boolean;
  /** Customer-facing render. Strips the labor-rate input, labor breakdown,
   *  pricing-mode pointer, and intro copy — leaves only the add-on rows
   *  (read-only) + SOW total. Returns null when there are no add-ons since
   *  the bare total alone has nothing to anchor against on this card. */
  isClient?: boolean;
  onSaved: (next: {
    add_ons: AddOn[];
    blended_rate: number;
    sow_total_amount: number;
  }) => void;
};

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "ao_" + Math.random().toString(36).slice(2, 10);
}

export default function SowAddOnsEditor({ solution, laborHoursTotal, canEdit, isClient = false, onSaved }: Props) {
  const [addOns, setAddOns] = useState<AddOn[]>(solution.add_ons ?? []);
  const [rate, setRate] = useState<number>(solution.blended_rate || DEFAULT_BLENDED_RATE);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Re-sync when the solution prop changes (e.g. parent reloads after labor edit).
  useEffect(() => {
    setAddOns(solution.add_ons ?? []);
    setRate(solution.blended_rate || DEFAULT_BLENDED_RATE);
  }, [solution.add_ons, solution.blended_rate]);

  // Sizing now lives in the SOW Sizing form (sow_data), edited above on THIS
  // tab — not the Labor tab. Derive the pre-add-on subtotal from sow_data (with
  // a basic_inputs fallback for solutions saved before the consolidation), so
  // the price shown here matches the calculator.
  const isTiered = solution.pricing_mode === "tiered";
  const isBasic  = solution.pricing_mode === "basic";
  const isCombo  = isBasic && isComboMode(solution.solution_types);
  const isFlat   = isTiered || isBasic; // all bypass the labor estimate
  const tieredTier = isTiered ? getUcaasTieredTier(solution.basic_seat_count) : null;

  const sowData: unknown = (() => {
    try { return solution.sow_data ? JSON.parse(solution.sow_data) : null; } catch { return null; }
  })();
  const comboInputs = isCombo ? sowDataToComboInputs(sowData, parseCcaasComboInputs(solution.basic_inputs)) : null;
  const comboBreakdown = comboInputs ? calcCcaasComboBreakdown(comboInputs, rate) : null;
  const basicInputs = (isBasic && !isCombo) ? sowDataToBasicInputs(sowData, solution.basic_inputs) : null;
  const basicBreakdown = basicInputs ? calcUcaasBasicBreakdown(basicInputs, rate) : null;

  // Pre-add-on subtotal: tier price (tiered), formula total (basic non-combo),
  // or the combo final price (combo). Add-ons stack on top of whichever it is.
  let flatSubtotal = 0;
  if (isTiered) flatSubtotal = tieredTier?.price ?? 0;
  if (basicBreakdown) flatSubtotal = basicBreakdown.total;
  if (comboBreakdown) flatSubtotal = comboBreakdown.finalSowPrice;

  // All flat modes (tiered / basic / combo) stack external add-ons on the
  // subtotal and round the total UP; advanced uses labor hours. Combo's own
  // bundle/PM/final-discount math is baked into finalSowPrice above; add-ons
  // (e.g. extra dialing campaigns) bill on top of it.
  const breakdown = isFlat
    ? calcBasicSowTotal(flatSubtotal, addOns, rate)
    : calcSowTotal(laborHoursTotal, addOns, rate);
  const displayedTotal = breakdown.total;

  const flatReady = isCombo ? !!comboBreakdown : (isTiered ? !!tieredTier : !!basicBreakdown);

  function updateAddOn(idx: number, patch: Partial<AddOn>) {
    setAddOns((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }
  function addRow() {
    setAddOns((prev) => [...prev, { id: newId(), label: "", kind: "hours", value: 0 }]);
  }
  function removeRow(idx: number) {
    setAddOns((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api.updateSolution(solution.id, {
        add_ons: addOns,
        blended_rate: rate,
      });
      setSavedAt(new Date().toLocaleTimeString());
      onSaved({
        add_ons: updated.add_ons ?? addOns,
        blended_rate: updated.blended_rate ?? rate,
        sow_total_amount: updated.sow_total_amount ?? displayedTotal,
      });
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    JSON.stringify(addOns) !== JSON.stringify(solution.add_ons ?? []) ||
    rate !== (solution.blended_rate || DEFAULT_BLENDED_RATE);

  const accent = "#003B5C";
  const accentGreen = "#17C662";

  // ── Customer-facing render ────────────────────────────────────────────────
  // Strip everything internal-only (labor rate, labor breakdown, pricing-
  // mode pointer, derivation notes, save button). The pricing summary
  // ALWAYS renders as long as there's a meaningful total to show — the
  // customer needs to see what they're being charged. The add-on rows
  // sub-section only renders when add-ons exist; without any, the SOW
  // Total stands on its own. Whole card returns null only when there's
  // truly nothing — no calculated total AND no add-ons.
  if (isClient) {
    // Combo (CCaaS + basic) bakes its own discount/PM/final stack into the base
    // price (comboBreakdown, sourced from sow_data above); external add-ons then
    // bill on top via `breakdown`, same as every other mode.
    const hasTotal = displayedTotal > 0;
    const hasAddOns = addOns.length > 0;
    if (!hasTotal && !hasAddOns) return null;

    // Build a "based on" line-item list that explains where the total
    // came from. Tailored per pricing mode so the customer sees the
    // inputs they signed off on (and only those). Combo gets the
    // richest set since the formula has the most knobs.
    type SummaryRow = { label: string; value: string };
    const summaryRows: SummaryRow[] = [];
    if (isCombo && comboInputs) {
      if (comboInputs.users > 0)             summaryRows.push({ label: "UCaaS users",       value: comboInputs.users.toLocaleString() });
      const agents = comboInputs.ccaas?.agents ?? 0;
      if (agents > 0)                        summaryRows.push({ label: comboInputs.ccaas?.omnichannel ? "CCaaS agents (omni)" : "CCaaS agents (voice)", value: agents.toLocaleString() });
      if (comboInputs.sites > 0)             summaryRows.push({ label: "Sites",              value: comboInputs.sites.toLocaleString() });
      if (comboInputs.go_lives > 0)          summaryRows.push({ label: "Go-live events",     value: comboInputs.go_lives.toLocaleString() });
      if (comboInputs.training_sessions > 0) summaryRows.push({ label: "Training sessions",  value: comboInputs.training_sessions.toLocaleString() });
      // Analog devices — only surface device types with non-zero counts.
      const analog = comboInputs.analog;
      if (analog) {
        for (const k of Object.keys(ANALOG_LABELS) as (keyof typeof ANALOG_LABELS)[]) {
          const qty = analog[k] ?? 0;
          if (qty > 0) summaryRows.push({ label: ANALOG_LABELS[k], value: qty.toLocaleString() });
        }
      }
      // Apps included — single combined row listing names so the grid
      // doesn't blow up with one chip per app.
      const includedApps = comboBreakdown!.appRows.filter((r) => r.included);
      if (includedApps.length > 0) {
        summaryRows.push({
          label: `Apps (${comboBreakdown!.appTier} tier)`,
          value: includedApps.map((r) => APP_LABELS[r.key as AppKey]).join(" · "),
        });
      }
      // Virtual Agent — voice + chat share one cell so a single channel
      // doesn't strand a lone "ZVA Chat" tile on its own row.
      const zvaVoiceWf = comboBreakdown!.zvaVoice.workflows;
      const zvaChatWf = comboBreakdown!.zvaChat.workflows;
      if (zvaVoiceWf > 0 || zvaChatWf > 0) {
        const channels: string[] = [];
        if (zvaVoiceWf > 0) channels.push(`${zvaVoiceWf} voice`);
        if (zvaChatWf > 0) channels.push(`${zvaChatWf} chat`);
        const totalWf = zvaVoiceWf + zvaChatWf;
        summaryRows.push({
          label: `Virtual Agent workflow${totalWf === 1 ? "" : "s"}`,
          value: channels.join(" · "),
        });
      }
    } else if (basicInputs) {
      const bi = basicInputs;
      if (bi.users > 0)             summaryRows.push({ label: "Users",              value: bi.users.toLocaleString() });
      if (bi.sites > 0)             summaryRows.push({ label: "Sites",              value: bi.sites.toLocaleString() });
      if (bi.go_lives > 0)          summaryRows.push({ label: "Go-live events",     value: bi.go_lives.toLocaleString() });
      if (bi.training_sessions > 0) summaryRows.push({ label: "Training sessions",  value: bi.training_sessions.toLocaleString() });
      if (bi.onsite_sites > 0)      summaryRows.push({ label: "On-site visits",     value: bi.onsite_sites.toLocaleString() });
      if (bi.onsite_devices > 0)    summaryRows.push({ label: "On-site devices",    value: bi.onsite_devices.toLocaleString() });
    } else if (isTiered && tieredTier) {
      summaryRows.push({ label: "Plan",  value: tieredTier.label });
      if (solution.basic_seat_count != null) {
        summaryRows.push({ label: "Seats", value: solution.basic_seat_count.toLocaleString() });
      }
    } else if (!isFlat && laborHoursTotal > 0) {
      summaryRows.push({ label: "Implementation hours", value: `${laborHoursTotal.toLocaleString()}h` });
    }

    return (
      <div className="ms-card">
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          SOW Pricing{hasAddOns ? " & Add-Ons" : ""}
        </h3>
        {summaryRows.length > 0 && (
          <div style={{ marginBottom: hasAddOns ? 16 : 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Based on
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, alignItems: "start" }}>
              {summaryRows.map((r) => (
                <div key={r.label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px" }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 2 }}>{r.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{r.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {hasAddOns && (
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {addOns.map((line, i) => {
              const dollar = breakdown.addOnEffects[i]?.dollar ?? 0;
              const isDiscount = dollar < 0;
              return (
                <div
                  key={line.id}
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}
                >
                  <div style={{ fontSize: 13, color: "#1e293b" }}>{line.label || (isDiscount ? "Discount" : "Add-on")}</div>
                  <div style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 14, fontWeight: 700, color: isDiscount ? "#065f46" : "#1e293b", whiteSpace: "nowrap" }}>
                    {fmtUsd(dollar)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 4, borderTop: hasAddOns ? "2px solid #cbd5e1" : "none" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>SOW Total</div>
          <div style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 18, fontWeight: 800, color: accentGreen }}>
            {fmtUsd(displayedTotal)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ms-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          SOW Pricing &amp; Add-Ons
        </h3>
        {savedAt && !dirty && (
          <span style={{ fontSize: 12, color: "#10b981" }}>Saved {savedAt}</span>
        )}
      </div>

      {/* Pricing-mode pointer — sizing is entered in the SOW Sizing form above
          on this tab (basic/combo) or derived from the labor estimate (advanced). */}
      <div style={{ marginBottom: 14, padding: "8px 12px", background: isFlat ? "#f0f9ff" : "#f8fafc", border: `1px solid ${isFlat ? "#bae6fd" : "#e2e8f0"}`, borderRadius: 6, fontSize: 12, color: "#475569", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span>
          Pricing mode: <strong style={{ color: isFlat ? "#0369a1" : "#1e293b", textTransform: "capitalize" }}>{solution.pricing_mode ?? "advanced"}</strong>
          {isTiered && tieredTier && <> · {tieredTier.label} — {fmtUsd(tieredTier.price)}</>}
          {isTiered && !tieredTier && solution.basic_seat_count != null && <> · seat count out of range</>}
          {isTiered && solution.basic_seat_count == null && <> · no seat count set</>}
          {isCombo && comboInputs && (
            <> · {comboInputs.users} UCaaS · {comboInputs.ccaas?.agents ?? 0} agents · {fmtUsd(displayedTotal)}</>
          )}
          {isBasic && !isCombo && basicInputs && (
            <> · {basicInputs.users} user{basicInputs.users === 1 ? "" : "s"} · {fmtUsd(basicBreakdown?.total ?? 0)}</>
          )}
        </span>
        <span style={{ color: "#94a3b8" }}>{isFlat ? "Sized in the form above" : "From the labor estimate"}</span>
      </div>

      <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px" }}>
        {isCombo && "Combo pricing comes from the sizing form above (its own bundle, PM, and final-discount math). Add-ons below bill on top of that combo price — use them for separate items like extra dialing campaigns. Blended rate is used only for hours-kind add-ons."}
        {isTiered && "Add-ons stack on top of the tier price. Blended rate is used only for hours-kind add-ons."}
        {isBasic && !isCombo && "Add-ons stack on top of the formula total. Blended rate is used only for hours-kind add-ons."}
        {!isFlat && "Labor hours come from the labor estimate. Add-ons charge or discount against that, then everything is priced at the blended rate."}
      </p>

      {/* Rate + summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, alignItems: "stretch", marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Blended Rate ($/hr)</span>
          <input
            className="ms-input"
            type="number"
            min={0}
            step={1}
            value={rate || ""}
            onChange={(e) => setRate(Number(e.target.value) || 0)}
            disabled={!canEdit}
            placeholder={String(DEFAULT_BLENDED_RATE)}
            title={isFlat ? "Used only for hours-kind add-ons in tiered/basic mode" : undefined}
          />
        </label>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", display: "grid", gridTemplateColumns: isFlat ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 12, fontSize: 12 }}>
          {isCombo ? (
            <>
              <div>
                <div style={{ color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>SOW Subtotal</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: flatReady ? accent : "#94a3b8" }}>{flatReady ? fmtUsd(comboBreakdown!.sowSubtotal) : "—"}</div>
              </div>
              <div>
                <div style={{ color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>SOW Total</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: flatReady ? accentGreen : "#94a3b8" }}>{flatReady ? fmtUsd(displayedTotal) : "—"}</div>
              </div>
            </>
          ) : isFlat ? (
            <>
              <div>
                <div style={{ color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{isTiered ? "Tier Price" : "Basic Subtotal"}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: flatReady ? accent : "#94a3b8" }}>{flatReady ? fmtUsd(flatSubtotal) : "—"}</div>
              </div>
              <div>
                <div style={{ color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>SOW Total</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: flatReady ? accentGreen : "#94a3b8" }}>{flatReady ? fmtUsd(breakdown.total) : "—"}</div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div style={{ color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Labor Hours</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: accent }}>{breakdown.laborHours}h</div>
              </div>
              <div>
                <div style={{ color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Labor Subtotal</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: accent }}>{fmtUsd(breakdown.laborSubtotal)}</div>
              </div>
              <div>
                <div style={{ color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>SOW Total</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: accentGreen }}>{fmtUsd(breakdown.total)}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add-on rows — available in every mode, including combo. Add-ons (e.g.
          extra dialing campaigns) bill on top of the base/combo price. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Add-On Items
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={addRow}
            style={{ fontSize: 12, color: "#0891b2", background: "none", border: "1px solid #bae6fd", borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}
          >
            + Add Item
          </button>
        )}
      </div>

      {addOns.length === 0 && (
        <div style={{ fontSize: 13, color: "#94a3b8", padding: "10px 0" }}>
          No add-ons. Add an item to charge for custom work (e.g. extra training hours, third-party licensing) or apply a discount.
        </div>
      )}

      {addOns.map((line, i) => {
        const dollar = breakdown.addOnEffects[i]?.dollar ?? 0;
        const isDiscount = dollar < 0;
        const valueLabel = line.kind === "hours"
          ? "Hours"
          : line.kind === "discount_percent"
            ? "Percent"
            : "Amount";
        const valuePlaceholder = line.kind === "discount_percent" ? "10" : line.kind === "hours" ? "8" : "0";
        return (
          <div key={line.id} style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px 140px 36px", gap: 8, alignItems: "end", marginBottom: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {i === 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Description</span>}
              <input
                className="ms-input"
                value={line.label}
                onChange={(e) => updateAddOn(i, { label: e.target.value })}
                placeholder={isDiscount ? "Discount description" : "Item description"}
                disabled={!canEdit}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {i === 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</span>}
              <select
                className="ms-input"
                value={line.kind}
                onChange={(e) => updateAddOn(i, { kind: e.target.value as AddOnKind })}
                disabled={!canEdit}
              >
                {ADD_ON_KINDS.map((k) => (
                  <option key={k} value={k}>{ADD_ON_KIND_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {i === 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>{valueLabel}</span>}
              <input
                className="ms-input"
                type="number"
                value={line.value || ""}
                onChange={(e) => updateAddOn(i, { value: Number(e.target.value) || 0 })}
                placeholder={valuePlaceholder}
                disabled={!canEdit}
              />
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
              {i === 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Effect</span>}
              <div style={{ height: 38, display: "flex", alignItems: "center", fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 14, fontWeight: 700, color: isDiscount ? "#065f46" : "#0d1b2e", whiteSpace: "nowrap" }}>
                {fmtUsd(dollar)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={!canEdit}
              style={{ height: 38, padding: 0, background: "none", border: "1px solid #fecaca", borderRadius: 5, color: "#d13438", cursor: canEdit ? "pointer" : "not-allowed", fontSize: 16, opacity: canEdit ? 1 : 0.5 }}
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        );
      })}

      {addOns.some((a) => a.note != null) && (
        <div style={{ marginTop: 8, paddingLeft: 4, fontSize: 12, color: "#94a3b8" }}>
          Notes appear on the rendered SOW under their line item.
        </div>
      )}

      {canEdit && (
        <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <button
            className="ms-btn-primary"
            onClick={save}
            disabled={saving || !dirty}
            style={{ background: dirty ? accent : "#94a3b8" }}
          >
            {saving ? "Saving…" : "Save Pricing"}
          </button>
          {dirty && <span style={{ fontSize: 12, color: "#f59e0b" }}>Unsaved changes</span>}
        </div>
      )}
    </div>
  );
}
