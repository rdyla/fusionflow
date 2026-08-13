import { useEffect, useRef, useState } from "react";
import { api, type MyProfile, type MyTemplate } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

const ROLE_LABELS: Record<string, string> = {
  admin:       "Admin",
  executive:   "Executive",
  pm:          "Project Manager",
  pf_ae:       "Account Executive",
  pf_sa:       "Solution Architect",
  pf_csm:      "Customer Success Manager",
  pf_engineer: "Implementation Engineer",
  partner_ae:  "Partner AE",
  client:      "Client",
};

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export default function ProfilePage() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [schedulerUrl, setSchedulerUrl] = useState("");
  const [emailNotifications, setEmailNotifications] = useState<"all" | "important" | "off">("all");

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getMyProfile()
      .then((p) => {
        setProfile(p);
        setName(p.name ?? "");
        setTitle(p.title ?? "");
        setPhone(p.phone ?? "");
        setSchedulerUrl(p.scheduler_url ?? "");
        setEmailNotifications(p.email_notifications ?? "all");
      })
      .catch((err) => showToast(err instanceof Error ? err.message : "Failed to load profile", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      await api.updateMyProfile({
        name: name.trim() || undefined,
        title: title.trim() ? title.trim() : null,
        phone: phone.trim() ? phone.trim() : null,
        scheduler_url: schedulerUrl.trim() ? schedulerUrl.trim() : null,
        email_notifications: emailNotifications,
      });
      showToast("Profile saved", "success");
      const fresh = await api.getMyProfile();
      setProfile(fresh);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save profile", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(file: File) {
    if (!profile) return;
    setUploading(true);
    try {
      await api.uploadMyAvatar(file);
      showToast("Avatar updated", "success");
      const fresh = await api.getMyProfile();
      setProfile(fresh);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to upload avatar", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleAvatarReset() {
    if (!profile) return;
    if (!confirm("Remove your uploaded photo? Your Zoom profile photo will be used instead (when available).")) return;
    setUploading(true);
    try {
      await api.deleteMyAvatar();
      showToast("Avatar removed", "success");
      const fresh = await api.getMyProfile();
      setProfile(fresh);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to remove avatar", "error");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px", color: "#64748b" }}>
        Loading profile…
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px", color: "#dc2626" }}>
        Profile unavailable.
      </div>
    );
  }

  const abbr = initials(profile.name, profile.email);
  const roleLabel = ROLE_LABELS[profile.role] ?? profile.role;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", margin: 0 }}>My Profile</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
          Update how you appear across CloudConnect. Changes apply on your next request.
        </p>
      </div>

      {/* Avatar card */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Photo
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Avatar"
              style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "2px solid #e2e8f0" }}
            />
          ) : (
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "linear-gradient(135deg, #63c1ea, #17c662)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'avenir-lt-pro', sans-serif", fontSize: 22, fontWeight: 700,
              color: "#fff", letterSpacing: "0.04em",
            }}>
              {abbr}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="ms-btn-secondary"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ fontSize: 12 }}
              >
                {uploading ? "Uploading…" : profile.has_custom_avatar ? "Replace Photo" : "Upload Photo"}
              </button>
              {profile.has_custom_avatar && (
                <button
                  type="button"
                  className="ms-btn-secondary"
                  onClick={handleAvatarReset}
                  disabled={uploading}
                  style={{ fontSize: 12 }}
                >
                  Remove
                </button>
              )}
            </div>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "8px 0 0" }}>
              JPG, PNG, WebP, or GIF · up to 5 MB.
              {!profile.has_custom_avatar && " Defaults to your Zoom profile photo when available."}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAvatarUpload(f);
              }}
            />
          </div>
        </div>
      </div>

      {/* Identity card (read-only) */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Account
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Email</div>
            <div style={{ fontSize: 13, color: "#1e293b" }}>{profile.email}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Role</div>
            <div style={{ fontSize: 13, color: "#1e293b" }}>{roleLabel}</div>
          </div>
          {profile.organization_name && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Organization</div>
              <div style={{ fontSize: 13, color: "#1e293b" }}>{profile.organization_name}</div>
            </div>
          )}
        </div>
      </div>

      {/* Editable fields */}
      <form onSubmit={handleSave} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Contact details
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Field label="Display name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              className="ms-input"
              style={{ width: "100%" }}
            />
          </Field>
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              placeholder="e.g. Solutions Architect"
              className="ms-input"
              style={{ width: "100%" }}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={64}
              placeholder="e.g. +1 (415) 555-0140"
              className="ms-input"
              style={{ width: "100%" }}
            />
          </Field>
          <Field label="Scheduler link" hint="Zoom Scheduler, RingCentral, Calendly, etc.">
            <input
              type="url"
              value={schedulerUrl}
              onChange={(e) => setSchedulerUrl(e.target.value)}
              maxLength={2000}
              placeholder="https://"
              className="ms-input"
              style={{ width: "100%" }}
            />
          </Field>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Field label="Email notifications" hint="Important only skips routine FYI emails (e.g. every task edit). Off stops project notification emails; account & login emails still send.">
            <select
              value={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.value as "all" | "important" | "off")}
              className="ms-input"
              style={{ width: "100%" }}
            >
              <option value="all">All — every notification</option>
              <option value="important">Important only</option>
              <option value="off">Off</option>
            </select>
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="ms-btn-primary" disabled={saving} style={{ fontSize: 13 }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>

      {/* Assets — private templates the user saved off their own projects.
          Clients have no project plans to template, so the card is hidden for
          them rather than shown permanently empty. */}
      {profile.role !== "client" && <MyTemplatesCard />}
    </div>
  );
}

