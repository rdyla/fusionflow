import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type CaseNote, type SupportCase, type User } from "../lib/api";

const PRIORITY_COLORS: Record<number, string> = { 1: "#ef4444", 2: "#d97706", 3: "#6b7280" };
const STATE_COLORS: Record<number, string> = { 0: "#63c1ea", 1: "#059669", 2: "#6b7280" };

// Active sub-statuses
const ACTIVE_STATUSES = [
  { label: "In Progress", statecode: 0, statuscode: 1 },
  { label: "On Hold", statecode: 0, statuscode: 2 },
  { label: "Waiting for Details", statecode: 0, statuscode: 3 },
  { label: "Researching", statecode: 0, statuscode: 4 },
];
const RESOLVED_STATUSES = [
  { label: "Problem Solved", statecode: 1, statuscode: 5 },
  { label: "Information Provided", statecode: 1, statuscode: 1000 },
];
const CANCELLED_STATUSES = [
  { label: "Cancelled", statecode: 2, statuscode: 2000 },
  { label: "Merged", statecode: 2, statuscode: 2001 },
];
const ALL_STATUSES = [...ACTIVE_STATUSES, ...RESOLVED_STATUSES, ...CANCELLED_STATUSES];

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ background: `${color}22`, border: `1px solid ${color}55`, color, borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 600, letterSpacing: "0.03em" }}>
      {children}
    </span>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export default function SupportCasePage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [incident, setIncident] = useState<SupportCase | null>(null);
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [loading, setLoading] = useState(true);

  const [noteText, setNoteText] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.me().then(r => setCurrentUser(r.user)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!caseId) return;
    Promise.all([
      api.supportCase(caseId),
      api.caseNotes(caseId),
    ]).then(([c, n]) => {
      setIncident(c);
      setNotes(n);
      // Pre-select current status
      const match = ALL_STATUSES.find(s => s.statecode === c.statecode && s.statuscode === c.statuscode);
      setSelectedStatus(match ? `${c.statecode}:${c.statuscode}` : "");
    }).catch(() => {}).finally(() => setLoading(false));
  }, [caseId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleStatusUpdate() {
    if (!caseId || !selectedStatus) return;
    const [sc, ssc] = selectedStatus.split(":").map(Number);
    setUpdatingStatus(true);
    try {
      await api.updateSupportCase(caseId, { statecode: sc, statuscode: ssc });
      const match = ALL_STATUSES.find(s => s.statecode === sc && s.statuscode === ssc);
      setIncident(prev => prev ? { ...prev, statecode: sc, statuscode: ssc, status: match?.label ?? prev.status } : prev);
      showToast("Status updated");
    } catch {
      showToast("Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleAddNote() {
    if (!caseId || !noteText.trim()) return;
    setSubmittingNote(true);
    try {
      const note = await api.addCaseNote(caseId, { notetext: noteText.trim() });
      setNotes(prev => [...prev, note]);
      setNoteText("");
      showToast("Note added");
    } catch {
      showToast("Failed to add note");
    } finally {
      setSubmittingNote(false);
    }
  }

  async function handleFileUpload() {
    if (!caseId || !attachFile) return;
    setUploadingFile(true);
    try {
      const note = await api.uploadCaseAttachment(caseId, attachFile);
      setNotes(prev => [...prev, note]);
      setAttachFile(null);
      if (fileRef.current) fileRef.current.value = "";
      showToast("File attached");
    } catch {
      showToast("Failed to upload file");
    } finally {
      setUploadingFile(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 48, textAlign: "center", color: "rgba(240,246,255,0.4)", fontSize: 13 }}>Loading…</div>;
  }

  if (!incident) {
    return <div style={{ padding: 48, textAlign: "center", color: "rgba(240,246,255,0.4)", fontSize: 13 }}>Case not found.</div>;
  }

  const stateColor = STATE_COLORS[incident.statecode] ?? "#6b7280";
  const priorityColor = PRIORITY_COLORS[incident.prioritycode] ?? "#6b7280";
  const statusKey = `${incident.statecode}:${incident.statuscode}`;
  const statusChanged = selectedStatus !== statusKey;

  return (
    <div>
      {/* Back */}
      <button onClick={() => navigate("/support")} style={{ background: "none", border: "none", color: "rgba(240,246,255,0.45)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 20, padding: 0 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
        Back to Cases
      </button>

      {/* Case header */}
      <div className="ms-section-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              {incident.ticketNumber && (
                <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 700, color: "#d97706", letterSpacing: "0.04em" }}>
                  {incident.ticketNumber}
                </span>
              )}
              <Badge color={stateColor}>{incident.status}</Badge>
              <Badge color={priorityColor}>{incident.priority} Priority</Badge>
              {incident.caseType && (
                <Badge color="rgba(240,246,255,0.3)">{incident.caseType}</Badge>
              )}
            </div>
            <h1 style={{ fontFamily: "'Jost', sans-serif", fontSize: 20, fontWeight: 700, margin: "0 0 8px", lineHeight: 1.25 }}>{incident.title}</h1>
            <div style={{ display: "flex", gap: 20, fontSize: 12, color: "rgba(240,246,255,0.45)", flexWrap: "wrap" }}>
              {incident.accountName && <span>Account: <span style={{ color: "rgba(240,246,255,0.7)" }}>{incident.accountName}</span></span>}
              {incident.ownerName && <span>Owner: <span style={{ color: "rgba(240,246,255,0.7)" }}>{incident.ownerName}</span></span>}
              <span>Opened: <span style={{ color: "rgba(240,246,255,0.7)" }}>{fmt(incident.createdOn)}</span></span>
              <span>Updated: <span style={{ color: "rgba(240,246,255,0.7)" }}>{fmt(incident.modifiedOn)}</span></span>
            </div>
          </div>

          {/* Status update — internal staff only */}
          {currentUser?.role !== "client" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <select
                className="ms-input"
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                style={{ width: 200 }}
              >
                <optgroup label="Active">
                  {ACTIVE_STATUSES.map(s => <option key={`${s.statecode}:${s.statuscode}`} value={`${s.statecode}:${s.statuscode}`}>{s.label}</option>)}
                </optgroup>
                <optgroup label="Resolved">
                  {RESOLVED_STATUSES.map(s => <option key={`${s.statecode}:${s.statuscode}`} value={`${s.statecode}:${s.statuscode}`}>{s.label}</option>)}
                </optgroup>
                <optgroup label="Cancelled">
                  {CANCELLED_STATUSES.map(s => <option key={`${s.statecode}:${s.statuscode}`} value={`${s.statecode}:${s.statuscode}`}>{s.label}</option>)}
                </optgroup>
              </select>
              <button
                className="ms-btn-primary"
                onClick={handleStatusUpdate}
                disabled={!statusChanged || updatingStatus}
                style={{ opacity: statusChanged ? 1 : 0.4 }}
              >
                {updatingStatus ? "Saving…" : "Update"}
              </button>
            </div>
          )}
        </div>

        {incident.description && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "rgba(240,246,255,0.3)", marginBottom: 8 }}>Description</div>
            <p style={{ fontSize: 13, color: "rgba(240,246,255,0.7)", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{incident.description}</p>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>

        {/* Notes thread */}
        <div className="ms-section-card">
          <div style={{ fontFamily: "'Jost', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 20, color: "#f0f6ff" }}>
            Notes &amp; Activity
          </div>

          {notes.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "rgba(240,246,255,0.3)", fontSize: 13 }}>No notes yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {notes.map((note, i) => (
                <div key={note.id} style={{ paddingBottom: 16, marginBottom: i < notes.length - 1 ? 16 : 0, borderBottom: i < notes.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: note.isAttachment ? "rgba(217,119,6,0.2)" : "rgba(99,193,234,0.15)", border: `1px solid ${note.isAttachment ? "rgba(217,119,6,0.4)" : "rgba(99,193,234,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "center", color: note.isAttachment ? "#d97706" : "#63c1ea", flexShrink: 0 }}>
                      {note.isAttachment
                        ? <FileIcon />
                        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ width: 13, height: 13 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(240,246,255,0.85)" }}>{note.subject ?? (note.isAttachment ? "Attachment" : "Note")}</span>
                      <span style={{ fontSize: 11, color: "rgba(240,246,255,0.3)", marginLeft: 10 }}>{fmt(note.createdOn)}</span>
                      {note.createdBy && (
                        <span style={{ fontSize: 11, color: "rgba(240,246,255,0.25)", marginLeft: 8 }}>· {note.createdBy}</span>
                      )}
                    </div>
                  </div>

                  {note.isAttachment && note.filename ? (
                    <div style={{ marginLeft: 36, display: "flex", alignItems: "center", gap: 10 }}>
                      <a
                        href={api.caseAttachmentDownloadUrl(incident.id, note.id)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#d97706", textDecoration: "none", background: "rgba(217,119,6,0.1)", border: "1px solid rgba(217,119,6,0.3)", borderRadius: 6, padding: "4px 10px" }}
                      >
                        <FileIcon />
                        {note.filename}
                      </a>
                      {note.text && <span style={{ fontSize: 12, color: "rgba(240,246,255,0.5)" }}>{note.text}</span>}
                    </div>
                  ) : note.text ? (
                    <p style={{ margin: "0 0 0 36px", fontSize: 13, color: "rgba(240,246,255,0.65)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{note.text}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {/* Add note */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <label className="ms-label">Add a Note</label>
            <textarea
              className="ms-input"
              placeholder="Type your note here…"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              style={{ width: "100%", minHeight: 80, resize: "vertical", marginBottom: 10 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="ms-btn-primary" onClick={handleAddNote} disabled={submittingNote || !noteText.trim()}>
                {submittingNote ? "Adding…" : "Add Note"}
              </button>
            </div>
          </div>
        </div>

        {/* Attachments panel */}
        <div className="ms-section-card">
          <div style={{ fontFamily: "'Jost', sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 16, color: "#f0f6ff" }}>
            Attach a File
          </div>
          <input
            ref={fileRef}
            type="file"
            style={{ display: "none" }}
            onChange={e => setAttachFile(e.target.files?.[0] ?? null)}
          />
          <div
            onClick={() => fileRef.current?.click()}
            style={{ border: "2px dashed rgba(217,119,6,0.3)", borderRadius: 10, padding: "24px 16px", textAlign: "center", cursor: "pointer", transition: "border-color 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(217,119,6,0.6)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(217,119,6,0.3)")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.5" style={{ width: 28, height: 28, margin: "0 auto 8px", display: "block", opacity: 0.6 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div style={{ fontSize: 12, color: "rgba(240,246,255,0.5)", lineHeight: 1.5 }}>
              {attachFile ? <span style={{ color: "#d97706", fontWeight: 600 }}>{attachFile.name}</span> : "Click to choose a file"}
            </div>
          </div>

          {attachFile && (
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button className="ms-btn-secondary" onClick={() => { setAttachFile(null); if (fileRef.current) fileRef.current.value = ""; }} style={{ flex: 1 }}>Clear</button>
              <button className="ms-btn-primary" onClick={handleFileUpload} disabled={uploadingFile} style={{ flex: 1 }}>
                {uploadingFile ? "Uploading…" : "Upload"}
              </button>
            </div>
          )}

          {/* Recent attachments list */}
          {notes.filter(n => n.isAttachment).length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "rgba(240,246,255,0.3)", marginBottom: 10 }}>Attachments</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {notes.filter(n => n.isAttachment).map(n => (
                  <a key={n.id}
                    href={api.caseAttachmentDownloadUrl(incident.id, n.id)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(240,246,255,0.7)", textDecoration: "none", padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  >
                    <span style={{ color: "#d97706", flexShrink: 0 }}><FileIcon /></span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.filename}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "rgba(2,26,46,0.95)", backdropFilter: "blur(12px)", border: "1px solid rgba(217,119,6,0.4)", borderRadius: 12, padding: "14px 24px", fontFamily: "'Jost', sans-serif", fontSize: 14, fontWeight: 600, color: "#d97706", zIndex: 100, whiteSpace: "nowrap", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
