/**
 * Sites management panel — lives on the project Overview tab.
 *
 * Lets PMs add / rename / re-order / delete deployment sites for multi-site
 * projects. The first site added to a project moves the project's existing
 * post-Initiate phases under it; subsequent sites clone the first site's
 * phase chain (without tasks). See `src/server/routes/sites.ts` for the
 * server-side phase-wiring rules.
 *
 * For single-site projects (the default), this panel simply shows
 * "No sites yet — Add deployment site" and stays out of the way.
 */

import { useEffect, useState } from "react";
import { api, type Site } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

export default function SitesPanel({ projectId, canEdit, onChange }: { projectId: string; canEdit: boolean; onChange?: () => void }) {
  const { showToast } = useToast();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => { void load(); }, [projectId]);

  async function load() {
    try {
      setLoading(true);
      setSites(await api.sites(projectId));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load sites", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(site: Site) {
    if (!window.confirm(
      `Delete "${site.name}" and all of its phases + tasks?\n\nThis cascades — phases and tasks belonging only to this site are removed. The project's shared Initiate phase is unaffected.`
    )) return;
    try {
      const res = await api.deleteSite(projectId, site.id);
      showToast(`Deleted ${site.name} (${res.deleted_phase_count} phase${res.deleted_phase_count === 1 ? "" : "s"} removed).`, "success");
      await load();
      onChange?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete site", "error");
    }
  }

  return (
    <div className="ms-section-card" style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>
          Deployment sites
          {sites.length > 0 && <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8", marginLeft: 8 }}>({sites.length})</span>}
        </div>
        {canEdit && (
          <button
            type="button"
            className="ms-btn-secondary"
            onClick={() => setAddOpen(true)}
            style={{ fontSize: 12 }}
          >
            + Add deployment site
          </button>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#64748b", marginBottom: sites.length > 0 ? 10 : 0 }}>
        Use sites for projects that roll out to multiple locations on staggered timelines (e.g. Libraries → Treatment → HQ). Single-site projects can ignore this section.
      </div>

      {loading ? (
        <div style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>Loading…</div>
      ) : sites.length === 0 ? (
        null
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {sites.map((s) => (
            <SiteRow key={s.id} site={s} canEdit={canEdit} projectId={projectId} onChanged={() => { void load(); onChange?.(); }} onDelete={() => handleDelete(s)} />
          ))}
        </div>
      )}

      {addOpen && (
        <AddSiteModal
          projectId={projectId}
          existingSiteCount={sites.length}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            void load();
            onChange?.();
          }}
        />
      )}
    </div>
  );
}

function SiteRow({ site, canEdit, projectId, onChanged, onDelete }: { site: Site; canEdit: boolean; projectId: string; onChanged: () => void; onDelete: () => void }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(site.name);
  const [target, setTarget] = useState(site.target_go_live_date ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      showToast("Site name is required.", "error");
      return;
    }
    setSaving(true);
    try {
      await api.updateSite(projectId, site.id, {
        name: name.trim(),
        target_go_live_date: target || null,
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 10px", background: "#f8fafc",
      border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13,
    }}>
      {editing ? (
        <>
          <input
            className="ms-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Site name"
            style={{ flex: 1, padding: "4px 8px", fontSize: 13 }}
          />
          <input
            className="ms-input"
            type="date"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{ width: 160, padding: "4px 8px", fontSize: 13 }}
          />
          <button className="ms-btn-primary" onClick={save} disabled={saving} style={{ fontSize: 12, padding: "4px 12px" }}>
            {saving ? "…" : "Save"}
          </button>
          <button className="ms-btn-secondary" onClick={() => { setEditing(false); setName(site.name); setTarget(site.target_go_live_date ?? ""); }} style={{ fontSize: 12, padding: "4px 12px" }}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontWeight: 600, color: "#1e293b" }}>{site.name}</span>
          <span style={{ color: "#64748b", fontSize: 12, minWidth: 110, textAlign: "right" }}>
            {site.target_go_live_date ? `Go-live ${fmtDate(site.target_go_live_date)}` : "No date"}
          </span>
          {canEdit && (
            <>
              <button onClick={() => setEditing(true)} style={iconBtn} title="Edit">✎</button>
              <button onClick={onDelete} style={{ ...iconBtn, color: "#dc2626" }} title="Delete">✕</button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function AddSiteModal({ projectId, existingSiteCount, onClose, onCreated }: { projectId: string; existingSiteCount: number; onClose: () => void; onCreated: () => void }) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      showToast("Site name is required.", "error");
      return;
    }
    setSaving(true);
    try {
      await api.createSite(projectId, { name: name.trim(), target_go_live_date: target || null });
      showToast(existingSiteCount === 0
        ? `Added ${name.trim()}. Existing non-Initiate phases have been moved under this site.`
        : `Added ${name.trim()}. Cloned phase chain from your first site (no tasks copied).`,
        "success");
      onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add site", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 10, padding: 24, width: 480, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
      >
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Add deployment site</h3>

        <div style={{
          marginTop: 10, padding: "10px 12px",
          background: existingSiteCount === 0 ? "#fef3c7" : "#dbeafe",
          border: `1px solid ${existingSiteCount === 0 ? "#fde68a" : "#93c5fd"}`,
          borderRadius: 6, fontSize: 12, color: existingSiteCount === 0 ? "#854d0e" : "#1e40af",
        }}>
          {existingSiteCount === 0 ? (
            <>
              <strong>First site for this project.</strong> Existing non-Initiate phases (Plan / Execute / Monitor / Go-Live / Hypercare etc.) will be moved under this site. Tasks come along automatically. Any phase named "Initiate" stays shared.
            </>
          ) : (
            <>
              <strong>Cloning from your first site.</strong> The phase chain from your earliest site is copied (phase rows only — tasks are not duplicated, since downstream sites typically have their own task list).
            </>
          )}
        </div>

        <label style={{ display: "block", marginTop: 14, fontSize: 12, fontWeight: 600, color: "#334155" }}>
          Site name
          <input
            className="ms-input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Libraries"
            style={{ marginTop: 4, width: "100%" }}
          />
        </label>

        <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 600, color: "#334155" }}>
          Target go-live date
          <input
            className="ms-input"
            type="date"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{ marginTop: 4, width: "100%" }}
          />
        </label>

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="ms-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="ms-btn-primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Adding…" : "Add site"}
          </button>
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  border: "1px solid #cbd5e1", background: "#fff", color: "#64748b",
  borderRadius: 4, padding: "2px 8px", fontSize: 12, cursor: "pointer", lineHeight: 1.2,
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}
