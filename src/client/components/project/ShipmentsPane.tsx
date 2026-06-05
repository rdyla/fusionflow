import { useEffect, useState } from "react";
import { api, type ProjectShipment } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

const fedexUrl = (n: string) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`;

function statusColor(s: ProjectShipment): string {
  if (s.delivered) return "#107c10";
  const t = (s.status ?? "").toLowerCase();
  if (t.includes("out for delivery")) return "#0891b2";
  if (t.includes("exception") || t.includes("delay")) return "#d13438";
  if (t.includes("transit") || t.includes("picked") || t.includes("label")) return "#ff8c00";
  return "#64748b";
}

function fmtChecked(iso: string | null): string {
  if (!iso) return "not checked yet";
  const norm = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(norm);
  if (isNaN(d.getTime())) return iso;
  return "checked " + d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtEta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function ShipmentsPane({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<ProjectShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [itemName, setItemName] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.projectShipments(projectId)
      .then((list) => { if (!cancelled) setItems(list); })
      .catch(() => { if (!cancelled) showToast("Failed to load shipments", "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  async function add() {
    if (!trackingNumber.trim()) { showToast("Tracking number is required", "error"); return; }
    setSaving(true);
    try {
      const created = await api.addShipment(projectId, { tracking_number: trackingNumber.trim(), item_name: itemName.trim() || null });
      setItems((prev) => [created, ...prev]);
      setTrackingNumber(""); setItemName(""); setAdding(false);
      showToast("Shipment added.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add shipment", "error");
    } finally {
      setSaving(false);
    }
  }

  async function refreshOne(id: string) {
    setRefreshingId(id);
    try {
      const updated = await api.refreshShipment(projectId, id);
      setItems((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch {
      showToast("Failed to refresh", "error");
    } finally {
      setRefreshingId(null);
    }
  }

  async function refreshAll() {
    setRefreshingAll(true);
    try {
      setItems(await api.refreshAllShipments(projectId));
    } catch {
      showToast("Failed to refresh shipments", "error");
    } finally {
      setRefreshingAll(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this shipment?")) return;
    try {
      await api.deleteShipment(projectId, id);
      setItems((prev) => prev.filter((s) => s.id !== id));
    } catch {
      showToast("Failed to remove", "error");
    }
  }

  return (
    <div className="ms-section-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div className="ms-section-title">Shipment Tracking</div>
        {canEdit && (
          <div style={{ display: "flex", gap: 8 }}>
            {items.length > 0 && (
              <button className="ms-btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={refreshingAll} onClick={refreshAll}>
                {refreshingAll ? "Refreshing…" : "↻ Refresh all"}
              </button>
            )}
            {!adding && (
              <button className="ms-btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setAdding(true)}>+ Add Tracking</button>
            )}
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 14px" }}>
        FedEx tracking for project shipments (incl. vendor drop-ships). Status auto-refreshes every few hours and on demand.
      </p>

      {adding && (
        <div style={{ border: "1px solid #bae6fd", background: "#f0f9ff", borderRadius: 8, padding: 14, marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>FedEx Tracking #</label>
            <input className="ms-input" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="e.g. 771234567890" disabled={saving} style={{ width: "100%" }} />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>Item Name</label>
            <input className="ms-input" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Poly VVX450 handsets (x12)" disabled={saving} style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ms-btn-primary" disabled={saving} onClick={add}>{saving ? "Adding…" : "Add"}</button>
            <button className="ms-btn-secondary" onClick={() => { setAdding(false); setTrackingNumber(""); setItemName(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: "#94a3b8", padding: "8px 0" }}>Loading…</div>
      ) : items.length === 0 && !adding ? (
        <div style={{ fontSize: 13, color: "#94a3b8", padding: "8px 0" }}>No shipments tracked yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((s) => {
            const eta = fmtEta(s.estimated_delivery);
            return (
              <div key={s.id} style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: "10px 14px", background: "#fff", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{s.item_name || "Shipment"}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: statusColor(s), borderRadius: 10, padding: "2px 8px" }}>{s.status || "Awaiting update"}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                    <a href={fedexUrl(s.tracking_number)} target="_blank" rel="noopener noreferrer" style={{ color: "#0b9aad", textDecoration: "none", fontWeight: 600 }}>
                      {s.tracking_number} ↗
                    </a>
                    {eta && <span style={{ marginLeft: 10 }}>{s.delivered ? "Delivered" : "ETA"}: {eta}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{fmtChecked(s.last_checked_at)}</div>
                </div>
                {canEdit && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => refreshOne(s.id)} disabled={refreshingId === s.id} title="Refresh status" style={{ fontSize: 11, padding: "3px 9px", background: "none", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 4, cursor: "pointer" }}>
                      {refreshingId === s.id ? "…" : "↻"}
                    </button>
                    <button onClick={() => remove(s.id)} title="Remove" style={{ fontSize: 11, padding: "3px 8px", background: "none", border: "1px solid #fecaca", color: "#d13438", borderRadius: 4, cursor: "pointer" }}>×</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
