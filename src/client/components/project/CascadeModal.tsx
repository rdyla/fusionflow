/**
 * Cascade modal — PM-initiated date shift from a chosen task forward.
 *
 * Flow:
 *   1. Modal opens with `fromTask` pre-selected.
 *   2. Slip-days input defaults to the overdue gap (today − due) in working
 *      days when the task is past due; otherwise 0. PM can override to model
 *      a known future delay.
 *   3. As slip changes (debounced), GET /cascade/preview returns the list of
 *      affected tasks with new dates + the new target go-live.
 *   4. Per-row checkboxes let the PM opt out specific tasks (default all in).
 *   5. Apply POSTs to /cascade/apply; on success the parent refreshes tasks
 *      + project header, toast confirms count + new go-live.
 *
 * The server runs everything in one atomic db.batch and fires a summary
 * email per affected recipient (assignees + PM). No-op when slip is 0.
 */

import { useEffect, useMemo, useState } from "react";
import { api, type CascadePreview, type Task } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

type Props = {
  projectId: string;
  fromTask: Task;
  onClose: () => void;
  /** Fires after a successful Apply so the page can refetch tasks + project. */
  onApplied: (result: { tasks_shifted: number; new_target_go_live: string | null }) => void;
};

/** Working-day diff (Excel-style). Positive when end is later than start. */
function workdaysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export default function CascadeModal({ projectId, fromTask, onClose, onApplied }: Props) {
  const { showToast } = useToast();

  // Default slip = workdays between due_date and today, when the task is overdue.
  // Otherwise 0 (PM models a future delay manually).
  const defaultSlip = useMemo(() => {
    if (!fromTask.due_date) return 0;
    const today = new Date().toISOString().slice(0, 10);
    return today > fromTask.due_date ? workdaysBetween(fromTask.due_date, today) : 0;
  }, [fromTask.due_date]);

  const [slipDays, setSlipDays] = useState<number>(defaultSlip);
  const [preview, setPreview] = useState<CascadePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  // Debounced preview refetch on slip changes.
  useEffect(() => {
    if (!fromTask.due_date) return;
    let cancelled = false;
    setLoadingPreview(true);
    const t = setTimeout(() => {
      api.cascadePreview(projectId, fromTask.id, slipDays)
        .then((res) => { if (!cancelled) setPreview(res); })
        .catch(() => { if (!cancelled) showToast("Failed to load cascade preview", "error"); })
        .finally(() => { if (!cancelled) setLoadingPreview(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [projectId, fromTask.id, fromTask.due_date, slipDays, showToast]);

  const affected = preview?.affected_tasks ?? [];
  const includedCount = affected.length - excluded.size;

  function toggleExclude(taskId: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  async function handleApply() {
    if (slipDays === 0 || includedCount === 0) return;
    setApplying(true);
    try {
      const result = await api.cascadeApply(projectId, {
        from_task_id: fromTask.id,
        slip_days: slipDays,
        exclude_task_ids: [...excluded],
      });
      const goLive = result.new_target_go_live ? ` Target go-live → ${result.new_target_go_live}.` : "";
      showToast(`Cascade applied: ${result.tasks_shifted} task${result.tasks_shifted === 1 ? "" : "s"} rescheduled.${goLive}`, "success");
      onApplied({ tasks_shifted: result.tasks_shifted, new_target_go_live: result.new_target_go_live });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to apply cascade";
      showToast(msg, "error");
    } finally {
      setApplying(false);
    }
  }

  if (!fromTask.due_date) {
    return (
      <div className="ms-modal-overlay" onClick={onClose}>
        <div className="ms-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700 }}>Cascade — no due date</h3>
          <p style={{ fontSize: 13, color: "#475569", margin: "0 0 18px" }}>
            <strong>{fromTask.title}</strong> has no due date set. Add one before cascading so the shift has a reference point.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="ms-btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ms-modal-overlay" onClick={onClose}>
      <div className="ms-modal" style={{ maxWidth: 720, maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>Cascade dates from this task</h3>
        <p style={{ fontSize: 13, color: "#475569", margin: "0 0 14px" }}>
          Shift downstream task dates by N working days. <strong>{fromTask.title}</strong> stays put; everything with a later due date moves.
        </p>

        {/* Source task summary */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>From task</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{fromTask.title}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Due {fromTask.due_date}{defaultSlip > 0 ? ` · overdue ${defaultSlip} working day${defaultSlip === 1 ? "" : "s"}` : ""}</div>
          </div>
          <div>
            <label style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Slip (working days)</span>
              <input
                type="number"
                value={slipDays}
                onChange={(e) => setSlipDays(parseInt(e.target.value || "0", 10))}
                style={{ width: 90, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 14, fontWeight: 600, textAlign: "right" }}
              />
            </label>
          </div>
        </div>

        {/* New target go-live callout */}
        {preview && (
          <div style={{
            background: preview.new_target_go_live && preview.new_target_go_live !== preview.current_target_go_live ? "rgba(255,140,0,0.08)" : "#f8fafc",
            border: `1px solid ${preview.new_target_go_live && preview.new_target_go_live !== preview.current_target_go_live ? "rgba(255,140,0,0.3)" : "#e2e8f0"}`,
            borderRadius: 6, padding: "8px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <span style={{ fontSize: 12, color: "#475569" }}>Target go-live</span>
            <span style={{ fontSize: 13 }}>
              <span style={{ color: "#94a3b8" }}>{preview.current_target_go_live ?? "—"}</span>
              <span style={{ margin: "0 8px", color: "#94a3b8" }}>→</span>
              <strong style={{ color: preview.new_target_go_live && preview.new_target_go_live !== preview.current_target_go_live ? "#c2410c" : "#1e293b" }}>
                {preview.new_target_go_live ?? "—"}
              </strong>
            </span>
          </div>
        )}

        {/* Affected list */}
        <div style={{ overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 6, flex: 1, minHeight: 100 }}>
          {loadingPreview && !preview ? (
            <div style={{ padding: 20, color: "#94a3b8", fontSize: 13, textAlign: "center" }}>Computing preview…</div>
          ) : affected.length === 0 ? (
            <div style={{ padding: 20, color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
              {slipDays === 0 ? "Enter a slip amount to see affected tasks." : "No tasks have a due date later than the source — nothing to shift."}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#475569", textAlign: "left" }}>
                  <th style={{ padding: "8px 10px", width: 32 }}>
                    <input
                      type="checkbox"
                      checked={excluded.size === 0}
                      onChange={(e) => setExcluded(e.target.checked ? new Set() : new Set(affected.map((t) => t.id)))}
                      title="Toggle all"
                    />
                  </th>
                  <th style={{ padding: "8px 10px" }}>Task</th>
                  <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>Current Due</th>
                  <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>New Due</th>
                </tr>
              </thead>
              <tbody>
                {affected.map((t) => {
                  const isExcluded = excluded.has(t.id);
                  return (
                    <tr key={t.id} style={{ borderTop: "1px solid #f1f5f9", opacity: isExcluded ? 0.4 : 1 }}>
                      <td style={{ padding: "6px 10px" }}>
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => toggleExclude(t.id)}
                        />
                      </td>
                      <td style={{ padding: "6px 10px", color: "#1e293b" }}>{t.title}</td>
                      <td style={{ padding: "6px 10px", color: "#64748b", whiteSpace: "nowrap" }}>{t.due_date ?? "—"}</td>
                      <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                        {t.new_due_date && t.due_date !== t.new_due_date
                          ? <strong style={{ color: "#0891b2" }}>{t.new_due_date}</strong>
                          : <span style={{ color: "#94a3b8" }}>{t.new_due_date ?? "—"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {includedCount > 0 && slipDays !== 0
              ? <>{includedCount} of {affected.length} task{affected.length === 1 ? "" : "s"} will shift</>
              : null}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ms-btn-secondary" onClick={onClose} disabled={applying}>Cancel</button>
            <button
              className="ms-btn-primary"
              onClick={handleApply}
              disabled={applying || slipDays === 0 || includedCount === 0}
              style={{ background: "#0891b2" }}
            >
              {applying ? "Applying…" : `Apply cascade`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
