import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../types/index";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

import type { AuthContext } from "../types/index";

// ── Permission helpers ────────────────────────────────────────────────────────

type CsPerm = "none" | "user" | "power_user";

function csPerm(auth: AuthContext): CsPerm {
  if (auth.role === "admin") return "power_user";
  return (auth.user.cs_permission ?? "none") as CsPerm;
}

function canAccess(auth: AuthContext) { return csPerm(auth) !== "none"; }
function canSeeAll(auth: AuthContext) { return csPerm(auth) === "power_user"; }
function canEditProposal(auth: AuthContext, creatorId: string) {
  return csPerm(auth) === "power_user" || auth.user.id === creatorId;
}
function canDeleteProposal(auth: AuthContext, creatorId: string) {
  return csPerm(auth) === "power_user" || auth.user.id === creatorId;
}

// ── List all proposals ────────────────────────────────────────────────────────

app.get("/", async (c) => {
  const auth = c.get("auth");
  if (!canAccess(auth)) return c.json({ error: "Forbidden" }, 403);

  const seeAll = canSeeAll(auth);

  const baseSelect = `
      SELECT p.id, p.name, p.creator_id, p.created_at, p.updated_at,
        p.customer_id, COALESCE(cust.name, p.customer_name) as customer_name,
        u.name as creator_name, u.email as creator_email,
        (SELECT COUNT(*) FROM cs_versions v WHERE v.proposal_id = p.id) as version_count,
        (SELECT v2.calc_result FROM cs_versions v2 WHERE v2.proposal_id = p.id ORDER BY v2.version_num DESC LIMIT 1) as latest_calc
      FROM cs_proposals p
      LEFT JOIN users u ON u.id = p.creator_id
      LEFT JOIN customers cust ON cust.id = p.customer_id`;

  const stmt = seeAll
    ? c.env.DB.prepare(`${baseSelect} ORDER BY p.updated_at DESC`)
    : c.env.DB.prepare(`${baseSelect} WHERE p.creator_id = ? ORDER BY p.updated_at DESC`).bind(auth.user.id);

  const rows = await stmt
    .all<{
      id: string; name: string; creator_id: string; created_at: string; updated_at: string;
      customer_id: string | null; customer_name: string | null;
      creator_name: string | null; creator_email: string | null;
      version_count: number; latest_calc: string | null;
    }>();

  const proposals = (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    creatorId: r.creator_id,
    creatorName: r.creator_name ?? r.creator_email ?? "Unknown",
    customerId: r.customer_id,
    customerName: r.customer_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    versionCount: r.version_count,
    latestCalc: r.latest_calc ? JSON.parse(r.latest_calc) : null,
  }));

  return c.json(proposals);
});

// ── Create a proposal ─────────────────────────────────────────────────────────

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  // Optional CRM-linked customer. If only customerId is given we look up the
  // name; if only customerName is given (free-text fallback) we store it
  // as-is with no FK. Both null/missing = pricing exercise without a
  // customer attached.
  customerId: z.string().nullable().optional(),
  customerName: z.string().max(500).nullable().optional(),
});

// Resolves a customer ref → { id, name } pair. Returns nulls when neither
// arg gives us anything useful. Looks up the customer name when only id is
// supplied so the cached column stays accurate.
async function resolveCustomerRef(
  db: D1Database,
  customerId: string | null | undefined,
  customerName: string | null | undefined,
): Promise<{ id: string | null; name: string | null }> {
  const trimmedName = customerName?.trim() || null;
  if (customerId) {
    const row = await db
      .prepare("SELECT name FROM customers WHERE id = ? LIMIT 1")
      .bind(customerId)
      .first<{ name: string }>();
    if (!row) return { id: null, name: trimmedName };
    return { id: customerId, name: row.name };
  }
  return { id: null, name: trimmedName };
}

app.post("/", async (c) => {
  const auth = c.get("auth");
  if (!canAccess(auth)) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "name is required" }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const cust = await resolveCustomerRef(c.env.DB, parsed.data.customerId, parsed.data.customerName);

  await c.env.DB
    .prepare("INSERT INTO cs_proposals (id, name, creator_id, customer_id, customer_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, parsed.data.name.trim(), auth.user.id, cust.id, cust.name, now, now)
    .run();

  return c.json({
    id,
    name: parsed.data.name.trim(),
    creatorId: auth.user.id,
    customerId: cust.id,
    customerName: cust.name,
    createdAt: now,
    updatedAt: now,
    versionCount: 0,
    latestCalc: null,
  });
});

// ── Get a single proposal with all versions ───────────────────────────────────

