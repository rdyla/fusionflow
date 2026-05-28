-- Every project owns at least one deployment phase (May-2026). PR E2
-- unifies the template-apply flow on the Phases panel — even single-
-- phase projects operate via a "Main" phase row instead of through a
-- standalone Project Settings card.
--
-- For projects that already have ≥ 1 phase (the multi-phase set), this
-- migration is a no-op. For the rest, insert one Main phase keyed by
-- project id so the id is deterministic and unique. Then move the
-- project's non-Initiate stages under it; Initiate stays shared
-- (phase_id = NULL) per the existing convention for multi-phase
-- projects.

INSERT INTO phases (id, project_id, name, target_go_live_date, display_order)
SELECT
  'phase-' || p.id,
  p.id,
  'Main',
  p.target_go_live_date,
  0
FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM phases WHERE project_id = p.id);

UPDATE stages
SET phase_id = 'phase-' || stages.project_id
WHERE phase_id IS NULL
  AND lower(trim(name)) NOT IN ('initiate', 'initiation')
  AND EXISTS (
    SELECT 1 FROM phases
    WHERE id = 'phase-' || stages.project_id
      AND project_id = stages.project_id
  );
