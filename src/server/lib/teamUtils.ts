/**
 * Returns the given userId plus the IDs of ALL active users anywhere in their
 * reporting tree (direct reports, their reports, etc.).  Uses a recursive CTE
 * so a top-level leader sees every AE beneath them regardless of depth.
 */
export async function getTeamUserIds(userId: string, db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(`
      WITH RECURSIVE subordinates(id) AS (
        SELECT id FROM users WHERE id = ?
        UNION ALL
        SELECT u.id FROM users u
        INNER JOIN subordinates s ON u.manager_id = s.id
        WHERE u.is_active = 1
      )
      SELECT id FROM subordinates
    `)
    .bind(userId)
    .all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

/** Build a SQL IN-list placeholder string for an array, e.g. "?, ?, ?" */
export function inPlaceholders(ids: string[]): string {
  return ids.map(() => "?").join(", ");
}

/**
 * Auto-derive project.status from stages + open blockers and persist it.
 * Precedence (top wins):
 *   1. any open risk OR any task in `blocked` status      → 'blocked'
 *   2. ≥ 1 stage AND every stage status = 'completed'     → 'complete'
 *   3. any stage status = 'in_progress'                   → 'in_progress'
 *   4. else (empty / all not_started)                     → 'not_started'
 *
 * Project status is no longer set manually by PMs (May-2026) — it's
 * derived here whenever a task changes (via syncStageStatus) or a
 * blocker is added / closed. Call from routes/tasks.ts and routes/risks.ts.
 *
 * Replaces the older syncProjectBlockedStatus which only handled the
 * blocked ⇄ in_progress transition.
 */
export async function syncProjectStatus(db: D1Database, projectId: string): Promise<string> {
  // Single round-trip to gather the counts we need.
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status = 'blocked') AS blocked_tasks,
         (SELECT COUNT(*) FROM risks WHERE project_id = ? AND status = 'open')    AS open_risks,
         (SELECT COUNT(*) FROM stages WHERE project_id = ?)                       AS total_stages,
         (SELECT COUNT(*) FROM stages WHERE project_id = ? AND status = 'completed')   AS done_stages,
         (SELECT COUNT(*) FROM stages WHERE project_id = ? AND status = 'in_progress') AS active_stages`
    )
    .bind(projectId, projectId, projectId, projectId, projectId)
    .first<{ blocked_tasks: number; open_risks: number; total_stages: number; done_stages: number; active_stages: number }>();

  const blockedTasks  = row?.blocked_tasks  ?? 0;
  const openRisks     = row?.open_risks     ?? 0;
  const totalStages   = row?.total_stages   ?? 0;
  const doneStages    = row?.done_stages    ?? 0;
  const activeStages  = row?.active_stages  ?? 0;

  const derived = (blockedTasks > 0 || openRisks > 0) ? "blocked"
    : (totalStages > 0 && doneStages === totalStages) ? "complete"
    : activeStages > 0 ? "in_progress"
    : "not_started";

  await db
    .prepare("UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (status IS NULL OR status != ?)")
    .bind(derived, projectId, derived)
    .run();

  return derived;
}

/** @deprecated kept for backward call sites — forwards to syncProjectStatus. */
export async function syncProjectBlockedStatus(db: D1Database, projectId: string): Promise<void> {
  await syncProjectStatus(db, projectId);
}

/**
 * Auto-derive a stage's status from its tasks and persist it.
 *   - any task in_progress OR completed → 'in_progress'
 *   - all tasks completed (with ≥1 task) → 'completed'
 *   - else (empty stage, or all tasks not_started) → 'not_started'
 *
 * Stage status is no longer set manually by PMs (May-2026) — it's derived
 * here whenever a task on the stage changes. Call after task POST / PATCH
 * / DELETE in routes/tasks.ts. Returns the new status (mostly for tests /
 * debugging; routes don't need to read it).
 */
export async function syncStageStatus(db: D1Database, stageId: string | null): Promise<string | null> {
  if (!stageId) return null;
  const counts = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN status IN ('in_progress', 'completed') THEN 1 ELSE 0 END) AS started
       FROM tasks WHERE stage_id = ?`
    )
    .bind(stageId)
    .first<{ total: number; done: number; started: number }>();

  const total = counts?.total ?? 0;
  const done = counts?.done ?? 0;
  const started = counts?.started ?? 0;

  const derived = total === 0 ? "not_started"
    : done === total ? "completed"
    : started > 0 ? "in_progress"
    : "not_started";

  await db
    .prepare("UPDATE stages SET status = ? WHERE id = ?")
    .bind(derived, stageId)
    .run();

  return derived;
}

