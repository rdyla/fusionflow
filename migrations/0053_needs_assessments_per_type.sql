-- needs_assessments goes from one-per-solution → one-per-(solution, solution_type).
-- A solution with ["ucaas","ci"] now has up to 2 NA records. Existing rows backfill
-- from the parent solution's first solution_types value.
--
-- SQLite doesn't allow altering UNIQUE constraints in place — the old schema had
-- `solution_id TEXT NOT NULL UNIQUE`, and we need `UNIQUE(solution_id, solution_type)`.
-- Standard SQLite migration pattern: create new table, copy rows, swap.

ALTER TABLE needs_assessments ADD COLUMN solution_type TEXT NOT NULL DEFAULT 'ucaas';

-- Backfill each NA's solution_type from its parent solution's first canonical type.
-- Falls back to 'ucaas' if the parent has no canonical types (migration-only safeguard).
UPDATE needs_assessments
SET solution_type = COALESCE(
  (SELECT json_extract(s.solution_types, '$[0]') FROM solutions s WHERE s.id = needs_assessments.solution_id),
  'ucaas'
);

CREATE TABLE needs_assessments_new (
  id TEXT PRIMARY KEY,
  solution_id TEXT NOT NULL,
  solution_type TEXT NOT NULL,
  survey_id TEXT NOT NULL DEFAULT 'ci_needs_assessment_unified_v1',
  answers TEXT NOT NULL DEFAULT '{}',
  readiness_score INTEGER,
  readiness_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (solution_id, solution_type),
  FOREIGN KEY (solution_id) REFERENCES solutions(id) ON DELETE CASCADE
);

INSERT INTO needs_assessments_new (id, solution_id, solution_type, survey_id, answers, readiness_score, readiness_status, created_at, updated_at)
SELECT id, solution_id, solution_type, survey_id, answers, readiness_score, readiness_status, created_at, updated_at
FROM needs_assessments;

DROP TABLE needs_assessments;
ALTER TABLE needs_assessments_new RENAME TO needs_assessments;

CREATE INDEX idx_needs_assessments_solution_id ON needs_assessments(solution_id);
