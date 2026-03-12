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

export default app;