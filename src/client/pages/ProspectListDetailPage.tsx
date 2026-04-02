import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Prospect, type ProspectContact, type ProspectList } from "../lib/api";

// ── Tier helpers ───────────────────────────────────────────────────────────

const TIER_STYLES = {
  hot:  { bg: "#fee2e2", color: "#dc2626", label: "Tier 1 Hot" },
  warm: { bg: "#fef3c7", color: "#d97706", label: "Tier 2 Warm" },
  cold: { bg: "#f1f5f9", color: "#64748b", label: "Tier 3 Cold" },
};

function TierBadge({ tier }: { tier: Prospect["tier"] }) {
  if (!tier) return null;
  const s = TIER_STYLES[tier];
  return (
    <span style={{ fontSize: 10, fontWeight: 800, background: s.bg, color: s.color, borderRadius: 8, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function ScorePip({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: "#cbd5e1", fontSize: 13 }}>—</span>;
  const color = score >= 70 ? "#dc2626" : score >= 45 ? "#d97706" : "#64748b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 40, height: 6, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{score}</span>
    </div>
  );
}

function IndustryLabel(industry: string | null): string {
  if (!industry) return "—";
  return industry
    .replace(/_and_/gi, " & ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/It\b/g, "IT")
    .replace(/\bSaas\b/gi, "SaaS");
}

// ── Copy button ────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "7px 13px", border: "1px solid #e2e8f0", borderRadius: 7,
        background: copied ? "#dcfce7" : "#f8fafc", color: copied ? "#166534" : "#475569",
        fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}>
        {copied
          ? <path d="M20 6 9 17l-5-5"/>
          : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>
        }
      </svg>
      {copied ? "Copied!" : label}
    </button>
  );
}

// ── Contact card ───────────────────────────────────────────────────────────

function ContactCard({ contact }: { contact: ProspectContact }) {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unknown";
  return (
    <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", border: "1px solid #e2e8f0", minWidth: 180, flex: "1 1 180px", maxWidth: 260 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", marginBottom: 2 }}>{name}</div>
      {contact.title && <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, fontStyle: "italic" }}>{contact.title}</div>}
      {contact.seniority && (
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", background: "#e0f2fe", color: "#0369a1", borderRadius: 6, padding: "1px 6px" }}>
          {contact.seniority.replace(/_/g, " ")}
        </span>
      )}
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {contact.email && (
          <a href={`mailto:${contact.email}`} style={{ fontSize: 11, color: "#0369a1", textDecoration: "none" }} title={contact.email}>
            ✉ Email
          </a>
        )}
        {contact.linkedin_url && (
          <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#0369a1", textDecoration: "none" }}>
            in LinkedIn
          </a>
        )}
        {contact.phone && (
          <span style={{ fontSize: 11, color: "#64748b" }}>📞 {contact.phone}</span>
        )}
      </div>
    </div>
  );
}

// ── Expanded row panel ─────────────────────────────────────────────────────

interface ExpandedPanelProps {
  prospect: Prospect;
  contacts: ProspectContact[];
  loadingContacts: boolean;
  onGenerateAI: () => void;
  generatingAI: boolean;
  onTierChange: (tier: "hot" | "warm" | "cold") => void;
}

