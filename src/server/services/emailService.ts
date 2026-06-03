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

type EmailAttachment = {
  name: string;
  contentType: string;
  contentBytesBase64: string;
};

type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
};

const PF_DOMAIN = "@packetfusion.com";
// Staging-only allowlist for customer-POV testing — populated on the staging
// branch, stripped to empty on every staging→main promotion (this is prod).
// See project_customer_pov_testing memory.
const STAGING_TEST_DOMAINS: string[] = [];

/**
 * Fire-and-forget email via Microsoft Graph sendMail. Never throws —
 * a failed email should never break the API response that triggered it.
 *
 * Routing rules:
 *   DEV_EMAIL set   → all mail diverted to that address (local dev only)
 *   APP_URL staging → only @packetfusion.com + STAGING_TEST_DOMAINS recipients receive mail
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
    const allowedSuffixes = [PF_DOMAIN, ...STAGING_TEST_DOMAINS];
    finalRecipients = validRecipients.filter(r => {
      const lower = r.toLowerCase();
      return allowedSuffixes.some(s => lower.endsWith(s));
    });
    if (finalRecipients.length === 0) {
      console.info(`[email] Staging: suppressed email to non-allowlisted recipients (${validRecipients.join(", ")})`);
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

  const graphAttachments = (payload.attachments ?? []).map(a => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: a.name,
    contentType: a.contentType,
    contentBytes: a.contentBytesBase64,
  }));

  const body = {
    message: {
      subject,
      body: { contentType: "HTML", content: payload.html },
      from: {
        emailAddress: {
          name: "CloudConnect by Packet Fusion",
          address: env.MAIL_SENDER_UPN,
        },
      },
      toRecipients: finalRecipients.map(r => ({ emailAddress: { address: r } })),
      ...(graphAttachments.length > 0 ? { attachments: graphAttachments } : {}),
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
