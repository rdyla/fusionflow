import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../types/index";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Only internal (non-client) staff can access the calculator
function requireInternal(role: string) {
  return role !== "client";
}

// ── List all proposals ────────────────────────────────────────────────────────

app.get("/", async (c) => {
  const auth = c.get("auth");
  if (!requireInternal(auth.role)) return c.json({ error: "Forbidden" }, 403);

  const rows = await c.env.DB
    .prepare(`
      SELECT p.id, p.name, p.creator_id, p.created_at, p.updated_at,
        u.name as creator_name, u.email as creator_email,
        (SELECT COUNT(*) FROM cs_versions v WHERE v.proposal_id = p.id) as version_count,
        (SELECT v2.calc_result FROM cs_versions v2 WHERE v2.proposal_id = p.id ORDER BY v2.version_num DESC LIMIT 1) as latest_calc
      FROM cs_proposals p
      LEFT JOIN users u ON u.id = p.creator_id
      ORDER BY p.updated_at DESC
    `)
    .all<{
      id: string; name: string; creator_id: string; created_at: string; updated_at: string;
      creator_name: string | null; creator_email: string | null;
      version_count: number; latest_calc: string | null;
    }>();

  const proposals = (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    creatorId: r.creator_id,
    creatorName: r.creator_name ?? r.creator_email ?? "Unknown",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    versionCount: r.version_count,
    latestCalc: r.latest_calc ? JSON.parse(r.latest_calc) : null,
  }));

  return c.json(proposals);
});

// ── Create a proposal ─────────────────────────────────────────────────────────

const CreateSchema = z.object({ name: z.string().min(1).max(200) });

app.post("/", async (c) => {
  const auth = c.get("auth");
  if (!requireInternal(auth.role)) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "name is required" }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB
    .prepare("INSERT INTO cs_proposals (id, name, creator_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, parsed.data.name.trim(), auth.user.id, now, now)
    .run();

  return c.json({ id, name: parsed.data.name.trim(), creatorId: auth.user.id, createdAt: now, updatedAt: now, versionCount: 0, latestCalc: null });
});

// ── Get a single proposal with all versions ───────────────────────────────────

app.get("/:id", async (c) => {
  const auth = c.get("auth");
  if (!requireInternal(auth.role)) return c.json({ error: "Forbidden" }, 403);

  const { id } = c.req.param();

  const proposal = await c.env.DB
    .prepare(`
      SELECT p.id, p.name, p.creator_id, p.created_at, p.updated_at,
        u.name as creator_name, u.email as creator_email
      FROM cs_proposals p
      LEFT JOIN users u ON u.id = p.creator_id
      WHERE p.id = ?
    `)
    .bind(id)
    .first<{ id: string; name: string; creator_id: string; created_at: string; updated_at: string; creator_name: string | null; creator_email: string | null }>();

  if (!proposal) return c.json({ error: "Not found" }, 404);

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

// ── Rename a proposal ─────────────────────────────────────────────────────────

app.patch("/:id", async (c) => {
  const auth = c.get("auth");
  if (!requireInternal(auth.role)) return c.json({ error: "Forbidden" }, 403);

  const { id } = c.req.param();
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "name is required" }, 400);

  const proposal = await c.env.DB
    .prepare("SELECT creator_id FROM cs_proposals WHERE id = ?")
    .bind(id)
    .first<{ creator_id: string }>();
  if (!proposal) return c.json({ error: "Not found" }, 404);

  // Allow creator, admin, or pf_sa to rename
  const canEdit = auth.role === "admin" || auth.role === "pf_sa" || proposal.creator_id === auth.user.id;
  if (!canEdit) return c.json({ error: "Forbidden" }, 403);

  await c.env.DB
    .prepare("UPDATE cs_proposals SET name = ?, updated_at = ? WHERE id = ?")
    .bind(parsed.data.name.trim(), new Date().toISOString(), id)
    .run();

  return c.json({ ok: true });
});

// ── Delete a proposal ─────────────────────────────────────────────────────────

app.delete("/:id", async (c) => {
  const auth = c.get("auth");
  if (!requireInternal(auth.role)) return c.json({ error: "Forbidden" }, 403);

  const { id } = c.req.param();
  const proposal = await c.env.DB
    .prepare("SELECT creator_id FROM cs_proposals WHERE id = ?")
    .bind(id)
    .first<{ creator_id: string }>();
  if (!proposal) return c.json({ error: "Not found" }, 404);

  const canDelete = auth.role === "admin" || proposal.creator_id === auth.user.id;
  if (!canDelete) return c.json({ error: "Forbidden" }, 403);

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
  if (!requireInternal(auth.role)) return c.json({ error: "Forbidden" }, 403);

  const { id } = c.req.param();
  const body = await c.req.json().catch(() => null);
  const parsed = VersionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid payload" }, 400);

  const proposal = await c.env.DB
    .prepare("SELECT creator_id FROM cs_proposals WHERE id = ?")
    .bind(id)
    .first<{ creator_id: string }>();
  if (!proposal) return c.json({ error: "Not found" }, 404);

  const canEdit = auth.role === "admin" || auth.role === "pf_sa" || proposal.creator_id === auth.user.id;
  if (!canEdit) return c.json({ error: "Forbidden" }, 403);

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

  // Update proposal updated_at
  await c.env.DB
    .prepare("UPDATE cs_proposals SET updated_at = ? WHERE id = ?")
    .bind(now, id)
    .run();

  return c.json({ id: versionId, versionNum: nextNum, savedAt: now });
});

export default app;
