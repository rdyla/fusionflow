// Scoring engine for client_impact_assessment_unified_v1
// All survey data inlined — no cross-directory asset import needed.

export type AssessmentResult = {
  sectionScores: Record<string, number>;
  solutionScores: Record<string, number>;
  overallScore: number;
  confidenceScore: number;
  healthBand: string;
  recommendedActions: string[];
  insights: string[];
};

// ── Inlined survey data ────────────────────────────────────────────────────────

type FieldOption = { value: string; score?: number; label: string };

type ScoredField = {
  id: string;
  type: "single_select" | "rating" | "multi_select" | "textarea" | "text" | "date" | "object";
  scored?: boolean;
  appliesTo: string[];
  options?: FieldOption[];
  scoreMap?: Record<string, number>;
  scoring?: { method: string; scoreMap: Record<string, number> };
};

// All scored fields across all sections (excluding deployment_context)
const SCORED_FIELDS: ScoredField[] = [
  // adoption_usage
  {
    id: "active_user_adoption_band", type: "single_select", appliesTo: ["ucaas","ccaas","ci","virtual_agent"],
    options: [
      { value: "0_25", score: 1, label: "0-25%" },
      { value: "26_50", score: 2, label: "26-50%" },
      { value: "51_75", score: 4, label: "51-75%" },
      { value: "76_100", score: 5, label: "76-100%" },
    ],
  },
  {
    id: "adoption_vs_expectations", type: "single_select", appliesTo: ["ucaas","ccaas","ci"],
    options: [
      { value: "much_lower", score: 1, label: "Much lower" },
      { value: "slightly_lower", score: 2, label: "Slightly lower" },
      { value: "on_track", score: 4, label: "On track" },
      { value: "exceeding", score: 5, label: "Exceeding" },
    ],
  },
  {
    id: "features_most_used", type: "multi_select", appliesTo: ["ucaas","ccaas","ci","virtual_agent"],
    scoring: { method: "count_band", scoreMap: { "0": 1, "1": 2, "2": 3, "3": 4, "4_plus": 5 } },
  },
  {
    id: "ease_of_adoption", type: "rating", appliesTo: ["ucaas","ccaas","ci","virtual_agent"],
    scoreMap: { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 },
  },
  // operational_impact
  {
    id: "efficiency_improved", type: "single_select", appliesTo: ["ucaas","ccaas","ci","virtual_agent"],
    options: [
      { value: "no", score: 1, label: "No" },
      { value: "too_early", score: 3, label: "Too early to tell" },
      { value: "yes", score: 5, label: "Yes" },
    ],
  },
  {
    id: "estimated_time_saved", type: "single_select", appliesTo: ["ucaas","ccaas","virtual_agent"],
    options: [
      { value: "none", score: 1, label: "None" },
      { value: "under_5_hours_week", score: 2, label: "Under 5 hours/week" },
      { value: "5_20_hours_week", score: 4, label: "5-20 hours/week" },
      { value: "20_plus_hours_week", score: 5, label: "20+ hours/week" },
    ],
  },
  {
    id: "cost_reduction_observed", type: "single_select", appliesTo: ["ucaas","ccaas","virtual_agent"],
    options: [
      { value: "no", score: 1, label: "No" },
      { value: "unknown", score: 3, label: "Unknown" },
      { value: "yes", score: 5, label: "Yes" },
    ],
  },
  {
    id: "estimated_monthly_savings", type: "single_select", appliesTo: ["ucaas","ccaas","virtual_agent"],
    options: [
      { value: "none", score: 1, label: "None" },
      { value: "under_1000", score: 2, label: "Under $1,000" },
      { value: "1000_5000", score: 4, label: "$1,000-$5,000" },
      { value: "5000_plus", score: 5, label: "$5,000+" },
    ],
  },
  // experience_outcomes
  {
    id: "customer_experience_change", type: "single_select", appliesTo: ["ccaas","virtual_agent"],
    options: [
      { value: "worse", score: 1, label: "Worse" },
      { value: "no_change", score: 2, label: "No change" },
      { value: "slightly_improved", score: 4, label: "Slightly improved" },
      { value: "significantly_improved", score: 5, label: "Significantly improved" },
    ],
  },
  {
    id: "cx_metrics_improved", type: "multi_select", appliesTo: ["ccaas","virtual_agent"],
    scoring: { method: "count_band", scoreMap: { "0": 1, "1": 2, "2": 3, "3": 4, "4_plus": 5 } },
  },
  {
    id: "sales_impact_observed", type: "single_select", appliesTo: ["ci"],
    options: [
      { value: "no", score: 1, label: "No" },
      { value: "too_early", score: 3, label: "Too early to tell" },
      { value: "yes", score: 5, label: "Yes" },
    ],
  },
  {
    id: "sales_metrics_improved", type: "multi_select", appliesTo: ["ci"],
    scoring: { method: "count_band", scoreMap: { "0": 1, "1": 2, "2": 3, "3": 4, "4_plus": 5 } },
  },
  // ai_automation
  {
    id: "manual_work_reduced", type: "single_select", appliesTo: ["ci","virtual_agent"],
    options: [
      { value: "no", score: 1, label: "No" },
      { value: "not_yet", score: 3, label: "Not yet" },
      { value: "yes", score: 5, label: "Yes" },
    ],
  },
  {
    id: "automation_handled_interactions", type: "single_select", appliesTo: ["virtual_agent"],
    options: [
      { value: "0_10", score: 1, label: "0-10%" },
      { value: "11_25", score: 2, label: "11-25%" },
      { value: "26_50", score: 4, label: "26-50%" },
      { value: "51_plus", score: 5, label: "51%+" },
    ],
  },
  {
    id: "deflection_rate_estimate", type: "single_select", appliesTo: ["virtual_agent"],
    options: [
      { value: "none", score: 1, label: "None" },
      { value: "1_10", score: 2, label: "1-10%" },
      { value: "11_25", score: 4, label: "11-25%" },
      { value: "26_plus", score: 5, label: "26%+" },
    ],
  },
  {
    id: "ai_output_confidence", type: "rating", appliesTo: ["ci","virtual_agent"],
    scoreMap: { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 },
  },
  // satisfaction_next_steps
  {
    id: "overall_satisfaction", type: "rating", appliesTo: ["ucaas","ccaas","ci","virtual_agent"],
    scoreMap: { "1": 1, "2": 1, "3": 2, "4": 2, "5": 3, "6": 3, "7": 4, "8": 4, "9": 5, "10": 5 },
  },
  {
    id: "optimization_workshop_interest", type: "single_select", appliesTo: ["ucaas","ccaas","ci","virtual_agent"],
    options: [
      { value: "no", score: 2, label: "No" },
      { value: "maybe", score: 3, label: "Maybe" },
      { value: "yes", score: 5, label: "Yes" },
    ],
  },
];

