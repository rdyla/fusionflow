/**
 * Upcoming meetings panel — project Overview tab.
 *
 * Replaces the old single recurring "status meeting" cadence with a
 * one-project → many-meetings model (project_meetings table). PMs enter
 * discrete upcoming meetings; customer + partner contacts see them read-only.
 *
 * Placed ABOVE the people sections on the Overview so a large roster doesn't
 * push it out of sight. Editing is gated by `canEdit`; everyone who can view
 * the project sees the table.
 */

import { useEffect, useMemo, useState } from "react";
import { api, type ProjectMeeting, type MeetingInput } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

// Curated tz list — same set the old cadence panel offered. "—" clears it.
const TZ_OPTIONS: Array<{ label: string; tz: string }> = [
  { label: "Pacific (Los Angeles)", tz: "America/Los_Angeles" },
  { label: "Mountain (Denver)",     tz: "America/Denver" },
  { label: "Central (Chicago)",     tz: "America/Chicago" },
  { label: "Eastern (New York)",    tz: "America/New_York" },
  { label: "Arizona (no DST)",      tz: "America/Phoenix" },
  { label: "Alaska",                tz: "America/Anchorage" },
  { label: "Hawaii",                tz: "Pacific/Honolulu" },
];

type FormState = {
  title: string;
  meeting_date: string;
  start_time_local: string;
  timezone: string;
  duration_min: number | null;
  join_url: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  meeting_date: "",
  start_time_local: "",
  timezone: "America/Los_Angeles",
  duration_min: 30,
  join_url: "",
  notes: "",
};

