import { useEffect, useState } from "react";
import { api, type ZoomCallingPlan, type ZoomDevice, type ZoomStatus } from "../../lib/api";

// Human-readable labels for plan section keys returned by Zoom
const PLAN_SECTION_LABELS: Record<string, string> = {
  plan_base: "Base Plan",
  plan_zoom_phone: "Zoom Phone",
  plan_audio: "Audio Conferencing",
  plan_recording: "Cloud Recording",
  plan_large_meeting: "Large Meeting",
  plan_webinar: "Webinar",
  plan_room: "Zoom Rooms",
  plan_rooms_connector: "Room Connector",
  plan_zoom_events: "Zoom Events",
  plan_contact_center: "Contact Center",
  plan_zoom_virtual_agent: "Virtual Agent",
  plan_zoom_revenue_accelerator: "Revenue Accelerator",
  plan_zoom_iq: "Zoom IQ / Revenue Accelerator",
  plan_whiteboard: "Whiteboard",
  plan_translator: "Language Interpretation",
};

// Plan type code → friendly name (best-effort; falls back to formatted code)
const PLAN_TYPE_LABELS: Record<string, string> = {
  // Base
  zoom_one_basic: "Zoom One Basic",
  zoom_one_pro: "Zoom One Pro",
  zoom_one_business: "Zoom One Business",
  zoom_one_business_plus: "Zoom One Business Plus",
  zoom_one_enterprise: "Zoom One Enterprise",
  zoom_one_enterprise_plus: "Zoom One Enterprise Plus",
  // Phone
  zoom_phone_us_canada_pro: "US & Canada Pro",
  zoom_phone_us_canada_metered: "US & Canada Metered",
  zoom_phone_global_select: "Global Select",
  zoom_phone_payg: "Pay As You Go",
  zoom_phone_us_canada_unlimited: "US & Canada Unlimited",
  // Contact Center
  zoom_contact_center_standard: "Standard",
  zoom_contact_center_premium: "Premium",
  zoom_contact_center_elite: "Elite",
};

const ACCOUNT_TYPE_LABEL: Record<number, string> = {
  1: "Basic", 2: "Pro", 3: "Business", 100: "Enterprise",
};

type PlanItem = { type: string; seats: string | number | null };
type PlanSection = { key: string; label: string; items: PlanItem[] };

function formatTypeCode(code: string): string {
  return PLAN_TYPE_LABELS[code.toLowerCase()] ??
    code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parsePlanValue(value: unknown): PlanItem[] {
  if (!value || value === null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => parsePlanValue(v));
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (!v.type) return [];
    const seats = v.hosts ?? v.storage ?? null;
    return [{ type: String(v.type), seats: seats != null ? Number(seats) : null }];
  }
  return [];
}

function parsePlans(plans: Record<string, unknown>): PlanSection[] {
  const sections: PlanSection[] = [];
  // Put base plan first, then sort the rest alphabetically
  const keys = Object.keys(plans).sort((a, b) => {
    if (a === "plan_base") return -1;
    if (b === "plan_base") return 1;
    return a.localeCompare(b);
  });
  for (const key of keys) {
    const items = parsePlanValue(plans[key]);
    if (items.length === 0) continue;
    sections.push({
      key,
      label: PLAN_SECTION_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      items,
    });
  }
  return sections;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function pct(num: number, denom: number): number | null {
  return denom > 0 ? Math.round((num / denom) * 100) : null;
}

function AdoptionTile({ label, active, total }: { label: string; active: number | null | undefined; total: number | null | undefined }) {
  const rate = active != null && total != null ? pct(active, total) : null;
  const color = rate === null ? "#94a3b8" : rate >= 70 ? "#16a34a" : rate >= 40 ? "#d97706" : "#dc2626";
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "16px 20px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{rate !== null ? `${rate}%` : "—"}</div>
      {active != null && total != null && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{active.toLocaleString()} of {total.toLocaleString()} users active</div>
      )}
    </div>
  );
}

