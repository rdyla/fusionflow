-- Optimize → Tech Stack: Gartner TIME fit scoring.
-- Functional + technical fit (1-5) drive the derived TIME rating (time_rating,
-- which already exists and is now treated as the derived/overridable value).

ALTER TABLE account_tech_stack ADD COLUMN functional_fit INTEGER;     -- 1-5, business value
ALTER TABLE account_tech_stack ADD COLUMN technical_fit  INTEGER;     -- 1-5, technical health
ALTER TABLE account_tech_stack ADD COLUMN contract_expiration TEXT;   -- ISO 'YYYY-MM-DD'
ALTER TABLE account_tech_stack ADD COLUMN initiative_start TEXT;      -- free text: '3/1/2027','Q1 27','2027','TBD'