export default function UpcomingMeetingsPanel({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const { showToast } = useToast();
  const [meetings, setMeetings] = useState<ProjectMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  // null = not editing; "new" = adding; otherwise the meeting id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.projectMeetings(projectId)
      .then((rows) => { if (live) setMeetings(rows); })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [projectId]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const { upcoming, past } = useMemo(() => {
    const up: ProjectMeeting[] = [];
    const pa: ProjectMeeting[] = [];
    for (const m of meetings) (m.meeting_date >= todayIso ? up : pa).push(m);
    // Server returns ascending; show past most-recent-first.
    pa.reverse();
    return { upcoming: up, past: pa };
  }, [meetings, todayIso]);

  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setEditing("new");
  }
  function openEdit(m: ProjectMeeting) {
    setForm({
      title: m.title ?? "",
      meeting_date: m.meeting_date,
      start_time_local: m.start_time_local ?? "",
      timezone: m.timezone ?? "America/Los_Angeles",
      duration_min: m.duration_min ?? 30,
      join_url: m.join_url ?? "",
      notes: m.notes ?? "",
    });
    setEditing(m.id);
  }
  function cancel() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.meeting_date)) {
      showToast("Pick a meeting date.", "error");
      return;
    }
    if (form.start_time_local && !/^\d{2}:\d{2}$/.test(form.start_time_local)) {
      showToast("Time must be HH:MM (24-hour).", "error");
      return;
    }
    const payload: MeetingInput = {
      title: form.title.trim() || null,
      meeting_date: form.meeting_date,
      start_time_local: form.start_time_local || null,
      timezone: form.start_time_local ? form.timezone : null,
      duration_min: form.duration_min ?? null,
      join_url: form.join_url.trim() || null,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    try {
      if (editing === "new") {
        const created = await api.addMeeting(projectId, payload);
        setMeetings((prev) => sortMeetings([...prev, created]));
        showToast("Meeting added.", "success");
      } else if (editing) {
        const updated = await api.updateMeeting(projectId, editing, payload);
        setMeetings((prev) => sortMeetings(prev.map((m) => (m.id === updated.id ? updated : m))));
        showToast("Meeting updated.", "success");
      }
      cancel();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save meeting", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(m: ProjectMeeting) {
    if (!window.confirm(`Delete the meeting${m.title ? ` "${m.title}"` : ""} on ${fmtDate(m.meeting_date)}?`)) return;
    try {
      await api.deleteMeeting(projectId, m.id);
      setMeetings((prev) => prev.filter((x) => x.id !== m.id));
      showToast("Meeting deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete meeting", "error");
    }
  }

  return (
    <div className="ms-section-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>Upcoming Meetings</div>
        {canEdit && !editing && (
          <button className="ms-btn-ghost" style={{ fontSize: 12, padding: "3px 10px" }} onClick={openAdd}>+ Add Meeting</button>
        )}
      </div>

      {editing && <MeetingEditor form={form} setForm={setForm} onSave={save} onCancel={cancel} saving={saving} isNew={editing === "new"} />}

      {loading ? (
        <div style={{ fontSize: 13, color: "#94a3b8" }}>Loading meetings…</div>
      ) : upcoming.length === 0 && !editing ? (
        <div style={{ fontSize: 13, color: "#64748b" }}>
          No upcoming meetings scheduled.{canEdit ? " Use “Add Meeting” to schedule one." : ""}
        </div>
      ) : (
        upcoming.length > 0 && <MeetingsTable meetings={upcoming} canEdit={canEdit} onEdit={openEdit} onDelete={remove} editingId={editing} />
      )}

      {past.length > 0 && (
        <div style={{ marginTop: upcoming.length > 0 || editing ? 14 : 0 }}>
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#64748b", padding: 0, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span style={{ fontSize: 10 }}>{showPast ? "▼" : "▶"}</span>
            Past meetings ({past.length})
          </button>
          {showPast && (
            <div style={{ marginTop: 8, opacity: 0.72 }}>
              <MeetingsTable meetings={past} canEdit={canEdit} onEdit={openEdit} onDelete={remove} editingId={editing} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MeetingsTable({
  meetings,
  canEdit,
  onEdit,
  onDelete,
  editingId,
}: {
  meetings: ProjectMeeting[];
  canEdit: boolean;
  onEdit: (m: ProjectMeeting) => void;
  onDelete: (m: ProjectMeeting) => void;
  editingId: string | null;
}) {
  const th: React.CSSProperties = { textAlign: "left", padding: "6px 10px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, color: "#1e293b", verticalAlign: "top" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
            <th style={th}>When</th>
            <th style={th}>Meeting</th>
            <th style={th}>Duration</th>
            <th style={th}>Join</th>
            <th style={th}>Notes</th>
            {canEdit && <th style={{ ...th, textAlign: "right" }} />}
          </tr>
        </thead>
        <tbody>
          {meetings.map((m) => (
            <tr key={m.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)", background: editingId === m.id ? "rgba(3,57,95,0.04)" : undefined }}>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                <div style={{ fontWeight: 600 }}>{fmtDate(m.meeting_date)}</div>
                {m.start_time_local && (
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {fmtTime(m.start_time_local)} {tzShort(m.timezone)}
                  </div>
                )}
              </td>
              <td style={td}>{m.title || <span style={{ color: "#94a3b8" }}>—</span>}</td>
              <td style={{ ...td, whiteSpace: "nowrap", color: "#64748b" }}>{m.duration_min ? `${m.duration_min} min` : "—"}</td>
              <td style={td}>
                {m.join_url
                  ? <a href={m.join_url} target="_blank" rel="noopener noreferrer" style={{ color: "#03395f" }}>Join link</a>
                  : <span style={{ color: "#94a3b8" }}>—</span>}
              </td>
              <td style={{ ...td, color: "#64748b", maxWidth: 320, whiteSpace: "pre-wrap" }}>{m.notes || <span style={{ color: "#cbd5e1" }}>—</span>}</td>
              {canEdit && (
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="ms-btn-ghost" style={{ fontSize: 11, padding: "2px 8px", marginRight: 4 }} onClick={() => onEdit(m)}>Edit</button>
                  <button
                    title="Delete meeting"
                    onClick={() => onDelete(m)}
                    style={{ background: "none", border: "1px solid #fecaca", color: "#d13438", borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}
                  >
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MeetingEditor({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}) {
  return (
    <div style={{ border: "1px solid #dde4ef", borderRadius: 8, padding: "12px 14px", marginBottom: 14, background: "#f8fafc", display: "grid", gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#03395f", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {isNew ? "Add meeting" : "Edit meeting"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 130px", gap: 8 }}>
        <label style={fieldLabel}>
          Title
          <input className="ms-input" style={inputStyle} value={form.title} placeholder="e.g. Weekly status" onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </label>
        <label style={fieldLabel}>
          Date
          <input className="ms-input" style={inputStyle} type="date" value={form.meeting_date} onChange={(e) => setForm((f) => ({ ...f, meeting_date: e.target.value }))} />
        </label>
        <label style={fieldLabel}>
          Duration (min)
          <input className="ms-input" style={inputStyle} type="number" min={5} max={480} value={form.duration_min ?? ""} onChange={(e) => setForm((f) => ({ ...f, duration_min: e.target.value ? +e.target.value : null }))} />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8 }}>
        <label style={fieldLabel}>
          Time (24h)
          <input className="ms-input" style={inputStyle} type="time" value={form.start_time_local} onChange={(e) => setForm((f) => ({ ...f, start_time_local: e.target.value }))} />
        </label>
        <label style={fieldLabel}>
          Timezone
          <select className="ms-input" style={inputStyle} value={form.timezone} disabled={!form.start_time_local} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}>
            {TZ_OPTIONS.map((o) => <option key={o.tz} value={o.tz}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <label style={fieldLabel}>
        Zoom / Teams join URL
        <input className="ms-input" style={inputStyle} value={form.join_url} placeholder="https://us06web.zoom.us/j/..." onChange={(e) => setForm((f) => ({ ...f, join_url: e.target.value }))} />
      </label>

      <label style={fieldLabel}>
        Notes / agenda
        <textarea className="ms-input" style={{ ...inputStyle, resize: "vertical", minHeight: 52 }} rows={2} value={form.notes} placeholder="Optional — agenda, attendees, prep…" onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      </label>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <button type="button" className="ms-btn-secondary" onClick={onCancel} disabled={saving} style={{ fontSize: 12 }}>Cancel</button>
        <button type="button" className="ms-btn-primary" onClick={onSave} disabled={saving} style={{ fontSize: 12 }}>
          {saving ? "Saving…" : isNew ? "Add meeting" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function sortMeetings(list: ProjectMeeting[]): ProjectMeeting[] {
  return [...list].sort((a, b) => {
    if (a.meeting_date !== b.meeting_date) return a.meeting_date < b.meeting_date ? -1 : 1;
    return (a.start_time_local ?? "99:99") < (b.start_time_local ?? "99:99") ? -1 : 1;
  });
}

function fmtDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(hhmm: string | null): string {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function tzShort(tz: string | null): string {
  if (!tz) return "";
  const opt = TZ_OPTIONS.find((o) => o.tz === tz);
  return opt ? opt.label.replace(/\s+\(.*?\)$/, "") : tz;
}

const fieldLabel: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: "0.04em",
};
const inputStyle: React.CSSProperties = { marginTop: 4, width: "100%", fontSize: 13, padding: "4px 8px" };
