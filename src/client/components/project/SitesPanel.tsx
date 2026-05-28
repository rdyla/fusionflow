/**
 * Sites management panel — lives on the project Overview tab.
 *
 * Lets PMs add / rename / re-order / delete deployment sites for multi-site
 * projects. The first site added to a project moves the project's existing
 * post-Initiate stages under it; subsequent sites clone the first site's
 * stage chain (without tasks). See `src/server/routes/sites.ts` for the
 * server-side stage-wiring rules.
 *
 * For single-site projects (the default), this panel simply shows
 * "No sites yet — Add deployment site" and stays out of the way.
 */

import { useEffect, useState } from "react";
import { api, type Site, type Template } from "../../lib/api";
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
      `Delete "${site.name}" and all of its stages + tasks?\n\nThis cascades — stages and tasks belonging only to this site are removed. The project's shared Initiate stage is unaffected.`
    )) return;
    try {
      const res = await api.deleteSite(projectId, site.id);
      showToast(`Deleted ${site.name} (${res.deleted_stage_count} stage${res.deleted_stage_count === 1 ? "" : "s"} removed).`, "success");
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
        Use sites for any project that ships in staggered cutovers — multi-location rollouts (HQ → Remote site 1 → Remote site 2) or multi-product deployments where one tech goes live before the other (Zoom Phone first, then Zoom Contact Center a few months later). Single-site projects can ignore this section.
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
  const [applyOpen, setApplyOpen] = useState(false);

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
              <button onClick={() => setApplyOpen(true)} style={{ ...iconBtn, padding: "2px 10px" }} title="Apply template to this site">
                + Template
              </button>
              <button onClick={() => setEditing(true)} style={iconBtn} title="Edit">✎</button>
              <button onClick={onDelete} style={{ ...iconBtn, color: "#dc2626" }} title="Delete">✕</button>
            </>
          )}
        </>
      )}

      {applyOpen && (
        <ApplyTemplateModal
          projectId={projectId}
          site={site}
          onClose={() => setApplyOpen(false)}
          onApplied={() => {
            setApplyOpen(false);
            onChanged();
          }}
        />
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
        ? `Added ${name.trim()}. Existing non-Initiate stages have been moved under this site.`
        : `Added ${name.trim()}. Cloned stage chain from your first site (no tasks copied).`,
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
              <strong>First site for this project.</strong> Existing non-Initiate stages (Plan / Execute / Monitor / Go-Live / Hypercare etc.) will be moved under this site. Tasks come along automatically. Any stage named "Initiate" stays shared.
            </>
          ) : (
            <>
              <strong>Cloning from your first site.</strong> The stage chain from your earliest site is copied (stage rows only — tasks are not duplicated, since downstream sites typically have their own task list).
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
            placeholder="e.g. HQ office, or Zoom Phone"
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

/**
 * Apply a template scoped to a specific site. The same machinery as the
 * project-level apply-template (stage reuse by name, fuzzy task dedupe,
 * solution-type tagging) but new stages are inserted with site_id = this
 * site, and the reuse lookup only sees stages under this site. Lets a
 * Zoom Phone + Zoom CC combo project carry two distinct sets of stages
 * with the same names (Plan, Execute, ...) on each side.
 */
function ApplyTemplateModal({ projectId, site, onClose, onApplied }: { projectId: string; site: Site; onClose: () => void; onApplied: () => void }) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [applying, setApplying] = useState(false);
  // Default the go-live to the site's target — that's the natural anchor.
  // PM can clear it to skip date scheduling and get the old dateless behavior.
  const [goLive, setGoLive] = useState<string>(site.target_go_live_date ?? "");

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setTemplates(await api.templatesList());
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to load templates", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function apply() {
    if (!selectedId) return;
    setApplying(true);
    try {
      const res = await api.applyTemplate(projectId, selectedId, site.id, goLive || null);
      const parts: string[] = [];
      parts.push(`${res.stages_created} stage${res.stages_created !== 1 ? "s" : ""}`);
      parts.push(`${res.tasks_created} task${res.tasks_created !== 1 ? "s" : ""}`);
      if (res.tasks_merged > 0) parts.push(`${res.tasks_merged} merged`);
      const tail = goLive ? ` (dated from ${fmtDate(goLive)} go-live)` : "";
      showToast(`Applied to ${site.name}: ${parts.join(" · ")}${tail}.`, "success");
      onApplied();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to apply template", "error");
    } finally {
      setApplying(false);
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
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
          Apply template to {site.name}
        </h3>
        <div style={{
          marginTop: 10, padding: "10px 12px",
          background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: 6, fontSize: 12, color: "#1e40af",
        }}>
          New stages land under <strong>{site.name}</strong>. Existing same-named stages under this site are reused; stages on other sites are not touched.
        </div>

        <label style={{ display: "block", marginTop: 14, fontSize: 12, fontWeight: 600, color: "#334155" }}>
          Template
          <select
            className="ms-input"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={loading || applying}
            style={{ marginTop: 4, width: "100%" }}
          >
            <option value="">{loading ? "Loading…" : "Pick a template"}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.solution_type ? ` (${t.solution_type})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 600, color: "#334155" }}>
          Go-live date
          <input
            className="ms-input"
            type="date"
            value={goLive}
            onChange={(e) => setGoLive(e.target.value)}
            disabled={applying}
            style={{ marginTop: 4, width: "100%" }}
          />
          <span style={{ fontSize: 11, fontWeight: 400, color: "#64748b", marginTop: 4, display: "block" }}>
            {goLive
              ? "Stage dates chain backward from this date using each stage's working_days. Tasks inherit their stage's window. Existing same-named stages keep their dates if already set."
              : "Leave blank to skip date scheduling (stages + tasks land without dates)."}
          </span>
        </label>

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="ms-btn-secondary" onClick={onClose} disabled={applying}>Cancel</button>
          <button type="button" className="ms-btn-primary" onClick={apply} disabled={applying || !selectedId}>
            {applying ? "Applying…" : "Apply"}
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
