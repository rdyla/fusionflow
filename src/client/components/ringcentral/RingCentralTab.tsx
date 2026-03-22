import { useEffect, useState } from "react";
import { api, type RCStatus } from "../../lib/api";

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricTile({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "16px 20px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#1e293b", lineHeight: 1 }}>{value ?? "—"}</div>
    </div>
  );
}

// ── Connect Form ──────────────────────────────────────────────────────────────

function ConnectForm({ projectId, onConnected }: { projectId: string; onConnected: () => void }) {
  const [form, setForm] = useState({ client_id: "", client_secret: "", jwt_token: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.rcSaveCredentials(projectId, form);
      onConnected();
    } catch {
      setError("Failed to save credentials. Please check the values and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ms-section-card">
      <div className="ms-section-title" style={{ marginBottom: 4 }}>Connect RingCentral Tenant</div>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 20, marginTop: 0 }}>
        Create a Private App in the customer's RingCentral developer console to enable live account stats and utilization tracking.
      </p>
      <div style={{
        background: "rgba(0,0,0,0.02)", borderRadius: 6, padding: "14px 16px",
        marginBottom: 20, fontSize: 12, color: "#64748b", lineHeight: 1.7,
        border: "1px solid rgba(0,0,0,0.07)",
      }}>
        <strong style={{ color: "#1e293b" }}>Setup steps (in the customer's RingCentral admin portal):</strong>
        <ol style={{ margin: "8px 0 0 0", paddingLeft: 18 }}>
          <li>Sign in to <strong style={{ color: "#334155" }}>developers.ringcentral.com</strong> as the customer's admin</li>
          <li>Click <strong style={{ color: "#334155" }}>Create App</strong> → <strong style={{ color: "#334155" }}>REST API App</strong> → Auth type: <strong style={{ color: "#334155" }}>JWT auth flow</strong></li>
          <li>Under <strong style={{ color: "#334155" }}>OAuth Scopes</strong>, add: <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: 3, color: "#1e293b" }}>ReadAccounts</code>, <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: 3, color: "#1e293b" }}>ReadCallLog</code>, <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: 3, color: "#1e293b" }}>ReadReports</code>, <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: 3, color: "#1e293b" }}>Analytics</code></li>
          <li>Go to <strong style={{ color: "#334155" }}>Credentials</strong> → generate a <strong style={{ color: "#334155" }}>JWT token</strong> for a super-admin service user</li>
          <li>Copy Client ID, Client Secret, and JWT Token and paste below</li>
        </ol>
      </div>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
        <label className="ms-label">
          <span>Client ID</span>
          <input required className="ms-input" value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value.trim() })}
            placeholder="e.g. aBcDeFgHiJ1234" autoComplete="off" />
        </label>
        <label className="ms-label">
          <span>Client Secret</span>
          <input required type="password" className="ms-input" value={form.client_secret}
            onChange={(e) => setForm({ ...form, client_secret: e.target.value.trim() })}
            placeholder="••••••••••••••••" autoComplete="new-password" />
        </label>
        <label className="ms-label">
          <span>JWT Token</span>
          <input required type="password" className="ms-input" value={form.jwt_token}
            onChange={(e) => setForm({ ...form, jwt_token: e.target.value.trim() })}
            placeholder="••••••••••••••••" autoComplete="new-password" />
        </label>
        {error && <div style={{ color: "#d13438", fontSize: 13 }}>{error}</div>}
        <div>
          <button type="submit" className="ms-btn-primary"
            disabled={saving || !form.client_id || !form.client_secret || !form.jwt_token}>
            {saving ? "Connecting…" : "Connect Tenant"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Status Dashboard ──────────────────────────────────────────────────────────

function StatusDashboard({ status, onDisconnect }: { status: RCStatus; onDisconnect: () => void }) {
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    await onDisconnect();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1e293b" }}>
            {status.account?.name ?? "RingCentral Tenant"}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {status.account?.brand && <>{status.account.brand} &nbsp;·&nbsp; </>}
            {status.account?.main_number ?? "No main number"}
          </div>
        </div>
        <div>
          {confirmDisconnect ? (
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#64748b" }}>Remove credentials?</span>
              <button className="ms-btn-danger" onClick={handleDisconnect} disabled={disconnecting}
                style={{ fontSize: 12, padding: "4px 12px" }}>
                {disconnecting ? "Removing…" : "Yes, disconnect"}
              </button>
              <button className="ms-btn-secondary" onClick={() => setConfirmDisconnect(false)}
                style={{ fontSize: 12, padding: "4px 12px" }}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="ms-btn-secondary" onClick={() => setConfirmDisconnect(true)}
              style={{ fontSize: 12 }}>
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Warnings */}
      {status.warnings && status.warnings.length > 0 && (
        <div style={{ background: "#fff8f0", border: "1px solid #ff8c0040", borderRadius: 6, padding: "12px 16px" }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: "#ff8c00", marginBottom: 6 }}>Partial data — some API calls failed</div>
          {status.warnings.map((w, i) => (
            <div key={i} style={{ fontFamily: "monospace", fontSize: 11, color: "#7a5000", marginBottom: 2 }}>{w}</div>
          ))}
        </div>
      )}

      {/* Account Overview */}
      <div className="ms-section-card">
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Account Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <MetricTile label="Total Extensions" value={status.total_extensions} />
          <MetricTile label="Devices" value={status.devices} />
        </div>
      </div>

      {/* Phone System */}
      <div className="ms-section-card">
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Phone System</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <MetricTile label="Call Queues" value={status.call_queues} />
          <MetricTile label="IVR Menus (Auto Receptionists)" value={status.ivr_menus} />
        </div>
      </div>

      {/* Note card */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
        padding: "14px 18px", fontSize: 13, color: "#64748b", lineHeight: 1.6,
      }}>
        <strong style={{ color: "#475569" }}>Note:</strong> RingCentral Engage (Contact Center) metrics require separate Engage API credentials — coming soon.
      </div>
    </div>
  );
}

