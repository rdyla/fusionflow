-- Solution status is now auto-derived from NA / LE / SOW artifacts
-- (May-2026), mirroring the project-status pattern from #275. Backfill
-- every non-terminal solution's status using the new rule so stored
-- values line up with the derivation immediately after deploy.
--
-- Derivation precedence (terminal won/lost left untouched):
--   1. No NA row                              → 'draft'
--   2. NA started, NOT complete               → 'assessment'
--   3. NA + LE + SOW all complete             → 'handoff'
--   4. Otherwise (NA complete + LE/SOW started) → 'scope'
--
-- "Complete" thresholds:
--   - NA  complete = ≥ 1 'ready' row per declared solution_type
--   - LE  complete = ≥ 1 row per declared solution_type with total_expected > 0
--   - SOW complete = sow_data NOT NULL AND sow_metadata has revisions
--
-- The runtime helper teamUtils.syncSolutionStatus runs the same math on
-- every NA / LE / SOW write so future progressions stay automatic. The
-- backfill below uses tolerant JSON-array parsing (json_array_length /
-- json_extract) — solution_types is always serialized as a JSON array
-- by the routes/solutions.ts writers post-#53.

UPDATE solutions SET
  status = (
    WITH
      declared AS (
        SELECT COALESCE(json_array_length(solution_types), 0) AS n
      ),
      na_ready AS (
        SELECT COUNT(*) AS n
        FROM needs_assessments
        WHERE solution_id = solutions.id AND readiness_status = 'ready'
      ),
      na_any AS (
        SELECT COUNT(*) AS n
        FROM needs_assessments
        WHERE solution_id = solutions.id
      ),
      le_complete AS (
        SELECT COUNT(*) AS n
        FROM labor_estimates
        WHERE solution_id = solutions.id AND total_expected > 0
      ),
      sow_rev AS (
        SELECT CASE
          WHEN solutions.sow_data IS NULL THEN 0
          WHEN solutions.sow_metadata IS NULL THEN 0
          ELSE COALESCE(json_array_length(json_extract(solutions.sow_metadata, '$.revisions')), 0)
        END AS n
      )
    SELECT CASE
      WHEN (SELECT n FROM na_any) = 0 THEN 'draft'
      WHEN (SELECT n FROM declared) > 0
           AND (SELECT n FROM na_ready)     >= (SELECT n FROM declared)
           AND (SELECT n FROM le_complete)  >= (SELECT n FROM declared)
           AND (SELECT n FROM sow_rev)      > 0
        THEN 'handoff'
      WHEN (SELECT n FROM declared) > 0
           AND (SELECT n FROM na_ready) >= (SELECT n FROM declared)
        THEN 'scope'
      ELSE 'assessment'
    END
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE status NOT IN ('won', 'lost');