/**
 * If every stage on a project is now completed (and the project has stages),
 * ensure an optimize_accounts row exists. Idempotent — safe to call after
 * any task or stage update. Was previously inlined in routes/stages.ts when
 * stage status was manually set; moved here now that status is derived.
 */
export async function maybeGraduateProject(db: D1Database, projectId: string, graduatedByUserId: string): Promise<void> {
  const incomplete = await db
    .prepare("SELECT COUNT(*) AS cnt FROM stages WHERE project_id = ? AND status != 'completed'")
    .bind(projectId)
    .first<{ cnt: number }>();
  if ((incomplete?.cnt ?? 1) > 0) return;

  const anyStage = await db
    .prepare("SELECT id FROM stages WHERE project_id = ? LIMIT 1")
    .bind(projectId)
    .first();
  if (!anyStage) return;

  const existing = await db
    .prepare("SELECT id FROM optimize_accounts WHERE project_id = ? LIMIT 1")
    .bind(projectId)
    .first();
  if (existing) return;

  await db
    .prepare(
      `INSERT INTO optimize_accounts (id, project_id, graduated_by, graduation_method)
       VALUES (?, ?, ?, 'auto')`
    )
    .bind(crypto.randomUUID(), projectId, graduatedByUserId)
    .run();
}

/**
 * Auto-derive a solution's pipeline stage from the artifacts attached to
 * it. Mirrors the project-status auto-derivation pattern (May-2026): SAs
 * no longer click "Advance" — the stage follows the work.
 *
 * Inputs scanned:
 *   - needs_assessments rows (one per solution_type)
 *   - labor_estimates rows (one per solution_type)
 *   - sow_data + sow_metadata on the solution row
 *
 * Rules (terminal won/lost skipped — manual only):
 *   - no NA row              → 'draft'
 *   - NA started, not complete → 'assessment'
 *   - NA complete, LE/SOW started → 'scope'   (legacy 'requirements' collapses in)
 *   - NA + LE + SOW all complete → 'handoff'
 *
 * "Complete" definitions:
 *   - NA complete: ≥ 1 NA row per declared solution_type AND every row's
 *                  derived readiness `status === 'ready'`
 *   - LE complete: ≥ 1 LE row per declared solution_type AND total_expected > 0
 *   - SOW complete: sow_data non-null AND ≥ 1 entry in sow_metadata.revisions
 *
 * Skip-if-terminal short-circuit so manual won/lost stay sticky until an SA
 * explicitly reopens to draft.
 */
