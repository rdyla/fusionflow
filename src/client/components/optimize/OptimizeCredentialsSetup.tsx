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

  // Inline `code` chip used inside the instructions block. Kept as a small
  // helper so the styling stays consistent across the bullet list.
  const codeChip: React.CSSProperties = {
    background: "rgba(255,255,255,0.1)",
    padding: "1px 4px",
    borderRadius: 3,
    color: "#1e293b",
  };

  return (
    <form onSubmit={save} className="ms-card" style={{ padding: "20px 24px", marginBottom: 16, borderLeft: "3px solid #2563eb" }}>
      <div style={{ fontWeight: 600, color: "#334155", marginBottom: 4 }}>Connect Zoom</div>
      <p style={{ color: "#475569", fontSize: 13, margin: "0 0 16px" }}>
        Create a Server-to-Server OAuth app in the customer's Zoom account, then paste the credentials below.
      </p>
      <div style={{
        background: "rgba(0,0,0,0.02)", borderRadius: 6, padding: "14px 16px",
        marginBottom: 16, fontSize: 12, color: "#64748b", lineHeight: 1.7,
        border: "1px solid rgba(0,0,0,0.07)",
      }}>
        <strong style={{ color: "#1e293b" }}>Setup steps (in the customer's Zoom admin portal):</strong>
        <ol style={{ margin: "8px 0 0 0", paddingLeft: 18 }}>
          <li>Sign in using the <code style={codeChip}>zm-&#123;customer&#125;@packetfusion.com</code> account</li>
          <li>Go to <strong>App Marketplace</strong> → <strong>Develop</strong> → <strong>Build App</strong></li>
          <li>Choose <strong>Server-to-Server OAuth</strong> and create the app</li>
          <li>Add scopes: <code style={codeChip}>account:read:admin</code>, <code style={codeChip}>user:read:admin</code>, <code style={codeChip}>report:read:admin</code>, <code style={codeChip}>phone:read:admin</code>, <code style={codeChip}>contact_center:read:admin</code></li>
          <li>Activate the app and copy the Account ID, Client ID, and Client Secret below</li>
        </ol>
      </div>
      <div style={{ display: "grid", gap: 10, maxWidth: 480 }}>
        <label className="ms-label">
          <span>Account ID</span>
          <input
            required className="ms-input" value={form.account_id}
            onChange={(e) => setForm({ ...form, account_id: e.target.value.trim() })}
            placeholder="e.g. abc123XYZ" autoComplete="off"
          />
        </label>
        <label className="ms-label">
          <span>Client ID</span>
          <input
            required className="ms-input" value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value.trim() })}
            placeholder="e.g. aBcDeFgHiJ1234" autoComplete="off"
          />
        </label>
        <label className="ms-label">
          <span>Client Secret</span>
          <input
            required type="password" className="ms-input" value={form.client_secret}
            onChange={(e) => setForm({ ...form, client_secret: e.target.value.trim() })}
            placeholder="••••••••••••••••" autoComplete="new-password"
          />
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="submit"
            className="ms-btn-primary"
            disabled={saving || !form.account_id || !form.client_id || !form.client_secret}
          >
            {saving ? "Connecting…" : "Connect Tenant"}
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

  const codeChip: React.CSSProperties = {
    background: "rgba(255,255,255,0.1)",
    padding: "1px 4px",
    borderRadius: 3,
    color: "#1e293b",
  };

  return (
    <form onSubmit={save} className="ms-card" style={{ padding: "20px 24px", marginBottom: 16, borderLeft: "3px solid #ff7a00" }}>
      <div style={{ fontWeight: 600, color: "#334155", marginBottom: 4 }}>Connect RingCentral</div>
      <p style={{ color: "#475569", fontSize: 13, margin: "0 0 16px" }}>
        Create a Private App in the customer's RingCentral developer console to enable live account stats and utilization tracking.
      </p>
      <div style={{
        background: "rgba(0,0,0,0.02)", borderRadius: 6, padding: "14px 16px",
        marginBottom: 16, fontSize: 12, color: "#64748b", lineHeight: 1.7,
        border: "1px solid rgba(0,0,0,0.07)",
      }}>
        <strong style={{ color: "#1e293b" }}>Setup steps (in the customer's RingCentral admin portal):</strong>
        <ol style={{ margin: "8px 0 0 0", paddingLeft: 18 }}>
          <li>Sign in to <strong style={{ color: "#334155" }}>developers.ringcentral.com</strong> as the customer's admin</li>
          <li>Click <strong style={{ color: "#334155" }}>Create App</strong> → <strong style={{ color: "#334155" }}>REST API App</strong> → Auth type: <strong style={{ color: "#334155" }}>JWT auth flow</strong></li>
          <li>Under <strong style={{ color: "#334155" }}>OAuth Scopes</strong>, add: <code style={codeChip}>Read Account</code>, <code style={codeChip}>Read Call Log</code>, <code style={codeChip}>Analytics</code></li>
          <li>Go to <strong style={{ color: "#334155" }}>Credentials</strong> → generate a <strong style={{ color: "#334155" }}>JWT token</strong> for a super-admin service user</li>
          <li>Copy Client ID, Client Secret, and JWT Token and paste below</li>
        </ol>
      </div>
      <div style={{ display: "grid", gap: 10, maxWidth: 480 }}>
        <label className="ms-label">
          <span>Client ID</span>
          <input
            required className="ms-input" value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value.trim() })}
            placeholder="e.g. aBcDeFgHiJ1234" autoComplete="off"
          />
        </label>
        <label className="ms-label">
          <span>Client Secret</span>
          <input
            required type="password" className="ms-input" value={form.client_secret}
            onChange={(e) => setForm({ ...form, client_secret: e.target.value.trim() })}
            placeholder="••••••••••••••••" autoComplete="new-password"
          />
        </label>
        <label className="ms-label">
          <span>JWT Token</span>
          <input
            required type="password" className="ms-input" value={form.jwt_token}
            onChange={(e) => setForm({ ...form, jwt_token: e.target.value.trim() })}
            placeholder="••••••••••••••••" autoComplete="new-password"
          />
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="submit"
            className="ms-btn-primary"
            disabled={saving || !form.client_id || !form.client_secret || !form.jwt_token}
          >
            {saving ? "Connecting…" : "Connect Tenant"}
          </button>
        </div>
      </div>
    </form>
  );
}
