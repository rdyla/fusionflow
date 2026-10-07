import { useEffect, useMemo, useState } from "react";
import { api, type ProjectAssignmentReportRow } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";
import { joinSolutionTypeLabels } from "../../shared/solutionTypes";
import { buildCsvText, downloadCsv, shortDate, todayIso } from "../lib/exportKit";
import { humanize } from "../lib/format";

type SortKey = "customer_name" | "vendor" | "solution_types" | "status" | "pm_names" | "ie_names" | "created_at";
type SortDir = "asc" | "desc";

// Same precedence ProjectsPage.tsx uses: closed_at is the deliberate, final
// signal (wins even over a stray on_hold flag left set); on_hold is a
// temporary overlay on top of the auto-derived status
// (not_started/in_progress/blocked/complete, from syncProjectStatus); the
// derived status otherwise, humanized for display.
const STATUS_COLOR: Record<string, string> = {
  closed: "#64748b",
  on_hold: "#92400e",
  blocked: "#d13438",
  complete: "#059669",
  in_progress: "#0891b2",
  not_started: "#94a3b8",
};

function statusKey(row: ProjectAssignmentReportRow): string {
  if (row.closed_at) return "closed";
  if (row.on_hold === 1) return "on_hold";
  return row.status ?? "not_started";
}

function statusLabel(row: ProjectAssignmentReportRow): string {
  const key = statusKey(row);
  return key === "closed" ? "Closed" : key === "on_hold" ? "On Hold" : humanize(row.status, "Not Started");
}

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "customer_name", label: "Customer" },
  { key: "vendor", label: "Provider" },
  { key: "solution_types", label: "Technology Types" },
  { key: "status", label: "Status" },
  { key: "pm_names", label: "PM(s)" },
  { key: "ie_names", label: "IE(s)" },
  { key: "created_at", label: "Created" },
];

function sortValue(row: ProjectAssignmentReportRow, key: SortKey): string {
  switch (key) {
    case "solution_types": return joinSolutionTypeLabels(row.solution_types);
    case "status": return statusLabel(row);
    case "pm_names": return row.pm_names.join(", ");
    case "ie_names": return row.ie_names.join(", ");
    default: return row[key] ?? "";
  }
}

export default function AdminProjectAssignmentReportPage() {
  const [rows, setRows] = useState<ProjectAssignmentReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("customer_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const { showToast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        setRows(await api.adminProjectAssignmentReport());
      } catch {
        showToast("Failed to load the project assignment report", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = sortValue(a, sortKey).localeCompare(sortValue(b, sortKey), undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleDownload() {
    const headers = COLUMNS.map((c) => c.label);
    const csvRows = sorted.map((r) => [
      r.customer_name ?? "",
      r.vendor ?? "",
      joinSolutionTypeLabels(r.solution_types),
      statusLabel(r),
      r.pm_names.join(", "),
      r.ie_names.join(", "),
      shortDate(r.created_at),
    ]);
    downloadCsv(buildCsvText(headers, csvRows), `project-assignment-report-${todayIso()}.csv`);
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Project Assignment Report</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{sorted.length} projects</span>
          <button className="ms-btn-primary" onClick={handleDownload} style={{ fontSize: 12 }}>
            Download CSV
          </button>
        </div>
      </div>

      <div className="ms-card" style={{ overflow: "auto" }}>
        <table className="ms-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                  title="Click to sort"
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} style={{ textAlign: "center", color: "#64748b", padding: "28px 16px" }}>
                  No projects.
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.customer_name ?? "—"}</td>
                  <td style={{ color: "#64748b" }}>{r.vendor ?? "—"}</td>
                  <td style={{ color: "#64748b" }}>{joinSolutionTypeLabels(r.solution_types) || "—"}</td>
                  <td>
                    <span style={{ color: STATUS_COLOR[statusKey(r)] ?? "#64748b", fontWeight: 600, fontSize: 12.5 }}>
                      {statusLabel(r)}
                    </span>
                  </td>
                  <td style={{ color: "#64748b" }}>{r.pm_names.join(", ") || "—"}</td>
                  <td style={{ color: "#64748b" }}>{r.ie_names.join(", ") || "—"}</td>
                  <td style={{ color: "#94a3b8", fontSize: 12 }}>{shortDate(r.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