// Solution scoring config
const SOLUTION_SCORING: Record<string, {
  weights: Record<string, number>;
  fieldInclusion: Record<string, string[]>;
}> = {
  ucaas: {
    weights: { adoption: 0.4, operationalImpact: 0.3, experienceImpact: 0.0, aiAutomation: 0.0, satisfaction: 0.3 },
    fieldInclusion: {
      adoption: ["active_user_adoption_band","adoption_vs_expectations","features_most_used","ease_of_adoption"],
      operationalImpact: ["efficiency_improved","estimated_time_saved","cost_reduction_observed","estimated_monthly_savings"],
      experienceImpact: [],
      aiAutomation: [],
      satisfaction: ["overall_satisfaction","optimization_workshop_interest"],
    },
  },
  ccaas: {
    weights: { adoption: 0.2, operationalImpact: 0.25, experienceImpact: 0.35, aiAutomation: 0.0, satisfaction: 0.2 },
    fieldInclusion: {
      adoption: ["active_user_adoption_band","adoption_vs_expectations","features_most_used","ease_of_adoption"],
      operationalImpact: ["efficiency_improved","estimated_time_saved","cost_reduction_observed","estimated_monthly_savings"],
      experienceImpact: ["customer_experience_change","cx_metrics_improved"],
      aiAutomation: [],
      satisfaction: ["overall_satisfaction","optimization_workshop_interest"],
    },
  },
  ci: {
    weights: { adoption: 0.2, operationalImpact: 0.15, experienceImpact: 0.35, aiAutomation: 0.15, satisfaction: 0.15 },
    fieldInclusion: {
      adoption: ["active_user_adoption_band","adoption_vs_expectations","features_most_used","ease_of_adoption"],
      operationalImpact: ["efficiency_improved"],
      experienceImpact: ["sales_impact_observed","sales_metrics_improved"],
      aiAutomation: ["manual_work_reduced","ai_output_confidence"],
      satisfaction: ["overall_satisfaction","optimization_workshop_interest"],
    },
  },
  virtual_agent: {
    weights: { adoption: 0.15, operationalImpact: 0.2, experienceImpact: 0.25, aiAutomation: 0.25, satisfaction: 0.15 },
    fieldInclusion: {
      adoption: ["active_user_adoption_band","features_most_used","ease_of_adoption"],
      operationalImpact: ["efficiency_improved","estimated_time_saved","cost_reduction_observed","estimated_monthly_savings"],
      experienceImpact: ["customer_experience_change","cx_metrics_improved"],
      aiAutomation: ["manual_work_reduced","automation_handled_interactions","deflection_rate_estimate","ai_output_confidence"],
      satisfaction: ["overall_satisfaction","optimization_workshop_interest"],
    },
  },
};

