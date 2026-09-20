import { useCallback, useEffect, useState } from "react";
import { api, type MyTimeSuggestions, type TimeSuggestion, type TimeEntrySetup } from "../lib/api";
import { useToast } from "../components/ui/ToastProvider";

/* Packet Fusion brand tokens — see DESIGN.md. Green is a fill/accent only,
   never type; navy carries emphasis. */
const NAVY = "#003B5C";
const GREEN = "#17C662";
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

function fmtRange(startIso: string, endIso: string): string {
  const s = new Date(startIso), e = new Date(endIso);
  if (Number.isNaN(s.getTime())) return startIso;
  const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${t(s)}–${t(e)}`;
}

function fmtHours(min: number): string {
  return `${(min / 60).toFixed(2)}h`;
}

export default function MyTimePage() {
  const { showToast } = useToast();
  const [data, setData] = useState<MyTimeSuggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Per-project pay/cost codes, fetched lazily on first confirm for that project. */
  const [setupCache, setSetupCache] = useState<Record<string, TimeEntrySetup>>({});

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.myTimeSuggestions()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load suggestions."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const key = (s: TimeSuggestion) => `${s.source}:${s.eventId}`;

  async function confirm(s: TimeSuggestion) {
    setBusyId(key(s));
    try {
      let setup = setupCache[s.projectId];
      if (!setup) {
        setup = await api.timeEntrySetup(s.projectId);
        setSetupCache((prev) => ({ ...prev, [s.projectId]: setup }));
      }
      const payCode = setup.pay_codes[0];
      const costCode = setup.cost_codes[0];
      if (!payCode || !costCode) {
        showToast(`${s.projectName} has no pay/cost codes set up in CRM — log this one from the project page.`, "error");
        return;
      }
      await api.logProjectTime(s.projectId, {
        scheduled_start: s.startIso,
        scheduled_end: s.endIso,
        pay_code_id: payCode.amc_paycodeid,
        cost_code_id: costCode.amc_costcodeid,
        note: s.subject || undefined,
      });
      showToast(`Logged ${fmtHours(s.durationMin)} to ${s.projectName}.`, "success");
      setData((prev) => prev ? { ...prev, suggestions: prev.suggestions.filter((x) => key(x) !== key(s)) } : prev);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't log that entry.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(s: TimeSuggestion) {
    setBusyId(key(s));
    try {
      await api.dismissTimeSuggestion(s.source, s.eventId);
      setData((prev) => prev ? { ...prev, suggestions: prev.suggestions.filter((x) => key(x) !== key(s)) } : prev);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't dismiss that.", "error");
    } finally {
      setBusyId(null);
    }
  }

  const suggestions = data?.suggestions ?? [];
  const totalMin = suggestions.reduce((sum, s) => sum + s.durationMin, 0);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 32, fontWeight: 700, color: NAVY, lineHeight: 1.15 }}>My Time</h1>
      <p style={{ margin: "0 0 24px", fontSize: 16, color: BODY, lineHeight: 1.6 }}>
        Meetings from the last seven days matched to your active projects. Nothing is logged to CRM
        until you confirm it — and a confirmed entry posts as completed time against the project's case.
      </p>

      {loading && <div style={{ fontSize: 14, color: MUTED }}>Looking through last week…</div>}
      {error && <div style={{ fontSize: 14, color: DANGER, lineHeight: 1.5 }}>{error}</div>}

      {/* A source that couldn't be read is called out rather than silently
          returning fewer suggestions — otherwise a missing Graph permission
          just looks like a quiet week. */}
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
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
            {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"} · {fmtHours(totalMin)} total
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {suggestions.map((s) => {
              const busy = busyId === key(s);
              return (
                <div
                  key={key(s)}
                  style={{
                    background: "#fff", border: `1px solid ${GREY}`, borderRadius: 8,
                    boxShadow: "0 2px 12px rgba(0, 59, 92, .08)", padding: 20,
                    display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, lineHeight: 1.3 }}>
                      {s.subject || "Untitled meeting"}
                    </div>
                    <div style={{ fontSize: 13, color: BODY, marginTop: 4 }}>
                      {fmtRange(s.startIso, s.endIso)} · <strong>{fmtHours(s.durationMin)}</strong>
                    </div>
                    <div style={{ fontSize: 13, color: BODY, marginTop: 6 }}>
                      → <strong style={{ color: NAVY }}>{s.projectName}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                      {REASON_LABEL[s.matchReason]} · from {s.source === "zoom" ? "Zoom" : "Outlook"}
                      {s.confidence === "medium" && " · worth a check"}
                    </div>
                    {s.otherProjectIds.length > 0 && (
                      <div style={{ fontSize: 12, color: NAVY, marginTop: 6, fontWeight: 600 }}>
                        Also matched {s.otherProjectIds.length} other project
                        {s.otherProjectIds.length === 1 ? "" : "s"} — confirm this is the right one.
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={() => dismiss(s)}
                      disabled={busy}
                      className="ms-btn-ghost"
                      style={{ fontSize: 13 }}
                    >
                      Not billable
                    </button>
                    <button
                      onClick={() => confirm(s)}
                      disabled={busy}
                      style={{
                        background: GREEN, color: "#fff", border: "none", borderRadius: 6,
                        padding: "8px 16px", fontSize: 13, fontWeight: 700,
                        cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {busy ? "Logging…" : `Log ${fmtHours(s.durationMin)}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
