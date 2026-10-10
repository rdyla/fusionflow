import type { AuthContext, Bindings } from "../types";
import { canLogTimeOnProject } from "../services/accessService";
import { appendCaseInternalNote, getCaseAndJob } from "../services/dynamicsService";
import { writeAuditLog } from "../lib/auditLog";
import { utcToPacific } from "../lib/pacificTime";
import { type ToolFailure } from "./timeWrites";

/**
 * add_case_note: append to a project's CE case Internal Notes
 * (incident.new_internalnotes). Each entry is stamped with Pacific time and the
 * author, e.g.
 *
 *   [2026-10-10 14:32 PT] Ryan Dyla: Customer confirmed go-live date.
 */

const fail = (error: string, extra: Record<string, unknown> = {}): ToolFailure => ({ error, ...extra });

type ProjectForNote = { id: string; name: string; crm_case_id: string | null; crm_ticket_number: string | null };

export async function addCaseNoteForUser(
  env: Bindings, ctx: ExecutionContext, auth: AuthContext,
  project: ProjectForNote, note: string, allowDuplicate: boolean
) {
  const user = auth.user;
  // Same people who can log time on the project: its editors, plus PMs and IEs.
  if (!(await canLogTimeOnProject(env.DB, user, project.id))) return fail("You can't add notes on this project.");
  if (!project.crm_case_id) return fail("This project has no linked CE case.");

  const text = note.trim().replace(/\r\n/g, "\n");
  const author = user.name ?? user.email;
  const now = new Date().toISOString();
  const stamp = utcToPacific(now);
  const entry = `[${stamp.date} ${stamp.time} PT] ${author}: ${text}`;

  let caseId: string;
  try {
    const found = await getCaseAndJob(env, project.crm_case_id);
    if (!found) return fail("Couldn't find the project's case in CE.");
    caseId = found.caseId;
  } catch (err) {
    return fail("Couldn't reach CE to find the case.", { ce_push: { succeeded: false, error: err instanceof Error ? err.message : String(err) } });
  }

  // A retry (timeout, the model calling twice) must not add the note twice.
  // Matched on author + text, not the timestamp, which differs per attempt.
  const signature = `] ${author}: ${text}`;
  let result: { appended: boolean; notes: string };
  try {
    result = await appendCaseInternalNote(env, caseId, entry, allowDuplicate ? undefined : (current) => current.includes(signature));
  } catch (err) {
    return fail("The note was not added — the update to CE failed.", {
      ce_push: { succeeded: false, error: err instanceof Error ? err.message : String(err) },
    });
  }

  if (!result.appended) {
    return {
      status: "duplicate",
      message: "This note from you is already on the case, so it wasn't added again. Set allow_duplicate to add it anyway.",
      project: project.name,
      ce_case_number: project.crm_ticket_number,
    };
  }

  ctx.waitUntil(writeAuditLog(env.DB, {
    entityType: "project",
    entityId: project.id,
    action: "mcp_case_note",
    method: "MCP",
    path: "/mcp",
    status: 200,
    actor: { id: user.id, name: user.name, email: user.email },
  }));

  return {
    status: "added",
    added_at: now,
    ce_push: { succeeded: true, ce_case_id: caseId },
    project: project.name,
    ce_case_number: project.crm_ticket_number,
    appended_text: entry,
    internal_notes_length: result.notes.length,
  };
}
