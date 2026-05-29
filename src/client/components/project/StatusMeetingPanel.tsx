/**
 * Status meeting cadence panel — lives on the project Overview tab.
 *
 * Captures a recurring weekly cadence (e.g. "Weekly status · Wed 3:30 PM PT
 * · 30 min · join URL") that drives the Dashboard's "Next call" tile when no
 * closer milestone meeting (a task with a meeting_join_url) is upcoming.
 *
 * All six status_meeting_* columns live on the projects table (migration
 * 0084). This panel reads + writes them via api.updateProject. PMs set it
 * once per project; the Dashboard's next-occurrence math runs in the
 * server's stakeholder endpoint.
 */

import { useState } from "react";
import { api, type Project } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Curated list — covers ~all US-based customer cadences without overwhelming
// the dropdown. "Other" routes to a free-text input.
const TZ_OPTIONS: Array<{ label: string; tz: string }> = [
  { label: "Pacific (Los Angeles)",  tz: "America/Los_Angeles" },
  { label: "Mountain (Denver)",      tz: "America/Denver" },
  { label: "Central (Chicago)",      tz: "America/Chicago" },
  { label: "Eastern (New York)",     tz: "America/New_York" },
  { label: "Arizona (no DST)",       tz: "America/Phoenix" },
  { label: "Alaska",                 tz: "America/Anchorage" },
  { label: "Hawaii",                 tz: "Pacific/Honolulu" },
];

