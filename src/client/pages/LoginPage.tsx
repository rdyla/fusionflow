import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import logoUrl from "../assets/white logo transparency.png";

type Step = "email" | "code";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Surface SSO errors from callback redirect
  useEffect(() => {
    const ssoError = searchParams.get("sso_error");
    if (ssoError) {
      const messages: Record<string, string> = {
        not_configured: "Microsoft SSO is not configured. Use email sign-in below.",
        no_access: "Your Microsoft account doesn't have access to CloudConnect. Contact your admin.",
        token_failed: "Microsoft sign-in failed. Please try again.",
        state_mismatch: "Sign-in session expired. Please try again.",
        no_email: "Could not read your email from Microsoft. Please try again.",
      };
      setError(messages[ssoError] ?? "SSO sign-in failed. Please try email sign-in.");
    }
  }, [searchParams]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStep("code");
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      navigate("/");
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "#f0f4f8",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>
      {/* Header */}
      <header style={{
        background: "#021e34",
        padding: "0 2rem",
        height: 72,
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <img src={logoUrl} alt="CloudConnect by Packet Fusion" style={{ height: 40, display: "block" }} />
      </header>

      {/* Body */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
      }}>
        <div style={{
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 4px 24px rgba(2,30,52,0.12)",
          padding: "2.5rem 2rem",
          width: "100%",
          maxWidth: 420,
        }}>
          {step === "email" ? (
            <EmailStep
              email={email}
              setEmail={setEmail}
              loading={loading}
              error={error}
              setError={setError}
              onSubmit={sendCode}
            />
          ) : (
            <CodeStep
              email={email}
              code={code}
              setCode={setCode}
              loading={loading}
              error={error}
              setError={setError}
              onSubmit={verifyCode}
              onBack={() => { setStep("email"); setCode(""); setError(""); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EmailStep({
  email, setEmail, loading, error, setError, onSubmit,
}: {
  email: string;
  setEmail: (v: string) => void;
  loading: boolean;
  error: string;
  setError: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#021e34", marginBottom: "0.4rem" }}>
        Sign in to CloudConnect
      </div>
      <div style={{ fontSize: 14, color: "#718096", marginBottom: "1.75rem", lineHeight: 1.5 }}>
        Enter your work email and we'll send you a sign-in code.
      </div>

      <label style={labelStyle}>Work email address</label>
      <input
        type="email"
        value={email}
        onChange={e => { setEmail(e.target.value); setError(""); }}
        placeholder="you@company.com"
        autoComplete="email"
        autoFocus
        required
        style={inputStyle}
        onFocus={e => { e.target.style.borderColor = "#03395f"; e.target.style.boxShadow = "0 0 0 3px rgba(3,57,95,0.12)"; }}
        onBlur={e => { e.target.style.borderColor = "#cbd5e0"; e.target.style.boxShadow = "none"; }}
      />

      {error && <ErrorBox message={error} />}

      <button type="submit" disabled={loading} style={primaryBtnStyle(loading)}>
        {loading ? "Sending…" : "Send Sign-In Code"}
      </button>

      {/* SSO option for PF staff */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "1.75rem" }}>
        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
        <span style={{ fontSize: 12, color: "#a0aec0" }}>PFI staff</span>
        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
      </div>
      <div style={{ fontSize: 12, color: "#a0aec0", textAlign: "center", margin: "0.4rem 0 0.75rem" }}>
        Packet Fusion team members can sign in with Microsoft.
      </div>
      <a
        href="/api/auth/sso"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "0.6rem 1rem",
          border: "1.5px solid #cbd5e0",
          borderRadius: 6,
          background: "#fff",
          color: "#2d3748",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          textDecoration: "none",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "#03395f"; e.currentTarget.style.background = "#f7faff"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "#cbd5e0"; e.currentTarget.style.background = "#fff"; }}
      >
        <MicrosoftIcon />
        Sign in with Microsoft
      </a>
    </form>
  );
}

function CodeStep({
  email, code, setCode, loading, error, setError, onSubmit, onBack,
}: {
  email: string;
  code: string;
  setCode: (v: string) => void;
  loading: boolean;
  error: string;
  setError: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#021e34", marginBottom: "0.4rem" }}>
        Check your inbox
      </div>

      <div style={{
        background: "#f0fff4",
        border: "1px solid #9ae6b4",
        borderRadius: 6,
        padding: "0.65rem 0.85rem",
        fontSize: 13,
        color: "#276749",
        marginBottom: "1.25rem",
      }}>
        A sign-in code was sent to <strong>{email}</strong>.
      </div>

      <div style={{ fontSize: 14, color: "#718096", marginBottom: "1.75rem", lineHeight: 1.5 }}>
        The email will come from <strong>CloudConnect</strong> (cloudconnect@packetfusion.com) — check your inbox and spam folder.
      </div>

      <label style={labelStyle}>Sign-in code</label>
      <input
        type="text"
        value={code}
        onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
        placeholder="123456"
        maxLength={6}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        required
        style={inputStyle}
        onFocus={e => { e.target.style.borderColor = "#03395f"; e.target.style.boxShadow = "0 0 0 3px rgba(3,57,95,0.12)"; }}
        onBlur={e => { e.target.style.borderColor = "#cbd5e0"; e.target.style.boxShadow = "none"; }}
      />
      <div style={{ fontSize: 12, color: "#a0aec0", marginTop: 5 }}>
        Enter the 6-digit code from the email.
      </div>

      {error && <ErrorBox message={error} />}

      <button type="submit" disabled={loading} style={primaryBtnStyle(loading)}>
        {loading ? "Signing in…" : "Sign In"}
      </button>

      <button
        type="button"
        onClick={onBack}
        style={{
          display: "inline-block",
          marginTop: "1.25rem",
          fontSize: 13,
          color: "#03395f",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        ← Use a different email
      </button>
    </form>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      background: "#fff5f5",
      border: "1px solid #feb2b2",
      borderRadius: 6,
      padding: "0.65rem 0.85rem",
      fontSize: 13,
      color: "#c53030",
      marginTop: "1rem",
    }}>
      {message}
    </div>
  );
}

function MicrosoftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#2d3748",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.85rem",
  border: "1px solid #cbd5e0",
  borderRadius: 6,
  fontSize: 15,
  color: "#2d3748",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
  background: "#fff",
  boxSizing: "border-box",
};

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "0.7rem 1rem",
    border: "none",
    borderRadius: 6,
    fontSize: 15,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    marginTop: "1.25rem",
    background: disabled ? "#a0aec0" : "#03395f",
    color: "#fff",
    transition: "background 0.15s",
  };
}
