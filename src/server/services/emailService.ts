import { Resend } from "resend";

type Env = {
  RESEND_API_KEY?: string;
};

type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
};

/**
 * Fire-and-forget email via Resend SDK. Never throws — a failed email
 * should never break the API response that triggered it.
 */
export async function sendEmail(env: Env, payload: EmailPayload): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not configured — skipping");
    return;
  }

  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  const validRecipients = recipients.filter(Boolean);
  if (validRecipients.length === 0) return;

  const resend = new Resend(env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: "FusionFlow360 <noreply@fusionflow360.com>",
    to: validRecipients,
    subject: payload.subject,
    html: payload.html,
  });

  if (error) {
    console.error("[email] Resend error:", error);
  }
}
