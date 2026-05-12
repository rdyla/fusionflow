-- Bring templates.solution_type in line with the canonical SolutionType enum.
-- 0025 already remapped solutions.solution_type from 'zoom_ra' → 'ci' but the
-- templates seed (0021) was not migrated. Without this, the ZRA template
-- produces ugly tags like "[zoom_ra]" when applied.

UPDATE templates SET solution_type = 'ci' WHERE solution_type = 'zoom_ra';
