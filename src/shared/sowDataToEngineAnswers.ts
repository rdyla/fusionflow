/**
 * Maps the SOW Sizing form blob (`solutions.sow_data`) to the labor engine's
 * answer keys for a given solution type, so the SOW tab is the single source
 * for sizing and advanced-mode hours derive from it.
 *
 * Only UCaaS sizing ever lived on the Labor Estimate tab's "Calculator Inputs"
 * (CCaaS / CI / VA were always needs-assessment-driven). So only UCaaS emits
 * keys here; every other type returns {} and stays NA-driven — its hours are
 * unchanged by this refactor.
 *
 * Blank/empty fields are OMITTED so the caller can layer this over the NA
 * answers ({...na, ...sowData}) — sow_data wins where the PM entered a value,
 * the NA fills the rest. Emitted keys match the engine's expected names exactly
 * (see src/server/routes/laborEstimates.ts), so for the same values the engine
 * produces the same hours it did from the old direct_inputs.
 */
export function sowDataToEngineAnswers(sowData: unknown, solutionType: string): Record<string, unknown> {
  if (solutionType !== "ucaas" || !sowData || typeof sowData !== "object") return {};
  const u = ((sowData as Record<string, unknown>).ucaas ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const toStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

  // user_count = sum of the UCaaS user breakdown (same basis the SOW renderer
  // uses). The engine bins it into user_count_band internally.
  const userSum = (toNum(u.basic_users) ?? 0) + (toNum(u.advanced_users) ?? 0)
                + (toNum(u.common_area) ?? 0) + (toNum(u.conference_rooms) ?? 0);
  if (userSum > 0) out.user_count = userSum;

  for (const k of ["deployment_type", "number_porting_required", "sandbox_testing_required"] as const) {
    const v = toStr(u[k]);
    if (v !== null) out[k] = v;
  }
  for (const k of [
    "integrations_required", "call_flow_components_required", "analog_fax_count",
    "paging_system_count", "door_phone_count", "gate_controller_count",
    "other_analog_device_count", "did_porting_blocks",
  ] as const) {
    const v = toNum(u[k]);
    if (v !== null) out[k] = v;
  }
  return out;
}
