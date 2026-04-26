import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { parseSolutionTypes } from "../../shared/solutionTypes";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Readiness model ────────────────────────────────────────────────────────────

type ReadinessDimension = {
  id: string;
  weight: number;
  inputs: string[];
};

const CI_READINESS_DIMENSIONS: ReadinessDimension[] = [
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

const CCAAS_READINESS_DIMENSIONS: ReadinessDimension[] = [
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
    id: "operationalDesignReadiness",
    weight: 0.25,
    inputs: [
      "phase_1_scope_summary",
      "channels_required_phase_1",
      "queue_and_skill_requirements",
      "routing_capabilities_required",
      "agent_desktop_requirements",
    ],
  },
  {
    id: "integrationReadiness",
    weight: 0.2,
    inputs: [
      "crm_in_use",
      "crm_integration_required_phase_1",
      "crm_use_cases_required",
      "other_integrations_required",
      "sandbox_testing_required",
    ],
  },
  {
    id: "workforceQualityReadiness",
    weight: 0.15,
    inputs: [
      "wfm_required",
      "wfm_capabilities_required",
      "qm_required",
      "qm_capabilities_required",
    ],
  },
  {
    id: "complianceReadiness",
    weight: 0.1,
    inputs: [
      "recording_requirements",
      "compliance_needs",
      "retention_requirements",
      "rbac_required",
      "security_review_required",
    ],
  },
  {
    id: "migrationReadiness",
    weight: 0.1,
    inputs: [
      "migration_required",
      "migration_scope",
      "testing_requirements",
      "customer_prerequisites_before_design",
      "signoff_roles",
    ],
  },
];

const VIRTUAL_AGENT_READINESS_DIMENSIONS: ReadinessDimension[] = [
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
    id: "automationScopeReadiness",
    weight: 0.25,
    inputs: [
      "phase_1_scope_summary",
      "channels_required_phase_1",
      "primary_use_cases",
      "top_use_cases_for_phase_1",
      "estimated_intent_count",
      "handoff_to_agent_required",
    ],
  },
  {
    id: "knowledgeReadiness",
    weight: 0.2,
    inputs: [
      "knowledge_source_exists",
      "knowledge_sources_available",
      "content_quality_readiness",
      "customer_content_owner",
      "customer_must_provide_content_inputs",
    ],
  },
  {
    id: "integrationReadiness",
    weight: 0.15,
    inputs: [
      "crm_in_use",
      "integration_use_cases_required",
      "systems_of_record_involved",
      "sandbox_testing_required",
    ],
  },
  {
    id: "governanceReadiness",
    weight: 0.1,
    inputs: [
      "redaction_or_masking_required",
      "retention_requirements_defined",
      "rbac_required",
      "security_review_required",
    ],
  },
  {
    id: "operationalReadiness",
    weight: 0.1,
    inputs: [
      "program_owner_function",
      "named_content_owner_exists",
      "named_integration_owner_exists",
      "testing_requirements",
      "signoff_roles",
    ],
  },
];

const UCAAS_READINESS_DIMENSIONS: ReadinessDimension[] = [
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
    id: "scopeAndDesignReadiness",
    weight: 0.25,
    inputs: [
      "phase_1_scope_summary",
      "sites_or_business_units_in_scope",
      "user_calling_capabilities_required",
      "call_flow_components_required",
      "number_inventory_requirements",
    ],
  },
  {
    id: "technicalReadiness",
    weight: 0.2,
    inputs: [
      "endpoint_types_required",
      "integrations_required",
      "network_readiness_known",
      "sandbox_or_test_environment_required",
    ],
  },
  {
    id: "migrationReadiness",
    weight: 0.2,
    inputs: [
      "migration_required",
      "number_porting_required",
      "migration_scope_summary",
      "cutover_strategy_preference",
      "testing_requirements",
    ],
  },
  {
    id: "operationalReadiness",
    weight: 0.15,
    inputs: [
      "program_owner_function",
      "admin_model",
      "training_required_for_roles",
      "customer_prerequisites_before_design",
      "signoff_roles",
    ],
  },
];

