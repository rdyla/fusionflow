-- Corrective backfill on top of 0097.
--
-- 0097 backfilled a default "Main" phase for every previously-single-phase
-- project, then moved their NON-Initiate stages under it — leaving Initiate
-- stages at phase_id = NULL ("shared"). That preserved the multi-phase
-- convention, but produced a confusing "Shared" column on the Dashboard's
-- Stage Progress matrix for projects that only ever have one phase.
--
-- Tighten the invariant: shared Initiate is only meaningful when a project
-- has > 1 phase. For single-phase projects, fold the shared Initiate
-- stages under the project's only phase. Matching transitions for
-- single↔multi crossings now live in routes/phases.ts (POST and DELETE).

UPDATE stages
SET phase_id = (
  SELECT id FROM phases WHERE project_id = stages.project_id LIMIT 1
)
WHERE phase_id IS NULL
  AND (SELECT COUNT(*) FROM phases WHERE project_id = stages.project_id) = 1;
