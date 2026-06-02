/**
 * Staging → Prod promotion tool.
 *
 * During the build period, users have been doing real work on the staging
 * environment. When CloudConnect goes live in prod, those solutions /
 * projects / optimize accounts need to come along — without forcing users
 * to re-enter the data.
 *
 * This module exposes two admin-only endpoints (both prod-only — they
 * return 503 on staging because the cross-env DB_STAGING / KV_STAGING /
 * R2_STAGING bindings only exist on the prod worker):
 *
 *   GET  /api/admin/staging/inventory
 *     Returns the lists of solutions, projects, and optimize accounts on
 *     staging, with key fields + dependent counts + a flag for items that
 *     already exist on prod (matched by id). Used to render the picker UI.
 *
 *   POST /api/admin/staging/promote
 *     Body: { solution_ids:[], project_ids:[], optimize_account_ids:[] }
 *     Resolves the transitive closure for each selected item and writes
 *     to prod via INSERT OR IGNORE (skip-on-conflict policy). KV creds and
 *     R2 documents come along. Returns a summary of what landed.
 *
 * Foreign-key remapping
 *   User and customer rows are matched on natural keys (user.email,
 *   customer.crm_account_id then customer.name). When a staging row has
 *   no matching prod row, it's inserted with the same UUID and the FK
 *   reference stays as-is. When a match exists, FK references in
 *   dependent rows are rewritten to the prod ID. Other entities (solutions,
 *   projects, stages, tasks, …) use INSERT OR IGNORE on the primary key —
 *   UUID collisions are astronomically rare; if they do happen, the prod
 *   row wins and the staging dependent's FK is rewritten to point at it.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All endpoints require admin role.
app.use("*", requireRole("admin"));

// ── Helpers ────────────────────────────────────────────────────────────────

function assertCrossEnv(c: { env: Bindings }): asserts c is { env: Bindings & { DB_STAGING: D1Database; KV_STAGING: KVNamespace; R2_STAGING: R2Bucket } } {
  if (!c.env.DB_STAGING || !c.env.KV_STAGING || !c.env.R2_STAGING) {
    throw new HTTPException(503, {
      message: "Cross-environment bindings not configured — promotion tool is prod-only.",
    });
  }
}

type Row = Record<string, unknown>;

async function all<T = Row>(db: D1Database, sql: string, ...bindings: unknown[]): Promise<T[]> {
  const res = await db.prepare(sql).bind(...bindings).all<T>();
  return res.results ?? [];
}

// ── Inventory ──────────────────────────────────────────────────────────────

app.get("/inventory", async (c) => {
  assertCrossEnv(c);
  const staging = c.env.DB_STAGING;
  const prod = c.env.DB;

  // Pull the candidate lists from staging with dependent counts.
  const [solutions, projects, optimizeAccounts, prodSolutionIds, prodProjectIds, prodOptimizeIds] = await Promise.all([
    all<{ id: string; name: string; customer_name: string | null; vendor: string | null; status: string | null; created_at: string; needs_assessment_count: number; labor_estimate_count: number; contact_count: number }>(
      staging,
      `SELECT s.id, s.name, s.customer_name, s.vendor, s.status, s.created_at,
              (SELECT COUNT(*) FROM needs_assessments na WHERE na.solution_id = s.id) AS needs_assessment_count,
              (SELECT COUNT(*) FROM labor_estimates le  WHERE le.solution_id = s.id) AS labor_estimate_count,
              (SELECT COUNT(*) FROM solution_contacts sc WHERE sc.solution_id = s.id) AS contact_count
       FROM solutions s
       ORDER BY s.created_at DESC`
    ),
    all<{ id: string; name: string; customer_name: string | null; vendor: string | null; status: string | null; created_at: string; stage_count: number; task_count: number; risk_count: number; document_count: number }>(
      staging,
      `SELECT p.id, p.name, p.customer_name, p.vendor, p.status, p.created_at,
              (SELECT COUNT(*) FROM stages    ph WHERE ph.project_id = p.id) AS stage_count,
              (SELECT COUNT(*) FROM tasks     t  WHERE t.project_id  = p.id) AS task_count,
              (SELECT COUNT(*) FROM risks     r  WHERE r.project_id  = p.id) AS risk_count,
              (SELECT COUNT(*) FROM documents d  WHERE d.project_id  = p.id) AS document_count
       FROM projects p
       WHERE (p.archived = 0 OR p.archived IS NULL)
       ORDER BY p.created_at DESC`
    ),
    all<{ id: string; project_id: string; project_name: string; customer_name: string | null; graduated_at: string; impact_assessment_count: number; tech_stack_count: number; roadmap_count: number; utilization_count: number }>(
      staging,
      `SELECT oa.id, oa.project_id, p.name AS project_name, p.customer_name, oa.graduated_at,
              (SELECT COUNT(*) FROM impact_assessments    ia WHERE ia.project_id = oa.project_id) AS impact_assessment_count,
              (SELECT COUNT(*) FROM account_tech_stack    ts WHERE ts.project_id = oa.project_id) AS tech_stack_count,
              (SELECT COUNT(*) FROM roadmap_items         ri WHERE ri.project_id = oa.project_id) AS roadmap_count,
              (SELECT COUNT(*) FROM utilization_snapshots us WHERE us.project_id = oa.project_id) AS utilization_count
       FROM optimize_accounts oa
       JOIN projects p ON p.id = oa.project_id
       ORDER BY oa.graduated_at DESC`
    ),
    all<{ id: string }>(prod, "SELECT id FROM solutions"),
    all<{ id: string }>(prod, "SELECT id FROM projects"),
    all<{ id: string }>(prod, "SELECT id FROM optimize_accounts"),
  ]);

  const prodSolutions = new Set(prodSolutionIds.map((r) => r.id));
  const prodProjects = new Set(prodProjectIds.map((r) => r.id));
  const prodOptimize = new Set(prodOptimizeIds.map((r) => r.id));

  return c.json({
    solutions: solutions.map((s) => ({ ...s, already_on_prod: prodSolutions.has(s.id) })),
    projects:  projects.map((p)  => ({ ...p, already_on_prod: prodProjects.has(p.id)  })),
    optimize_accounts: optimizeAccounts.map((o) => ({ ...o, already_on_prod: prodOptimize.has(o.id) })),
  });
});

// ── Promote ────────────────────────────────────────────────────────────────

const promoteSchema = z.object({
  solution_ids:         z.array(z.string()).default([]),
  project_ids:          z.array(z.string()).default([]),
  optimize_account_ids: z.array(z.string()).default([]),
});

app.post("/promote", async (c) => {
  assertCrossEnv(c);
  const staging = c.env.DB_STAGING;
  const prod = c.env.DB;
  const kvStaging = c.env.KV_STAGING;
  const kvProd = c.env.KV;
  const r2Staging = c.env.R2_STAGING;
  const r2Prod = c.env.R2;

  const parsed = promoteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const { solution_ids, project_ids, optimize_account_ids } = parsed.data;

  if (solution_ids.length === 0 && project_ids.length === 0 && optimize_account_ids.length === 0) {
    throw new HTTPException(400, { message: "Select at least one item to promote" });
  }

  // ── Stage 1: build user + customer remaps ────────────────────────────
  // Match staging IDs to existing prod IDs by natural keys (email, crm_account_id).
  // When no match, we'll insert the staging row verbatim later.
  const userIdMap = new Map<string, string>(); // staging_id → prod_id
  const customerIdMap = new Map<string, string>();

  const [stagingUsers, prodUsers] = await Promise.all([
    all<{ id: string; email: string }>(staging, "SELECT id, email FROM users"),
    all<{ id: string; email: string }>(prod, "SELECT id, email FROM users"),
  ]);
  const prodUserByEmail = new Map(prodUsers.map((u) => [u.email.toLowerCase(), u.id]));
  for (const u of stagingUsers) {
    const match = prodUserByEmail.get(u.email.toLowerCase());
    if (match) userIdMap.set(u.id, match);
    else userIdMap.set(u.id, u.id); // will insert below
  }

  const [stagingCustomers, prodCustomers] = await Promise.all([
    all<{ id: string; name: string | null; crm_account_id: string | null }>(staging, "SELECT id, name, crm_account_id FROM customers"),
    all<{ id: string; name: string | null; crm_account_id: string | null }>(prod, "SELECT id, name, crm_account_id FROM customers"),
  ]);
  const prodCustByCrm = new Map<string, string>();
  const prodCustByName = new Map<string, string>();
  for (const c2 of prodCustomers) {
    if (c2.crm_account_id) prodCustByCrm.set(c2.crm_account_id, c2.id);
    if (c2.name) prodCustByName.set(c2.name.trim().toLowerCase(), c2.id);
  }
  for (const c2 of stagingCustomers) {
    const byCrm = c2.crm_account_id ? prodCustByCrm.get(c2.crm_account_id) : undefined;
    const byName = !byCrm && c2.name ? prodCustByName.get(c2.name.trim().toLowerCase()) : undefined;
    customerIdMap.set(c2.id, byCrm ?? byName ?? c2.id);
  }

  // Ids that exist (or will be inserted) on prod. remapFks nulls any user/
  // customer FK whose target isn't in these sets, so we never carry a
  // dangling staging id into prod (which trips the FK constraint). Seeded
  // with prod ids; the insert steps below add the staging ids they bring over.
  const userPresent = new Set<string>(prodUsers.map((u) => u.id));
  const customerPresent = new Set<string>(prodCustomers.map((c2) => c2.id));
  const maps: RemapMaps = { users: userIdMap, customers: customerIdMap, userPresent, customerPresent };

  // ── Stage 2: gather full rows for the transitive closure ────────────
  // Walk down from the selected items and pull all the dependent rows we'll
  // need to insert. Track the set of project_ids we touch — those drive KV
  // and R2 migration in stage 4.
  const touchedProjectIds = new Set<string>();
  const touchedCustomerIds = new Set<string>();
  const touchedUserIds = new Set<string>();

  // Helper to add a project_id and pull its customer + PM users for remap.
  function noteProject(p: { id: string; customer_id?: string | null; pm_user_id?: string | null }) {
    touchedProjectIds.add(p.id);
    if (p.customer_id) touchedCustomerIds.add(p.customer_id);
    if (p.pm_user_id) touchedUserIds.add(p.pm_user_id);
  }

  const sols = solution_ids.length > 0
    ? await all<Row>(staging, `SELECT * FROM solutions WHERE id IN (${qs(solution_ids)})`, ...solution_ids)
    : [];
  for (const s of sols) {
    if (s.customer_id) touchedCustomerIds.add(s.customer_id as string);
    if (s.author_user_id) touchedUserIds.add(s.author_user_id as string);
    if (s.owner_user_id)  touchedUserIds.add(s.owner_user_id as string);
  }

  const projs = project_ids.length > 0
    ? await all<Row>(staging, `SELECT * FROM projects WHERE id IN (${qs(project_ids)})`, ...project_ids)
    : [];
  for (const p of projs) {
    noteProject(p as { id: string; customer_id?: string | null; pm_user_id?: string | null });
  }

  // Optimize accounts pull in their underlying project too.
  const optAccs = optimize_account_ids.length > 0
    ? await all<Row>(staging, `SELECT * FROM optimize_accounts WHERE id IN (${qs(optimize_account_ids)})`, ...optimize_account_ids)
    : [];
  // Optimize accounts carry their own customer_id (separate from the project's)
  // — capture it so 3b inserts that customer and the ref resolves.
  for (const oa of optAccs) {
    if (oa.customer_id) touchedCustomerIds.add(oa.customer_id as string);
  }
  const optProjectIds = optAccs.map((o) => o.project_id as string);
  const optProjects = optProjectIds.length > 0
    ? await all<Row>(staging, `SELECT * FROM projects WHERE id IN (${qs(optProjectIds)})`, ...optProjectIds)
    : [];
  for (const p of optProjects) {
    noteProject(p as { id: string; customer_id?: string | null; pm_user_id?: string | null });
  }
  // Combine all projects we need to migrate (selected + optimize-linked).
  const allProjectsToMigrate: Row[] = [...projs];
  const projIdSet = new Set(projs.map((p) => p.id as string));
  for (const op of optProjects) {
    if (!projIdSet.has(op.id as string)) {
      allProjectsToMigrate.push(op);
      projIdSet.add(op.id as string);
    }
  }

  // ── Stage 3: insert dependents bottom-up ────────────────────────────
  const summary = {
    users_inserted: 0,
    customers_inserted: 0,
    solutions_inserted: 0,
    projects_inserted: 0,
    optimize_accounts_inserted: 0,
    phases_inserted: 0,
    stages_inserted: 0,
    tasks_inserted: 0,
    risks_inserted: 0,
    notes_inserted: 0,
    documents_inserted: 0,
    impact_assessments_inserted: 0,
    tech_stack_inserted: 0,
    roadmap_inserted: 0,
    utilization_inserted: 0,
    needs_assessments_inserted: 0,
    labor_estimates_inserted: 0,
    solution_contacts_inserted: 0,
    solution_staff_inserted: 0,
    project_contacts_inserted: 0,
    project_staff_inserted: 0,
    project_access_inserted: 0,
    stage_time_entries_inserted: 0,
    sharepoint_uploads_inserted: 0,
    sharepoint_folder_visibility_inserted: 0,
    kv_credentials_moved: 0,
    r2_documents_copied: 0,
    skipped: [] as Array<{ kind: string; id: string; reason: string }>,
  };

  // Bring a single staging user over to prod on demand (used for the NOT NULL
  // assignment tables so "engineer 123 on project xyz" survives the promote).
  // Idempotent: resolves to an email-matched prod user, an already-inserted
  // user, or inserts the staging row. After this, remapFks resolves the ref
  // instead of nulling it. Returns nothing — callers re-run remapFks.
  const ensuredUsers = new Set<string>();
  async function ensureUserOnProd(stagingUserId: string): Promise<void> {
    const mapped = userIdMap.get(stagingUserId) ?? stagingUserId;
    if (userPresent.has(mapped)) return;       // already resolvable
    if (ensuredUsers.has(stagingUserId)) return; // tried this one already
    ensuredUsers.add(stagingUserId);
    const u = (await all<Row>(staging, "SELECT * FROM users WHERE id = ? LIMIT 1", stagingUserId))[0];
    if (!u) return;
    const exists = prodUserByEmail.get((u.email as string).toLowerCase());
    if (exists) { userIdMap.set(stagingUserId, exists); return; }
    userPresent.add(u.id as string); // pre-mark so the user's own manager_id remaps rather than nulls
    if (await insertOrIgnore(prod, "users", remapFks(u, maps))) summary.users_inserted++;
  }

  // 3a. Insert touched users that aren't already on prod.
  const userIdsToFetch = [...touchedUserIds].filter((id) => userIdMap.get(id) === id && !userPresent.has(id));
  if (userIdsToFetch.length > 0) {
    // Pre-mark so intra-batch manager_id refs resolve instead of nulling.
    for (const id of userIdsToFetch) userPresent.add(id);
    const userRows = await all<Row>(staging, `SELECT * FROM users WHERE id IN (${qs(userIdsToFetch)})`, ...userIdsToFetch);
    for (const u of userRows) {
      // Don't migrate as-is if email collides with a different prod user — already remapped above.
      const exists = prodUserByEmail.get((u.email as string).toLowerCase());
      if (exists) {
        userIdMap.set(u.id as string, exists);
        continue;
      }
      const inserted = await insertOrIgnore(prod, "users", remapFks(u, maps));
      if (inserted) summary.users_inserted++;
    }
  }

  // 3b. Insert touched customers that aren't already on prod.
  const customerIdsToFetch = [...touchedCustomerIds].filter((id) => customerIdMap.get(id) === id && !customerPresent.has(id));
  if (customerIdsToFetch.length > 0) {
    // Pre-mark so dependent rows' customer_id resolves once we insert these.
    for (const id of customerIdsToFetch) customerPresent.add(id);
    const custRows = await all<Row>(staging, `SELECT * FROM customers WHERE id IN (${qs(customerIdsToFetch)})`, ...customerIdsToFetch);
    for (const cu of custRows) {
      const remapped = remapFks(cu, maps);
      const inserted = await insertOrIgnore(prod, "customers", remapped);
      if (inserted) summary.customers_inserted++;
    }
  }

  // 3c. Insert projects (selected + optimize-linked).
  for (const p of allProjectsToMigrate) {
    const remapped = remapFks(p, maps);
    const inserted = await insertOrIgnore(prod, "projects", remapped);
    if (inserted) summary.projects_inserted++;
  }

  // 3d. Stages / tasks / risks / notes / documents per project.
  for (const projectId of touchedProjectIds) {
    const [phases, stages, tasks, risks, notes, documents, projectContacts, projectStaff, projectAccess, timeEntries, spUploads, spFolderVis] = await Promise.all([
      all<Row>(staging, "SELECT * FROM phases WHERE project_id = ?", projectId).catch(() => [] as Row[]),
      all<Row>(staging, "SELECT * FROM stages WHERE project_id = ?", projectId),
      all<Row>(staging, "SELECT * FROM tasks  WHERE project_id = ?", projectId),
      all<Row>(staging, "SELECT * FROM risks  WHERE project_id = ?", projectId),
      all<Row>(staging, "SELECT * FROM notes  WHERE project_id = ?", projectId),
      all<Row>(staging, "SELECT * FROM documents WHERE project_id = ?", projectId),
      all<Row>(staging, "SELECT * FROM project_contacts WHERE project_id = ?", projectId),
      all<Row>(staging, "SELECT * FROM project_staff    WHERE project_id = ?", projectId),
      all<Row>(staging, "SELECT * FROM project_access   WHERE project_id = ?", projectId),
      // Stage-level time entries shadow the D365 msdyn_timeentry submissions
      // (same CRM tenant across envs, so crm_time_entry_id stays valid).
      all<Row>(staging, "SELECT * FROM stage_time_entries WHERE project_id = ?", projectId).catch(() => [] as Row[]),
      // SharePoint attribution + per-folder client/partner visibility. Both
      // are keyed by the Graph driveItem id (sp_item_id), which is identical
      // across envs since staging + prod hit the same SharePoint tenant.
      all<Row>(staging, "SELECT * FROM sharepoint_uploads WHERE project_id = ?", projectId).catch(() => [] as Row[]),
      all<Row>(staging, "SELECT * FROM sharepoint_folder_visibility WHERE project_id = ?", projectId).catch(() => [] as Row[]),
    ]);
    // Insert in FK-dependency order so structural refs resolve:
    //   phases → stages (stages.phase_id) → project_contacts → tasks
    //   (tasks.stage_id, .assignee_contact_id) → risks (.task_id, .owner_contact_id)
    //   → … → documents last (.task_id, .stage_id). project/customer/user FKs
    //   are handled by remapFks; these are intra-project structural FKs that
    //   just need their parent row inserted first.
    for (const row of phases) {
      if (await insertOrIgnore(prod, "phases", remapFks(row, maps))) summary.phases_inserted++;
    }
    for (const row of stages) {
      if (await insertOrIgnore(prod, "stages", remapFks(row, maps))) summary.stages_inserted++;
    }
    for (const row of projectContacts) {
      if (await insertOrIgnore(prod, "project_contacts", remapFks(row, maps))) summary.project_contacts_inserted++;
    }
    for (const row of tasks) {
      if (await insertOrIgnore(prod, "tasks", remapFks(row, maps))) summary.tasks_inserted++;
    }
    for (const row of risks) {
      if (await insertOrIgnore(prod, "risks", remapFks(row, maps))) summary.risks_inserted++;
    }
    for (const row of notes) {
      if (await insertOrIgnore(prod, "notes", remapFks(row, maps))) summary.notes_inserted++;
    }
    for (const row of projectStaff) {
      if (row.user_id) await ensureUserOnProd(row.user_id as string);
      const r = remapFks(row, maps);
      if (r.user_id == null) { summary.skipped.push({ kind: "project_staff", id: row.id as string, reason: "assigned user not on prod" }); continue; }
      if (await insertOrIgnore(prod, "project_staff", r)) summary.project_staff_inserted++;
    }
    for (const row of projectAccess) {
      if (row.user_id) await ensureUserOnProd(row.user_id as string);
      const r = remapFks(row, maps);
      if (r.user_id == null) { summary.skipped.push({ kind: "project_access", id: row.id as string, reason: "user not on prod" }); continue; }
      if (await insertOrIgnore(prod, "project_access", r)) summary.project_access_inserted++;
    }
    for (const row of timeEntries) {
      if (await insertOrIgnore(prod, "stage_time_entries", remapFks(row, maps))) summary.stage_time_entries_inserted++;
    }
    for (const row of spUploads) {
      if (await insertOrIgnore(prod, "sharepoint_uploads", remapFks(row, maps))) summary.sharepoint_uploads_inserted++;
    }
    for (const row of spFolderVis) {
      if (await insertOrIgnore(prod, "sharepoint_folder_visibility", remapFks(row, maps))) summary.sharepoint_folder_visibility_inserted++;
    }

    // Documents — copy each blob from R2_STAGING to R2 first, then insert
    // the row. If the R2 copy fails, skip the row so we don't dangle a
    // database reference to a missing blob.
    for (const row of documents) {
      const r2key = row.r2_key as string;
      try {
        const obj = await r2Staging.get(r2key);
        if (!obj) {
          summary.skipped.push({ kind: "document", id: row.id as string, reason: "missing blob on staging-R2" });
          continue;
        }
        // Skip if blob already exists on prod (don't overwrite).
        const existing = await r2Prod.head(r2key);
        if (!existing) {
          await r2Prod.put(r2key, await obj.arrayBuffer(), {
            httpMetadata: { contentType: row.content_type as string | undefined },
          });
          summary.r2_documents_copied++;
        }
        if (await insertOrIgnore(prod, "documents", remapFks(row, maps))) summary.documents_inserted++;
      } catch (err) {
        summary.skipped.push({ kind: "document", id: row.id as string, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  // 3e. Solutions + their dependents.
  for (const s of sols) {
    const remapped = remapFks(s, maps);
    if (await insertOrIgnore(prod, "solutions", remapped)) summary.solutions_inserted++;

    const [needsAss, labor, contacts, staff] = await Promise.all([
      all<Row>(staging, "SELECT * FROM needs_assessments  WHERE solution_id = ?", s.id),
      all<Row>(staging, "SELECT * FROM labor_estimates    WHERE solution_id = ?", s.id),
      all<Row>(staging, "SELECT * FROM solution_contacts  WHERE solution_id = ?", s.id),
      all<Row>(staging, "SELECT * FROM solution_staff     WHERE solution_id = ?", s.id).catch(() => [] as Row[]),
    ]);
    for (const row of needsAss) {
      if (await insertOrIgnore(prod, "needs_assessments", remapFks(row, maps))) summary.needs_assessments_inserted++;
    }
    for (const row of labor) {
      if (await insertOrIgnore(prod, "labor_estimates", remapFks(row, maps))) summary.labor_estimates_inserted++;
    }
    for (const row of contacts) {
      if (await insertOrIgnore(prod, "solution_contacts", remapFks(row, maps))) summary.solution_contacts_inserted++;
    }
    for (const row of staff) {
      if (row.user_id) await ensureUserOnProd(row.user_id as string);
      const r = remapFks(row, maps);
      if (r.user_id == null) { summary.skipped.push({ kind: "solution_staff", id: row.id as string, reason: "assigned user not on prod" }); continue; }
      if (await insertOrIgnore(prod, "solution_staff", r)) summary.solution_staff_inserted++;
    }
  }

  // 3f. Optimize accounts + their dependents.
  for (const oa of optAccs) {
    const remapped = remapFks(oa, maps);
    if (await insertOrIgnore(prod, "optimize_accounts", remapped)) summary.optimize_accounts_inserted++;

    const projectId = oa.project_id as string;
    const [impacts, tech, roadmap, util] = await Promise.all([
      all<Row>(staging, "SELECT * FROM impact_assessments     WHERE project_id = ?", projectId),
      all<Row>(staging, "SELECT * FROM account_tech_stack     WHERE project_id = ?", projectId),
      all<Row>(staging, "SELECT * FROM roadmap_items          WHERE project_id = ?", projectId),
      all<Row>(staging, "SELECT * FROM utilization_snapshots  WHERE project_id = ?", projectId),
    ]);
    for (const row of impacts) {
      if (await insertOrIgnore(prod, "impact_assessments", remapFks(row, maps))) summary.impact_assessments_inserted++;
    }
    for (const row of tech) {
      if (await insertOrIgnore(prod, "account_tech_stack", remapFks(row, maps))) summary.tech_stack_inserted++;
    }
    for (const row of roadmap) {
      if (await insertOrIgnore(prod, "roadmap_items", remapFks(row, maps))) summary.roadmap_inserted++;
    }
    for (const row of util) {
      if (await insertOrIgnore(prod, "utilization_snapshots", remapFks(row, maps))) summary.utilization_inserted++;
    }
  }

  // ── Stage 4: KV credentials (per project_id) ────────────────────────
  // For every project touched (selected projects + projects underlying selected
  // optimize accounts), move zoom + RC creds from staging KV to prod KV.
  // Target's existing creds always win — see PR #203's relink for the same
  // policy.
  for (const projectId of touchedProjectIds) {
    for (const vendor of ["zoom", "ringcentral"] as const) {
      const stagingKey = vendor === "zoom" ? `zoom:creds:${projectId}` : `rc:creds:${projectId}`;
      const src = await kvStaging.get(stagingKey);
      if (!src) continue;
      const dst = await kvProd.get(stagingKey);
      if (dst === null) {
        await kvProd.put(stagingKey, src);
        summary.kv_credentials_moved++;
      }
    }
  }

  return c.json(summary);
});

// ── Insert helpers ─────────────────────────────────────────────────────────

function qs(arr: unknown[]): string {
  return arr.map(() => "?").join(",");
}

type RemapMaps = {
  users: Map<string, string>;
  customers: Map<string, string>;
  /** ids known to exist (or about to be inserted) on prod. A user/customer
   *  FK whose resolved target isn't in here is nulled out — keeping a dangling
   *  staging id would trip the FK constraint on insert. */
  userPresent: Set<string>;
  customerPresent: Set<string>;
};

