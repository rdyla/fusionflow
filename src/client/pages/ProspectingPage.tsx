import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type ProspectList } from "../lib/api";

// ── CSV / paste parsing ────────────────────────────────────────────────────

function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .replace(/\s/g, "");
}

function parsePaste(text: string): string[] {
  return [...new Set(
    text.split(/[\n,;\t]+/)
      .map(normalizeDomain)
      .filter(d => d.length > 3 && d.includes("."))
  )];
}

function parseCSV(text: string): string[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const headerLine = lines[0].toLowerCase();
  const cols = headerLine.split(",");
  const domainColIdx = cols.findIndex(c => /domain|website|url|site/.test(c.trim()));
  const startIdx = domainColIdx >= 0 ? 1 : 0;
  const colIdx = domainColIdx >= 0 ? domainColIdx : 0;
  return [...new Set(
    lines.slice(startIdx).map(line => {
      const parts = line.match(/(".*?"|[^,]+)/g) ?? [line];
      const val = (parts[colIdx] ?? "").trim().replace(/^"|"$/g, "");
      return normalizeDomain(val);
    }).filter(d => d.length > 3 && d.includes("."))
  )];
}

// ── Status helpers ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProspectList["status"] }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    enriching: { bg: "#e0f2fe", color: "#0369a1", label: "Enriching…" },
    ready:     { bg: "#dcfce7", color: "#166534", label: "Ready" },
    pending:   { bg: "#f1f5f9", color: "#64748b", label: "Pending" },
  };
  const s = styles[status] ?? styles.pending;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, borderRadius: 8, padding: "2px 8px", display: "inline-flex", alignItems: "center", gap: 5 }}>
      {status === "enriching" && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 11, height: 11, animation: "spin 1.2s linear infinite" }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      )}
      {s.label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── New List Modal ─────────────────────────────────────────────────────────

interface NewListModalProps {
  onClose: () => void;
  onCreated: (list: ProspectList) => void;
}

function NewListModal({ onClose, onCreated }: NewListModalProps) {
  const [name, setName] = useState("");
  const [inputMode, setInputMode] = useState<"paste" | "csv">("paste");
  const [pasteText, setPasteText] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [assignableUsers, setAssignableUsers] = useState<Array<{ id: string; name: string | null; email: string; organization_name: string | null }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.prospectingAssignableUsers().then(setAssignableUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (inputMode === "paste") {
      setDomains(parsePaste(pasteText));
    }
  }, [pasteText, inputMode]);

  async function handleFileChange(file: File | null) {
    setCsvFile(file);
    if (!file) { setDomains([]); return; }
    const text = await file.text();
    setDomains(parseCSV(text));
  }

  async function handleSubmit() {
    if (!name.trim()) { setError("List name is required"); return; }
    if (domains.length === 0) { setError("No valid domains detected"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const payload: { name: string; domains: string[]; owner_id?: string } = {
        name: name.trim(),
        domains,
      };
      if (ownerId) payload.owner_id = ownerId;
      const list = await api.createProspectingList(payload);
      onCreated(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create list");
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 540, boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#1e293b" }}>New Prospect List</h2>

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>List Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Q2 Healthcare Targets"
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, marginBottom: 16 }}
        />

        {assignableUsers.length > 0 && (
          <>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Assign To</label>
            <select
              value={ownerId}
              onChange={e => setOwnerId(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, marginBottom: 16, background: "#fff" }}
            >
              <option value="">Myself</option>
              {assignableUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}{u.organization_name ? ` — ${u.organization_name}` : ""}</option>
              ))}
            </select>
          </>
        )}

        {/* Input mode tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 12, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
          {(["paste", "csv"] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setInputMode(mode)}
              style={{
                flex: 1, padding: "8px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: inputMode === mode ? "#03395f" : "#f8fafc",
                color: inputMode === mode ? "#fff" : "#64748b",
              }}
            >
              {mode === "paste" ? "Paste Domains" : "Upload CSV"}
            </button>
          ))}
        </div>

        {inputMode === "paste" ? (
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={"Paste domains, one per line or comma-separated:\nacmecorp.com\nglobex.com, initech.com"}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, minHeight: 120, resize: "vertical", fontFamily: "monospace" }}
          />
        ) : (
          <div
            style={{ border: "2px dashed #e2e8f0", borderRadius: 8, padding: "24px 16px", textAlign: "center", cursor: "pointer", background: "#f8fafc" }}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={e => handleFileChange(e.target.files?.[0] ?? null)} />
            {csvFile ? (
              <div style={{ fontSize: 13, color: "#334155" }}>
                <strong>{csvFile.name}</strong>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#94a3b8" }}>
                Click to upload a CSV file<br />
                <span style={{ fontSize: 11 }}>Column named "domain", "website", or "url" will be auto-detected</span>
              </div>
            )}
          </div>
        )}

        {domains.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#0369a1", fontWeight: 600, background: "#e0f2fe", borderRadius: 6, padding: "5px 10px", display: "inline-block" }}>
            {domains.length} domain{domains.length !== 1 ? "s" : ""} detected
          </div>
        )}

        {error && <div style={{ marginTop: 10, fontSize: 13, color: "#d13438" }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 18px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", fontSize: 14, cursor: "pointer", color: "#475569" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || domains.length === 0 || !name.trim()}
            style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: "#03395f", color: "#fff", fontSize: 14, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", opacity: (submitting || domains.length === 0 || !name.trim()) ? 0.6 : 1 }}
          >
            {submitting ? "Creating…" : `Create List (${domains.length} domains)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ProspectingPage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<ProspectList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    api.prospectingLists()
      .then(setLists)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this prospect list? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await api.deleteProspectingList(id);
      setLists(prev => prev.filter(l => l.id !== id));
    } catch {
      alert("Failed to delete list");
    } finally {
      setDeletingId(null);
    }
  }

  function handleCreated(list: ProspectList) {
    navigate(`/prospecting/${list.id}`);
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1e293b" }}>Prospecting</h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>Upload domain lists and generate AI-powered sales intelligence</p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", background: "#03395f", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 16, height: 16 }}>
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New List
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8", fontSize: 14 }}>Loading…</div>
      ) : lists.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", background: "#fff", borderRadius: 12, border: "1px dashed #e2e8f0" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#334155", marginBottom: 6 }}>No prospect lists yet</div>
          <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 20 }}>Upload a list of domains to get started</div>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            style={{ padding: "10px 20px", background: "#03395f", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Create First List
          </button>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                {["List Name", "Owner", "Status", "Domains", "Enriched", "Hot / Warm / Cold", "Created", ""].map(h => (
                  <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lists.map(list => (
                <ListRow key={list.id} list={list} onDelete={handleDelete} deletingId={deletingId} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNewModal && <NewListModal onClose={() => setShowNewModal(false)} onCreated={handleCreated} />}
    </div>
  );
}

function ListRow({ list, onDelete, deletingId }: { list: ProspectList; onDelete: (id: string) => void; deletingId: string | null }) {
  const navigate = useNavigate();
  return (
    <tr
      style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
      onClick={() => navigate(`/prospecting/${list.id}`)}
    >
      <td style={{ padding: "13px 16px" }}>
        <span style={{ fontWeight: 600, color: "#1e293b", fontSize: 14 }}>{list.name}</span>
      </td>
      <td style={{ padding: "13px 16px" }}>
        <span style={{ fontSize: 13, color: "#475569" }}>
          {list.owner_name ?? list.owner_email ?? "—"}
          {list.owner_org && <span style={{ color: "#94a3b8", fontSize: 11, marginLeft: 4 }}>({list.owner_org})</span>}
        </span>
      </td>
      <td style={{ padding: "13px 16px" }}><StatusBadge status={list.status} /></td>
      <td style={{ padding: "13px 16px", fontSize: 14, color: "#334155", fontWeight: 600 }}>{list.domain_count}</td>
      <td style={{ padding: "13px 16px", fontSize: 14, color: "#334155" }}>
        {list.enriched_count}
        {list.status === "enriching" && (
          <span style={{ marginLeft: 4, fontSize: 11, color: "#94a3b8" }}>
            ({Math.round((list.enriched_count / Math.max(list.domain_count, 1)) * 100)}%)
          </span>
        )}
      </td>
      <td style={{ padding: "13px 16px" }}>
        <TierMiniBar listId={list.id} />
      </td>
      <td style={{ padding: "13px 16px", fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap" }}>{formatDate(list.created_at)}</td>
      <td style={{ padding: "13px 16px" }} onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onDelete(list.id)}
          disabled={deletingId === list.id}
          style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 4 }}
          title="Delete list"
        >
          {deletingId === list.id ? "…" : "Delete"}
        </button>
      </td>
    </tr>
  );
}

// Lazy tier mini-bar — loads per list row only when visible
function TierMiniBar({ listId }: { listId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [counts, setCounts] = useState({ hot: 0, warm: 0, cold: 0 });
  const ref = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    if (loaded) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        api.prospectingList(listId)
          .then(data => {
            const hot = data.prospects.filter(p => p.tier === "hot").length;
            const warm = data.prospects.filter(p => p.tier === "warm").length;
            const cold = data.prospects.filter(p => p.tier === "cold").length;
            setCounts({ hot, warm, cold });
            setLoaded(true);
          })
          .catch(() => { setLoaded(true); });
      }
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [listId, loaded]);

  if (!loaded) return <span ref={ref as React.RefObject<HTMLSpanElement>} style={{ fontSize: 12, color: "#cbd5e1" }}>—</span>;

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <span style={{ fontSize: 11, fontWeight: 700, background: "#fee2e2", color: "#dc2626", padding: "1px 6px", borderRadius: 6 }}>{counts.hot}</span>
      <span style={{ fontSize: 11, fontWeight: 700, background: "#fef3c7", color: "#d97706", padding: "1px 6px", borderRadius: 6 }}>{counts.warm}</span>
      <span style={{ fontSize: 11, fontWeight: 700, background: "#f1f5f9", color: "#64748b", padding: "1px 6px", borderRadius: 6 }}>{counts.cold}</span>
    </div>
  );
}
