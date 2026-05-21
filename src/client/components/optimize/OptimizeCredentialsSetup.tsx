/**
 * Inline credential setup for the Optimize Utilization tab.
 *
 * Direct-enrolled Optimize accounts get a shell project row at creation,
 * but the CSM who created the account often never visits the project
 * detail page — so the Zoom / RingCentral credential forms living there
 * are out of reach. This component surfaces the same forms inline on the
 * Utilization tab when creds aren't yet configured.
 *
 * Two states:
 *   1. account.vendor is unset → vendor picker (Zoom or RingCentral).
 *      Selecting one PATCHes the project to set vendor, then renders the
 *      form for that vendor.
 *   2. account.vendor is set + creds not configured → inline credentials
 *      form for that vendor. Save calls the existing zoom/rc save endpoints
 *      (same KV write the project detail page does), then fires onUpdated
 *      so the parent can refetch + flip the "configured" state.
 *
 * Once configured, the parent's existing "Credentials connected — Sync Now"
 * card takes over — this component returns null in that state.
 */

import { useState } from "react";
import { api, type OptimizeAccount } from "../../lib/api";
import { canonicalizeVendor } from "../../../shared/vendors";
import { useToast } from "../ui/ToastProvider";

type Props = {
  account: OptimizeAccount;
  zoomConfigured: boolean;
  rcConfigured: boolean;
  /** Fires after a successful vendor change or credential save so the parent
   *  can refetch the account + configured states. */
  onUpdated: () => Promise<void> | void;
};

export default function OptimizeCredentialsSetup({ account, zoomConfigured, rcConfigured, onUpdated }: Props) {
  const { showToast } = useToast();
  const canonicalVendor = canonicalizeVendor(account.vendor);
  const platform: "zoom" | "ringcentral" | null =
    canonicalVendor === "ringcentral" ? "ringcentral" :
    canonicalVendor === "zoom"        ? "zoom"        :
    null;
  const configured = platform === "ringcentral" ? rcConfigured : platform === "zoom" ? zoomConfigured : false;

  // Once a vendor is set and its creds are configured, this component has
  // nothing to do — the parent's existing top-card "Sync Now" UI takes over.
  if (platform && configured) return null;

  // ── State 1: no vendor yet ────────────────────────────────────────────
  if (!platform) {
    return <VendorPicker account={account} onUpdated={onUpdated} showToast={showToast} />;
  }

  // ── State 2: vendor known, creds missing ──────────────────────────────
  return platform === "zoom"
    ? <ZoomCredsForm projectId={account.project_id} onUpdated={onUpdated} showToast={showToast} />
    : <RingCentralCredsForm projectId={account.project_id} onUpdated={onUpdated} showToast={showToast} />;
}

// ── Vendor picker ──────────────────────────────────────────────────────────

