import { useState } from "react";

type Tab = "commissions" | "zoom_resell" | "zoom_agency";

const TABS: { id: Tab; label: string }[] = [
  { id: "commissions", label: "Commissions Calculator" },
  { id: "zoom_resell", label: "Zoom Resell" },
  { id: "zoom_agency", label: "Zoom Agency" },
];

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ padding: "48px 0", textAlign: "center", color: "#64748b" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13 }}>Coming soon.</div>
    </div>
  );
}

export default function SalesToolsPage() {
  const [tab, setTab] = useState<Tab>("commissions");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">Sales Tools</h1>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, borderBottom: "2px solid #e2e8f0", marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "10px 18px", fontSize: 14, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "#0b9aad" : "#64748b",
              borderBottom: tab === t.id ? "2px solid #0b9aad" : "2px solid transparent",
              marginBottom: -2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "commissions" && <ComingSoon label="Commissions Calculator" />}
      {tab === "zoom_resell" && <ComingSoon label="Zoom Resell" />}
      {tab === "zoom_agency" && <ComingSoon label="Zoom Agency" />}
    </div>
  );
}
