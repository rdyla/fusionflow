/**
 * Looks up a user by email. If not found, creates a new active user record
 * using the name and role from CRM data. Used during CRM team sync to ensure
 * all team members exist in the DB before assignment.
 */
export async function findOrCreatePfUser(
  db: D1Database,
  email: string | null,
  name: string | null,
  role: string,
): Promise<string | null> {
  if (!email) return null;
  const existing = await db
    .prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1")
    .bind(email)
    .first<{ id: string }>();
  if (existing) return existing.id;
  const newId = crypto.randomUUID();
  await db
    .prepare("INSERT INTO users (id, email, name, role, is_active) VALUES (?, ?, ?, ?, 1)")
    .bind(newId, email.toLowerCase(), name ?? null, role)
    .run();
  return newId;
}
