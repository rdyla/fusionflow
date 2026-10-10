import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AppUser, AuthContext, Bindings } from "../types";
import { isInternal } from "../lib/permissions";
import { buildMcpServer } from "./tools";

/** What /oauth/authorize stores on the grant (encrypted at rest by the provider). */
export type McpProps = { userId: string };

type McpUserRow = AppUser & { is_mcp: number };

/**
 * The user behind an MCP token, re-read from D1 on every request.
 *
 * This deliberately differs from browser sessions, which cache AppUser in KV
 * and wait for re-login (see CLAUDE.md). A connector grant lives for weeks via
 * refresh tokens and the user never "logs out", so turning off is_mcp or
 * deactivating the user has to bite on the next call, not in 30 days. The row
 * is fetched anyway for that check, so building AuthContext from it is free.
 * Clients can't hold MCP access, so none of the client account resolution in
 * resolveUserByEmail applies.
 */
export async function loadMcpUser(db: D1Database, userId: string): Promise<AuthContext | null> {
  const user = await db
    .prepare(
      `SELECT id, email, name, organization_name, role, is_active, is_support_supervisor, is_sales_tools,
              is_time_assist, is_mcp, dynamics_account_id, manager_id, cs_permission
         FROM users WHERE id = ? LIMIT 1`
    )
    .bind(userId)
    .first<McpUserRow>();
  if (!user || user.is_active !== 1 || user.is_mcp !== 1 || !isInternal(user.role)) return null;
  return { user, role: user.role, organization: user.organization_name };
}

const mcpHandler: ExportedHandler<Bindings> = {
  async fetch(request, env, ctx) {
    const props = (ctx as ExecutionContext & { props: McpProps }).props;
    const auth = props?.userId ? await loadMcpUser(env.DB, props.userId) : null;
    if (!auth) {
      return Response.json(
        { error: "forbidden", error_description: "The Claude connector isn't enabled for this CloudConnect account." },
        { status: 403 }
      );
    }

    // Stateless: a fresh server + transport per request, JSON responses rather
    // than SSE. Every tool call is a single request/response, and Workers keep
    // no state between requests to hang a session on.
    const server = buildMcpServer(env, auth);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};

export default mcpHandler;
