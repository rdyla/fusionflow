import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Customer } from "../../lib/api";

// Picker for the local `customers` table (which is itself the CRM-linked
// customer registry — see migrations/0027_customers.sql `crm_account_id`).
// Free-text fallback is always available: typing a name that doesn't match
// any existing customer is a valid submission with `customerId = null`.
//
// Loads the full customers list once on mount and filters client-side.
// Customer count is bounded (hundreds, not thousands), so this is simpler
// and snappier than a debounced server search.

type Props = {
  value: { customerId: string | null; customerName: string | null };
  onChange: (next: { customerId: string | null; customerName: string | null }) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export default function CustomerCombobox({ value, onChange, placeholder, autoFocus }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [text, setText] = useState(value.customerName ?? "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sync displayed text when an external value change happens (e.g. after save).
  useEffect(() => {
    setText(value.customerName ?? "");
  }, [value.customerName, value.customerId]);

  useEffect(() => {
    api.customers().then(setCustomers).catch(() => setCustomers([]));
  }, []);

  // Click outside → close suggestions
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return customers.slice(0, 10);
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 10);
  }, [customers, text]);

  const pick = (c: Customer) => {
    onChange({ customerId: c.id, customerName: c.name });
    setText(c.name);
    setOpen(false);
  };

  const clear = () => {
    onChange({ customerId: null, customerName: null });
    setText("");
    setOpen(false);
  };

  // When the user types freely, we drop any prior FK and store the typed
  // text as customerName. If they later pick a suggestion, the FK gets set.
  const onTextChange = (next: string) => {
    setText(next);
    setOpen(true);
    onChange({ customerId: null, customerName: next.trim() ? next : null });
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="ms-input"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "Search CRM customers or type a name…"}
          autoFocus={autoFocus}
          style={{ flex: 1 }}
        />
        {value.customerId && (
          <button type="button" onClick={clear}
            title="Unlink CRM customer"
            style={{ padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 5, background: "#fff", color: "#64748b", cursor: "pointer", fontSize: 12 }}>
            ✕
          </button>
        )}
      </div>
      {value.customerId && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#0891b2" }}>
          ✓ Linked to CRM customer
        </div>
      )}
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
          background: "#fff", border: "1px solid #cbd5e1", borderRadius: 6,
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)", zIndex: 50, maxHeight: 280, overflowY: "auto",
        }}>
          {filtered.map((c) => (
            <div key={c.id}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "#1e293b", borderBottom: "1px solid #f1f5f9" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <div style={{ fontWeight: 500 }}>{c.name}</div>
              {(c.address_city || c.address_state) && (
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {[c.address_city, c.address_state].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
