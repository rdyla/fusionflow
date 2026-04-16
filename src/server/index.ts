import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings, Variables } from "./types";
import { authMiddleware } from "./middleware/auth";
import authRoutes from "./routes/auth";
import dashboardRoutes from "./routes/dashboard";
import projectRoutes from "./routes/projects";
import phaseRoutes from "./routes/phases";
import taskRoutes from "./routes/tasks";
import riskRoutes from "./routes/risks";
import noteRoutes from "./routes/notes";
import adminRoutes from "./routes/admin";
import documentRoutes from "./routes/documents";
import dynamicsRoutes from "./routes/dynamics";
import zoomRoutes from "./routes/zoom";
import ringcentralRoutes from "./routes/ringcentral";
import solutionRoutes from "./routes/solutions";
import needsAssessmentRoutes from "./routes/needsAssessments";
import laborEstimateRoutes from "./routes/laborEstimates";
import statusRoutes from "./routes/status";
import staffRoutes from "./routes/staff";
import optimizeRoutes from "./routes/optimize";
import templateRoutes from "./routes/templates";
import sharepointRoutes from "./routes/sharepoint";
import authPublicRoutes from "./routes/authPublic";
import inboxRoutes from "./routes/inbox";
import customerRoutes from "./routes/customers";
import prospectingRoutes from "./routes/prospecting";
import myTasksRoutes from "./routes/myTasks";
import supportRoutes from "./routes/support";
import { sendEmail } from "./services/emailService";
import { goLiveReminder } from "./lib/emailTemplates";
import { createNotification } from "./lib/notifications";
import { computeProjectHealth } from "./lib/healthScore";
import { fetchZoomUtilizationSnapshot } from "./services/zoomService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", cors({ origin: "https://fusionflow360.com" }));

app.get("/api/health", (c) => c.json({ ok: true }));

// Public auth routes (OTP, verify, logout, SSO) — registered before authMiddleware
app.route("/api/auth", authPublicRoutes);

app.use("/api/*", authMiddleware);

app.route("/api", authRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/projects", phaseRoutes);
app.route("/api/projects", taskRoutes);
app.route("/api/projects", riskRoutes);
app.route("/api/projects", noteRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/projects", documentRoutes);
app.route("/api/projects", zoomRoutes);
app.route("/api/projects", ringcentralRoutes);
app.route("/api/dynamics", dynamicsRoutes);
app.route("/api/solutions", solutionRoutes);
app.route("/api/solutions", needsAssessmentRoutes);
app.route("/api/solutions", laborEstimateRoutes);
app.route("/api", statusRoutes);
app.route("/api/staff", staffRoutes);
app.route("/api/optimize", optimizeRoutes);
app.route("/api/sharepoint", sharepointRoutes);
app.route("/api/inbox", inboxRoutes);
app.route("/api/customers", customerRoutes);
app.route("/api/prospecting", prospectingRoutes);
app.route("/api/my-tasks", myTasksRoutes);
app.route("/api/admin", templateRoutes);
app.route("/api/projects", templateRoutes);
app.route("/api/support", supportRoutes);

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
      // Core recipients: PM + AE from project record
      const coreIds = [project.pm_user_id, project.ae_user_id].filter(Boolean) as string[];
      const recipientIds = new Set(coreIds);

      // Also include partner AEs assigned via project_staff
      const partnerAes = await env.DB
        .prepare(
          `SELECT user_id FROM project_staff WHERE project_id = ? AND staff_role = 'partner_ae'`
        )
        .bind(project.id)
        .all<{ user_id: string }>();
      for (const row of partnerAes.results ?? []) recipientIds.add(row.user_id);

      for (const userId of recipientIds) {
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
          await createNotification(env.DB, {
            recipientUserId: userId,
            type: "go_live_reminder",
            title: `Go-live ${days === 1 ? "tomorrow" : `in ${days} days`}: ${project.name}`,
            body: `Target date: ${project.target_go_live_date}`,
            entityType: "project",
            entityId: project.id,
            projectId: project.id,
          });
        }
      }
    }
  }
}


async function runHealthScoring(env: Bindings): Promise<void> {
  // Only score projects without a manual override
  const rows = await env.DB
    .prepare(
      `SELECT id, target_go_live_date, updated_at FROM projects
       WHERE (archived = 0 OR archived IS NULL) AND health_override IS NULL`
    )
    .all<{ id: string; target_go_live_date: string | null; updated_at: string | null }>();

  for (const project of rows.results ?? []) {
    try {
      const health = await computeProjectHealth(env.DB, project.id, project);
      await env.DB
        .prepare("UPDATE projects SET health = ? WHERE id = ?")
        .bind(health, project.id)
        .run();
    } catch {
      // Skip on error — don't let one bad project break the batch
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
      runHealthScoring(env),
    ]));
  },
};