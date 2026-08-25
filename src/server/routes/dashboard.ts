import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { getTeamUserIds, inPlaceholders } from "../lib/teamUtils";
import { clientAccountIds } from "../lib/permissions";
import { normalizeSolutionTypesField } from "../../shared/solutionTypes";
import { getDemoVendor } from "../lib/appSettings";
import { getOpportunityQuotes } from "../services/dynamicsService";
import { leadershipWeeklySummary } from "../lib/emailTemplates";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get("/summary", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;

  // Build project filter for scoping all queries to the current user's projects
  let projectFilter = "";
  let filterBindings: string[] = [];

  // Resolve team IDs for AE roles (manager sees self + direct reports)
  let teamIds: string[] = [auth.user.id];

  if (auth.role === "pm") {
    projectFilter = "WHERE (pm_user_id = ? OR id IN (SELECT project_id FROM project_staff WHERE user_id = ? AND staff_role = 'pm'))";
    filterBindings = [auth.user.id, auth.user.id];
  } else if (auth.role === "pf_ae") {
    teamIds = await getTeamUserIds(auth.user.id, db);
    const ph = inPlaceholders(teamIds);
    projectFilter = `WHERE (customer_id IN (SELECT id FROM customers WHERE pf_ae_user_id IN (${ph})) OR id IN (SELECT project_id FROM project_access WHERE user_id IN (${ph})))`;
    filterBindings = [...teamIds, ...teamIds];
  } else if (auth.role === "partner_ae") {
    teamIds = await getTeamUserIds(auth.user.id, db);
    const ph = inPlaceholders(teamIds);
    projectFilter = `WHERE id IN (
      SELECT project_id FROM project_access WHERE user_id IN (${ph})
      UNION
      SELECT project_id FROM project_staff WHERE staff_role = 'partner_ae' AND user_id IN (${ph})
    )`;
    filterBindings = [...teamIds, ...teamIds];
  } else if (auth.role === "client") {
    // Any of the client's accounts — a contact can belong to more than one customer.
    const accountIds = clientAccountIds(auth.user);
    if (accountIds.length === 0) {
      return c.json({ user: auth.user, summary: { activeProjects: 0, atRiskProjects: 0, openTasks: 0, openRisks: 0 }, projects: [], openTasks: [], openRisks: [], stageDistribution: [], vendorDistribution: [], typeDistribution: [] });
    }
    projectFilter = `WHERE dynamics_account_id IN (${inPlaceholders(accountIds)})`;
    filterBindings = [...accountIds];
  }
  // pf_sa, pf_csm, admin, and executive: no filter — portfolio-wide visibility

  // Always exclude archived projects from dashboard aggregations.
  projectFilter = projectFilter
    ? `${projectFilter} AND (archived = 0 OR archived IS NULL)`
    : "WHERE (archived = 0 OR archived IS NULL)";

  // Demo-mode vendor lens: every aggregation is scoped through projectFilter,
  // so layering a vendor AND clause here is enough to filter the entire response.
  const demoVendor = await getDemoVendor(db);
  if (demoVendor) {
    projectFilter = `${projectFilter} AND LOWER(vendor) = ?`;
    filterBindings = [...filterBindings, demoVendor];
  }

  const projectSubquery = projectFilter
    ? `SELECT id FROM projects ${projectFilter}`
    : `SELECT id FROM projects`;

  // "Open Tasks" is personal for every internal role: your assigned tasks
  // (primary assignee OR an additional resource via task_assignees). Matches the
  // /my-tasks panel; the portfolio-wide total moves to the leadership panel.
  // Access-restricted roles (pf_ae, partner_ae) ALSO stay bound to projects they
  // can access, so a stale assignment can't leak a project they've been removed
  // from. Portfolio-visible internal roles need no project bound (they see all).
  // Clients aren't task assignees — scope them to their company's projects.
  let taskWhere: string;
  let taskWhereBind: unknown[];
  if (auth.role === "client") {
    taskWhere = `t.project_id IN (${projectSubquery})`;
    taskWhereBind = [...filterBindings];
  } else {
    taskWhere = "(t.assignee_user_id = ? OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?))";
    taskWhereBind = [auth.user.id, auth.user.id];
    if (auth.role === "pf_ae" || auth.role === "partner_ae") {
      taskWhere += ` AND t.project_id IN (${projectSubquery})`;
      taskWhereBind = [auth.user.id, auth.user.id, ...filterBindings];
    }
  }

  const isSalesLeader = (auth.role === "pf_ae" || auth.role === "partner_ae") && teamIds.length > 1;

  // Run every dashboard query in parallel. They're all independent (each
  // reads from `projectFilter`/`projectSubquery`/`filterBindings` which are
  // already resolved). Previously 12 sequential awaits stacked to ~600ms+
  // of D1 round-trip latency before the first byte left the worker.
  const aeQuery = isSalesLeader
    ? (auth.role === "pf_ae"
      ? `SELECT u.id AS id, COALESCE(u.name, 'Unassigned') AS label, COUNT(*) AS count
         FROM projects p
         LEFT JOIN customers c ON c.id = p.customer_id
         LEFT JOIN users u ON u.id = c.pf_ae_user_id
         WHERE p.id IN (${projectSubquery})
         GROUP BY u.id
         ORDER BY count DESC`
      : `SELECT id, label, COUNT(*) AS count FROM (
           SELECT u.id AS id, COALESCE(u.name, 'Unassigned') AS label
           FROM projects p
           LEFT JOIN project_staff ps ON ps.project_id = p.id AND ps.staff_role = 'partner_ae'
           LEFT JOIN users u ON u.id = ps.user_id
           WHERE p.id IN (${projectSubquery})
         )
         GROUP BY id
         ORDER BY count DESC`)
    : null;

  const [
    activeProjects,
    atRiskProjects,
    openTasksCount,
    openBlockersCount,
    projects,
    projectStages,
    openTasks,
    openBlockers,
    stageDistribution,
    vendorDistribution,
    aeRes,
    typeDistribution,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as count FROM projects ${projectFilter}`)
      .bind(...filterBindings)
      .first<{ count: number }>(),

    db.prepare(
        `SELECT COUNT(*) as count FROM projects ${projectFilter ? `${projectFilter} AND health = ?` : "WHERE health = ?"}`
      )
      .bind(...filterBindings, "at_risk")
      .first<{ count: number }>(),

    db.prepare(
        `SELECT COUNT(*) as count FROM tasks t WHERE t.status != 'completed' AND ${taskWhere}`
      )
      .bind(...taskWhereBind)
      .first<{ count: number }>(),

    db.prepare(
        `SELECT COUNT(*) as count FROM risks WHERE status = 'open' AND project_id IN (${projectSubquery})`
      )
      .bind(...filterBindings)
      .first<{ count: number }>(),

    // Full project list
    db.prepare(
        `SELECT id, name, customer_name, customer_id, vendor, solution_types, status, health, on_hold,
                kickoff_date, target_go_live_date, actual_go_live_date, pm_user_id
         FROM projects ${projectFilter}
         ORDER BY
           CASE status WHEN 'completed' THEN 1 ELSE 0 END,
           updated_at DESC`
      )
      .bind(...filterBindings)
      .all(),

    // Per-project stage summary for the stage-flow indicator
    db.prepare(
        `SELECT ph.project_id, ph.name, ph.status, ph.sort_order
         FROM (
           SELECT project_id, name, status, sort_order
           FROM stages
           WHERE project_id IN (${projectSubquery})
           ORDER BY sort_order
         ) ph`
      )
      .bind(...filterBindings)
      .all<{ project_id: string; name: string; status: string; sort_order: number }>(),

    // Open tasks (not completed) with project name, most urgent first
    db.prepare(
        `SELECT t.id, t.project_id, t.stage_id, t.title, t.assignee_user_id,
                t.due_date, t.status, t.priority,
                p.name as project_name
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE t.status != 'completed'
           AND ${taskWhere}
         ORDER BY
           CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           t.due_date ASC
         LIMIT 8`
      )
      .bind(...taskWhereBind)
      .all(),

    // Open blockers with project name, highest severity first
    db.prepare(
        `SELECT r.id, r.project_id, r.title, r.description, r.severity, r.status,
                r.owner_user_id, r.task_id, p.name as project_name
         FROM risks r
         JOIN projects p ON p.id = r.project_id
         WHERE r.status = 'open'
           AND r.project_id IN (${projectSubquery})
         ORDER BY
           CASE r.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
         LIMIT 6`
      )
      .bind(...filterBindings)
      .all(),

    // Projects grouped by current stage (in_progress > last completed > Not Started)
    db.prepare(
        `WITH current_stages AS (
           SELECT
             proj.id AS project_id,
             COALESCE(
               (SELECT ph.name FROM stages ph
                WHERE ph.project_id = proj.id AND ph.status = 'in_progress'
                ORDER BY ph.sort_order DESC LIMIT 1),
               (SELECT ph.name FROM stages ph
                WHERE ph.project_id = proj.id AND ph.status = 'completed'
                ORDER BY ph.sort_order DESC LIMIT 1),
               'Not Started'
             ) AS stage_name
           FROM projects proj
           WHERE proj.id IN (${projectSubquery})
         )
         SELECT stage_name, COUNT(*) AS count
         FROM current_stages
         GROUP BY stage_name
         ORDER BY count DESC`
      )
      .bind(...filterBindings)
      .all<{ stage_name: string; count: number }>(),

    db.prepare(
        `SELECT COALESCE(vendor, 'Unknown') AS label, COUNT(*) AS count
         FROM projects
         WHERE id IN (${projectSubquery})
         GROUP BY vendor
         ORDER BY count DESC`
      )
      .bind(...filterBindings)
      .all<{ label: string; count: number }>(),

    aeQuery
      ? db.prepare(aeQuery).bind(...filterBindings).all<{ id: string | null; label: string; count: number }>()
      : Promise.resolve(null),

    // Per-type counts: a project with multiple solution_types contributes to each bucket.
    // Projects with empty/null solution_types fall into the 'Unknown' bucket.
    db.prepare(
        `SELECT label, COUNT(*) AS count FROM (
           SELECT je.value AS label
           FROM projects p, json_each(p.solution_types) je
           WHERE p.id IN (${projectSubquery})
           UNION ALL
           SELECT 'Unknown' AS label
           FROM projects p
           WHERE p.id IN (${projectSubquery})
             AND (p.solution_types IS NULL OR p.solution_types = '' OR p.solution_types = '[]')
         )
         GROUP BY label
         ORDER BY count DESC`
      )
      .bind(...filterBindings, ...filterBindings)
      .all<{ label: string; count: number }>(),
  ]);

  const aeDistribution = aeRes?.results ?? [];

  return c.json({
    user: auth.user,
    summary: {
      activeProjects: activeProjects?.count ?? 0,
      atRiskProjects: atRiskProjects?.count ?? 0,
      openTasks: openTasksCount?.count ?? 0,
      openBlockers: openBlockersCount?.count ?? 0,
    },
    projects: (projects.results ?? []).map(normalizeSolutionTypesField),
    projectStages: projectStages.results ?? [],
    openTasks: openTasks.results ?? [],
    openBlockers: openBlockers.results ?? [],
    stageDistribution: stageDistribution.results ?? [],
    vendorDistribution: vendorDistribution.results ?? [],
    typeDistribution: typeDistribution.results ?? [],
    aeDistribution,
    isSalesLeader,
  });
});

app.get("/leadership", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin" && auth.role !== "executive") {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const db = c.env.DB;

  // ── Window math ──────────────────────────────────────────────────────────
  // Resolve the requested window into a day-count, then derive an exclusive
  // [start, end) range plus the immediately-preceding window of equal length.
  const rawWindow = c.req.query("window");
  const window = rawWindow === "month" || rawWindow === "quarter" ? rawWindow : "week";
  const days = window === "quarter" ? 90 : window === "month" ? 30 : 7;

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => {
    const next = new Date(d);
    next.setDate(next.getDate() + n);
    return next;
  };

  const now = new Date();
  const end = fmt(addDays(now, 1));          // exclusive upper bound (today + 1)
  const start = fmt(addDays(now, -(days - 1)));
  const prevEnd = start;                      // current start = previous window's exclusive end
  const prevStart = fmt(addDays(now, -(days - 1) - days));
  // Fixed trailing 7 days, independent of the week/month/quarter toggle above —
  // "did this person report time last week" should mean the same thing no
  // matter what window is currently selected on screen.
  const lastWeekStart = fmt(addDays(now, -6));
  const lastWeekEnd = end;

  const round1 = (n: number | null | undefined) => Math.round((n ?? 0) * 10) / 10;

  const hoursExprAlias =
    "(julianday(ste.scheduled_end) - julianday(ste.scheduled_start)) * 24";

  // Every Capacity tile is scoped to actual Packet Fusion staff — internal
  // roles only, excluding partner_ae (external partner reps) and client
  // (customer contacts) even though they can't realistically log time or be
  // set as PM/staff today. Explicit rather than assumed.
  const PF_ROLES_SQL = "'admin','executive','pm','pf_ae','pf_sa','pf_csm','pf_engineer'";

  const [
    timeCur,
    timePrev,
    byEngineer,
    tasksByEngineer,
    projectsByPM,
    projectAssignmentsIESA,
    wentLiveStillOpen,
    activeProjects,
    atRisk,
    blocked,
    activeProjectsList,
    atRiskProjectsList,
    blockedProjectsList,
    hoursRiskCandidates,
    assignedPeople,
    loggedLastWeek,
  ] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS entries, COALESCE(SUM(${hoursExprAlias}),0) AS hours
       FROM stage_time_entries ste
       JOIN users u ON u.id = ste.user_id
       WHERE ste.scheduled_start >= ? AND ste.scheduled_start < ?
         AND ste.scheduled_start IS NOT NULL AND ste.scheduled_end IS NOT NULL
         AND u.role IN (${PF_ROLES_SQL})`
    ).bind(start, end).first<{ entries: number; hours: number }>(),

    db.prepare(
      `SELECT COUNT(*) AS entries, COALESCE(SUM(${hoursExprAlias}),0) AS hours
       FROM stage_time_entries ste
       JOIN users u ON u.id = ste.user_id
       WHERE ste.scheduled_start >= ? AND ste.scheduled_start < ?
         AND ste.scheduled_start IS NOT NULL AND ste.scheduled_end IS NOT NULL
         AND u.role IN (${PF_ROLES_SQL})`
    ).bind(prevStart, prevEnd).first<{ entries: number; hours: number }>(),

    db.prepare(
      `SELECT ste.user_id, u.name, u.email, COUNT(*) AS entries,
              COALESCE(SUM(${hoursExprAlias}),0) AS hours
       FROM stage_time_entries ste
       JOIN users u ON u.id = ste.user_id
       WHERE ste.scheduled_start >= ? AND ste.scheduled_start < ?
         AND ste.scheduled_end IS NOT NULL
         AND u.role IN (${PF_ROLES_SQL})
       GROUP BY ste.user_id
       ORDER BY hours DESC`
    ).bind(start, end).all<{ user_id: string | null; name: string | null; email: string | null; entries: number; hours: number }>(),

    db.prepare(
      `SELECT t.assignee_user_id, u.name, COUNT(*) AS n
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_user_id
       WHERE t.completed_at >= ? AND t.completed_at < ?
         AND t.assignee_user_id IS NOT NULL
       GROUP BY t.assignee_user_id
       ORDER BY n DESC
       LIMIT 10`
    ).bind(start, end).all<{ assignee_user_id: string | null; name: string | null; n: number }>(),

    // Active-project headcount per PM — current snapshot, not time-boxed.
    // Surfaces who's carrying the most projects right now (workload signal).
    // Falls back to a project_staff 'pm' row when projects.pm_user_id is
    // null — same fallback projects.ts uses for "my projects" — since a PM
    // can be attached to a project either way and pm_user_id isn't always
    // backfilled (e.g. solution→project handoff never sets it). Excludes
    // projects already graduated to Optimize — including direct-enrolled
    // shells (POST /accounts/direct), which stand in for a standalone
    // Optimize engagement and never run an implementation, so they never
    // get a PM. Same exclusion wentLiveStillOpen below already uses. Keeps
    // the "no PM assigned" bucket visible while still filtering out a PM
    // who somehow isn't PF staff.
    db.prepare(
      `SELECT x.pm_user_id, u.name, COUNT(*) AS n
       FROM (
         SELECT p.id,
                COALESCE(
                  p.pm_user_id,
                  (SELECT ps.user_id FROM project_staff ps WHERE ps.project_id = p.id AND ps.staff_role = 'pm' LIMIT 1)
                ) AS pm_user_id
         FROM projects p
         WHERE (p.archived = 0 OR p.archived IS NULL)
           AND p.id NOT IN (SELECT project_id FROM optimize_accounts)
       ) x
       LEFT JOIN users u ON u.id = x.pm_user_id
       WHERE (x.pm_user_id IS NULL OR u.role IN (${PF_ROLES_SQL}))
       GROUP BY x.pm_user_id
       ORDER BY n DESC`
    ).all<{ pm_user_id: string | null; name: string | null; n: number }>(),

    // Active-project count per person, scoped to IE (engineer) + SA staffing
    // roles only — the PM breakdown is projectsByPM above (pm_user_id lives on
    // projects directly, not project_staff). Excludes Optimize-graduated
    // projects for the same reason as projectsByPM above.
    db.prepare(
      `SELECT ps.user_id, u.name, COUNT(DISTINCT ps.project_id) AS n
       FROM project_staff ps
       JOIN projects p ON p.id = ps.project_id
       JOIN users u ON u.id = ps.user_id
       WHERE (p.archived = 0 OR p.archived IS NULL)
         AND p.id NOT IN (SELECT project_id FROM optimize_accounts)
         AND ps.staff_role IN ('engineer', 'sa')
         AND u.role IN (${PF_ROLES_SQL})
       GROUP BY ps.user_id
       ORDER BY n DESC`
    ).all<{ user_id: string | null; name: string | null; n: number }>(),

    // Went live (actual_go_live_date set) but the project is still open —
    // not archived and not yet graduated to Optimize. Surfaces projects that
    // hit go-live but haven't been wrapped up or moved on. Oldest first.
    db.prepare(
      `SELECT id, name, customer_name, actual_go_live_date, status
       FROM projects p
       WHERE p.actual_go_live_date IS NOT NULL
         AND (p.archived = 0 OR p.archived IS NULL)
         AND p.id NOT IN (SELECT project_id FROM optimize_accounts)
       ORDER BY p.actual_go_live_date ASC
       LIMIT 10`
    ).all<{ id: string; name: string; customer_name: string | null; actual_go_live_date: string | null; status: string | null }>(),

    // Excludes Optimize-graduated projects (including direct-enrolled
    // standalone shells) — same reasoning as projectsByPM above: a shell
    // never runs an implementation, so counting it as an "active project"
    // misrepresents an already-live, staffed Optimize account as neglected.
    db.prepare(
      `SELECT COUNT(*) AS n FROM projects WHERE (archived = 0 OR archived IS NULL) AND id NOT IN (SELECT project_id FROM optimize_accounts)`
    ).first<{ n: number }>(),

    db.prepare(
      `SELECT COUNT(*) AS n FROM projects WHERE (archived = 0 OR archived IS NULL) AND health = 'at_risk' AND id NOT IN (SELECT project_id FROM optimize_accounts)`
    ).first<{ n: number }>(),

    db.prepare(
      `SELECT COUNT(*) AS n FROM projects WHERE (archived = 0 OR archived IS NULL) AND status = 'blocked' AND id NOT IN (SELECT project_id FROM optimize_accounts)`
    ).first<{ n: number }>(),

    // ── Click-to-expand detail lists — each backs a metric tile's drill-down ──
    db.prepare(
      `SELECT id, name, customer_name, health, status
       FROM projects
       WHERE (archived = 0 OR archived IS NULL) AND id NOT IN (SELECT project_id FROM optimize_accounts)
       ORDER BY name ASC
       LIMIT 15`
    ).all<{ id: string; name: string; customer_name: string | null; health: string | null; status: string | null }>(),

    db.prepare(
      `SELECT id, name, customer_name, health, status
       FROM projects
       WHERE (archived = 0 OR archived IS NULL) AND health = 'at_risk' AND id NOT IN (SELECT project_id FROM optimize_accounts)
       ORDER BY name ASC
       LIMIT 15`
    ).all<{ id: string; name: string; customer_name: string | null; health: string | null; status: string | null }>(),

    db.prepare(
      `SELECT id, name, customer_name, health, status
       FROM projects
       WHERE (archived = 0 OR archived IS NULL) AND status = 'blocked' AND id NOT IN (SELECT project_id FROM optimize_accounts)
       ORDER BY name ASC
       LIMIT 15`
    ).all<{ id: string; name: string; customer_name: string | null; health: string | null; status: string | null }>(),

    // Lifetime (not window-scoped) hours logged per active project that has a
    // linked CRM opportunity — candidate pool for the hours-vs-SOW-quote check
    // below. Capped so the live Dynamics fan-out stays bounded regardless of
    // portfolio size; ranked by hours so the projects most likely to matter
    // (heaviest logged time) are the ones we bother checking.
    db.prepare(
      `SELECT p.id, p.name, p.customer_name, p.crm_opportunity_id,
              COALESCE(SUM(${hoursExprAlias}),0) AS hours_logged
       FROM projects p
       JOIN stage_time_entries ste ON ste.project_id = p.id
       WHERE (p.archived = 0 OR p.archived IS NULL)
         AND p.crm_opportunity_id IS NOT NULL
         AND ste.scheduled_end IS NOT NULL
       GROUP BY p.id
       ORDER BY hours_logged DESC
       LIMIT 20`
    ).all<{ id: string; name: string; customer_name: string | null; crm_opportunity_id: string; hours_logged: number }>(),

    // Everyone staffed on an active project, any role — PM (projects.pm_user_id)
    // union'd with AE/SA/CSM/Engineer (project_staff), PF staff only.
    // Cross-referenced below against who actually logged time last week.
    // Excludes Optimize-graduated projects: a shell direct-enrolled straight
    // into Optimize never runs an implementation, so its staff shouldn't be
    // flagged for not logging implementation hours.
    db.prepare(
      `SELECT x.user_id, u.name, COUNT(DISTINCT x.project_id) AS project_count
       FROM (
         SELECT p.pm_user_id AS user_id, p.id AS project_id
         FROM projects p
         WHERE p.pm_user_id IS NOT NULL AND (p.archived = 0 OR p.archived IS NULL)
           AND p.id NOT IN (SELECT project_id FROM optimize_accounts)
         UNION
         SELECT ps.user_id AS user_id, ps.project_id AS project_id
         FROM project_staff ps
         JOIN projects p ON p.id = ps.project_id
         WHERE (p.archived = 0 OR p.archived IS NULL)
           AND p.id NOT IN (SELECT project_id FROM optimize_accounts)
       ) x
       JOIN users u ON u.id = x.user_id
       WHERE u.role IN (${PF_ROLES_SQL})
       GROUP BY x.user_id`
    ).all<{ user_id: string | null; name: string | null; project_count: number }>(),

    db.prepare(
      `SELECT DISTINCT user_id FROM stage_time_entries
       WHERE scheduled_start >= ? AND scheduled_start < ? AND scheduled_end IS NOT NULL AND user_id IS NOT NULL`
    ).bind(lastWeekStart, lastWeekEnd).all<{ user_id: string }>(),
  ]);

  // ── Hours vs. quoted SOW (live Dynamics) ──────────────────────────────────
  // Actual hours come from the local D1 total above (stage_time_entries already
  // mirrors CRM time entries 1:1 — every entry logged in-app pushes a linked
  // msdyn_timeentry). Quoted hours are NOT cached anywhere and only live on the
  // opportunity's quote (am_sow), so this is the one live-CRM piece of the
  // leadership dashboard — bounded to the <=20 candidates queried above.
  // getOpportunityQuotes already no-ops to [] when Dynamics isn't configured
  // (e.g. local dev), so this degrades to "no quote data" rather than failing.
  const HOURS_RISK_PCT = 80; // >= 80% of quote = at risk
  const hoursRiskChecked = await Promise.all(
    (hoursRiskCandidates.results ?? []).map(async (p) => {
      const quotes = await getOpportunityQuotes(c.env, p.crm_opportunity_id).catch(() => []);
      const withSow = quotes.filter((q) => q.am_sow != null);
      const priority = (q: { statecode: number }) => (q.statecode === 2 ? 0 : q.statecode === 1 ? 1 : 2);
      withSow.sort((a, b) => priority(a) - priority(b));
      const quotedHours = withSow[0]?.am_sow ?? null;
      return {
        id: p.id,
        name: p.name,
        customer_name: p.customer_name,
        hoursLogged: round1(p.hours_logged),
        quotedHours,
        pct: quotedHours ? round1((p.hours_logged / quotedHours) * 100) : null,
      };
    })
  );
  const hoursRiskAtRisk = hoursRiskChecked
    .filter((r) => r.pct !== null && r.pct >= HOURS_RISK_PCT)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const hoursRiskNoQuote = hoursRiskChecked.filter((r) => r.pct === null);
  // Full hours-burn view (not just the >= 80% subset) — projects with a quote
  // sorted heaviest-utilized first, no-quote projects (can't compute a %)
  // pushed to the end rather than dropped, so it's visible they were checked
  // but have nothing to compare against.
  const hoursByProject = [
    ...hoursRiskChecked.filter((r) => r.pct !== null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)),
    ...hoursRiskNoQuote,
  ];

  const loggedUserIds = new Set((loggedLastWeek.results ?? []).map((r) => r.user_id));
  const noTimeLastWeek = (assignedPeople.results ?? [])
    .filter((r) => r.user_id && !loggedUserIds.has(r.user_id))
    .map((r) => ({ user_id: r.user_id, name: r.name, projectCount: r.project_count }))
    .sort((a, b) => (b.projectCount ?? 0) - (a.projectCount ?? 0));

  return c.json({
    window: { window, start, end },
    time: {
      totalHours: round1(timeCur?.hours),
      prevTotalHours: round1(timePrev?.hours),
      entries: timeCur?.entries ?? 0,
      byEngineer: (byEngineer.results ?? []).map((r) => ({
        user_id: r.user_id,
        name: r.name,
        email: r.email,
        hours: round1(r.hours),
        entries: r.entries,
      })),
    },
    projects: {
      activeProjects: activeProjects?.n ?? 0,
      atRiskProjects: atRisk?.n ?? 0,
      blockedProjects: blocked?.n ?? 0,
      tasksByEngineer: (tasksByEngineer.results ?? []).map((r) => ({
        user_id: r.assignee_user_id,
        name: r.name,
        n: r.n,
      })),
      projectsByPM: (projectsByPM.results ?? []).map((r) => ({
        user_id: r.pm_user_id,
        name: r.name,
        n: r.n,
      })),
      projectAssignmentsIESA: (projectAssignmentsIESA.results ?? []).map((r) => ({
        user_id: r.user_id,
        name: r.name,
        n: r.n,
      })),
      wentLiveStillOpen: (wentLiveStillOpen.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        customer_name: r.customer_name,
        date: r.actual_go_live_date,
        status: r.status,
      })),
      activeProjectsList: (activeProjectsList.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        customer_name: r.customer_name,
        health: r.health,
        status: r.status,
      })),
      atRiskProjectsList: (atRiskProjectsList.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        customer_name: r.customer_name,
        health: r.health,
        status: r.status,
      })),
      blockedProjectsList: (blockedProjectsList.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        customer_name: r.customer_name,
        health: r.health,
        status: r.status,
      })),
    },
    hoursRisk: {
      atRiskCount: hoursRiskAtRisk.length,
      atRisk: hoursRiskAtRisk,
      noQuoteCount: hoursRiskNoQuote.length,
      candidatesChecked: hoursRiskChecked.length,
      byProject: hoursByProject,
    },
    noTimeLastWeek: {
      count: noTimeLastWeek.length,
      people: noTimeLastWeek,
    },
  });
});

