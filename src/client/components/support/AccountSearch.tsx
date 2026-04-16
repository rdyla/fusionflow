import { useEffect, useRef, useState } from "react";
import { supportAccounts, type AccountResult } from "../../lib/supportApi";

interface Props {
  value: AccountResult | null;
  onChange: (account: AccountResult | null) => void;
}

export default function AccountSearch({ value, onChange }: Props) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [results, setResults] = useState<AccountResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = (q: string) => {
    setQuery(q);
    onChange(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await supportAccounts.search(q);
        setResults(res);
        setOpen(true);
      } catch { setResults([]); } finally { setLoading(false); }
    }, 300);
  };

  const select = (account: AccountResult) => { setQuery(account.name); onChange(account); setOpen(false); setResults([]); };
  const clear = () => { setQuery(""); onChange(null); setResults([]); setOpen(false); };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Search accounts…"
          autoComplete="off"
          style={{ flex: 1, padding: "0.5rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, outline: "none" }}
        />
        {(query || value) && (
          <button type="button" onClick={clear}
            style={{ padding: "0.4rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 6, background: "#f8fafc", fontSize: 13, cursor: "pointer" }}>
            Clear
          </button>
        )}
      </div>
      {value && (
        <div style={{ marginTop: "0.3rem", fontSize: 12, color: "#64748b" }}>
          Selected: <strong style={{ color: "#1e293b" }}>{value.name}</strong>
        </div>
      )}
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 200, maxHeight: 220, overflowY: "auto" }}>
          {loading && <div style={{ padding: "0.75rem 1rem", fontSize: 13, color: "#94a3b8" }}>Searching…</div>}
          {!loading && results.length === 0 && <div style={{ padding: "0.75rem 1rem", fontSize: 13, color: "#94a3b8" }}>No accounts found</div>}
          {results.map((a) => (
            <div key={a.id} onMouseDown={() => select(a)}
              style={{ padding: "0.6rem 1rem", fontSize: 14, cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
              {a.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
