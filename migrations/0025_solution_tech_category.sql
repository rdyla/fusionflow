-- Migrate vendor-specific solution types to generic technology categories
UPDATE solutions SET solution_type = 'ci' WHERE solution_type IN ('zoom_ra', 'rc_ace');
UPDATE solutions SET solution_type = 'va' WHERE solution_type IN ('zoom_va', 'rc_air');
