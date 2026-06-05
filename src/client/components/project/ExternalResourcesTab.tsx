import { useEffect, useState } from "react";
import { api, type ExternalResource, type ExternalResourceInput, type ExternalResourceStatus } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

const STATUS_OPTIONS: { value: ExternalResourceStatus; label: string }[] = [
  { value: "new",         label: "New" },
  { value: "posted",      label: "Posted" },
  { value: "assigned",    label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed",      label: "Closed" },
  { value: "billed",      label: "Billed" },
];
const STATUS_LABEL: Record<ExternalResourceStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label])
) as Record<ExternalResourceStatus, string>;
const STATUS_COLOR: Record<ExternalResourceStatus, string> = {
  new: "#64748b", posted: "#0891b2", assigned: "#8764b8", in_progress: "#ff8c00", closed: "#059669", billed: "#107c10",
};

// The blended rate external $ converts to "hours used" at, mirrored on the CRM
// Case tab. Kept in sync with shared/sowAddOns DEFAULT_BLENDED_RATE.
const BLENDED_RATE = 165;

const fmtUsd = (n: number) => "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type DraftFields = {
  engagement_date: string;
  contractor_name: string;
  contractor_email: string;
  task_description: string;
  amount: string;
  status: ExternalResourceStatus;
  notes: string;
};

const EMPTY_DRAFT: DraftFields = {
  engagement_date: "", contractor_name: "", contractor_email: "", task_description: "", amount: "", status: "new", notes: "",
};

function toInput(d: DraftFields): ExternalResourceInput {
  return {
    engagement_date: d.engagement_date || null,
    contractor_name: d.contractor_name.trim(),
    contractor_email: d.contractor_email.trim() || null,
    task_description: d.task_description.trim() || null,
    amount: Number(d.amount) || 0,
    status: d.status,
    notes: d.notes.trim() || null,
  };
}

function toDraft(r: ExternalResource): DraftFields {
  return {
    engagement_date: r.engagement_date ?? "",
    contractor_name: r.contractor_name ?? "",
    contractor_email: r.contractor_email ?? "",
    task_description: r.task_description ?? "",
    amount: r.amount != null ? String(r.amount) : "",
    status: r.status,
    notes: r.notes ?? "",
  };
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, background: "#fff", color: "#1e293b", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" };

function DraftForm({ draft, setDraft, canEdit }: { draft: DraftFields; setDraft: (d: DraftFields) => void; canEdit: boolean }) {
  const set = <K extends keyof DraftFields>(k: K, v: DraftFields[K]) => setDraft({ ...draft, [k]: v });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
      <div style={{ gridColumn: "span 3" }}>
        <label style={labelStyle}>Date</label>
        <input type="date" style={inputStyle} value={draft.engagement_date} onChange={(e) => set("engagement_date", e.target.value)} disabled={!canEdit} />
      </div>
      <div style={{ gridColumn: "span 5" }}>
        <label style={labelStyle}>Contractor Name</label>
        <input style={inputStyle} value={draft.contractor_name} onChange={(e) => set("contractor_name", e.target.value)} placeholder="e.g. Field Nation tech" disabled={!canEdit} />
      </div>
      <div style={{ gridColumn: "span 4" }}>
        <label style={labelStyle}>Status</label>
        <select style={inputStyle} value={draft.status} onChange={(e) => set("status", e.target.value as ExternalResourceStatus)} disabled={!canEdit}>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div style={{ gridColumn: "span 8" }}>
        <label style={labelStyle}>Email</label>
        <input style={inputStyle} value={draft.contractor_email} onChange={(e) => set("contractor_email", e.target.value)} placeholder="contractor@example.com" disabled={!canEdit} />
      </div>
      <div style={{ gridColumn: "span 4" }}>
        <label style={labelStyle}>Amount (USD)</label>
        <input type="number" min={0} step="0.01" style={inputStyle} value={draft.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" disabled={!canEdit} />
      </div>
      <div style={{ gridColumn: "span 12" }}>
        <label style={labelStyle}>Task Description</label>
        <input style={inputStyle} value={draft.task_description} onChange={(e) => set("task_description", e.target.value)} placeholder="What the contractor was engaged to do" disabled={!canEdit} />
      </div>
      <div style={{ gridColumn: "span 12" }}>
        <label style={labelStyle}>Notes</label>
        <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 48 }} value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="General notes" disabled={!canEdit} />
      </div>
    </div>
  );
}

