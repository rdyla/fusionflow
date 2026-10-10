import { HTTPException } from "hono/http-exception";
import type { Bindings } from "../types";
import {
  getCaseAndJob, getSystemUserIdByEmail, createTimeEntry, closeTimeEntry, deleteTimeEntry,
} from "./dynamicsService";

/**
 * The Dynamics side of a CloudConnect time entry, shared by every caller that
 * writes time: the task / stage / project-admin routes and the MCP tools.
 *
 * Callers own authz and the local shadow row (project/stage/task_time_entries);
 * this owns the CRM contract, which has to be identical everywhere because
 * payroll reads these records. Errors are HTTPExceptions so routes can let them
 * propagate unchanged.
 */

export type CrmTimeEntryInput = {
  subject: string;
  scheduledStart: string;
  scheduledEnd: string;
  caseId: string;
  jobId: string;
  payCodeId: string;
  costCodeId?: string | null;
  companyId?: string | null;
  /** Signed-in user's email — the entry is owned by their systemuser. */
  ownerEmail: string;
};

/**
 * Resolve a project's linked case to case/job/account SERVER-SIDE. A case with
 * no job has no billing context, so time can't be logged against it.
 */
export async function resolveCaseForTime(
  env: Bindings,
  crmCaseId: string
): Promise<{ caseId: string; jobId: string; accountId: string | null }> {
  const caseAndJob = await getCaseAndJob(env, crmCaseId);
  if (!caseAndJob) throw new HTTPException(400, { message: "Could not resolve the project's CRM case in Dynamics." });
  if (!caseAndJob.jobId) throw new HTTPException(400, { message: "The project's CRM case has no linked job — a job is required to log time." });
  return { caseId: caseAndJob.caseId, jobId: caseAndJob.jobId, accountId: caseAndJob.accountId };
}

/**
 * Create an amc_timeentry and close it; returns the CRM GUID.
 *
 * Payroll's integration only picks up Completed entries; leaving the entry in
 * Open creates a stuck record in their feed. Hard-fail if the close PATCH
 * errors — the create-then-close is a single logical operation from the user's
 * perspective, and a half-completed state is worse than a clean error they can
 * retry from. Callers must not insert their local row on failure; the orphan in
 * CRM is the cost of keeping retry idempotent-ish.
 *
 * `context` only labels log lines ("stage", "project admin", …).
 */
export async function pushTimeEntryToCrm(
  env: Bindings,
  input: CrmTimeEntryInput,
  context: string
): Promise<string> {
  const ownerId = await getSystemUserIdByEmail(env, input.ownerEmail);
  if (!ownerId) throw new HTTPException(422, { message: `No Dynamics user found for ${input.ownerEmail}` });

  let crmTimeEntryId: string;
  try {
    crmTimeEntryId = await createTimeEntry(env, {
      subject: input.subject,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
      caseId: input.caseId,
      jobId: input.jobId,
      payCodeId: input.payCodeId,
      costCodeId: input.costCodeId ?? null,
      companyId: input.companyId ?? null,
      ownerId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "CRM time entry failed";
    console.error(`createTimeEntry (${context}) error:`, message);
    throw new HTTPException(502, { message: `CRM error: ${message}` });
  }

  try {
    await closeTimeEntry(env, crmTimeEntryId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "CRM time entry close failed";
    console.error(`closeTimeEntry (${context}) error:`, message, "orphan entry:", crmTimeEntryId);
    throw new HTTPException(502, { message: `CRM time entry created but not closed (orphan ${crmTimeEntryId}): ${message}` });
  }

  return crmTimeEntryId;
}

/**
 * Remove an entry's CRM record. Called BEFORE deleting the local row so we never
 * leave a local row pointing at a CRM entry we failed to remove. A 404 in CRM is
 * treated as success. No-op for entries that never reached CRM.
 */
export async function removeTimeEntryFromCrm(
  env: Bindings,
  crmTimeEntryId: string | null,
  context: string
): Promise<void> {
  if (!crmTimeEntryId) return;
  try {
    await deleteTimeEntry(env, crmTimeEntryId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "CRM delete failed";
    console.error(`deleteTimeEntry (${context}) error:`, message, "entry:", crmTimeEntryId);
    // cause keeps a TimeEntryLeftOpenError identifiable to callers that need
    // to tell "record left Active" apart from a plain failure.
    throw new HTTPException(502, { message: `CRM error: ${message}`, cause: err });
  }
}
