import type { AppUser, Bindings } from "../types";
import { canViewProject } from "../services/accessService";
import {
  getCase, getCaseByTicketNumber, getCaseTimeEntries, getOpportunityQuotes, isUuid, pickSowQuote,
} from "../services/dynamicsService";

/**
 * Project reads for the MCP tools. Everything here is scoped by the same rules
 * as the UI: "my projects" means PM or staffed (as on My Time), and any other
 * lookup goes through canViewProject.
 */

const HOURS_EXPR = "(julianday(scheduled_end) - julianday(scheduled_start)) * 24";

// Time can be logged against a task, a stage, or the project — all three are
// the user's hours, so every total reads the union (see dashboard.ts).
const ALL_TIME_ENTRIES_SQL = `(
  SELECT user_id, project_id, scheduled_start, scheduled_end FROM project_time_entries
  UNION ALL
  SELECT user_id, project_id, scheduled_start, scheduled_end FROM stage_time_entries
  UNION ALL
  SELECT user_id, project_id, scheduled_start, scheduled_end FROM task_time_entries
)`;

type ProjectRow = {
  id: string;
  name: string;
  customer_name: string | null;
  status: string | null;
  health: string | null;
  closed_at: string | null;
  target_go_live_date: string | null;
  crm_case_id: string | null;
  crm_ticket_number: string | null;
  crm_opportunity_id: string | null;
  pm_name: string | null;
  logged_hours: number;
  my_logged_hours: number;
};

const PROJECT_SELECT = `
  SELECT p.id, p.name, COALESCE(c.name, p.customer_name) AS customer_name, p.status, p.health,
         p.closed_at, p.target_go_live_date, p.crm_case_id, p.crm_ticket_number, p.crm_opportunity_id,
         pm.name AS pm_name,
         COALESCE(t.hours, 0) AS logged_hours, COALESCE(t.my_hours, 0) AS my_logged_hours
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN users pm ON pm.id = p.pm_user_id
    LEFT JOIN (
      SELECT project_id,
             SUM(${HOURS_EXPR}) AS hours,
             SUM(CASE WHEN user_id = ?1 THEN ${HOURS_EXPR} ELSE 0 END) AS my_hours
        FROM ${ALL_TIME_ENTRIES_SQL}
       WHERE scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL
       GROUP BY project_id
    ) t ON t.project_id = p.id
`;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Projects the user runs or is staffed on. */
export async function listMyProjects(env: Bindings, user: AppUser, includeClosed: boolean) {
  const closedClause = includeClosed ? "" : "AND p.closed_at IS NULL AND COALESCE(p.status, '') != 'complete'";
  const rows = (await env.DB
    .prepare(
      `${PROJECT_SELECT}
       WHERE (p.pm_user_id = ?1 OR p.id IN (SELECT project_id FROM project_staff WHERE user_id = ?1))
         AND COALESCE(p.archived, 0) = 0
         ${closedClause}
       ORDER BY customer_name, p.name`
    )
    .bind(user.id)
    .all<ProjectRow>()).results ?? [];

  return Promise.all(rows.map((r) => summarize(env, r)));
}

/**
 * Resolve a project from what a person would type: a CE case number
 * (CAS-xxxxx-xxxxxx), a project id, or part of a project/customer name.
 * Returns every visible match so the caller can disambiguate.
 */
export async function findProjects(env: Bindings, user: AppUser, query: string): Promise<ProjectRow[]> {
  const q = query.trim();
  if (!q) return [];
  let rows: ProjectRow[];

  if (/^CAS-/i.test(q)) {
    rows = await findByCaseNumber(env, user, q.toUpperCase());
  } else if (isUuid(q)) {
    rows = (await env.DB.prepare(`${PROJECT_SELECT} WHERE p.id = ?2`).bind(user.id, q).all<ProjectRow>()).results ?? [];
  } else {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    rows = (await env.DB
      .prepare(
        `${PROJECT_SELECT}
         WHERE COALESCE(p.archived, 0) = 0
           AND (p.name LIKE ?2 ESCAPE '\\' OR COALESCE(c.name, p.customer_name) LIKE ?2 ESCAPE '\\')
         ORDER BY p.closed_at IS NOT NULL, customer_name, p.name
         LIMIT 25`
      )
      .bind(user.id, like)
      .all<ProjectRow>()).results ?? [];
  }

  const visible = await Promise.all(rows.map((r) => canViewProject(env.DB, user, r.id)));
  return rows.filter((_, i) => visible[i]);
}

async function findByCaseNumber(env: Bindings, user: AppUser, ticket: string): Promise<ProjectRow[]> {
  // Cached number first (or a legacy row that stored the number itself).
  const local = (await env.DB
    .prepare(`${PROJECT_SELECT} WHERE p.crm_ticket_number = ?2 OR p.crm_case_id = ?2`)
    .bind(user.id, ticket)
    .all<ProjectRow>()).results ?? [];
  if (local.length > 0) return local;

  // Not cached yet: ask Dynamics for the incident, then match it against the
  // project's case or any phase's case (phase-scoped projects log per phase).
  const found = await getCaseByTicketNumber(env, ticket).catch(() => null);
  if (!found) return [];
  return (await env.DB
    .prepare(
      `${PROJECT_SELECT}
       WHERE lower(p.crm_case_id) = lower(?2)
          OR p.id IN (SELECT project_id FROM phases WHERE lower(crm_case_id) = lower(?2))`
    )
    .bind(user.id, found.id)
    .all<ProjectRow>()).results ?? [];
}