const HEALTH_BANDS = [
  { label: "at_risk", min: 0, max: 39 },
  { label: "limited_value", min: 40, max: 59 },
  { label: "emerging_value", min: 60, max: 79 },
  { label: "realized_value", min: 80, max: 100 },
];

const INTERVENTIONS: Record<string, string[]> = {
  at_risk: ["urgent_success_review","adoption_remediation_plan","targeted_training","executive_checkpoint"],
  limited_value: ["feature_adoption_plan","kpi_baseline_definition","optimization_workshop"],
  emerging_value: ["advanced_feature_rollout","integration_expansion","reporting_optimization","ai_tuning"],
  realized_value: ["case_study_review","expansion_conversation","reference_candidate","qbr_impact_summary"],
};

const MEASURABLE_FIELDS = [
  "estimated_time_saved","estimated_monthly_savings","cx_metrics_improved",
  "sales_metrics_improved","automation_handled_interactions","deflection_rate_estimate",
];

const UNCERTAINTY_VALUES = new Set(["too_early","unknown","not_yet"]);

// Build a lookup map for scored fields
const FIELD_MAP = new Map<string, ScoredField>(SCORED_FIELDS.map((f) => [f.id, f]));

// ── Helper: compute raw score for a single field ──────────────────────────────

function computeRawScore(field: ScoredField, rawValue: unknown): number | null {
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;

  if (field.type === "single_select") {
    if (typeof rawValue !== "string") return null;
    const opt = field.options?.find((o) => o.value === rawValue);
    return opt?.score ?? null;
  }

  if (field.type === "rating") {
    const key = String(rawValue);
    const score = field.scoreMap?.[key];
    return score !== undefined ? score : null;
  }

  if (field.type === "multi_select" && field.scoring?.method === "count_band") {
    if (!Array.isArray(rawValue)) return null;
    const count = rawValue.length;
    const sm = field.scoring.scoreMap;
    const key = count >= 4 ? "4_plus" : String(count);
    const score = sm[key];
    return score !== undefined ? score : null;
  }

  return null;
}

// ── Helper: section score for a solution type + category ─────────────────────

function computeCategoryScore(
  category: string,
  solutionType: string,
  answers: Record<string, unknown>
): number | null {
  const config = SOLUTION_SCORING[solutionType];
  if (!config) return null;
  const fieldIds = config.fieldInclusion[category] ?? [];
  if (fieldIds.length === 0) return null;

  const rawScores: number[] = [];
  for (const fid of fieldIds) {
    const field = FIELD_MAP.get(fid);
    if (!field) continue;
    const score = computeRawScore(field, answers[fid]);
    if (score !== null) rawScores.push(score);
  }

  if (rawScores.length === 0) return null;
  const avg = rawScores.reduce((a, b) => a + b, 0) / rawScores.length;
  return Math.round(((avg - 1) / 4) * 100);
}

// ── Main export ───────────────────────────────────────────────────────────────

