type Env = {
  GRAPH_TENANT_ID?: string;
  GRAPH_CLIENT_ID?: string;
  GRAPH_CLIENT_SECRET?: string;
  KV?: KVNamespace;
};

type TokenResponse = {
  access_token: string;
  expires_in: number;
};

const CACHE_KEY = "graph:mail:token";
const SAFETY_MARGIN_SECONDS = 60;

/**
 * Acquire a Microsoft Graph access token via client credentials flow,
 * with opportunistic KV caching. Returns null on any failure — callers
 * must handle that (fire-and-forget-style, don't throw).
 */
export async function getGraphToken(env: Env): Promise<string | null> {
  if (!env.GRAPH_TENANT_ID || !env.GRAPH_CLIENT_ID || !env.GRAPH_CLIENT_SECRET) {
    return null;
  }

  if (env.KV) {
    const cached = await env.KV.get(CACHE_KEY);
    if (cached) return cached;
  }

  const body = new URLSearchParams({
    client_id: env.GRAPH_CLIENT_ID,
    client_secret: env.GRAPH_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    console.error(`[graph] token request failed (${res.status}):`, await res.text());
    return null;
  }

  const data = (await res.json()) as TokenResponse;

  if (env.KV) {
    const ttl = Math.max(data.expires_in - SAFETY_MARGIN_SECONDS, 60);
    await env.KV.put(CACHE_KEY, data.access_token, { expirationTtl: ttl });
  }

  return data.access_token;
}
