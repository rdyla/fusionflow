import { Resend } from "resend";

type Env = {
  RESEND_API_KEY?: string;
  DEV_EMAIL?: string;
  APP_URL?: string;
};

type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
};

const PF_DOMAIN = "@packetfusion.com";

/**
 * Fire-and-forget email via Resend SDK. Never throws — a failed email
 * should never break the API response that triggered it.
 *
 * Routing rules:
 *   DEV_EMAIL set   → all mail diverted to that address (local dev only)
 *   APP_URL staging → only @packetfusion.com recipients receive mail
 *   otherwise       → normal production delivery
 */
export async function sendEmail(env: Env, payload: EmailPayload): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not configured — skipping");
    return;
  }

  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  const validRecipients = recipients.filter(Boolean);
  if (validRecipients.length === 0) return;

  let finalRecipients: string[];
  let subject = payload.subject;

  if (env.DEV_EMAIL) {
    // Local dev override — all mail to one address
    finalRecipients = [env.DEV_EMAIL];
    subject = `[DEV → ${validRecipients.join(", ")}] ${subject}`;
  } else if (env.APP_URL?.includes("staging")) {
    // Staging — only send to internal @packetfusion.com addresses
    finalRecipients = validRecipients.filter(r => r.toLowerCase().endsWith(PF_DOMAIN));
    if (finalRecipients.length === 0) {
      console.info(`[email] Staging: suppressed email to non-PF recipients (${validRecipients.join(", ")})`);
      return;
    }
    subject = `[STAGING] ${subject}`;
  } else {
    finalRecipients = validRecipients;
  }

  const resend = new Resend(env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: "FusionFlow360 <noreply@fusionflow360.com>",
    to: finalRecipients,
    subject,
    html: payload.html,
  });

  if (error) {
    console.error("[email] Resend error:", error);
  }
}
