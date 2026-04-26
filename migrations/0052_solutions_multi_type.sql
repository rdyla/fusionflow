-- Migrate solutions.solution_type (TEXT NOT NULL) → two JSON array columns:
--   solution_types       — canonical SolutionTypes (ucaas/ccaas/va/ci/wfm/qm)
--   other_technologies   — non-canonical "Other Technology" values (bdr/sdwan/etc.)
--
-- Kicks off the multi-typed solutions arc. All data is test data per user
-- confirmation (CloudSupport agreement entries live on separate tables, not
-- affected here).

ALTER TABLE solutions ADD COLUMN solution_types     TEXT NOT NULL DEFAULT '[]';
ALTER TABLE solutions ADD COLUMN other_technologies TEXT NOT NULL DEFAULT '[]';

-- Canonical values go into solution_types.
UPDATE solutions
SET solution_types = json_array(solution_type)
WHERE solution_type IN ('ucaas', 'ccaas', 'va', 'ci', 'wfm', 'qm');

-- Everything else (bdr, sdwan, colocation, cyber_security, daas, help_desk,
-- iaas, mobility, managed_services, managed_cloud, tem, other, plus any legacy
-- vendor-specific values like zoom_va / rc_air that historically drifted in)
-- goes into other_technologies.
UPDATE solutions
SET other_technologies = json_array(solution_type)
WHERE solution_type NOT IN ('ucaas', 'ccaas', 'va', 'ci', 'wfm', 'qm')
  AND solution_type IS NOT NULL
  AND solution_type != '';

ALTER TABLE solutions DROP COLUMN solution_type;
