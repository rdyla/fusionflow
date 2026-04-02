import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { getTeamUserIds, inPlaceholders } from "../lib/teamUtils";
import { enrichOrganizationWithError, searchContacts, detectProviders, scoreProspect } from "../services/apolloService";
import { generateProspectContent } from "../services/aiProspectingService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("*", requireRole("admin", "executive", "pf_ae", "partner_ae"));

// ── Helpers ────────────────────────────────────────────────────────────────

async function getVisibleOwnerIds(userId: string, role: string, db: D1Database): Promise<string[] | null> {
  if (role === "admin") return null; // null = all
  if (role === "executive" || role === "partner_ae") return getTeamUserIds(userId, db);
  return [userId];
}

function tryParseJson(val: string | null | undefined, fallback: unknown): unknown {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

// ── Enrichment background job ──────────────────────────────────────────────

async function enrichListInBackground(
  db: D1Database,
  listId: string,
  prospects: Array<{ id: string; domain: string }>,
  apolloKey: string
): Promise<void> {
  let enrichedCount = 0;

  for (const prospect of prospects) {
    try {
      const enrichResult = await enrichOrganizationWithError(prospect.domain, apolloKey);

      if (!enrichResult.org) {
        await db
          .prepare(`UPDATE prospects SET enrichment_status = 'failed', notes = ?, updated_at = datetime('now') WHERE id = ?`)
          .bind(enrichResult.error ?? "Apollo returned no data", prospect.id)
          .run();
        continue;
      }

      const org = enrichResult.org;

      const { ucProvider, ccProvider } = detectProviders(org.technologies);
      const { score, tier } = scoreProspect({
        employeeCount: org.employeeCount,
        industry: org.industry,
        technologies: org.technologies,
        ucProvider,
        ccProvider,
        hasDescription: !!org.description,
      });

      await db
        .prepare(`
          UPDATE prospects SET
            company_name = ?, industry = ?, employee_count = ?,
            annual_revenue_printed = ?, description = ?,
            city = ?, state = ?, country = ?, founded_year = ?,
            website_url = ?, linkedin_url = ?, logo_url = ?,
            technologies = ?, uc_provider = ?, cc_provider = ?,
            score = ?, tier = ?, apollo_org_id = ?,
            enrichment_status = 'enriched', updated_at = datetime('now')
          WHERE id = ?
        `)
        .bind(
          org.name, org.industry, org.employeeCount,
          org.annualRevenuePrinted, org.description,
          org.city, org.state, org.country, org.foundedYear,
          org.websiteUrl, org.linkedinUrl, org.logoUrl,
          JSON.stringify(org.technologies), ucProvider, ccProvider,
          score, tier, org.id,
          prospect.id
        )
        .run();

      // Fetch and store contacts
      const contacts = await searchContacts(prospect.domain, apolloKey);
      for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i];
        const seniority = c.seniority ?? "";
        const isTop = i < 3 || ["c_suite", "vp", "director"].includes(seniority) ? 1 : 0;
        await db
          .prepare(`
            INSERT OR IGNORE INTO prospect_contacts
              (id, prospect_id, apollo_id, first_name, last_name, title, email, phone, linkedin_url, seniority, is_top_contact)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            crypto.randomUUID(), prospect.id, c.id,
            c.firstName, c.lastName, c.title,
            c.email, c.phone, c.linkedinUrl,
            c.seniority, isTop
          )
          .run();
      }

      enrichedCount++;
      await db
        .prepare(`UPDATE prospect_lists SET enriched_count = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(enrichedCount, listId)
        .run();
    } catch {
      // Continue on error — don't let one bad domain halt the batch
    }
  }

  await db
    .prepare(`UPDATE prospect_lists SET status = 'ready', updated_at = datetime('now') WHERE id = ?`)
    .bind(listId)
    .run();
}

// ── Debug ──────────────────────────────────────────────────────────────────

// GET /debug/apollo?domain=xxx  (admin only — returns raw Apollo response)
app.get("/debug/apollo", async (c) => {
  const { role } = c.get("auth");
  if (role !== "admin") throw new HTTPException(403, { message: "Admin only" });

  const domain = c.req.query("domain");
  if (!domain) throw new HTTPException(400, { message: "domain param required" });

  const apiKey = c.env.APOLLO_API_KEY;
  if (!apiKey) return c.json({ error: "APOLLO_API_KEY not set" }, 503);

  const url = `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`;

  try {
    const res = await fetch(url, { headers: { "X-Api-Key": apiKey, "Cache-Control": "no-cache" } });
    const body = await res.json();
    return c.json({ status: res.status, ok: res.ok, url, body });
  } catch (e) {
    return c.json({ error: String(e), url });
  }
});

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /lists
app.get("/lists", async (c) => {
  const { user, role } = c.get("auth");
  const db = c.env.DB;
  const ownerIds = await getVisibleOwnerIds(user.id, role, db);

  let rows;
  if (ownerIds === null) {
    rows = await db
      .prepare(`
        SELECT pl.*,
          u1.name AS owner_name, u1.email AS owner_email, u1.organization_name AS owner_org,
          u2.name AS created_by_name
        FROM prospect_lists pl
        LEFT JOIN users u1 ON u1.id = pl.owner_id
        LEFT JOIN users u2 ON u2.id = pl.created_by_id
        ORDER BY pl.created_at DESC
      `)
      .all();
  } else {
    rows = await db
      .prepare(`
        SELECT pl.*,
          u1.name AS owner_name, u1.email AS owner_email, u1.organization_name AS owner_org,
          u2.name AS created_by_name
        FROM prospect_lists pl
        LEFT JOIN users u1 ON u1.id = pl.owner_id
        LEFT JOIN users u2 ON u2.id = pl.created_by_id
        WHERE pl.owner_id IN (${inPlaceholders(ownerIds)})
        ORDER BY pl.created_at DESC
      `)
      .bind(...ownerIds)
      .all();
  }

  return c.json(rows.results ?? []);
});

// GET /assignable-users — users this caller can assign lists to
app.get("/assignable-users", async (c) => {
  const { user, role } = c.get("auth");
  const db = c.env.DB;

  if (role === "admin") {
    const rows = await db
      .prepare(`SELECT id, name, email, organization_name FROM users WHERE role IN ('pf_ae', 'partner_ae', 'executive') AND is_active = 1 ORDER BY name`)
      .all<{ id: string; name: string | null; email: string; organization_name: string | null }>();
    return c.json(rows.results ?? []);
  }

  if (role === "executive" || role === "partner_ae") {
    const rows = await db
      .prepare(`SELECT id, name, email, organization_name FROM users WHERE manager_id = ? AND is_active = 1 ORDER BY name`)
      .bind(user.id)
      .all<{ id: string; name: string | null; email: string; organization_name: string | null }>();
    return c.json(rows.results ?? []);
  }

  return c.json([]);
});

// POST /lists — create list + start enrichment
const createListSchema = z.object({
  name: z.string().min(1).max(200),
  owner_id: z.string().optional(),
  domains: z.array(z.string().min(1)).min(1).max(200),
});

app.post("/lists", async (c) => {
  const { user, role } = c.get("auth");
  const db = c.env.DB;
  const body = await c.req.json();
  const parsed = createListSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { name, domains, owner_id } = parsed.data;

  // Validate owner
  let ownerId = user.id;
  if (owner_id && owner_id !== user.id) {
    if (role === "admin") {
      ownerId = owner_id;
    } else if (role === "executive" || role === "partner_ae") {
      const isReport = await db
        .prepare(`SELECT id FROM users WHERE id = ? AND manager_id = ? AND is_active = 1`)
        .bind(owner_id, user.id)
        .first();
      if (!isReport) throw new HTTPException(403, { message: "Cannot assign to this user" });
      ownerId = owner_id;
    } else {
      throw new HTTPException(403, { message: "Cannot assign to another user" });
    }
  }

  // Normalize and dedupe domains
  const cleanDomains = [...new Set(
    domains
      .map(d => d.trim().toLowerCase()
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/\/.*$/, "")
      )
      .filter(d => d.length > 3 && d.includes("."))
  )].slice(0, 200);

  if (cleanDomains.length === 0) throw new HTTPException(400, { message: "No valid domains provided" });

  const listId = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO prospect_lists (id, name, owner_id, created_by_id, domain_count, status) VALUES (?, ?, ?, ?, ?, 'enriching')`)
    .bind(listId, name, ownerId, user.id, cleanDomains.length)
    .run();

  const prospectRows = cleanDomains.map(domain => ({ id: crypto.randomUUID(), domain }));
  for (const p of prospectRows) {
    await db
      .prepare(`INSERT INTO prospects (id, list_id, domain) VALUES (?, ?, ?)`)
      .bind(p.id, listId, p.domain)
      .run();
  }

  const apolloKey = c.env.APOLLO_API_KEY;
  if (apolloKey) {
    c.executionCtx.waitUntil(
      enrichListInBackground(db, listId, prospectRows, apolloKey)
    );
  } else {
    await db.prepare(`UPDATE prospect_lists SET status = 'ready' WHERE id = ?`).bind(listId).run();
  }

  const list = await db.prepare(`SELECT * FROM prospect_lists WHERE id = ?`).bind(listId).first();
  return c.json(list, 201);
});

// GET /lists/:id — list with all prospects
app.get("/lists/:id", async (c) => {
  const { user, role } = c.get("auth");
  const db = c.env.DB;
  const listId = c.req.param("id");

  const list = await db
    .prepare(`
      SELECT pl.*, u1.name AS owner_name, u1.email AS owner_email, u1.organization_name AS owner_org
      FROM prospect_lists pl
      LEFT JOIN users u1 ON u1.id = pl.owner_id
      WHERE pl.id = ?
    `)
    .bind(listId)
    .first<Record<string, unknown>>();

  if (!list) throw new HTTPException(404, { message: "List not found" });

  if (role !== "admin") {
    const ownerIds = await getVisibleOwnerIds(user.id, role, db);
    if (ownerIds && !ownerIds.includes(list.owner_id as string)) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
  }

  const prospects = await db
    .prepare(`SELECT * FROM prospects WHERE list_id = ? ORDER BY score DESC NULLS LAST, company_name ASC`)
    .bind(listId)
    .all<Record<string, unknown>>();

  return c.json({
    list,
    prospects: (prospects.results ?? []).map(p => ({
      ...p,
      technologies: tryParseJson(p.technologies as string | null, []),
    })),
  });
});

// DELETE /lists/:id
app.delete("/lists/:id", async (c) => {
  const { user, role } = c.get("auth");
  const db = c.env.DB;
  const listId = c.req.param("id");

  const list = await db
    .prepare(`SELECT owner_id FROM prospect_lists WHERE id = ?`)
    .bind(listId)
    .first<{ owner_id: string }>();
  if (!list) throw new HTTPException(404, { message: "Not found" });

  if (role !== "admin") {
    if (list.owner_id !== user.id) {
      if (role === "executive" || role === "partner_ae") {
        const teamIds = await getTeamUserIds(user.id, db);
        if (!teamIds.includes(list.owner_id)) throw new HTTPException(403, { message: "Forbidden" });
      } else {
        throw new HTTPException(403, { message: "Forbidden" });
      }
    }
  }

  await db.prepare(`DELETE FROM prospect_lists WHERE id = ?`).bind(listId).run();
  return c.json({ ok: true });
});

// GET /prospects/:id
app.get("/prospects/:id", async (c) => {
  const { user, role } = c.get("auth");
  const db = c.env.DB;
  const prospectId = c.req.param("id");

  const row = await db
    .prepare(`
      SELECT p.*, pl.owner_id
      FROM prospects p
      JOIN prospect_lists pl ON pl.id = p.list_id
      WHERE p.id = ?
    `)
    .bind(prospectId)
    .first<Record<string, unknown>>();

  if (!row) throw new HTTPException(404, { message: "Not found" });

  if (role !== "admin") {
    const ownerIds = await getVisibleOwnerIds(user.id, role, db);
    if (ownerIds && !ownerIds.includes(row.owner_id as string)) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
  }

  return c.json({ ...row, technologies: tryParseJson(row.technologies as string | null, []) });
});

// GET /prospects/:id/contacts
app.get("/prospects/:id/contacts", async (c) => {
  const { user, role } = c.get("auth");
  const db = c.env.DB;
  const prospectId = c.req.param("id");

  const prospect = await db
    .prepare(`SELECT p.id, pl.owner_id FROM prospects p JOIN prospect_lists pl ON pl.id = p.list_id WHERE p.id = ?`)
    .bind(prospectId)
    .first<{ id: string; owner_id: string }>();

  if (!prospect) throw new HTTPException(404, { message: "Not found" });

  if (role !== "admin") {
    const ownerIds = await getVisibleOwnerIds(user.id, role, db);
    if (ownerIds && !ownerIds.includes(prospect.owner_id)) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
  }

  const contacts = await db
    .prepare(`SELECT * FROM prospect_contacts WHERE prospect_id = ? ORDER BY is_top_contact DESC, seniority ASC`)
    .bind(prospectId)
    .all<Record<string, unknown>>();

  return c.json(contacts.results ?? []);
});

// POST /prospects/:id/generate — trigger Claude AI content generation
app.post("/prospects/:id/generate", async (c) => {
  const { user, role } = c.get("auth");
  const db = c.env.DB;
  const prospectId = c.req.param("id");
  const apiKey = c.env.ANTHROPIC_API_KEY;

  if (!apiKey) throw new HTTPException(503, { message: "AI generation not configured — add ANTHROPIC_API_KEY secret" });

  const row = await db
    .prepare(`
      SELECT p.*, pl.owner_id
      FROM prospects p
      JOIN prospect_lists pl ON pl.id = p.list_id
      WHERE p.id = ?
    `)
    .bind(prospectId)
    .first<Record<string, unknown>>();

  if (!row) throw new HTTPException(404, { message: "Not found" });

  if (role !== "admin") {
    const ownerIds = await getVisibleOwnerIds(user.id, role, db);
    if (ownerIds && !ownerIds.includes(row.owner_id as string)) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
  }

  await db
    .prepare(`UPDATE prospects SET ai_status = 'generating', updated_at = datetime('now') WHERE id = ?`)
    .bind(prospectId)
    .run();

  const technologies = tryParseJson(row.technologies as string | null, []) as string[];
  const location = [row.city, row.state, row.country].filter(Boolean).join(", ") || null;

  c.executionCtx.waitUntil((async () => {
    const content = await generateProspectContent({
      companyName: (row.company_name as string) ?? (row.domain as string),
      domain: row.domain as string,
      industry: row.industry as string | null,
      employeeCount: row.employee_count as number | null,
      location,
      description: row.description as string | null,
      technologies,
      ucProvider: row.uc_provider as string | null,
      ccProvider: row.cc_provider as string | null,
      annualRevenue: row.annual_revenue_printed as string | null,
    }, apiKey);

    if (content) {
      await db
        .prepare(`
          UPDATE prospects SET
            why_now = ?, company_challenges = ?, proposed_solution = ?,
            store_rationale = ?, email_sequence = ?, talk_track = ?,
            linkedin_inmail = ?, ai_status = 'ready', updated_at = datetime('now')
          WHERE id = ?
        `)
        .bind(
          content.whyNow, content.companyChallenges, content.proposedSolution,
          content.storeRationale, content.emailSequence, content.talkTrack,
          content.linkedinInmail, prospectId
        )
        .run();
    } else {
      await db
        .prepare(`UPDATE prospects SET ai_status = 'failed', updated_at = datetime('now') WHERE id = ?`)
        .bind(prospectId)
        .run();
    }
  })());

  return c.json({ ok: true, status: "generating" });
});

// PATCH /prospects/:id — update notes or manual tier override
const patchProspectSchema = z.object({
  notes: z.string().max(2000).optional(),
  tier: z.enum(["hot", "warm", "cold"]).optional(),
});

app.patch("/prospects/:id", async (c) => {
  const { user, role } = c.get("auth");
  const db = c.env.DB;
  const prospectId = c.req.param("id");
  const body = await c.req.json();
  const parsed = patchProspectSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid body" });

  const prospect = await db
    .prepare(`SELECT p.id, pl.owner_id FROM prospects p JOIN prospect_lists pl ON pl.id = p.list_id WHERE p.id = ?`)
    .bind(prospectId)
    .first<{ id: string; owner_id: string }>();

  if (!prospect) throw new HTTPException(404, { message: "Not found" });

  if (role !== "admin") {
    const ownerIds = await getVisibleOwnerIds(user.id, role, db);
    if (ownerIds && !ownerIds.includes(prospect.owner_id)) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
  }

  const updates: string[] = ["updated_at = datetime('now')"];
  const values: unknown[] = [];
  if (parsed.data.notes !== undefined) { updates.unshift("notes = ?"); values.push(parsed.data.notes); }
  if (parsed.data.tier !== undefined) { updates.unshift("tier = ?"); values.push(parsed.data.tier); }
  values.push(prospectId);

  await db.prepare(`UPDATE prospects SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

export default app;
