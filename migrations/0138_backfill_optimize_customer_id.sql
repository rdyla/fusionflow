-- Backfill optimize_accounts.customer_id from the owning project.
--
-- The column is a denormalization of projects.customer_id, but no graduation
-- path ever wrote it (the auto, direct and manual INSERTs all omitted it), so
-- it was NULL on every row in prod — 25 of 25 at the time of this migration.
-- The customer record's Optimizations tab filtered on it directly, so the tab
-- was empty for every customer even though the Optimize module itself showed
-- the customer correctly (that side derives it through the project join).
--
-- Fixed in three places together:
--   * the three INSERTs now populate it (routes/optimize.ts, lib/teamUtils.ts)
--   * the read path COALESCEs through the project so it can't silently break
--     this way again (routes/customers.ts)
--   * this backfill repairs existing rows
--
-- Only fills NULLs. A row whose customer_id was set deliberately — the customer
-- merge path in routes/customers.ts rewrites it to the surviving customer — is
-- left alone, so re-running this can't undo a merge.
UPDATE optimize_accounts
SET customer_id = (
      SELECT p.customer_id FROM projects p WHERE p.id = optimize_accounts.project_id LIMIT 1
    )
WHERE customer_id IS NULL
  AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = optimize_accounts.project_id AND p.customer_id IS NOT NULL
    );
