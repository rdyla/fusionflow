-- CloudConnect MCP connector (remote MCP server for Claude custom connectors).
--
-- is_mcp gates who may authorize the connector and call its tools. Additive
-- flag, off by default, same pattern as is_time_assist. Unlike session flags it
-- is re-checked on every MCP request (see src/server/mcp/handler.ts): an MCP
-- grant lives for weeks via refresh tokens, so "log out and back in" isn't a
-- way to revoke it.
ALTER TABLE users ADD COLUMN is_mcp INTEGER NOT NULL DEFAULT 0;

-- The CE case number (CAS-xxxxx-xxxxxx) for projects.crm_case_id, which holds
-- the incident GUID. People refer to projects by case number, so MCP lookups
-- need it locally. Filled lazily from Dynamics on first read and cleared
-- whenever crm_case_id changes (PATCH /projects/:id), so it can't go stale.
--
-- Not named crm_case_number: prod carried an unused column by that name that
-- no migration created (dropped by hand 2026-10-09), and reusing the name
-- would have made this migration fail on prod with "duplicate column".
ALTER TABLE projects ADD COLUMN crm_ticket_number TEXT;
