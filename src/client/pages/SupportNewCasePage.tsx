import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { supportApi, supportAccounts, SEVERITY, CUSTOMER_SEVERITY_OPTIONS, STAFF_SEVERITY_OPTIONS, type AccountResult, type ContactResult, type SupportUser, type UserResult } from "../lib/supportApi";
import AccountSearch from "../components/support/AccountSearch";
import UserSearch from "../components/support/UserSearch";

export default function SupportNewCasePage() {
  const user = useOutletContext<SupportUser | null>();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severitycode, setSeveritycode] = useState<number>(SEVERITY.P3);
  const severityOptions = user?.isInternal ? STAFF_SEVERITY_OPTIONS : CUSTOMER_SEVERITY_OPTIONS;
  const [account, setAccount] = useState<AccountResult | null>(null);
  const [accountContacts, setAccountContacts] = useState<ContactResult[]>([]);
  const [primaryContactId, setPrimaryContactId] = useState("");
  const [notificationContactId, setNotificationContactId] = useState("");
  const [escalationEngineer, setEscalationEngineer] = useState<UserResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPrimaryContactId("");
    setNotificationContactId("");
    setAccountContacts([]);
    if (account?.id) {
      supportAccounts.getContacts(account.id).then(setAccountContacts).catch(() => {});
    }
  }, [account?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result = await supportApi.createCase({
        title,
        description,
        severitycode,
        ...(user?.isInternal && account ? { accountId: account.id } : {}),
        ...(primaryContactId ? { primaryContactId } : {}),
        ...(notificationContactId ? { notificationContactId } : {}),
        ...(escalationEngineer ? { escalationEngineerId: escalationEngineer.id } : {}),
      });
      const severityLabel = severityOptions.find((o) => o.value === severitycode)?.label ?? "P3";
      navigate("/support/cases/confirmation", {
        state: { id: result.id, ticketNumber: result.ticketNumber, title, severityLabel },
      });
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const selectStyle = { width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, background: "#fff", outline: "none" };

  return (
    <>
      <button onClick={() => navigate("/support/cases")} style={{ background: "none", border: "none", color: "#0891b2", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 20, display: "flex", alignItems: "center", gap: 4 }}>
        ← Back to cases
      </button>

      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "28px 32px", maxWidth: 680 }}>
        <h2 style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 700, color: "#1e293b" }}>Open a New Support Case</h2>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {user?.isInternal && (
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Account</label>
              <AccountSearch value={account} onChange={setAccount} />
            </div>
          )}

          <div>
            <label htmlFor="title" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Subject *</label>
            <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief summary of the issue" required
              style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          </div>

          <div>
            <label htmlFor="severity" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Severity</label>
            <select id="severity" value={severitycode} onChange={(e) => setSeveritycode(Number(e.target.value))} style={selectStyle}>
              {severityOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="description" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Description *</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={7} required
              placeholder="Describe the issue in detail — include any error messages, steps to reproduce, and how it's impacting your business."
              style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
          </div>

          {user?.isInternal && account && (
            <>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Primary Contact</label>
                <select value={primaryContactId} onChange={(e) => setPrimaryContactId(e.target.value)} style={selectStyle}>
                  <option value="">— None —</option>
                  {accountContacts.map((ct) => <option key={ct.id} value={ct.id}>{ct.name}{ct.email ? ` (${ct.email})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Notification Contact</label>
                <select value={notificationContactId} onChange={(e) => setNotificationContactId(e.target.value)} style={selectStyle}>
                  <option value="">— None —</option>
                  {accountContacts.map((ct) => <option key={ct.id} value={ct.id}>{ct.name}{ct.email ? ` (${ct.email})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Escalation Engineer</label>
                <UserSearch value={escalationEngineer} onChange={setEscalationEngineer} placeholder="Search PF staff…" />
              </div>
            </>
          )}

          {error && <div style={{ color: "#d13438", fontSize: 13, padding: "0.5rem 0.75rem", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>{error}</div>}

          <div style={{ display: "flex", gap: 12, paddingTop: 4 }}>
            <button type="submit" disabled={submitting}
              style={{ padding: "0.55rem 1.25rem", background: "#0891b2", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: submitting ? 0.7 : 1 }}>
              {submitting ? "Submitting…" : "Submit Case"}
            </button>
            <button type="button" onClick={() => navigate("/support/cases")}
              style={{ padding: "0.55rem 1.25rem", background: "#fff", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
