-- SOW add-ons + pricing on solutions.
--
-- add_ons:           JSON array of { id, label, kind, value, note? } items.
--                    kind ∈ "hours" | "amount" | "discount_amount" | "discount_percent".
--                    Mirrors the CloudSupport custom-line pattern (PRs #56/#57).
-- blended_rate:      $/hr used to price labor hours + add-on hours. Default $165.
-- sow_total_amount:  derived total (labor hours × rate + add-on effects). Saved so it can
--                    be displayed on list/dashboard views without a labor-estimate join.
--                    Recomputed on solution PATCH that touches add_ons or blended_rate.

ALTER TABLE solutions ADD COLUMN add_ons          TEXT NOT NULL DEFAULT '[]';
ALTER TABLE solutions ADD COLUMN blended_rate     REAL NOT NULL DEFAULT 165;
ALTER TABLE solutions ADD COLUMN sow_total_amount REAL;