/**
 * Assets: the caller's private task-list templates, saved from a project's plan
 * via "Save as template". Rename and delete only — to change a template's task
 * list you apply it, tune the project, and save a fresh one, so there's no
 * editor to maintain here.
 */
function MyTemplatesCard() {
  const { showToast } = useToast();
  const [items, setItems] = useState<MyTemplate[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api.myTemplates()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  async function saveRename(t: MyTemplate) {
    const next = draftName.trim();
    if (!next || next === t.name) { setEditingId(null); return; }
    setBusyId(t.id);
    try {
      const updated = await api.updateMyTemplate(t.id, { name: next });
      setItems((prev) => (prev ?? []).map((x) => (x.id === t.id ? { ...x, name: updated.name } : x)));
      setEditingId(null);
      showToast("Template renamed.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Rename failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(t: MyTemplate) {
    if (!confirm(`Delete "${t.name}"? This removes the template only — projects you already applied it to are unaffected.`)) return;
    setBusyId(t.id);
    try {
      await api.deleteMyTemplate(t.id);
      setItems((prev) => (prev ?? []).filter((x) => x.id !== t.id));
      showToast("Template deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, marginTop: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        My templates
      </h2>
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14 }}>
        Private to you. Save one from any project via <strong>Save as template</strong> on its Plan tab, then apply it to future projects.
      </div>

      {items === null ? (
        <div style={{ fontSize: 13, color: "#64748b" }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13, color: "#64748b" }}>You haven't saved any templates yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingId === t.id ? (
                  <input
                    className="ms-input"
                    autoFocus
                    value={draftName}
                    maxLength={200}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={() => void saveRename(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveRename(t);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    style={{ width: "100%", fontSize: 13 }}
                  />
                ) : (
                  <button
                    type="button"
                    title="Click to rename"
                    onClick={() => { setEditingId(t.id); setDraftName(t.name); }}
                    style={{ background: "none", border: "none", padding: 0, cursor: "text", fontSize: 13, fontWeight: 600, color: "#1e293b", textAlign: "left" }}
                  >
                    {t.name}
                  </button>
                )}
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  {t.stage_count} stage{t.stage_count === 1 ? "" : "s"} · {t.task_count} task{t.task_count === 1 ? "" : "s"}
                  {t.created_at ? ` · saved ${new Date(t.created_at.replace(" ", "T") + "Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={busyId === t.id}
                onClick={() => void remove(t)}
                style={{ background: "none", border: "1px solid #fecaca", color: "#d13438", borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {busyId === t.id ? "…" : "Delete"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{hint}</div>
      )}
    </label>
  );
}
