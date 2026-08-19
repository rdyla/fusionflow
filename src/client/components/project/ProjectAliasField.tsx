import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

/**
 * Inline editor for a project's customer distribution list alias
 * (`projects.zoom_email_alias`, e.g. zm-sanford@packetfusion.com).
 *
 * Lives in the Meeting Prep card heading rather than the project-meta modal:
 * this is the flow that consumes it — the welcome email sends to this address,
 * and the PM sets it while working through kickoff prep.
 *
 * Saving a CHANGE here prompts the helpdesk channel to create the mailbox, the
 * same trigger the welcome-email send fires (server side, in PATCH
 * /projects/:id — see notifyZoomEmailAliasForProject). That's stated on the
 * control, because firing a request into someone else's queue shouldn't be a
 * surprise. Clearing the field is treated as a correction and notifies nobody.
 */
export default function ProjectAliasField({
  projectId,
  value,
  canEdit,
  onSaved,
}: {
  projectId: string;
  value: string | null;
  canEdit: boolean;
  onSaved: (next: string | null) => void;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value ?? ""); }, [value]);

  async function save() {
    const next = draft.trim() || null;
    if (next === (value ?? null)) { setEditing(false); return; }
    setSaving(true);
    try {
      await api.updateProject(projectId, { zoom_email_alias: next });
      onSaved(next);
      setEditing(false);
      showToast(
        next
          ? "Distribution list saved — the helpdesk channel has been asked to create the mailbox."
          : "Distribution list cleared.",
        "success",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save distribution list", "error");
    } finally {
      setSaving(false);
    }
  }

  const label = <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Customer distribution list</span>;

  if (!canEdit) {
    return (
      <div style={{ textAlign: "right" }}>
        {label}
        <div style={{ fontSize: 13, color: value ? "#0b9aad" : "#94a3b8" }}>{value ?? "Not set"}</div>
      </div>
    );
  }

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {label}
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={value ? "Edit the customer distribution list" : "Set the customer distribution list"}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 600, color: value ? "#0b9aad" : "#94a3b8", textDecoration: "underline dotted" }}
        >
          {value ?? "Set alias"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, minWidth: 300 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {label}
        <input
          className="ms-input"
          autoFocus
          value={draft}
          placeholder="zm-customer@packetfusion.com"
          maxLength={255}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          }}
          style={{ fontSize: 13, width: 260 }}
        />
        <button className="ms-btn-primary" disabled={saving} onClick={() => void save()} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: "#64748b", textAlign: "right" }}>
        Saving a change asks the helpdesk channel to create this mailbox.
      </div>
    </div>
  );
}