function CallingPlanList({ plans }: { plans: ZoomCallingPlan[] | null | undefined }) {
  if (!plans || plans.length === 0) return null;
  return (
    <div className="ms-section-card">
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Zoom Phone Calling Plans</div>
      <div style={{ display: "grid", gap: 12 }}>
        {plans.map((plan, i) => {
          const usedPct = plan.subscribed > 0 ? Math.min(100, Math.round((plan.assigned / plan.subscribed) * 100)) : 0;
          const barColor = usedPct >= 90 ? "#16a34a" : usedPct <= 60 ? "#d97706" : "#3b82f6";
          return (
            <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", marginBottom: 8 }}>{plan.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: "#1e293b", lineHeight: 1 }}>{plan.assigned}</span>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>/ {plan.subscribed} subscribed &nbsp;·&nbsp; {plan.available} available</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: barColor, marginLeft: 4 }}>({usedPct}% utilized)</span>
              </div>
              <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${usedPct}%`, background: barColor }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "16px 20px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#1e293b", lineHeight: 1 }}>{value ?? "—"}</div>
    </div>
  );
}

function UsageBar({ assigned, purchased }: { assigned: number | null | undefined; purchased: number | null | undefined }) {
  if (!purchased || !assigned) return null;
  const pct = Math.min(100, Math.round((assigned / purchased) * 100));
  const color = pct > 90 ? "#d13438" : pct >= 70 ? "#ff8c00" : "#059669";
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
        <span>{assigned} assigned</span>
        <span>{purchased} purchased ({pct}%)</span>
      </div>
      <div style={{ height: 8, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function PlanBadge({ item }: { item: PlanItem }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      background: "rgba(0,0,0,0.02)",
      border: "1px solid rgba(0,0,0,0.07)",
      borderRadius: 4,
      padding: "8px 12px",
      gap: 16,
    }}>
      <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 500 }}>
        {formatTypeCode(item.type)}
      </span>
      {item.seats != null && (
        <span style={{
          fontSize: 12,
          color: "#63c1ea",
          background: "rgba(99,193,234,0.12)",
          border: "1px solid rgba(99,193,234,0.25)",
          borderRadius: 3,
          padding: "2px 8px",
          whiteSpace: "nowrap",
          fontWeight: 600,
        }}>
          {item.seats} seats
        </span>
      )}
    </div>
  );
}

function SubscriptionList({ plans }: { plans: Record<string, unknown> }) {
  const sections = parsePlans(plans);

  if (sections.length === 0) {
    return <div style={{ color: "#64748b", fontSize: 13 }}>No subscription data available.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {sections.map((section) => (
        <div key={section.key}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#64748b",
            marginBottom: 6,
          }}>
            {section.label}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {section.items.map((item, i) => <PlanBadge key={i} item={item} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DeviceStatusDot({ status }: { status: string | null }) {
  const color = status === "online" ? "#059669" : status === "offline" ? "#d13438" : "#94a3b8";
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
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 20, marginTop: 0 }}>
        Create a Server-to-Server OAuth app in the customer's Zoom account, then paste the credentials below.
      </p>
      <div style={{
        background: "rgba(0,0,0,0.02)", borderRadius: 6, padding: "14px 16px",
        marginBottom: 20, fontSize: 12, color: "#64748b", lineHeight: 1.7,
        border: "1px solid rgba(0,0,0,0.07)",
      }}>
        <strong style={{ color: "#1e293b" }}>Setup steps (in the customer's Zoom admin portal):</strong>
        <ol style={{ margin: "8px 0 0 0", paddingLeft: 18 }}>
          <li>Sign in using the <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: 3, color: "#1e293b" }}>zm-&#123;customer&#125;@packetfusion.com</code> account</li>
          <li>Go to <strong>App Marketplace</strong> → <strong>Develop</strong> → <strong>Build App</strong></li>
          <li>Choose <strong>Server-to-Server OAuth</strong> and create the app</li>
          <li>Add scopes: <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: 3, color: "#1e293b" }}>account:read:admin</code>, <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: 3, color: "#1e293b" }}>user:read:admin</code>, <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: 3, color: "#1e293b" }}>report:read:admin</code>, <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: 3, color: "#1e293b" }}>phone:read:admin</code>, <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: 3, color: "#1e293b" }}>contact_center:read:admin</code></li>
          <li>Activate the app and copy the Account ID, Client ID, and Client Secret below</li>
        </ol>
      </div>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
        <label className="ms-label">
          <span>Account ID</span>
          <input required className="ms-input" value={form.account_id}
            onChange={(e) => setForm({ ...form, account_id: e.target.value.trim() })}
            placeholder="e.g. abc123XYZ" autoComplete="off" />
        </label>
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
        {error && <div style={{ color: "#d13438", fontSize: 13 }}>{error}</div>}
        <div>
          <button type="submit" className="ms-btn-primary"
            disabled={saving || !form.account_id || !form.client_id || !form.client_secret}>
            {saving ? "Connecting…" : "Connect Tenant"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Status Dashboard ──────────────────────────────────────────────────────────

function StatusDashboard({ status, onDisconnect }: { status: ZoomStatus; onDisconnect: () => void }) {
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showSubscriptions, setShowSubscriptions] = useState(false);
  const [showDevices, setShowDevices] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    await onDisconnect();
  }

  // Derive meeting license info from plans
  const planBase = status.plans?.plan_base as { hosts?: number; type?: string } | undefined;
  const meetingLicensesPurchased = planBase?.hosts ?? null;
  const meetingLicensesAssigned = status.total_users ?? null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1e293b" }}>
            {status.account?.account_name ?? "Zoom Tenant"}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {ACCOUNT_TYPE_LABEL[status.account?.account_type ?? 0] ?? `Type ${status.account?.account_type}`} Account
            {status.total_users != null && <> &nbsp;·&nbsp; {status.total_users} users</>}
            &nbsp;·&nbsp; ID: {status.account?.id}
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

      {/* License Overview */}
      <div className="ms-section-card">
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>License Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 6 }}>Meeting Licenses</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#1e293b", lineHeight: 1 }}>
              {meetingLicensesAssigned ?? "—"}
              {meetingLicensesPurchased != null && (
                <span style={{ fontSize: 14, fontWeight: 500, color: "#64748b", marginLeft: 6 }}>/ {meetingLicensesPurchased}</span>
              )}
            </div>
            <UsageBar assigned={meetingLicensesAssigned} purchased={meetingLicensesPurchased} />
          </div>
          <AdoptionTile label="30-Day Active Users" active={status.active_users_30d} total={status.total_users} />
        </div>
      </div>

      {/* Meeting Activity */}
      {status.meeting_activity_30d && (
        <div className="ms-section-card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Meeting Activity — Last 30 Days</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <MetricTile label="Participant Sessions" value={status.meeting_activity_30d.participants} />
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 6 }}>Total Meeting Time</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#1e293b", lineHeight: 1 }}>{fmtMinutes(status.meeting_activity_30d.meeting_minutes)}</div>
            </div>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 6 }}>Avg Session Length</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#1e293b", lineHeight: 1 }}>
                {status.meeting_activity_30d.participants > 0
                  ? fmtMinutes(Math.round(status.meeting_activity_30d.meeting_minutes / status.meeting_activity_30d.participants))
                  : "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calling Plans */}
      <CallingPlanList plans={status.calling_plans} />

      {/* Phone System */}
      <div className="ms-section-card">
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Phone System</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <MetricTile label="Phone Users" value={status.phone_users_total} />
          <MetricTile label="Phone Devices" value={status.devices_total ?? null} />
          <MetricTile label="Call Queues" value={status.call_queues_total} />
          <MetricTile label="Auto Receptionists" value={status.auto_receptionists_total} />
        </div>
        {status.phone_calls_30d != null && (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <MetricTile label="Phone Calls (30d)" value={status.phone_calls_30d} />
          </div>
        )}
      </div>

      {/* Contact Center — only if cc data present */}
      {status.cc_users_total != null && (
        <div className="ms-section-card">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Contact Center</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14 }}>Contact Center (Zoom CC)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <MetricTile label="CC Users" value={status.cc_users_total} />
            <MetricTile label="CC Queues" value={status.cc_queues_total} />
          </div>
        </div>
      )}

      {/* Subscriptions — collapsible */}
      <div className="ms-section-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showSubscriptions ? 14 : 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Subscriptions</div>
          <button className="ms-btn-secondary" style={{ fontSize: 12, padding: "4px 12px" }}
            onClick={() => setShowSubscriptions((v) => !v)}>
            {showSubscriptions ? "Hide subscriptions" : "Show subscriptions"}
          </button>
        </div>
        {showSubscriptions && <SubscriptionList plans={status.plans ?? {}} />}
      </div>

      {/* Devices — collapsible */}
      {status.devices && status.devices.length > 0 && (
        <div className="ms-section-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              Registered Devices
              {(status.devices_total ?? 0) > status.devices.length && (
                <span style={{ fontWeight: 400, color: "#64748b", marginLeft: 8, fontSize: 12 }}>
                  (showing {status.devices.length} of {status.devices_total})
                </span>
              )}
            </div>
            <button className="ms-btn-secondary" style={{ fontSize: 12, padding: "4px 12px" }}
              onClick={() => setShowDevices((v) => !v)}>
              {showDevices ? "Hide devices" : "Show devices"}
            </button>
          </div>
          {showDevices && (
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
                    <td style={{ color: "#64748b" }}>{device.model || "—"}</td>
                    <td style={{ color: "#64748b", fontFamily: "monospace", fontSize: 12 }}>{device.mac_address || "—"}</td>
                    <td><DeviceStatusDot status={device.status} /></td>
                    <td style={{ color: "#64748b" }}>{device.assignee?.name ?? "Unassigned"}</td>
                    <td style={{ color: "#64748b" }}>{device.assignee?.extension_number ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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

  if (loading) return <div style={{ color: "#64748b", padding: 16 }}>Loading Zoom tenant data…</div>;
  if (error) return (
    <div className="ms-section-card">
      <div style={{ color: "#d13438", marginBottom: 12 }}>Error: {error}</div>
      <button className="ms-btn-secondary" onClick={load}>Retry</button>
    </div>
  );

  if (!zoomStatus?.configured) return <ConnectForm projectId={projectId} onConnected={load} />;

  if (zoomStatus.error) {
    return (
      <div className="ms-section-card">
        <div style={{ fontWeight: 600, color: "#d13438", marginBottom: 8 }}>Zoom API Error</div>
        <div style={{
          background: "#fdf3f3", border: "1px solid #f1c0c0", borderRadius: 4,
          padding: "10px 14px", fontFamily: "monospace", fontSize: 12,
          color: "#a4262c", marginBottom: 16, wordBreak: "break-all",
        }}>
          {zoomStatus.error}
        </div>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px" }}>
          Check that the S2S OAuth app is activated and has the required scopes.
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
