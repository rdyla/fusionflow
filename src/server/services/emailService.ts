import { getGraphToken } from "./graphAuth";

type Env = {
  GRAPH_TENANT_ID?: string;
  GRAPH_CLIENT_ID?: string;
  GRAPH_CLIENT_SECRET?: string;
  MAIL_SENDER_UPN?: string;
  DEV_EMAIL?: string;
  APP_URL?: string;
  KV?: KVNamespace;
};

type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
};

const PF_DOMAIN = "@packetfusion.com";

/**
 * Fire-and-forget email via Microsoft Graph sendMail. Never throws —
 * a failed email should never break the API response that triggered it.
 *
 * Routing rules:
 *   DEV_EMAIL set   → all mail diverted to that address (local dev only)
 *   APP_URL staging → only @packetfusion.com recipients receive mail
 *   otherwise       → normal production delivery
 */
export async function sendEmail(env: Env, payload: EmailPayload): Promise<void> {
  if (!env.MAIL_SENDER_UPN) {
    console.warn("[email] MAIL_SENDER_UPN not configured — skipping");
    return;
  }

  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  const validRecipients = recipients.filter(Boolean);
  if (validRecipients.length === 0) return;

  let finalRecipients: string[];
  let subject = payload.subject;

  if (env.DEV_EMAIL) {
    finalRecipients = [env.DEV_EMAIL];
    subject = `[DEV → ${validRecipients.join(", ")}] ${subject}`;
  } else if (env.APP_URL?.includes("staging")) {
    finalRecipients = validRecipients.filter(r => r.toLowerCase().endsWith(PF_DOMAIN));
    if (finalRecipients.length === 0) {
      console.info(`[email] Staging: suppressed email to non-PF recipients (${validRecipients.join(", ")})`);
      return;
    }
    subject = `[STAGING] ${subject}`;
  } else {
    finalRecipients = validRecipients;
  }

  const token = await getGraphToken(env);
  if (!token) {
    console.error("[email] could not acquire Graph token — skipping send");
    return;
  }

  const body = {
    message: {
      subject,
      body: { contentType: "HTML", content: payload.html },
      toRecipients: finalRecipients.map(r => ({ emailAddress: { address: r } })),
    },
    saveToSentItems: "true",
  };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.MAIL_SENDER_UPN)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    console.error(`[email] Graph sendMail failed (${res.status}):`, await res.text());
  }
}
