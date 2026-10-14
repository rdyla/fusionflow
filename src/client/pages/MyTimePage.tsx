import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { api, type MyTimeSuggestions, type TimeSuggestion, type TimeEntrySetup } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

/* Packet Fusion brand tokens — see DESIGN.md. Green is a fill/CTA colour only,
   never type; navy carries emphasis. */
const NAVY = "#003B5C";
const GREEN = "#17C662";
const BLUE = "#63C1EA";
const GREY = "#D9E1E2";
const BODY = "#333333";
const MUTED = "#667080";
const DANGER = "#d63637";

const REASON_LABEL: Record<TimeSuggestion["matchReason"], string> = {
  crm_case: "matched on CRM case",
  project_name: "matched on project name",
  customer_name: "matched on customer name",
  zoom_alias: "matched on project Zoom alias",
  contact_attendee: "a project contact attended",
};

/** Row state while processing, so each line reports its own outcome — one
 *  failed CRM write must not obscure the rest of the batch. */
type RowState = { status: "idle" | "working" | "failed"; error?: string };

const STAGE_REASON_LABEL: Record<TimeSuggestion["stageReason"], string> = {
  keyword_and_active: "the meeting title and the active stage agreeing",
  only_active_stage: "the project's one active stage",
  furthest_active_stage: "the furthest-along of several active stages",
  keyword_only: "the meeting title (no stage is active)",
  no_stages: "nothing — this project has no stages",
};

/* Row controls share one height and label style so they line up row to row. */
/* Fixed widths line columns up on desktop; the 100% caps let them shrink to fit a phone. */
const FIELD: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0, maxWidth: "100%" };
const FIELD_LABEL: CSSProperties = { fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: ".04em" };
const CONTROL = {
  height: 34, boxSizing: "border-box", padding: "0 10px", border: `1px solid ${GREY}`, borderRadius: 6,
  fontSize: 13, color: BODY, background: "#fff", maxWidth: "100%",
} satisfies CSSProperties;

const keyOf = (s: TimeSuggestion) => `${s.source}:${s.eventId}`;
/** Pay/cost codes hang off the CRM job and are stage-aware (a phase can carry
 *  its own case), so setup is cached per project+stage rather than per project. */
const setupKeyOf = (projectId: string, stageId: string) => `${projectId}:${stageId}`;

