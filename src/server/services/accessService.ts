import type { AppRole, AppUser } from "../types";

export async function canViewProject(
  db: D1Database,
  user: AppUser,
  projectId: string
): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role === "pf_sa") return true; // SAs have portfolio-wide visibility

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
    const tiedToProject = await db
      .prepare(
        `
        SELECT id
        FROM projects
        WHERE id = ? AND ae_user_id = ?
        LIMIT 1
        `
      )
      .bind(projectId, user.id)
      .first();

    if (tiedToProject) return true;
  }

  const explicitAccess = await db
    .prepare(
      `
      SELECT id
      FROM project_access
      WHERE project_id = ? AND user_id = ?
      LIMIT 1
      `
    )
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

  if (user.role === "pf_sa") {
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