export default function StatusMeetingPanel({
  project,
  canEdit,
  onSaved,
}: {
  project: Project;
  canEdit: boolean;
  onSaved: (updated: Project) => void;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [title,    setTitle]    = useState(project.status_meeting_title ?? "Weekly status");
  const [dow,      setDow]      = useState<number | null>(project.status_meeting_dow);
  const [time,     setTime]     = useState(project.status_meeting_time_local ?? "");
  const [tz,       setTz]       = useState(project.status_meeting_timezone ?? "America/Los_Angeles");
  const [duration, setDuration] = useState<number | null>(project.status_meeting_duration_min ?? 30);
  const [joinUrl,  setJoinUrl]  = useState(project.status_meeting_join_url ?? "");
  const [saving,   setSaving]   = useState(false);

  const hasCadence = project.status_meeting_dow !== null && !!project.status_meeting_time_local;

  function reset() {
    setTitle(project.status_meeting_title ?? "Weekly status");
    setDow(project.status_meeting_dow);
    setTime(project.status_meeting_time_local ?? "");
    setTz(project.status_meeting_timezone ?? "America/Los_Angeles");
    setDuration(project.status_meeting_duration_min ?? 30);
    setJoinUrl(project.status_meeting_join_url ?? "");
  }

  async function save() {
    // Either fully set (dow + time + tz) or fully cleared. Mixed states are
    // confusing and produce a malformed "Next call" — coerce on save.
    const setting = dow !== null && time.trim().length > 0;
    if (!setting && (dow !== null || time.trim().length > 0)) {
      showToast("Pick both day and time, or clear both.", "error");
      return;
    }
    if (setting && !/^\d{2}:\d{2}$/.test(time)) {
      showToast("Time must be HH:MM (24-hour).", "error");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateProject(project.id, {
        status_meeting_title: setting ? (title.trim() || "Weekly status") : null,
        status_meeting_dow: setting ? dow : null,
        status_meeting_time_local: setting ? time : null,
        status_meeting_timezone: setting ? tz : null,
        status_meeting_duration_min: setting ? (duration ?? 30) : null,
        status_meeting_join_url: setting ? (joinUrl.trim() || null) : null,
      });
      showToast(setting ? "Status meeting cadence saved." : "Status meeting cadence cleared.", "success");
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function clearCadence() {
    if (!window.confirm("Clear the recurring status meeting cadence?")) return;
    setSaving(true);
    try {
      const updated = await api.updateProject(project.id, {
        status_meeting_title: null,
        status_meeting_dow: null,
        status_meeting_time_local: null,
        status_meeting_timezone: null,
        status_meeting_duration_min: null,
        status_meeting_join_url: null,
      });
      reset();
      showToast("Cadence cleared.", "success");
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to clear", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ms-section-card" style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>
          Recurring status meeting
        </div>
        {canEdit && !editing && (
          <button type="button" className="ms-btn-secondary" onClick={() => setEditing(true)} style={{ fontSize: 12 }}>
            {hasCadence ? "Edit" : "Set cadence"}
          </button>
        )}
      </div>

      {!editing && hasCadence && (
        <div style={{ fontSize: 13, color: "#1e293b" }}>
          <strong>{project.status_meeting_title || "Weekly status"}</strong>
          {" · "}
          {DOW_LABELS[project.status_meeting_dow ?? 0]}s
          {" · "}
          {formatTime(project.status_meeting_time_local ?? "")} {tzShort(project.status_meeting_timezone)}
          {project.status_meeting_duration_min ? ` · ${project.status_meeting_duration_min} min` : ""}
          {project.status_meeting_join_url && (
            <div style={{ marginTop: 4, fontSize: 12 }}>
              <a href={project.status_meeting_join_url} target="_blank" rel="noopener noreferrer" style={{ color: "#03395f" }}>
                Join link
              </a>
            </div>
          )}
        </div>
      )}

      {!editing && !hasCadence && (
        <div style={{ fontSize: 12, color: "#64748b" }}>
          No recurring meeting set. The Dashboard's "Next call" tile will only show milestone meetings (tasks with a join URL).
        </div>
      )}

      {editing && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
            <label style={fieldLabel}>
              Meeting title
              <input
                className="ms-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Weekly status"
                style={inputStyle}
              />
            </label>
            <label style={fieldLabel}>
              Duration (min)
              <input
                className="ms-input"
                type="number"
                min={5}
                max={480}
                value={duration ?? ""}
                onChange={(e) => setDuration(e.target.value ? +e.target.value : null)}
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 1fr", gap: 8 }}>
            <label style={fieldLabel}>
              Day
              <select
                className="ms-input"
                value={dow ?? ""}
                onChange={(e) => setDow(e.target.value === "" ? null : +e.target.value)}
                style={inputStyle}
              >
                <option value="">—</option>
                {DOW_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </label>
            <label style={fieldLabel}>
              Time (24h)
              <input
                className="ms-input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={fieldLabel}>
              Timezone
              <select
                className="ms-input"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                style={inputStyle}
              >
                {TZ_OPTIONS.map((opt) => <option key={opt.tz} value={opt.tz}>{opt.label}</option>)}
              </select>
            </label>
          </div>

          <label style={fieldLabel}>
            Zoom / Teams join URL
            <input
              className="ms-input"
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
              placeholder="https://us06web.zoom.us/j/..."
              style={inputStyle}
            />
          </label>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {hasCadence ? (
              <button type="button" onClick={clearCadence} disabled={saving} style={{ ...secondaryBtn, color: "#dc2626", borderColor: "#fecaca" }}>
                Clear cadence
              </button>
            ) : <span />}
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="ms-btn-secondary" onClick={() => { reset(); setEditing(false); }} disabled={saving} style={{ fontSize: 12 }}>
                Cancel
              </button>
              <button type="button" className="ms-btn-primary" onClick={save} disabled={saving} style={{ fontSize: 12 }}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: "0.04em",
};
const inputStyle: React.CSSProperties = { marginTop: 4, width: "100%", fontSize: 13, padding: "4px 8px" };
const secondaryBtn: React.CSSProperties = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, padding: "4px 10px",
  fontSize: 12, cursor: "pointer", color: "#64748b",
};

function formatTime(hhmm: string): string {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function tzShort(tz: string | null): string {
  if (!tz) return "";
  const opt = TZ_OPTIONS.find((o) => o.tz === tz);
  // e.g. "Pacific (Los Angeles)" → "Pacific"
  if (opt) return opt.label.replace(/\s+\(.*?\)$/, "");
  return tz;
}
