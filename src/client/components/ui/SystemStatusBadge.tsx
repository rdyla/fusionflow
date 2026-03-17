import { useEffect, useRef, useState } from "react";
import type { SystemStatusResponse, VendorStatus } from "../../lib/api";

export const STATUS_DOT: Record<string, string> = {
  operational:          "#22c55e",
  degraded_performance: "#f59e0b",
  partial_outage:       "#f59e0b",
  major_outage:         "#ef4444",
  under_maintenance:    "#a78bfa",
};
export const OVERALL_DOT: Record<string, string> = {
  operational: "#22c55e",
  degraded:    "#f59e0b",
  outage:      "#ef4444",
};
export const OVERALL_LABEL: Record<string, string> = {
  operational: "All Systems Go",
  degraded:    "Degraded",
  outage:      "Service Disruption",
};
export const COMPONENT_STATUS_LABEL: Record<string, string> = {
  operational:          "Operational",
  degraded_performance: "Degraded",
  partial_outage:       "Partial Outage",
  major_outage:         "Major Outage",
  under_maintenance:    "Maintenance",
};

export function worstOverall(a: VendorStatus | null, b: VendorStatus | null): "operational" | "degraded" | "outage" {
  const rank = { outage: 2, degraded: 1, operational: 0 };
  const ra = a ? rank[a.overall] : 0;
  const rb = b ? rank[b.overall] : 0;
  const worst = Math.max(ra, rb);
  return (["operational", "degraded", "outage"] as const)[worst];
}

function VendorPanel({ name, vendor }: { name: string; vendor: VendorStatus }) {
  const dotColor = OVERALL_DOT[vendor.overall];
  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(240,246,255,0.5)" }}>
          {name}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: dotColor }}>
          {OVERALL_LABEL[vendor.overall]}
        </span>
      </div>
      {vendor.components.length === 0 ? (
        <div style={{ fontSize: 11, color: "rgba(240,246,255,0.3)", fontStyle: "italic" }}>No data</div>
      ) : (
        vendor.components.map((c) => (
          <div key={c.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: STATUS_DOT[c.status] ?? "#94a3b8", flexShrink: 0, display: "inline-block" }} />
              <span style={{ fontSize: 12, color: "rgba(240,246,255,0.7)" }}>{c.label}</span>
            </div>
            <span style={{ fontSize: 11, color: STATUS_DOT[c.status] ?? "#94a3b8" }}>
              {COMPONENT_STATUS_LABEL[c.status] ?? c.status}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export function SystemStatusBadge({ status }: { status: SystemStatusResponse | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!status) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 40, fontSize: 12, color: "rgba(240,246,255,0.4)" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#63c1ea", boxShadow: "0 0 6px #63c1ea", display: "inline-block" }} />
        Live
      </div>
    );
  }

  const overall = worstOverall(status.zoom, status.ringcentral);
  const dotColor = OVERALL_DOT[overall];
  const label = OVERALL_LABEL[overall];
  const isOk = overall === "operational";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "5px 12px",
          background: open ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${isOk ? "rgba(255,255,255,0.08)" : `${dotColor}40`}`,
          borderRadius: 40, fontSize: 12,
          color: isOk ? "rgba(240,246,255,0.4)" : dotColor,
          cursor: "pointer", outline: "none",
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: dotColor,
          boxShadow: `0 0 6px ${dotColor}`,
          display: "inline-block",
          animation: isOk ? undefined : "pulse 1.5s infinite",
        }} />
        {label}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 280, zIndex: 200,
          background: "#021a2e",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}>
          {status.vendors.includes("zoom") && status.zoom && (
            <VendorPanel name="Zoom" vendor={status.zoom} />
          )}
          {status.vendors.includes("zoom") && status.vendors.includes("ringcentral") && status.zoom && status.ringcentral && (
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
          )}
          {status.vendors.includes("ringcentral") && status.ringcentral && (
            <VendorPanel name="RingCentral" vendor={status.ringcentral} />
          )}
          <div style={{ padding: "6px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 10, color: "rgba(240,246,255,0.25)", textAlign: "right" }}>
            Updated {Math.round((Date.now() - Math.max(status.zoom?.fetched_at ?? 0, status.ringcentral?.fetched_at ?? 0)) / 1000)}s ago
          </div>
        </div>
      )}
    </div>
  );
}
