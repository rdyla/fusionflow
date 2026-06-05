import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { canEditProject, canViewProject } from "../services/accessService";
import { getTeamUserIds, inPlaceholders } from "../lib/teamUtils";
import { sendEmail } from "../services/emailService";
import { projectAtRisk } from "../lib/emailTemplates";
import { computeProjectHealth } from "../lib/healthScore";
import { getAccountTeam, getCase, getCaseTimeEntries, getAccountOpportunities, getOpportunityQuotes } from "../services/dynamicsService";
import { ensureSharePointChildFolder } from "../services/graphService";
import { resolveCustomerSharePointUrl } from "../lib/customerSharePoint";
import { findOrCreatePfUser } from "../lib/crmUsers";
import { findOrCreatePartnerAe } from "../lib/partnerAe";
import { SOLUTION_TYPES, serializeSolutionTypes, normalizeSolutionTypesField, buildTaggedTitle, parseTaggedTitle, type SolutionType } from "../../shared/solutionTypes";
import { syncStageStatus, syncProjectStatus, syncProjectGoLiveDate } from "../lib/teamUtils";
import { canonicalizeVendor } from "../../shared/vendors";
import { getDemoVendor } from "../lib/appSettings";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;

  let sql = `
    SELECT id, name, customer_name, customer_id, vendor, solution_types, status, health,
           kickoff_date, target_go_live_date, actual_go_live_date,
           pm_user_id, managed_in_asana, asana_project_id, crm_case_id, crm_opportunity_id, created_at, updated_at,
           CASE WHEN EXISTS(SELECT 1 FROM optimize_accounts oa WHERE oa.project_id = projects.id) THEN 1 ELSE 0 END AS has_optimization
    FROM projects
    WHERE (archived = 0 OR archived IS NULL)
  `;
  let bindings: string[] = [];

  if (auth.role === "pm") {
    sql += " AND (pm_user_id = ? OR id IN (SELECT project_id FROM project_staff WHERE user_id = ? AND staff_role = 'pm'))";
    bindings = [auth.user.id, auth.user.id];
  } else if (auth.role === "pf_ae") {
    const teamIds = await getTeamUserIds(auth.user.id, db);
    const ph = inPlaceholders(teamIds);
    sql += ` AND (customer_id IN (SELECT id FROM customers WHERE pf_ae_user_id IN (${ph})) OR id IN (SELECT project_id FROM project_access WHERE user_id IN (${ph})))`;
    bindings = [...teamIds, ...teamIds];
  } else if (auth.role === "partner_ae") {
    const teamIds = await getTeamUserIds(auth.user.id, db);
    const ph = inPlaceholders(teamIds);
    sql += ` AND id IN (
      SELECT project_id FROM project_access WHERE user_id IN (${ph})
      UNION
      SELECT project_id FROM project_staff WHERE staff_role = 'partner_ae' AND user_id IN (${ph})
    )`;
    bindings = [...teamIds, ...teamIds];
  } else if (auth.role === "client") {
    if (!auth.user.dynamics_account_id) return c.json([]);
    sql += " AND dynamics_account_id = ?";
    bindings = [auth.user.dynamics_account_id];
  }
  // pf_sa, pf_csm, and admin: no filter — portfolio-wide visibility

  // Demo-mode vendor lens: silently filters every list view to a single vendor.
  const demoVendor = await getDemoVendor(db);
  if (demoVendor) {
    sql += " AND LOWER(vendor) = ?";
    bindings.push(demoVendor);
  }

  // Optional drill-down filters (e.g. from the dashboard "By AE" donut).
  // `none` is a sentinel for projects with no AE assignment.
  const pfAeId = c.req.query("pf_ae_id");
  if (pfAeId) {
    if (pfAeId === "none") {
      sql += " AND (customer_id IS NULL OR customer_id IN (SELECT id FROM customers WHERE pf_ae_user_id IS NULL))";
    } else {
      sql += " AND customer_id IN (SELECT id FROM customers WHERE pf_ae_user_id = ?)";
      bindings.push(pfAeId);
    }
  }
  const partnerAeId = c.req.query("partner_ae_id");
  if (partnerAeId) {
    if (partnerAeId === "none") {
      sql += " AND id NOT IN (SELECT project_id FROM project_staff WHERE staff_role = 'partner_ae')";
    } else {
      sql += " AND id IN (SELECT project_id FROM project_staff WHERE staff_role = 'partner_ae' AND user_id = ?)";
      bindings.push(partnerAeId);
    }
  }

  sql += " ORDER BY updated_at DESC";

  const rows = await db.prepare(sql).bind(...bindings).all();

  return c.json((rows.results ?? []).map(normalizeSolutionTypesField));
});

