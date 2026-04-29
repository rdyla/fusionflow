import { useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { supportApi, formatSupportDate, severityColor, type SupportCase, type SupportUser } from "../lib/supportApi";

const STATUS_OPTIONS = ["Active", "All Statuses", "Resolved", "Cancelled"];
const SEVERITY_OPTIONS = ["All Severities", "P1", "P2", "P3", "E1", "E2"];
const PAGE_SIZE = 50;

function stateColor(s: string) {
  return s === "Resolved" ? "#22c55e" : s === "Cancelled" ? "#94a3b8" : "#0891b2";
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
}

export default function SupportCasesPage() {
  const user = useOutletContext<SupportUser | null>();
  const navigate = useNavigate();
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [severityFilter, setSeverityFilter] = useState("All Severities");
  const [mineOnly, setMineOnly] = useState(true);
  const [page, setPage] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isStaff = user?.isInternal ?? false;
  const userReady = user !== null;

  const fetchCases = (searchTerm?: string, mine?: boolean) => {
    if (searchTerm) setSearching(true); else setLoading(true);
    const useMine = isStaff && (mine ?? mineOnly);
    supportApi.getCases(searchTerm || undefined, useMine)
      .then(setCases)
      .catch((e) => setError(e.message))
      .finally(() => { setLoading(false); setSearching(false); });
  };

  useEffect(() => {
    if (!userReady) return;
    fetchCases();
  }, [mineOnly, isStaff, userReady]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCases(value.trim() || undefined, mineOnly), 400);
  };

  const filtered = cases.filter((c) => {
    const matchStatus = statusFilter === "All Statuses" || c.state === statusFilter;
    const matchSeverity = severityFilter === "All Severities" || c.severity === severityFilter;
    return matchStatus && matchSeverity;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      {isStaff && (
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #e2e8f0" }}>
          <button onClick={() => navigate("/support/dashboard")}
            style={{ padding: "8px 14px", background: "transparent", border: "none", borderBottom: "2px solid transparent", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer" }}>
            Dashboard
          </button>
          <button
            style={{ padding: "8px 14px", background: "transparent", border: "none", borderBottom: "2px solid #0891b2", fontSize: 13, fontWeight: 600, color: "#0891b2", cursor: "default" }}>
            Cases
          </button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Support Cases</h1>
        <button
          onClick={() => navigate("/support/cases/new")}
          style={{ padding: "0.5rem 1.1rem", background: "#0891b2", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          + New Case
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: 16, alignItems: "center" }}>
        {isStaff && (
          <>
            <button onClick={() => { setMineOnly(true); setPage(0); }}
              style={{ padding: "0.35rem 0.85rem", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", background: mineOnly ? "#0891b2" : "#fff", color: mineOnly ? "#fff" : "#475569" }}>
              My Cases
            </button>
            <button onClick={() => { setMineOnly(false); setPage(0); }}
              style={{ padding: "0.35rem 0.85rem", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", background: !mineOnly ? "#0891b2" : "#fff", color: !mineOnly ? "#fff" : "#475569" }}>
              All Cases
            </button>
          </>
        )}
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by title, ticket #, or description…"
          style={{ padding: "0.4rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, minWidth: 260, outline: "none" }}
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          style={{ padding: "0.4rem 0.6rem", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13 }}>
          {STATUS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setPage(0); }}
          style={{ padding: "0.4rem 0.6rem", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13 }}>
          {SEVERITY_OPTIONS.map((o) => <option key={o}>{o}</option>)}
        </select>
        {(search || statusFilter !== "Active" || severityFilter !== "All Severities") && (
          <button onClick={() => { setSearch(""); setStatusFilter("Active"); setSeverityFilter("All Severities"); setPage(0); fetchCases(undefined, mineOnly); }}
            style={{ padding: "0.35rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, cursor: "pointer", background: "#fff" }}>
            Clear
          </button>
        )}
      </div>

      {/* Table card */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {(loading || searching) && (
          <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            {searching ? "Searching…" : "Loading cases…"}
          </div>
        )}
        {error && <div style={{ padding: "1rem", color: "#d13438", fontSize: 14 }}>{error}</div>}
        {!loading && !searching && !error && filtered.length === 0 && (
          <div style={{ padding: "2.5rem", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            {cases.length === 0 ? "No support cases found." : "No cases match your filters."}
          </div>
        )}
        {!loading && !searching && paginated.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>Ticket #</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>Title</th>
                {isStaff && <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>Account</th>}
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>Severity</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>Status</th>
                {isStaff && <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>Owner</th>}
                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>Opened</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/support/cases/${c.id}`)}
                  style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#475569", background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>{c.ticketNumber}</span>
                  </td>
                  <td style={{ padding: "10px 16px", fontWeight: 500, color: "#1e293b" }}>{c.title}</td>
                  {isStaff && <td style={{ padding: "10px 16px", fontSize: 13, color: "#64748b" }}>{c.accountName ?? "—"}</td>}
                  <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                    {c.severity ? (
                      <Badge label={c.severity} color={severityColor(c.severity)} />
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                    <Badge label={c.status} color={stateColor(c.state)} />
                  </td>
                  {isStaff && <td style={{ padding: "10px 16px", fontSize: 13, color: "#64748b" }}>{c.owner ?? "—"}</td>}
                  <td style={{ padding: "10px 16px", fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>{formatSupportDate(c.createdOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && !searching && filtered.length > PAGE_SIZE && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "#64748b" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setPage((p) => p - 1)} disabled={page === 0}
              style={{ padding: "0.3rem 0.7rem", border: "1px solid #cbd5e1", borderRadius: 5, fontSize: 13, cursor: "pointer", background: "#fff", opacity: page === 0 ? 0.4 : 1 }}>
              ← Prev
            </button>
            <span style={{ padding: "0.3rem 0.5rem" }}>Page {page + 1} of {totalPages}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1}
              style={{ padding: "0.3rem 0.7rem", border: "1px solid #cbd5e1", borderRadius: 5, fontSize: 13, cursor: "pointer", background: "#fff", opacity: page >= totalPages - 1 ? 0.4 : 1 }}>
              Next →
            </button>
          </div>
          <div>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}{!search && cases.length >= 500 ? "+" : ""} cases</div>
        </div>
      )}
    </>
  );
}
