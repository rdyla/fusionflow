import { useState } from "react";
import { api } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

/**
 * Snapshot a project's task list into a private, reusable template.
 *
 * Lives on the Tasks tab beside the export menu — both are "take this task list
 * somewhere else" actions, and the Tasks tab is where a PM is actually looking
 * at the list they want to keep. It reads the plan and writes an asset on the
 * caller's own account; nothing about the project changes, so there's no confirm
 * step and no refresh callback.
 *
 * `phaseId` scopes the snapshot the same way apply-timeline scopes its rebuild.
 * On a multi-phase project the Tasks tab's own phase picker supplies it; the
 * caller is responsible for not opening this while the shared "Initiate" view is
 * selected, since that view has no phase to attribute the plan to.
 *
 * What the snapshot deliberately drops (dates, real assignees, statuses) is
 * stated in the dialog: a PM expecting a full clone and receiving a shape would
 * otherwise read it as half-working.
 */
export default function SaveAsTemplateModal({
  projectId,
  phaseId,
  phaseName,
  onClose,
}: {
  projectId: string;
  /** Null on single-phase projects — the server resolves the sole phase. */
  phaseId: string | null;
  /** Shown in the title. Null renders the whole-project wording. */
  phaseName: string | null;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(phaseName ? `${phaseName} plan` : "My project plan");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { showToast("Give the template a name.", "error"); return; }
    setSaving(true);
    try {
      const res = await api.saveProjectAsTemplate(projectId, {
        name: name.trim(),
        description: description.trim() || null,
        phase_id: phaseId,
      });
      const skipped = res.tasks_skipped_no_stage > 0
        ? ` ${res.tasks_skipped_no_stage} task${res.tasks_skipped_no_stage === 1 ? "" : "s"} outside a stage were skipped.`
        : "";
      showToast(
        `Saved "${res.name}" — ${res.stages_saved} stage${res.stages_saved === 1 ? "" : "s"}, ${res.tasks_saved} task${res.tasks_saved === 1 ? "" : "s"}.${skipped} Find it under My templates on your profile.`,
        "success",
      );
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save template", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 10, padding: 24, width: 480, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
      >
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
          {phaseName ? `Save ${phaseName} as a template` : "Save this plan as a template"}
        </h3>
        <div style={{ marginTop: 10, padding: "10px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, fontSize: 12, color: "#1e40af" }}>
          Captures the <strong>stage and task structure</strong> shown here, private to you. Dates become stage durations, assignees keep only their role (PM / IE / porting), and every task comes back as new work. Nothing on this project changes.
        </div>

        <label style={{ display: "block", marginTop: 14, fontSize: 12, fontWeight: 600, color: "#334155" }}>
          Template name
          <input
            className="ms-input"
            autoFocus
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            style={{ marginTop: 4, width: "100%" }}
          />
        </label>

        <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 600, color: "#334155" }}>
          Description <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional)</span>
          <input
            className="ms-input"
            value={description}
            maxLength={2000}
            placeholder="e.g. Multi-site UCaaS with onsite install"
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
            style={{ marginTop: 4, width: "100%" }}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} className="ms-btn-secondary" disabled={saving} style={{ fontSize: 13 }}>Cancel</button>
          <button onClick={() => void save()} className="ms-btn-primary" disabled={saving || !name.trim()} style={{ fontSize: 13 }}>
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>
    </div>
  );
}
