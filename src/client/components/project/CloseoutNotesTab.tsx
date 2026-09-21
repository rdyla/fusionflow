import { useState } from "react";
import { api, type Project, type ProjectStaffMember } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";
import { vendorLabel } from "../../../shared/vendors";
import { SOLUTION_TYPE_LABELS, type SolutionType } from "../../../shared/solutionTypes";

function formatDate(d: string | null) {
  if (!d) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T00:00:00" : d;
  return new Date(normalized).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, background: "#fff", color: "#1e293b", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" };

const STAFF_ROLE_TITLE: Record<string, string> = {
  pm: "Project Manager",
  engineer: "Implementation Engineer",
  sa: "Solution Architect",
  ae: "Account Executive",
  partner_ae: "Partner AE",
  csm: "Customer Success Manager",
};

/** A starting point for the Team field — never overwrites a saved value,
 *  just gives the PM something to edit instead of a blank box. Reads
 *  directly off `staff` (project_staff, already scoped to this project)
 *  rather than gating on project.pm_user_id — that column isn't reliably
 *  set even when a project_staff row with staff_role='pm' exists. */
function suggestTeam(staff: ProjectStaffMember[]): string {
  const parts: string[] = [];
  const pm = staff.find((s) => s.staff_role === "pm" && s.name);
  if (pm?.name) parts.push(`${pm.name} – Project Manager`);
  for (const s of staff) {
    if (s.staff_role === "pm" || !s.name) continue;
    const title = STAFF_ROLE_TITLE[s.staff_role] ?? s.staff_role;
    parts.push(`${s.name} – ${title}`);
  }
  return parts.join(", ");
}

function suggestSolution(project: Project): string {
  const vendor = project.vendor ? vendorLabel(project.vendor) : null;
  const types = (project.solution_types as SolutionType[] | undefined ?? [])
    .map((t) => SOLUTION_TYPE_LABELS[t])
    .filter(Boolean);
  if (vendor && types.length) return `${vendor} — ${types.join(", ")}`;
  return vendor ?? types.join(", ") ?? "";
}

type Draft = {
  closeout_team: string;
  closeout_solution: string;
  closeout_delivered: string;
  closeout_summary: string;
};

function toDraft(project: Project, staff: ProjectStaffMember[]): Draft {
  return {
    closeout_team: project.closeout_team ?? suggestTeam(staff),
    closeout_solution: project.closeout_solution ?? suggestSolution(project),
    closeout_delivered: project.closeout_delivered ?? "",
    closeout_summary: project.closeout_summary ?? "",
  };
}

function BulletList({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {lines.map((line, i) => <li key={i} style={{ fontSize: 14, color: "#1e293b", marginBottom: 4 }}>{line}</li>)}
    </ul>
  );
}

export default function CloseoutNotesTab({
  project,
  staff,
  canEdit,
  onSave,
}: {
  project: Project;
  staff: ProjectStaffMember[];
  canEdit: boolean;
  onSave: (updated: Project) => void;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(project, staff));
  const [saving, setSaving] = useState(false);

  const hasAnyContent = !!(project.closeout_team || project.closeout_solution || project.closeout_delivered || project.closeout_summary);

  function startEditing() {
    setDraft(toDraft(project, staff));
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.updateProject(project.id, {
        closeout_team: draft.closeout_team.trim() || null,
        closeout_solution: draft.closeout_solution.trim() || null,
        closeout_delivered: draft.closeout_delivered.trim() || null,
        closeout_summary: draft.closeout_summary.trim() || null,
      });
      onSave(updated);
      setEditing(false);
      showToast("Closeout notes saved.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save closeout notes", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ms-section-card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <div className="ms-section-title" style={{ marginBottom: 2 }}>Closeout Notes</div>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, maxWidth: 520 }}>
            What CSM and sales use to prep for the customer closeout meeting — visible to anyone staffed or with visibility on this project.
          </p>
        </div>
        {canEdit && !editing && (
          <button type="button" className="ms-btn-secondary" onClick={startEditing}>
            {hasAnyContent ? "Edit" : "Add Notes"}
          </button>
        )}
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 4 }}>
        <span style={labelStyle}>Go-Live Date</span>
        <span style={{ fontSize: 14, color: project.actual_go_live_date ? "#1e293b" : "#94a3b8" }}>
          {project.actual_go_live_date ? formatDate(project.actual_go_live_date) : "Not yet gone live"}
        </span>
      </div>

      {editing ? (
        <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
          <div>
            <label style={labelStyle}>Deployment Team</label>
            <input
              style={inputStyle}
              value={draft.closeout_team}
              onChange={(e) => setDraft({ ...draft, closeout_team: e.target.value })}
              placeholder="e.g. Sherri Sadden – Sr. Project Manager and Ryan Dyla – Implementation Engineer"
            />
          </div>
          <div>
            <label style={labelStyle}>Solution / Deployment</label>
            <input
              style={inputStyle}
              value={draft.closeout_solution}
              onChange={(e) => setDraft({ ...draft, closeout_solution: e.target.value })}
              placeholder="e.g. Zoom — Revenue Accelerator"
            />
          </div>
          <div>
            <label style={labelStyle}>What Was Delivered <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(one item per line)</span></label>
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 100 }}
              value={draft.closeout_delivered}
              onChange={(e) => setDraft({ ...draft, closeout_delivered: e.target.value })}
              placeholder={"Call recording and analysis\nAutomated summaries and coaching insights\nAI-powered conversation analysis"}
            />
          </div>
          <div>
            <label style={labelStyle}>Finalization Summary</label>
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 64 }}
              value={draft.closeout_summary}
              onChange={(e) => setDraft({ ...draft, closeout_summary: e.target.value })}
              placeholder="e.g. Successfully deployed and integrated with Salesforce CRM."
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="ms-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="ms-btn-secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
          <div>
            <span style={labelStyle}>Deployment Team</span>
            <span style={{ fontSize: 14, color: project.closeout_team ? "#1e293b" : "#94a3b8", fontStyle: project.closeout_team ? "normal" : "italic" }}>
              {project.closeout_team || "Not yet added."}
            </span>
          </div>
          <div>
            <span style={labelStyle}>Solution / Deployment</span>
            <span style={{ fontSize: 14, color: project.closeout_solution ? "#1e293b" : "#94a3b8", fontStyle: project.closeout_solution ? "normal" : "italic" }}>
              {project.closeout_solution || "Not yet added."}
            </span>
          </div>
          <div>
            <span style={labelStyle}>What Was Delivered</span>
            {project.closeout_delivered ? <BulletList text={project.closeout_delivered} /> : (
              <span style={{ fontSize: 14, color: "#94a3b8", fontStyle: "italic" }}>Not yet added.</span>
            )}
          </div>
          <div>
            <span style={labelStyle}>Finalization Summary</span>
            <span style={{ fontSize: 14, color: project.closeout_summary ? "#1e293b" : "#94a3b8", fontStyle: project.closeout_summary ? "normal" : "italic" }}>
              {project.closeout_summary || "Not yet added."}
            </span>
          </div>
        </div>
      )}

      {project.closeout_notes_updated_at && (
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid #f1f5f9", fontSize: 11, color: "#94a3b8" }}>
          Last updated {formatDate(project.closeout_notes_updated_at)}
          {project.closeout_notes_updated_by_name ? ` by ${project.closeout_notes_updated_by_name}` : ""}
        </div>
      )}
    </div>
  );
}