function VendorPicker({
  account, onUpdated, showToast,
}: {
  account: OptimizeAccount;
  onUpdated: () => Promise<void> | void;
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [saving, setSaving] = useState<"zoom" | "ringcentral" | null>(null);

  async function pick(vendor: "zoom" | "ringcentral") {
    setSaving(vendor);
    try {
      await api.updateProject(account.project_id, { vendor });
      await onUpdated();
      showToast(`Platform set to ${vendor === "zoom" ? "Zoom" : "RingCentral"}.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to set platform", "error");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="ms-card" style={{ padding: "20px 24px", marginBottom: 16, borderLeft: "3px solid #0b9aad" }}>
      <div style={{ fontWeight: 600, color: "#334155", marginBottom: 4 }}>Choose a platform</div>
      <p style={{ color: "#475569", fontSize: 13, margin: "0 0 14px" }}>
        This Optimize account isn't tied to a specific platform yet. Pick the platform whose API utilization you want to capture.
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="ms-btn-secondary"
          onClick={() => pick("zoom")}
          disabled={saving !== null}
          style={{ fontSize: 13, paddingLeft: 18, paddingRight: 18 }}
        >
          {saving === "zoom" ? "Setting…" : "Zoom"}
        </button>
        <button
          className="ms-btn-secondary"
          onClick={() => pick("ringcentral")}
          disabled={saving !== null}
          style={{ fontSize: 13, paddingLeft: 18, paddingRight: 18 }}
        >
          {saving === "ringcentral" ? "Setting…" : "RingCentral"}
        </button>
      </div>
    </div>
  );
}

// ── Zoom credentials form ──────────────────────────────────────────────────

function ZoomCredsForm({
  projectId, onUpdated, showToast,
}: {
  projectId: string;
  onUpdated: () => Promise<void> | void;
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [form, setForm] = useState({ account_id: "", client_id: "", client_secret: "" });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.zoomSaveCredentials(projectId, form);
      showToast("Zoom credentials saved — click Sync Now to pull the first snapshot.", "success");
      await onUpdated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save credentials", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="ms-card" style={{ padding: "20px 24px", marginBottom: 16, borderLeft: "3px solid #2563eb" }}>
      <div style={{ fontWeight: 600, color: "#334155", marginBottom: 4 }}>Connect Zoom</div>
      <p style={{ color: "#475569", fontSize: 13, margin: "0 0 14px" }}>
        Paste the Server-to-Server OAuth credentials from your Zoom Marketplace app. They live in encrypted KV, scoped to this account only.
      </p>
      <div style={{ display: "grid", gap: 10, maxWidth: 480 }}>
        <label className="ms-label">
          <span>Account ID</span>
          <input
            required className="ms-input" value={form.account_id}
            onChange={(e) => setForm({ ...form, account_id: e.target.value.trim() })}
            autoComplete="off"
          />
        </label>
        <label className="ms-label">
          <span>Client ID</span>
          <input
            required className="ms-input" value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value.trim() })}
            autoComplete="off"
          />
        </label>
        <label className="ms-label">
          <span>Client Secret</span>
          <input
            required type="password" className="ms-input" value={form.client_secret}
            onChange={(e) => setForm({ ...form, client_secret: e.target.value.trim() })}
            autoComplete="off"
          />
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="submit"
            className="ms-btn-primary"
            disabled={saving || !form.account_id || !form.client_id || !form.client_secret}
          >
            {saving ? "Saving…" : "Save credentials"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── RingCentral credentials form ───────────────────────────────────────────

function RingCentralCredsForm({
  projectId, onUpdated, showToast,
}: {
  projectId: string;
  onUpdated: () => Promise<void> | void;
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [form, setForm] = useState({ client_id: "", client_secret: "", jwt_token: "" });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.rcSaveCredentials(projectId, form);
      showToast("RingCentral credentials saved — click Sync Now to pull the first snapshot.", "success");
      await onUpdated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save credentials", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="ms-card" style={{ padding: "20px 24px", marginBottom: 16, borderLeft: "3px solid #ff7a00" }}>
      <div style={{ fontWeight: 600, color: "#334155", marginBottom: 4 }}>Connect RingCentral</div>
      <p style={{ color: "#475569", fontSize: 13, margin: "0 0 14px" }}>
        Paste the JWT-bearer credentials from your RingCentral developer app. They live in encrypted KV, scoped to this account only.
      </p>
      <div style={{ display: "grid", gap: 10, maxWidth: 480 }}>
        <label className="ms-label">
          <span>Client ID</span>
          <input
            required className="ms-input" value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value.trim() })}
            autoComplete="off"
          />
        </label>
        <label className="ms-label">
          <span>Client Secret</span>
          <input
            required type="password" className="ms-input" value={form.client_secret}
            onChange={(e) => setForm({ ...form, client_secret: e.target.value.trim() })}
            autoComplete="off"
          />
        </label>
        <label className="ms-label">
          <span>JWT Token</span>
          <input
            required type="password" className="ms-input" value={form.jwt_token}
            onChange={(e) => setForm({ ...form, jwt_token: e.target.value.trim() })}
            autoComplete="off"
          />
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="submit"
            className="ms-btn-primary"
            disabled={saving || !form.client_id || !form.client_secret || !form.jwt_token}
          >
            {saving ? "Saving…" : "Save credentials"}
          </button>
        </div>
      </div>
    </form>
  );
}
