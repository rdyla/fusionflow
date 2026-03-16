// RingCentralTab — setup instructions for connecting a customer's RingCentral tenant.
// API integration (credential storage + live stats) is a future phase.

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
        background: "rgba(255,140,0,0.15)", border: "1px solid rgba(255,140,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, color: "#ff8c00",
      }}>{n}</div>
      <div style={{ fontSize: 13, color: "rgba(240,246,255,0.6)", lineHeight: 1.6, paddingTop: 2 }}>{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 3, color: "#f0f6ff", fontSize: 12 }}>
      {children}
    </code>
  );
}

export default function RingCentralTab({ projectId: _projectId }: { projectId: string }) {
  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 680 }}>
      <div className="ms-section-card">
        <div className="ms-section-title" style={{ marginBottom: 4 }}>Connect RingCentral Tenant</div>
        <p style={{ color: "rgba(240,246,255,0.5)", fontSize: 13, marginTop: 0, marginBottom: 20 }}>
          Create a Private App in the customer's RingCentral developer console to enable live account stats and utilization tracking.
        </p>

        <div style={{
          background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "16px 18px",
          border: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 14,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(240,246,255,0.35)" }}>
            Setup steps (in the customer's RingCentral admin portal)
          </div>

          <Step n={1}>
            Sign in to <strong style={{ color: "rgba(240,246,255,0.8)" }}>developers.ringcentral.com</strong> using the customer's admin credentials.
          </Step>
          <Step n={2}>
            Click <strong style={{ color: "rgba(240,246,255,0.8)" }}>Create App</strong> → choose <strong style={{ color: "rgba(240,246,255,0.8)" }}>REST API App</strong>, then set Auth type to <strong style={{ color: "rgba(240,246,255,0.8)" }}>JWT auth flow</strong>.
          </Step>
          <Step n={3}>
            Under <strong style={{ color: "rgba(240,246,255,0.8)" }}>OAuth Scopes</strong>, add the following:
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {["ReadAccounts", "ReadCallLog", "ReadReports", "Analytics"].map((s) => (
                <Code key={s}>{s}</Code>
              ))}
            </div>
          </Step>
          <Step n={4}>
            Go to <strong style={{ color: "rgba(240,246,255,0.8)" }}>Credentials</strong> and generate a <strong style={{ color: "rgba(240,246,255,0.8)" }}>JWT token</strong> for a super-admin user. Copy the <Code>Client ID</Code>, <Code>Client Secret</Code>, and <Code>JWT Token</Code>.
          </Step>
          <Step n={5}>
            Paste the credentials here once the integration is enabled in FusionFlow (coming soon).
          </Step>
        </div>

        <div style={{
          marginTop: 20, padding: "12px 16px", borderRadius: 6,
          background: "rgba(255,140,0,0.06)", border: "1px solid rgba(255,140,0,0.2)",
          fontSize: 13, color: "rgba(240,246,255,0.5)", lineHeight: 1.6,
        }}>
          <strong style={{ color: "#ff8c00" }}>Note:</strong> RingCentral API credential storage and live stats are coming in a future update.
          Once available, this tab will show account health, license utilization, and call analytics — mirroring the Zoom integration.
        </div>
      </div>
    </div>
  );
}