function isNonEmpty(val: unknown): boolean {
  if (val === null || val === undefined || val === "") return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "object") return Object.keys(val as object).length > 0;
  return true;
}

function computeCIReadiness(answers: Record<string, unknown>): {
  score: number;
  status: string;
} {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const dim of CI_READINESS_DIMENSIONS) {
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

function computeCCaaSReadiness(answers: Record<string, unknown>): {
  score: number;
  status: string;
} {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const dim of CCAAS_READINESS_DIMENSIONS) {
    const filled = dim.inputs.filter((key) => isNonEmpty(answers[key])).length;
    const dimScore = (filled / dim.inputs.length) * 100;
    weightedSum += dimScore * dim.weight;
    totalWeight += dim.weight;
  }

  const score = Math.round(totalWeight > 0 ? weightedSum / totalWeight : 0);

  let status: string;
  if (score >= 80) status = "ready";
  else if (score >= 60) status = "conditionally_ready";
  else status = "not_ready";

  return { score, status };
}

function computeUCaaSReadiness(answers: Record<string, unknown>): {
  score: number;
  status: string;
} {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const dim of UCAAS_READINESS_DIMENSIONS) {
    const filled = dim.inputs.filter((key) => isNonEmpty(answers[key])).length;
    const dimScore = (filled / dim.inputs.length) * 100;
    weightedSum += dimScore * dim.weight;
    totalWeight += dim.weight;
  }

  const score = Math.round(totalWeight > 0 ? weightedSum / totalWeight : 0);

  let status: string;
  if (score >= 80) status = "ready";
  else if (score >= 60) status = "conditionally_ready";
  else status = "not_ready";

  return { score, status };
}

function computeVirtualAgentReadiness(answers: Record<string, unknown>): {
  score: number;
  status: string;
} {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const dim of VIRTUAL_AGENT_READINESS_DIMENSIONS) {
    const filled = dim.inputs.filter((key) => isNonEmpty(answers[key])).length;
    const dimScore = (filled / dim.inputs.length) * 100;
    weightedSum += dimScore * dim.weight;
    totalWeight += dim.weight;
  }

  const score = Math.round(totalWeight > 0 ? weightedSum / totalWeight : 0);

  let status: string;
  if (score >= 80) status = "ready";
  else if (score >= 60) status = "conditionally_ready";
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

// ── GET /api/solutions/:id/needs-assessments (list all NAs for a solution) ─────

app.get("/:id/needs-assessments", async (c) => {
  const auth = c.get("auth");
  if (!auth) throw new HTTPException(401, { message: "Unauthorized" });

  const solutionId = c.req.param("id");
  const rows = await c.env.DB.prepare(
    "SELECT * FROM needs_assessments WHERE solution_id = ? ORDER BY solution_type"
  )
    .bind(solutionId)
    .all() as { results?: Record<string, unknown>[] };

  return c.json((rows.results ?? []).map((r) => ({
    ...r,
    answers: parseAnswers(r.answers as string),
  })));
});

// ── GET /api/solutions/:id/needs-assessments/:type ─────────────────────────────

app.get("/:id/needs-assessments/:type", async (c) => {
  const auth = c.get("auth");
  if (!auth) throw new HTTPException(401, { message: "Unauthorized" });

  const solutionId = c.req.param("id");
  const solutionType = c.req.param("type");
  const row = await c.env.DB.prepare(
    "SELECT * FROM needs_assessments WHERE solution_id = ? AND solution_type = ? LIMIT 1"
  )
    .bind(solutionId, solutionType)
    .first() as Record<string, unknown> | null;

  if (!row) throw new HTTPException(404, { message: "Needs assessment not found" });

  return c.json({
    ...row,
    answers: parseAnswers(row.answers as string),
  });
});

// ── PUT /api/solutions/:id/needs-assessments/:type ─────────────────────────────

const upsertSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});

