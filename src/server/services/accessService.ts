import type { AppRole, AppUser } from "../types";
import { getTeamUserIds, inPlaceholders } from "../lib/teamUtils";

export async function canViewProject(
  db: D1Database,
  user: AppUser,
  projectId: string
): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role === "executive") return true;    // Executives have read-only portfolio-wide visibility
  if (user.role === "pf_sa") return true;        // SAs have portfolio-wide visibility
  if (user.role === "pf_csm") return true;       // CSMs have portfolio-wide visibility
  if (user.role === "pf_engineer") return true;  // Engineers have portfolio-wide visibility

  if (user.role === "client" && user.dynamics_account_id) {
    const owned = await db
      .prepare("SELECT id FROM projects WHERE id = ? AND dynamics_account_id = ? LIMIT 1")
      .bind(projectId, user.dynamics_account_id)
      .first();
    return !!owned;
  }

  if (user.role === "pm") {
    const owned = await db
      .prepare(
        `
        SELECT id
        FROM projects
        WHERE id = ? AND pm_user_id = ?
        LIMIT 1
        `
      )
      .bind(projectId, user.id)
      .first();

    if (owned) return true;
  }

  if (user.role === "pf_ae") {
    const teamIds = await getTeamUserIds(user.id, db);
    const ph = inPlaceholders(teamIds);
    const tiedToProject = await db
      .prepare(`SELECT id FROM projects WHERE id = ? AND ae_user_id IN (${ph}) LIMIT 1`)
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
    return !!explicitAccess;
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
    const owned = await db
      .prepare(
        `
        SELECT id
        FROM projects
        WHERE id = ? AND pm_user_id = ?
        LIMIT 1
        `
      )
      .bind(projectId, user.id)
      .first();

    return !!owned;
  }

  return false;
}

export function canManageUsers(role: AppRole): boolean {
  return role === "admin";
}