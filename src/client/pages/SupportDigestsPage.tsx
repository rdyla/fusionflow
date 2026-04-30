import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  supportAccounts, supportDigests,
  type AccountResult, type ContactResult, type DigestPreview, type DigestHistoryRow, type SupportUser,
} from "../lib/supportApi";
import AccountSearch from "../components/support/AccountSearch";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseExtraEmails(input: string): string[] {
  return input
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && EMAIL_RE.test(s));
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function SupportDigestsPage() {
  const user = useOutletContext<SupportUser | null>();
  const navigate = useNavigate();

  const [account, setAccount]         = useState<AccountResult | null>(null);
  const [contacts, setContacts]       = useState<ContactResult[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [extraEmails, setExtraEmails] = useState("");

  const [preview, setPreview]         = useState<DigestPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError]     = useState("");

  const [sending, setSending]         = useState(false);
  const [sendError, setSendError]     = useState("");
  const [sendSuccess, setSendSuccess] = useState("");

  const [history, setHistory]         = useState<DigestHistoryRow[]>([]);

  // Gate: must be a supervisor
  useEffect(() => {
    if (user === null) return;
    if (!user.isSupportSupervisor) {
      navigate(user.isInternal ? "/support/dashboard" : "/support/cases", { replace: true });
    }
  }, [user, navigate]);

  // Initial history load
  useEffect(() => {
    if (!user?.isSupportSupervisor) return;
    supportDigests.history().then(setHistory).catch(() => {});
  }, [user?.isSupportSupervisor]);

  // When account changes: load contacts + preview in parallel
  useEffect(() => {
    if (!account) {
      setContacts([]); setSelectedIds(new Set()); setPreview(null); setPreviewError(""); return;
    }
    setContactsLoading(true);
    supportAccounts.getContacts(account.id)
      .then((c) => { setContacts(c); setSelectedIds(new Set(c.filter((ct) => ct.email).map((ct) => ct.id))); })
      .catch(() => setContacts([]))
      .finally(() => setContactsLoading(false));

    setPreviewLoading(true); setPreviewError("");
    supportDigests.preview(account.id, account.name)
      .then(setPreview)
      .catch((e) => setPreviewError(e.message))
      .finally(() => setPreviewLoading(false));
  }, [account]);

  const recipients = useMemo(() => {
    const fromContacts = contacts
      .filter((c) => selectedIds.has(c.id) && c.email && EMAIL_RE.test(c.email))
      .map((c) => ({ name: c.name, email: c.email }));
    const fromExtras = parseExtraEmails(extraEmails).map((email) => ({ email }));
    // Dedupe by email (case-insensitive)
    const seen = new Set<string>();
    return [...fromContacts, ...fromExtras].filter((r) => {
      const k = r.email.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [contacts, selectedIds, extraEmails]);

  function toggleContact(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function handleSend() {
    if (!account || recipients.length === 0) return;
    setSending(true); setSendError(""); setSendSuccess("");
    try {
      await supportDigests.send({ accountId: account.id, accountName: account.name, recipients });
      setSendSuccess(`Sent to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}.`);
      setExtraEmails("");
      // Refresh history
      const updated = await supportDigests.history();
      setHistory(updated);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (user === null) {
    return <div style={{ padding: 40, color: "#64748b" }}>Loading…</div>;
  }
  if (!user.isSupportSupervisor) {
    return null; // redirecting
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Subnav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #e2e8f0" }}>
        <button onClick={() => navigate("/support/dashboard")}
          style={{ padding: "8px 14px", background: "transparent", border: "none", borderBottom: "2px solid transparent", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer" }}>
          Dashboard
        </button>
        <button onClick={() => navigate("/support/cases")}
          style={{ padding: "8px 14px", background: "transparent", border: "none", borderBottom: "2px solid transparent", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer" }}>
          Cases
        </button>
        <button
          style={{ padding: "8px 14px", background: "transparent", border: "none", borderBottom: "2px solid #0891b2", fontSize: 13, fontWeight: 600, color: "#0891b2", cursor: "default" }}>
          Digests
        </button>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h1 className="ms-page-title">Customer Support Digests</h1>
        <p className="ms-page-subtitle">Send a 30-day support snapshot to a customer's contacts.</p>
      </div>

      {/* Step 1: pick a customer */}
      <div className="ms-section-card" style={{ marginBottom: 16 }}>
        <div className="ms-section-title">1. Customer</div>
        <AccountSearch value={account} onChange={setAccount} />
      </div>

      {account && (
        <>
          {/* Step 2: recipients */}
          <div className="ms-section-card" style={{ marginBottom: 16 }}>
            <div className="ms-section-title">2. Recipients</div>
            {contactsLoading ? (
              <div style={{ fontSize: 13, color: "#94a3b8" }}>Loading contacts…</div>
            ) : contacts.length === 0 ? (
              <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic", marginBottom: 12 }}>
                No CRM contacts on file for this account. Add recipient emails manually below.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8, marginBottom: 14 }}>
                {contacts.map((c) => {
                  const checked = selectedIds.has(c.id);
                  const hasEmail = !!c.email && EMAIL_RE.test(c.email);
                  return (
                    <label
                      key={c.id}
                      title={hasEmail ? c.email : "No email on file"}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                        border: `1px solid ${checked ? "#0891b2" : "#e2e8f0"}`,
                        background: checked ? "#ecfeff" : (hasEmail ? "#fff" : "#f8fafc"),
                        borderRadius: 6, cursor: hasEmail ? "pointer" : "not-allowed",
                        opacity: hasEmail ? 1 : 0.55,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!hasEmail}
                        onChange={() => toggleContact(c.id)}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email || "no email"}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <label style={{ display: "block", fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>
              Add additional recipients (comma- or newline-separated)
            </label>
            <textarea
              className="ms-input"
              rows={2}
              value={extraEmails}
              onChange={(e) => setExtraEmails(e.target.value)}
              placeholder="e.g. ops@customer.com, manager@customer.com"
              style={{ width: "100%", fontSize: 13 }}
            />
            <div style={{ marginTop: 10, fontSize: 12, color: "#475569" }}>
              <strong style={{ color: "#1e293b" }}>{recipients.length}</strong> recipient{recipients.length === 1 ? "" : "s"} ready to send
            </div>
          </div>

          {/* Step 3: preview */}
          <div className="ms-section-card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="ms-section-title" style={{ marginBottom: 0 }}>3. Preview</div>
              {preview && (
                <div style={{ display: "flex", gap: 14, fontSize: 12, color: "#475569" }}>
                  <span><strong style={{ color: "#1e293b" }}>{preview.data.kpis.open}</strong> open</span>
                  <span><strong style={{ color: "#1e293b" }}>{preview.data.kpis.resolved}</strong> resolved</span>
                  <span style={{ color: preview.data.kpis.stale > 0 ? "#d13438" : undefined }}>
                    <strong>{preview.data.kpis.stale}</strong> stale
                  </span>
                  <span style={{ color: preview.data.kpis.stuckOnCustomer > 0 ? "#ff8c00" : undefined }}>
                    <strong>{preview.data.kpis.stuckOnCustomer}</strong> awaiting customer
                  </span>
                </div>
              )}
            </div>
            {previewLoading ? (
              <div style={{ padding: 24, fontSize: 13, color: "#94a3b8" }}>Building preview…</div>
            ) : previewError ? (
              <div style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, color: "#b91c1c", fontSize: 13 }}>
                {previewError}
              </div>
            ) : preview ? (
              <>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                  Subject: <strong style={{ color: "#1e293b" }}>{preview.subject}</strong>
                </div>
                <iframe
                  srcDoc={preview.html}
                  title="Digest preview"
                  sandbox=""
                  style={{ width: "100%", height: 720, border: "1px solid #e2e8f0", borderRadius: 6, background: "#0d1b2e" }}
                />
              </>
            ) : null}
          </div>

          {/* Step 4: send */}
          <div className="ms-section-card" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="ms-section-title" style={{ marginBottom: 4 }}>4. Send</div>
                {sendSuccess && <div style={{ fontSize: 13, color: "#059669", fontWeight: 600 }}>{sendSuccess}</div>}
                {sendError   && <div style={{ fontSize: 13, color: "#d13438" }}>{sendError}</div>}
                {!sendSuccess && !sendError && (
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Sends as <strong style={{ color: "#1e293b" }}>CloudConnect</strong> (Microsoft Graph) to {recipients.length} recipient{recipients.length === 1 ? "" : "s"}.
                  </div>
                )}
              </div>
              <button
                className="ms-btn-primary"
                disabled={sending || !preview || previewLoading || recipients.length === 0}
                onClick={handleSend}
                style={{ minWidth: 140 }}
              >
                {sending ? "Sending…" : "Send Digest"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Sent history */}
      <div className="ms-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.07)", fontWeight: 700, fontSize: 14, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Recently Sent
        </div>
        {history.length === 0 ? (
          <div style={{ padding: "24px 20px", color: "#64748b", fontSize: 13 }}>
            No digests sent yet.
          </div>
        ) : (
          <table className="ms-table">
            <thead>
              <tr>
                {["Sent", "Customer", "Recipients", "Snapshot", "Sent By"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td style={{ fontSize: 12, color: "#475569", whiteSpace: "nowrap" }}>{formatTimestamp(h.sentAt)}</td>
                  <td style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{h.accountName}</td>
                  <td style={{ fontSize: 12, color: "#475569" }}>
                    <span title={h.recipients.map((r) => r.email).join(", ")}>
                      {h.recipients.length} · {h.recipients.slice(0, 2).map((r) => r.email).join(", ")}
                      {h.recipients.length > 2 ? ` +${h.recipients.length - 2}` : ""}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "#475569", whiteSpace: "nowrap" }}>
                    <span style={{ marginRight: 10 }}><strong style={{ color: "#1e293b" }}>{h.kpis.open}</strong> open</span>
                    <span style={{ marginRight: 10 }}><strong style={{ color: "#1e293b" }}>{h.kpis.resolved}</strong> resolved</span>
                    {h.kpis.stale > 0 && <span style={{ marginRight: 10, color: "#d13438" }}><strong>{h.kpis.stale}</strong> stale</span>}
                    {h.kpis.stuckOnCustomer > 0 && <span style={{ color: "#ff8c00" }}><strong>{h.kpis.stuckOnCustomer}</strong> awaiting</span>}
                  </td>
                  <td style={{ fontSize: 12, color: "#475569" }} title={h.sentByEmail ?? ""}>{h.sentByName ?? h.sentByEmail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
