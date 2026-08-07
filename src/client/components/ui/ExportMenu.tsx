/**
 * "⬇ Export ▾" dropdown used by the task-list exports.
 *
 * Pure chrome — it owns only open/closed state and the click-outside dismiss.
 * Callers supply grouped items (a heading plus labelled rows with counts) and
 * do all the work in onClick. Shared by the standard Tasks tab
 * (project/TaskExports) and the MedVet plan (customPlan/CustomPlanExports),
 * which offer different scopes but should look identical.
 */
import React, { useEffect, useRef, useState } from "react";

export type ExportMenuItem = {
  label: string;
  icon: string;
  /** Row count, shown right-aligned so the scope is obvious before clicking. */
  count: number;
  onClick: () => void;
};

export type ExportMenuGroup = { heading: string; items: ExportMenuItem[] };

export default function ExportMenu({ groups, tooltip }: { groups: ExportMenuGroup[]; tooltip?: string }) {
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

  const itemStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
    background: "none", border: "none", padding: "7px 12px", fontSize: 12.5,
    color: "#1e293b", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
  };
  const headingStyle: React.CSSProperties = {
    padding: "4px 12px 5px", fontSize: 9.5, fontWeight: 700, color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: "0.08em",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="ms-btn-secondary"
        onClick={() => setOpen((v) => !v)}
        style={{ fontSize: 12, padding: "4px 10px", whiteSpace: "nowrap" }}
        title={tooltip ?? "Export this task list to CSV or a print-ready document"}
      >
        ⬇ Export ▾
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 30,
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6,
            boxShadow: "0 6px 20px rgba(0,0,0,0.12)", padding: "4px 0", minWidth: 236,
          }}
        >
          {groups.map((group, gi) => (
            <React.Fragment key={group.heading}>
              {gi > 0 && <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0" }} />}
              <div style={headingStyle}>{group.heading}</div>
              {group.items.map((it) => (
                <button
                  key={`${group.heading}:${it.label}`}
                  type="button"
                  style={itemStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                  onClick={() => { setOpen(false); it.onClick(); }}
                >
                  <span>{it.icon}</span>
                  <span>{it.label}</span>
                  <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 11 }}>{it.count}</span>
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
