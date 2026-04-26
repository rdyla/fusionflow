-- labor_estimates goes from one-per-solution → one-per-(solution, solution_type).
-- Mirrors the needs_assessments migration (PR #8 / 0053). SQLite recreate-table
-- pattern because `solution_id TEXT NOT NULL UNIQUE` is inline on the column.

ALTER TABLE labor_estimates ADD COLUMN solution_type TEXT NOT NULL DEFAULT 'ucaas';

UPDATE labor_estimates
SET solution_type = COALESCE(
  (SELECT json_extract(s.solution_types, '$[0]') FROM solutions s WHERE s.id = labor_estimates.solution_id),
  'ucaas'
);

CREATE TABLE labor_estimates_new (
  id TEXT PRIMARY KEY,
  solution_id TEXT NOT NULL,
  solution_type TEXT NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'unified_labor_estimation_model_v1',
  solution_type_category TEXT NOT NULL,
  base_hours TEXT NOT NULL DEFAULT '{}',
  driver_adjustments TEXT NOT NULL DEFAULT '[]',
  complexity TEXT NOT NULL DEFAULT '{}',
  pre_override_hours TEXT NOT NULL DEFAULT '{}',
  final_hours TEXT NOT NULL DEFAULT '{}',
  overrides TEXT NOT NULL DEFAULT '{}',
  total_low INTEGER,
  total_expected INTEGER,
  total_high INTEGER,
  confidence_score INTEGER,
  confidence_band TEXT,
  risk_flags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (solution_id, solution_type),
  FOREIGN KEY (solution_id) REFERENCES solutions(id) ON DELETE CASCADE
);

INSERT INTO labor_estimates_new (
  id, solution_id, solution_type, model_version, solution_type_category,
  base_hours, driver_adjustments, complexity, pre_override_hours, final_hours, overrides,
  total_low, total_expected, total_high, confidence_score, confidence_band, risk_flags,
  created_at, updated_at
)
SELECT
  id, solution_id, solution_type, model_version, solution_type_category,
  base_hours, driver_adjustments, complexity, pre_override_hours, final_hours, overrides,
  total_low, total_expected, total_high, confidence_score, confidence_band, risk_flags,
  created_at, updated_at
FROM labor_estimates;

DROP TABLE labor_estimates;
ALTER TABLE labor_estimates_new RENAME TO labor_estimates;

CREATE INDEX idx_labor_estimates_solution_id ON labor_estimates(solution_id);
