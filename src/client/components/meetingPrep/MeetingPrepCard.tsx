/**
 * Meeting-prep email card — generic over `:meetingType`.
 *
 * Migrated from `WelcomeEmailCard.tsx`. Shows the sent / not-sent indicator
 * and the "Send" / "Resend" button; opens the `MeetingPrepModal` when
 * clicked.
 */

import { useEffect, useState } from "react";
import { api, type MeetingPrepOptions, type MeetingType } from "../../lib/api";
import MeetingPrepModal from "./MeetingPrepModal";

type Props = {
  projectId: string;
  meetingType: MeetingType;
  canSend: boolean;
};

const TYPE_LABELS: Record<MeetingType, { ctaLabel: string; resendLabel: string; sectionLabel: string }> = {
  kickoff: {
    ctaLabel:     "Send Welcome Email",
    resendLabel:  "Resend",
    sectionLabel: "Welcome Email",
  },
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MeetingPrepCard({ projectId, meetingType, canSend }: Props) {
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

  const sentAt = options?.project.sentAt ?? null;

  return (
    <div className="ms-section-card" style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>{labels.sectionLabel}</span>
          {loading && <span style={{ fontSize: 12, color: "#94a3b8" }}>Loading…</span>}
          {error && <span style={{ fontSize: 12, color: "#d13438" }}>{error}</span>}
          {!loading && !error && (
            sentAt ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 20, fontSize: 12, color: "#047857" }}>
                ✓ Sent {formatWhen(sentAt)}
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
            {sentAt ? labels.resendLabel : labels.ctaLabel}
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
    </div>
  );
}
