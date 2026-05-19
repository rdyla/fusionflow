import { useEffect, useMemo, useState } from "react";
import { api, type Project, type Template } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";
import { chainForward, parseISODate, startFromGoLive, type PhaseInput } from "../../../shared/workdayMath";

// ── Types ────────────────────────────────────────────────────────────────────

type Row = {
  template_phase_id: string;
  name: string;
  working_days: number;
  start: string;
  end: string;
  /** true if a date in this row was manually edited and should pin the row
   *  during downstream recompute. */
  pinned: boolean;
  tasks: { id: string; title: string; role: string | null }[];
};

type Props = {
  project: Project;
  onApplied: () => void;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateForDisplay(iso: string): string {
  if (!iso) return "";
  const d = parseISODate(iso);
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

function rowsFromTemplate(template: Template, anchorStart: string): Row[] {
  const phases = template.phases ?? [];
  const inputs: PhaseInput[] = phases.map((p) => ({ id: p.id, working_days: p.working_days }));
  const computed = chainForward(anchorStart, inputs);
  return phases.map((p, i) => ({
    template_phase_id: p.id,
    name: p.name,
    working_days: p.working_days,
    start: computed[i].start,
    end:   computed[i].end,
    pinned: false,
    tasks: (p.tasks ?? []).map((t) => ({ id: t.id, title: t.title, role: t.default_assignee_role })),
  }));
}

function recomputeChain(rows: Row[], anchorStart: string): Row[] {
  // Map current rows → PhaseInput preserving pinned dates so chainForward
  // honors PM overrides while recomputing everything downstream of them.
  const inputs: PhaseInput[] = rows.map((r) => ({
    id: r.template_phase_id,
    working_days: r.working_days,
    pinned_start: r.pinned ? r.start : null,
    pinned_end:   r.pinned ? r.end   : null,
  }));
  const computed = chainForward(anchorStart, inputs);
  return rows.map((r, i) => ({ ...r, start: computed[i].start, end: computed[i].end }));
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TimelineBuilder({ project, onApplied }: Props) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [goLive, setGoLive] = useState<string>(project.target_go_live_date ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmingApply, setConfirmingApply] = useState(false);

  // Load template list once
  useEffect(() => {
    api.templatesList().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  // When template selection changes, fetch its phases + tasks and seed rows
  useEffect(() => {
    if (!templateId) { setTemplate(null); setRows([]); return; }
    setLoading(true);
    api.template(templateId)
      .then((t) => {
        setTemplate(t);
        // Anchor: back-compute from go-live so the chain lands on it
        const totalDays = (t.phases ?? []).reduce((sum, p) => sum + (p.working_days || 0), 0);
        const anchor = goLive ? startFromGoLive(goLive, totalDays) : new Date().toISOString().slice(0, 10);
        setRows(rowsFromTemplate(t, anchor));
      })
      .catch(() => showToast("Failed to load template", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // When go-live changes (and we have a template loaded), re-seed the chain
  useEffect(() => {
    if (!template) return;
    const totalDays = (template.phases ?? []).reduce((sum, p) => sum + (p.working_days || 0), 0);
    const anchor = goLive ? startFromGoLive(goLive, totalDays) : new Date().toISOString().slice(0, 10);
    setRows((prev) => recomputeChain(prev.map((r) => ({ ...r, pinned: false })), anchor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goLive]);

  const computedGoLive = useMemo(() => rows.length ? rows[rows.length - 1].end : "", [rows]);

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch, pinned: true };
      // Re-derive anchor from the first row's current start so the chain
      // honors any upstream pinning too.
      const anchor = next[0]?.start ?? new Date().toISOString().slice(0, 10);
      return recomputeChain(next, anchor);
    });
  }

  function clearOverrides() {
    if (!template) return;
    const totalDays = (template.phases ?? []).reduce((sum, p) => sum + (p.working_days || 0), 0);
    const anchor = goLive ? startFromGoLive(goLive, totalDays) : new Date().toISOString().slice(0, 10);
    setRows(rowsFromTemplate(template, anchor));
  }

  async function handleApply() {
    if (!template || !rows.length) return;
    setApplying(true);
    try {
      const result = await api.applyTimeline(project.id, {
        template_id: template.id,
        phases: rows.map((r) => ({ template_phase_id: r.template_phase_id, start: r.start, end: r.end })),
      });
      showToast(`Timeline applied: ${result.phases_created} phases, ${result.tasks_created} tasks.`, "success");
      setConfirmingApply(false);
      onApplied();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to apply timeline", "error");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Controls */}
      <div className="ms-card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <label className="ms-label">
            <span>Template</span>
            <select className="ms-input" value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={loading || applying}>
              <option value="">— Select a template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="ms-label">
            <span>Target Go-Live</span>
            <input
              className="ms-input"
              type="date"
              value={goLive}
              onChange={(e) => setGoLive(e.target.value)}
              disabled={!template || applying}
            />
          </label>
          {template && (
            <button className="ms-btn-ghost" onClick={clearOverrides} disabled={applying} title="Reset all dates from the current go-live anchor">
              Reset dates
            </button>
          )}
        </div>
        {template && (
          <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
            Computed go-live (last phase end): <strong style={{ color: "#1e293b" }}>{computedGoLive ? formatDateForDisplay(computedGoLive) : "—"}</strong>
            {computedGoLive && goLive && computedGoLive !== goLive && (
              <span style={{ marginLeft: 8, color: "#d97706" }}>
                (differs from target — likely due to manual overrides)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Phase + task table */}
      {rows.length > 0 && (
        <div className="ms-card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11 }}>Phase / Task</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11, width: 100 }}>Role</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11, width: 110 }}>Workdays</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11, width: 150 }}>Start</th>
                <th style={{ padding: "10px 14px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11, width: 150 }}>End</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <PhaseRows key={row.template_phase_id} row={row} idx={idx} onChange={(patch) => setRow(idx, patch)} disabled={applying} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Apply */}
      {rows.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {!confirmingApply ? (
            <button className="ms-btn-primary" onClick={() => setConfirmingApply(true)} disabled={applying}>
              Apply Timeline
            </button>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "#b91c1c", alignSelf: "center", marginRight: 12 }}>
                This wipes existing phases + tasks on the project and rebuilds them. Continue?
              </div>
              <button className="ms-btn-ghost" onClick={() => setConfirmingApply(false)} disabled={applying}>Cancel</button>
              <button className="ms-btn-primary" onClick={handleApply} disabled={applying}>
                {applying ? "Applying…" : "Yes, replace timeline"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Row sub-component (phase header row + indented task rows) ────────────────

function PhaseRows({ row, idx, onChange, disabled }: { row: Row; idx: number; onChange: (patch: Partial<Row>) => void; disabled: boolean }) {
  return (
    <>
      <tr style={{ background: row.pinned ? "#fef9c3" : "#ffffff", borderBottom: "1px solid #f1f5f9" }}>
        <td style={{ padding: "8px 14px", fontWeight: 600, color: "#1e293b" }}>
          {idx + 1}. {row.name}
        </td>
        <td style={{ padding: "8px 14px", color: "#94a3b8", fontSize: 12 }}>—</td>
        <td style={{ padding: "8px 14px" }}>
          <input
            type="number"
            min={0}
            value={row.working_days}
            onChange={(e) => onChange({ working_days: Math.max(0, parseInt(e.target.value || "0", 10)) })}
            disabled={disabled}
            style={{ width: 60, padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 4 }}
          />
        </td>
        <td style={{ padding: "8px 14px" }}>
          <input
            type="date"
            value={row.start}
            onChange={(e) => onChange({ start: e.target.value })}
            disabled={disabled}
            style={{ padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 4 }}
          />
        </td>
        <td style={{ padding: "8px 14px" }}>
          <input
            type="date"
            value={row.end}
            onChange={(e) => onChange({ end: e.target.value })}
            disabled={disabled}
            style={{ padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: 4 }}
          />
        </td>
      </tr>
      {row.tasks.map((t) => (
        <tr key={t.id} style={{ background: "#fafbfc", borderBottom: "1px solid #f1f5f9" }}>
          <td style={{ padding: "5px 14px 5px 36px", color: "#475569", fontSize: 12 }}>{t.title}</td>
          <td style={{ padding: "5px 14px", color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t.role ?? ""}</td>
          <td style={{ padding: "5px 14px", color: "#94a3b8", fontSize: 12 }}>—</td>
          <td style={{ padding: "5px 14px", color: "#64748b", fontSize: 12 }}>{formatDateForDisplay(row.start)}</td>
          <td style={{ padding: "5px 14px", color: "#64748b", fontSize: 12 }}>{formatDateForDisplay(row.end)}</td>
        </tr>
      ))}
    </>
  );
}
