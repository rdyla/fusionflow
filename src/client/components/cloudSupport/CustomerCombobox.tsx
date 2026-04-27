import { useEffect, useRef, useState } from "react";
import { api, type DynamicsAccount } from "../../lib/api";

// Customer picker for Cloud Support proposals. Searches the live Dynamics 365
// account list (debounced) — not the local customers cache — so PMs see every
// possible CRM customer, not only the ones already imported into fusionflow.
//
// On pick, the parent gets `{ dynamicsAccountId, customerName }`. The server
// (cloudSupport.ts → resolveCustomerRef) then find-or-creates a local
// customers row so the cs_proposals.customer_id FK can be set cleanly.
//
// Free-text typing is always a valid submission: the parent gets
// `{ dynamicsAccountId: null, customerName }` and the server stores it as a
// freeform name with no FK. Used for early-stage pricing where the customer
// record may not exist in CRM yet.

type Props = {
  value: { customerName: string | null; hasCrmLink: boolean };
  onChange: (next: { dynamicsAccountId: string | null; customerName: string | null }) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export default function CustomerCombobox({ value, onChange, placeholder, autoFocus }: Props) {
  const [text, setText] = useState(value.customerName ?? "");
  const [results, setResults] = useState<DynamicsAccount[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync displayed text when an external value change happens.
  useEffect(() => {
    setText(value.customerName ?? "");
  }, [value.customerName, value.hasCrmLink]);

  // Click outside → close suggestions.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runSearch = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const accounts = await api.searchDynamicsAccounts(q.trim());
        setResults(accounts);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const onTextChange = (next: string) => {
    setText(next);
    setOpen(true);
    runSearch(next);
    // Typing freely drops any prior CRM link and stores the typed text.
    onChange({ dynamicsAccountId: null, customerName: next.trim() ? next.trim() : null });
  };

  const pick = (a: DynamicsAccount) => {
    setText(a.name);
    setOpen(false);
    setResults([]);
    onChange({ dynamicsAccountId: a.accountid, customerName: a.name });
  };

  const clear = () => {
    setText("");
    setOpen(false);
    setResults([]);
    onChange({ dynamicsAccountId: null, customerName: null });
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="ms-input"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "Search CRM customers (or type a name)…"}
          autoFocus={autoFocus}
          style={{ flex: 1 }}
        />
        {value.hasCrmLink && (
          <button type="button" onClick={clear}
            title="Unlink CRM customer"
            style={{ padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 5, background: "#fff", color: "#64748b", cursor: "pointer", fontSize: 12 }}>
            ✕
          </button>
        )}
      </div>
      {value.hasCrmLink && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#0891b2" }}>
          ✓ Linked to CRM customer
        </div>
      )}
      {open && (searching || results.length > 0) && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
          background: "#fff", border: "1px solid #cbd5e1", borderRadius: 6,
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)", zIndex: 50, maxHeight: 280, overflowY: "auto",
        }}>
          {searching && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#94a3b8" }}>Searching CRM…</div>
          )}
          {!searching && results.map((a) => (
            <div key={a.accountid}
              onMouseDown={(e) => { e.preventDefault(); pick(a); }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "#1e293b", borderBottom: "1px solid #f1f5f9" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <div style={{ fontWeight: 500 }}>{a.name}</div>
              {(a.address1_city || a.address1_stateorprovince) && (
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {[a.address1_city, a.address1_stateorprovince].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
