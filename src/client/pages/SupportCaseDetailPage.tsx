import { useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { supportApi, supportAccounts, formatSupportDate, fileToBase64, severityColor, type SupportCaseDetail, type ContactResult, type SupportUser, type UserResult } from "../lib/supportApi";
import { resolveVendorBadge, type LastVendor } from "../lib/vendorBadge";
import UserSearch from "../components/support/UserSearch";

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
}

function stateColor(s: string) { return s === "Resolved" ? "#22c55e" : s === "Cancelled" ? "#94a3b8" : "#0891b2"; }

const COLLAPSE = 300;

export default function SupportCaseDetailPage() {
  const user = useOutletContext<SupportUser | null>();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [caseData, setCaseData] = useState<SupportCaseDetail | null>(null);
  const [lastVendor, setLastVendor] = useState<LastVendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [statusComment, setStatusComment] = useState("");
  const [statusError, setStatusError] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const toggleNote = (noteId: string) =>
    setExpandedNotes((prev) => { const next = new Set(prev); next.has(noteId) ? next.delete(noteId) : next.add(noteId); return next; });

  // Contact editor
  const [showContactEditor, setShowContactEditor] = useState(false);
  const [accountContacts, setAccountContacts] = useState<ContactResult[]>([]);
  const [pickedPrimaryId, setPickedPrimaryId] = useState("");
  const [pickedContactId, setPickedContactId] = useState("");
  const [pickedEngineer, setPickedEngineer] = useState<UserResult | null>(null);
  const [pickedOwner, setPickedOwner] = useState<UserResult | null>(null);
  const [contactSaving, setContactSaving] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    supportApi.getCase(id)
      .then(setCaseData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  // Best-effort vendor lookup off the case's account — D365 hiccups shouldn't
  // break the case page, just silently skip the badge.
  useEffect(() => {
    if (!caseData?.accountId || !user?.isInternal) { setLastVendor(null); return; }
    supportApi.getAccountLastVendor(caseData.accountId).then(setLastVendor).catch(() => setLastVendor(null));
  }, [caseData?.accountId, user?.isInternal]);

  const submitNote = async () => {
    if (!id || (!noteText.trim() && !selectedFile)) return;
    setSubmitting(true);
    setNoteError("");
    try {
      if (selectedFile) {
        const documentbody = await fileToBase64(selectedFile);
        await supportApi.addAttachment(id, { filename: selectedFile.name, mimetype: selectedFile.type || "application/octet-stream", documentbody, notetext: noteText.trim() });
      } else {
        await supportApi.addNote(id, noteText.trim());
      }
      setNoteText("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (e: any) {
      setNoteError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (action: string) => {
    if (!id) return;
    setStatusSubmitting(true);
    setStatusError("");
    try {
      await supportApi.updateStatus(id, action, statusComment.trim() || undefined);
      setStatusComment("");
      load();
    } catch (e: any) {
      setStatusError(e.message);
    } finally {
      setStatusSubmitting(false);
    }
  };

  const openContactEditor = async (cd: SupportCaseDetail) => {
    setPickedPrimaryId(cd.primaryContactId ?? "");
    setPickedContactId(cd.notificationContactId ?? "");
    setPickedEngineer(cd.escalationEngineerId ? { id: cd.escalationEngineerId, name: cd.escalationEngineerName ?? "", email: "" } : null);
    setPickedOwner(cd.ownerId ? { id: cd.ownerId, name: cd.owner ?? "", email: "" } : null);
    if (user?.isInternal) {
      if (cd.accountId) supportAccounts.getContacts(cd.accountId).then(setAccountContacts).catch(() => setAccountContacts([]));
      else setAccountContacts([]);
    } else {
      supportApi.getMyContacts().then(setAccountContacts).catch(() => setAccountContacts([]));
    }
    setShowContactEditor(true);
  };

  const saveContacts = async () => {
    if (!id) return;
    setContactSaving(true);
    try {
      await supportApi.updateCaseContacts(id, {
        primaryContactId: pickedPrimaryId || null,
        notificationContactId: pickedContactId || null,
        ...(user?.isInternal ? { escalationEngineerId: pickedEngineer?.id ?? null, ownerId: pickedOwner?.id ?? null } : {}),
      });
      load();
      setShowContactEditor(false);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setContactSaving(false);
    }
  };

  if (loading) return <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>Loading case…</div>;
  if (error) return <div style={{ padding: "1rem", color: "#d13438", fontSize: 14 }}>{error}</div>;
  if (!caseData) return null;

  const isActive = caseData.statecode === 0;
  const isResolved = caseData.statecode === 1;
  const isCancelled = caseData.statecode === 2;

  const daysSinceClosed = caseData.modifiedOn
    ? (Date.now() - new Date(caseData.modifiedOn).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;
  const canCustomerReopen = !user?.isInternal && (isResolved || isCancelled) && daysSinceClosed <= 30;

  const inputStyle = { width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, outline: "none", boxSizing: "border-box" as const };
  const selectStyle = { ...inputStyle, background: "#fff" };
  const btnPrimary = { padding: "0.5rem 1rem", background: "#0891b2", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600 as const, cursor: "pointer" as const };
  const btnSecondary = { padding: "0.5rem 1rem", background: "#fff", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, cursor: "pointer" as const };
  const btnSm = { ...btnSecondary, padding: "0.35rem 0.75rem", fontSize: 12 };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <button onClick={() => navigate("/support/cases")}
        style={{ background: "none", border: "none", color: "#0891b2", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 20, display: "flex", alignItems: "center", gap: 4 }}>
        ← Back to cases
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>

        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Description card */}
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "20px 24px" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 700, color: "#1e293b" }}>{caseData.title}</h2>
            {caseData.description && (
              <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{caseData.description}</p>
            )}
          </div>

          {/* Notes card */}
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1e293b" }}>Activity &amp; Notes</h3>
            </div>

            {caseData.notes.length === 0 && (
              <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No notes yet.</div>
            )}

            {caseData.notes.map((note) => {
              const isLong = (note.text?.length ?? 0) > COLLAPSE;
              const isExpanded = expandedNotes.has(note.id);
              const displayText = isLong && !isExpanded ? note.text!.slice(0, COLLAPSE) + "…" : note.text;
              return (
                <div key={note.id} style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
                    <strong style={{ color: "#475569" }}>{note.createdBy}</strong> · {formatSupportDate(note.createdOn)}
                  </div>
                  {note.subject && <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#374151" }}>{note.subject}</p>}
                  {displayText && <p style={{ margin: 0, fontSize: 13, color: "#475569", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{displayText}</p>}
                  {isLong && (
                    <button onClick={() => toggleNote(note.id)}
                      style={{ background: "none", border: "none", color: "#0891b2", cursor: "pointer", padding: "4px 0 0", fontSize: 12 }}>
                      {isExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                  {note.isAttachment && note.filename && (
                    <a href={supportApi.getAttachmentUrl(caseData.id, note.id)} target="_blank" rel="noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: 13, color: "#0891b2", textDecoration: "none" }}>
                      📎 {note.filename}
                      {note.filesize != null && <span style={{ color: "#94a3b8", fontSize: 11 }}>({(note.filesize / 1024).toFixed(1)} KB)</span>}
                    </a>
                  )}
                </div>
              );
            })}

            {/* Add note */}
            {isActive && (
              <div style={{ padding: "16px 20px", borderTop: "1px solid #f1f5f9" }}>
                <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#374151" }}>Add a note</h4>
                <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3}
                  placeholder="Write a note or add a file…"
                  style={{ ...inputStyle, resize: "vertical" }} />
                {noteError && <div style={{ color: "#d13438", fontSize: 12, marginTop: 4 }}>{noteError}</div>}
                <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
                  <button onClick={submitNote} disabled={submitting || (!noteText.trim() && !selectedFile)} style={{ ...btnPrimary, opacity: (submitting || (!noteText.trim() && !selectedFile)) ? 0.6 : 1 }}>
                    {submitting ? "Submitting…" : "Submit"}
                  </button>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "#0891b2", cursor: "pointer", fontWeight: 600 }}>
                    📎 Attach file
                    <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
                  </label>
                  {selectedFile && <span style={{ fontSize: 12, color: "#64748b" }}>{selectedFile.name}</span>}
                </div>
              </div>
            )}

            {/* Customer reopen panel — only for closed cases within 30 days */}
            {canCustomerReopen && (
              <div style={{ padding: "16px 20px", borderTop: "1px solid #f1f5f9" }}>
                <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "#374151" }}>Reopen Case</h4>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b" }}>
                  This case was closed {Math.floor(daysSinceClosed)} day{Math.floor(daysSinceClosed) === 1 ? "" : "s"} ago. You can reopen it within 30 days of closure.
                </p>
                <textarea value={statusComment} onChange={(e) => setStatusComment(e.target.value)} rows={2}
                  placeholder="Reason for reopening…"
                  style={{ ...inputStyle, resize: "vertical", fontSize: 13 }} />
                {statusError && <div style={{ color: "#d13438", fontSize: 12, marginTop: 4 }}>{statusError}</div>}
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => updateStatus("reopen")} disabled={statusSubmitting}
                    style={{ ...btnSm, background: "#eff6ff", color: "#0891b2", borderColor: "#bae6fd" }}>
                    {statusSubmitting ? "Updating…" : "Reopen Case"}
                  </button>
                </div>
              </div>
            )}

            {/* Staff status update */}
            {user?.isInternal && (isActive || isResolved) && (
              <div style={{ padding: "16px 20px", borderTop: "1px solid #f1f5f9" }}>
                <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#374151" }}>Update Status</h4>
                <textarea value={statusComment} onChange={(e) => setStatusComment(e.target.value)} rows={2}
                  placeholder="Optional comment…"
                  style={{ ...inputStyle, resize: "vertical", fontSize: 13 }} />
                {statusError && <div style={{ color: "#d13438", fontSize: 12, marginTop: 4 }}>{statusError}</div>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {isActive && caseData.statuscode === 2 && (
                    <button onClick={() => updateStatus("in-progress")} disabled={statusSubmitting}
                      style={{ ...btnSm, background: "#eff6ff", color: "#0891b2", borderColor: "#bae6fd" }}>Mark In Progress</button>
                  )}
                  {isActive && (
                    <button onClick={() => updateStatus("resolve")} disabled={statusSubmitting}
                      style={{ ...btnSm, background: "#f0fdf4", color: "#16a34a", borderColor: "#bbf7d0" }}>
                      {statusSubmitting ? "Updating…" : "Resolve Case"}
                    </button>
                  )}
                  {isResolved && (
                    <button onClick={() => updateStatus("reopen")} disabled={statusSubmitting}
                      style={{ ...btnSm, background: "#eff6ff", color: "#0891b2", borderColor: "#bae6fd" }}>
                      {statusSubmitting ? "Updating…" : "Reopen Case"}
                    </button>
                  )}
                  {isActive && (
                    <button onClick={() => updateStatus("cancel")} disabled={statusSubmitting}
                      style={{ ...btnSm, background: "#fef2f2", color: "#d13438", borderColor: "#fecaca" }}>Cancel Case</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Metadata card */}
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "16px 20px" }}>
            {caseData.accountName && (
              <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{caseData.accountName}</span>
                {(() => {
                  const badge = resolveVendorBadge(lastVendor?.vendor);
                  if (!badge) return null;
                  const tooltip = lastVendor?.soldOn
                    ? `${lastVendor.techType ?? "UCaaS"} · sold ${formatSupportDate(lastVendor.soldOn)}`
                    : (lastVendor?.techType ?? "UCaaS");
                  return (
                    <span
                      title={tooltip}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                        background: `${badge.color}1a`,
                        color: badge.color,
                        border: `1px solid ${badge.color}40`,
                        lineHeight: 1.3,
                      }}
                    >
                      {badge.label}
                    </span>
                  );
                })()}
              </div>
            )}
            {[
              { label: "Status", value: <Badge label={caseData.status} color={stateColor(caseData.state)} /> },
              { label: "Severity", value: caseData.severity
                ? <Badge label={caseData.severity} color={severityColor(caseData.severity)} />
                : <span style={{ fontSize: 13, color: "#94a3b8" }}>—</span> },
              { label: "Assigned To", value: <span style={{ fontSize: 13, color: "#475569" }}>{caseData.owner ?? "Unassigned"}</span> },
              { label: "Opened", value: <span style={{ fontSize: 13, color: "#475569" }}>{formatSupportDate(caseData.createdOn)}</span> },
              { label: "Ticket #", value: <span style={{ fontSize: 12, fontFamily: "monospace", color: "#475569", background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>{caseData.ticketNumber}</span> },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f8fafc" }}>
                <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{label}</span>
                {value}
              </div>
            ))}
          </div>

          {/* Contacts card */}
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Contacts</span>
              <button type="button" onClick={() => openContactEditor(caseData)} style={btnSm}>Edit</button>
            </div>
            {[
              { label: "Primary", value: caseData.primaryContactName },
              { label: "Notification", value: caseData.notificationContactName },
              ...(user?.isInternal ? [{ label: "Escalation Eng.", value: caseData.escalationEngineerName }] : []),
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f8fafc" }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
                <span style={{ fontSize: 13, color: value ? "#475569" : "#cbd5e1" }}>{value ?? "None"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contact editor modal */}
      {showContactEditor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: "1rem" }}>
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1e293b" }}>Edit Contacts</h3>
              <button type="button" onClick={() => setShowContactEditor(false)} style={btnSm}>✕</button>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Primary Contact</label>
                <select value={pickedPrimaryId} onChange={(e) => setPickedPrimaryId(e.target.value)} style={selectStyle}>
                  <option value="">— None —</option>
                  {accountContacts.map((ct) => <option key={ct.id} value={ct.id}>{ct.name}{ct.email ? ` (${ct.email})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Notification Contact</label>
                <select value={pickedContactId} onChange={(e) => setPickedContactId(e.target.value)} style={selectStyle}>
                  <option value="">— None —</option>
                  {accountContacts.map((ct) => <option key={ct.id} value={ct.id}>{ct.name}{ct.email ? ` (${ct.email})` : ""}</option>)}
                </select>
                {accountContacts.length === 0 && <span style={{ fontSize: 12, color: "#94a3b8" }}>No contacts available for this account.</span>}
              </div>
              {user?.isInternal && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Escalation Engineer</label>
                    <UserSearch value={pickedEngineer} onChange={setPickedEngineer} placeholder="Search PF staff…" />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Owner</label>
                    <UserSearch value={pickedOwner} onChange={setPickedOwner} placeholder="Search PF staff…" />
                  </div>
                </>
              )}
            </div>
            <div style={{ padding: "14px 20px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowContactEditor(false)} style={btnSecondary}>Cancel</button>
              <button type="button" onClick={saveContacts} disabled={contactSaving} style={{ ...btnPrimary, opacity: contactSaving ? 0.7 : 1 }}>
                {contactSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
