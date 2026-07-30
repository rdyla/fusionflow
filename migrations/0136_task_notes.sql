-- Free-text note per task, editable via a glyph on the Tasks tab. Distinct
-- from the unused task_comments table (a threaded multi-author log) — this
-- is a single overwritable note, same shape as other task fields.
ALTER TABLE tasks ADD COLUMN notes TEXT;
