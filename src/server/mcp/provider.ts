import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import type { Bindings } from "../types";
import mcpHandler from "./handler";

/**
 * OAuth 2.1 + remote MCP for the Claude connector.
 *
 * The worker is its own authorization server: Claude registers itself (DCR),
 * the user signs in with their normal CloudConnect session at /oauth/authorize,
 * and tokens for /mcp are issued and validated by @cloudflare/workers-oauth-provider
 * (stored hashed in OAUTH_KV, props encrypted).
 *
 * Client ID Metadata Documents are not enabled: they need the
 * global_fetch_strictly_public compatibility flag, which would change outbound
 * fetch behavior for the whole worker. DCR covers Claude's connector.
 */

export const MCP_PATH = "/mcp";
export const MCP_SCOPE = "cloudconnect";

/** Paths the provider must see; everything else goes straight to the app. */
export function isOAuthOrMcpPath(pathname: string): boolean {
  return (
    pathname === MCP_PATH || pathname.startsWith(`${MCP_PATH}/`) ||
    pathname.startsWith("/oauth/") ||
    pathname.startsWith("/.well-known/oauth-")
  );
}

/**
 * The origin the provider advertises as issuer and resource. Deployed, that's
 * APP_URL, so the resource is the canonical cloudconnect URL whichever hostname
 * a request arrived on. On loopback (wrangler dev) it's the request's own
 * origin, since APP_URL there still names production.
 */
function issuerOrigin(request: Request, env: Bindings): string {
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
  return env.APP_URL ? new URL(env.APP_URL).origin : url.origin;
}

// Options are fixed at construction but the origin is only known per request,
// so build one provider per origin and reuse it (one in practice; two in dev).
const providers = new Map<string, OAuthProvider<Bindings>>();

export function oauthProviderFor(
  request: Request,
  env: Bindings,
  defaultHandler: ExportedHandler<Bindings> & Pick<Required<ExportedHandler<Bindings>>, "fetch">
): OAuthProvider<Bindings> {
  const origin = issuerOrigin(request, env);
  let provider = providers.get(origin);
  if (!provider) {
    provider = new OAuthProvider<Bindings>({
      apiRoute: MCP_PATH,
      apiHandler: mcpHandler as ExportedHandler<Bindings> & Pick<Required<ExportedHandler<Bindings>>, "fetch">,
      defaultHandler,
      authorizeEndpoint: "/oauth/authorize",
      tokenEndpoint: "/oauth/token",
      clientRegistrationEndpoint: "/oauth/register",
      scopesSupported: [MCP_SCOPE, "offline_access"],
      requiredScopes: [MCP_SCOPE],
      resourceMetadata: {
        resource: `${origin}${MCP_PATH}`,
        authorization_servers: [origin],
      },
      // Short-lived access tokens; the 30-day refresh grant is what keeps a
      // connection alive, and every request re-checks the user's flag anyway.
      accessTokenTTL: 60 * 60,
    });
    providers.set(origin, provider);
  }
  return provider;
}