function ExpandedPanel({ prospect, contacts, loadingContacts, onGenerateAI, generatingAI, onTierChange }: ExpandedPanelProps) {
  const topContacts = contacts.filter(c => c.is_top_contact);
  const aiReady = prospect.ai_status === "ready";
  const aiGenerating = generatingAI || prospect.ai_status === "generating";

  return (
    <div style={{ padding: "20px 24px", background: "#fafbfc", borderTop: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>

        {/* Left: contacts + tier controls */}
        <div style={{ minWidth: 280, flex: "0 0 340px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 10 }}>
            Top Contacts to Reach {contacts.length > 0 && `(${Math.min(3, topContacts.length)} of ${contacts.length})`}
          </div>

          {loadingContacts ? (
            <div style={{ fontSize: 13, color: "#94a3b8" }}>Loading contacts…</div>
          ) : contacts.length === 0 ? (
            <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No contacts found</div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {(topContacts.length > 0 ? topContacts : contacts).slice(0, 3).map(c => (
                <ContactCard key={c.id} contact={c} />
              ))}
            </div>
          )}

          {/* Manual tier override */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 8 }}>Override Tier</div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["hot", "warm", "cold"] as const).map(t => {
                const s = TIER_STYLES[t];
                const active = prospect.tier === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onTierChange(t)}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 7, cursor: "pointer",
                      background: active ? s.bg : "#fff",
                      color: active ? s.color : "#94a3b8",
                      border: `1px solid ${active ? s.color : "#e2e8f0"}`,
                    }}
                  >
                    {s.label.split(" ").slice(1).join(" ")}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: AI content */}
        <div style={{ flex: 1, minWidth: 300 }}>

          {/* AI generate / status controls */}
          {!aiReady && (
            <div style={{ marginBottom: 14 }}>
              <button
                type="button"
                onClick={onGenerateAI}
                disabled={aiGenerating}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 16px", border: "none", borderRadius: 8,
                  background: aiGenerating ? "#e2e8f0" : "#03395f",
                  color: aiGenerating ? "#94a3b8" : "#fff",
                  fontSize: 13, fontWeight: 600, cursor: aiGenerating ? "not-allowed" : "pointer",
                }}
              >
                {aiGenerating ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14, animation: "spin 1.2s linear infinite" }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Generating AI Intelligence…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    {prospect.ai_status === "failed" ? "Retry AI Generation" : "Generate AI Intelligence"}
                  </>
                )}
              </button>
              {prospect.enrichment_status !== "enriched" && !aiGenerating && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>
                  Enrichment pending — AI will still generate using domain data
                </div>
              )}
            </div>
          )}

          {aiReady && (
            <div>
              {/* AI Copy actions */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                {prospect.email_sequence && <CopyButton text={prospect.email_sequence} label="Copy Email" />}
                {prospect.talk_track && <CopyButton text={prospect.talk_track} label="Copy Talk Track" />}
                {prospect.linkedin_inmail && <CopyButton text={prospect.linkedin_inmail} label="Copy LinkedIn" />}
              </div>

              {/* Why Now */}
              {prospect.why_now && (
                <AISection title="Why Now" content={prospect.why_now} color="#dc2626" />
              )}

              {/* Company Challenges */}
              {prospect.company_challenges && (
                <AISection title="Company Challenges" content={prospect.company_challenges} color="#d97706" />
              )}

              {/* Proposed Solution */}
              {prospect.proposed_solution && (
                <AISection title="Proposed Solution" content={prospect.proposed_solution} color="#0369a1" />
              )}

              {/* Strategic Rationale */}
              {prospect.store_rationale && (
                <AISection title="Strategic Rationale" content={prospect.store_rationale} color="#7c3aed" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AISection({ title, content, color }: { title: string; content: string; color: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #e2e8f0", whiteSpace: "pre-line" }}>
        {content}
      </div>
    </div>
  );
}

// ── Stats bar ──────────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1px solid #e2e8f0", flex: "1 1 100px", minWidth: 100, textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? "#1e293b", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ProspectListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [list, setList] = useState<ProspectList | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, ProspectContact[]>>({});
  const [loadingContacts, setLoadingContacts] = useState<Record<string, boolean>>({});
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [tierFilter, setTierFilter] = useState<"hot" | "warm" | "cold" | null>(null);
  const [search, setSearch] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadList() {
    if (!id) return;
    const data = await api.prospectingList(id);
    setList(data.list);
    setProspects(data.prospects);
  }

  useEffect(() => {
    if (!id) return;
    api.prospectingList(id)
      .then(data => { setList(data.list); setProspects(data.prospects); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // Poll while enriching or any prospect is generating AI
  useEffect(() => {
    const shouldPoll = list?.status === "enriching" || prospects.some(p => p.ai_status === "generating");
    if (shouldPoll) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => { loadList().catch(() => {}); }, 3000);
      }
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [list?.status, prospects]);

  async function handleRowClick(prospect: Prospect) {
    if (expandedId === prospect.id) { setExpandedId(null); return; }
    setExpandedId(prospect.id);
    if (!contacts[prospect.id] && !loadingContacts[prospect.id]) {
      setLoadingContacts(prev => ({ ...prev, [prospect.id]: true }));
      try {
        const c = await api.prospectContacts(prospect.id);
        setContacts(prev => ({ ...prev, [prospect.id]: c }));
      } catch {
        setContacts(prev => ({ ...prev, [prospect.id]: [] }));
      } finally {
        setLoadingContacts(prev => ({ ...prev, [prospect.id]: false }));
      }
    }
  }

  async function handleGenerateAI(prospectId: string) {
    setGeneratingIds(prev => new Set([...prev, prospectId]));
    setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, ai_status: "generating" } : p));
    try {
      await api.generateProspectAI(prospectId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to start AI generation");
      setGeneratingIds(prev => { const n = new Set(prev); n.delete(prospectId); return n; });
      setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, ai_status: "failed" } : p));
    }
  }

  async function handleTierChange(prospectId: string, tier: "hot" | "warm" | "cold") {
    setProspects(prev => prev.map(p => p.id === prospectId ? { ...p, tier } : p));
    await api.patchProspect(prospectId, { tier }).catch(() => {});
  }

  const stats = useMemo(() => {
    const enriched = prospects.filter(p => p.enrichment_status === "enriched");
    const hot = enriched.filter(p => p.tier === "hot").length;
    const warm = enriched.filter(p => p.tier === "warm").length;
    const cold = enriched.filter(p => p.tier === "cold").length;
    const scores = enriched.map(p => p.score).filter((s): s is number => s !== null);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const industryCounts: Record<string, number> = {};
    for (const p of enriched) {
      if (p.industry) industryCounts[p.industry] = (industryCounts[p.industry] ?? 0) + 1;
    }
    const topIndustry = Object.entries(industryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { hot, warm, cold, avgScore, topIndustry, enrichedCount: enriched.length };
  }, [prospects]);

  const filtered = useMemo(() => {
    let result = prospects;
    if (tierFilter) result = result.filter(p => p.tier === tierFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        (p.company_name ?? p.domain).toLowerCase().includes(q) ||
        p.domain.toLowerCase().includes(q) ||
        (p.industry ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [prospects, tierFilter, search]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: "80px 0", color: "#94a3b8" }}>Loading…</div>;
  }

  if (!list) {
    return <div style={{ textAlign: "center", padding: "80px 0", color: "#94a3b8" }}>List not found.</div>;
  }

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <button
            type="button"
            onClick={() => navigate("/prospecting")}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#64748b", padding: 0, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}
          >
            ← Prospect Lists
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{list.name}</h1>
            {list.status === "enriching" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#0369a1", background: "#e0f2fe", borderRadius: 8, padding: "3px 10px", fontWeight: 600 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 12, height: 12, animation: "spin 1.2s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Enriching {list.enriched_count}/{list.domain_count}…
              </div>
            )}
          </div>
          {list.owner_name && (
            <div style={{ marginTop: 4, fontSize: 13, color: "#94a3b8" }}>
              Owner: {list.owner_name}{list.owner_org ? ` — ${list.owner_org}` : ""}
            </div>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        <StatBox label="Total Domains" value={list.domain_count} />
        <StatBox label="Enriched" value={list.enriched_count} />
        <StatBox label="Avg Score" value={stats.avgScore ?? "—"} />
        <StatBox label="Hot" value={stats.hot} color="#dc2626" />
        <StatBox label="Warm" value={stats.warm} color="#d97706" />
        <StatBox label="Cold" value={stats.cold} color="#64748b" />
        {stats.topIndustry && (
          <StatBox label="Top Industry" value={IndustryLabel(stats.topIndustry).split(" ").slice(0, 2).join(" ")} />
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search company or domain…"
          style={{ padding: "7px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, width: 220 }}
        />
        {(["hot", "warm", "cold"] as const).map(t => {
          const s = TIER_STYLES[t];
          const active = tierFilter === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTierFilter(active ? null : t)}
              style={{
                padding: "6px 12px", border: `1px solid ${active ? s.color : "#e2e8f0"}`,
                borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: active ? s.bg : "#fff", color: active ? s.color : "#64748b",
              }}
            >
              {s.label}
            </button>
          );
        })}
        {(tierFilter || search) && (
          <button
            type="button"
            onClick={() => { setTierFilter(null); setSearch(""); }}
            style={{ fontSize: 12, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: "6px 8px" }}
          >
            Clear filters
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#94a3b8" }}>
          {filtered.length} of {prospects.length} prospects
        </span>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              {["Company", "Domain", "Tier", "Industry", "Employees", "Score", "UC Provider", "CC Provider", "AI", "Status"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: "40px 16px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
                  {prospects.length === 0 && list.status === "enriching"
                    ? "Enrichment in progress…"
                    : "No prospects match the current filters"}
                </td>
              </tr>
            ) : filtered.map(p => {
              const isExpanded = expandedId === p.id;
              const isPending = p.enrichment_status === "pending";
              const rowContacts = contacts[p.id] ?? [];
              const rowLoadingContacts = loadingContacts[p.id] ?? false;

              return [
                <tr
                  key={p.id}
                  onClick={() => handleRowClick(p)}
                  style={{ borderBottom: isExpanded ? "none" : "1px solid #f1f5f9", cursor: "pointer", background: isExpanded ? "#f0f9ff" : undefined }}
                >
                  {/* Company */}
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {p.logo_url ? (
                        <img src={p.logo_url} alt="" style={{ width: 22, height: 22, objectFit: "contain", borderRadius: 4, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div style={{ width: 22, height: 22, background: "#e2e8f0", borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>
                          {(p.company_name ?? p.domain)[0]?.toUpperCase()}
                        </div>
                      )}
                      <span style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>
                        {p.company_name ?? <span style={{ color: "#94a3b8", fontStyle: "italic" }}>{p.domain}</span>}
                      </span>
                    </div>
                  </td>

                  {/* Domain */}
                  <td style={{ padding: "12px 14px" }}>
                    <a
                      href={`https://${p.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: 12, color: "#0369a1", textDecoration: "none" }}
                    >
                      {p.domain}
                    </a>
                  </td>

                  {/* Tier */}
                  <td style={{ padding: "12px 14px" }}>
                    {isPending ? <span style={{ fontSize: 12, color: "#cbd5e1" }}>—</span> : <TierBadge tier={p.tier} />}
                  </td>

                  {/* Industry */}
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#475569", maxWidth: 160 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isPending ? "—" : IndustryLabel(p.industry)}
                    </div>
                  </td>

                  {/* Employees */}
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#475569" }}>
                    {isPending ? "—" : (p.employee_count ? p.employee_count.toLocaleString() : "—")}
                  </td>

                  {/* Score */}
                  <td style={{ padding: "12px 14px" }}>
                    {isPending ? <span style={{ fontSize: 12, color: "#cbd5e1" }}>—</span> : <ScorePip score={p.score} />}
                  </td>

                  {/* UC Provider */}
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#475569", maxWidth: 140 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isPending ? "—" : (p.uc_provider ?? <span style={{ color: "#cbd5e1" }}>—</span>)}
                    </div>
                  </td>

                  {/* CC Provider */}
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#475569", maxWidth: 140 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isPending ? "—" : (p.cc_provider ?? <span style={{ color: "#cbd5e1" }}>—</span>)}
                    </div>
                  </td>

                  {/* AI status */}
                  <td style={{ padding: "12px 14px" }}>
                    {p.ai_status === "ready" && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: "#dcfce7", color: "#166534", borderRadius: 6, padding: "2px 7px" }}>Ready</span>
                    )}
                    {(p.ai_status === "generating" || generatingIds.has(p.id)) && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: "#e0f2fe", color: "#0369a1", borderRadius: 6, padding: "2px 7px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ width: 9, height: 9, animation: "spin 1.2s linear infinite" }}>
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                        Gen…
                      </span>
                    )}
                    {p.ai_status === "failed" && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: "#fee2e2", color: "#dc2626", borderRadius: 6, padding: "2px 7px" }}>Failed</span>
                    )}
                    {p.ai_status === "none" && <span style={{ fontSize: 12, color: "#cbd5e1" }}>—</span>}
                  </td>

                  {/* Enrichment status */}
                  <td style={{ padding: "12px 14px" }}>
                    {p.enrichment_status === "pending" && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", background: "#f1f5f9", borderRadius: 6, padding: "2px 7px" }}>Pending</span>
                    )}
                    {p.enrichment_status === "enriched" && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#166534", background: "#dcfce7", borderRadius: 6, padding: "2px 7px" }}>✓</span>
                    )}
                    {p.enrichment_status === "failed" && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#dc2626", background: "#fee2e2", borderRadius: 6, padding: "2px 7px" }}>Failed</span>
                    )}
                  </td>
                </tr>,

                isExpanded && (
                  <tr key={`${p.id}-expanded`} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td colSpan={10} style={{ padding: 0 }}>
                      <ExpandedPanel
                        prospect={p}
                        contacts={rowContacts}
                        loadingContacts={rowLoadingContacts}
                        onGenerateAI={() => handleGenerateAI(p.id)}
                        generatingAI={generatingIds.has(p.id)}
                        onTierChange={tier => handleTierChange(p.id, tier)}
                      />
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
