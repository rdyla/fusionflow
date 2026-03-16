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
import { sendEmail } from "./services/emailService";
import { goLiveReminder } from "./lib/emailTemplates";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", cors());

app.get("/api/health", (c) => c.json({ ok: true }));

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

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runGoLiveReminders(env));
  },
};