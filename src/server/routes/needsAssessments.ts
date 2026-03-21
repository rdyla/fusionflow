import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Readiness model ────────────────────────────────────────────────────────────

const READINESS_DIMENSIONS: {
  id: string;
  weight: number;
  inputs: string[];
}[] = [
  {
    id: "businessClarity",
    weight: 0.2,
    inputs: [
      "business_goals",
      "current_problems_to_solve",
      "success_90_days",
      "success_6_12_months",
      "kpi_baseline_available",
    ],
  },
  {
    id: "technicalReadiness",
    weight: 0.2,
    inputs: [
      "crm_in_use",
      "crm_integration_required_phase_1",
      "other_integrations_required",
      "sandbox_testing_required",
    ],
  },
  {
    id: "crmReadiness",
    weight: 0.2,
    inputs: [
      "crm_objects_that_matter",
      "data_sync_to_crm",
      "data_sync_from_crm",
      "crm_methodology_alignment_required",
      "crm_methodology_fields",
      "crm_admin_owner",
    ],
  },
  {
    id: "methodologyReadiness",
    weight: 0.25,
    inputs: [
      "current_sales_methodology_status",
      "current_methodologies",
      "methodology_elements_to_track",
      "sales_playbook_documented",
    ],
  },
  {
    id: "changeReadiness",
    weight: 0.15,
    inputs: [
      "program_owner_function",
      "platform_admin_owner",
      "executive_sponsor_name",
      "enablement_support_required",
    ],
  },
];

function isNonEmpty(val: unknown): boolean {
  if (val === null || val === undefined || val === "") return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "object") return Object.keys(val as object).length > 0;
  return true;
}

function computeReadiness(answers: Record<string, unknown>): {
  score: number;
  status: string;
} {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const dim of READINESS_DIMENSIONS) {
    const filled = dim.inputs.filter((key) => isNonEmpty(answers[key])).length;
    const dimScore = (filled / dim.inputs.length) * 100;
    weightedSum += dimScore * dim.weight;
    totalWeight += dim.weight;
  }

  const score = Math.round(totalWeight > 0 ? weightedSum / totalWeight : 0);

  let status: string;
  if (score >= 75) status = "ready";
  else if (score >= 50) status = "mostly_ready";
  else if (score >= 25) status = "needs_work";
  else status = "not_ready";

  return { score, status };
}

function parseAnswers(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ── GET /api/solutions/:id/needs-assessment ────────────────────────────────────

app.get("/:id/needs-assessment", async (c) => {
  const auth = c.get("auth");
  if (!auth) throw new HTTPException(401, { message: "Unauthorized" });

  const solutionId = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT * FROM needs_assessments WHERE solution_id = ? LIMIT 1"
  )
    .bind(solutionId)
    .first() as Record<string, unknown> | null;

  if (!row) throw new HTTPException(404, { message: "Needs assessment not found" });

  return c.json({
    ...row,
    answers: parseAnswers(row.answers as string),
  });
});

// ── PUT /api/solutions/:id/needs-assessment ────────────────────────────────────

const upsertSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});

const EDIT_ROLES = ["admin", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer", "partner_ae"] as const;

app.put("/:id/needs-assessment", async (c) => {
  const auth = c.get("auth");
  if (!auth) throw new HTTPException(401, { message: "Unauthorized" });
  if (!EDIT_ROLES.includes(auth.role as typeof EDIT_ROLES[number])) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const solutionId = c.req.param("id");

  // Verify solution exists
  const solution = await c.env.DB.prepare(
    "SELECT id FROM solutions WHERE id = ? LIMIT 1"
  )
    .bind(solutionId)
    .first();
  if (!solution) throw new HTTPException(404, { message: "Solution not found" });

  const parsed = upsertSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { answers } = parsed.data;
  const { score, status } = computeReadiness(answers);

  const existing = await c.env.DB.prepare(
    "SELECT id FROM needs_assessments WHERE solution_id = ? LIMIT 1"
  )
    .bind(solutionId)
    .first();

  if (existing) {
    await c.env.DB.prepare(`
      UPDATE needs_assessments
      SET answers = ?, readiness_score = ?, readiness_status = ?, updated_at = datetime('now')
      WHERE solution_id = ?
    `)
      .bind(JSON.stringify(answers), score, status, solutionId)
      .run();
  } else {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO needs_assessments (id, solution_id, survey_id, answers, readiness_score, readiness_status)
      VALUES (?, ?, 'ci_needs_assessment_unified_v1', ?, ?, ?)
    `)
      .bind(id, solutionId, JSON.stringify(answers), score, status)
      .run();
  }

  const row = await c.env.DB.prepare(
    "SELECT * FROM needs_assessments WHERE solution_id = ? LIMIT 1"
  )
    .bind(solutionId)
    .first() as Record<string, unknown> | null;

  if (!row) throw new HTTPException(500, { message: "Failed to retrieve assessment" });

  return c.json({
    ...row,
    answers: parseAnswers(row.answers as string),
  });
});

// ── DELETE /api/solutions/:id/needs-assessment ─────────────────────────────────

app.delete("/:id/needs-assessment", async (c) => {
  const auth = c.get("auth");
  if (!auth) throw new HTTPException(401, { message: "Unauthorized" });
  if (!EDIT_ROLES.includes(auth.role as typeof EDIT_ROLES[number])) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const solutionId = c.req.param("id");
  const existing = await c.env.DB.prepare(
    "SELECT id FROM needs_assessments WHERE solution_id = ? LIMIT 1"
  )
    .bind(solutionId)
    .first();

  if (!existing) throw new HTTPException(404, { message: "Needs assessment not found" });

  await c.env.DB.prepare("DELETE FROM needs_assessments WHERE solution_id = ?")
    .bind(solutionId)
    .run();

  return c.json({ success: true });
});

export default app;
