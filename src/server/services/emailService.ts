const RESEND_API = "https://api.resend.com/emails";

type Env = {
  RESEND_API_KEY?: string;
};

type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
};

/**
 * Fire-and-forget email via Resend. Never throws — a failed email
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

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "FusionFlow <noreply@packetfusion.com>",
        to: validRecipients,
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!res.ok) {
      console.error(`[email] Resend ${res.status}:`, await res.text());
    }
  } catch (err) {
    console.error("[email] Send failed:", err);
  }
}
