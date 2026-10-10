import { Hono } from "hono";
import { AuthorizationError, CimdFetchError, type ConsentDescription, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { Bindings, Variables } from "../types";
import { getSessionAuth } from "../middleware/auth";
import { writeAuditLog } from "../lib/auditLog";
import { loadMcpUser, type McpProps } from "./handler";
import { MCP_SCOPE } from "./provider";

/**
 * /oauth/authorize — the sign-in + consent step of the Claude connector's OAuth
 * flow. Identity is the normal CloudConnect session: no session → bounce
 * through /login (SSO or OTP) and come back here; then show a consent page and
 * hand the provider a grant whose props carry only the user id.
 */

type OAuthEnv = Bindings & { OAUTH_PROVIDER: OAuthHelpers };

export const AUTHORIZE_PATH = "/oauth/authorize";

// ── Return-to after login ────────────────────────────────────────────────────
// The login page always lands on "/", so the pending authorize URL rides in a
// short-lived cookie. Only /oauth/authorize?… is ever honored, so the cookie
// can't be turned into an open redirect.
const RETURN_COOKIE = "ff_oauth_return";

export function returnToCookie(path: string, appUrl: string | undefined): string {
  const secure = appUrl?.startsWith("https://") ? " Secure;" : "";
  return `${RETURN_COOKIE}=${encodeURIComponent(path)}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=600`;
}

/** The pending authorize URL from the cookie, if any and if safe. */
export function pendingAuthorizeUrl(cookieHeader: string | undefined): string | null {
  const match = (cookieHeader ?? "").split(";").map((s) => s.trim()).find((s) => s.startsWith(`${RETURN_COOKIE}=`));
  if (!match) return null;
  let value: string;
  try { value = decodeURIComponent(match.slice(RETURN_COOKIE.length + 1)); } catch { return null; }
  return value.startsWith(`${AUTHORIZE_PATH}?`) ? value : null;
}

export const CLEAR_RETURN_COOKIE = `${RETURN_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

// ── Page rendering ──────────────────────────────────────────────────────────
const escape = (value: string) => value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function page(title: string, body: string, status = 200, headers = new Headers()): Response {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cache-Control", "no-store");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · CloudConnect</title><link rel="icon" href="/favicon.png">
<style>
  :root { color-scheme: light; --ink:#1e293b; --muted:#64748b; --line:#e2e8f0; --brand:#0b5cad; }
  body { margin:0; background:#f1f5f9; font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:var(--ink); }
  main { max-width:440px; margin:8vh auto; padding:0 16px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:28px; }
  h1 { font-size:20px; margin:0 0 12px; }
  p { margin:0 0 12px; } .muted { color:var(--muted); font-size:13px; }
  ul { margin:0 0 16px; padding-left:20px; }
  .warn { background:#fef3c7; border:1px solid #fcd34d; border-radius:8px; padding:10px 12px; font-size:13px; }
  .actions { display:flex; gap:10px; margin-top:20px; }
  button { flex:1; font:inherit; font-weight:600; padding:10px; border-radius:8px; cursor:pointer; border:1px solid var(--line); background:#fff; }
  button.primary { background:var(--brand); border-color:var(--brand); color:#fff; }
</style></head><body><main><div class="card">${body}</div></main></body></html>`,
    { status, headers }
  );
}

