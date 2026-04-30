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

type CustomerRef = { dynamicsAccountId: string | null; customerName: string | null };

type Props = {
  value: { customerName: string | null; hasCrmLink: boolean };
  /** Fires on every keystroke + pick — for live display state (e.g. mirroring
   *  the typed name into a form field for an agreement preview). Cheap. */
  onChange: (next: CustomerRef) => void;
  /** Fires on commit events: picking from the dropdown, blurring the field
   *  with text in it, or clearing. This is where expensive work goes
   *  (network calls, FK persistence). Optional — if omitted, picks still
   *  fire onChange and behave fine for in-memory state. */
  onCommit?: (next: CustomerRef) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export default function CustomerCombobox({ value, onChange, onCommit, placeholder, autoFocus }: Props) {
  const [text, setText] = useState(value.customerName ?? "");
  const [results, setResults] = useState<DynamicsAccount[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last name we sent up via onChange. We use this to filter out
  // echo updates (the parent re-rendering with a value we just produced)
  // so the input doesn't fight the user mid-type.
  const lastSentRef = useRef<string | null>(value.customerName ?? "");
  // Tracks the latest text the user typed without committing — the blur
  // handler reads this rather than `text` to avoid stale closure.
  const textRef = useRef(text);
  textRef.current = text;
  // Tracks whether the last edit was a free-text type (vs a pick) so blur
  // can decide whether to fire onCommit.
  const dirtyRef = useRef(false);

  // Sync displayed text when an external value change happens — but ignore
  // echoes from our own onChange (where the parent is just relaying back what
  // we sent). Without this guard, fast typing combined with parent-side async
  // work (network round-trips) reverts the input mid-stroke.
  useEffect(() => {
    if (value.customerName === lastSentRef.current) return;
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
    dirtyRef.current = true;
    // Typing freely drops any prior CRM link and stores the typed text.
    // Display-only update via onChange — committal (network calls etc.)
    // happens on blur or pick to avoid per-keystroke races.
    const trimmed = next.trim() ? next.trim() : null;
    lastSentRef.current = trimmed;
    onChange({ dynamicsAccountId: null, customerName: trimmed });
  };

  const onBlur = () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const trimmed = textRef.current.trim() ? textRef.current.trim() : null;
    onCommit?.({ dynamicsAccountId: null, customerName: trimmed });
  };

  const pick = (a: DynamicsAccount) => {
    setText(a.name);
    setOpen(false);
    setResults([]);
    dirtyRef.current = false;
    lastSentRef.current = a.name;
    const ref = { dynamicsAccountId: a.accountid, customerName: a.name };
    onChange(ref);
    onCommit?.(ref);
  };

  const clear = () => {
    setText("");
    setOpen(false);
    setResults([]);
    dirtyRef.current = false;
    lastSentRef.current = null;
    const ref = { dynamicsAccountId: null, customerName: null };
    onChange(ref);
    onCommit?.(ref);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="ms-input"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
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
