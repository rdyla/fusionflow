// FedEx Track API integration. OAuth client-credentials (mirrors graphAuth /
// dynamicsService), token cached in KV. The Track API returns status for ANY
// valid tracking number — the shipment does NOT need to be on our FedEx
// account — which is what we need for vendor drop-ships.
type Env = {
  FEDEX_CLIENT_ID?: string;
  FEDEX_CLIENT_SECRET?: string;
  FEDEX_API_BASE?: string;
  KV?: KVNamespace;
};

const CACHE_KEY = "fedex:track:token";
const SAFETY_MARGIN_SECONDS = 60;

export function isFedexConfigured(env: Env): boolean {
  return !!(env.FEDEX_CLIENT_ID && env.FEDEX_CLIENT_SECRET);
}

function apiBase(env: Env): string {
  // Default to production; set FEDEX_API_BASE to https://apis-sandbox.fedex.com for test.
  return (env.FEDEX_API_BASE || "https://apis.fedex.com").replace(/\/$/, "");
}

type TokenResponse = { access_token: string; expires_in: number };

async function getFedexToken(env: Env): Promise<string | null> {
  if (!isFedexConfigured(env)) return null;
  if (env.KV) {
    const cached = await env.KV.get(CACHE_KEY);
    if (cached) return cached;
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.FEDEX_CLIENT_ID!,
    client_secret: env.FEDEX_CLIENT_SECRET!,
  });
  const res = await fetch(`${apiBase(env)}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    console.error(`[fedex] token request failed (${res.status}):`, await res.text());
    return null;
  }
  const data = (await res.json()) as TokenResponse;
  if (env.KV && data.expires_in) {
    const ttl = Math.max(data.expires_in - SAFETY_MARGIN_SECONDS, 60);
    await env.KV.put(CACHE_KEY, data.access_token, { expirationTtl: ttl });
  }
  return data.access_token;
}

export type TrackResult = {
  status: string | null;          // human label, e.g. "In transit"
  statusDetail: string | null;    // fuller description / latest scan text
  estimatedDelivery: string | null;
  delivered: boolean;
};

// Minimal shape of the bits of the FedEx Track response we read.
type FedexTrackResponse = {
  output?: {
    completeTrackResults?: Array<{
      trackResults?: Array<{
        latestStatusDetail?: { code?: string; statusByLocale?: string; description?: string };
        dateAndTimes?: Array<{ type?: string; dateTime?: string }>;
        error?: { code?: string; message?: string };
      }>;
    }>;
  };
};

/**
 * Track a single FedEx tracking number. Returns null when FedEx isn't
 * configured or the call fails (callers treat that as "no update"). A valid
 * number with no movement still returns a result (status from the carrier).
 */
export async function trackFedexShipment(env: Env, trackingNumber: string): Promise<TrackResult | null> {
  const token = await getFedexToken(env);
  if (!token) return null;

  const res = await fetch(`${apiBase(env)}/track/v1/trackingnumbers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-locale": "en_US",
    },
    body: JSON.stringify({
      includeDetailedScans: false,
      trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
    }),
  });
  if (!res.ok) {
    console.error(`[fedex] track failed for ${trackingNumber} (${res.status})`);
    return null;
  }
  const data = (await res.json()) as FedexTrackResponse;
  const result = data.output?.completeTrackResults?.[0]?.trackResults?.[0];
  if (!result || result.error) return null;

  const latest = result.latestStatusDetail;
  const status = latest?.statusByLocale ?? latest?.description ?? null;
  const statusDetail = latest?.description ?? null;
  const code = (latest?.code ?? "").toUpperCase();
  const delivered = code === "DL";
  const eta = (result.dateAndTimes ?? []).find(
    (d) => d.type === "ESTIMATED_DELIVERY" || d.type === "ACTUAL_DELIVERY"
  )?.dateTime ?? null;

  return { status, statusDetail, estimatedDelivery: eta, delivered };
}