function consentPage(details: ConsentDescription, handle: string, userEmail: string, headers: Headers): Response {
  const origin = details.clientDomain
    ? `Published by <strong>${escape(details.clientDomain)}</strong>.`
    : "This app registered itself, so its name isn't verified.";
  return page("Connect to CloudConnect", `
<h1>Allow ${escape(details.clientName)} to use CloudConnect as you?</h1>
<p class="muted">${origin} Access goes to <strong>${escape(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? '<p class="warn">This sends access to an app on your computer. Continue only if you just started connecting from it.</p>' : ""}
<p>Signed in as <strong>${escape(userEmail)}</strong>. It will be able to:</p>
<ul><li>See your projects, their CE case numbers and hours</li><li>See time entries on projects you can see</li><li>Log, edit and delete your own time in CE, as you</li><li>Add entries to the Internal Notes field on your projects' CE cases</li></ul>
<p class="muted">It sees only what you see in CloudConnect. An admin can turn this off at any time.</p>
<form method="post">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <div class="actions"><button name="decision" value="deny">Deny</button><button class="primary" name="decision" value="approve">Allow</button></div>
</form>`, 200, headers);
}

const notEnabled = () => page("Not enabled", `
<h1>The Claude connector isn't enabled for your account</h1>
<p>Ask a CloudConnect admin to turn on <strong>Claude Connector</strong> for you, then try connecting again.</p>`, 403);

/** Errors before a redirect URI is trusted are shown here, never redirected. */
function authorizationFailure(err: unknown): Response {
  if (err instanceof AuthorizationError && err.redirectTo) return Response.redirect(err.redirectTo, 302);
  if (err instanceof AuthorizationError || err instanceof CimdFetchError) {
    const message = err instanceof AuthorizationError ? err.description : "This app could not be verified.";
    return page("Can't connect", `<h1>Can't connect</h1><p>${escape(message)}</p><p class="muted">Start connecting again from Claude.</p>`, 400);
  }
  throw err;
}

// ── Routes ──────────────────────────────────────────────────────────────────
const app = new Hono<{ Bindings: OAuthEnv; Variables: Variables }>();

app.get("/", async (c) => {
  const session = await getSessionAuth(c.env.KV, c.req.header("cookie"));
  if (!session) {
    const url = new URL(c.req.url);
    return new Response(null, {
      status: 302,
      headers: { Location: "/login", "Set-Cookie": returnToCookie(url.pathname + url.search, c.env.APP_URL) },
    });
  }

  const auth = await loadMcpUser(c.env.DB, session.user.id);
  if (!auth) return notEnabled();

  const oauth = c.env.OAUTH_PROVIDER;
  try {
    const authRequest = await oauth.parseAuthRequest(c.req.raw);
    const details = await oauth.describeConsent(authRequest);
    const consent = await oauth.beginConsent(authRequest);
    return consentPage(details, consent.handle, auth.user.email, consent.headers);
  } catch (err) {
    return authorizationFailure(err);
  }
});

app.post("/", async (c) => {
  const session = await getSessionAuth(c.env.KV, c.req.header("cookie"));
  const auth = session ? await loadMcpUser(c.env.DB, session.user.id) : null;
  if (!auth) return notEnabled();

  const oauth = c.env.OAUTH_PROVIDER;
  const form = await c.req.formData();
  const handle = String(form.get("handle") ?? "");
  try {
    if (form.get("decision") !== "approve") {
      const denied = await oauth.denyConsent(c.req.raw, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }

    // One scope covers the connector; offline_access passes through so the
    // client gets a refresh token when it asked for one.
    const approved = await oauth.approveConsent(c.req.raw, handle);
    const scope = [MCP_SCOPE, ...approved.request.scope.filter((s) => s === "offline_access")];
    const client = await oauth.lookupClient(approved.request.clientId);
    const props: McpProps = { userId: auth.user.id };
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      userId: auth.user.id,
      metadata: { email: auth.user.email, client: client?.clientName ?? approved.request.clientId },
      scope,
      props,
    });

    c.executionCtx.waitUntil(writeAuditLog(c.env.DB, {
      entityType: "user",
      entityId: auth.user.id,
      action: "mcp_authorize",
      method: "POST",
      path: AUTHORIZE_PATH,
      status: 302,
      actor: { id: auth.user.id, name: auth.user.name, email: auth.user.email },
    }));

    approved.headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (err) {
    return authorizationFailure(err);
  }
});

export default app;
