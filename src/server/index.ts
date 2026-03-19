import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings, Variables } from "./types";
import { authMiddleware } from "./middleware/auth";
import authRoutes from "./routes/auth";
import dashboardRoutes from "./routes/dashboard";
import projectRoutes from "./routes/projects";
import phaseRoutes from "./routes/phases";
import milestoneRoutes from "./routes/milestones";
import taskRoutes from "./routes/tasks";
import riskRoutes from "./routes/risks";
import noteRoutes from "./routes/notes";
import adminRoutes from "./routes/admin";
import documentRoutes from "./routes/documents";
import dynamicsRoutes from "./routes/dynamics";
import zoomRoutes from "./routes/zoom";
import solutionRoutes from "./routes/solutions";
import statusRoutes from "./routes/status";
import staffRoutes from "./routes/staff";
import optimizeRoutes from "./routes/optimize";
import asanaRoutes from "./routes/asana";
import { sendEmail } from "./services/emailService";
import { goLiveReminder } from "./lib/emailTemplates";
import { fetchZoomUtilizationSnapshot } from "./services/zoomService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", cors());

app.get("/api/health", (c) => c.json({ ok: true }));

// Asana OAuth callback — must be registered before authMiddleware because
// Asana's redirect carries the user's browser session (CF cookies) but not
// the x-dev-user-email header used in local dev. Token exchange is safe
// without auth since it only stores credentials in KV.
app.get("/api/asana/callback", async (c) => {
  const code = c.req.query("code");
  const appUrl = (c.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const redirectUri = `${(c.env.APP_URL ?? "http://localhost:8787").replace(/\/$/, "")}/api/asana/callback`;

  if (!code) {
    return c.redirect(`${appUrl}/?asana_error=no_code`);
  }

  const clientId = c.env.ASANA_CLIENT_ID;
  const clientSecret = c.env.ASANA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return c.redirect(`${appUrl}/?asana_error=not_configured`);
  }

  const tokenRes = await fetch("https://app.asana.com/-/oauth_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!tokenRes.ok) {
    return c.redirect(`${appUrl}/?asana_error=token_exchange_failed`);
  }

  const data = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number };
  const stored = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000 - 60_000,
  };
  await c.env.KV.put("asana:token", JSON.stringify(stored));

  return c.redirect(`${appUrl}/?asana_connected=1`);
});

app.use("/api/*", authMiddleware);

app.route("/api", authRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/projects", phaseRoutes);
app.route("/api/projects", milestoneRoutes);
app.route("/api/projects", taskRoutes);
app.route("/api/projects", riskRoutes);
app.route("/api/projects", noteRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/projects", documentRoutes);
app.route("/api/projects", zoomRoutes);
app.route("/api/dynamics", dynamicsRoutes);
app.route("/api/solutions", solutionRoutes);
app.route("/api", statusRoutes);
app.route("/api/staff", staffRoutes);
app.route("/api/optimize", optimizeRoutes);
app.route("/api/asana", asanaRoutes);

// Catch-all: serve static assets (and SPA index.html fallback) for everything
// that isn't an /api/* route. Required because run_worker_first=true means
// the Worker handles all requests before Cloudflare's asset handler.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

async function runGoLiveReminders(env: Bindings): Promise<void> {
  const appUrl = env.APP_URL ?? "";
  const today = new Date();

  const targets = [7, 1].map((d) => {
    const dt = new Date(today);
    dt.setDate(today.getDate() + d);
    return { days: d, date: dt.toISOString().slice(0, 10) };
  });

  for (const { days, date } of targets) {
    const rows = await env.DB
      .prepare(
        `SELECT id, name, customer_name, target_go_live_date, pm_user_id, ae_user_id
         FROM projects
         WHERE (archived = 0 OR archived IS NULL) AND target_go_live_date = ?`
      )
      .bind(date)
      .all<{ id: string; name: string; customer_name: string | null; target_go_live_date: string; pm_user_id: string | null; ae_user_id: string | null }>();

    for (const project of rows.results ?? []) {
      const userIds = [project.pm_user_id, project.ae_user_id].filter(Boolean) as string[];
      const uniqueIds = [...new Set(userIds)];

      for (const userId of uniqueIds) {
        const user = await env.DB
          .prepare("SELECT email, name FROM users WHERE id = ? AND is_active = 1 LIMIT 1")
          .bind(userId)
          .first<{ email: string; name: string }>();

        if (user) {
          sendEmail(env, {
            to: user.email,
            subject: `Go-live ${days === 1 ? "tomorrow" : `in ${days} days`}: ${project.name}`,
            html: goLiveReminder({ recipientName: user.name ?? user.email, projectName: project.name, customerName: project.customer_name, goLiveDate: project.target_go_live_date, daysOut: days, appUrl, projectId: project.id }),
          });
        }
      }
    }
  }
}

async function runUtilizationSnapshots(env: Bindings): Promise<void> {
  // Find all projects that have actual_go_live_date set (i.e. live accounts in Optimize)
  const rows = await env.DB
    .prepare("SELECT id FROM projects WHERE actual_go_live_date IS NOT NULL AND (archived = 0 OR archived IS NULL)")
    .all<{ id: string }>();

  const today = new Date().toISOString().slice(0, 10);

  for (const { id: projectId } of rows.results ?? []) {
    try {
      const data = await fetchZoomUtilizationSnapshot(env.KV, projectId);
      const snapshotId = crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO utilization_snapshots
          (id, project_id, platform, snapshot_date, licenses_purchased, licenses_assigned,
           active_users_30d, active_users_90d, total_meetings, raw_data)
        VALUES (?, ?, 'zoom', ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        snapshotId, projectId, today,
        data.licenses_purchased, data.licenses_assigned,
        data.active_users_30d, data.active_users_90d,
        data.total_meetings,
        JSON.stringify(data.raw_data)
      ).run();
    } catch {
      // No credentials or API error — skip silently
    }
  }
}

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([
      runGoLiveReminders(env),
      runUtilizationSnapshots(env),
    ]));
  },
};