export default function ExternalResourcesTab({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<ExternalResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.externalResources(projectId)
      .then((list) => { if (!cancelled) setItems(list); })
      .catch(() => { if (!cancelled) showToast("Failed to load external resources", "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const total = items.reduce((sum, r) => sum + (r.amount || 0), 0);
  const equivalentHours = total / BLENDED_RATE;

  async function saveNew() {
    if (!newDraft.contractor_name.trim()) { showToast("Contractor name is required", "error"); return; }
    setSavingNew(true);
    try {
      const created = await api.addExternalResource(projectId, toInput(newDraft));
      setItems((prev) => [created, ...prev]);
      setNewDraft(EMPTY_DRAFT);
      setAdding(false);
      showToast("External resource added.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add", "error");
    } finally {
      setSavingNew(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editDraft.contractor_name.trim()) { showToast("Contractor name is required", "error"); return; }
    setSavingEdit(true);
    try {
      const updated = await api.updateExternalResource(projectId, id, toInput(editDraft));
      setItems((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setEditingId(null);
      showToast("Saved.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSavingEdit(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this external resource entry?")) return;
    try {
      await api.deleteExternalResource(projectId, id);
      setItems((prev) => prev.filter((r) => r.id !== id));
      showToast("Deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete", "error");
    }
  }

  if (loading) return <div style={{ color: "#64748b", padding: 24 }}>Loading…</div>;

  return (
    <div className="ms-section-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div className="ms-section-title">External Resources</div>
        {canEdit && !adding && (
          <button className="ms-btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => { setNewDraft(EMPTY_DRAFT); setAdding(true); }}>
            + Add Engagement
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>
        Outside vendor / contractor engagements (e.g. a Field Nation tech sent to site). The total below converts to hours used on the CRM Case tab at {fmtUsd(BLENDED_RATE)}/hr and represents the extra to bill at project close.
      </p>

      {adding && (
        <div style={{ border: "1px solid #bae6fd", background: "#f0f9ff", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <DraftForm draft={newDraft} setDraft={setNewDraft} canEdit={!savingNew} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="ms-btn-primary" disabled={savingNew} onClick={saveNew}>{savingNew ? "Adding…" : "Add"}</button>
            <button className="ms-btn-secondary" onClick={() => { setAdding(false); setNewDraft(EMPTY_DRAFT); }}>Cancel</button>
          </div>
        </div>
      )}

      {items.length === 0 && !adding ? (
        <div style={{ fontSize: 13, color: "#94a3b8", padding: "8px 0" }}>No external resources yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((r) => editingId === r.id ? (
            <div key={r.id} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, background: "#fff" }}>
              <DraftForm draft={editDraft} setDraft={setEditDraft} canEdit={!savingEdit} />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="ms-btn-primary" disabled={savingEdit} onClick={() => saveEdit(r.id)}>{savingEdit ? "Saving…" : "Save"}</button>
                <button className="ms-btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div key={r.id} style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: "10px 14px", background: "#fff", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{r.contractor_name}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: STATUS_COLOR[r.status], borderRadius: 10, padding: "2px 8px" }}>{STATUS_LABEL[r.status]}</span>
                  {r.engagement_date && <span style={{ fontSize: 12, color: "#94a3b8" }}>{r.engagement_date}</span>}
                </div>
                {r.task_description && <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{r.task_description}</div>}
                {r.contractor_email && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{r.contractor_email}</div>}
                {r.notes && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, whiteSpace: "pre-wrap" }}>{r.notes}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{fmtUsd(r.amount)}</span>
                {canEdit && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { setEditingId(r.id); setEditDraft(toDraft(r)); }} style={{ fontSize: 11, padding: "3px 10px", background: "none", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 4, cursor: "pointer" }}>Edit</button>
                    <button onClick={() => remove(r.id)} style={{ fontSize: 11, padding: "3px 8px", background: "none", border: "1px solid #fecaca", color: "#d13438", borderRadius: 4, cursor: "pointer" }}>×</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "2px solid #cbd5e1", marginTop: 14, paddingTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total External Services</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>≈ {equivalentHours.toFixed(1)} h on the CRM Case tab (at {fmtUsd(BLENDED_RATE)}/hr)</div>
          </div>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 22, fontWeight: 800, color: "#107c10" }}>{fmtUsd(total)}</div>
        </div>
      )}
    </div>
  );
}
