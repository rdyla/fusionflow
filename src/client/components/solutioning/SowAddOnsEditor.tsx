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
import {
  UCAAS_BASIC_TIERS,
  UCAAS_BASIC_MAX_SEATS,
  getUcaasBasicTier,
  canUseBasicPricing,
} from "../../../shared/ucaasBasicPricing";

type PricingMode = "basic" | "advanced";

type Props = {
  solution: Solution;
  /** Aggregated final hours across every type's labor estimate. */
  laborHoursTotal: number;
  canEdit: boolean;
  onSaved: (next: {
    add_ons: AddOn[];
    blended_rate: number;
    sow_total_amount: number;
    pricing_mode: PricingMode;
    basic_seat_count: number | null;
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

export default function SowAddOnsEditor({ solution, laborHoursTotal, canEdit, onSaved }: Props) {
  const [addOns, setAddOns] = useState<AddOn[]>(solution.add_ons ?? []);
  const [rate, setRate] = useState<number>(solution.blended_rate || DEFAULT_BLENDED_RATE);
  const [pricingMode, setPricingMode] = useState<PricingMode>(solution.pricing_mode ?? "advanced");
  const [seatCount, setSeatCount] = useState<number | null>(solution.basic_seat_count ?? null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Re-sync when the solution prop changes (e.g. parent reloads after labor edit).
  useEffect(() => {
    setAddOns(solution.add_ons ?? []);
    setRate(solution.blended_rate || DEFAULT_BLENDED_RATE);
    setPricingMode(solution.pricing_mode ?? "advanced");
    setSeatCount(solution.basic_seat_count ?? null);
  }, [solution.add_ons, solution.blended_rate, solution.pricing_mode, solution.basic_seat_count]);

  const basicAvailable = canUseBasicPricing(solution.solution_types);
  // If a solution becomes a combo while it was on basic, force-display advanced.
  const effectiveMode: PricingMode = !basicAvailable && pricingMode === "basic" ? "advanced" : pricingMode;
  const tier = effectiveMode === "basic" ? getUcaasBasicTier(seatCount) : null;
  const seatCountOver = effectiveMode === "basic" && seatCount !== null && seatCount > UCAAS_BASIC_MAX_SEATS;

  const breakdown = effectiveMode === "basic"
    ? calcBasicSowTotal(tier?.price ?? 0, addOns, rate)
    : calcSowTotal(laborHoursTotal, addOns, rate);

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
        pricing_mode: effectiveMode,
        basic_seat_count: effectiveMode === "basic" ? (seatCount ?? null) : null,
      });
      setSavedAt(new Date().toLocaleTimeString());
      onSaved({
        add_ons: updated.add_ons ?? addOns,
        blended_rate: updated.blended_rate ?? rate,
        sow_total_amount: updated.sow_total_amount ?? breakdown.total,
        pricing_mode: updated.pricing_mode ?? effectiveMode,
        basic_seat_count: updated.basic_seat_count ?? null,
      });
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    JSON.stringify(addOns) !== JSON.stringify(solution.add_ons ?? []) ||
    rate !== (solution.blended_rate || DEFAULT_BLENDED_RATE) ||
    effectiveMode !== (solution.pricing_mode ?? "advanced") ||
    (seatCount ?? null) !== (solution.basic_seat_count ?? null);

  const accent = "#003B5C";
  const accentGreen = "#17C662";

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
      <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px" }}>
        {effectiveMode === "basic"
          ? "Basic pricing uses a flat tier price by seat count for sub-100-seat UCaaS deployments. Add-ons stack on top of the tier price."
          : "Labor hours come from the labor estimate. Add-ons charge or discount against that, then everything is priced at the blended rate."}
      </p>

      {/* Pricing mode toggle */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, padding: "10px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Pricing Mode</span>
        <div style={{ display: "inline-flex", border: "1px solid #cbd5e1", borderRadius: 6, overflow: "hidden" }}>
          {(["basic", "advanced"] as const).map((m) => {
            const selected = effectiveMode === m;
            const disabled = m === "basic" && !basicAvailable;
            return (
              <button
                key={m}
                type="button"
                disabled={!canEdit || disabled}
                onClick={() => setPricingMode(m)}
                style={{
                  padding: "5px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: selected ? accent : "#fff",
                  color: selected ? "#fff" : disabled ? "#cbd5e1" : "#1e293b",
                  border: "none",
                  borderRight: m === "basic" ? "1px solid #cbd5e1" : "none",
                  cursor: !canEdit || disabled ? "not-allowed" : "pointer",
                  textTransform: "capitalize",
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
        {!basicAvailable && (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            Basic pricing is only available for pure UCaaS solutions.
          </span>
        )}
      </div>

      {effectiveMode === "basic" ? (
        /* Basic mode — seat count + tier display */
        <div style={{ display: "grid", gridTemplateColumns: "180px 180px 1fr", gap: 16, alignItems: "stretch", marginBottom: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Seat Count</span>
            <input
              className="ms-input"
              type="number"
              min={1}
              step={1}
              value={seatCount ?? ""}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setSeatCount(Number.isFinite(n) && n > 0 ? n : null);
              }}
              disabled={!canEdit}
              placeholder="e.g. 50"
            />
          </label>
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
              title="Used only for hours-kind add-ons in basic mode"
            />
          </label>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, fontSize: 12 }}>
            <div>
              <div style={{ color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Tier</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: tier ? accent : "#94a3b8" }}>
                {tier ? `${tier.label} — ${fmtUsd(tier.price)}` : seatCountOver ? "Out of range" : "—"}
              </div>
            </div>
            <div>
              <div style={{ color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>SOW Total</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: tier ? accentGreen : "#94a3b8" }}>{tier ? fmtUsd(breakdown.total) : "—"}</div>
            </div>
          </div>
        </div>
      ) : (
        /* Advanced mode — labor hours + rate + breakdown */
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
            />
          </label>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, fontSize: 12 }}>
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
          </div>
        </div>
      )}

      {effectiveMode === "basic" && seatCountOver && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fff7ed", border: "1px solid #fde68a", borderRadius: 6, fontSize: 13, color: "#92400e" }}>
          Basic pricing covers up to {UCAAS_BASIC_MAX_SEATS} seats. For larger deployments, switch to Advanced.
        </div>
      )}

      {effectiveMode === "basic" && (
        <div style={{ marginBottom: 16, padding: "10px 12px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6, fontSize: 12, color: "#0369a1" }}>
          <strong>Tier ladder:</strong>{" "}
          {UCAAS_BASIC_TIERS.map((t, i) => (
            <span key={t.maxSeats}>
              {i > 0 && " · "}
              {t.label}: {fmtUsd(t.price)}
            </span>
          ))}
        </div>
      )}

      {/* Add-on rows */}
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
