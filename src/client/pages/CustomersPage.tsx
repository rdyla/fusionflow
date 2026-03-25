import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Customer, type DynamicsAccount } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

function AddCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DynamicsAccount[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<DynamicsAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const { showToast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setSelected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.searchDynamicsAccounts(val.trim());
        setResults(data);
      } catch {
        showToast("CRM search failed", "error");
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const handleCreate = async () => {
    if (!selected) return;
    setCreating(true);
    try {
      const customer = await api.createCustomer({ name: selected.name, crm_account_id: selected.accountid });
      try { await api.customerCrmSync(customer.id); } catch { /* sync best-effort */ }
      onCreated(customer.id);
    } catch {
      showToast("Failed to create customer", "error");
      setCreating(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: 520, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Start New Customer Journey</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Search CRM to find and add a customer</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#94a3b8", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 24 }}>
          <input
            className="ms-input"
            placeholder="Search CRM accounts…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            autoFocus
            style={{ width: "100%", marginBottom: 12 }}
          />

          {searching && (
            <div style={{ color: "#94a3b8", fontSize: 13, padding: "8px 0" }}>Searching CRM…</div>
          )}

          {!searching && results.length > 0 && !selected && (
            <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, overflow: "hidden", maxHeight: 280, overflowY: "auto" }}>
              {results.map((acct) => (
                <div
                  key={acct.accountid}
                  onClick={() => { setSelected(acct); setResults([]); }}
                  style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.05)", background: "#fff", transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 14 }}>{acct.name}</div>
                  {(acct.address1_city || acct.address1_stateorprovince) && (
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                      {[acct.address1_city, acct.address1_stateorprovince].filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!searching && query.trim() && results.length === 0 && !selected && (
            <div style={{ color: "#94a3b8", fontSize: 13, padding: "8px 0" }}>No CRM accounts found.</div>
          )}

          {selected && (
            <div style={{ background: "#f0fdfe", border: "1px solid rgba(11,154,173,0.25)", borderRadius: 8, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 14 }}>{selected.name}</div>
                {(selected.address1_city || selected.address1_stateorprovince) && (
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    {[selected.address1_city, selected.address1_stateorprovince].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setSelected(null); setQuery(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#94a3b8" }}
              >
                Change
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="ms-btn" onClick={onClose} disabled={creating}>Cancel</button>
          <button
            className="ms-btn ms-btn-primary"
            onClick={handleCreate}
            disabled={!selected || creating}
          >
            {creating ? "Creating…" : "Start Journey"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    api.customers()
      .then(setCustomers)
      .catch(() => showToast("Failed to load customers", "error"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q);
  });

  const handleCreated = (id: string) => {
    navigate(`/customers/${id}`);
  };

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {showAdd && <AddCustomerModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}

      <div className="ms-page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="ms-page-title">Customers</h1>
        <button className="ms-btn ms-btn-primary" onClick={() => setShowAdd(true)}>
          + New Customer
        </button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <input
          className="ms-input"
          placeholder="Search customers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
      </div>

      <div className="ms-card" style={{ overflow: "hidden" }}>
        <table className="ms-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>AE</th>
              <th>SA</th>
              <th>CSM</th>
              <th>SharePoint</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "#94a3b8", padding: "28px 16px" }}>
                  {customers.length === 0 ? "No customers found." : "No customers match your search."}
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/customers/${c.id}`)}
                >
                  <td>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>{c.name}</div>
                    {(c.address_city || c.address_state) && (
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                        {[c.address_city, c.address_state].filter(Boolean).join(", ")}
                      </div>
                    )}
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>
                    {c.pf_ae_name ?? <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>
                    {c.pf_sa_name ?? <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>
                    {c.pf_csm_name ?? <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td>
                    {c.sharepoint_url ? (
                      <a
                        href={c.sharepoint_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 12, color: "#0b9aad", textDecoration: "none" }}
                      >
                        Open ↗
                      </a>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