app.get("/:id", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const project = await db
    .prepare(
      `
      SELECT p.id, p.name, p.customer_name, p.customer_id, p.vendor, p.solution_types, p.status, p.health,
             p.kickoff_date, p.target_go_live_date, p.actual_go_live_date,
             p.pm_user_id, p.dynamics_account_id, p.asana_project_id, p.managed_in_asana, p.crm_case_id, p.crm_opportunity_id,
             p.sharepoint_folder_url,
             p.created_at, p.updated_at,
             pmu.email AS pm_email, pmu.phone AS pm_phone, pmu.scheduler_url AS pm_scheduler_url,
             c.name AS customer_display_name,
             cpu1.name AS customer_pf_ae_name, cpu1.email AS customer_pf_ae_email, cpu1.phone AS customer_pf_ae_phone, cpu1.scheduler_url AS customer_pf_ae_scheduler_url,
             cpu2.name AS customer_pf_sa_name, cpu2.email AS customer_pf_sa_email, cpu2.phone AS customer_pf_sa_phone, cpu2.scheduler_url AS customer_pf_sa_scheduler_url,
             cpu3.name AS customer_pf_csm_name, cpu3.email AS customer_pf_csm_email, cpu3.phone AS customer_pf_csm_phone, cpu3.scheduler_url AS customer_pf_csm_scheduler_url,
             c.sharepoint_url AS customer_sharepoint_url,
             CASE WHEN EXISTS(SELECT 1 FROM optimize_accounts oa WHERE oa.project_id = p.id) THEN 1 ELSE 0 END AS has_optimization
      FROM projects p
      LEFT JOIN users pmu ON pmu.id = p.pm_user_id
      LEFT JOIN customers c ON c.id = p.customer_id
      LEFT JOIN users cpu1 ON cpu1.id = c.pf_ae_user_id
      LEFT JOIN users cpu2 ON cpu2.id = c.pf_sa_user_id
      LEFT JOIN users cpu3 ON cpu3.id = c.pf_csm_user_id
      WHERE p.id = ?
      LIMIT 1
      `
    )
    .bind(projectId)
    .first();

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  return c.json(normalizeSolutionTypesField(project));
});

const createProjectSchema = z.object({
  name: z.string().min(1).max(500),
  customer_name: z.string().max(500).optional(),
  customer_id: z.string().nullable().optional(),
  vendor: z.string().max(500).optional(),
  solution_types: z.array(z.enum(SOLUTION_TYPES)).default([]),
  kickoff_date: z.string().optional(),
  target_go_live_date: z.string().optional(),
  pm_user_id: z.string().nullable().optional(),
  dynamics_account_id: z.string().nullable().optional(),
  crm_case_id: z.string().nullable().optional(),
  crm_opportunity_id: z.string().nullable().optional(),
});