export function scoreAssessment(
  answers: Record<string, unknown>,
  solutionTypes: string[]
): AssessmentResult {
  const categories = ["adoption","operationalImpact","experienceImpact","aiAutomation","satisfaction"];

  // ── 1. Compute per-solution category scores + solution scores ──────────────
  const solutionScores: Record<string, number> = {};
  // Track category scores per solution for insight rules
  const categoryScoresPerSolution: Record<string, Record<string, number | null>> = {};

  for (const sol of solutionTypes) {
    const config = SOLUTION_SCORING[sol];
    if (!config) continue;

    const catScores: Record<string, number | null> = {};
    let weightedSum = 0;
    let totalWeight = 0;

    for (const cat of categories) {
      const score = computeCategoryScore(cat, sol, answers);
      catScores[cat] = score;
      if (score !== null) {
        const w = config.weights[cat] ?? 0;
        weightedSum += score * w;
        totalWeight += w;
      }
    }
    categoryScoresPerSolution[sol] = catScores;

    if (totalWeight > 0) {
      solutionScores[sol] = Math.round(weightedSum / totalWeight);
    }
  }

  // ── 2. Aggregate section scores (average across solutions) ─────────────────
  const sectionScores: Record<string, number> = {};
  for (const cat of categories) {
    const vals: number[] = [];
    for (const sol of solutionTypes) {
      const s = categoryScoresPerSolution[sol]?.[cat];
      if (s !== null && s !== undefined) vals.push(s);
    }
    if (vals.length > 0) {
      sectionScores[cat] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }

  // ── 3. Overall score (weighted by deployment_priority_weights) ─────────────
  const defaultWeights: Record<string, number> = { ucaas: 1, ccaas: 1, ci: 1, virtual_agent: 1 };
  const priorityWeights = (answers.deployment_priority_weights as Record<string, number> | undefined) ?? defaultWeights;

  let overallWeightedSum = 0;
  let overallTotalWeight = 0;
  for (const sol of solutionTypes) {
    if (solutionScores[sol] !== undefined) {
      const w = priorityWeights[sol] ?? 1;
      overallWeightedSum += solutionScores[sol] * w;
      overallTotalWeight += w;
    }
  }
  const overallScore = overallTotalWeight > 0
    ? Math.round(overallWeightedSum / overallTotalWeight)
    : 0;

  // ── 4. Confidence score ────────────────────────────────────────────────────
  // completenessScore: # of applicable scored fields answered / total applicable
  let totalApplicableScored = 0;
  let totalAnswered = 0;

  for (const field of SCORED_FIELDS) {
    if (!field.appliesTo.some((t) => solutionTypes.includes(t))) continue;
    totalApplicableScored++;
    const score = computeRawScore(field, answers[field.id]);
    if (score !== null) totalAnswered++;
  }
  const completenessScore = totalApplicableScored > 0
    ? (totalAnswered / totalApplicableScored) * 100
    : 0;

  // measurableDataScore: specific quantitative fields
  let measurableApplicable = 0;
  let measurableAnswered = 0;
  for (const fid of MEASURABLE_FIELDS) {
    const field = FIELD_MAP.get(fid);
    if (!field) continue;
    if (!field.appliesTo.some((t) => solutionTypes.includes(t))) continue;
    measurableApplicable++;
    const val = answers[fid];
    if (val !== undefined && val !== null && val !== "") measurableAnswered++;
  }
  const measurableDataScore = measurableApplicable > 0
    ? (measurableAnswered / measurableApplicable) * 100
    : 0;

  // certaintyScore: start 100, deduct 10 per uncertain answer
  let certaintyScore = 100;
  for (const [, val] of Object.entries(answers)) {
    if (typeof val === "string" && UNCERTAINTY_VALUES.has(val)) {
      certaintyScore = Math.max(0, certaintyScore - 10);
    }
  }

  const confidenceScore = Math.round(
    0.4 * completenessScore + 0.4 * measurableDataScore + 0.2 * certaintyScore
  );

  // ── 5. Health band ─────────────────────────────────────────────────────────
  const healthBand = HEALTH_BANDS.find(
    (b) => overallScore >= b.min && overallScore <= b.max
  )?.label ?? "at_risk";

  // ── 6. Recommended actions ─────────────────────────────────────────────────
  const recommendedActions = INTERVENTIONS[healthBand] ?? [];

  // ── 7. Insight rules ───────────────────────────────────────────────────────
  const insights: string[] = [];
  const satisfactionSectionScore = sectionScores["satisfaction"] ?? 0;

  if (solutionScores["ucaas"] !== undefined && solutionScores["ccaas"] !== undefined) {
    if (solutionScores["ucaas"] >= 75 && solutionScores["ccaas"] < 60) {
      insights.push("Strong UCaaS adoption, but contact center value is lagging. Focus on routing, reporting, and agent workflows.");
    }
  }
  if (solutionScores["virtual_agent"] !== undefined) {
    if (solutionScores["virtual_agent"] < 65) {
      insights.push("Virtual agent impact is under target. Recommend bot tuning, escalation review, and deflection optimization.");
    }
  }
  if (solutionScores["ci"] !== undefined) {
    if (solutionScores["ci"] >= 75 && satisfactionSectionScore >= 80) {
      insights.push("Conversational intelligence deployment is showing strong value. Candidate for expansion or case study.");
    }
  }
  if (satisfactionSectionScore >= 80 && overallScore < 65) {
    insights.push("Customer sentiment is positive, but measurable impact is still moderate. Focus on converting adoption into operational outcomes.");
  }

  return {
    sectionScores,
    solutionScores,
    overallScore,
    confidenceScore,
    healthBand,
    recommendedActions,
    insights,
  };
}
