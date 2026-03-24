import type { D1Database } from "@cloudflare/workers-types";

export async function createNotification(
  db: D1Database,
  opts: {
    recipientUserId: string;
    type: string;
    title: string;
    body?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    projectId?: string | null;
    senderUserId?: string | null;
  }
): Promise<void> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO notifications
         (id, recipient_user_id, type, title, body, entity_type, entity_id, project_id, sender_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      opts.recipientUserId,
      opts.type,
      opts.title,
      opts.body ?? null,
      opts.entityType ?? null,
      opts.entityId ?? null,
      opts.projectId ?? null,
      opts.senderUserId ?? null
    )
    .run();
}