app.post("/", requireRole("admin", "pm", "pf_sa"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const rawBody = await c.req.json();
  const parsed = createProjectSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const { name, customer_name, customer_id: customerIdInput, vendor: vendorInput, solution_types, kickoff_date, target_go_live_date, pm_user_id: pmInput, dynamics_account_id, crm_case_id } = parsed.data;

  // Demo mode pins the vendor on every newly-created project.
  // Canonicalize the user-supplied value so legacy free-text inputs ("Ring Central",
  // "Zoom Phone", etc.) fold to the same enum the rest of the app branches on.
  const demoVendor = await getDemoVendor(db);
  const vendor = demoVendor ? demoVendor : (canonicalizeVendor(vendorInput) ?? vendorInput ?? null);

  const projectId = crypto.randomUUID();
  const pm_user_id = pmInput ?? (auth.role === "pm" ? auth.user.id : null);

  // If a CRM account is selected, find or create the customer record and link the project to it
  let customer_id = customerIdInput ?? null;
  if (dynamics_account_id && !customer_id) {
    const existing = await db
      .prepare(`SELECT id FROM customers WHERE crm_account_id = ? LIMIT 1`)
      .bind(dynamics_account_id)
      .first<{ id: string }>();
    if (existing) {
      customer_id = existing.id;
    } else {
      const newCustomerId = crypto.randomUUID();
      await db
        .prepare(`INSERT INTO customers (id, name, crm_account_id) VALUES (?, ?, ?)`)
        .bind(newCustomerId, customer_name ?? "Unknown", dynamics_account_id)
        .run();
      customer_id = newCustomerId;
      // Best-effort CRM sync to populate the account team
      try {
        const team = await getAccountTeam(c.env, dynamics_account_id);
        const [aeId, saId, csmId] = await Promise.all([
          findOrCreatePfUser(db, team.ae_email, team.ae_name, "pf_ae"),
          findOrCreatePfUser(db, team.sa_email, team.sa_name, "pf_sa"),
          findOrCreatePfUser(db, team.csm_email, team.csm_name, "pf_csm"),
        ]);
        if (aeId || saId || csmId) {
          await db
            .prepare(`UPDATE customers SET pf_ae_user_id = ?, pf_sa_user_id = ?, pf_csm_user_id = ? WHERE id = ?`)
            .bind(aeId ?? null, saId ?? null, csmId ?? null, newCustomerId)
            .run();
        }
      } catch { /* sync is best-effort */ }
    }
  }

  await db
    .prepare(
      `INSERT INTO projects (id, name, customer_name, customer_id, vendor, solution_types, status, health, kickoff_date, target_go_live_date, pm_user_id, dynamics_account_id, crm_case_id)
       VALUES (?, ?, ?, ?, ?, ?, 'in_progress', 'on_track', ?, ?, ?, ?, ?)`
    )
    .bind(projectId, name, customer_name ?? null, customer_id ?? null, vendor ?? null, serializeSolutionTypes(solution_types), kickoff_date ?? null, target_go_live_date ?? null, pm_user_id, dynamics_account_id ?? null, crm_case_id ?? null)
    .run();

  // Every project owns at least one deployment phase. Single-phase projects
  // operate entirely on this default; multi-phase projects add more rows via
  // the Phases panel. Created here so the PM never has to manually seed it
  // before applying a template.
  await db
    .prepare(
      `INSERT INTO phases (id, project_id, name, target_go_live_date, display_order)
       VALUES (?, ?, 'Main', ?, 0)`
    )
    .bind(`phase-${projectId}`, projectId, target_go_live_date ?? null)
    .run();

  // Best-effort: create the project's SharePoint subfolder under the customer's
  // SP root. resolveCustomerSharePointUrl lazily backfills the customer's
  // sharepoint_url from Dynamics doc locations if it isn't set yet — most
  // customers get a default SP location on CRM provisioning, so this should
  // succeed on the first try without manual customer-record edits. Failures
  // log and continue; PM can retry from the SharePoint tab.
  if (customer_id) {
    try {
      const customerSpUrl = await resolveCustomerSharePointUrl(c.env, db, customer_id);
      if (customerSpUrl) {
        const folder = await ensureSharePointChildFolder(c.env, customerSpUrl, name);
        if (folder.webUrl) {
          await db
            .prepare("UPDATE projects SET sharepoint_folder_url = ? WHERE id = ?")
            .bind(folder.webUrl, projectId)
            .run();
        }
      }
    } catch (err) {
      console.warn(`[projects.create] SharePoint folder creation failed for ${projectId}:`, err instanceof Error ? err.message : err);
    }
  }

  const created = await db
    .prepare("SELECT id, name, customer_name, vendor, solution_types, status, health, kickoff_date, target_go_live_date, actual_go_live_date, pm_user_id, customer_id, sharepoint_folder_url, created_at, updated_at FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first();

  return c.json(created ? normalizeSolutionTypesField(created) : null, 201);
});

// Project status is auto-derived from stages + open blockers — see
// teamUtils.syncProjectStatus, fired from routes/tasks.ts and routes/risks.ts
// on any task or blocker write. PMs can't set it manually anymore
// (May-2026); a `status` field in the payload is silently dropped by zod.
const updateProjectSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  // CRM (re)link: a picked Dynamics account id + its display name. The handler
  // resolves/creates the customer row and sets customer_id alongside. Pass
  // dynamics_account_id: null to unlink.
  dynamics_account_id: z.string().nullable().optional(),
  customer_name: z.string().max(500).nullable().optional(),
  health: z.string().min(1).optional(),
  clear_health_override: z.boolean().optional(),
  target_go_live_date: z.string().optional(),
  actual_go_live_date: z.string().optional(),
  pm_user_id: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  solution_types: z.array(z.enum(SOLUTION_TYPES)).optional(),
  asana_project_id: z.string().nullable().optional(),
  managed_in_asana: z.number().int().min(0).max(1).optional(),
  crm_case_id: z.string().nullable().optional(),
  crm_opportunity_id: z.string().nullable().optional(),
  // Recurring status-meeting cadence (drives "Next call" on the stakeholder view).
  // dow uses 0=Sun … 6=Sat; time_local is "HH:MM" in status_meeting_timezone.
  status_meeting_title: z.string().max(255).nullable().optional(),
  status_meeting_dow: z.number().int().min(0).max(6).nullable().optional(),
  status_meeting_time_local: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  status_meeting_timezone: z.string().max(64).nullable().optional(),
  status_meeting_duration_min: z.number().int().min(5).max(480).nullable().optional(),
  status_meeting_join_url: z.string().max(2000).nullable().optional(),
  /** When a PM removes one or more solution_types from a combo project,
   *  setting this list also cleans up tasks tagged with those types via
   *  buildTaggedTitle. Tasks whose only types are in the cleanup list get
   *  deleted; tasks with overlapping types get re-tagged with the
   *  surviving types. Stages and stage-level dates are unaffected. */
  cleanup_solution_types: z.array(z.enum(SOLUTION_TYPES)).optional(),
});

