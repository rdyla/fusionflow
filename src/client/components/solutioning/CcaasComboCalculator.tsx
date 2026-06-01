/**
 * SA-facing combo (UCaaS + CCaaS) SOW calculator. Renders when the
 * solution's `solution_types` contains 'ccaas' AND `pricing_mode` is
 * 'basic'. Pure UCaaS solutions in basic mode continue to use the
 * UCaaS-only form in LaborEstimateView; this is the parallel form
 * for CCaaS-involved deals.
 *
 * Formulas + storage shape live in shared/ccaasComboPricing.ts. This
 * component is purely an inputs editor on top of solution.basic_inputs,
 * with a live breakdown panel so the SA sees the impact of each
 * change immediately.
 *
 * Storage: all inputs live on the same `basic_inputs` JSON column the
 * UCaaS-only form uses. Combo-only sub-blocks (ccaas, apps, zva_voice,
 * zva_chat, analog, final_discount_pct) are additive — UCaaS-only rows
 * remain a valid subset. See PR #306 for the parsing/server side.
 */

import { useMemo } from "react";
import {
  APP_KEYS,
  APP_LABELS,
  ANALOG_LABELS,
  ANALOG_HOURS_PER_UNIT,
  calcCcaasComboBreakdown,
  type CcaasComboInputs,
  type AppKey,
  type AppInputs,
  type ZvaInputs,
  type AnalogInputs,
} from "../../../shared/ccaasComboPricing";

const ZVA_DEFAULTS: ZvaInputs = {
  workflows: 0, knowledge_sources: 0, large_override_hours: 0, custom_dev_hours: 0,
};
const ANALOG_DEFAULTS: AnalogInputs = {
  did_porting_blocks: 0, analog_fax_devices: 0, paging_systems: 0,
  door_phones: 0, gate_controllers: 0, other_analog_devices: 0,
};
const APP_DEFAULT: AppInputs = { included: false, integrations: 0, custom_dev_hours: 0 };

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

type Props = {
  /** Controlled inputs (the combo blob). Held by the parent SOW Sizing form in
   *  sow_data.combo; the form's single Save persists it. */
  inputs: CcaasComboInputs;
  /** Blended rate for the live breakdown. */
  rate: number;
  canEdit: boolean;
  onChange: (next: CcaasComboInputs) => void;
};

