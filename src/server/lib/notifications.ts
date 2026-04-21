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
        head: { text: "CloudConnect", sub_head: { text: headText } },
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

export async function notifyZoomNewCase(
  webhookUrl: string,
  webhookSecret: string,
  opts: {
    ticketNumber: string;
    caseId: string;
    accountName: string | null;
    submittedBy: string;
    title: string;
  }
): Promise<void> {
  try {
    const crmLink = `https://packetfusioncrm.crm.dynamics.com/main.aspx?etn=incident&id=${opts.caseId}&pagetype=entityrecord`;
    const customer = opts.accountName ?? opts.submittedBy;
    const message = `New support case opened — ${opts.ticketNumber}: ${opts.title}\nCustomer: ${customer} | Submitted by: ${opts.submittedBy}\n${crmLink}`;
    const timestamp = Date.now().toString();
    const url = `${webhookUrl}?format=message&timestamp=${timestamp}`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`message&${timestamp}&${message}`));
    const bytes = new Uint8Array(sig);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const authorization = btoa(binary);

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: message,
    });
    if (!res.ok) {
      console.error("[zoom-support] failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[zoom-support] error:", err);
  }
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
