import { Hono } from "hono";
import type { Bindings, Variables } from "../types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Types ────────────────────────────────────────────────────────────────────

type RawStatus =
  | "operational"
  | "degraded_performance"
  | "partial_outage"
  | "major_outage"
  | "under_maintenance";

type StatusComponent = { name: string; label: string; status: RawStatus };
type OverallStatus = "operational" | "degraded" | "outage";

export type VendorStatus = {
  overall: OverallStatus;
  components: StatusComponent[];
  fetched_at: number;
};

export type SystemStatusResponse = {
  vendors: ("zoom" | "ringcentral")[];
  zoom: VendorStatus | null;
  ringcentral: VendorStatus | null;
};

// ── Component keyword maps ────────────────────────────────────────────────────
// Each entry maps one or more lowercase substrings to a friendly UI label.
// First match wins; group components (parent rows) are skipped.

const ZOOM_MAP: { keywords: string[]; label: string }[] = [
  { keywords: ["meetings"],                        label: "Meetings"         },
  { keywords: ["phone"],                           label: "Phone"            },
  { keywords: ["contact center"],                  label: "Contact Center"   },
  { keywords: ["ai companion"],                    label: "AI Companion"     },
  { keywords: ["virtual agent", "zva"],            label: "Virtual Agent"    },
  { keywords: ["team chat"],                       label: "Team Chat"        },
  { keywords: ["authentication", "login", "sso"],  label: "Authentication"   },
];

const RC_MAP: { keywords: string[]; label: string }[] = [
  { keywords: ["ringex", "mvp", "core communications", "core services"],
                                                   label: "RingEX"           },
  { keywords: ["ringcx", "contact center"],        label: "Contact Center"   },
  { keywords: ["ringsense", "ai features", "ai "], label: "AI Features"      },
  { keywords: ["video"],                           label: "Video"            },
  { keywords: ["authentication", "login", "sso"],  label: "Authentication"   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchLabel(
  name: string,
  map: { keywords: string[]; label: string }[]
): string | null {
  const lower = name.toLowerCase();
  for (const entry of map) {
    if (entry.keywords.some((k) => lower.includes(k))) return entry.label;
  }
  return null;
}

function deriveOverall(components: StatusComponent[]): OverallStatus {
  const statuses = components.map((c) => c.status);
  if (statuses.some((s) => s === "major_outage")) return "outage";
  if (
    statuses.some(
      (s) =>
        s === "partial_outage" ||
        s === "degraded_performance" ||
        s === "under_maintenance"
    )
  )
    return "degraded";
  return "operational";
}

async function fetchComponents(
  url: string,
  map: { keywords: string[]; label: string }[]
): Promise<VendorStatus> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = (await res.json()) as {
    components: { name: string; status: string; group?: boolean; group_id?: string | null }[];
  };

  const components: StatusComponent[] = [];
  const seen = new Set<string>();

  for (const c of data.components ?? []) {
    // Skip group/header rows
    if (c.group) continue;
    const label = matchLabel(c.name, map);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    components.push({ name: c.name, label, status: c.status as RawStatus });
  }

  return { overall: deriveOverall(components), components, fetched_at: Date.now() };
}

const CACHE_TTL_MS = 90_000; // 90 s client-side validity check
const KV_TTL_S = 120;        // KV expiration

async function getCached(
  kv: KVNamespace,
  kvKey: string,
  url: string,
  map: { keywords: string[]; label: string }[]
): Promise<VendorStatus> {
  const cached = await kv.get<VendorStatus>(kvKey, "json");
  if (cached && Date.now() - cached.fetched_at < CACHE_TTL_MS) return cached;

  try {
    const fresh = await fetchComponents(url, map);
    await kv.put(kvKey, JSON.stringify(fresh), { expirationTtl: KV_TTL_S });
    return fresh;
  } catch {
    // Return stale data rather than an error if the upstream is unreachable
    return (
      cached ?? { overall: "operational", components: [], fetched_at: Date.now() }
    );
  }
}

// ── Contextual vendor selection ───────────────────────────────────────────────
// PF-internal roles see both vendors.
// Any future customer role is scoped to vendors from their active projects/solutions.

const PF_ROLES = new Set(["admin", "pm", "pf_ae", "partner_ae"]);

async function vendorsForUser(
  db: D1Database,
  userId: string,
  role: string
): Promise<("zoom" | "ringcentral")[]> {
  if (PF_ROLES.has(role)) return ["zoom", "ringcentral"];

  // Customer: derive from active projects they are linked to
  const rows = await db
    .prepare(
      `SELECT DISTINCT vendor
       FROM projects
       WHERE vendor IS NOT NULL
         AND (archived = 0 OR archived IS NULL)
         AND (
           pm_user_id = ?
           OR ae_user_id = ?
           OR id IN (SELECT project_id FROM project_access WHERE user_id = ?)
         )`
    )
    .bind(userId, userId, userId)
    .all<{ vendor: string }>();

  const vendors = (rows.results ?? [])
    .map((r) => r.vendor)
    .filter((v): v is "zoom" | "ringcentral" =>
      v === "zoom" || v === "ringcentral"
    );

  return vendors.length > 0 ? vendors : ["zoom", "ringcentral"];
}

// ── Route ─────────────────────────────────────────────────────────────────────

app.get("/status", async (c) => {
  const { user, role } = c.get("auth");
  const kv = c.env.KV;
  const db = c.env.DB;

  const vendors = await vendorsForUser(db, user.id, role);

  const [zoom, ringcentral] = await Promise.all([
    vendors.includes("zoom")
      ? getCached(kv, "status:zoom", "https://status.zoom.us/api/v2/components.json", ZOOM_MAP)
      : Promise.resolve(null),
    vendors.includes("ringcentral")
      ? getCached(kv, "status:rc", "https://status.ringcentral.com/api/v2/components.json", RC_MAP)
      : Promise.resolve(null),
  ]);

  return c.json({ vendors, zoom, ringcentral } satisfies SystemStatusResponse);
});

export default app;
