import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { resolveUserByEmail } from "../middleware/auth";
import { sendEmail } from "../services/emailService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const SESSION_TTL = 60 * 60 * 8; // 8 hours
const OTP_TTL = 60 * 10;         // 10 minutes
const OTP_RATE_TTL = 60;         // 1 minute between resend attempts
const MAX_ATTEMPTS = 5;

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function otpKey(email: string) { return `otp:${email.toLowerCase()}`; }
function otpRateKey(email: string) { return `otp_rate:${email.toLowerCase()}`; }
function sessionKey(id: string) { return `session:${id}`; }

function sessionCookie(id: string, maxAge: number) {
  return `ff_session=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function otpEmailHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d1b2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#142236;border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;">
    <div style="background:#091525;padding:20px 28px;border-bottom:1px solid rgba(255,255,255,0.07);">
      <div style="font-size:20px;font-weight:800;color:#f0f6ff;letter-spacing:-0.02em;">
        Fusion<span style="color:#00c8e0;">Flow</span><span style="color:rgba(240,246,255,0.6);font-weight:400;">360</span>
      </div>
    </div>
    <div style="padding:28px 28px 24px;">
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f0f6ff;">Your sign-in code</h2>
      <p style="margin:0 0 24px;color:rgba(240,246,255,0.65);font-size:15px;line-height:1.5;">
        Use the code below to sign in to FusionFlow360. It expires in <strong style="color:#f0f6ff;">10 minutes</strong>.
      </p>
      <div style="background:rgba(0,200,224,0.08);border:1px solid rgba(0,200,224,0.25);border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
        <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#00c8e0;">${code}</span>
      </div>
      <p style="margin:0;color:rgba(240,246,255,0.35);font-size:13px;line-height:1.5;">
        If you didn't request this code, you can safely ignore this email.
      </p>
    </div>
    <div style="padding:14px 28px;border-top:1px solid rgba(255,255,255,0.07);font-size:12px;color:rgba(240,246,255,0.3);">
      FusionFlow360 &middot; Packet Fusion &middot; This is an automated sign-in notification.
    </div>
  </div>
</body>
</html>`;
}

// POST /api/auth/send-otp
app.post("/send-otp", async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "Invalid email address" }, 400);
  }

  const rateLimited = await c.env.KV.get(otpRateKey(email));
  if (rateLimited) {
    return c.json({ error: "Please wait a moment before requesting another code" }, 429);
  }

  const code = generateOTP();
  await c.env.KV.put(otpKey(email), JSON.stringify({ code, attempts: 0 }), { expirationTtl: OTP_TTL });
  await c.env.KV.put(otpRateKey(email), "1", { expirationTtl: OTP_RATE_TTL });

  await sendEmail(c.env, {
    to: email,
    subject: "Your FusionFlow360 Sign-In Code",
    html: otpEmailHtml(code),
  });

  return c.json({ ok: true });
});

// POST /api/auth/verify
app.post("/verify", async (c) => {
  const { email, code } = await c.req.json<{ email: string; code: string }>();
  if (!email || !code) return c.json({ error: "Missing email or code" }, 400);

  const raw = await c.env.KV.get(otpKey(email));
  if (!raw) return c.json({ error: "Code expired or not found — please request a new one" }, 401);

  const stored = JSON.parse(raw) as { code: string; attempts: number };

  if (stored.attempts >= MAX_ATTEMPTS) {
    await c.env.KV.delete(otpKey(email));
    return c.json({ error: "Too many attempts — please request a new code" }, 401);
  }

  if (stored.code !== code.trim()) {
    stored.attempts++;
    await c.env.KV.put(otpKey(email), JSON.stringify(stored), { expirationTtl: OTP_TTL });
    return c.json({ error: "Incorrect code — please try again" }, 401);
  }

  await c.env.KV.delete(otpKey(email));

  const auth = await resolveUserByEmail(c.env, email.trim().toLowerCase());
  if (!auth) {
    return c.json({ error: "No access found for this email. Contact your Packet Fusion team for help." }, 403);
  }

  const sessionId = crypto.randomUUID();
  await c.env.KV.put(sessionKey(sessionId), JSON.stringify(auth), { expirationTtl: SESSION_TTL });

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookie(sessionId, SESSION_TTL),
    },
  });
});

// GET /api/auth/logout
app.get("/logout", async (c) => {
  const cookieHeader = c.req.header("cookie") ?? "";
  const match = cookieHeader.split(";").map(s => s.trim()).find(s => s.startsWith("ff_session="));
  const sessionId = match ? match.slice("ff_session=".length) : null;

  if (sessionId) await c.env.KV.delete(sessionKey(sessionId));

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/login",
      "Set-Cookie": sessionCookie("", 0),
    },
  });
});

// GET /api/auth/sso — redirect to Microsoft login (for internal PF staff)
app.get("/sso", async (c) => {
  const tenantId = c.env.DYNAMICS_TENANT_ID;
  const clientId = c.env.SSO_CLIENT_ID;
  const clientSecret = c.env.SSO_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    return c.redirect("/login?sso_error=not_configured");
  }

  const appUrl = (c.env.APP_URL ?? "https://fusionflow360.com").replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/auth/sso/callback`;

  const state = crypto.randomUUID();
  await c.env.KV.put(`sso_state:${state}`, redirectUri, { expirationTtl: 300 });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  return Response.redirect(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`,
    302
  );
});

// GET /api/auth/sso/callback — handle Microsoft OAuth2 callback
app.get("/sso/callback", async (c) => {
  const { code, state, error } = c.req.query() as Record<string, string>;

  if (error) return c.redirect(`/login?sso_error=${encodeURIComponent(error)}`);
  if (!code || !state) return c.redirect("/login?sso_error=invalid_callback");

  const redirectUri = await c.env.KV.get(`sso_state:${state}`);
  if (!redirectUri) return c.redirect("/login?sso_error=state_mismatch");
  await c.env.KV.delete(`sso_state:${state}`);

  const params = new URLSearchParams({
    client_id: c.env.SSO_CLIENT_ID ?? "",
    client_secret: c.env.SSO_CLIENT_SECRET ?? "",
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${c.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  );

  if (!tokenRes.ok) return c.redirect("/login?sso_error=token_failed");

  const tokens = await tokenRes.json() as { id_token: string };
  let email: string | undefined;
  try {
    const payload = JSON.parse(atob(tokens.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    email = payload.preferred_username || payload.email || payload.upn;
  } catch {
    return c.redirect("/login?sso_error=token_decode_failed");
  }

  if (!email) return c.redirect("/login?sso_error=no_email");

  const auth = await resolveUserByEmail(c.env, email.trim().toLowerCase());
  if (!auth) return c.redirect("/login?sso_error=no_access");

  const sessionId = crypto.randomUUID();
  await c.env.KV.put(`session:${sessionId}`, JSON.stringify(auth), { expirationTtl: SESSION_TTL });

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": sessionCookie(sessionId, SESSION_TTL),
    },
  });
});

export default app;
