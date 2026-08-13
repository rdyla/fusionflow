-- Private, per-user task-list templates.
--
-- Rather than a parallel set of tables, user templates live in `templates` with
-- an owner: `owner_user_id IS NULL` means the global library (every existing
-- row), non-NULL means private to that user. This buys the whole apply path for
-- free — /apply-template, /apply-timeline, the details endpoint and the
-- Timeline Builder's stage-merge logic all read templates by id and don't care
-- who owns them.
--
-- The tradeoff is that every READ site must now filter by owner or private
-- templates leak into someone else's picker. The audited set, all updated in the
-- same change as this migration:
--   * GET  /api/templates            → globals + own only
--   * GET  /api/templates/:id        → 404 on someone else's private template
--   * GET  /api/admin/templates      → globals only (keeps the admin library clean)
--   * POST/PATCH/DELETE /api/templates/**  → globals only, so an admin editing
--     the shared library can't reach into a user's private template
--   * POST /api/projects/:id/apply-template → rejects a template the caller
--     can't see, so a guessed id can't be applied
--
-- CASCADE on the owner: a deleted user's private templates go with them, and
-- template_stages / template_tasks already cascade from templates(id).
ALTER TABLE templates ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

-- Every template list query filters on this column.
CREATE INDEX IF NOT EXISTS idx_templates_owner ON templates(owner_user_id);