const EDIT_ROLES = ["admin", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer", "partner_ae"] as const;

// Map a solution_type to the (score fn, survey_id) pair used for that type's NA.
function scoreAndSurveyFor(solutionType: string, answers: Record<string, unknown>) {
  if (solutionType === "ucaas") return { ...computeUCaaSReadiness(answers), surveyId: "ucaas_needs_assessment_unified_v1" };
  if (solutionType === "va")    return { ...computeVirtualAgentReadiness(answers), surveyId: "virtual_agent_needs_assessment_unified_v1" };
  if (solutionType === "ccaas") return { ...computeCCaaSReadiness(answers), surveyId: "ccaas_needs_assessment_unified_v1" };
  // ci and anything else fall through to the CI survey — keeps existing behavior for ci/wfm/qm
  // until their own survey JSONs exist.
  return { ...computeCIReadiness(answers), surveyId: "ci_needs_assessment_unified_v1" };
}

app.put("/:id/needs-assessments/:type", async (c) => {
  const auth = c.get("auth");
  if (!auth) throw new HTTPException(401, { message: "Unauthorized" });
  const isClient = auth.role === "client";
  if (!isClient && !EDIT_ROLES.includes(auth.role as typeof EDIT_ROLES[number])) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const solutionId = c.req.param("id");
  const solutionType = c.req.param("type");

  // Verify solution exists + that this type is one of the solution's selected types.
  const solution = await c.env.DB.prepare(
    "SELECT id, solution_types, dynamics_account_id FROM solutions WHERE id = ? LIMIT 1"
  )
    .bind(solutionId)
    .first() as { id: string; solution_types: string; dynamics_account_id: string | null } | null;
  if (!solution) throw new HTTPException(404, { message: "Solution not found" });

  const applicableTypes = parseSolutionTypes(solution.solution_types);
  if (!applicableTypes.includes(solutionType as typeof applicableTypes[number])) {
    throw new HTTPException(400, { message: `Solution is not scoped to solution_type '${solutionType}'` });
  }

  // Clients can only update assessments for their own account's solutions
  if (isClient && solution.dynamics_account_id !== auth.user.dynamics_account_id) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const parsed = upsertSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { answers } = parsed.data;
  const { score, status, surveyId } = scoreAndSurveyFor(solutionType, answers);

  const existing = await c.env.DB.prepare(
    "SELECT id FROM needs_assessments WHERE solution_id = ? AND solution_type = ? LIMIT 1"
  )
    .bind(solutionId, solutionType)
    .first();

  if (existing) {
    await c.env.DB.prepare(`
      UPDATE needs_assessments
      SET answers = ?, readiness_score = ?, readiness_status = ?, survey_id = ?, updated_at = datetime('now')
      WHERE solution_id = ? AND solution_type = ?
    `)
      .bind(JSON.stringify(answers), score, status, surveyId, solutionId, solutionType)
      .run();
  } else {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO needs_assessments (id, solution_id, solution_type, survey_id, answers, readiness_score, readiness_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(id, solutionId, solutionType, surveyId, JSON.stringify(answers), score, status)
      .run();
  }

  const row = await c.env.DB.prepare(
    "SELECT * FROM needs_assessments WHERE solution_id = ? AND solution_type = ? LIMIT 1"
  )
    .bind(solutionId, solutionType)
    .first() as Record<string, unknown> | null;

  if (!row) throw new HTTPException(500, { message: "Failed to retrieve assessment" });

  return c.json({
    ...row,
    answers: parseAnswers(row.answers as string),
  });
});

// ── DELETE /api/solutions/:id/needs-assessments/:type ──────────────────────────

app.delete("/:id/needs-assessments/:type", async (c) => {
  const auth = c.get("auth");
  if (!auth) throw new HTTPException(401, { message: "Unauthorized" });
  if (!EDIT_ROLES.includes(auth.role as typeof EDIT_ROLES[number])) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const solutionId = c.req.param("id");
  const solutionType = c.req.param("type");
  const existing = await c.env.DB.prepare(
    "SELECT id FROM needs_assessments WHERE solution_id = ? AND solution_type = ? LIMIT 1"
  )
    .bind(solutionId, solutionType)
    .first();

  if (!existing) throw new HTTPException(404, { message: "Needs assessment not found" });

  await c.env.DB.prepare("DELETE FROM needs_assessments WHERE solution_id = ? AND solution_type = ?")
    .bind(solutionId, solutionType)
    .run();

  return c.json({ success: true });
});

export default app;
