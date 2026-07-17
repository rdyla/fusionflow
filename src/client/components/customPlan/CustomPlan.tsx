/**
 * ONE-OFF / THROWAWAY — MedVet Zoom custom plan (see migration 0129).
 *
 * A self-contained clone of the Timeline + Tasks modules that mirrors the
 * customer's original Asana project EXACTLY: the Asana sections are the
 * "stages", tasks nest up to 3 levels (task → subtask → child), and each task
 * carries its Asana Module tag + real dates. Rendered only for the project whose
 * `uses_custom_plan` flag is set, in place of the standard Timeline/Tasks tabs.
 *
 * Teardown: delete this folder + its two mount points in ProjectDetailPage +
 * the customPlan route + medvetPlan.json + migration 0129's table/flag.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type CustomPlanItem } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

const STATUS = ["not_started", "in_progress", "completed", "blocked"] as const;
const STATUS_LABEL: Record<string, string> = { not_started: "Not Started", in_progress: "In Progress", completed: "Completed", blocked: "Blocked" };
const STATUS_COLOR: Record<string, string> = { not_started: "#94a3b8", in_progress: "#0891b2", completed: "#059669", blocked: "#d13438" };
const MODULE_COLOR: Record<string, string> = {
  "UCaaS": "#0078d4", "CCaaS": "#8764b8", "Integrations": "#ca5010",
  "AI Expert Assist": "#059669", "Quality Management": "#e74856", "Workforce Management": "#b146c2",
};

function fmt(d: string | null): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CustomPlan({ projectId, canEdit, view }: { projectId: string; canEdit: boolean; view: "timeline" | "tasks" }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<CustomPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  // Assignee picker options: PF staff on the project + customer/partner contacts.
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [contactNames, setContactNames] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    api.customPlan(projectId)
      .then(({ items }) => setItems(items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);
  useEffect(load, [load]);

  useEffect(() => {
    Promise.all([
      api.projectStaff(projectId).catch(() => []),
      api.projectContacts(projectId).catch(() => []),
    ]).then(([staff, contacts]) => {
      setStaffNames([...new Set(staff.map((s) => s.name ?? s.email).filter(Boolean) as string[])]);
      setContactNames([...new Set(contacts.map((c) => c.name).filter(Boolean) as string[])]);
    });
  }, [projectId]);

  // Sections in first-appearance order (they are the "stages").
  const sections = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const it of items) if (!seen.has(it.section)) { seen.add(it.section); out.push(it.section); }
    return out;
  }, [items]);

  async function patch(id: string, field: keyof CustomPlanItem, value: unknown) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } as CustomPlanItem : it)));
    try { await api.updateCustomPlanItem(projectId, id, { [field]: value } as never); }
    catch (err) { showToast(err instanceof Error ? err.message : "Save failed", "error"); load(); }
  }
  async function addItem(section: string, parent: CustomPlanItem | null) {
    try {
      await api.addCustomPlanItem(projectId, { section, parent_id: parent?.id ?? null, depth: parent ? parent.depth + 1 : 0, name: "New item" });
      load();
    } catch (err) { showToast(err instanceof Error ? err.message : "Add failed", "error"); }
  }
  async function del(it: CustomPlanItem) {
    const kids = items.some((x) => x.parent_id === it.id);
    if (!window.confirm(`Delete "${it.name}"${kids ? " and everything under it" : ""}?`)) return;
    try { await api.deleteCustomPlanItem(projectId, it.id); load(); }
    catch (err) { showToast(err instanceof Error ? err.message : "Delete failed", "error"); }
  }
  async function runImport() {
    setImporting(true);
    try { const { imported } = await api.importCustomPlan(projectId); showToast(`Imported ${imported} plan items.`, "success"); load(); }
    catch (err) { showToast(err instanceof Error ? err.message : "Import failed", "error"); }
    finally { setImporting(false); }
  }

  if (loading) return <div style={{ padding: 24, color: "#64748b" }}>Loading plan…</div>;

  if (items.length === 0) {
    return (
      <div className="ms-section-card">
        <div className="ms-section-title">Project Plan</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>No custom plan imported yet for this project.</div>
        {canEdit && <button className="ms-btn-primary" onClick={runImport} disabled={importing}>{importing ? "Importing…" : "Import plan from Asana export"}</button>}
      </div>
    );
  }

  return view === "timeline"
    ? <TimelineView items={items} sections={sections} />
    : <TasksView items={items} sections={sections} canEdit={canEdit} patch={patch} addItem={addItem} del={del} onReimport={canEdit ? runImport : undefined} importing={importing} staffNames={staffNames} contactNames={contactNames} />;
}

// ── Timeline: sections as dated bands over the project range; each expands to
//    reveal its tasks as indented sub-bars on the same axis. ─────────────────
function TimelineView({ items, sections }: { items: CustomPlanItem[]; sections: string[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (sec: string) => setExpanded((prev) => { const n = new Set(prev); n.has(sec) ? n.delete(sec) : n.add(sec); return n; });

  const dated = items.filter((i) => i.start_date || i.due_date);
  const startOf = (i: CustomPlanItem) => Date.parse((i.start_date ?? i.due_date)! + "T00:00:00");
  const endOf = (i: CustomPlanItem) => Date.parse((i.due_date ?? i.start_date)! + "T00:00:00");
  const all = dated.flatMap((i) => [startOf(i), endOf(i)]);
  const min = Math.min(...all), max = Math.max(...all);
  const span = Math.max(1, max - min);
  const pct = (d: number) => `${((d - min) / span) * 100}%`;
  const iso = (d: number) => new Date(d).toISOString().slice(0, 10);

  return (
    <div className="ms-section-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>Timeline</div>
        {sections.length > 0 && (
          <button className="ms-btn-ghost" style={{ fontSize: 12 }} onClick={() => setExpanded(expanded.size ? new Set() : new Set(sections))}>
            {expanded.size ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>{fmt(iso(min))} → {fmt(iso(max))}</div>
      <div style={{ display: "grid", gap: 3 }}>
        {sections.map((sec) => {
          const its = dated.filter((i) => i.section === sec);
          if (its.length === 0) return null;
          const s = Math.min(...its.map(startOf)), e = Math.max(...its.map(endOf));
          const isOpen = expanded.has(sec);
          const rows = its.slice().sort((a, b) => a.sort_order - b.sort_order);
          return (
            <div key={sec}>
              {/* Section band — click to expand/collapse its tasks. */}
              <div onClick={() => toggle(sec)} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "2px 0" }}>
                <div style={{ width: 170, flexShrink: 0, fontSize: 13, fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "#94a3b8", width: 10 }}>{isOpen ? "▼" : "▶"}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec}</span>
                </div>
                <div style={{ flex: 1, position: "relative", height: 22, background: "#f1f5f9", borderRadius: 4 }}>
                  <div title={`${fmt(iso(s))} → ${fmt(iso(e))}`}
                    style={{ position: "absolute", left: pct(s), width: `calc(${pct(e)} - ${pct(s)})`, minWidth: 4, top: 3, bottom: 3, background: "#0891b2", borderRadius: 4 }} />
                </div>
                <div style={{ width: 160, flexShrink: 0, fontSize: 11, color: "#64748b", textAlign: "right" }}>{fmt(iso(s))} → {fmt(iso(e))}</div>
              </div>
              {/* Expanded: each dated task as an indented sub-bar. */}
              {isOpen && rows.map((it) => {
                const is = startOf(it), ie = endOf(it);
                return (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "1px 0" }}>
                    <div title={it.name} style={{ width: 170, flexShrink: 0, fontSize: 11, color: "#64748b", paddingLeft: 20 + it.depth * 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                    <div style={{ flex: 1, position: "relative", height: 13, background: "#f8fafc", borderRadius: 3 }}>
                      <div title={`${fmt(iso(is))} → ${fmt(iso(ie))}`}
                        style={{ position: "absolute", left: pct(is), width: `calc(${pct(ie)} - ${pct(is)})`, minWidth: 3, top: 2, bottom: 2, background: it.depth === 0 ? "#38bdf8" : "#7dd3fc", borderRadius: 3 }} />
                    </div>
                    <div style={{ width: 160, flexShrink: 0, fontSize: 10, color: "#94a3b8", textAlign: "right" }}>{fmt(iso(is))} → {fmt(iso(ie))}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tasks: nested outline grouped by section, inline-editable ──────────────────
function TasksView({ items, sections, canEdit, patch, addItem, del, onReimport, importing, staffNames, contactNames }: {
  items: CustomPlanItem[]; sections: string[]; canEdit: boolean;
  patch: (id: string, f: keyof CustomPlanItem, v: unknown) => void;
  addItem: (section: string, parent: CustomPlanItem | null) => void;
  del: (it: CustomPlanItem) => void;
  onReimport?: () => void; importing: boolean;
  staffNames: string[]; contactNames: string[];
}) {
  // Order within a section: preserve sort_order, but render as a tree (parents
  // before their children). The seed is already in document order, so sort_order
  // ascending within a section yields a correct outline.
  const perSection = (sec: string) => items.filter((i) => i.section === sec).sort((a, b) => a.sort_order - b.sort_order);

  const cell: React.CSSProperties = { padding: "3px 6px", fontSize: 13, verticalAlign: "top" };
  const input: React.CSSProperties = { width: "100%", border: "1px solid transparent", background: "transparent", fontSize: 13, padding: "2px 4px", borderRadius: 4, color: "#1e293b" };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {canEdit && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="ms-btn-ghost" style={{ fontSize: 12 }} onClick={onReimport} disabled={importing} title="Re-import from the Asana export (replaces the current plan)">
            {importing ? "Re-importing…" : "↻ Re-import from Asana"}
          </button>
        </div>
      )}
      {sections.map((sec) => (
        <div key={sec} className="ms-section-card" style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>{sec}</div>
            {canEdit && <button className="ms-btn-ghost" style={{ fontSize: 12 }} onClick={() => addItem(sec, null)}>+ Task</button>}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ ...cell, textAlign: "left" }}>Task</th>
                  <th style={{ ...cell, textAlign: "left", width: 120 }}>Module</th>
                  <th style={{ ...cell, textAlign: "left", width: 120 }}>Start</th>
                  <th style={{ ...cell, textAlign: "left", width: 120 }}>Due</th>
                  <th style={{ ...cell, textAlign: "left", width: 130 }}>Status</th>
                  <th style={{ ...cell, textAlign: "left", width: 150 }}>Assignee</th>
                  {canEdit && <th style={{ ...cell, width: 70 }} />}
                </tr>
              </thead>
              <tbody>
                {perSection(sec).map((it) => (
                  <tr key={it.id} style={{ borderBottom: "1px solid #f5f7fa" }}>
                    <td style={cell}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: it.depth * 22 }}>
                        {it.depth > 0 && <span style={{ color: "#cbd5e1", flexShrink: 0 }}>{it.depth === 1 ? "└" : "·"}</span>}
                        <input
                          defaultValue={it.name}
                          disabled={!canEdit}
                          style={{ ...input, fontWeight: it.depth === 0 ? 600 : 400, color: it.depth === 0 ? "#1e293b" : "#475569" }}
                          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.name) patch(it.id, "name", v); }}
                          title={it.notes ?? undefined}
                        />
                        {it.notes && <span title={it.notes} style={{ color: "#94a3b8", flexShrink: 0, cursor: "help" }}>🗒</span>}
                      </div>
                    </td>
                    <td style={cell}>
                      {it.module && it.module !== "Not Applicable" ? (
                        <span className="ms-badge" style={{ fontSize: 10, background: (MODULE_COLOR[it.module] ?? "#64748b") + "1a", color: MODULE_COLOR[it.module] ?? "#64748b", border: `1px solid ${(MODULE_COLOR[it.module] ?? "#64748b")}40` }}>{it.module}</span>
                      ) : <span style={{ color: "#cbd5e1", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={cell}>
                      {canEdit ? <input type="date" defaultValue={it.start_date ?? ""} style={input} onChange={(e) => patch(it.id, "start_date", e.target.value || null)} />
                        : <span style={{ fontSize: 12, color: "#64748b" }}>{fmt(it.start_date)}</span>}
                    </td>
                    <td style={cell}>
                      {canEdit ? <input type="date" defaultValue={it.due_date ?? ""} style={input} onChange={(e) => patch(it.id, "due_date", e.target.value || null)} />
                        : <span style={{ fontSize: 12, color: "#64748b" }}>{fmt(it.due_date)}</span>}
                    </td>
                    <td style={cell}>
                      <select value={it.status} disabled={!canEdit} onChange={(e) => patch(it.id, "status", e.target.value)}
                        style={{ ...input, fontWeight: 600, color: STATUS_COLOR[it.status] ?? "#1e293b" }}>
                        {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </td>
                    <td style={cell}>
                      <select
                        value={it.assignee ?? ""}
                        disabled={!canEdit}
                        style={{ ...input, fontSize: 12, color: "#475569" }}
                        onChange={(e) => patch(it.id, "assignee", e.target.value || null)}
                      >
                        <option value="">— Unassigned —</option>
                        {/* Preserve the imported Asana label (a role like "Customer, Engineer")
                            if it isn't one of the pickable people, so it still shows. */}
                        {it.assignee && !staffNames.includes(it.assignee) && !contactNames.includes(it.assignee) && (
                          <option value={it.assignee}>{it.assignee}</option>
                        )}
                        {staffNames.length > 0 && (
                          <optgroup label="PF Staff">
                            {staffNames.map((n) => <option key={`s:${n}`} value={n}>{n}</option>)}
                          </optgroup>
                        )}
                        {contactNames.length > 0 && (
                          <optgroup label="Customer / Partner Contacts">
                            {contactNames.map((n) => <option key={`c:${n}`} value={n}>{n}</option>)}
                          </optgroup>
                        )}
                      </select>
                    </td>
                    {canEdit && (
                      <td style={{ ...cell, whiteSpace: "nowrap", textAlign: "right" }}>
                        {it.depth < 2 && <button title="Add subtask" onClick={() => addItem(it.section, it)} style={{ background: "none", border: "none", cursor: "pointer", color: "#0891b2", fontSize: 13, padding: "0 4px" }}>＋</button>}
                        <button title="Delete" onClick={() => del(it)} style={{ background: "none", border: "none", cursor: "pointer", color: "#d13438", fontSize: 13, padding: "0 4px" }}>✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
