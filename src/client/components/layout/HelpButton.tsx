import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { resolveHelp } from "../../help";
import { api } from "../../lib/api";

// The "?" header button: shows page-specific help, with a fallback path to file
// a help request (which notifies CloudConnect admins instantly). Self-contained
// — manages its own popover, outside-click/Esc close, and request form state.
export default function HelpButton() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const help = resolveHelp(location.pathname);

  // Reset the form whenever the popover closes or the route changes.
  useEffect(() => {
    if (!open) {
      setFormOpen(false);
      setSent(false);
      setError(null);
      setSubject("");
      setBody("");
    }
  }, [open]);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const submit = async () => {
    if (!subject.trim()) {
      setError("A short subject helps us route your request.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createHelpRequest({
        subject: subject.trim(),
        body: body.trim() || undefined,
        module: help.module,
        page_path: location.pathname,
      });
      setSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't send your request — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Help"
        aria-label="Help"
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: open ? "#fff" : "rgba(255,255,255,0.75)",
          padding: 6, display: "flex", alignItems: "center", borderRadius: 8,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 60,
            width: 360, maxWidth: "90vw", maxHeight: "70vh", overflowY: "auto",
            background: "#fff", color: "#1e293b",
            border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,0.18)", padding: 16,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            {help.title}
          </div>
          <div className="help-popover-content" style={{ fontSize: 14, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: help.html }} />

          <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", marginTop: 14, paddingTop: 14 }}>
            {sent ? (
              <div style={{ fontSize: 13, color: "#059669", fontWeight: 600 }}>
                Request sent — a CloudConnect admin has been notified. We'll follow up by email.
              </div>
            ) : !formOpen ? (
              <button
                type="button"
                className="ms-btn-secondary"
                style={{ width: "100%" }}
                onClick={() => setFormOpen(true)}
              >
                Still need help?
              </button>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Tell us what you need — we'll include the page you're on ({help.module}).
                </div>
                <input
                  className="ms-input"
                  placeholder="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  autoFocus
                />
                <textarea
                  className="ms-input"
                  placeholder="What are you trying to do? (optional)"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  style={{ resize: "vertical" }}
                />
                {error && <div style={{ fontSize: 12, color: "#d13438" }}>{error}</div>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="ms-btn-ghost" onClick={() => setFormOpen(false)} disabled={submitting}>
                    Cancel
                  </button>
                  <button type="button" className="ms-btn-primary" onClick={submit} disabled={submitting}>
                    {submitting ? "Sending…" : "Send request"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
