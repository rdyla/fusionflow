import { useLocation, useNavigate } from "react-router-dom";
import { severityColor } from "../lib/supportApi";

interface ConfirmationState {
  id: string;
  ticketNumber: string;
  title: string;
  severityLabel: string;
}

export default function SupportCaseConfirmationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ConfirmationState | null;

  if (!state) {
    navigate("/support/cases", { replace: true });
    return null;
  }

  const { id, ticketNumber, title, severityLabel } = state;
  const color = severityColor(severityLabel);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "2.5rem 2rem", textAlign: "center" }}>
        <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>✅</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Case Submitted</h2>
        <p style={{ color: "#64748b", marginBottom: "2rem", fontSize: 14 }}>
          Your support case has been created and our team has been notified.
        </p>

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "1.25rem 1.5rem", textAlign: "left", marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Case Number</span>
            <strong style={{ fontSize: 14, fontFamily: "monospace" }}>{ticketNumber}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Subject</span>
            <span style={{ maxWidth: "70%", textAlign: "right", fontSize: 14, color: "#1e293b" }}>{title}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Severity</span>
            <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${color}18`, color, border: `1px solid ${color}40` }}>
              {severityLabel}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={() => navigate(`/support/cases/${id}`)}
            style={{ padding: "0.55rem 1.25rem", background: "#0891b2", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            View Case
          </button>
          <button onClick={() => navigate("/support/cases")}
            style={{ padding: "0.55rem 1.25rem", background: "#fff", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, cursor: "pointer" }}>
            Back to My Cases
          </button>
        </div>
      </div>
    </div>
  );
}
