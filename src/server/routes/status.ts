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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Zoom (Atlassian Statuspage) ───────────────────────────────────────────────
// status.zoom.us/api/v2/components.json
// Returns { components: [{ name, status, group, group_id }] }

const ZOOM_MAP: { keywords: string[]; label: string }[] = [
  { keywords: ["meetings"],                       label: "Meetings"       },
  { keywords: ["phone"],                          label: "Phone"          },
  { keywords: ["contact center"],                 label: "Contact Center" },
  { keywords: ["ai companion"],                   label: "AI Companion"   },
  { keywords: ["virtual agent", "zva"],           label: "Virtual Agent"  },
  { keywords: ["team chat"],                      label: "Team Chat"      },
  { keywords: ["authentication", "login", "sso"], label: "Authentication" },
];

function zoomLabelFor(name: string): string | null {
  const lower = name.toLowerCase();
  for (const { keywords, label } of ZOOM_MAP) {
    if (keywords.some((k) => lower.includes(k))) return label;
  }
  return null;
}

async function fetchZoomStatus(): Promise<VendorStatus> {
  const res = await fetch("https://status.zoom.us/api/v2/components.json", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Zoom HTTP ${res.status}`);

  const data = (await res.json()) as {
    components: { name: string; status: string; group?: boolean }[];
  };

  const components: StatusComponent[] = [];
  const seen = new Set<string>();

  for (const c of data.components ?? []) {
    if (c.group) continue;
    const label = zoomLabelFor(c.name);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    components.push({ name: c.name, label, status: c.status as RawStatus });
  }

  return { overall: deriveOverall(components), components, fetched_at: Date.now() };
}

// ── RingCentral (custom status API) ──────────────────────────────────────────
// status.ringcentral.com/status.json
// Returns array of { category, service, region, level, alerts }
// One row per service × region — we take worst level across all regions per service,
// then consolidate services into business-friendly groups.

type RcRow = { category: string; service: string; region: string; level: string; alerts: unknown[] };

// Map RC "level" strings → our RawStatus
function rcLevelToStatus(level: string): RawStatus {
  switch (level.toLowerCase()) {
    case "good":           return "operational";
    case "degraded":
    case "slow":
    case "impacted":       return "degraded_performance";
    case "outage":
    case "major outage":   return "major_outage";
    case "partial outage": return "partial_outage";
    case "maintenance":
    case "under maintenance":
    case "scheduled":      return "under_maintenance";
    default:               return "degraded_performance"; // safe fallback
  }
}

// Ordered list of business groups: each maps keyword substrings (lowercase) against
// the service name. First match wins. Services not matched are grouped into "Other".
const RC_GROUPS: { label: string; keywords: string[] }[] = [
  { label: "Calling",          keywords: ["calling", "phones", "deskphone", "softphone"] },
  { label: "Contact Center",   keywords: ["contact center", "ringcx", "engage digital"] },
  { label: "AI Features",      keywords: ["ai conversation", "ai receptionist", "ace"] },
  { label: "Messaging",        keywords: ["messaging", "sms"] },
  { label: "Video & Events",   keywords: ["video", "events", "webinar"] },
  { label: "Analytics",        keywords: ["analytics"] },
  { label: "Fax",              keywords: ["fax"] },
  { label: "Connect Platform", keywords: ["connect platform"] },
];

function rcGroupFor(serviceName: string): string {
  const lower = serviceName.toLowerCase();
  for (const { label, keywords } of RC_GROUPS) {
    if (keywords.some((k) => lower.includes(k))) return label;
  }
  return "Other";
}

// Status rank — higher = worse
const STATUS_RANK: Record<RawStatus, number> = {
  operational: 0,
  under_maintenance: 1,
  degraded_performance: 2,
  partial_outage: 3,
  major_outage: 4,
};

async function fetchRCStatus(): Promise<VendorStatus> {
  const res = await fetch("https://status.ringcentral.com/status.json", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`RingCentral HTTP ${res.status}`);

  const rows = (await res.json()) as RcRow[];

  // Step 1: per service, find worst level across all regions
  const serviceWorst = new Map<string, RawStatus>();
  for (const row of rows) {
    const st = rcLevelToStatus(row.level);
    const existing = serviceWorst.get(row.service);
    if (!existing || STATUS_RANK[st] > STATUS_RANK[existing]) {
      serviceWorst.set(row.service, st);
    }
  }

  // Step 2: per business group, find worst status across all its services
  const groupWorst = new Map<string, RawStatus>();
  for (const [service, status] of serviceWorst) {
    const group = rcGroupFor(service);
    const existing = groupWorst.get(group);
    if (!existing || STATUS_RANK[status] > STATUS_RANK[existing]) {
      groupWorst.set(group, status);
    }
  }

  // Step 3: emit components in defined group order, skip "Other" if empty
  const components: StatusComponent[] = [];
  for (const { label } of RC_GROUPS) {
    const status = groupWorst.get(label);
    if (!status) continue; // no services matched this group
    components.push({ name: label, label, status });
  }
  const otherStatus = groupWorst.get("Other");
  if (otherStatus) {
    components.push({ name: "Other", label: "Other", status: otherStatus });
  }

  return { overall: deriveOverall(components), components, fetched_at: Date.now() };
}

// ── KV caching wrapper ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 300_000;
const KV_TTL_S = 360;

async function getCached(
  kv: KVNamespace,
  kvKey: string,
  fetcher: () => Promise<VendorStatus>
): Promise<VendorStatus> {
  const cached = await kv.get<VendorStatus>(kvKey, "json");
  if (cached && Date.now() - cached.fetched_at < CACHE_TTL_MS) return cached;

  try {
    const fresh = await fetcher();
    await kv.put(kvKey, JSON.stringify(fresh), { expirationTtl: KV_TTL_S });
    return fresh;
  } catch {
    return cached ?? { overall: "operational", components: [], fetched_at: Date.now() };
  }
}

// ── Contextual vendor selection ───────────────────────────────────────────────

const PF_ROLES = new Set(["admin", "pm", "pf_ae", "pf_sa", "pf_csm", "partner_ae"]);

async function vendorsForUser(
  db: D1Database,
  userId: string,
  role: string
): Promise<("zoom" | "ringcentral")[]> {
  if (PF_ROLES.has(role)) return ["zoom", "ringcentral"];

  const rows = await db
    .prepare(
      `SELECT DISTINCT vendor
       FROM projects
       WHERE vendor IS NOT NULL
         AND (archived = 0 OR archived IS NULL)
         AND (
           pm_user_id = ?
           OR customer_id IN (SELECT id FROM customers WHERE pf_ae_user_id = ?)
           OR id IN (SELECT project_id FROM project_access WHERE user_id = ?)
         )`
    )
    .bind(userId, userId, userId)
    .all<{ vendor: string }>();

  const vendors = (rows.results ?? [])
    .map((r) => r.vendor)
    .filter((v): v is "zoom" | "ringcentral" => v === "zoom" || v === "ringcentral");

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
      ? getCached(kv, "status:zoom", fetchZoomStatus)
      : Promise.resolve(null),
    vendors.includes("ringcentral")
      ? getCached(kv, "status:rc", fetchRCStatus)
      : Promise.resolve(null),
  ]);

  return c.json({ vendors, zoom, ringcentral } satisfies SystemStatusResponse);
});

export default app;
