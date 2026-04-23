import { useEffect, useState } from "react";
import { api, type WelcomeOptions } from "../../lib/api";
import WelcomeEmailModal from "./WelcomeEmailModal";

type Props = {
  projectId: string;
  canSend: boolean;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function WelcomeEmailCard({ projectId, canSend }: Props) {
  const [options, setOptions] = useState<WelcomeOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    api.welcomeOptions(projectId)
      .then(setOptions)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const sentAt = options?.project.welcomeSentAt ?? null;

  return (
    <div className="ms-section-card" style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Welcome Email</span>
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
            {sentAt ? "Resend" : "Send Welcome Email"}
          </button>
        )}
      </div>

      {showModal && options && (
        <WelcomeEmailModal
          projectId={projectId}
          options={options}
          onClose={() => setShowModal(false)}
          onSent={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
