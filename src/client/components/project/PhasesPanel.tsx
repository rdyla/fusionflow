/**
 * Phases management panel — lives on the project Overview tab.
 *
 * Lets PMs add / rename / re-order / delete deployment phases for multi-phase
 * projects. The first phase added to a project moves the project's existing
 * post-Initiate stages under it; subsequent phases clone the first phase's
 * stage chain (without tasks). See `src/server/routes/phases.ts` for the
 * server-side stage-wiring rules.
 *
 * For single-phase projects (the default), this panel simply shows
 * "No phases yet — Add deployment phase" and stays out of the way.
 */

import { useEffect, useState } from "react";
import { api, type Phase, type Template } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

export default function PhasesPanel({ projectId, canEdit, onChange }: { projectId: string; canEdit: boolean; onChange?: () => void }) {
  const { showToast } = useToast();
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => { void load(); }, [projectId]);

  async function load() {
    try {
      setLoading(true);
      setPhases(await api.phases(projectId));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load phases", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(phase: Phase) {
    if (!window.confirm(
      `Delete "${phase.name}" and all of its stages + tasks?\n\nThis cascades — stages and tasks belonging only to this phase are removed. The project's shared Initiate stage is unaffected.`
    )) return;
    try {
      const res = await api.deletePhase(projectId, phase.id);
      showToast(`Deleted ${phase.name} (${res.deleted_stage_count} stage${res.deleted_stage_count === 1 ? "" : "s"} removed).`, "success");
      await load();
      onChange?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete phase", "error");
    }
  }

  return (
    <div className="ms-section-card" style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>
          Deployment phases
          {phases.length > 0 && <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8", marginLeft: 8 }}>({phases.length})</span>}
        </div>
        {canEdit && (
          <button
            type="button"
            className="ms-btn-secondary"
            onClick={() => setAddOpen(true)}
            style={{ fontSize: 12 }}
          >
            + Add deployment phase
          </button>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#64748b", marginBottom: phases.length > 0 ? 10 : 0 }}>
        Use phases for any project that ships in staggered cutovers — multi-location rollouts (HQ → Remote phase 1 → Remote phase 2) or multi-product deployments where one tech goes live before the other (Zoom Phone first, then Zoom Contact Center a few months later). Single-phase projects can ignore this section.
      </div>

      {loading ? (
        <div style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>Loading…</div>
      ) : phases.length === 0 ? (
        null
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {phases.map((s) => (
            <PhaseRow key={s.id} phase={s} canEdit={canEdit} projectId={projectId} onChanged={() => { void load(); onChange?.(); }} onDelete={() => handleDelete(s)} />
          ))}
        </div>
      )}

      {addOpen && (
        <AddPhaseModal
          projectId={projectId}
          existingPhaseCount={phases.length}
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

function PhaseRow({ phase, canEdit, projectId, onChanged, onDelete }: { phase: Phase; canEdit: boolean; projectId: string; onChanged: () => void; onDelete: () => void }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(phase.name);
  const [target, setTarget] = useState(phase.target_go_live_date ?? "");
  const [saving, setSaving] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  async function save() {
    if (!name.trim()) {
      showToast("Phase name is required.", "error");
      return;
    }
    setSaving(true);
    try {
      await api.updatePhase(projectId, phase.id, {
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
            placeholder="Phase name"
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
          <button className="ms-btn-secondary" onClick={() => { setEditing(false); setName(phase.name); setTarget(phase.target_go_live_date ?? ""); }} style={{ fontSize: 12, padding: "4px 12px" }}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontWeight: 600, color: "#1e293b" }}>{phase.name}</span>
          <span style={{ color: "#64748b", fontSize: 12, minWidth: 110, textAlign: "right" }}>
            {phase.target_go_live_date ? `Go-live ${fmtDate(phase.target_go_live_date)}` : "No date"}
          </span>
          {canEdit && (
            <>
              <button onClick={() => setApplyOpen(true)} style={{ ...iconBtn, padding: "2px 10px" }} title="Apply template to this phase">
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
          phase={phase}
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

function AddPhaseModal({ projectId, existingPhaseCount, onClose, onCreated }: { projectId: string; existingPhaseCount: number; onClose: () => void; onCreated: () => void }) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      showToast("Phase name is required.", "error");
      return;
    }
    setSaving(true);
    try {
      await api.createPhase(projectId, { name: name.trim(), target_go_live_date: target || null });
      showToast(existingPhaseCount === 0
        ? `Added ${name.trim()}. Existing non-Initiate stages have been moved under this phase.`
        : `Added ${name.trim()}. Cloned stage chain from your first phase (no tasks copied).`,
        "success");
      onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add phase", "error");
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
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Add deployment phase</h3>

        <div style={{
          marginTop: 10, padding: "10px 12px",
          background: existingPhaseCount === 0 ? "#fef3c7" : "#dbeafe",
          border: `1px solid ${existingPhaseCount === 0 ? "#fde68a" : "#93c5fd"}`,
          borderRadius: 6, fontSize: 12, color: existingPhaseCount === 0 ? "#854d0e" : "#1e40af",
        }}>
          {existingPhaseCount === 0 ? (
            <>
              <strong>First phase for this project.</strong> Existing non-Initiate stages (Plan / Execute / Monitor / Go-Live / Hypercare etc.) will be moved under this phase. Tasks come along automatically. Any stage named "Initiate" stays shared.
            </>
          ) : (
            <>
              <strong>Cloning from your first phase.</strong> The stage chain from your earliest phase is copied (stage rows only — tasks are not duplicated, since downstream phases typically have their own task list).
            </>
          )}
        </div>

        <label style={{ display: "block", marginTop: 14, fontSize: 12, fontWeight: 600, color: "#334155" }}>
          Phase name
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
            {saving ? "Adding…" : "Add phase"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Apply a template scoped to a specific phase. The same machinery as the
 * project-level apply-template (stage reuse by name, fuzzy task dedupe,
 * solution-type tagging) but new stages are inserted with phase_id = this
 * phase, and the reuse lookup only sees stages under this phase. Lets a
 * Zoom Phone + Zoom CC combo project carry two distinct sets of stages
 * with the same names (Plan, Execute, ...) on each side.
 */
function ApplyTemplateModal({ projectId, phase, onClose, onApplied }: { projectId: string; phase: Phase; onClose: () => void; onApplied: () => void }) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [applying, setApplying] = useState(false);
  // Default the go-live to the phase's target — that's the natural anchor.
  // PM can clear it to skip date scheduling and get the old dateless behavior.
  const [goLive, setGoLive] = useState<string>(phase.target_go_live_date ?? "");

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
      const res = await api.applyTemplate(projectId, selectedId, phase.id, goLive || null);
      const parts: string[] = [];
      parts.push(`${res.stages_created} stage${res.stages_created !== 1 ? "s" : ""}`);
      parts.push(`${res.tasks_created} task${res.tasks_created !== 1 ? "s" : ""}`);
      if (res.tasks_merged > 0) parts.push(`${res.tasks_merged} merged`);
      const tail = goLive ? ` (dated from ${fmtDate(goLive)} go-live)` : "";
      showToast(`Applied to ${phase.name}: ${parts.join(" · ")}${tail}.`, "success");
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
          Apply template to {phase.name}
        </h3>
        <div style={{
          marginTop: 10, padding: "10px 12px",
          background: "#eff6ff", border: "1px solid #bfdbfe",
          borderRadius: 6, fontSize: 12, color: "#1e40af",
        }}>
          New stages land under <strong>{phase.name}</strong>. Existing same-named stages under this phase are reused; stages on other phases are not touched.
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
