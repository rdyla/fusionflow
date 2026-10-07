import { useEffect, useMemo, useState } from "react";
import { api, type ProjectAssignmentReportRow } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";
import { joinSolutionTypeLabels } from "../../shared/solutionTypes";
import { buildCsvText, downloadCsv, shortDate, todayIso } from "../lib/exportKit";

type SortKey = "customer_name" | "vendor" | "solution_types" | "pm_names" | "ie_names" | "created_at";
type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "customer_name", label: "Customer" },
  { key: "vendor", label: "Provider" },
  { key: "solution_types", label: "Technology Types" },
  { key: "pm_names", label: "PM(s)" },
  { key: "ie_names", label: "IE(s)" },
  { key: "created_at", label: "Created" },
];

function sortValue(row: ProjectAssignmentReportRow, key: SortKey): string {
  switch (key) {
    case "solution_types": return joinSolutionTypeLabels(row.solution_types);
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