function fmtRange(startIso: string, endIso: string): string {
  const s = new Date(startIso), e = new Date(endIso);
  if (Number.isNaN(s.getTime())) return startIso;
  const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${t(s)}–${t(e)}`;
}

const fmtHours = (h: number) => `${h.toFixed(2)}h`;

/** End timestamp implied by an edited duration. The start is whatever the
 *  meeting actually started at; only the length is the user's to change. */
function endFromHours(startIso: string, hours: number): string {
  return new Date(Date.parse(startIso) + Math.round(hours * 3600) * 1000).toISOString();
}

export default function MyTimePage() {
  const { showToast } = useToast();
  const [data, setData] = useState<MyTimeSuggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  /** Duration in HOURS per row, seeded from the suggestion and editable. */
  const [hours, setHours] = useState<Record<string, number>>({});
  /** Chosen stage per row — "" means log as project-level admin time. Seeded
   *  from the server's inference and editable before processing. */
  const [stageId, setStageId] = useState<Record<string, string>>({});
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [processing, setProcessing] = useState(false);
  const [setupCache, setSetupCache] = useState<Record<string, TimeEntrySetup>>({});
  /** Cost code per row — "" means the server's default for that project. */
  const [costCodeId, setCostCodeId] = useState<Record<string, string>>({});
  const setupInFlight = useRef<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.myTimeSuggestions()
      .then((res) => {
        setData(res);
        // Seed each row's duration with what the calendar says. Nothing is
        // pre-checked: these become closed payroll records, so selecting is
        // deliberate. "Select all" is one click away.
        const seeded: Record<string, number> = {};
        const seededStage: Record<string, string> = {};
        for (const s of res.suggestions) {
          seeded[keyOf(s)] = Number((s.durationMin / 60).toFixed(2));
          seededStage[keyOf(s)] = s.inferredStageId ?? "";
        }
        setHours(seeded);
        setStageId(seededStage);
        setCostCodeId({});
        setChecked(new Set());
        setRowState({});
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load suggestions."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Fetch codes for each project+stage on screen, so every row can show (and
  // let you change) the cost code it'll be logged with before you submit.
  useEffect(() => {
    const wanted = new Map<string, { projectId: string; stageId: string }>();
    for (const s of data?.suggestions ?? []) {
      const st = stageId[keyOf(s)] ?? "";
      wanted.set(setupKeyOf(s.projectId, st), { projectId: s.projectId, stageId: st });
    }
    for (const [key, { projectId, stageId: st }] of wanted) {
      if (setupCache[key] || setupInFlight.current.has(key)) continue;
      setupInFlight.current.add(key);
      api.timeEntrySetup(projectId, st || undefined)
        .then((setup) => setSetupCache((prev) => (prev[key] ? prev : { ...prev, [key]: setup })))
        .catch(() => { /* process() retries and reports per row */ })
        .finally(() => setupInFlight.current.delete(key));
    }
  }, [data, stageId, setupCache]);

  const suggestions = data?.suggestions ?? [];
  const allKeys = useMemo(() => suggestions.map(keyOf), [suggestions]);
  const allChecked = allKeys.length > 0 && allKeys.every((k) => checked.has(k));

  const selectedHours = useMemo(
    () => allKeys.filter((k) => checked.has(k)).reduce((sum, k) => sum + (hours[k] ?? 0), 0),
    [allKeys, checked, hours]
  );

  function toggle(k: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(allKeys));
  }

  async function dismiss(s: TimeSuggestion) {
    const k = keyOf(s);
    try {
      await api.dismissTimeSuggestion(s.source, s.eventId);
      setData((prev) => prev ? { ...prev, suggestions: prev.suggestions.filter((x) => keyOf(x) !== k) } : prev);
      setChecked((prev) => { const n = new Set(prev); n.delete(k); return n; });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't dismiss that.", "error");
    }
  }

  /**
   * Log every checked row.
   *
   * Sequential, not parallel: each entry is a Dynamics write followed by a
   * close, and firing a dozen at once at the CRM is a good way to get rate
   * limited half way through a batch. Rows are removed as they succeed and
   * left in place with their error if they don't, so a partial failure leaves
   * an accurate list of what still needs logging rather than an all-or-nothing
   * result.
   */
  async function process() {
    const targets = suggestions.filter((s) => checked.has(keyOf(s)));
    if (targets.length === 0) return;

    setProcessing(true);
    const succeeded: string[] = [];
    const failures: Record<string, RowState> = {};
    const cache = { ...setupCache };

    for (const s of targets) {
      const k = keyOf(s);
      setRowState((prev) => ({ ...prev, [k]: { status: "working" } }));
      try {
        const h = hours[k];
        if (!Number.isFinite(h) || h <= 0) throw new Error("Enter a duration greater than zero.");
        if (h > 24) throw new Error("That's more than 24 hours.");

        const chosenStage = stageId[k] || "";
        const cacheKey = setupKeyOf(s.projectId, chosenStage);
        let setup = cache[cacheKey];
        if (!setup) {
          setup = await api.timeEntrySetup(s.projectId, chosenStage || undefined);
          cache[cacheKey] = setup;
        }
        // Your own pay code from your CE user record — never just the first
        // code on a list.
        const payCode = setup.pay_codes.find((p) => p.amc_paycodeid === setup.default_pay_code_id);
        if (!payCode) {
          throw new Error(setup.pay_codes.length === 0
            ? "No pay code is assigned to you in CE — ask an admin to add one to your CE user record."
            : "You have several pay codes and no default — log this from the project page, or ask an admin to set your default.");
        }
        const wantCost = costCodeId[k] || setup.default_cost_code_id;
        const costCode = setup.cost_codes.find((c) => c.amc_costcodeid === wantCost);
        if (!costCode) {
          throw new Error(setup.cost_codes.length === 0
            ? "This project's CRM job has no cost codes — log it from the project page."
            : "Pick a cost code for this entry.");
        }

        const scheduled_end = endFromHours(s.startIso, h);
        if (chosenStage) {
          // Stage-level entry — CRM subject becomes "{stage} | {meeting}",
          // matching how the team already logs time.
          if (!setup.case_id || !setup.job_id) {
            throw new Error("This project's CRM case or job is missing — log it from the project page.");
          }
          await api.logStageTime(s.projectId, chosenStage, {
            scheduled_start: s.startIso,
            scheduled_end,
            pay_code_id: payCode.amc_paycodeid,
            cost_code_id: costCode.amc_costcodeid,
            note: s.subject || undefined,
            case_id: setup.case_id,
            job_id: setup.job_id,
            account_id: setup.account_id,
          });
        } else {
          // No stage chosen (or none exist) — project-level admin time.
          await api.logProjectTime(s.projectId, {
            scheduled_start: s.startIso,
            scheduled_end,
            pay_code_id: payCode.amc_paycodeid,
            cost_code_id: costCode.amc_costcodeid,
            note: s.subject || undefined,
          });
        }
        succeeded.push(k);
      } catch (err) {
        failures[k] = { status: "failed", error: err instanceof Error ? err.message : "Failed to log." };
      }
    }

    setSetupCache(cache);
    setData((prev) => prev ? { ...prev, suggestions: prev.suggestions.filter((x) => !succeeded.includes(keyOf(x))) } : prev);
    setChecked((prev) => { const n = new Set(prev); for (const k of succeeded) n.delete(k); return n; });
    setRowState(failures);
    setProcessing(false);

    const failedCount = Object.keys(failures).length;
    if (succeeded.length > 0) {
      showToast(
        `Logged ${succeeded.length} ${succeeded.length === 1 ? "entry" : "entries"}` +
        (failedCount > 0 ? ` — ${failedCount} couldn't be logged, see below.` : "."),
        failedCount > 0 ? "error" : "success"
      );
    } else if (failedCount > 0) {
      showToast(`Nothing was logged — ${failedCount} failed.`, "error");
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 32, fontWeight: 700, color: NAVY, lineHeight: 1.15 }}>My Time</h1>
      <p style={{ margin: "0 0 24px", fontSize: 16, color: BODY, lineHeight: 1.6, maxWidth: "72ch" }}>
        Meetings from the last seven days matched to your active projects. Check the ones to log,
        adjust any duration that doesn't reflect the time you actually spent, then process them.
        Entries post as completed time against the project's case.
      </p>

      {loading && <div style={{ fontSize: 14, color: MUTED }}>Looking through last week…</div>}
      {error && <div style={{ fontSize: 14, color: DANGER, lineHeight: 1.5 }}>{error}</div>}

      {data && (data.sources.zoom !== "ok" || data.sources.outlook !== "ok") && (
        <div style={{ border: `1px solid ${GREY}`, borderRadius: 8, padding: "12px 16px", marginBottom: 16, background: "#fff" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Some sources couldn't be read</div>
          {data.sources.zoom !== "ok" && <div style={{ fontSize: 13, color: BODY, lineHeight: 1.5 }}>Zoom: {data.sources.zoom}</div>}
          {data.sources.outlook !== "ok" && <div style={{ fontSize: 13, color: BODY, lineHeight: 1.5 }}>Outlook: {data.sources.outlook}</div>}
        </div>
      )}

      {!loading && !error && suggestions.length === 0 && (
        <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
          {data?.projectCount === 0
            ? "You have no open projects with a linked CRM case, so there's nothing to log time against yet."
            : "Nothing to suggest for last week — either it's all logged already, or no meetings matched one of your projects."}
        </div>
      )}

      {suggestions.length > 0 && (
        <>
          <div style={{
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            padding: "12px 16px", background: "#fff", border: `1px solid ${GREY}`,
            borderRadius: 8, marginBottom: 12,
          }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: BODY }}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={processing} style={{ cursor: "pointer" }} />
              Select all
            </label>
            <span style={{ fontSize: 13, color: MUTED }}>
              {checked.size} of {suggestions.length} selected · {fmtHours(selectedHours)}
            </span>
            <button
              onClick={process}
              disabled={processing || checked.size === 0}
              style={{
                marginLeft: "auto", background: checked.size === 0 ? GREY : GREEN,
                color: checked.size === 0 ? MUTED : "#fff",
                border: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 700,
                cursor: processing || checked.size === 0 ? "default" : "pointer",
                opacity: processing ? 0.7 : 1,
              }}
            >
              {processing
                ? "Processing…"
                : checked.size === 0
                  ? "Process"
                  : `Process ${checked.size} ${checked.size === 1 ? "entry" : "entries"} (${fmtHours(selectedHours)})`}
            </button>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {suggestions.map((s) => {
              const k = keyOf(s);
              const st = rowState[k];
              const isChecked = checked.has(k);
              return (
                <div
                  key={k}
                  style={{
                    background: "#fff",
                    border: `1px solid ${st?.status === "failed" ? DANGER : isChecked ? BLUE : GREY}`,
                    borderRadius: 8, boxShadow: "0 2px 12px rgba(0, 59, 92, .08)",
                    padding: 16, display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(k)}
                    disabled={processing}
                    aria-label={`Log ${s.subject || "meeting"} to ${s.projectName}`}
                    style={{ marginTop: 4, cursor: processing ? "default" : "pointer", flexShrink: 0 }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, lineHeight: 1.3 }}>
                      {s.subject || "Untitled meeting"}
                    </div>
                    <div style={{ fontSize: 13, color: BODY, marginTop: 3 }}>{fmtRange(s.startIso, s.endIso)}</div>
                    <div style={{ fontSize: 13, color: BODY, marginTop: 5 }}>
                      → <strong style={{ color: NAVY }}>{s.projectName}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
                      {REASON_LABEL[s.matchReason]} · from {s.source === "zoom" ? "Zoom (actual length)" : "Outlook (scheduled length)"}
                    </div>
                    {s.inferredStageId && (
                      <div style={{ fontSize: 12, color: s.stageConfidence === "medium" ? NAVY : MUTED, marginTop: 3, fontWeight: s.stageConfidence === "medium" ? 600 : 400 }}>
                        Stage guessed from {STAGE_REASON_LABEL[s.stageReason]}
                        {s.stageConfidence === "medium" && " — worth a check"}
                      </div>
                    )}
                    {s.otherProjectIds.length > 0 && (
                      <div style={{ fontSize: 12, color: NAVY, marginTop: 5, fontWeight: 600 }}>
                        Also matched {s.otherProjectIds.length} other project
                        {s.otherProjectIds.length === 1 ? "" : "s"} — check this is the right one.
                      </div>
                    )}
                    {st?.status === "failed" && (
                      <div style={{ fontSize: 12, color: DANGER, marginTop: 6, lineHeight: 1.5 }}>{st.error}</div>
                    )}

                    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
                      <label style={FIELD}>
                        <span style={FIELD_LABEL}>Stage</span>
                        <select
                          value={stageId[k] ?? ""}
                          disabled={processing}
                          onChange={(e) => {
                            setStageId((prev) => ({ ...prev, [k]: e.target.value }));
                            setCostCodeId((prev) => ({ ...prev, [k]: "" }));
                          }}
                          style={{ ...CONTROL, width: 220 }}
                        >
                          {/* Falling back to project-admin time stays available —
                              some projects have no stages, and some work genuinely
                              isn't phase work. */}
                          <option value="">Project admin (no stage)</option>
                          {(data?.stagesByProject[s.projectId] ?? []).map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name}{st.status === "in_progress" ? " ·  active" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      {(() => {
                        const setup = setupCache[setupKeyOf(s.projectId, stageId[k] ?? "")];
                        return (
                          <label style={FIELD}>
                            <span style={FIELD_LABEL}>Cost code</span>
                            <select
                              value={costCodeId[k] || setup?.default_cost_code_id || ""}
                              disabled={processing || !setup}
                              onChange={(e) => setCostCodeId((prev) => ({ ...prev, [k]: e.target.value }))}
                              style={{ ...CONTROL, width: 240 }}
                            >
                              {!setup && <option value="">Loading…</option>}
                              {setup && !(costCodeId[k] || setup.default_cost_code_id) && <option value="">— Select —</option>}
                              {(setup?.cost_codes ?? []).map((cc) => (
                                <option key={cc.amc_costcodeid} value={cc.amc_costcodeid}>{cc.amc_name}</option>
                              ))}
                            </select>
                          </label>
                        );
                      })()}
                      <label style={FIELD}>
                        <span style={FIELD_LABEL}>Hours</span>
                        <input
                          type="number"
                          min={0.25}
                          max={24}
                          step={0.25}
                          value={hours[k] ?? ""}
                          disabled={processing}
                          onChange={(e) => setHours((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
                          style={{ ...CONTROL, width: 80, textAlign: "right" }}
                        />
                      </label>
                      <button
                        onClick={() => dismiss(s)}
                        disabled={processing}
                        className="ms-btn-ghost"
                        style={{ fontSize: 12, height: CONTROL.height, marginLeft: "auto" }}
                      >
                        Not billable
                      </button>
                    </div>
                  </div>

                  {st?.status === "working" && (
                    <div style={{ fontSize: 12, color: MUTED, width: "100%" }}>Logging…</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