// ── Main RingCentralTab ───────────────────────────────────────────────────────

export default function RingCentralTab({ projectId }: { projectId: string }) {
  const [rcStatus, setRcStatus] = useState<RCStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.rcStatus(projectId);
      setRcStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load RingCentral data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [projectId]);

  async function handleDisconnect() {
    await api.rcDeleteCredentials(projectId);
    setRcStatus({ configured: false });
  }

  if (loading) return <div style={{ color: "#64748b", padding: 16 }}>Loading RingCentral tenant data…</div>;
  if (error) return (
    <div className="ms-section-card">
      <div style={{ color: "#d13438", marginBottom: 12 }}>Error: {error}</div>
      <button className="ms-btn-secondary" onClick={load}>Retry</button>
    </div>
  );

  if (!rcStatus?.configured) return <ConnectForm projectId={projectId} onConnected={load} />;

  if (rcStatus.error) {
    return (
      <div className="ms-section-card">
        <div style={{ fontWeight: 600, color: "#d13438", marginBottom: 8 }}>RingCentral API Error</div>
        <div style={{
          background: "#fdf3f3", border: "1px solid #f1c0c0", borderRadius: 4,
          padding: "10px 14px", fontFamily: "monospace", fontSize: 12,
          color: "#a4262c", marginBottom: 16, wordBreak: "break-all",
        }}>
          {rcStatus.error}
        </div>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px" }}>
          Check that the JWT token is valid and the app has the required scopes.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="ms-btn-primary" onClick={load}>Retry</button>
          <button className="ms-btn-secondary" onClick={handleDisconnect}>Clear Credentials</button>
        </div>
      </div>
    );
  }

  return <StatusDashboard status={rcStatus} onDisconnect={handleDisconnect} />;
}
