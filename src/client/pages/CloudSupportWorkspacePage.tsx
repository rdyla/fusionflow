import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { csApi } from "../lib/cloudSupportApi";
import { calcSupport, customLineDollar, DEFAULT_FORM_DATA, fmt, fmtSigned } from "../lib/calcSupport";
import type { CsProposalDetail, CsVersion, OppFormData, OppCalcResult } from "../lib/calcSupport";
import { buildProposalHtml, buildSignatureHtml, buildMsoStandaloneHtml } from "../lib/buildAgreementHtml";
import { getMsoTier } from "../lib/msoTiers";
import { api } from "../lib/api";
import CalculatorForm from "../components/cloudSupport/CalculatorForm";
import { useToast } from "../components/ui/ToastProvider";

type Tab = "calculator" | "agreement" | "signature" | "mso" | "history";

function SummaryLine({ label, value, overridden }: { label: string; value: number; overridden: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #e2e8f0", fontSize: 13 }}>
      <span style={{ color: "#475569", paddingRight: 8 }}>
        {label}
        {overridden && <span style={{ fontSize: 10, background: "rgba(245,158,11,0.15)", color: "#b45309", borderRadius: 4, padding: "1px 5px", marginLeft: 5, fontWeight: 600 }}>OVR</span>}
      </span>
      <span style={{ fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap" }}>{fmt(value)}/yr</span>
    </div>
  );
}

export default function CloudSupportWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [proposal, setProposal] = useState<CsProposalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("calculator");
  const [form, setForm] = useState<OppFormData>(DEFAULT_FORM_DATA);
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [canOverride, setCanOverride] = useState(false);
  const [agreementHtml, setAgreementHtml] = useState("");
  const [signatureHtml, setSignatureHtml] = useState("");
  const [msoHtml, setMsoHtml] = useState("");
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const agreementIframeRef = useRef<HTMLIFrameElement>(null);
  const signatureIframeRef = useRef<HTMLIFrameElement>(null);
  const msoIframeRef = useRef<HTMLIFrameElement>(null);

  const calc: OppCalcResult = calcSupport(form);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      csApi.get(id),
      api.me().catch(() => ({ role: "" })),
    ]).then(([p, me]) => {
      setProposal(p);
      setCanOverride(me.role === "admin" || me.role === "pf_sa");
      // Load latest version if available
      if (p.versions.length > 0) {
        const latest = p.versions[p.versions.length - 1];
        setForm(latest.data);
        setActiveVersionId(latest.id);
      }
    }).catch(() => showToast("Failed to load proposal", "error"))
      .finally(() => setLoading(false));
  }, [id]);

  // Rebuild agreement HTML when switching to those tabs
  useEffect(() => {
    if (!proposal) return;
    if (tab === "agreement") {
      const versionNum = proposal.versions.length + 1;
      setAgreementHtml(buildProposalHtml(proposal.name, form, calc, versionNum));
    } else if (tab === "signature") {
      const versionNum = proposal.versions.length + 1;
      setSignatureHtml(buildSignatureHtml(proposal.name, form, calc, versionNum));
    } else if (tab === "mso") {
      const versionNum = proposal.versions.length + 1;
      setMsoHtml(buildMsoStandaloneHtml(proposal.name, form, calc, versionNum));
    }
  }, [tab, proposal]);

  function handleFormChange(patch: Partial<OppFormData>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  function loadVersion(v: CsVersion) {
    setForm(v.data);
    setActiveVersionId(v.id);
    setDirty(false);
    setTab("calculator");
    showToast(`Loaded v${v.versionNum}${v.label ? ` — ${v.label}` : ""}`, "success");
  }

  async function handleSaveVersion() {
    if (!id || !proposal) return;
    setSaving(true);
    try {
      const result = await csApi.saveVersion(id, form, calc, saveLabel.trim() || undefined);
      const newVersion: CsVersion = {
        id: result.id,
        versionNum: result.versionNum,
        label: saveLabel.trim() || null,
        data: form,
        calc,
        savedAt: result.savedAt,
        createdBy: "You",
      };
      setProposal((prev) => prev ? { ...prev, versions: [...prev.versions, newVersion] } : prev);
      setActiveVersionId(result.id);
      setDirty(false);
      setShowSaveModal(false);
      setSaveLabel("");
      showToast(`Version ${result.versionNum} saved`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!id || !renameName.trim()) return;
    setSaving(true);
    try {
      await csApi.rename(id, renameName.trim());
      setProposal((prev) => prev ? { ...prev, name: renameName.trim() } : prev);
      setShowRenameModal(false);
      showToast("Proposal renamed", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to rename", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setSaving(true);
    try {
      await csApi.delete(id);
      navigate("/solutions/cloudsupport");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete", "error");
      setSaving(false);
    }
  }

  function handlePrint(ref: React.RefObject<HTMLIFrameElement | null>) {
    ref.current?.contentWindow?.print();
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading…</div>;
  if (!proposal) return <div style={{ color: "#d13438", padding: 32 }}>Proposal not found.</div>;

  const TAB_LABELS: [Tab, string][] = [
    ["calculator", "Calculator"],
    ["agreement", "Proposal Preview"],
    ["signature", "Signature Doc"],
    ...(calc.msoEnabled ? [["mso", "MSO Doc"] as [Tab, string]] : []),
    ["history", `History (${proposal.versions.length})`],
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16 }}>
        <div>
          <button
            onClick={() => navigate("/solutions/cloudsupport")}
            style={{ fontSize: 12, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}
          >
            ← Cloud Support Proposals
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", margin: 0 }}>{proposal.name}</h1>
            {dirty && <span style={{ fontSize: 11, background: "rgba(245,158,11,0.15)", color: "#b45309", borderRadius: 4, padding: "2px 7px", fontWeight: 600 }}>Unsaved</span>}
            <button
              onClick={() => { setRenameName(proposal.name); setShowRenameModal(true); }}
              style={{ fontSize: 12, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              ✎ Rename
            </button>
          </div>
          {form.customerName && (
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{form.customerName}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            className="ms-btn-ghost"
            style={{ color: "#d13438", borderColor: "#fecaca" }}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </button>
          <button
            className="ms-btn-primary"
            onClick={() => setShowSaveModal(true)}
          >
            Save Version
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", marginBottom: 28 }}>
        {TAB_LABELS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: tab === key ? 600 : 400,
              border: "none", borderBottom: `2px solid ${tab === key ? "#03395f" : "transparent"}`,
              background: "none", color: tab === key ? "#03395f" : "#64748b",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "calculator" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 28, alignItems: "start" }}>
          {/* Form */}
          <CalculatorForm
            form={form}
            calc={calc}
            canOverride={canOverride}
            onChange={handleFormChange}
            customer={{ customerId: proposal.customerId ?? null, customerName: proposal.customerName ?? null }}
            onCustomerChange={async (next) => {
              // Optimistic local update so the picker reflects the choice immediately.
              setProposal((prev) => prev ? { ...prev, customerId: next.customerId, customerName: next.customerName } : prev);
              try {
                await csApi.setCustomer(proposal.id, next);
              } catch (e) {
                showToast(e instanceof Error ? e.message : "Failed to link customer", "error");
              }
            }}
          />

          {/* Sticky summary panel */}
          <div style={{ position: "sticky", top: 80 }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "20px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#03395f", marginBottom: 14 }}>Pricing Summary</div>

              {(form.oppType === "UCaaS Only" || form.oppType === "UCaaS + CCaaS") && calc.ucaasSup > 0 && (
                <SummaryLine label={`UCaaS Support${calc.minApplied ? " (min)" : ""}`} value={calc.ucaasSup} overridden={calc.ucaasOverridden} />
              )}
              {(form.oppType === "CCaaS Only" || form.oppType === "UCaaS + CCaaS") && calc.ccaasSup > 0 && (
                <SummaryLine label="CCaaS Support" value={calc.ccaasSup} overridden={calc.ccaasOverridden} />
              )}
              {(form.oppType === "CCaaS Only" || form.oppType === "UCaaS + CCaaS") && calc.implSup > 0 && (
                <SummaryLine label="Implementation Support" value={calc.implSup} overridden={calc.implOverridden} />
              )}
              {(form.oppType === "Advanced Applications" || (form.oppType === "UCaaS Only" && form.advAppEnabled)) && calc.advAppSup > 0 && (
                <SummaryLine label="Advanced Applications" value={calc.advAppSup} overridden={calc.advAppOverridden} />
              )}
              {form.msoEnabled && calc.msoSup > 0 && (
                <SummaryLine label={`MSO — ${getMsoTier(form.msoTier)?.label ?? "Custom"}`} value={calc.msoSup} overridden={calc.msoOverridden} />
              )}
              {(() => {
                const preCustomAnnual = calc.annual - calc.customTotal;
                return (form.customLines ?? []).filter(l => (Number(l.price) || 0) !== 0).map((line, i) => {
                  const kind = line.kind ?? "charge";
                  const effect = customLineDollar(line, preCustomAnnual);
                  const isDiscount = kind !== "charge";
                  const label = kind === "discount_percent"
                    ? `${line.label || `Custom Line ${i + 1}`} (${Number(line.price) || 0}% off)`
                    : (line.label || `Custom Line ${i + 1}`);
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #e2e8f0", fontSize: 13 }}>
                      <span style={{ color: isDiscount ? "#065f46" : "#475569", paddingRight: 8 }}>{label}</span>
                      <span style={{ fontWeight: 600, color: isDiscount ? "#065f46" : "#1e293b", whiteSpace: "nowrap" }}>{fmtSigned(effect)}/yr</span>
                    </div>
                  );
                });
              })()}
              {calc.annual === 0 && (
                <div style={{ color: "#94a3b8", fontSize: 13, padding: "10px 0" }}>Enter values to see pricing.</div>
              )}

              <div style={{ borderTop: "2px solid #0891b2", marginTop: 10, paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, color: "#03395f" }}>
                <span>Annual Total</span>
                <span>{fmt(calc.annual)}</span>
              </div>
              {form.term > 1 && (
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, fontSize: 13, color: "#475569" }}>
                  <span>TCV ({form.term}-yr)</span>
                  <span style={{ fontWeight: 600 }}>{fmt(calc.tcv)}</span>
                </div>
              )}

              <button
                type="button"
                className="ms-btn-primary"
                style={{ width: "100%", marginTop: 16, justifyContent: "center" }}
                onClick={() => setShowSaveModal(true)}
              >
                Save Version
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "agreement" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, gap: 8 }}>
            <button className="ms-btn-ghost" onClick={() => handlePrint(agreementIframeRef)}>Print / Save PDF</button>
          </div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
            <iframe
              ref={agreementIframeRef}
              srcDoc={agreementHtml}
              title="Proposal Preview"
              style={{ width: "100%", height: 900, border: "none", display: "block" }}
              sandbox="allow-same-origin allow-modals"
            />
          </div>
        </div>
      )}

      {tab === "signature" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, gap: 8 }}>
            <button className="ms-btn-ghost" onClick={() => handlePrint(signatureIframeRef)}>Print / Save PDF</button>
          </div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
            <iframe
              ref={signatureIframeRef}
              srcDoc={signatureHtml}
              title="Signature Document"
              style={{ width: "100%", height: 900, border: "none", display: "block" }}
              sandbox="allow-same-origin allow-modals"
            />
          </div>
        </div>
      )}

      {tab === "mso" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, gap: 8 }}>
            <button className="ms-btn-ghost" onClick={() => handlePrint(msoIframeRef)}>Print / Save PDF</button>
          </div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
            <iframe
              ref={msoIframeRef}
              srcDoc={msoHtml}
              title="MSO Standalone Agreement"
              style={{ width: "100%", height: 900, border: "none", display: "block" }}
              sandbox="allow-same-origin allow-modals"
            />
          </div>
        </div>
      )}

      {tab === "history" && (
        <div>
          {proposal.versions.length === 0 ? (
            <div className="ms-card" style={{ padding: "40px 32px", textAlign: "center", color: "#94a3b8" }}>
              No saved versions yet. Use "Save Version" to snapshot the current calculator state.
            </div>
          ) : (
            <div className="ms-card" style={{ overflow: "hidden" }}>
              <table className="ms-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Label</th>
                    <th>Annual</th>
                    <th>TCV</th>
                    <th>Saved By</th>
                    <th>Saved At</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...proposal.versions].reverse().map((v) => (
                    <tr key={v.id} style={{ background: v.id === activeVersionId ? "rgba(3,57,95,0.04)" : undefined }}>
                      <td style={{ fontWeight: 600, color: "#1e293b" }}>v{v.versionNum}</td>
                      <td style={{ color: "#475569", fontSize: 13 }}>{v.label ?? <span style={{ color: "#94a3b8" }}>—</span>}</td>
                      <td style={{ color: "#475569", fontSize: 13 }}>{fmt(v.calc.annual)}</td>
                      <td style={{ color: "#475569", fontSize: 13 }}>{fmt(v.calc.tcv)}</td>
                      <td style={{ color: "#94a3b8", fontSize: 12 }}>{v.createdBy}</td>
                      <td style={{ color: "#94a3b8", fontSize: 12 }}>
                        {new Date(v.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td>
                        {v.id !== activeVersionId ? (
                          <button
                            className="ms-btn-ghost"
                            style={{ fontSize: 12, padding: "4px 10px" }}
                            onClick={() => loadVersion(v)}
                          >
                            Load
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Save Version Modal */}
      {showSaveModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowSaveModal(false); setSaveLabel(""); } }}>
          <div className="ms-modal" style={{ maxWidth: 400 }}>
            <h2>Save Version</h2>
            <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
              <label className="ms-label">
                <span>Version Label (optional)</span>
                <input
                  className="ms-input"
                  value={saveLabel}
                  onChange={(e) => setSaveLabel(e.target.value)}
                  placeholder="e.g. Initial draft, Customer review, Final"
                  autoFocus
                />
              </label>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 16px", fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "#475569" }}>Annual</span>
                  <span style={{ fontWeight: 600, color: "#1e293b" }}>{fmt(calc.annual)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#475569" }}>TCV</span>
                  <span style={{ fontWeight: 600, color: "#1e293b" }}>{fmt(calc.tcv)}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="ms-btn-ghost" onClick={() => { setShowSaveModal(false); setSaveLabel(""); }}>Cancel</button>
                <button type="button" className="ms-btn-primary" disabled={saving} onClick={handleSaveVersion}>
                  {saving ? "Saving…" : "Save Version"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowRenameModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 400 }}>
            <h2>Rename Proposal</h2>
            <form onSubmit={(e) => { e.preventDefault(); handleRename(); }} style={{ display: "grid", gap: 16, marginTop: 16 }}>
              <input
                className="ms-input"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                autoFocus
              />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="ms-btn-ghost" onClick={() => setShowRenameModal(false)}>Cancel</button>
                <button type="submit" className="ms-btn-primary" disabled={saving || !renameName.trim()}>
                  {saving ? "Saving…" : "Rename"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}>
          <div className="ms-modal" style={{ maxWidth: 380 }}>
            <h2>Delete Proposal</h2>
            <p style={{ color: "#475569", fontSize: 14, marginTop: 12 }}>
              Delete <strong>{proposal.name}</strong>? This will permanently remove all {proposal.versions.length} saved version{proposal.versions.length !== 1 ? "s" : ""}. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" className="ms-btn-ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button
                type="button"
                className="ms-btn-primary"
                disabled={saving}
                style={{ background: "#d13438", borderColor: "#d13438" }}
                onClick={handleDelete}
              >
                {saving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
