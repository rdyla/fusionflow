import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SupportCase, type DynamicsAccount, type User } from "../lib/api";

const PRIORITY_COLORS: Record<number, string> = { 1: "#ef4444", 2: "#d97706", 3: "#6b7280" };
const STATE_COLORS: Record<number, string> = { 0: "#00c8e0", 1: "#059669", 2: "#6b7280" };

function statusBadgeStyle(statecode: number) {
  const color = STATE_COLORS[statecode] ?? "#6b7280";
  return { background: `${color}22`, border: `1px solid ${color}55`, color, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap" as const };
}

function priorityBadgeStyle(prioritycode: number) {
  const color = PRIORITY_COLORS[prioritycode] ?? "#6b7280";
  return { background: `${color}22`, border: `1px solid ${color}55`, color, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" as const };
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function SupportPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [accountFilter, setAccountFilter] = useState<{ id: string; name: string } | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", prioritycode: 2, casetypecode: 2, accountId: "", accountName: "" });
  const [acctSearch, setAcctSearch] = useState("");
  const [acctResults, setAcctResults] = useState<DynamicsAccount[]>([]);
  const [acctSearching, setAcctSearching] = useState(false);
  const acctTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.me().then(r => setCurrentUser(r.user)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.supportCases(accountFilter?.id)
      .then(setCases)
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, [accountFilter]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function handleAcctSearch(q: string) {
    setAcctSearch(q);
    setForm(f => ({ ...f, accountId: "", accountName: "" }));
    if (acctTimer.current) clearTimeout(acctTimer.current);
    if (q.length < 2) { setAcctResults([]); return; }
    acctTimer.current = setTimeout(async () => {
      setAcctSearching(true);
      try {
        const r = await api.searchDynamicsAccounts(q);
        setAcctResults(r);
      } catch { setAcctResults([]); }
      finally { setAcctSearching(false); }
    }, 300);
  }

  function selectAcct(acct: DynamicsAccount) {
    setForm(f => ({ ...f, accountId: acct.accountid, accountName: acct.name }));
    setAcctSearch(acct.name);
    setAcctResults([]);
  }

  async function handleSubmit() {
    if (!form.title.trim()) { showToast("Title is required"); return; }
    setSubmitting(true);
    try {
      const created = await api.createSupportCase({
        title: form.title,
        description: form.description || undefined,
        prioritycode: form.prioritycode,
        casetypecode: form.casetypecode,
        accountId: form.accountId || undefined,
      });
      setCases(prev => [created, ...prev]);
      setShowNew(false);
      setForm({ title: "", description: "", prioritycode: 2, casetypecode: 2, accountId: "", accountName: "" });
      setAcctSearch("");
      showToast("Case created");
    } catch {
      showToast("Failed to create case");
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = cases.filter(c =>
    statusFilter === "" ? true : c.statecode === parseInt(statusFilter)
  );

  return (
    <div>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">Support Cases</h1>
          <p className="ms-page-subtitle">Manage and track support requests via Dynamics CRM</p>
        </div>
        {(currentUser?.role !== "client" || currentUser.can_open_cases) && (
          <button className="ms-btn-primary" onClick={() => setShowNew(true)}>+ New Case</button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <input
            className="ms-input"
            placeholder="Filter by account…"
            value={accountFilter?.name ?? ""}
            onChange={e => {
              if (!e.target.value) setAccountFilter(null);
            }}
            style={{ width: 220, paddingRight: 28 }}
          />
          {accountFilter && (
            <button onClick={() => setAccountFilter(null)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(240,246,255,0.4)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
          )}
        </div>

        <select
          className="ms-input"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ width: 160 }}
        >
          <option value="">All Statuses</option>
          <option value="0">Active</option>
          <option value="1">Resolved</option>
          <option value="2">Cancelled</option>
        </select>

        <span style={{ fontSize: 12, color: "rgba(240,246,255,0.4)", marginLeft: "auto" }}>
          {filtered.length} case{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="ms-section-card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "rgba(240,246,255,0.4)", fontSize: 13 }}>Loading cases…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "rgba(240,246,255,0.4)", fontSize: 13 }}>No cases found</div>
        ) : (
          <table className="ms-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Ticket #</th>
                <th>Title</th>
                <th>Account</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Type</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/support/${c.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 600, color: "#d97706", whiteSpace: "nowrap" }}>
                    {c.ticketNumber ?? "—"}
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    <span style={{ fontWeight: 600, color: "#f0f6ff", fontSize: 13 }}>{c.title}</span>
                  </td>
                  <td style={{ color: "rgba(240,246,255,0.6)", fontSize: 12 }}>{c.accountName ?? "—"}</td>
                  <td><span style={statusBadgeStyle(c.statecode)}>{c.status}</span></td>
                  <td><span style={priorityBadgeStyle(c.prioritycode)}>{c.priority}</span></td>
                  <td style={{ color: "rgba(240,246,255,0.5)", fontSize: 12 }}>{c.caseType ?? "—"}</td>
                  <td style={{ color: "rgba(240,246,255,0.4)", fontSize: 12, whiteSpace: "nowrap" }}>{fmt(c.modifiedOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Case Modal */}
      {showNew && (
        <div className="ms-modal-overlay" onClick={() => setShowNew(false)}>
          <div className="ms-modal" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, margin: 0 }}>New Support Case</h2>
              <button onClick={() => setShowNew(false)} style={{ background: "none", border: "none", color: "rgba(240,246,255,0.4)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Account — hidden for client users (auto-scoped server-side) */}
              {currentUser?.role !== "client" && <div style={{ position: "relative" }}>
                <label className="ms-label">Account</label>
                <input
                  className="ms-input"
                  placeholder="Search account…"
                  value={acctSearch}
                  onChange={e => handleAcctSearch(e.target.value)}
                  style={{ width: "100%" }}
                />
                {acctSearching && (
                  <div style={{ position: "absolute", right: 12, top: 38, color: "rgba(240,246,255,0.4)", fontSize: 12 }}>…</div>
                )}
                {acctResults.length > 0 && !form.accountId && (
                  <div style={{ position: "absolute", zIndex: 50, top: "100%", left: 0, right: 0, background: "#142236", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, marginTop: 4, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                    {acctResults.map(a => (
                      <div key={a.accountid} onClick={() => selectAcct(a)} style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, color: "#f0f6ff", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}>
                        {a.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>}

              {/* Title */}
              <div>
                <label className="ms-label">Title <span style={{ color: "#ef4444" }}>*</span></label>
                <input className="ms-input" placeholder="Brief description of the issue" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ width: "100%" }} />
              </div>

              {/* Description */}
              <div>
                <label className="ms-label">Description</label>
                <textarea className="ms-input" placeholder="Detailed description…" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  style={{ width: "100%", minHeight: 80, resize: "vertical" }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Type */}
                <div>
                  <label className="ms-label">Type</label>
                  <select className="ms-input" value={form.casetypecode}
                    onChange={e => setForm(f => ({ ...f, casetypecode: parseInt(e.target.value) }))} style={{ width: "100%" }}>
                    <option value={2}>Problem</option>
                    <option value={1}>Question</option>
                    <option value={3}>Request</option>
                  </select>
                </div>
                {/* Priority */}
                <div>
                  <label className="ms-label">Priority</label>
                  <select className="ms-input" value={form.prioritycode}
                    onChange={e => setForm(f => ({ ...f, prioritycode: parseInt(e.target.value) }))} style={{ width: "100%" }}>
                    <option value={2}>Normal</option>
                    <option value={1}>High</option>
                    <option value={3}>Low</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <button className="ms-btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="ms-btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Creating…" : "Create Case"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "rgba(13,27,46,0.95)", backdropFilter: "blur(12px)", border: "1px solid rgba(217,119,6,0.4)", borderRadius: 12, padding: "14px 24px", fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "#d97706", zIndex: 100, whiteSpace: "nowrap", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