export async function syncSolutionStatus(db: D1Database, solutionId: string): Promise<string | null> {
  const sol = await db
    .prepare("SELECT id, status, solution_types, sow_data, sow_metadata FROM solutions WHERE id = ? LIMIT 1")
    .bind(solutionId)
    .first<{ id: string; status: string | null; solution_types: string | null; sow_data: string | null; sow_metadata: string | null }>();
  if (!sol) return null;
  if (sol.status === "won" || sol.status === "lost") return sol.status;

  // Parse solution_types — tolerate both JSON array and CSV legacy formats.
  let solutionTypes: string[] = [];
  if (sol.solution_types) {
    try {
      const parsed = JSON.parse(sol.solution_types);
      if (Array.isArray(parsed)) solutionTypes = parsed;
    } catch {
      solutionTypes = sol.solution_types.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  const declaredCount = solutionTypes.length;

  // Needs Assessments — load rows; readiness is recomputed inside
  // routes/needsAssessments.ts but the persisted answers blob is enough
  // to detect "ready" status mirroring the GET response shape.
  const naRows = await db
    .prepare("SELECT solution_type, answers, readiness_status FROM needs_assessments WHERE solution_id = ?")
    .bind(solutionId)
    .all<{ solution_type: string; answers: string | null; readiness_status: string | null }>();
  const naCount = naRows.results?.length ?? 0;
  const naReadyCount = (naRows.results ?? []).filter((r) => r.readiness_status === "ready").length;
  const naStarted = naCount > 0;
  const naComplete = declaredCount > 0 && naCount >= declaredCount && naReadyCount >= declaredCount;

  // Labor estimates
  const leRows = await db
    .prepare("SELECT solution_type, total_expected FROM labor_estimates WHERE solution_id = ?")
    .bind(solutionId)
    .all<{ solution_type: string; total_expected: number | null }>();
  const leCount = leRows.results?.length ?? 0;
  const leWithValueCount = (leRows.results ?? []).filter((r) => (r.total_expected ?? 0) > 0).length;
  const leStarted = leCount > 0;
  const leComplete = declaredCount > 0 && leWithValueCount >= declaredCount;

  // SOW — sow_data non-null is "started"; ≥ 1 revision is "complete"
  const sowStarted = !!sol.sow_data;
  let sowRevisionCount = 0;
  if (sol.sow_metadata) {
    try {
      const meta = JSON.parse(sol.sow_metadata);
      if (Array.isArray(meta?.revisions)) sowRevisionCount = meta.revisions.length;
    } catch { /* ignore parse errors */ }
  }
  const sowComplete = sowStarted && sowRevisionCount > 0;

  const derived = !naStarted ? "draft"
    : !naComplete ? "assessment"
    : (naComplete && leComplete && sowComplete) ? "handoff"
    : (leStarted || sowStarted) ? "scope"
    : "assessment";

  if (derived !== sol.status) {
    await db
      .prepare("UPDATE solutions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(derived, solutionId)
      .run();
  }
  return derived;
}

/**
 * Sync a project's target_go_live_date from the canonical go-live event
 * task(s) (tasks.is_go_live_event = 1). On multi-phase projects there can
 * be multiple flagged tasks (one per rollout phase); the project's target
 * is the MAX of their due_dates — i.e. the FINAL go-live across the project.
 *
 * If no flagged task exists, target_go_live_date is left untouched (allows
 * brand-new projects to keep whatever was set at create-time until a
 * template-applied task carries the flag forward).
 *
 * Call after task POST / PATCH / DELETE in routes/tasks.ts.
 */
export async function syncProjectGoLiveDate(db: D1Database, projectId: string): Promise<void> {
  const row = await db
    .prepare(
      `SELECT MAX(due_date) AS go_live FROM tasks
       WHERE project_id = ? AND is_go_live_event = 1 AND due_date IS NOT NULL`
    )
    .bind(projectId)
    .first<{ go_live: string | null }>();

  const goLive = row?.go_live ?? null;
  if (!goLive) return;

  await db
    .prepare("UPDATE projects SET target_go_live_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND (target_go_live_date IS NULL OR target_go_live_date != ?)")
    .bind(goLive, projectId, goLive)
    .run();
}

// ── D365 opportunity sync ────────────────────────────────────────────────────
// PATCHes the bound D365 opportunity with everything sales ops would
// otherwise have to fill in by hand, derived from the solution row:
//
//   am_opportunitytype        — constant 930680038 (PFI - CloudPro). The
//                               professional-services labor we quote for
//                               implementation work, regardless of tech type.
//   am_revenuesource          — 930680001 (New Logo) when the CRM account
//                               was created inline during this solution's
//                               flow (is_new_logo=1), else 930680000
//                               (Installed Base).
//   am_OpportunityVendors     — lookup to am_vendoraccount. Resolved from
//                               solution.vendor + is_zoom_reseller:
//                                 ringcentral         → Ring Central
//                                 zoom + reseller=1   → Zoom Resell
//                                 zoom + reseller=0   → Zoom
//                                 tbd                 → field unset
//   am_opportunitysalesstage  — mapped from solution.status:
//                                 draft                       → Prospecting
//                                 assessment + requirements   → Scoping / NA
//                                 scope                       → Quote
//                                 handoff                     → Verbal
//                                 won + lost                  → Closed
//   am_mrr / cr495_crr        — recurring revenue. PF doesn't quote MRR/CRR
//                               on cloud implementations, so both fixed at 0.
//   am_spiff                  — sales spiff. Not modeled on our side; 0.
//   actualvalue +
//   am_combinedrevenue        — total SOW value. Read from solution
//                               .sow_total_amount; nulls coerced to 0 so
//                               D365's currency fields land on a number.
//   am_cloudcontractexpiration — passthrough date from the SA-entered
//                               solution.cloud_contract_expiration_date.
//   cr495_dealregistrationid  — passthrough text from
//                               solution.deal_registration_id.
//
// Best-effort: D365 failures are logged but never block the solution write
// path. Caller is solutions POST + PATCH after the DB row is in place.
// No-op when solution has no crm_opportunity_id (legacy rows, or rows
// somehow created without the gate).
// Structurally matches the subset of fields dynamicsService cares about.
// Route handlers can pass their `c.env` straight through — Hono Bindings
// always carry these.
type SyncOpportunityEnv = {
  KV: KVNamespace;
  DYNAMICS_TENANT_ID?: string;
  DYNAMICS_CLIENT_ID?: string;
  DYNAMICS_CLIENT_SECRET?: string;
  DYNAMICS_SUPPORT_CLIENT_ID?: string;
  DYNAMICS_SUPPORT_CLIENT_SECRET?: string;
};

const VENDOR_GUIDS = {
  ring_central: "b84b00ae-7951-ec11-8f8e-000d3a5bc238",
  zoom:         "e34b00ae-7951-ec11-8f8e-000d3a5bc238",
  zoom_resell:  "2b97d3d0-115f-ef11-bfe3-000d3a593ab7",
} as const;

const OPP_TYPE_CLOUDPRO = 930680038;
const REV_SRC_INSTALLED_BASE = 930680000;
const REV_SRC_NEW_LOGO       = 930680001;

const SALES_STAGE = {
  prospecting: 930680000,
  scoping:     930680001,
  // demos:    930680002 — not used; we don't model demos on the solution side
  quote:       930680003,
  verbal:      930680004,
  closed:      100000001,
} as const;

function salesStageForSolutionStatus(status: string | null): number {
  switch (status) {
    case "draft":         return SALES_STAGE.prospecting;
    case "assessment":    return SALES_STAGE.scoping;
    case "requirements":  return SALES_STAGE.scoping;
    case "scope":         return SALES_STAGE.quote;
    case "handoff":       return SALES_STAGE.verbal;
    case "won":           return SALES_STAGE.closed;
    case "lost":          return SALES_STAGE.closed;
    default:              return SALES_STAGE.prospecting;
  }
}

export async function syncOpportunityFromSolution(
  env: SyncOpportunityEnv,
  db: D1Database,
  solutionId: string,
): Promise<void> {
  const row = await db
    .prepare(
      `SELECT crm_opportunity_id, vendor, is_zoom_reseller, is_new_logo,
              deal_registration_id, status, sow_total_amount,
              cloud_contract_expiration_date
       FROM solutions WHERE id = ? LIMIT 1`
    )
    .bind(solutionId)
    .first<{
      crm_opportunity_id: string | null;
      vendor: string | null;
      is_zoom_reseller: number | null;
      is_new_logo: number | null;
      deal_registration_id: string | null;
      status: string | null;
      sow_total_amount: number | null;
      cloud_contract_expiration_date: string | null;
    }>();
  if (!row?.crm_opportunity_id) return;

  // Vendor lookup: only set when we have a confident map. "tbd" or
  // unrecognized values leave the field alone so we don't overwrite a
  // manually-set vendor in CRM with nothing.
  let vendorGuid: string | null = null;
  if (row.vendor === "ringcentral") {
    vendorGuid = VENDOR_GUIDS.ring_central;
  } else if (row.vendor === "zoom") {
    vendorGuid = row.is_zoom_reseller === 1 ? VENDOR_GUIDS.zoom_resell : VENDOR_GUIDS.zoom;
  }

  const sowTotal = row.sow_total_amount ?? 0;

  const patch: Record<string, unknown> = {
    am_opportunitytype:       OPP_TYPE_CLOUDPRO,
    am_revenuesource:         row.is_new_logo === 1 ? REV_SRC_NEW_LOGO : REV_SRC_INSTALLED_BASE,
    am_opportunitysalesstage: salesStageForSolutionStatus(row.status),
    am_mrr:                   0,
    cr495_crr:                0,
    am_spiff:                 0,
    actualvalue:              sowTotal,
    am_combinedrevenue:       sowTotal,
    am_cloudcontractexpiration: row.cloud_contract_expiration_date ?? null,
    cr495_dealregistrationid: row.deal_registration_id ?? null,
  };
  if (vendorGuid) {
    patch["am_OpportunityVendors@odata.bind"] = `/am_vendoraccounts(${vendorGuid})`;
  }

  // Lazy-import to avoid a circular dependency: dynamicsService imports
  // from various route modules in the future, and routes/solutions imports
  // from teamUtils. The dynamic import sidesteps that.
  try {
    const { updateOpportunity } = await import("../services/dynamicsService");
    await updateOpportunity(env, row.crm_opportunity_id, patch);
  } catch (err) {
    console.error(`syncOpportunityFromSolution failed for solution ${solutionId}:`, err);
  }
}
