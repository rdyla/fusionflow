import type { AppRole, AppUser } from "../types";
import { getTeamUserIds, inPlaceholders } from "../lib/teamUtils";

/**
 * For a client on a phase-scoped project, which phases may they see?
 *  - "ALL"  → no phase restriction (non-client role, project not phase-scoped,
 *             or the contact is marked "All phases" via a phase_id=NULL row).
 *  - string[] → the explicit set of attached phase ids (empty ⇒ sees nothing).
 * Shared stages (stages.phase_id IS NULL) are always visible to anyone who can
 * see the project; callers add that allowance themselves.
 */
export async function visiblePhaseIds(
  db: D1Database,
  user: AppUser,
  projectId: string
): Promise<"ALL" | string[]> {
  if (user.role !== "client") return "ALL";
  const proj = await db
    .prepare("SELECT phase_scoped_visibility FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ phase_scoped_visibility: number | null }>();
  if (!proj || !proj.phase_scoped_visibility) return "ALL";
  const rows = await db
    .prepare("SELECT phase_id FROM phase_contacts WHERE project_id = ? AND email IS NOT NULL AND LOWER(email) = LOWER(?)")
    .bind(projectId, user.email)
    .all<{ phase_id: string | null }>();
  const list = rows.results ?? [];
  if (list.some((r) => r.phase_id === null)) return "ALL";
  return list.map((r) => r.phase_id).filter((x): x is string => !!x);
}

export async function canViewProject(
  db: D1Database,
  user: AppUser,
  projectId: string
): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role === "executive") return true;    // Executives have read-only portfolio-wide visibility
  if (user.role === "pm") return true;           // PMs have portfolio-wide read visibility
  if (user.role === "pf_sa") return true;        // SAs have portfolio-wide visibility
  if (user.role === "pf_csm") return true;       // CSMs have portfolio-wide visibility
  if (user.role === "pf_engineer") return true;  // Engineers have portfolio-wide visibility

  if (user.role === "client" && user.dynamics_account_id) {
    const owned = await db
      .prepare("SELECT phase_scoped_visibility FROM projects WHERE id = ? AND dynamics_account_id = ? LIMIT 1")
      .bind(projectId, user.dynamics_account_id)
      .first<{ phase_scoped_visibility: number | null }>();
    if (!owned) return false;
    if (!owned.phase_scoped_visibility) return true;
    // Phase-scoped project: the client may view it only if they're attached to
    // at least one phase (or marked "All phases"). Fail closed otherwise.
    const vp = await visiblePhaseIds(db, user, projectId);
    return vp === "ALL" || vp.length > 0;
  }

  if (user.role === "pf_ae") {
    const teamIds = await getTeamUserIds(user.id, db);
    const ph = inPlaceholders(teamIds);
    // A pf_ae's projects are tied through the customer's assigned AE
    // (customers.pf_ae_user_id) — projects has no ae_user_id column. Mirrors
    // the projects-list scoping.
    const tiedToProject = await db
      .prepare(`SELECT id FROM projects WHERE id = ? AND customer_id IN (SELECT id FROM customers WHERE pf_ae_user_id IN (${ph})) LIMIT 1`)
      .bind(projectId, ...teamIds)
      .first();
    if (tiedToProject) return true;
    // Also check explicit project_access grants for any team member
    const explicitAccess = await db
      .prepare(`SELECT id FROM project_access WHERE project_id = ? AND user_id IN (${ph}) LIMIT 1`)
      .bind(projectId, ...teamIds)
      .first();
    return !!explicitAccess;
  }

  if (user.role === "partner_ae") {
    const teamIds = await getTeamUserIds(user.id, db);
    const ph = inPlaceholders(teamIds);
    const explicitAccess = await db
      .prepare(`SELECT id FROM project_access WHERE project_id = ? AND user_id IN (${ph}) LIMIT 1`)
      .bind(projectId, ...teamIds)
      .first();
    if (explicitAccess) return true;
    const staffAccess = await db
      .prepare(`SELECT id FROM project_staff WHERE project_id = ? AND staff_role = 'partner_ae' AND user_id IN (${ph}) LIMIT 1`)
      .bind(projectId, ...teamIds)
      .first();
    return !!staffAccess;
  }

  // pm and any other roles: check explicit project_access for the user only
  const explicitAccess = await db
    .prepare("SELECT id FROM project_access WHERE project_id = ? AND user_id = ? LIMIT 1")
    .bind(projectId, user.id)
    .first();

  return !!explicitAccess;
}

export async function canEditProject(
  db: D1Database,
  user: AppUser,
  projectId: string
): Promise<boolean> {
  if (user.role === "admin") return true;

  if (user.role === "pf_sa" || user.role === "pf_csm") {
    const access = await db
      .prepare("SELECT id FROM project_access WHERE project_id = ? AND user_id = ? LIMIT 1")
      .bind(projectId, user.id)
      .first();
    return !!access;
  }

  if (user.role === "pm") {
    // A project has a Lead PM (projects.pm_user_id) and may have additional PMs
    // (project_staff rows with staff_role='pm'). BOTH manage the project. This
    // mirrors the list-scoping in myTasks/projects, which already surfaces a
    // project to either — canEditProject previously honored only the Lead PM,
    // so additional PMs could see their projects but got 403 managing them.
    const leadPm = await db
      .prepare("SELECT id FROM projects WHERE id = ? AND pm_user_id = ? LIMIT 1")
      .bind(projectId, user.id)
      .first();
    if (leadPm) return true;

    const staffPm = await db
      .prepare("SELECT 1 FROM project_staff WHERE project_id = ? AND user_id = ? AND staff_role = 'pm' LIMIT 1")
      .bind(projectId, user.id)
      .first();
    return !!staffPm;
  }

  return false;
}

export function canManageUsers(role: AppRole): boolean {
  return role === "admin";
}