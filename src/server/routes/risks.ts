import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canViewProject, canEditProject } from "../services/accessService";
import { maybeSendEmail } from "../services/emailService";
import { riskAssigned, pmRiskNotification } from "../lib/emailTemplates";
import { createNotification } from "../lib/notifications";
import { syncProjectStatus } from "../lib/teamUtils";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const RISK_COLUMNS = "id, project_id, title, description, severity, status, owner_user_id, owner_contact_id, task_id";

app.get("/:id/risks", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db
    .prepare(
      `SELECT ${RISK_COLUMNS}
       FROM risks
       WHERE project_id = ?
       ORDER BY title ASC`
    )
    .bind(projectId)
    .all();

  return c.json(rows.results ?? []);
});

const riskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["open", "mitigated", "closed"]).optional(),
  owner_user_id: z.string().nullable().optional(),
  owner_contact_id: z.string().nullable().optional(),
  task_id: z.string().nullable().optional(),
});

app.post("/:id/risks", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = riskSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { title, description, severity, status, owner_user_id, owner_contact_id, task_id } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO risks (id, project_id, title, description, severity, status, owner_user_id, owner_contact_id, task_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, projectId, title, description ?? null, severity ?? "medium", status ?? "open", owner_user_id ?? null, owner_contact_id ?? null, task_id ?? null)
    .run();

  const created = await db.prepare(`SELECT ${RISK_COLUMNS} FROM risks WHERE id = ? LIMIT 1`).bind(id).first<{ id: string; title: string; description: string | null; severity: string | null; owner_user_id: string | null; owner_contact_id: string | null; task_id: string | null }>();

  // Auto-block the project when an open blocker is added
  await syncProjectStatus(db, projectId);

  if (created) {
    const appUrl = c.env.APP_URL ?? "";
    const project = await db.prepare("SELECT name, pm_user_id FROM projects WHERE id = ? LIMIT 1").bind(projectId).first<{ name: string; pm_user_id: string | null }>();

    // Notify risk owner if assigned to a PF user
    if (created.owner_user_id) {
      const owner = await db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(created.owner_user_id).first<{ email: string; name: string }>();
      if (owner) {
        c.executionCtx.waitUntil(maybeSendEmail(c.env, db, created.owner_user_id, "important", {
          to: owner.email,
          subject: `You've been assigned a risk: ${created.title}`,
          html: riskAssigned({ ownerName: owner.name ?? owner.email, riskTitle: created.title, riskDescription: created.description, projectName: project?.name ?? "", severity: created.severity, appUrl, projectId }),
        }));
        c.executionCtx.waitUntil(createNotification(db, {
          recipientUserId: created.owner_user_id,
          type: "risk_assigned",
          title: `Risk assigned to you: ${created.title}`,
          body: project?.name ?? "",
          entityType: "risk",
          entityId: id,
          projectId,
          senderUserId: auth.user.id,
        }));
      }
    }

    // Notify PM of new risk (skip if PM is the one who created it)
    if (project?.pm_user_id && project.pm_user_id !== auth.user.id) {
      const pm = await db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(project.pm_user_id).first<{ email: string; name: string }>();
      if (pm) {
        c.executionCtx.waitUntil(maybeSendEmail(c.env, db, project.pm_user_id, "routine", {
          to: pm.email,
          subject: `Risk added on ${project.name}: ${created.title}`,
          html: pmRiskNotification({ pmName: pm.name ?? pm.email, riskTitle: created.title, riskDescription: created.description, projectName: project.name, severity: created.severity, status: "open", isNew: true, appUrl, projectId }),
        }));
        c.executionCtx.waitUntil(createNotification(db, {
          recipientUserId: project.pm_user_id,
          type: "risk_added",
          title: `New risk on ${project.name}: ${created.title}`,
          body: created.description ?? undefined,
          entityType: "risk",
          entityId: id,
          projectId,
          senderUserId: auth.user.id,
        }));
      }
    }
  }

  return c.json(created, 201);
});

const updateRiskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["open", "mitigated", "closed"]).optional(),
  owner_user_id: z.string().nullable().optional(),
  owner_contact_id: z.string().nullable().optional(),
  task_id: z.string().nullable().optional(),
});

// Fields a client (customer portal user) is allowed to change on a blocker
// where they are the assigned contact. Title/severity/owner/task are PM-only
// concerns; clients can update progress (status) and add detail (description).
const CLIENT_EDITABLE_FIELDS = new Set(["status", "description"]);

app.patch("/:id/risks/:riskId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const riskId = c.req.param("riskId");

  const existing = await db
    .prepare(`SELECT id, owner_contact_id FROM risks WHERE id = ? AND project_id = ? LIMIT 1`)
    .bind(riskId, projectId)
    .first<{ id: string; owner_contact_id: string | null }>();
  if (!existing) throw new HTTPException(404, { message: "Risk not found" });

  // Authz: PMs/admins can edit anything; clients can edit a blocker if the
  // assigned project_contact is them (matched via dynamics_contact_id).
  const pmAllowed = await canEditProject(db, auth.user, projectId);
  let clientAllowed = false;
  if (!pmAllowed && auth.role === "client" && existing.owner_contact_id) {
    const contact = await db
      .prepare("SELECT dynamics_contact_id FROM project_contacts WHERE id = ? AND project_id = ? LIMIT 1")
      .bind(existing.owner_contact_id, projectId)
      .first<{ dynamics_contact_id: string | null }>();
    clientAllowed = !!contact?.dynamics_contact_id && contact.dynamics_contact_id === auth.user.id;
  }
  if (!pmAllowed && !clientAllowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = updateRiskSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const updates = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    // Clients are limited to status + description regardless of payload.
    if (clientAllowed && !pmAllowed && !CLIENT_EDITABLE_FIELDS.has(key)) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (!fields.length) throw new HTTPException(400, { message: "No valid fields to update" });

  await db
    .prepare(`UPDATE risks SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, riskId)
    .run();

  const updated = await db.prepare(`SELECT ${RISK_COLUMNS} FROM risks WHERE id = ? LIMIT 1`).bind(riskId).first<{ id: string; title: string; description: string | null; severity: string | null; status: string | null; task_id: string | null }>();

  // Sync project blocked status after blocker update
  await syncProjectStatus(db, projectId);

  // Notify PM of risk update (skip if PM made the change)
  const appUrl = c.env.APP_URL ?? "";
  const project = await db.prepare("SELECT name, pm_user_id FROM projects WHERE id = ? LIMIT 1").bind(projectId).first<{ name: string; pm_user_id: string | null }>();
  if (project?.pm_user_id && project.pm_user_id !== auth.user.id && updated) {
    const pm = await db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(project.pm_user_id).first<{ email: string; name: string }>();
    if (pm) {
      c.executionCtx.waitUntil(maybeSendEmail(c.env, db, project.pm_user_id, "routine", {
        to: pm.email,
        subject: `Risk updated on ${project.name}: ${updated.title}`,
        html: pmRiskNotification({ pmName: pm.name ?? pm.email, riskTitle: updated.title, riskDescription: updated.description, projectName: project.name, severity: updated.severity, status: updated.status, isNew: false, appUrl, projectId }),
      }));
    }
  }

  return c.json(updated);
});

app.delete("/:id/risks/:riskId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const riskId = c.req.param("riskId");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const existing = await db.prepare("SELECT id FROM risks WHERE id = ? AND project_id = ? LIMIT 1").bind(riskId, projectId).first();
  if (!existing) throw new HTTPException(404, { message: "Risk not found" });

  await db.prepare("DELETE FROM risks WHERE id = ?").bind(riskId).run();
  await syncProjectStatus(db, projectId);
  return c.json({ success: true });
});

export default app;
