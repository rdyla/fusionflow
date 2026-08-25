import type { Bindings } from "../types";
import { getOpportunityQuotes } from "../services/dynamicsService";
import type { LeadershipSummaryData } from "./emailTemplates";

// Shared by the Leadership dashboard's "Preview Weekly Summary" endpoint and
// the weekly-summary cron job, so the two always render identical content.
// Deliberately its own lean queries rather than reusing the full /leadership
// dashboard payload — this needs only current-snapshot counts + short lists,
// none of the window/capacity data.
export async function buildLeadershipSummaryData(env: Bindings): Promise<LeadershipSummaryData> {
  const db = env.DB;
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
      const quotes = await getOpportunityQuotes(env, p.crm_opportunity_id).catch(() => []);
      const withSow = quotes.filter((q) => q.am_sow != null);
      const priority = (q: { statecode: number }) => (q.statecode === 2 ? 0 : q.statecode === 1 ? 1 : 2);
      withSow.sort((a, b) => priority(a) - priority(b));
      const quotedHours = withSow[0]?.am_sow ?? null;
      const pct = quotedHours ? Math.round((p.hours_logged / quotedHours) * 1000) / 10 : null;
      return { name: p.name, customerName: p.customer_name, pct };
    })
  );
  const hoursAtRiskList = hoursChecked.filter((r) => r.pct !== null && r.pct >= 80).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

  const pmRows = projectsByPM.results ?? [];
  const busiestPM = pmRows[0] ? { name: pmRows[0].name, n: pmRows[0].n } : null;

  const weekOf = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return {
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
    appUrl: env.APP_URL ?? "",
  };
}
