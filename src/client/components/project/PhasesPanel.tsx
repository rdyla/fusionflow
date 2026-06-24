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
import { api, type Phase, type Template, type User, type PhaseContact, type PhaseStaffMember, type DynamicsContact } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";
import { formatDateOnly } from "../../lib/dates";

export default function PhasesPanel({ projectId, canEdit, onChange }: { projectId: string; canEdit: boolean; onChange?: () => void }) {
  const { showToast } = useToast();
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [scoped, setScoped] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [contacts, setContacts] = useState<PhaseContact[]>([]);
  const [staff, setStaff] = useState<PhaseStaffMember[]>([]);
  const [pfUsers, setPfUsers] = useState<User[]>([]);
  const [dynamicsAccountId, setDynamicsAccountId] = useState<string | null>(null);
  const [peoplePhase, setPeoplePhase] = useState<Phase | "all" | null>(null);

  useEffect(() => { void load(); }, [projectId]);

  async function load() {
    try {
      setLoading(true);
      const [ph, proj, pc, ps] = await Promise.all([
        api.phases(projectId),
        api.project(projectId),
        api.phaseContacts(projectId).catch(() => []),
        api.phaseStaff(projectId).catch(() => []),
      ]);
      setPhases(ph);
      setScoped(!!proj.phase_scoped_visibility);
      setDynamicsAccountId(proj.dynamics_account_id);
      setContacts(pc);
      setStaff(ps);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load phases", "error");
    } finally {
      setLoading(false);
    }
  }

  // PF users for the staff picker — loaded lazily on first People modal open.
  async function ensureUsers() {
    if (pfUsers.length > 0) return;
    // PF staff for phases are PMs or implementation engineers only.
    try { setPfUsers((await api.users()).filter((u) => u.role === "pm" || u.role === "pf_engineer")); } catch { /* ignore */ }
  }

  async function reloadPeople() {
    const [pc, ps] = await Promise.all([
      api.phaseContacts(projectId).catch(() => []),
      api.phaseStaff(projectId).catch(() => []),
    ]);
    setContacts(pc);
    setStaff(ps);
  }

  async function toggleScoped() {
    const next = !scoped;
    setSavingToggle(true);
    try {
      await api.updateProject(projectId, { phase_scoped_visibility: next ? 1 : 0 });
      setScoped(next);
      showToast(next ? "Phase-level visibility ON — customers see only the phases they're attached to." : "Phase-level visibility OFF — customers see the whole project.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update", "error");
    } finally {
      setSavingToggle(false);
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {canEdit && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569", cursor: savingToggle ? "wait" : "pointer" }} title="When on, a customer contact sees only the phases they're attached to (or all, if marked All phases). Off = sees the whole project.">
              <input type="checkbox" checked={scoped} disabled={savingToggle} onChange={toggleScoped} style={{ cursor: "pointer" }} />
              Phase-level visibility
            </label>
          )}
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
      </div>

      {scoped && (
        <div style={{ marginBottom: 10, padding: "8px 12px", background: "#fef9c3", border: "1px solid #fde047", borderRadius: 6, fontSize: 12, color: "#854d0e" }}>
          <strong>Phase-level visibility is on.</strong> Customer contacts see only the phases they're attached to. Mark a contact <em>All phases</em> (college/district personnel) to give whole-project access. Contacts with no attachment see nothing.
          {canEdit && (
            <button type="button" onClick={() => { void ensureUsers(); setPeoplePhase("all"); }} style={{ marginLeft: 8, background: "none", border: "none", color: "#0b9aad", fontWeight: 600, cursor: "pointer", fontSize: 12, padding: 0 }}>
              Manage all-phases contacts →
            </button>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
        Every project starts with one Main phase — apply a template + set a go-live date on it. Add more phases for staggered cutovers (multi-location rollouts: HQ → Remote phase 1 → Remote phase 2) or multi-product deployments where one tech goes live before another (Zoom Phone first, then Zoom Contact Center).
      </div>

      {loading ? (
        <div style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic" }}>Loading…</div>
      ) : phases.length === 0 ? (
        null
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {phases.map((s) => (
            <PhaseRow
              key={s.id}
              phase={s}
              canEdit={canEdit}
              projectId={projectId}
              contactCount={contacts.filter((c) => c.phase_id === s.id).length}
              staffCount={staff.filter((st) => st.phase_id === s.id).length}
              onPeople={() => { void ensureUsers(); setPeoplePhase(s); }}
              onChanged={() => { void load(); onChange?.(); }}
              onDelete={() => handleDelete(s)}
            />
          ))}
        </div>
      )}

      {peoplePhase && (
        <PhasePeopleModal
          projectId={projectId}
          phase={peoplePhase === "all" ? null : peoplePhase}
          contacts={contacts.filter((c) => c.phase_id === (peoplePhase === "all" ? null : peoplePhase.id))}
          staff={peoplePhase === "all" ? [] : staff.filter((st) => st.phase_id === peoplePhase.id)}
          pfUsers={pfUsers}
          dynamicsAccountId={dynamicsAccountId}
          onClose={() => setPeoplePhase(null)}
          onChanged={reloadPeople}
        />
      )}

      {addOpen && (
        <AddPhaseModal
          projectId={projectId}
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

function PhaseRow({ phase, canEdit, projectId, contactCount, staffCount, onPeople, onChanged, onDelete }: { phase: Phase; canEdit: boolean; projectId: string; contactCount: number; staffCount: number; onPeople: () => void; onChanged: () => void; onDelete: () => void }) {
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
          {(contactCount > 0 || staffCount > 0) && (
            <span style={{ fontSize: 11, color: "#64748b" }} title={`${contactCount} customer contact(s), ${staffCount} PF staff`}>
              👤 {contactCount} · 🛠 {staffCount}
            </span>
          )}
          <span style={{ color: "#64748b", fontSize: 12, minWidth: 110, textAlign: "right" }}>
            {phase.target_go_live_date ? `Go-live ${fmtDate(phase.target_go_live_date)}` : "No date"}
          </span>
          {canEdit && (
            <>
              <button onClick={onPeople} style={{ ...iconBtn, padding: "2px 10px" }} title="Manage people for this phase">
                People
              </button>
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

function AddPhaseModal({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: () => void }) {
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
      showToast(`Added ${name.trim()}. Cloned stage chain from your first phase (no tasks copied).`, "success");
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
          background: "#dbeafe", border: "1px solid #93c5fd",
          borderRadius: 6, fontSize: 12, color: "#1e40af",
        }}>
          <strong>Cloning from your first phase.</strong> The stage chain from your earliest phase is copied (stage rows only — tasks are not duplicated, since downstream phases typically have their own task list).
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

/**
 * Manage the people attached to a phase. When `phase` is null this manages the
 * project's "All phases" customer-contact tier (college/district personnel who
 * see the whole project); PF staff is phase-specific so it's hidden in that case.
 */
function PhasePeopleModal({
  projectId, phase, contacts, staff, pfUsers, dynamicsAccountId, onClose, onChanged,
}: {
  projectId: string;
  phase: Phase | null;
  contacts: PhaseContact[];
  staff: PhaseStaffMember[];
  pfUsers: User[];
  dynamicsAccountId: string | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const { showToast } = useToast();
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cRole, setCRole] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [crm, setCrm] = useState<DynamicsContact[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmSel, setCrmSel] = useState("");
  const [addingCrm, setAddingCrm] = useState(false);

  useEffect(() => {
    if (!dynamicsAccountId) return;
    setCrmLoading(true);
    api.getDynamicsContacts(dynamicsAccountId)
      .then(setCrm)
      .catch(() => setCrm([]))
      .finally(() => setCrmLoading(false));
  }, [dynamicsAccountId]);

  const crmName = (k: DynamicsContact) => `${k.firstname ?? ""} ${k.lastname ?? ""}`.trim() || (k.emailaddress1 ?? "Unnamed");
  const takenEmails = new Set(contacts.map((c) => (c.email ?? "").toLowerCase()).filter(Boolean));
  const crmAvailable = crm.filter((k) => !k.emailaddress1 || !takenEmails.has(k.emailaddress1.toLowerCase()));

  async function addFromCrm() {
    const picked = crm.find((k) => k.contactid === crmSel);
    if (!picked) return;
    setAddingCrm(true);
    try {
      await api.createPhaseContact(projectId, {
        phase_id: phase?.id ?? null,
        name: crmName(picked),
        email: picked.emailaddress1 ?? null,
        contact_role: picked.jobtitle ?? null,
      });
      setCrmSel("");
      await onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add contact", "error");
    } finally {
      setAddingCrm(false);
    }
  }
  const [sUserId, setSUserId] = useState("");
  const [sRole, setSRole] = useState("");
  const [savingStaff, setSavingStaff] = useState(false);

  const title = phase ? `People — ${phase.name}` : "All-phases contacts";

  async function addContact() {
    if (!cName.trim()) { showToast("Name is required.", "error"); return; }
    setSavingContact(true);
    try {
      await api.createPhaseContact(projectId, {
        phase_id: phase?.id ?? null,
        name: cName.trim(),
        email: cEmail.trim() || null,
        contact_role: cRole.trim() || null,
      });
      setCName(""); setCEmail(""); setCRole("");
      await onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add contact", "error");
    } finally {
      setSavingContact(false);
    }
  }

  async function removeContact(id: string) {
    try { await api.deletePhaseContact(projectId, id); await onChanged(); }
    catch (err) { showToast(err instanceof Error ? err.message : "Failed to remove", "error"); }
  }

  async function addStaff() {
    if (!phase || !sUserId) return;
    setSavingStaff(true);
    try {
      await api.createPhaseStaff(projectId, { phase_id: phase.id, user_id: sUserId, staff_role: sRole || null });
      setSUserId(""); setSRole("");
      await onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add staff", "error");
    } finally {
      setSavingStaff(false);
    }
  }

  async function removeStaff(id: string) {
    try { await api.deletePhaseStaff(projectId, id); await onChanged(); }
    catch (err) { showToast(err instanceof Error ? err.message : "Failed to remove", "error"); }
  }

  return (
    <div role="dialog" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 10, padding: 24, width: 560, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>{title}</h3>

        {/* Customer contacts */}
        <div style={{ marginTop: 16, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>
          Customer contacts {phase ? "" : "(see all phases)"}
        </div>
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {contacts.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>None yet.</div>}
          {contacts.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: "#1e293b" }}>{c.name}</span>
              {c.email && <span style={{ color: "#64748b", fontSize: 12 }}>{c.email}</span>}
              {c.contact_role && <span style={{ color: "#94a3b8", fontSize: 11 }}>· {c.contact_role}</span>}
              <button onClick={() => removeContact(c.id)} style={{ ...iconBtn, marginLeft: "auto", color: "#dc2626" }} title="Remove">✕</button>
            </div>
          ))}
        </div>
        {/* Add from CRM */}
        {dynamicsAccountId && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select className="ms-input" value={crmSel} onChange={(e) => setCrmSel(e.target.value)} disabled={crmLoading || addingCrm} style={{ flex: "1 1 260px", fontSize: 13, padding: "4px 8px" }}>
              <option value="">{crmLoading ? "Loading CRM contacts…" : crmAvailable.length ? "Add from CRM…" : "No more CRM contacts"}</option>
              {crmAvailable.map((k) => (
                <option key={k.contactid} value={k.contactid}>
                  {crmName(k)}{k.emailaddress1 ? ` — ${k.emailaddress1}` : ""}{k.jobtitle ? ` (${k.jobtitle})` : ""}
                </option>
              ))}
            </select>
            <button className="ms-btn-secondary" onClick={addFromCrm} disabled={!crmSel || addingCrm} style={{ fontSize: 12, padding: "4px 12px" }}>{addingCrm ? "…" : "Add from CRM"}</button>
          </div>
        )}

        {/* Add net-new */}
        <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8" }}>{dynamicsAccountId ? "…or add a contact not in CRM:" : "Add a contact:"}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <input className="ms-input" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Name" style={{ flex: "1 1 130px", fontSize: 13, padding: "4px 8px" }} />
          <input className="ms-input" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="Email (used for access)" style={{ flex: "1 1 170px", fontSize: 13, padding: "4px 8px" }} />
          <input className="ms-input" value={cRole} onChange={(e) => setCRole(e.target.value)} placeholder="Role" style={{ flex: "0 1 110px", fontSize: 13, padding: "4px 8px" }} />
          <button className="ms-btn-primary" onClick={addContact} disabled={savingContact || !cName.trim()} style={{ fontSize: 12, padding: "4px 12px" }}>{savingContact ? "…" : "Add"}</button>
        </div>

        {/* PF staff — phase-specific only */}
        {phase && (
          <>
            <div style={{ marginTop: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>
              PF staff
            </div>
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {staff.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>None yet.</div>}
              {staff.map((st) => (
                <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: "#1e293b" }}>{st.user_name ?? st.user_email}</span>
                  {st.staff_role && <span style={{ color: "#94a3b8", fontSize: 11 }}>· {st.staff_role}</span>}
                  <button onClick={() => removeStaff(st.id)} style={{ ...iconBtn, marginLeft: "auto", color: "#dc2626" }} title="Remove">✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <select className="ms-input" value={sUserId} onChange={(e) => setSUserId(e.target.value)} style={{ flex: "1 1 200px", fontSize: 13, padding: "4px 8px" }}>
                <option value="">Pick a PF user…</option>
                {pfUsers.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
              </select>
              <select className="ms-input" value={sRole} onChange={(e) => setSRole(e.target.value)} style={{ flex: "0 1 130px", fontSize: 13, padding: "4px 8px" }}>
                <option value="">Role…</option>
                <option value="pm">PM</option>
                <option value="sa">SA</option>
                <option value="csm">CSM</option>
                <option value="engineer">Engineer</option>
                <option value="ae">AE</option>
              </select>
              <button className="ms-btn-primary" onClick={addStaff} disabled={savingStaff || !sUserId} style={{ fontSize: 12, padding: "4px 12px" }}>{savingStaff ? "…" : "Add"}</button>
            </div>
          </>
        )}

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="ms-btn-secondary" onClick={onClose}>Done</button>
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
  return formatDateOnly(iso);
}