app.get("/:id", async (c) => {
  const auth = c.get("auth");
  if (!canAccess(auth)) return c.json({ error: "Forbidden" }, 403);

  const { id } = c.req.param();

  const proposal = await c.env.DB
    .prepare(`
      SELECT p.id, p.name, p.creator_id, p.created_at, p.updated_at,
        p.customer_id, COALESCE(cust.name, p.customer_name) as customer_name,
        u.name as creator_name, u.email as creator_email
      FROM cs_proposals p
      LEFT JOIN users u ON u.id = p.creator_id
      LEFT JOIN customers cust ON cust.id = p.customer_id
      WHERE p.id = ?
    `)
    .bind(id)
    .first<{ id: string; name: string; creator_id: string; created_at: string; updated_at: string; customer_id: string | null; customer_name: string | null; creator_name: string | null; creator_email: string | null }>();

  if (!proposal) return c.json({ error: "Not found" }, 404);
  // Users can only access their own proposals
  if (!canSeeAll(auth) && proposal.creator_id !== auth.user.id) return c.json({ error: "Forbidden" }, 403);

  const versions = await c.env.DB
    .prepare(`
      SELECT v.id, v.version_num, v.label, v.form_data, v.calc_result, v.created_at,
        u.name as created_by_name, u.email as created_by_email
      FROM cs_versions v
      LEFT JOIN users u ON u.id = v.created_by_id
      WHERE v.proposal_id = ?
      ORDER BY v.version_num ASC
    `)
    .bind(id)
    .all<{ id: string; version_num: number; label: string | null; form_data: string; calc_result: string; created_at: string; created_by_name: string | null; created_by_email: string | null }>();

  return c.json({
    id: proposal.id,
    name: proposal.name,
    creatorId: proposal.creator_id,
    creatorName: proposal.creator_name ?? proposal.creator_email ?? "Unknown",
    customerId: proposal.customer_id,
    customerName: proposal.customer_name,
    createdAt: proposal.created_at,
    updatedAt: proposal.updated_at,
    versions: (versions.results ?? []).map((v) => ({
      id: v.id,
      versionNum: v.version_num,
      label: v.label,
      data: JSON.parse(v.form_data),
      calc: JSON.parse(v.calc_result),
      savedAt: v.created_at,
      createdBy: v.created_by_name ?? v.created_by_email ?? "Unknown",
    })),
  });
});

// ── Update a proposal (rename and/or change customer) ─────────────────────────

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  customerId: z.string().nullable().optional(),
  customerName: z.string().max(500).nullable().optional(),
});

app.patch("/:id", async (c) => {
  const auth = c.get("auth");
  if (!canAccess(auth)) return c.json({ error: "Forbidden" }, 403);

  const { id } = c.req.param();
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);

  const proposal = await c.env.DB
    .prepare("SELECT creator_id FROM cs_proposals WHERE id = ?")
    .bind(id)
    .first<{ creator_id: string }>();
  if (!proposal) return c.json({ error: "Not found" }, 404);

  if (!canEditProposal(auth, proposal.creator_id)) return c.json({ error: "Forbidden" }, 403);

  // Build dynamic SET clause from whichever fields the caller sent.
  const sets: string[] = [];
  const binds: (string | null)[] = [];
  if (parsed.data.name !== undefined) {
    sets.push("name = ?");
    binds.push(parsed.data.name.trim());
  }
  if ("customerId" in parsed.data || "customerName" in parsed.data) {
    const cust = await resolveCustomerRef(c.env.DB, parsed.data.customerId, parsed.data.customerName);
    sets.push("customer_id = ?", "customer_name = ?");
    binds.push(cust.id, cust.name);
  }
  if (sets.length === 0) return c.json({ ok: true });

  sets.push("updated_at = ?");
  binds.push(new Date().toISOString());
  binds.push(id);

  await c.env.DB
    .prepare(`UPDATE cs_proposals SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();

  return c.json({ ok: true });
});

// ── Delete a proposal ─────────────────────────────────────────────────────────

app.delete("/:id", async (c) => {
  const auth = c.get("auth");
  if (!canAccess(auth)) return c.json({ error: "Forbidden" }, 403);

  const { id } = c.req.param();
  const proposal = await c.env.DB
    .prepare("SELECT creator_id FROM cs_proposals WHERE id = ?")
    .bind(id)
    .first<{ creator_id: string }>();
  if (!proposal) return c.json({ error: "Not found" }, 404);

  if (!canDeleteProposal(auth, proposal.creator_id)) return c.json({ error: "Forbidden" }, 403);

  await c.env.DB.prepare("DELETE FROM cs_proposals WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// ── Save a version ────────────────────────────────────────────────────────────

const VersionSchema = z.object({
  formData: z.record(z.string(), z.unknown()),
  calcResult: z.record(z.string(), z.unknown()),
  label: z.string().max(100).optional(),
});

app.post("/:id/versions", async (c) => {
  const auth = c.get("auth");
  if (!canAccess(auth)) return c.json({ error: "Forbidden" }, 403);

  const { id } = c.req.param();
  const body = await c.req.json().catch(() => null);
  const parsed = VersionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);

  const proposal = await c.env.DB
    .prepare("SELECT creator_id FROM cs_proposals WHERE id = ?")
    .bind(id)
    .first<{ creator_id: string }>();
  if (!proposal) return c.json({ error: "Not found" }, 404);

  if (!canEditProposal(auth, proposal.creator_id)) return c.json({ error: "Forbidden" }, 403);

  // Get next version number
  const last = await c.env.DB
    .prepare("SELECT MAX(version_num) as max_v FROM cs_versions WHERE proposal_id = ?")
    .bind(id)
    .first<{ max_v: number | null }>();
  const nextNum = (last?.max_v ?? 0) + 1;

  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB
    .prepare("INSERT INTO cs_versions (id, proposal_id, version_num, label, form_data, calc_result, created_by_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(versionId, id, nextNum, parsed.data.label ?? null, JSON.stringify(parsed.data.formData), JSON.stringify(parsed.data.calcResult), auth.user.id, now)
    .run();

  // Keep proposal.customer_name in sync with whatever the form currently
  // holds, so the list view reflects the latest saved value (and so old
  // pre-#58 proposals get backfilled on their next save). Doesn't touch
  // customer_id — that's set explicitly via PATCH /:id when a CRM-linked
  // customer is picked.
  const formCustomerName = (parsed.data.formData as { customerName?: unknown }).customerName;
  const cachedName = typeof formCustomerName === "string" && formCustomerName.trim()
    ? formCustomerName.trim()
    : null;

  await c.env.DB
    .prepare("UPDATE cs_proposals SET customer_name = COALESCE(?, customer_name), updated_at = ? WHERE id = ?")
    .bind(cachedName, now, id)
    .run();

  return c.json({ id: versionId, versionNum: nextNum, savedAt: now });
});

export default app;
