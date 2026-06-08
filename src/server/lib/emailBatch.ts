/**
 * Email batch accumulator.
 *
 * For handlers that touch many tasks at once (cascade date shifts, timeline
 * builder apply, future bulk-edit endpoints), the per-event notification
 * pattern doesn't fit — the same recipient might end up with twenty emails
 * for one logical action.
 *
 * Pattern:
 *   const batch = new EmailBatch();
 *   for (const task of changedTasks) {
 *     batch.add(assigneeId, { kind: "task_due_shifted", task, oldDue, newDue });
 *   }
 *   await sendBatchSummary(env, batch, {
 *     subjectPrefix: "Cascade applied",
 *     projectName, projectId, appUrl,
 *     headline: ({ count }) => `${count} of your tasks were rescheduled in ${projectName}`,
 *   });
 *
 * The flush is fire-and-forget — `sendEmail()` already never throws, so the
 * caller can `c.executionCtx.waitUntil(sendBatchSummary(...))` to keep the
 * request responsive.
 */

import { sendEmail } from "../services/emailService";
import { base, ctaButton, detail, escapeHtml } from "./emailTemplates";
import type { Bindings } from "../types";

export type BatchEvent =
  | {
      kind: "task_due_shifted";
      taskId: string;
      taskTitle: string;
      oldDue: string | null;
      newDue: string | null;
    }
  | {
      kind: "task_assigned";
      taskId: string;
      taskTitle: string;
      dueDate: string | null;
    };

type RecipientEntry = {
  email: string;
  name: string | null;
  events: BatchEvent[];
};

export class EmailBatch {
  private byRecipient = new Map<string, RecipientEntry>();

  add(
    recipientUserId: string,
    recipientEmail: string,
    recipientName: string | null,
    event: BatchEvent,
  ): void {
    const existing = this.byRecipient.get(recipientUserId);
    if (existing) {
      existing.events.push(event);
    } else {
      this.byRecipient.set(recipientUserId, {
        email: recipientEmail,
        name: recipientName,
        events: [event],
      });
    }
  }

  entries(): { userId: string; entry: RecipientEntry }[] {
    return [...this.byRecipient.entries()].map(([userId, entry]) => ({ userId, entry }));
  }

  size(): number {
    return this.byRecipient.size;
  }
}

export type BatchSummaryContext = {
  subject: string;
  projectName: string;
  projectId: string;
  appUrl: string;
  /** Optional intro paragraph before the change list. */
  intro?: string;
  /** Optional new target go-live to surface in the email body. */
  newTargetGoLive?: string | null;
  /** Optional caller / actor name ("Updated by Jane Doe"). */
  actorName?: string | null;
};

export async function sendBatchSummary(
  env: Bindings,
  batch: EmailBatch,
  ctx: BatchSummaryContext,
): Promise<void> {
  if (batch.size() === 0) return;

  await Promise.all(
    batch.entries().map(({ entry }) =>
      sendEmail(env, {
        to: entry.email,
        subject: ctx.subject,
        html: renderBatchSummary(entry, ctx),
      }),
    ),
  );
}

function renderBatchSummary(entry: RecipientEntry, ctx: BatchSummaryContext): string {
  const greetingName = escapeHtml(entry.name ?? entry.email);
  const projectName = escapeHtml(ctx.projectName);
  const intro = ctx.intro ? escapeHtml(ctx.intro) : `${entry.events.length} change${entry.events.length === 1 ? "" : "s"} affecting your work in ${projectName}.`;
  const actorLine = ctx.actorName
    ? `<p style="margin:0 0 16px;font-size:13px;color:#0b5394;">Applied by ${escapeHtml(ctx.actorName)}.</p>`
    : "";
  const goLiveLine = ctx.newTargetGoLive
    ? `<div style="background:rgba(255,140,0,0.08);border:1px solid rgba(255,140,0,0.3);border-radius:6px;padding:10px 14px;margin:14px 0;">
         <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#ff8c00;margin-bottom:2px;">New Target Go-Live</div>
         <div style="font-size:15px;font-weight:600;color:#107c10;">${escapeHtml(ctx.newTargetGoLive)}</div>
       </div>`
    : "";

  const rows = entry.events.map((ev) => renderEventRow(ev)).join("");

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#107c10;">${escapeHtml(ctx.subject)}</h2>
    <p style="margin:0 0 12px;font-size:14px;color:#0b5394;">Hi ${greetingName}, ${intro}</p>
    ${actorLine}
    ${goLiveLine}
    <div style="background:#f4f6f9;border:1px solid #e2e8f0;border-radius:6px;padding:14px 16px;">
      <table style="border-collapse:collapse;width:100%;">
        ${rows}
      </table>
    </div>
    ${ctaButton("Open Project", `${ctx.appUrl}/projects/${ctx.projectId}`)}
  `, ctx.appUrl);
}

function renderEventRow(ev: BatchEvent): string {
  if (ev.kind === "task_due_shifted") {
    const title = escapeHtml(ev.taskTitle);
    const oldDue = escapeHtml(ev.oldDue ?? "—");
    const newDue = escapeHtml(ev.newDue ?? "—");
    return detail(
      title,
      `<span style="color:#0b5394;">${oldDue}</span>
       <span style="color:#5f7fa6;margin:0 6px;">→</span>
       <span style="color:#0b5394;font-weight:600;">${newDue}</span>`,
    );
  }
  if (ev.kind === "task_assigned") {
    const title = escapeHtml(ev.taskTitle);
    const due = escapeHtml(ev.dueDate ?? "No due date");
    return detail(title, `<span style="color:#0b5394;">Due ${due}</span>`);
  }
  return "";
}