export default function CcaasComboCalculator({ inputs, rate, canEdit, onChange }: Props) {
  const breakdown = useMemo(() => calcCcaasComboBreakdown(inputs, rate), [inputs, rate]);

  // ── Controlled patch helpers — each emits the full next blob via onChange ───
  function patchTop(p: Partial<CcaasComboInputs>) {
    onChange({ ...inputs, ...p });
  }
  function patchCcaas(p: Partial<NonNullable<CcaasComboInputs["ccaas"]>>) {
    onChange({ ...inputs, ccaas: { ...(inputs.ccaas ?? { agents: 0, omnichannel: false }), ...p } });
  }
  function patchApp(key: AppKey, p: Partial<AppInputs>) {
    onChange({ ...inputs, apps: { ...(inputs.apps ?? {}), [key]: { ...APP_DEFAULT, ...(inputs.apps?.[key] ?? {}), ...p } } });
  }
  function patchZva(which: "zva_voice" | "zva_chat", p: Partial<ZvaInputs>) {
    onChange({ ...inputs, [which]: { ...(inputs[which] ?? ZVA_DEFAULTS), ...p } });
  }
  function patchAnalog(p: Partial<AnalogInputs>) {
    onChange({ ...inputs, analog: { ...(inputs.analog ?? ANALOG_DEFAULTS), ...p } });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = { padding: "5px 8px", fontSize: 13, width: "100%" };
  const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 };
  const fieldLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 };
  const accent = "#003B5C";
  const accentGreen = "#17C662";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
      {/* ── Inputs column ──────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gap: 16 }}>
        {/* Core */}
        <div className="ms-card">
          <div style={sectionTitle}>Core Services</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <label>
              <span style={fieldLabel}>UCaaS Users</span>
              <input className="ms-input" type="number" min={0} value={inputs.users || ""}
                onChange={(e) => patchTop({ users: num(e.target.value) })} disabled={!canEdit} style={inputStyle} placeholder="0" />
            </label>
            <label>
              <span style={fieldLabel}>CCaaS Agents</span>
              <input className="ms-input" type="number" min={0} value={inputs.ccaas?.agents || ""}
                onChange={(e) => patchCcaas({ agents: num(e.target.value) })} disabled={!canEdit} style={inputStyle} placeholder="0" />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 18 }}>
              <input type="checkbox" checked={inputs.ccaas?.omnichannel === true}
                onChange={(e) => patchCcaas({ omnichannel: e.target.checked })} disabled={!canEdit} />
              <span style={{ fontSize: 12, color: "#475569" }}>CCaaS Omnichannel (40h base vs 20h voice)</span>
            </label>
            <label>
              <span style={fieldLabel}>Sites</span>
              <input className="ms-input" type="number" min={1} value={inputs.sites || ""}
                onChange={(e) => patchTop({ sites: Math.max(1, num(e.target.value)) })} disabled={!canEdit} style={inputStyle} placeholder="1" />
            </label>
            <label>
              <span style={fieldLabel}>Go-Live Events</span>
              <input className="ms-input" type="number" min={1} value={inputs.go_lives || ""}
                onChange={(e) => patchTop({ go_lives: Math.max(1, num(e.target.value)) })} disabled={!canEdit} style={inputStyle} placeholder="1" />
            </label>
            <label>
              <span style={fieldLabel}>Training Sessions ($290 ea)</span>
              <input className="ms-input" type="number" min={0} value={inputs.training_sessions || ""}
                onChange={(e) => patchTop({ training_sessions: num(e.target.value) })} disabled={!canEdit} style={inputStyle} placeholder="0" />
            </label>
          </div>
        </div>

        {/* Analog devices */}
        <div className="ms-card">
          <div style={sectionTitle}>Analog Devices</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {(Object.keys(ANALOG_HOURS_PER_UNIT) as (keyof typeof ANALOG_HOURS_PER_UNIT)[]).map((k) => (
              <label key={k}>
                <span style={fieldLabel}>{ANALOG_LABELS[k]} <span style={{ color: "#94a3b8" }}>· {ANALOG_HOURS_PER_UNIT[k]}h ea</span></span>
                <input className="ms-input" type="number" min={0}
                  value={inputs.analog?.[k] || ""}
                  onChange={(e) => patchAnalog({ [k]: num(e.target.value) } as Partial<AnalogInputs>)}
                  disabled={!canEdit} style={inputStyle} placeholder="0" />
              </label>
            ))}
          </div>
        </div>

        {/* Advanced apps */}
        <div className="ms-card">
          <div style={sectionTitle}>Advanced Apps · Tier: <span style={{ color: accent, textTransform: "capitalize" }}>{breakdown.appTier}</span> ({fmtUsd(breakdown.appTierPrice)}/app)</div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 110px 110px", gap: 10, fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", paddingBottom: 4, borderBottom: "1px solid #f1f5f9" }}>
              <div>App</div>
              <div style={{ textAlign: "center" }}>Included</div>
              <div style={{ textAlign: "center" }}>Integrations</div>
              <div style={{ textAlign: "center" }}>Custom Dev (h)</div>
            </div>
            {APP_KEYS.map((key) => {
              const a = inputs.apps?.[key] ?? APP_DEFAULT;
              return (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 110px 110px", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: "#1e293b" }}>{APP_LABELS[key]}</div>
                  <div style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={a.included === true}
                      onChange={(e) => patchApp(key, { included: e.target.checked })} disabled={!canEdit} />
                  </div>
                  <input className="ms-input" type="number" min={0} value={a.integrations || ""}
                    onChange={(e) => patchApp(key, { integrations: num(e.target.value) })}
                    disabled={!canEdit || !a.included} style={{ ...inputStyle, textAlign: "center" }} placeholder="0" />
                  <input className="ms-input" type="number" min={0} value={a.custom_dev_hours || ""}
                    onChange={(e) => patchApp(key, { custom_dev_hours: num(e.target.value) })}
                    disabled={!canEdit || !a.included} style={{ ...inputStyle, textAlign: "center" }} placeholder="0" />
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "#64748b" }}>
            {breakdown.appCount} app{breakdown.appCount === 1 ? "" : "s"} selected →
            {" "}<strong>{(breakdown.bundleDiscountPct * 100).toFixed(0)}%</strong> bundle discount applied to the apps + ZVA total.
          </div>
        </div>

        {/* ZVA Voice / ZVA Chat (side by side) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {(["zva_voice", "zva_chat"] as const).map((which) => {
            const z = inputs[which] ?? ZVA_DEFAULTS;
            const bd = which === "zva_voice" ? breakdown.zvaVoice : breakdown.zvaChat;
            return (
              <div key={which} className="ms-card">
                <div style={sectionTitle}>
                  {which === "zva_voice" ? "ZVA Voice" : "ZVA Chat"}
                  {bd.tier !== "none" && (
                    <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#e0f2fe", color: "#0369a1", textTransform: "capitalize" }}>{bd.tier}</span>
                  )}
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <label>
                    <span style={fieldLabel}>Workflows</span>
                    <input className="ms-input" type="number" min={0} value={z.workflows || ""}
                      onChange={(e) => patchZva(which, { workflows: num(e.target.value) })} disabled={!canEdit} style={inputStyle} placeholder="0" />
                  </label>
                  <label>
                    <span style={fieldLabel}>Knowledge Sources (10h ea)</span>
                    <input className="ms-input" type="number" min={0} value={z.knowledge_sources || ""}
                      onChange={(e) => patchZva(which, { knowledge_sources: num(e.target.value) })} disabled={!canEdit} style={inputStyle} placeholder="0" />
                  </label>
                  <label>
                    <span style={fieldLabel}>Large Override Hours <span style={{ color: "#94a3b8" }}>(applies when ≥21 workflows)</span></span>
                    <input className="ms-input" type="number" min={0} value={z.large_override_hours || ""}
                      onChange={(e) => patchZva(which, { large_override_hours: num(e.target.value) })}
                      disabled={!canEdit || bd.tier !== "large"} style={inputStyle} placeholder="0" />
                  </label>
                  <label>
                    <span style={fieldLabel}>Custom Dev Hours</span>
                    <input className="ms-input" type="number" min={0} value={z.custom_dev_hours || ""}
                      onChange={(e) => patchZva(which, { custom_dev_hours: num(e.target.value) })} disabled={!canEdit} style={inputStyle} placeholder="0" />
                  </label>
                </div>
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#64748b" }}>{bd.totalHours}h · {fmtUsd(bd.cost)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Final discount */}
        <div className="ms-card">
          <div style={sectionTitle}>Final Discount (optional)</div>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, alignItems: "center" }}>
            <input className="ms-input" type="number" min={0} max={100} step={0.5} value={inputs.final_discount_pct || ""}
              onChange={(e) => patchTop({ final_discount_pct: num(e.target.value) })} disabled={!canEdit} style={inputStyle} placeholder="0" />
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              % off the post-PM SOW Subtotal. Applies on top of the bundle discount.
            </div>
          </div>
        </div>

      </div>

      {/* ── Live breakdown sidebar ────────────────────────────────────────── */}
      <div className="ms-card" style={{ position: "sticky", top: 16 }}>
        <div style={sectionTitle}>Pricing Breakdown</div>
        <BreakdownRow label="UCaaS" hours={breakdown.ucaasHours} cost={breakdown.ucaasCost} />
        <BreakdownRow label={`CCaaS${inputs.ccaas?.omnichannel ? " (omni)" : " (voice)"}`} hours={breakdown.ccaasHours} cost={breakdown.ccaasCost} />
        <BreakdownRow label="Sites" hours={breakdown.sitesHours} cost={breakdown.sitesCost} />
        <BreakdownRow label="Go-lives" hours={breakdown.goLivesHours} cost={breakdown.goLivesCost} />
        <div style={subtotalRow}>
          <span>Core Services</span>
          <span style={{ fontWeight: 700 }}>{fmtUsd(breakdown.coreServicesTotal)}</span>
        </div>

        {breakdown.analogTotal > 0 && (
          <>
            <BreakdownRow label="Analog devices" hours={breakdown.analogRows.reduce((s, r) => s + r.hours, 0)} cost={breakdown.analogTotal} />
          </>
        )}

        {(breakdown.appBaseSubtotal + breakdown.appIntegrationCost + breakdown.appCustomDevCost + breakdown.zvaVoice.cost + breakdown.zvaChat.cost) > 0 && (
          <>
            <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Apps + ZVA bundle
            </div>
            {breakdown.appCount > 0 && <BreakdownRow label={`Apps base (${breakdown.appCount})`} cost={breakdown.appBaseSubtotal} />}
            {breakdown.appIntegrationCost > 0 && <BreakdownRow label="Integrations" cost={breakdown.appIntegrationCost} />}
            {breakdown.appCustomDevCost > 0 && <BreakdownRow label="App custom dev" cost={breakdown.appCustomDevCost} />}
            {breakdown.zvaVoice.cost > 0 && <BreakdownRow label="ZVA Voice" hours={breakdown.zvaVoice.totalHours} cost={breakdown.zvaVoice.cost} />}
            {breakdown.zvaChat.cost > 0 && <BreakdownRow label="ZVA Chat" hours={breakdown.zvaChat.totalHours} cost={breakdown.zvaChat.cost} />}
            <BreakdownRow label="Pre-discount" cost={breakdown.preDiscountTotal} />
            {breakdown.bundleDiscountPct > 0 && (
              <BreakdownRow label={`Bundle discount (${(breakdown.bundleDiscountPct * 100).toFixed(0)}%)`} cost={-(breakdown.preDiscountTotal - breakdown.bundleDiscountedTotal)} negative />
            )}
            <div style={subtotalRow}>
              <span>Bundled Total</span>
              <span style={{ fontWeight: 700 }}>{fmtUsd(breakdown.bundleDiscountedTotal)}</span>
            </div>
          </>
        )}

        {breakdown.trainingCost > 0 && (
          <BreakdownRow label="Training sessions" cost={breakdown.trainingCost} />
        )}

        <div style={{ ...subtotalRow, borderTop: "2px solid #cbd5e1", paddingTop: 8, marginTop: 8 }}>
          <span>Pre-PM subtotal</span>
          <span style={{ fontWeight: 700 }}>{fmtUsd(breakdown.subtotalPrePm)}</span>
        </div>
        <BreakdownRow label="PM (15%)" cost={breakdown.pm} />
        <div style={subtotalRow}>
          <span>SOW Subtotal</span>
          <span style={{ fontWeight: 700 }}>{fmtUsd(breakdown.sowSubtotal)}</span>
        </div>
        {breakdown.finalDiscountPct > 0 && (
          <BreakdownRow label={`Final discount (${(breakdown.finalDiscountPct * 100).toFixed(1)}%)`} cost={-(breakdown.sowSubtotal - breakdown.finalSowPrice)} negative />
        )}
        <div style={{ ...subtotalRow, borderTop: "2px solid " + accentGreen, paddingTop: 10, marginTop: 8, fontSize: 14 }}>
          <span style={{ fontWeight: 700, color: accentGreen }}>FINAL SOW PRICE</span>
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontWeight: 800, color: accentGreen }}>{fmtUsd(breakdown.finalSowPrice)}</span>
        </div>
      </div>
    </div>
  );
}

const subtotalRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", padding: "6px 0",
  borderBottom: "1px solid #f1f5f9", fontSize: 13, color: "#1e293b",
};

function BreakdownRow({ label, hours, cost, negative }: { label: string; hours?: number; cost: number; negative?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: "#475569" }}>
      <span>{label}{typeof hours === "number" && hours > 0 ? ` · ${hours}h` : ""}</span>
      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", color: negative ? "#065f46" : "#1e293b" }}>
        {(cost < 0 ? "-" : "") + "$" + Math.abs(cost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}
