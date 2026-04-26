/**
 * Meeting-prep email modal — generic over `:meetingType`.
 *
 * Migrated from `WelcomeEmailModal.tsx`. Shared envelope (recipients, PM
 * note, sections checklist, attachments, preview, test send, send) is
 * meeting-type-agnostic. Type-specific form fields are rendered via a
 * conditional based on `meetingType`.
 */

import { useEffect, useMemo, useState } from "react";
import { api, type MeetingType, type MeetingPrepDraft, type MeetingPrepOptions } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";
import {
  sectionsApplicableToTypes,
  type MeetingPrepSectionMeta,
} from "../../../shared/meetingPrep";
import { parseSolutionTypes } from "../../../shared/solutionTypes";
import KickoffPrepFields from "./KickoffPrepFields";

type Props = {
  projectId: string;
  meetingType: MeetingType;
  options: MeetingPrepOptions;
  onClose: () => void;
  onSent: (sentAt: string) => void;
};

const MAX_BYTES = 3 * 1024 * 1024;

const MEETING_TYPE_TITLES: Record<MeetingType, string> = {
  kickoff: "Send Welcome Email",
};

const MEETING_TYPE_VERBS: Record<MeetingType, string> = {
  kickoff: "welcome email",
};

function fmtKb(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function MeetingPrepModal({ projectId, meetingType, options, onClose, onSent }: Props) {
  const { showToast } = useToast();
  const [pmCustomNote, setPmCustomNote] = useState("");
  const [kickoffMeetingUrl, setKickoffMeetingUrl] = useState(options.project.kickoffMeetingUrl ?? "");
  const [kickoffWhen, setKickoffWhen] = useState(options.project.kickoffDate ?? "");
  const [distributionListEmail, setDistributionListEmail] = useState(options.project.suggestedDistributionListEmail ?? "");

  // Sections applicable to this project's solution types — catalog-driven.
  const projectSolutionTypes = useMemo(
    () => parseSolutionTypes(options.project.solutionTypes ?? []),
    [options.project.solutionTypes]
  );
  const applicableSections: readonly MeetingPrepSectionMeta[] = useMemo(
    () => sectionsApplicableToTypes(options.catalog, projectSolutionTypes),
    [options.catalog, projectSolutionTypes]
  );
  const [sectionEnabled, setSectionEnabled] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const meta of applicableSections) out[meta.id] = meta.defaultEnabled;
    return out;
  });
  const isSectionOn = (id: string) => sectionEnabled[id] === true;
  const toggleSection = (id: string) => setSectionEnabled((prev) => ({ ...prev, [id]: !prev[id] }));

  const [contactIds, setContactIds] = useState<Set<string>>(new Set());
  const [staffUserIds, setStaffUserIds] = useState<Set<string>>(new Set());
  const [includeZoomRep, setIncludeZoomRep] = useState(false);
  const [zoomRepName, setZoomRepName] = useState("");
  const [zoomRepEmail, setZoomRepEmail] = useState("");
  const [extraEmailsText, setExtraEmailsText] = useState("");
  const [attachmentUrls, setAttachmentUrls] = useState<Set<string>>(new Set());

  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewRecipientCount, setPreviewRecipientCount] = useState<number>(0);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };

  const extraEmails = useMemo(
    () => extraEmailsText.split(/[,\s;]+/).map((e) => e.trim()).filter(Boolean),
    [extraEmailsText]
  );

  const attachmentsTotalBytes = useMemo(() => {
    let total = 0;
    for (const f of options.sharepoint.files) {
      if (attachmentUrls.has(f.webUrl)) total += f.size ?? 0;
    }
    return total;
  }, [attachmentUrls, options.sharepoint.files]);
  const attachmentsOverLimit = attachmentsTotalBytes > MAX_BYTES;

  const buildDraft = (): MeetingPrepDraft => ({
    pmCustomNote,
    kickoffMeetingUrl: kickoffMeetingUrl.trim() || null,
    kickoffWhen: kickoffWhen.trim() || null,
    distributionListEmail: distributionListEmail.trim() || null,
    sections: sectionEnabled,
    recipients: {
      contactIds: Array.from(contactIds),
      staffUserIds: Array.from(staffUserIds),
      zoomRep: includeZoomRep && zoomRepEmail.trim()
        ? { name: zoomRepName.trim() || zoomRepEmail.trim(), email: zoomRepEmail.trim() }
        : null,
      extraEmails,
    },
    attachmentUrls: Array.from(attachmentUrls),
  });

  const refreshPreview = async () => {
    setLoadingPreview(true);
    try {
      const res = await api.meetingPrepPreview(projectId, meetingType, buildDraft());
      setPreviewHtml(res.html);
      setPreviewRecipientCount(res.recipientCount);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => { refreshPreview(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const onTest = async () => {
    if (attachmentsOverLimit) {
      showToast("Attachments exceed 3 MB limit", "error");
      return;
    }
    setTesting(true);
    try {
      const res = await api.meetingPrepTest(projectId, meetingType, buildDraft());
      showToast(`Test sent to ${res.sentTo}`, "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setTesting(false);
    }
  };

  const onSend = async () => {
    if (previewRecipientCount === 0) {
      showToast("Select at least one recipient", "error");
      return;
    }
    if (attachmentsOverLimit) {
      showToast("Attachments exceed 3 MB limit", "error");
      return;
    }
    const verb = MEETING_TYPE_VERBS[meetingType];
    if (!window.confirm(`Send ${verb} to ${previewRecipientCount} recipient${previewRecipientCount === 1 ? "" : "s"}?`)) return;
    setSending(true);
    try {
      const res = await api.meetingPrepSend(projectId, meetingType, buildDraft());
      showToast(`${verb.charAt(0).toUpperCase()}${verb.slice(1)} sent to ${res.sentTo.length} recipient${res.sentTo.length === 1 ? "" : "s"}`, "success");
      onSent(res.sentAt);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSending(false);
    }
  };

  const checkbox = (label: string, sublabel: string | null, checked: boolean, onChange: () => void) => (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", cursor: "pointer", borderRadius: 4 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ marginTop: 3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#1e293b", fontWeight: 500 }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: "#64748b" }}>{sublabel}</div>}
      </div>
    </label>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: 1080, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #e2e8f0" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{MEETING_TYPE_TITLES[meetingType]}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{options.project.name}</div>
          </div>
          <button className="ms-btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", flex: 1, overflow: "hidden" }}>
          {/* ── LEFT: Draft form ────────────────────────────────────────── */}
          <div style={{ padding: 20, overflowY: "auto", borderRight: "1px solid #e2e8f0" }}>

            {/* Recipients */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Customer Contacts</div>
              {options.recipients.contacts.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No contacts on this project.</div>}
              {options.recipients.contacts.map((ct) => checkbox(ct.name, ct.jobTitle ? `${ct.jobTitle} · ${ct.email}` : ct.email, contactIds.has(ct.id), () => toggle(contactIds, ct.id, setContactIds)))}
            </div>

            {(() => {
              const pfStaff = options.recipients.staff.filter((s) => !s.isPartner);
              const partnerStaff = options.recipients.staff.filter((s) => s.isPartner);
              const vendor = options.project.vendor?.trim();
              const partnerLabel = vendor ? `${vendor} Team` : "Partner Team";
              return (
                <>
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>PF Team</div>
                    {pfStaff.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No PF staff on this project.</div>}
                    {pfStaff.map((s) => checkbox(s.name, `${s.role} · ${s.email}`, staffUserIds.has(s.id), () => toggle(staffUserIds, s.id, setStaffUserIds)))}
                  </div>
                  {partnerStaff.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>{partnerLabel}</div>
                      {partnerStaff.map((s) => checkbox(s.name, `${s.role} · ${s.email}`, staffUserIds.has(s.id), () => toggle(staffUserIds, s.id, setStaffUserIds)))}
                    </div>
                  )}
                </>
              );
            })()}

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={includeZoomRep} onChange={(e) => setIncludeZoomRep(e.target.checked)} />
                Include Zoom Rep
              </label>
              {includeZoomRep && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input className="ms-input" placeholder="Name" value={zoomRepName} onChange={(e) => setZoomRepName(e.target.value)} />
                  <input className="ms-input" placeholder="email@zoom.us" value={zoomRepEmail} onChange={(e) => setZoomRepEmail(e.target.value)} />
                </div>
              )}
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 6 }}>Additional Emails</div>
              <input className="ms-input" placeholder="comma or space separated" value={extraEmailsText} onChange={(e) => setExtraEmailsText(e.target.value)} />
            </div>

            {/* PM intro note */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 6 }}>Your Note (PM Intro)</div>
              <textarea className="ms-input" rows={5} value={pmCustomNote} onChange={(e) => setPmCustomNote(e.target.value)} placeholder="Add a personal note to kick things off. Line breaks preserved." style={{ resize: "vertical", fontFamily: "inherit" }} />
            </div>

            {/* Catalog-driven sections, filtered to this project's solution types. */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Standard Sections</div>
              {applicableSections.length === 0 && (
                <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>No standard sections defined for this project's solution types.</div>
              )}
              {applicableSections.map((meta) => (
                <label key={meta.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", cursor: "pointer", borderRadius: 4, fontSize: 13, color: "#1e293b" }}>
                  <input type="checkbox" checked={isSectionOn(meta.id)} onChange={() => toggleSection(meta.id)} />
                  {meta.label}
                </label>
              ))}
              {isSectionOn("adminAccess") && (
                <div style={{ marginTop: 10, paddingLeft: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>Distribution list address</div>
                  <input className="ms-input" value={distributionListEmail} onChange={(e) => setDistributionListEmail(e.target.value)}
                    placeholder="zm-customerslug@packetfusion.com" />
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    Auto-computed from project vendor + customer name. Edit if the actual DL differs.
                  </div>
                </div>
              )}
            </div>

            {/* Type-specific form fields */}
            {meetingType === "kickoff" && (
              <KickoffPrepFields
                kickoffWhen={kickoffWhen}
                setKickoffWhen={setKickoffWhen}
                kickoffMeetingUrl={kickoffMeetingUrl}
                setKickoffMeetingUrl={setKickoffMeetingUrl}
              />
            )}

            {/* Attachments */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                <span>SharePoint Attachments</span>
                <span style={{ color: attachmentsOverLimit ? "#d13438" : "#64748b" }}>{fmtKb(attachmentsTotalBytes)} / 3 MB</span>
              </div>
              {!options.sharepoint.folderUrl && <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>No SharePoint folder configured on the customer.</div>}
              {options.sharepoint.folderUrl && options.sharepoint.files.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>Folder is empty.</div>}
              {options.sharepoint.files.map((f) => checkbox(f.name, fmtKb(f.size), attachmentUrls.has(f.webUrl), () => toggle(attachmentUrls, f.webUrl, setAttachmentUrls)))}
              {attachmentsOverLimit && <div style={{ fontSize: 12, color: "#d13438", marginTop: 4 }}>Total exceeds the 3 MB simple-attachment limit. Trim the selection.</div>}
            </div>
          </div>

          {/* ── RIGHT: Preview ─────────────────────────────────────────── */}
          <div style={{ padding: 20, overflowY: "auto", background: "#f8fafc", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Preview</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{previewRecipientCount} recipient{previewRecipientCount === 1 ? "" : "s"} selected</div>
              </div>
              <button className="ms-btn-ghost" onClick={refreshPreview} disabled={loadingPreview}>{loadingPreview ? "Refreshing…" : "Refresh"}</button>
            </div>
            <iframe
              title="Meeting prep email preview"
              srcDoc={previewHtml}
              sandbox=""
              style={{ flex: 1, minHeight: 500, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6 }}
            />
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {options.project.sentAt && <>Last sent {new Date(options.project.sentAt).toLocaleString()}</>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="ms-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="ms-btn-ghost" onClick={onTest} disabled={testing || attachmentsOverLimit}>{testing ? "Sending…" : "Test send to me"}</button>
            <button className="ms-btn-primary" onClick={onSend} disabled={sending || previewRecipientCount === 0 || attachmentsOverLimit}>{sending ? "Sending…" : MEETING_TYPE_TITLES[meetingType]}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