/** One project's full picture: summary plus stages and staff. */
export async function projectDetails(env: Bindings, row: ProjectRow) {
  const [summary, stages, staff, phases] = await Promise.all([
    summarize(env, row),
    env.DB.prepare(`SELECT id, name, status FROM stages WHERE project_id = ? ORDER BY sort_order`)
      .bind(row.id).all<{ id: string; name: string; status: string | null }>(),
    env.DB.prepare(
      `SELECT u.name, u.email, ps.staff_role FROM project_staff ps JOIN users u ON u.id = ps.user_id
        WHERE ps.project_id = ? ORDER BY u.name`
    ).bind(row.id).all<{ name: string | null; email: string; staff_role: string }>(),
    env.DB.prepare(`SELECT name, crm_case_id FROM phases WHERE project_id = ? ORDER BY display_order, name`)
      .bind(row.id).all<{ name: string; crm_case_id: string | null }>(),
  ]);
  return {
    ...summary,
    health: row.health,
    target_go_live_date: row.target_go_live_date,
    pm: row.pm_name,
    staff: staff.results ?? [],
    // Stage ids are what a stage-level time entry is logged against.
    stages: stages.results ?? [],
    phases: (phases.results ?? []).map((p) => ({ name: p.name, has_own_case: !!p.crm_case_id })),
  };
}

/**
 * The fields people ask about. Allotted and used hours are live from CE, the
 * same sources as the project page's CRM Case tab: allotted is am_sow on the
 * pinned opportunity's quote, used is the sum of amc_timeentry on the project's
 * case plus any phase cases. hours_logged_in_cloudconnect is the local total,
 * returned alongside because the Dynamics reads fail soft to empty — a gap
 * between the two means CE time logged outside the app, or a CE outage.
 */
async function summarize(env: Bindings, r: ProjectRow) {
  const phaseCaseIds = ((await env.DB
    .prepare(`SELECT crm_case_id FROM phases WHERE project_id = ? AND crm_case_id IS NOT NULL AND TRIM(crm_case_id) <> ''`)
    .bind(r.id)
    .all<{ crm_case_id: string }>()).results ?? []).map((p) => p.crm_case_id);

  const projectCase = r.crm_case_id ? await resolveCaseNumber(env, r) : null;
  const caseIds = [projectCase?.caseId, ...phaseCaseIds].filter((id): id is string => !!id && isUuid(id));

  const [entryLists, quotes] = await Promise.all([
    Promise.all(caseIds.map((id) => getCaseTimeEntries(env, id))),
    r.crm_opportunity_id ? getOpportunityQuotes(env, r.crm_opportunity_id).catch(() => []) : Promise.resolve([]),
  ]);
  const usedHours = entryLists.flat().reduce((s, e) => s + (e.durationHours ?? 0), 0);

  return {
    project_id: r.id,
    customer: r.customer_name,
    project: r.name,
    ce_case_number: projectCase?.ticketNumber ?? null,
    status: r.closed_at ? "closed" : r.status,
    allotted_hours: pickSowQuote(quotes)?.am_sow ?? null,
    hours_used: caseIds.length > 0 ? round1(usedHours) : null,
    hours_logged_in_cloudconnect: round1(r.logged_hours),
    my_hours_logged_in_cloudconnect: round1(r.my_logged_hours),
    closed_on: r.closed_at ? r.closed_at.slice(0, 10) : null,
  };
}

/**
 * The project's case as { GUID, CAS number }. crm_case_id is normally the
 * incident GUID, with the number cached in crm_ticket_number; older rows may
 * hold the number itself. A missing cache entry is fetched and written back,
 * guarded on crm_case_id so a concurrent re-link can't receive a stale number.
 */
async function resolveCaseNumber(env: Bindings, r: ProjectRow): Promise<{ caseId: string | null; ticketNumber: string | null }> {
  const stored = r.crm_case_id!;
  if (!isUuid(stored)) {
    const found = await getCaseByTicketNumber(env, stored).catch(() => null);
    return { caseId: found?.id ?? null, ticketNumber: stored };
  }
  if (r.crm_ticket_number) return { caseId: stored, ticketNumber: r.crm_ticket_number };

  const found = await getCase(env, stored);
  if (found?.ticketNumber) {
    await env.DB
      .prepare("UPDATE projects SET crm_ticket_number = ? WHERE id = ? AND crm_case_id = ?")
      .bind(found.ticketNumber, r.id, stored)
      .run();
  }
  return { caseId: stored, ticketNumber: found?.ticketNumber ?? null };
}

export type { ProjectRow };
