import type { Bindings } from "../types";
import { sendEmail } from "../services/emailService";
import { userInvite } from "./emailTemplates";

/**
 * Resolve a partner AE to a user id by email, creating + inviting a new
 * partner_ae user when none exists. Returns the user id, or null when the
 * email is empty or (for a new user) no name was supplied.
 *
 * Shared by the solutions create/convert flows and the project "+ Partner AE"
 * (add net-new) flow.
 */
export async function findOrCreatePartnerAe(
  env: Bindings,
  db: D1Database,
  invitedByName: string,
  payload: {
    email: string;
    name: string | null;
    organization_name: string | null;
    executionCtx?: { waitUntil: (p: Promise<unknown>) => void };
  },
): Promise<string | null> {
  const email = payload.email.trim().toLowerCase();
  if (!email) return null;
  const existing = await db
    .prepare("SELECT id FROM users WHERE lower(email) = ? LIMIT 1")
    .bind(email)
    .first<{ id: string }>();
  if (existing) return existing.id;
  if (!payload.name) return null; // can't create a user without at least a name

  const newId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO users (id, email, name, organization_name, role, is_active) VALUES (?, ?, ?, ?, 'partner_ae', 1)",
    )
    .bind(newId, email, payload.name, payload.organization_name)
    .run();

  const appUrl = env.APP_URL ?? "";
  const sendInvite = sendEmail(env, {
    to: email,
    subject: "You've been invited to CloudConnect",
    html: userInvite({ recipientName: payload.name, invitedByName, role: "partner_ae", appUrl }),
  });
  if (payload.executionCtx) payload.executionCtx.waitUntil(sendInvite);
  else await sendInvite.catch(() => {}); // best-effort if no waitUntil available

  return newId;
}
