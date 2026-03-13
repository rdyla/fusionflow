import { useEffect, useState } from "react";
import { api, type ZoomDevice, type ZoomStatus } from "../../lib/api";

const ACCOUNT_TYPE_LABEL: Record<number, string> = {
  1: "Basic",
  2: "Pro",
  3: "Business",
  100: "Enterprise",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: "#f9f8f7",
      border: "1px solid #edebe9",
      borderRadius: 6,
      padding: "16px 20px",
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: "#605e5c", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#0078d4", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#605e5c", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function DeviceStatusDot({ status }: { status: string | null }) {
  const color = status === "online" ? "#107c10" : status === "offline" ? "#d13438" : "#605e5c";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ color, fontSize: 12 }}>{status ?? "unknown"}</span>
    </span>
  );
}

// ── Connect Form ──────────────────────────────────────────────────────────────

function ConnectForm({ projectId, onConnected }: { projectId: string; onConnected: () => void }) {
  const [form, setForm] = useState({ account_id: "", client_id: "", client_secret: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.zoomSaveCredentials(projectId, form);
      onConnected();
    } catch {
      setError("Failed to save credentials. Please check the values and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ms-section-card">
      <div className="ms-section-title" style={{ marginBottom: 4 }}>Connect Zoom Tenant</div>
      <p style={{ color: "#605e5c", fontSize: 13, marginBottom: 20, marginTop: 0 }}>
        Create a Server-to-Server OAuth app in the customer's Zoom account, then paste the credentials below.
      </p>

      <div style={{
        background: "#f3f2f1",
        borderRadius: 6,
        padding: "14px 16px",
        marginBottom: 20,
        fontSize: 12,
        color: "#605e5c",
        lineHeight: 1.7,
      }}>
        <strong style={{ color: "#323130" }}>Setup steps (in the customer's Zoom admin portal):</strong>
        <ol style={{ margin: "8px 0 0 0", paddingLeft: 18 }}>
          <li>Sign in using the <code style={{ background: "#e1dfdd", padding: "1px 4px", borderRadius: 3 }}>zm-{"{customer}"}@packetfusion.com</code> account</li>
          <li>Go to <strong>App Marketplace</strong> → <strong>Develop</strong> → <strong>Build App</strong></li>
          <li>Choose <strong>Server-to-Server OAuth</strong> and create the app</li>
          <li>Add scopes: <code style={{ background: "#e1dfdd", padding: "1px 4px", borderRadius: 3 }}>account:read:admin</code>, <code style={{ background: "#e1dfdd", padding: "1px 4px", borderRadius: 3 }}>user:read:admin</code>, <code style={{ background: "#e1dfdd", padding: "1px 4px", borderRadius: 3 }}>phone:read:admin</code></li>
          <li>Activate the app and copy the Account ID, Client ID, and Client Secret below</li>
        </ol>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
        <label className="ms-label">
          <span>Account ID</span>
          <input
            required
            className="ms-input"
            value={form.account_id}
            onChange={(e) => setForm({ ...form, account_id: e.target.value.trim() })}
            placeholder="e.g. abc123XYZ"
            autoComplete="off"
          />
        </label>
        <label className="ms-label">
          <span>Client ID</span>
          <input
            required
            className="ms-input"
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value.trim() })}
            placeholder="e.g. aBcDeFgHiJ1234"
            autoComplete="off"
          />
        </label>
        <label className="ms-label">
          <span>Client Secret</span>
          <input
            required
            type="password"
            className="ms-input"
            value={form.client_secret}
            onChange={(e) => setForm({ ...form, client_secret: e.target.value.trim() })}
            placeholder="••••••••••••••••"
            autoComplete="new-password"
          />
        </label>
        {error && <div style={{ color: "#d13438", fontSize: 13 }}>{error}</div>}
        <div>
          <button
            type="submit"
            className="ms-btn-primary"
            disabled={saving || !form.account_id || !form.client_id || !form.client_secret}
          >
            {saving ? "Connecting…" : "Connect Tenant"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Status Dashboard ──────────────────────────────────────────────────────────

function StatusDashboard({ status, onDisconnect }: { status: ZoomStatus; onDisconnect: () => void }) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    await onDisconnect();
    setDisconnecting(false);
    setConfirmDisconnect(false);
  }

  const phonePlanLabel = status.licenses?.phone_plans?.map((p) => p.type).join(", ") || "None";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#323130" }}>
            {status.account?.account_name ?? "Zoom Tenant"}
          </div>
          <div style={{ fontSize: 12, color: "#605e5c", marginTop: 2 }}>
            {ACCOUNT_TYPE_LABEL[status.account?.account_type ?? 0] ?? `Type ${status.account?.account_type}`} Plan
            &nbsp;·&nbsp; Account ID: {status.account?.id}
          </div>
        </div>
        <div>
          {confirmDisconnect ? (
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#605e5c" }}>Remove credentials?</span>
              <button
                className="ms-btn-danger"
                onClick={handleDisconnect}
                disabled={disconnecting}
                style={{ fontSize: 12, padding: "4px 12px" }}
              >
                {disconnecting ? "Removing…" : "Yes, disconnect"}
              </button>
              <button
                className="ms-btn-secondary"
                onClick={() => setConfirmDisconnect(false)}
                style={{ fontSize: 12, padding: "4px 12px" }}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              className="ms-btn-secondary"
              onClick={() => setConfirmDisconnect(true)}
              style={{ fontSize: 12 }}
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard
          label="Licensed Seats"
          value={status.licenses?.total_seats ?? "—"}
          sub={status.licenses?.plan_name}
        />
        <StatCard
          label="Active Users"
          value={status.users?.active ?? "—"}
          sub={`${status.users?.inactive ?? 0} inactive`}
        />
        <StatCard
          label="Phone Users"
          value={status.phone?.total_users ?? "—"}
          sub={phonePlanLabel !== "None" ? phonePlanLabel : undefined}
        />
        <StatCard
          label="Devices"
          value={status.devices_total ?? status.devices?.length ?? "—"}
          sub={
            (status.devices_total ?? 0) > (status.devices?.length ?? 0)
              ? `Showing first ${status.devices?.length}`
              : undefined
          }
        />
      </div>

      {/* Phone plans */}
      {status.licenses?.phone_plans && status.licenses.phone_plans.length > 0 && (
        <div className="ms-section-card" style={{ padding: "14px 18px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Zoom Phone Plans</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {status.licenses.phone_plans.map((plan, i) => (
              <span
                key={i}
                style={{
                  background: "#0078d41a",
                  color: "#0078d4",
                  border: "1px solid #0078d440",
                  borderRadius: 4,
                  padding: "3px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                {plan.type} · {plan.hosts} seats
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Devices table */}
      {status.devices && status.devices.length > 0 && (
        <div className="ms-section-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px 10px", fontWeight: 600, fontSize: 13 }}>
            Registered Devices
            {(status.devices_total ?? 0) > status.devices.length && (
              <span style={{ fontWeight: 400, color: "#605e5c", marginLeft: 8, fontSize: 12 }}>
                (showing {status.devices.length} of {status.devices_total})
              </span>
            )}
          </div>
          <table className="ms-table">
            <thead>
              <tr>
                <th>Display Name</th>
                <th>Model</th>
                <th>MAC Address</th>
                <th>Status</th>
                <th>Assigned To</th>
                <th>Extension</th>
              </tr>
            </thead>
            <tbody>
              {status.devices.map((device: ZoomDevice) => (
                <tr key={device.id}>
                  <td style={{ fontWeight: 500 }}>{device.display_name || "—"}</td>
                  <td style={{ color: "#605e5c" }}>{device.model || "—"}</td>
                  <td style={{ color: "#605e5c", fontFamily: "monospace", fontSize: 12 }}>{device.mac_address || "—"}</td>
                  <td><DeviceStatusDot status={device.status} /></td>
                  <td style={{ color: "#605e5c" }}>{device.assignee?.name ?? "Unassigned"}</td>
                  <td style={{ color: "#605e5c" }}>{device.assignee?.extension_number ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {status.devices?.length === 0 && (
        <div style={{ color: "#605e5c", fontSize: 13, padding: "8px 0" }}>No devices registered on this account.</div>
      )}
    </div>
  );
}

// ── Main ZoomTab ──────────────────────────────────────────────────────────────

export default function ZoomTab({ projectId }: { projectId: string }) {
  const [zoomStatus, setZoomStatus] = useState<ZoomStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.zoomStatus(projectId);
      setZoomStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Zoom data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [projectId]);

  async function handleDisconnect() {
    await api.zoomDeleteCredentials(projectId);
    setZoomStatus({ configured: false });
  }

  if (loading) return <div style={{ color: "#605e5c", padding: 16 }}>Loading Zoom tenant data…</div>;
  if (error) return (
    <div className="ms-section-card">
      <div style={{ color: "#d13438", marginBottom: 12 }}>Error: {error}</div>
      <button className="ms-btn-secondary" onClick={load}>Retry</button>
    </div>
  );

  if (!zoomStatus?.configured) {
    return <ConnectForm projectId={projectId} onConnected={load} />;
  }

  if (zoomStatus.error) {
    return (
      <div className="ms-section-card">
        <div style={{ fontWeight: 600, color: "#d13438", marginBottom: 8 }}>Zoom API Error</div>
        <div style={{
          background: "#fdf3f3",
          border: "1px solid #f1c0c0",
          borderRadius: 4,
          padding: "10px 14px",
          fontFamily: "monospace",
          fontSize: 12,
          color: "#a4262c",
          marginBottom: 16,
          wordBreak: "break-all",
        }}>
          {zoomStatus.error}
        </div>
        <p style={{ fontSize: 13, color: "#605e5c", margin: "0 0 14px" }}>
          This usually means the credentials are incorrect, the S2S OAuth app hasn't been activated,
          or the required scopes (<code>account:read:admin</code>, <code>user:read:admin</code>, <code>phone:read:admin</code>) haven't been added.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="ms-btn-primary" onClick={load}>Retry</button>
          <button className="ms-btn-secondary" onClick={handleDisconnect}>Clear Credentials</button>
        </div>
      </div>
    );
  }

  return <StatusDashboard status={zoomStatus} onDisconnect={handleDisconnect} />;
}
