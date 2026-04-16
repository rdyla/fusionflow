import type { OppFormData, OppCalcResult } from "../../lib/calcSupport";
import { fmt, fmtFull } from "../../lib/calcSupport";
import { MSO_TIERS, getMsoTier } from "../../lib/msoTiers";

const ADV_APP_PRODUCTS: Record<string, string[]> = {
  zoom: ["Zoom Virtual Agent (ZVA)", "Zoom Revenue Accelerator (ZRA)", "Zoom Quality Management (QM)", "Zoom Workforce Management (WFM)", "Zoom AI Expert Assist", "Workvivo", "Custom API / Integration"],
  ringcentral: ["RingCX AI (RAIR)", "RingSense (AI Conversation Intelligence)", "RingCX AVA", "RingCX ACE", "Custom API / Integration"],
  other: ["Custom AI / Automation", "API Integration", "Custom Development"],
};

interface Props {
  form: OppFormData;
  calc: OppCalcResult;
  canOverride: boolean;
  onChange: (patch: Partial<OppFormData>) => void;
}

const OPP_TYPES = ["UCaaS Only", "CCaaS Only", "UCaaS + CCaaS", "Advanced Applications"] as const;

export default function CalculatorForm({ form, calc, canOverride, onChange }: Props) {
  const msoTier = getMsoTier(form.msoTier);

  function setField<K extends keyof OppFormData>(key: K, value: OppFormData[K]) {
    onChange({ [key]: value } as Partial<OppFormData>);
  }

  function addCustomLine() {
    onChange({ customLines: [...(form.customLines ?? []), { label: "", price: 0 }] });
  }

  function updateCustomLine(i: number, patch: Partial<{ label: string; price: number }>) {
    const lines = [...(form.customLines ?? [])];
    lines[i] = { ...lines[i], ...patch };
    onChange({ customLines: lines });
  }

  function removeCustomLine(i: number) {
    onChange({ customLines: (form.customLines ?? []).filter((_, idx) => idx !== i) });
  }

  const showUcaas = form.oppType === "UCaaS Only" || form.oppType === "UCaaS + CCaaS";
  const showCcaas = form.oppType === "CCaaS Only" || form.oppType === "UCaaS + CCaaS";
  const showImpl = form.oppType === "CCaaS Only" || form.oppType === "UCaaS + CCaaS";
  // Advanced Apps is "active" whenever the checkbox is on OR the standalone type is selected
  const advAppActive = form.oppType === "Advanced Applications" || form.advAppEnabled;
  // Priced when standalone or UCaaS Only add-on; included (no charge) when CCaaS is involved
  const advAppPriced = form.oppType === "Advanced Applications" || form.oppType === "UCaaS Only";
  const advAppIncluded = advAppActive && (form.oppType === "CCaaS Only" || form.oppType === "UCaaS + CCaaS");
  // SOW input lives here only when not already shown in the CCaaS section
  const advAppShowSow = advAppActive && !showImpl;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    section: { marginBottom: 28 } as React.CSSProperties,
    sectionTitle: { fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "#03395f", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid #e2e8f0" },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 } as React.CSSProperties,
    row3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 } as React.CSSProperties,
    label: { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13, color: "#475569", fontWeight: 500 },
    ovr: { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13, color: "#475569", fontWeight: 500, opacity: 0.8 },
    calcPill: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
    overrideActive: { borderColor: "#f59e0b", background: "rgba(245,158,11,0.05)" },
    overrideTag: { fontSize: 10, background: "rgba(245,158,11,0.15)", color: "#b45309", borderRadius: 4, padding: "1px 5px", marginLeft: 6, fontWeight: 600 },
  };

  return (
    <div>
      {/* ── Opportunity Type ─────────────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Opportunity Type</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {OPP_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setField("oppType", t)}
              style={{
                padding: "7px 16px", fontSize: 13, borderRadius: 6,
                border: `1px solid ${form.oppType === t ? "#03395f" : "#e2e8f0"}`,
                background: form.oppType === t ? "#03395f" : "#fff",
                color: form.oppType === t ? "#fff" : "#475569",
                cursor: "pointer", fontWeight: form.oppType === t ? 600 : 400,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Customer & Deal Info ─────────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Deal Details</div>
        <div style={{ ...S.row, gridTemplateColumns: "2fr 1fr" }}>
          <label style={S.label}>
            <span>Customer Name</span>
            <input className="ms-input" value={form.customerName} onChange={(e) => setField("customerName", e.target.value)} placeholder="e.g. Acme Corp" />
          </label>
          <label style={S.label}>
            <span>Term (years)</span>
            <input className="ms-input" type="number" min={1} max={5} value={form.term || ""} onChange={(e) => setField("term", Number(e.target.value))} placeholder="1" />
          </label>
        </div>
        <div style={S.row}>
          <label style={S.label}>
            <span>Contract Start</span>
            <input className="ms-input" type="date" value={form.contractStart} onChange={(e) => setField("contractStart", e.target.value)} />
          </label>
          <label style={S.label}>
            <span>Contract End</span>
            <input className="ms-input" type="date" value={form.contractEnd} onChange={(e) => setField("contractEnd", e.target.value)} />
          </label>
        </div>
      </div>

      {/* ── UCaaS ────────────────────────────────────────────────────────────── */}
      {showUcaas && (
        <div style={S.section}>
          <div style={S.sectionTitle}>UCaaS Support</div>
          <div style={S.row}>
            <label style={S.label}>
              <span>UCaaS Users</span>
              <input className="ms-input" type="number" min={0} value={form.ucaasUsers || ""} onChange={(e) => setField("ucaasUsers", Number(e.target.value))} placeholder="0" />
              <span style={S.calcPill}>$1.00/user/month · $2,500 annual min</span>
            </label>
            {canOverride && (
              <label style={S.ovr}>
                <span>Override Price <span style={S.overrideTag}>ADMIN</span></span>
                <input
                  className="ms-input"
                  type="number"
                  min={0}
                  value={form.ovrUcaas ?? ""}
                  onChange={(e) => setField("ovrUcaas", e.target.value === "" ? null : Number(e.target.value))}
                  placeholder={`Calc: ${fmtFull(calc.ucaasCalc)}`}
                  style={form.ovrUcaas != null ? S.overrideActive : {}}
                />
                {form.ovrUcaas != null && <button type="button" onClick={() => setField("ovrUcaas", null)} style={{ fontSize: 11, color: "#f59e0b", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>Clear override</button>}
              </label>
            )}
          </div>
        </div>
      )}

      {/* ── CCaaS + Impl ─────────────────────────────────────────────────────── */}
      {(showCcaas || showImpl) && (
        <div style={S.section}>
          <div style={S.sectionTitle}>CCaaS Support</div>
          <div style={S.row}>
            {showCcaas && (
              <label style={S.label}>
                <span>Annual CCaaS Licensing ($)</span>
                <input className="ms-input" type="number" min={0} value={form.ccaasLicensing || ""} onChange={(e) => setField("ccaasLicensing", Number(e.target.value))} placeholder="0" />
                <span style={S.calcPill}>30% of annual licensing</span>
              </label>
            )}
            {showImpl && (
              <label style={S.label}>
                <span>Implementation SOW ($)</span>
                <input className="ms-input" type="number" min={0} value={form.implSow || ""} onChange={(e) => setField("implSow", Number(e.target.value))} placeholder="0" />
                <span style={S.calcPill}>20% of implementation SOW</span>
              </label>
            )}
          </div>
          {canOverride && (
            <div style={S.row}>
              {showCcaas && (
                <label style={S.ovr}>
                  <span>Override CCaaS Price <span style={S.overrideTag}>ADMIN</span></span>
                  <input
                    className="ms-input"
                    type="number"
                    min={0}
                    value={form.ovrCcaas ?? ""}
                    onChange={(e) => setField("ovrCcaas", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder={`Calc: ${fmtFull(calc.ccaasCalc)}`}
                    style={form.ovrCcaas != null ? S.overrideActive : {}}
                  />
                  {form.ovrCcaas != null && <button type="button" onClick={() => setField("ovrCcaas", null)} style={{ fontSize: 11, color: "#f59e0b", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>Clear override</button>}
                </label>
              )}
              {showImpl && (
                <label style={S.ovr}>
                  <span>Override Impl Price <span style={S.overrideTag}>ADMIN</span></span>
                  <input
                    className="ms-input"
                    type="number"
                    min={0}
                    value={form.ovrImpl ?? ""}
                    onChange={(e) => setField("ovrImpl", e.target.value === "" ? null : Number(e.target.value))}
                    placeholder={`Calc: ${fmtFull(calc.implCalc)}`}
                    style={form.ovrImpl != null ? S.overrideActive : {}}
                  />
                  {form.ovrImpl != null && <button type="button" onClick={() => setField("ovrImpl", null)} style={{ fontSize: 11, color: "#f59e0b", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>Clear override</button>}
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Advanced Applications ─────────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Advanced Applications</div>

        {/* Checkbox — shown for every type except the standalone "Advanced Applications" */}
        {form.oppType !== "Advanced Applications" && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13, color: "#475569", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.advAppEnabled}
              onChange={(e) => setField("advAppEnabled", e.target.checked)}
              style={{ accentColor: "#03395f" }}
            />
            Include Advanced Applications add-on
            {advAppIncluded && (
              <span style={{ fontSize: 11, background: "rgba(34,197,94,0.12)", color: "#15803d", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "1px 7px", fontWeight: 600 }}>
                Included with CCaaS
              </span>
            )}
          </label>
        )}

        {/* Full picker — visible whenever active */}
        {advAppActive && (
          <>
            <div style={advAppShowSow ? S.row : { marginBottom: 14 }}>
              <label style={S.label}>
                <span>Platform</span>
                <select
                  className="ms-input"
                  value={form.advAppPlatform}
                  onChange={(e) => onChange({ advAppPlatform: e.target.value as OppFormData["advAppPlatform"], advAppProducts: [] })}
                >
                  <option value="">Select platform…</option>
                  <option value="zoom">Zoom</option>
                  <option value="ringcentral">RingCentral</option>
                  <option value="other">Other</option>
                </select>
              </label>
              {advAppShowSow && (
                <label style={S.label}>
                  <span>Implementation SOW ($)</span>
                  <input
                    className="ms-input"
                    type="number"
                    min={0}
                    value={form.implSow || ""}
                    onChange={(e) => setField("implSow", Number(e.target.value))}
                    placeholder="0"
                  />
                  <span style={S.calcPill}>$2,500 base + 20% of SOW</span>
                </label>
              )}
            </div>

            {/* Product checkboxes */}
            {form.advAppPlatform && form.advAppPlatform !== "other" && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#475569", fontWeight: 500, marginBottom: 8 }}>Products</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
                  {(ADV_APP_PRODUCTS[form.advAppPlatform] ?? []).map((p) => (
                    <label key={p} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={form.advAppProducts.includes(p)}
                        onChange={(e) => setField("advAppProducts", e.target.checked ? [...form.advAppProducts, p] : form.advAppProducts.filter((x) => x !== p))}
                        style={{ accentColor: "#03395f" }}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {form.advAppPlatform === "other" && (
              <label style={{ ...S.label, marginBottom: 14 }}>
                <span>Description</span>
                <input
                  className="ms-input"
                  value={form.advAppOtherDesc}
                  onChange={(e) => setField("advAppOtherDesc", e.target.value)}
                  placeholder="Describe the advanced application…"
                />
              </label>
            )}

            {/* "Included" info note when CCaaS is involved */}
            {advAppIncluded && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#166534", marginBottom: 14 }}>
                Advanced Application support is included within your CCaaS engagement — no additional line item. The products selected above will be documented in the agreement.
              </div>
            )}

            {/* Override — only when the price is actually being calculated */}
            {canOverride && advAppPriced && (
              <label style={S.ovr}>
                <span>Override Advanced App Price <span style={S.overrideTag}>ADMIN</span></span>
                <input
                  className="ms-input"
                  type="number"
                  min={0}
                  value={form.ovrAdvApp ?? ""}
                  onChange={(e) => setField("ovrAdvApp", e.target.value === "" ? null : Number(e.target.value))}
                  placeholder={`Calc: ${fmtFull(calc.advAppCalc)}`}
                  style={form.ovrAdvApp != null ? S.overrideActive : {}}
                />
                {form.ovrAdvApp != null && (
                  <button type="button" onClick={() => setField("ovrAdvApp", null)} style={{ fontSize: 11, color: "#f59e0b", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                    Clear override
                  </button>
                )}
              </label>
            )}
          </>
        )}

        {/* Prompt when not yet active */}
        {!advAppActive && (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>
            {form.oppType === "Advanced Applications" ? "Select a platform above to get started." : "Check the box above to add Advanced Applications to this proposal."}
          </div>
        )}
      </div>

      {/* ── MSO ─────────────────────────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Managed Services (MSO)</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#475569", cursor: "pointer", marginBottom: 14 }}>
          <input type="checkbox" checked={form.msoEnabled} onChange={(e) => setField("msoEnabled", e.target.checked)} style={{ accentColor: "#03395f" }} />
          Include MSO in this proposal
        </label>
        {form.msoEnabled && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
              {(Object.entries(MSO_TIERS) as [string, typeof MSO_TIERS[keyof typeof MSO_TIERS]][]).map(([key, tier]) => {
                const active = form.msoTier === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onChange({ msoTier: key, msoFee: tier.fee })}
                    style={{
                      padding: "12px 10px", borderRadius: 8, textAlign: "left",
                      border: `1.5px solid ${active ? "#03395f" : "#e2e8f0"}`,
                      background: active ? "#03395f" : "#fff",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? "#fff" : "#1e293b", marginBottom: 4 }}>{tier.label}</div>
                    <div style={{ fontSize: 12, color: active ? "rgba(255,255,255,0.75)" : "#94a3b8" }}>{fmt(tier.fee)}/yr</div>
                    <div style={{ fontSize: 11, color: active ? "rgba(255,255,255,0.6)" : "#94a3b8", marginTop: 4, lineHeight: 1.4 }}>{tier.allocation}</div>
                  </button>
                );
              })}
            </div>
            {msoTier && (
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "12px 16px", marginBottom: 14, fontSize: 12, color: "#0369a1" }}>
                <strong>{msoTier.label}:</strong> {msoTier.coverage}
              </div>
            )}
            <div style={S.row}>
              <label style={S.label}>
                <span>MSO Tier</span>
                <select
                  className="ms-input"
                  value={form.msoTier}
                  onChange={(e) => {
                    const key = e.target.value;
                    const tier = getMsoTier(key);
                    onChange({ msoTier: key, msoFee: tier ? tier.fee : 0 });
                  }}
                >
                  <option value="">Custom / None</option>
                  {Object.entries(MSO_TIERS).map(([k, t]) => (
                    <option key={k} value={k}>{t.label} — {fmt(t.fee)}/yr</option>
                  ))}
                </select>
              </label>
              <label style={S.label}>
                <span>MSO Annual Fee ($)</span>
                <input
                  className="ms-input"
                  type="number"
                  min={0}
                  value={form.msoFee || ""}
                  onChange={(e) => onChange({ msoFee: Number(e.target.value), msoTier: "custom" })}
                  placeholder="0"
                />
              </label>
            </div>
            {canOverride && (
              <label style={S.ovr}>
                <span>Override MSO Price <span style={S.overrideTag}>ADMIN</span></span>
                <input
                  className="ms-input"
                  type="number"
                  min={0}
                  value={form.ovrMso ?? ""}
                  onChange={(e) => setField("ovrMso", e.target.value === "" ? null : Number(e.target.value))}
                  placeholder={`Calc: ${fmtFull(calc.msoCalc)}`}
                  style={form.ovrMso != null ? S.overrideActive : {}}
                />
                {form.ovrMso != null && <button type="button" onClick={() => setField("ovrMso", null)} style={{ fontSize: 11, color: "#f59e0b", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>Clear override</button>}
              </label>
            )}
          </>
        )}
      </div>

      {/* ── Rates ─────────────────────────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Hourly Rates</div>
        <div style={S.row}>
          <label style={S.label}>
            <span>After-Hours Rate ($/hr)</span>
            <input className="ms-input" type="number" min={0} value={form.afterHoursRate || ""} onChange={(e) => setField("afterHoursRate", Number(e.target.value))} placeholder="165" />
          </label>
          <label style={S.label}>
            <span>Advanced Task Rate ($/hr)</span>
            <input className="ms-input" type="number" min={0} value={form.advancedTaskRate || ""} onChange={(e) => setField("advancedTaskRate", Number(e.target.value))} placeholder="145" />
          </label>
        </div>
      </div>

      {/* ── Custom Lines ──────────────────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={S.sectionTitle}>Additional Line Items</div>
          <button type="button" onClick={addCustomLine} style={{ fontSize: 12, color: "#0891b2", background: "none", border: "1px solid #bae6fd", borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>+ Add Line</button>
        </div>
        {(form.customLines ?? []).length === 0 && (
          <div style={{ fontSize: 13, color: "#94a3b8" }}>No additional line items.</div>
        )}
        {(form.customLines ?? []).map((line, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-end" }}>
            <label style={{ ...S.label, flex: 2 }}>
              {i === 0 && <span>Description</span>}
              <input className="ms-input" value={line.label} onChange={(e) => updateCustomLine(i, { label: e.target.value })} placeholder="Line item description" />
            </label>
            <label style={{ ...S.label, flex: 1 }}>
              {i === 0 && <span>Annual Price ($)</span>}
              <input className="ms-input" type="number" value={line.price || ""} onChange={(e) => updateCustomLine(i, { price: Number(e.target.value) })} placeholder="0" />
            </label>
            <button type="button" onClick={() => removeCustomLine(i)} style={{ height: 38, padding: "0 10px", background: "none", border: "1px solid #fecaca", borderRadius: 5, color: "#d13438", cursor: "pointer", fontSize: 16, marginBottom: 0 }}>×</button>
          </div>
        ))}
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────────────── */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Notes</div>
        <textarea
          className="ms-input"
          rows={3}
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          placeholder="Internal notes, assumptions, or scope clarifications…"
          style={{ resize: "vertical" }}
        />
      </div>

    </div>
  );
}
