/**
 * Meeting-prep email card — generic over `:meetingType`.
 *
 * Shows the send history for this meeting type and the "Send" / "Send another"
 * button. Many-to-one — every send appears in the history list with its
 * timestamp + optional label + recipient count.
 */

import { useEffect, useState } from "react";
import { api, type MeetingPrepOptions, type MeetingPrepSendRecord, type MeetingType } from "../../lib/api";
import MeetingPrepModal from "./MeetingPrepModal";

function SendRow({
  projectId,
  meetingType,
  record,
  sectionLabel,
}: {
  projectId: string;
  meetingType: MeetingType;
  record: MeetingPrepSendRecord;
  sectionLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (html !== null || loading || !record.hasBody) return;
    setLoading(true);
    setError(null);
    api.meetingPrepSendHtml(projectId, meetingType, record.id)
      .then((res) => setHtml(res.html))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }

  const canPreview = record.hasBody;

  return (
    <div style={{ padding: "4px 0", fontSize: 12, borderBottom: "1px dashed #f1f5f9" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: "#1e293b", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {record.label || sectionLabel}
          </div>
          {record.label && (
            <div style={{ color: "#94a3b8", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {record.subject}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#64748b", whiteSpace: "nowrap" }}>
          <span>{formatWhen(record.sentAt)} · {record.recipientCount} recip.</span>
          {canPreview && (
            <button
              type="button"
              onClick={toggle}
              style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: "#0b9aad", cursor: "pointer" }}
            >
              {open ? "Hide" : "View"}
            </button>
          )}
        </div>
      </div>
      {open && canPreview && (
        <div style={{ marginTop: 8 }}>
          {loading && <div style={{ color: "#94a3b8", fontSize: 12 }}>Loading…</div>}
          {error && <div style={{ color: "#d13438", fontSize: 12 }}>{error}</div>}
          {html !== null && (
            <iframe
              title={`Email preview — ${record.subject}`}
              srcDoc={html}
              sandbox=""
              style={{ width: "100%", height: 420, border: "1px solid #e2e8f0", borderRadius: 4, background: "#fff" }}
            />
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  projectId: string;
  meetingType: MeetingType;
  canSend: boolean;
  /** Compact row layout for use inside a shared parent section. Strips the
   *  outer ms-section-card wrapper and renders as a single horizontal row
   *  (label · status · send button). Send history is omitted (it's still
   *  visible on the modal's send flow). */
  compact?: boolean;
};

const TYPE_LABELS: Record<MeetingType, { ctaLabel: string; resendLabel: string; sectionLabel: string }> = {
  kickoff: {
    ctaLabel:     "Send Welcome Email",
    resendLabel:  "Send Another",
    sectionLabel: "Welcome Email",
  },
  discovery: {
    ctaLabel:     "Send Discovery Prep",
    resendLabel:  "Send Another",
    sectionLabel: "Discovery Prep",
  },
  design_review: {
    ctaLabel:     "Send Design Review Prep",
    resendLabel:  "Send Another",
    sectionLabel: "Design Review Prep",
  },
  uat: {
    ctaLabel:     "Send UAT Prep",
    resendLabel:  "Send Another",
    sectionLabel: "UAT Prep",
  },
  go_live: {
    ctaLabel:     "Send Go-Live Prep",
    resendLabel:  "Send Another",
    sectionLabel: "Go-Live Prep",
  },
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MeetingPrepCard({ projectId, meetingType, canSend, compact = false }: Props) {
  const [options, setOptions] = useState<MeetingPrepOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const labels = TYPE_LABELS[meetingType];

  const load = () => {
    setLoading(true);
    setError(null);
    api.meetingPrepOptions(projectId, meetingType)
      .then(setOptions)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId, meetingType]);

  const history = options?.history ?? [];
  const hasSends = history.length > 0;

  if (compact) {
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", minWidth: 130 }}>
              {labels.sectionLabel}
            </span>
            {loading && <span style={{ fontSize: 11, color: "#94a3b8" }}>Loading…</span>}
            {error && <span style={{ fontSize: 11, color: "#d13438" }}>{error}</span>}
            {!loading && !error && (
              hasSends ? (
                <span style={{ fontSize: 11, color: "#047857" }}>
                  ✓ {history.length} send{history.length === 1 ? "" : "s"}
                </span>
              ) : (
                <span style={{ fontSize: 11, color: "#94a3b8" }}>Not sent yet</span>
              )
            )}
          </div>
          {canSend && options && (
            <button className="ms-btn-ghost" style={{ fontSize: 11, padding: "3px 12px" }} onClick={() => setShowModal(true)}>
              {hasSends ? "Resend" : "Send"}
            </button>
          )}
        </div>
        {showModal && options && (
          <MeetingPrepModal
            projectId={projectId}
            meetingType={meetingType}
            options={options}
            onClose={() => setShowModal(false)}
            onSent={() => { setShowModal(false); load(); }}
          />
        )}
      </>
    );
  }

  return (
    <div className="ms-section-card" style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>{labels.sectionLabel}</span>
          {loading && <span style={{ fontSize: 12, color: "#94a3b8" }}>Loading…</span>}
          {error && <span style={{ fontSize: 12, color: "#d13438" }}>{error}</span>}
          {!loading && !error && (
            hasSends ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 20, fontSize: 12, color: "#047857" }}>
                ✓ {history.length} send{history.length === 1 ? "" : "s"}
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", background: "rgba(148,163,184,0.12)", border: "1px solid rgba(148,163,184,0.3)", borderRadius: 20, fontSize: 12, color: "#64748b" }}>
                Not sent yet
              </span>
            )
          )}
        </div>
        {canSend && options && (
          <button className="ms-btn-primary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setShowModal(true)}>
            {hasSends ? labels.resendLabel : labels.ctaLabel}
          </button>
        )}
      </div>

      {hasSends && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
          {history.map((h) => (
            <SendRow key={h.id} projectId={projectId} meetingType={meetingType} record={h} sectionLabel={labels.sectionLabel} />
          ))}
        </div>
      )}

      {showModal && options && (
        <MeetingPrepModal
          projectId={projectId}
          meetingType={meetingType}
          options={options}
          onClose={() => setShowModal(false)}
          onSent={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
