import type { D1Database } from "@cloudflare/workers-types";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  assessment: "Needs Assessment",
  requirements: "Requirements",
  scope: "Scope of Work",
  handoff: "Handoff Ready",
  won: "Won",
  lost: "Lost",
};

export async function notifyZoomChat(
  webhookUrl: string,
  appUrl: string,
  opts: {
    event: "solution_created" | "solution_status_changed";
    solutionId: string;
    solutionName: string;
    actorName: string;
    newStatus?: string;
  }
): Promise<void> {
  const link = `${appUrl.replace(/\/$/, "")}/solutions/${opts.solutionId}`;
  const statusLabel = STATUS_LABELS[opts.newStatus ?? ""] ?? opts.newStatus ?? "";

  const headText = opts.event === "solution_created"
    ? "New Solution Created"
    : `Solution → ${statusLabel}`;

  const bodyText = opts.event === "solution_created"
    ? `${opts.solutionName} was created by ${opts.actorName}.`
    : `${opts.solutionName} moved to ${statusLabel} by ${opts.actorName}.`;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: {
        head: { text: "FusionFlow", sub_head: { text: headText } },
        body: [
          { type: "message", text: bodyText },
          {
            type: "attachments",
            resource_url: link,
            img_url: "",
            information: {
              title: { text: "View Solution →" },
              description: { text: opts.solutionName },
            },
          },
        ],
      },
    }),
  });
}

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