const USER_FK_COLS = new Set([
  "pm_user_id", "assignee_user_id", "owner_user_id", "author_user_id",
  "graduated_by", "conducted_by_user_id", "reviewed_by_user_id",
  "uploaded_by", "uploaded_by_user_id", "set_by_user_id", "user_id",
  "sender_user_id", "recipient_user_id",
  "manager_id", "created_by", "pf_ae_user_id", "pf_sa_user_id", "pf_csm_user_id",
]);
const CUSTOMER_FK_COLS = new Set(["customer_id"]);

/**
 * Rewrite user/customer FK columns in `row` from staging ids to prod ids.
 * Pure data transform — doesn't touch the database.
 *
 * A reference is REMAPPED when its target exists on prod (matched user/customer
 * or one we're bringing over), and NULLED when it doesn't — a staging-only id
 * carried into prod would fail the foreign-key constraint. The three NOT NULL
 * join tables (solution_staff / project_staff / project_access) can't take a
 * null user_id, so their callers skip the row instead (see promote loop).
 * Non-FK columns (project_id, stage_id, solution_id, …) pass through unchanged.
 */
function remapFks(row: Row, maps: RemapMaps): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string" && USER_FK_COLS.has(k)) {
      const mapped = maps.users.get(v) ?? v;
      out[k] = maps.userPresent.has(mapped) ? mapped : null;
    } else if (typeof v === "string" && CUSTOMER_FK_COLS.has(k)) {
      const mapped = maps.customers.get(v) ?? v;
      out[k] = maps.customerPresent.has(mapped) ? mapped : null;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * INSERT OR IGNORE the row's columns into `table`. Returns true if the
 * insert added a new row, false if it was ignored (PK collision).
 */
async function insertOrIgnore(db: D1Database, table: string, row: Row): Promise<boolean> {
  const cols = Object.keys(row);
  if (cols.length === 0) return false;
  const placeholders = cols.map(() => "?").join(",");
  const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;
  const res = await db.prepare(sql).bind(...cols.map((c) => row[c])).run();
  return (res.meta?.changes ?? 0) > 0;
}

export default app;
