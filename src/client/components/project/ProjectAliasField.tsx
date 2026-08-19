import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

type AliasStatus = "loading" | "active" | "not_found" | "unknown" | "not_set";

/**
 * Inline editor + directory status for a project's customer distribution list
 * (`projects.zoom_email_alias`, e.g. zm-sanford@packetfusion.com).
 *
 * Lives in the Meeting Prep card heading rather than the project-meta modal:
 * this is the flow that consumes it — the welcome email sends to this address,
 * and the PM sets it while working through kickoff prep.
 *
 * Saving a CHANGE prompts the helpdesk channel to create the mailbox, the same
 * trigger the welcome-email send fires. That's stated on the control, because
 * firing a request into someone else's queue shouldn't be a surprise. Clearing
 * the field is a correction and notifies nobody.
 *
 * The badge answers "has it actually been created?" — checked on load and cached
 * server-side in KV once confirmed, so it costs a Microsoft round-trip only
 * while the mailbox is still outstanding.
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
  const [status, setStatus] = useState<AliasStatus>("loading");
  const [checking, setChecking] = useState(false);

  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const loadStatus = useCallback(async (refresh = false) => {
    if (!value) { setStatus("not_set"); return; }
    if (refresh) setChecking(true);
    try {
      const r = await api.projectAliasStatus(projectId, refresh);
      setStatus(r.status);
    } catch {
      // Never claim "not created" because our own check failed.
      setStatus("unknown");
    } finally {
      setChecking(false);
    }
  }, [projectId, value]);

  useEffect(() => { void loadStatus(false); }, [loadStatus]);

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
      // The server drops the cached status on change; pick the new one up.
      void loadStatus(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save distribution list", "error");
    } finally {
      setSaving(false);
    }
  }

  const label = (
    <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
      Customer distribution list
    </span>
  );

  // "not_found" is worded as awaiting-creation rather than nonexistent on
  // purpose: Graph /groups cannot see classic Exchange distribution groups, so a
  // miss means "not visible to us", not proof the mailbox is absent.
  const STATUS_UI: Record<Exclude<AliasStatus, "not_set">, { text: string; bg: string; fg: string; tip: string }> = {
    loading:   { text: "checking…",          bg: "#f1f5f9", fg: "#64748b", tip: "Looking this address up in the directory." },
    active:    { text: "✓ active",           bg: "#dcfce7", fg: "#166534", tip: "A mail-enabled group with this address exists in the directory." },
    not_found: { text: "awaiting creation",  bg: "#fef3c7", fg: "#92400e", tip: "Not visible in the directory yet. Classic Exchange distribution lists can't be seen this way, so it may exist even if this says otherwise." },
    unknown:   { text: "status unknown",     bg: "#f1f5f9", fg: "#64748b", tip: "Couldn't check with Microsoft just now — this does NOT mean the mailbox is missing." },
  };

  const badge = !value || status === "not_set" ? null : (() => {
    const s = STATUS_UI[status];
    return (
      <span
        title={s.tip}
        style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", background: s.bg, color: s.fg, borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" }}
      >
        {s.text}
      </span>
    );
  })();

  const recheck = value && status !== "loading" ? (
    <button
      type="button"
      disabled={checking}
      onClick={() => void loadStatus(true)}
      title="Re-check the directory now"
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, color: "#0b9aad" }}
    >
      {checking ? "checking…" : "re-check"}
    </button>
  ) : null;

  if (!canEdit) {
    return (
      <div style={{ textAlign: "right" }}>
        {label}
        <div style={{ fontSize: 13, color: value ? "#0b9aad" : "#94a3b8", display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
          {value ?? "Not set"}{badge}
        </div>
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
        {badge}
        {recheck}
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