app.patch("/:id", requireRole("admin", "pm", "pf_sa"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateProjectSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  // Capture current health before update so we can detect at_risk transitions
  const before = await db
    .prepare("SELECT health, name, customer_name, pm_user_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ health: string | null; name: string; customer_name: string | null; pm_user_id: string | null }>();

  const {
    clear_health_override, cleanup_solution_types,
    dynamics_account_id: dynIdInput, customer_name: customerNameInput,
    ...updates
  } = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];

  // CRM customer (re)link. When a Dynamics account id is supplied, resolve or
  // create its customer row and set customer_id + customer_name +
  // dynamics_account_id together (mirrors project creation). Handled outside
  // the generic loop because customer_id is derived, not sent by the client.
  // dynamics_account_id: null explicitly unlinks the project.
  if (dynIdInput !== undefined) {
    if (dynIdInput) {
      let linkedCustomerId: string;
      const existing = await db
        .prepare(`SELECT id FROM customers WHERE crm_account_id = ? LIMIT 1`)
        .bind(dynIdInput)
        .first<{ id: string }>();
      if (existing) {
        linkedCustomerId = existing.id;
      } else {
        linkedCustomerId = crypto.randomUUID();
        await db
          .prepare(`INSERT INTO customers (id, name, crm_account_id) VALUES (?, ?, ?)`)
          .bind(linkedCustomerId, customerNameInput ?? "Unknown", dynIdInput)
          .run();
        // Best-effort CRM team sync, same as project creation.
        try {
          const team = await getAccountTeam(c.env, dynIdInput);
          const [aeId, saId, csmId] = await Promise.all([
            findOrCreatePfUser(db, team.ae_email, team.ae_name, "pf_ae"),
            findOrCreatePfUser(db, team.sa_email, team.sa_name, "pf_sa"),
            findOrCreatePfUser(db, team.csm_email, team.csm_name, "pf_csm"),
          ]);
          if (aeId || saId || csmId) {
            await db
              .prepare(`UPDATE customers SET pf_ae_user_id = ?, pf_sa_user_id = ?, pf_csm_user_id = ? WHERE id = ?`)
              .bind(aeId ?? null, saId ?? null, csmId ?? null, linkedCustomerId)
              .run();
          }
        } catch { /* sync is best-effort */ }
      }
      fields.push("dynamics_account_id = ?"); values.push(dynIdInput);
      fields.push("customer_id = ?"); values.push(linkedCustomerId);
      if (customerNameInput) { fields.push("customer_name = ?"); values.push(customerNameInput); }
    } else {
      fields.push("dynamics_account_id = ?"); values.push(null);
      fields.push("customer_id = ?"); values.push(null);
    }
  }

  // Handle "reset to auto" — clear override and compute health immediately
  if (clear_health_override) {
    const projectRow = await db
      .prepare("SELECT target_go_live_date, updated_at FROM projects WHERE id = ? LIMIT 1")
      .bind(projectId)
      .first<{ target_go_live_date: string | null; updated_at: string | null }>();
    const autoHealth = projectRow
      ? await computeProjectHealth(db, projectId, projectRow)
      : "on_track";
    await db
      .prepare("UPDATE projects SET health = ?, health_override = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(autoHealth, projectId)
      .run();
    const updated = await db.prepare("SELECT * FROM projects WHERE id = ? LIMIT 1").bind(projectId).first();
    return c.json(updated ? normalizeSolutionTypesField(updated) : null);
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (key === "solution_types" && Array.isArray(value)) {
      fields.push(`${key} = ?`);
      values.push(serializeSolutionTypes(value as typeof SOLUTION_TYPES[number][]));
      continue;
    }
    if (key === "vendor" && typeof value === "string") {
      fields.push(`${key} = ?`);
      values.push(canonicalizeVendor(value) ?? value);
      continue;
    }
    fields.push(`${key} = ?`);
    values.push(value);
  }

  // When health is explicitly set by a PM, record it as a manual override
  if (updates.health !== undefined) {
    fields.push("health_override = ?");
    values.push(updates.health);
  }

  if (!fields.length) {
    throw new HTTPException(400, { message: "No valid fields to update" });
  }

  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db
    .prepare(
      `
      UPDATE projects
      SET ${fields.join(", ")}
      WHERE id = ?
      `
    )
    .bind(...values, projectId)
    .run();

  // Solution-type cleanup — runs after the project UPDATE so the project's
  // canonical solution_types is already what the PM picked. Tasks whose
  // only tagged types are in the cleanup list get deleted; tasks with
  // surviving types are re-tagged.
  if (cleanup_solution_types && cleanup_solution_types.length > 0) {
    const removed = new Set<SolutionType>(cleanup_solution_types);
    const taskRows = await db
      .prepare("SELECT id, stage_id, title FROM tasks WHERE project_id = ?")
      .bind(projectId)
      .all<{ id: string; stage_id: string | null; title: string }>();
    const stageIdsTouched = new Set<string>();
    for (const t of (taskRows.results ?? [])) {
      const parsed = parseTaggedTitle(t.title);
      if (parsed.types.length === 0) continue; // no recognized tag → leave alone
      const surviving = parsed.types.filter((tp) => !removed.has(tp));
      if (surviving.length === 0) {
        await db.prepare("DELETE FROM tasks WHERE id = ?").bind(t.id).run();
        if (t.stage_id) stageIdsTouched.add(t.stage_id);
      } else if (surviving.length !== parsed.types.length) {
        const newTitle = buildTaggedTitle(surviving, parsed.rawTitle);
        await db.prepare("UPDATE tasks SET title = ? WHERE id = ?").bind(newTitle, t.id).run();
      }
    }
    // Stages that lost their only task can flip status (e.g. completed → not_started)
    // and the project's blocker/go-live picture may change too.
    for (const stageId of stageIdsTouched) {
      await syncStageStatus(db, stageId);
    }
    await syncProjectGoLiveDate(db, projectId);
    await syncProjectStatus(db, projectId);
  }

  const updated = await db
    .prepare("SELECT * FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first();

  // Notify when health transitions to at_risk
  if (updates.health === "at_risk" && before?.health !== "at_risk" && before) {
    const appUrl = c.env.APP_URL ?? "";

    // Collect recipients: PM + partner AEs assigned via project_staff
    const partnerAes = await db
      .prepare(
        `SELECT u.id, u.email, u.name FROM project_staff ps
         JOIN users u ON u.id = ps.user_id
         WHERE ps.project_id = ? AND ps.staff_role = 'partner_ae' AND u.is_active = 1`
      )
      .bind(projectId)
      .all<{ id: string; email: string; name: string }>();

    const recipients: { email: string; name: string }[] = [];

    if (before.pm_user_id) {
      const pm = await db
        .prepare("SELECT email, name FROM users WHERE id = ? AND is_active = 1 LIMIT 1")
        .bind(before.pm_user_id)
        .first<{ email: string; name: string }>();
      if (pm) recipients.push(pm);
    }

    for (const ae of partnerAes.results ?? []) {
      if (!recipients.some((r) => r.email === ae.email)) recipients.push(ae);
    }

    for (const recipient of recipients) {
      const html = projectAtRisk({
        recipientName: recipient.name ?? recipient.email,
        projectName: before.name,
        customerName: before.customer_name,
        appUrl,
        projectId,
      });
      c.executionCtx.waitUntil(sendEmail(c.env, {
        to: recipient.email,
        subject: `Project at risk: ${before.name}`,
        html,
      }));
    }
  }

  return c.json(updated ? normalizeSolutionTypesField(updated) : null);
});

// ── CRM Case + Hours Compliance ──────────────────────────────────────────────

app.get("/:id/case", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const project = await db
    .prepare("SELECT crm_case_id, crm_opportunity_id, customer_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ crm_case_id: string | null; crm_opportunity_id: string | null; customer_id: string | null }>();
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  // External-resource spend (D1, independent of any CRM case) — surfaced on the
  // CRM Case tab as additional "hours used" (total / 165 blended rate).
  const extRow = await db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM project_external_resources WHERE project_id = ?")
    .bind(projectId)
    .first<{ total: number }>();
  const externalResourcesTotal = extRow?.total ?? 0;

  if (!project.crm_case_id) {
    return c.json({ case: null, timeEntries: [], quotedHours: null, sowQuote: null, accountOpportunities: [], externalResourcesTotal });
  }

  // Fetch case and time entries in parallel
  const [caseData, timeEntries] = await Promise.all([
    getCase(c.env, project.crm_case_id),
    getCaseTimeEntries(c.env, project.crm_case_id),
  ]);

  // SOW hours: use pinned opportunity if set, otherwise return account opps for the PM to pick
  let sowQuote: import("../services/dynamicsService").DynamicsQuote | null = null;
  let accountOpportunities: import("../services/dynamicsService").DynamicsOpportunity[] = [];

  if (project.customer_id) {
    const customer = await db
      .prepare("SELECT crm_account_id FROM customers WHERE id = ? LIMIT 1")
      .bind(project.customer_id)
      .first<{ crm_account_id: string }>();
    if (customer?.crm_account_id) {
      // Always fetch account opps so the UI can display the linked opportunity's name
      accountOpportunities = await getAccountOpportunities(c.env, customer.crm_account_id).catch(() => []);
      if (project.crm_opportunity_id) {
        // Opportunity is pinned — fetch its quotes directly
        const quotes = await getOpportunityQuotes(c.env, project.crm_opportunity_id).catch(() => []);
        const withSow = quotes.filter((q) => q.am_sow != null);
        const priority = (q: { statecode: number }) => (q.statecode === 2 ? 0 : q.statecode === 1 ? 1 : 2);
        withSow.sort((a, b) => priority(a) - priority(b));
        sowQuote = withSow[0] ?? null;
      }
    }
  }

  return c.json({ case: caseData, timeEntries, sowQuote, accountOpportunities, externalResourcesTotal });
});

// ── SharePoint folder (retrofit for projects created before the auto-create) ─
//
// Creates (or adopts an existing) named subfolder for this project under the
// customer's SP root, persists the URL on the project. Mirrors the best-effort
// folder-create logic in the POST /projects handler but errors out loudly so
// the PM sees what went wrong. Idempotent — clicking it twice returns the
// already-set URL without creating a duplicate.

app.post("/:id/sharepoint-folder", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  if (!(await canEditProject(db, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const project = await db
    .prepare("SELECT name, customer_id, sharepoint_folder_url FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ name: string; customer_id: string | null; sharepoint_folder_url: string | null }>();
  if (!project) return c.json({ error: "Project not found" }, 404);

  // Already wired up — just return the existing URL so the client can hot-swap.
  if (project.sharepoint_folder_url) {
    return c.json({ sharepoint_folder_url: project.sharepoint_folder_url, reused: true });
  }

  // Error responses use c.json (not HTTPException) so the client toast can read
  // the message — HTTPException defaults to text/plain and the request helper
  // falls back to "API error: 400" which hides the real reason.
  if (!project.customer_id) {
    return c.json({
      error: "Project has no linked customer. Link a customer record (CRM account) before creating a SharePoint folder.",
    }, 400);
  }
  const customerSpUrl = await resolveCustomerSharePointUrl(c.env, db, project.customer_id);
  if (!customerSpUrl) {
    // Pull a bit of extra context so the PM can see whether it's a CRM-side
    // gap (no doc locations on the account) vs. a missing CRM link entirely.
    const cust = await db
      .prepare("SELECT name, crm_account_id FROM customers WHERE id = ? LIMIT 1")
      .bind(project.customer_id)
      .first<{ name: string; crm_account_id: string | null }>();
    const detail = cust?.crm_account_id
      ? `Customer "${cust?.name}" is linked to CRM account ${cust.crm_account_id} but Dynamics returned no SharePoint document locations for it. Check that the account has a SharePoint folder set up in CRM, then retry.`
      : `Customer "${cust?.name ?? "(unknown)"}" has no SharePoint URL set and no CRM account linked, so we can't auto-resolve one. Set sharepoint_url on the customer record, or link the customer to a CRM account, then retry.`;
    return c.json({ error: detail }, 400);
  }

  try {
    const folder = await ensureSharePointChildFolder(c.env, customerSpUrl, project.name);
    if (!folder.webUrl) {
      return c.json({ error: "Folder created but no webUrl returned from Graph." }, 500);
    }
    await db
      .prepare("UPDATE projects SET sharepoint_folder_url = ? WHERE id = ?")
      .bind(folder.webUrl, projectId)
      .run();
    return c.json({ sharepoint_folder_url: folder.webUrl, reused: folder.reused });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SharePoint folder create failed";
    console.error(`[projects.${projectId}.sharepoint-folder]`, message);
    return c.json({ error: `SharePoint folder create failed: ${message}` }, 500);
  }
});

// ── Project Contacts ──────────────────────────────────────────────────────────

app.get("/:id/contacts", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  try {
    const rows = await db
      .prepare("SELECT * FROM project_contacts WHERE project_id = ? ORDER BY name ASC")
      .bind(projectId)
      .all();
    return c.json(rows.results ?? []);
  } catch {
    return c.json([]);
  }
});

const addContactSchema = z.object({
  dynamics_contact_id: z.string().optional(),
  name: z.string().min(1).max(500),
  email: z.string().max(500).nullable().optional(),
  phone: z.string().max(100).nullable().optional(),
  job_title: z.string().max(500).nullable().optional(),
  contact_role: z.string().max(100).nullable().optional(),
});

app.post("/:id/contacts", requireRole("admin", "pm", "pf_ae"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = addContactSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { dynamics_contact_id, name, email, phone, job_title, contact_role } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare("INSERT INTO project_contacts (id, project_id, dynamics_contact_id, name, email, phone, job_title, contact_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, projectId, dynamics_contact_id ?? null, name, email ?? null, phone ?? null, job_title ?? null, contact_role ?? null)
    .run();

  const created = await db.prepare("SELECT * FROM project_contacts WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

app.delete("/:id/contacts/:contactId", requireRole("admin", "pm", "pf_ae"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  await db
    .prepare("DELETE FROM project_contacts WHERE id = ? AND project_id = ?")
    .bind(c.req.param("contactId"), projectId)
    .run();
  return c.json({ success: true });
});

// ── Project Staff ─────────────────────────────────────────────────────────────

app.get("/:id/staff", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db.prepare(`
    SELECT ps.id, ps.project_id, ps.user_id, ps.staff_role, ps.created_at,
           u.name, u.email, u.phone, u.scheduler_url, u.role, u.avatar_url, u.organization_name
    FROM project_staff ps
    JOIN users u ON u.id = ps.user_id
    WHERE ps.project_id = ?
    ORDER BY ps.staff_role, u.name
  `).bind(projectId).all();
  return c.json(rows.results ?? []);
});

app.post("/:id/staff", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const body = await c.req.json<{ user_id?: string; staff_role?: string; new_partner_ae?: { name: string; email: string; organization_name?: string | null } }>();
  let userId = body.user_id;
  let staffRole = body.staff_role;

  // Net-new partner AE: invite/create the partner_ae user, then attach. Mirrors
  // the solutions "Add New" partner AE flow.
  if (body.new_partner_ae) {
    staffRole = "partner_ae";
    userId = (await findOrCreatePartnerAe(c.env, db, auth.user.name ?? auth.user.email, {
      email: body.new_partner_ae.email,
      name: body.new_partner_ae.name?.trim() || null,
      organization_name: body.new_partner_ae.organization_name ?? null,
      executionCtx: c.executionCtx,
    })) ?? undefined;
    if (!userId) throw new HTTPException(400, { message: "Name and a valid email are required to invite a partner AE." });
  }

  if (!userId || !staffRole) throw new HTTPException(400, { message: "user_id and staff_role required" });

  const id = crypto.randomUUID();
  await db.prepare("INSERT OR IGNORE INTO project_staff (id, project_id, user_id, staff_role) VALUES (?, ?, ?, ?)")
    .bind(id, projectId, userId, staffRole).run();

  const created = await db.prepare(`
    SELECT ps.id, ps.project_id, ps.user_id, ps.staff_role, ps.created_at,
           u.name, u.email, u.phone, u.scheduler_url, u.role, u.avatar_url, u.organization_name
    FROM project_staff ps JOIN users u ON u.id = ps.user_id
    WHERE ps.project_id = ? AND ps.user_id = ? AND ps.staff_role = ? LIMIT 1
  `).bind(projectId, userId, staffRole).first();
  return c.json(created, 201);
});

app.delete("/:id/staff/:staffId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  await db.prepare("DELETE FROM project_staff WHERE id = ? AND project_id = ?")
    .bind(c.req.param("staffId"), projectId).run();
  return c.json({ success: true });
});

// ── CRM team sync ─────────────────────────────────────────────────────────────

app.post("/:id/crm-sync", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canEditProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const project = await db
    .prepare("SELECT dynamics_account_id, customer_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ dynamics_account_id: string | null; customer_id: string | null }>();

  if (!project?.dynamics_account_id) {
    throw new HTTPException(400, { message: "No CRM account linked to this project" });
  }

  const team = await getAccountTeam(c.env, project.dynamics_account_id);

  const [ae_user_id, sa_user_id, csm_user_id] = await Promise.all([
    findOrCreatePfUser(db, team.ae_email, team.ae_name, "pf_ae"),
    findOrCreatePfUser(db, team.sa_email, team.sa_name, "pf_sa"),
    findOrCreatePfUser(db, team.csm_email, team.csm_name, "pf_csm"),
  ]);

  // Account team lives on the customer — update or create the customer record
  if (project.customer_id) {
    await db
      .prepare("UPDATE customers SET pf_ae_user_id = ?, pf_sa_user_id = ?, pf_csm_user_id = ? WHERE id = ?")
      .bind(ae_user_id ?? null, sa_user_id ?? null, csm_user_id ?? null, project.customer_id)
      .run();
  } else if (project.dynamics_account_id && (ae_user_id || sa_user_id || csm_user_id)) {
    // No customer yet — find or create one, then link the project
    let custId: string;
    const existingCust = await db
      .prepare("SELECT id FROM customers WHERE crm_account_id = ? LIMIT 1")
      .bind(project.dynamics_account_id).first<{ id: string }>();
    if (existingCust) {
      custId = existingCust.id;
    } else {
      custId = crypto.randomUUID();
      const projectRow = await db.prepare("SELECT customer_name FROM projects WHERE id = ? LIMIT 1").bind(projectId).first<{ customer_name: string | null }>();
      await db.prepare("INSERT INTO customers (id, name, crm_account_id) VALUES (?, ?, ?)")
        .bind(custId, projectRow?.customer_name ?? "Unknown", project.dynamics_account_id).run();
    }
    await db.prepare("UPDATE customers SET pf_ae_user_id = ?, pf_sa_user_id = ?, pf_csm_user_id = ? WHERE id = ?")
      .bind(ae_user_id ?? null, sa_user_id ?? null, csm_user_id ?? null, custId).run();
    await db.prepare("UPDATE projects SET customer_id = ? WHERE id = ?").bind(custId, projectId).run();
  }

  // Return updated staff list and the refreshed project row
  const [staff, updatedProject] = await Promise.all([
    db.prepare(`
      SELECT ps.id, ps.project_id, ps.user_id, ps.staff_role, ps.created_at,
             u.name, u.email, u.phone, u.scheduler_url, u.role, u.avatar_url, u.organization_name
      FROM project_staff ps JOIN users u ON u.id = ps.user_id
      WHERE ps.project_id = ?
      ORDER BY ps.staff_role, u.name
    `).bind(projectId).all(),
    db.prepare(`
      SELECT p.*, pmu.email AS pm_email, pmu.phone AS pm_phone, pmu.scheduler_url AS pm_scheduler_url,
             c.name AS customer_display_name,
             cpu1.name AS customer_pf_ae_name, cpu1.email AS customer_pf_ae_email, cpu1.phone AS customer_pf_ae_phone, cpu1.scheduler_url AS customer_pf_ae_scheduler_url,
             cpu2.name AS customer_pf_sa_name, cpu2.email AS customer_pf_sa_email, cpu2.phone AS customer_pf_sa_phone, cpu2.scheduler_url AS customer_pf_sa_scheduler_url,
             cpu3.name AS customer_pf_csm_name, cpu3.email AS customer_pf_csm_email, cpu3.phone AS customer_pf_csm_phone, cpu3.scheduler_url AS customer_pf_csm_scheduler_url,
             c.sharepoint_url AS customer_sharepoint_url
      FROM projects p
      LEFT JOIN users pmu ON pmu.id = p.pm_user_id
      LEFT JOIN customers c ON c.id = p.customer_id
      LEFT JOIN users cpu1 ON cpu1.id = c.pf_ae_user_id
      LEFT JOIN users cpu2 ON cpu2.id = c.pf_sa_user_id
      LEFT JOIN users cpu3 ON cpu3.id = c.pf_csm_user_id
      WHERE p.id = ? LIMIT 1
    `).bind(projectId).first(),
  ]);

  return c.json({
    staff: staff.results ?? [],
    crm: { ae_name: team.ae_name, sa_name: team.sa_name, csm_name: team.csm_name },
    project: updatedProject ? normalizeSolutionTypesField(updatedProject) : null,
  });
});

// ── External Resources ───────────────────────────────────────────────────────
// Outside vendor / contractor engagements (e.g. a Field Nation tech). PM/admin
// only. The summed amount surfaces on the CRM Case tab as extra "hours used"
// (amount / 165) and as a billable total at project close.
const EXTERNAL_STATUSES = ["new", "posted", "assigned", "in_progress", "closed", "billed"] as const;
const externalResourceSchema = z.object({
  engagement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  contractor_name: z.string().min(1).max(255),
  contractor_email: z.string().max(320).nullable().optional(),
  task_description: z.string().max(5000).nullable().optional(),
  amount: z.number().min(0),
  status: z.enum(EXTERNAL_STATUSES).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

app.get("/:id/external-resources", requireRole("admin", "pm"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  if (!(await canViewProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });
  const rows = await db
    .prepare("SELECT id, project_id, engagement_date, contractor_name, contractor_email, task_description, amount, status, notes, created_at FROM project_external_resources WHERE project_id = ? ORDER BY created_at DESC")
    .bind(projectId)
    .all();
  return c.json(rows.results ?? []);
});

app.post("/:id/external-resources", requireRole("admin", "pm"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  if (!(await canEditProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });
  const parsed = externalResourceSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const d = parsed.data;
  const id = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO project_external_resources
      (id, project_id, engagement_date, contractor_name, contractor_email, task_description, amount, status, notes, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, projectId, d.engagement_date ?? null, d.contractor_name, d.contractor_email ?? null, d.task_description ?? null, d.amount, d.status ?? "new", d.notes ?? null, auth.user.id)
    .run();
  const created = await db
    .prepare("SELECT id, project_id, engagement_date, contractor_name, contractor_email, task_description, amount, status, notes, created_at FROM project_external_resources WHERE id = ? LIMIT 1")
    .bind(id)
    .first();
  return c.json(created, 201);
});

app.patch("/:id/external-resources/:rid", requireRole("admin", "pm"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const rid = c.req.param("rid");
  if (!(await canEditProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });
  const parsed = externalResourceSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (!fields.length) throw new HTTPException(400, { message: "No valid fields to update" });
  await db
    .prepare(`UPDATE project_external_resources SET ${fields.join(", ")} WHERE id = ? AND project_id = ?`)
    .bind(...values, rid, projectId)
    .run();
  const updated = await db
    .prepare("SELECT id, project_id, engagement_date, contractor_name, contractor_email, task_description, amount, status, notes, created_at FROM project_external_resources WHERE id = ? LIMIT 1")
    .bind(rid)
    .first();
  return c.json(updated);
});

app.delete("/:id/external-resources/:rid", requireRole("admin", "pm"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const rid = c.req.param("rid");
  if (!(await canEditProject(db, auth.user, projectId))) throw new HTTPException(403, { message: "Forbidden" });
  await db.prepare("DELETE FROM project_external_resources WHERE id = ? AND project_id = ?").bind(rid, projectId).run();
  return c.json({ ok: true });
});

export default app;