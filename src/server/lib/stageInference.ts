/**
 * Infer which project stage a meeting's time belongs to.
 *
 * My Time originally logged everything as project-level "Project Admin" time.
 * That flattened a distinction the team actually maintains — 14 people log at
 * stage level vs 6 at project level — so suggestions now carry an inferred
 * stage, which the user can change before processing.
 *
 * The inference is a DEFAULT, never a decision: the UI shows it in an editable
 * dropdown. Aiming for "right most of the time, one click to fix" rather than
 * an automation nobody can correct.
 */

export type StageForInference = {
  id: string;
  name: string;
  /** 'not_started' | 'in_progress' | 'completed' | … */
  status: string | null;
  /** Position within the project; lower runs earlier. */
  sortOrder: number;
};

export type StageInference = {
  stageId: string | null;
  stageName: string | null;
  reason:
    | "keyword_and_active"
    | "only_active_stage"
    | "furthest_active_stage"
    | "keyword_only"
    | "no_stages";
  confidence: "high" | "medium";
};

/**
 * Meeting-title keywords mapped to the stage vocabulary these templates
 * actually use (Initiation / Planning / Executing / Monitoring-Controlling /
 * Go Live / Hypercare / Closing).
 *
 * Deliberately NOT reusing zoomService's STAGE_KEYWORDS: that map targets
 * /build/, /design/, /test/ stage names which barely exist here, so it would
 * match almost nothing.
 *
 * Order matters — the first hit wins, so the most specific phases come first.
 * Note "discovery" maps to Monitoring/Controlling rather than Initiation: in
 * practice it appears in recurring series names ("Weekly Discovery") long
 * after discovery is over, and treating it as Initiation sent ongoing
 * implementation calls to the wrong end of the project.
 */
const STAGE_KEYWORDS: Array<{ re: RegExp; stage: RegExp }> = [
  { re: /hypercare|post[\s-]?go[\s-]?live/i,                          stage: /hypercare/i },
  { re: /go[\s-]?live|cutover|\bport(ing)?\b/i,                       stage: /go[\s-]?live|production/i },
  { re: /close[\s-]?out|lessons[\s-]?learned/i,                       stage: /clos/i },
  { re: /kick[\s-]?off|scoping|requirements?\b/i,                     stage: /initiat|kick/i },
  { re: /design|workshop|architect/i,                                 stage: /plan|design/i },
  { re: /build|config|implementation|integration|testing|\buat\b|working session/i, stage: /execut|build/i },
  { re: /status|sync|update|check[\s-]?in|checkpoint|weekly|sprint|review|progress|discovery/i, stage: /monitor|control/i },
];

/**
 * Pick the stage for a meeting.
 *
 * Priority — and the order is the whole trick:
 *   1. a keyword hit that is ALSO an active stage
 *   2. the single active stage, when there's exactly one
 *   3. the furthest-along active stage, when several run at once
 *   4. a keyword hit, when nothing is active
 *
 * Active stages outrank a keyword pointing somewhere inactive. Tested against
 * a real week, letting keywords win sent "RCBM / Weekly Discovery" to
 * Initiation because "Discovery" is the meeting series name — the project was
 * actually in Planning/Executing. Ranking active stages first fixed that and
 * two others.
 */
export function inferStage(subject: string, stages: StageForInference[]): StageInference {
  if (stages.length === 0) {
    return { stageId: null, stageName: null, reason: "no_stages", confidence: "medium" };
  }

  const active = stages.filter((s) => s.status === "in_progress");
  const keyword = STAGE_KEYWORDS.find((k) => k.re.test(subject)) ?? null;

  const byOrder = (a: StageForInference, b: StageForInference) => a.sortOrder - b.sortOrder;
  const hit = (pool: StageForInference[]) =>
    keyword ? pool.filter((s) => keyword.stage.test(s.name)).sort(byOrder)[0] ?? null : null;

  // 1. keyword AND active — both signals agree
  const keywordActive = hit(active);
  if (keywordActive) {
    return { stageId: keywordActive.id, stageName: keywordActive.name, reason: "keyword_and_active", confidence: "high" };
  }

  // 2. exactly one stage running — unambiguous
  if (active.length === 1) {
    return { stageId: active[0].id, stageName: active[0].name, reason: "only_active_stage", confidence: "high" };
  }

  // 3. several running — the furthest along is the best guess, but flag it
  if (active.length > 1) {
    const latest = [...active].sort(byOrder).pop()!;
    return { stageId: latest.id, stageName: latest.name, reason: "furthest_active_stage", confidence: "medium" };
  }

  // 4. nothing active — fall back to the keyword against every stage
  const keywordAny = hit(stages);
  if (keywordAny) {
    return { stageId: keywordAny.id, stageName: keywordAny.name, reason: "keyword_only", confidence: "medium" };
  }

  return { stageId: null, stageName: null, reason: "no_stages", confidence: "medium" };
}