// GET /api/dashboard/leadership/summary-preview
// Renders the leadership weekly-summary email against LIVE data, for review
// before the send schedule/recipients are configured. Not yet wired to any
// cron — preview only. Deliberately its own lean queries rather than reusing
// the big /leadership payload above: this needs only current-snapshot counts
// + short lists, none of the window/capacity data.
app.get("/leadership/summary-preview", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin" && auth.role !== "executive") {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const db = c.env.DB;
  const NOT_OPTIMIZE = "id NOT IN (SELECT project_id FROM optimize_accounts)";

  const [activeProjects, atRiskList, blockedList, wentLiveStillOpenList, projectsByPM, hoursCandidates] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE (archived = 0 OR archived IS NULL) AND ${NOT_OPTIMIZE}`).first<{ n: number }>(),

    db.prepare(
      `SELECT id, name, customer_name FROM projects
       WHERE (archived = 0 OR archived IS NULL) AND health = 'at_risk' AND ${NOT_OPTIMIZE}
       ORDER BY name ASC`
    ).all<{ id: string; name: string | null; customer_name: string | null }>(),

    db.prepare(
      `SELECT id, name, customer_name FROM projects
       WHERE (archived = 0 OR archived IS NULL) AND status = 'blocked' AND ${NOT_OPTIMIZE}
       ORDER BY name ASC`
    ).all<{ id: string; name: string | null; customer_name: string | null }>(),

    db.prepare(
      `SELECT id, name, customer_name FROM projects p
       WHERE p.actual_go_live_date IS NOT NULL AND (p.archived = 0 OR p.archived IS NULL) AND ${NOT_OPTIMIZE}
       ORDER BY p.actual_go_live_date ASC`
    ).all<{ id: string; name: string | null; customer_name: string | null }>(),

    db.prepare(
      `SELECT x.pm_user_id, u.name, COUNT(*) AS n
       FROM (
         SELECT p.id,
                COALESCE(
                  p.pm_user_id,
                  (SELECT ps.user_id FROM project_staff ps WHERE ps.project_id = p.id AND ps.staff_role = 'pm' LIMIT 1)
                ) AS pm_user_id
         FROM projects p
         WHERE (p.archived = 0 OR p.archived IS NULL) AND ${NOT_OPTIMIZE}
       ) x
       LEFT JOIN users u ON u.id = x.pm_user_id
       WHERE x.pm_user_id IS NOT NULL
       GROUP BY x.pm_user_id
       ORDER BY n DESC`
    ).all<{ pm_user_id: string; name: string | null; n: number }>(),

    db.prepare(
      `SELECT p.id, p.name, p.customer_name, p.crm_opportunity_id,
              COALESCE(SUM((julianday(ste.scheduled_end) - julianday(ste.scheduled_start)) * 24),0) AS hours_logged
       FROM projects p
       JOIN stage_time_entries ste ON ste.project_id = p.id
       WHERE (p.archived = 0 OR p.archived IS NULL) AND p.crm_opportunity_id IS NOT NULL AND ste.scheduled_end IS NOT NULL
       GROUP BY p.id
       ORDER BY hours_logged DESC
       LIMIT 10`
    ).all<{ id: string; name: string | null; customer_name: string | null; crm_opportunity_id: string; hours_logged: number }>(),
  ]);

  const hoursChecked = await Promise.all(
    (hoursCandidates.results ?? []).map(async (p) => {
      const quotes = await getOpportunityQuotes(c.env, p.crm_opportunity_id).catch(() => []);
      const withSow = quotes.filter((q) => q.am_sow != null);
      const priority = (q: { statecode: number }) => (q.statecode === 2 ? 0 : q.statecode === 1 ? 1 : 2);
      withSow.sort((a, b) => priority(a) - priority(b));
      const quotedHours = withSow[0]?.am_sow ?? null;
      const pct = quotedHours ? Math.round((p.hours_logged / quotedHours) * 1000) / 10 : null;
      return { name: p.name, customerName: p.customer_name, pct };
    })
  );
  const hoursAtRiskList = hoursChecked.filter((r) => r.pct !== null && r.pct >= 80).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

  const pmRows = (projectsByPM.results ?? []);
  const busiestPM = pmRows[0] ? { name: pmRows[0].name, n: pmRows[0].n } : null;

  const weekOf = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const rendered = leadershipWeeklySummary({
    weekOf,
    activeProjects: activeProjects?.n ?? 0,
    atRiskProjects: (atRiskList.results ?? []).length,
    atRiskList: (atRiskList.results ?? []).map((p) => ({ name: p.name, customerName: p.customer_name })),
    blockedProjects: (blockedList.results ?? []).length,
    blockedList: (blockedList.results ?? []).map((p) => ({ name: p.name, customerName: p.customer_name })),
    wentLiveStillOpen: (wentLiveStillOpenList.results ?? []).length,
    wentLiveStillOpenList: (wentLiveStillOpenList.results ?? []).map((p) => ({ name: p.name, customerName: p.customer_name })),
    pmCount: pmRows.length,
    busiestPM,
    hoursAtRiskCount: hoursAtRiskList.length,
    hoursAtRiskList,
    appUrl: c.env.APP_URL ?? "",
  });

  return c.json(rendered);
});

export default app;
