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
import { api, type CustomPlanItem, type Risk } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";
import { PLAN_DATE_MAX, PLAN_DATE_MIN, isPlanDate } from "../../../shared/planDates";

const STATUS = ["not_started", "in_progress", "completed", "blocked"] as const;
const STATUS_LABEL: Record<string, string> = { not_started: "Not Started", in_progress: "In Progress", completed: "Completed", blocked: "Blocked" };
const STATUS_COLOR: Record<string, string> = { not_started: "#94a3b8", in_progress: "#0891b2", completed: "#059669", blocked: "#d13438" };
const MODULE_COLOR: Record<string, string> = {
  "UCaaS": "#0078d4", "CCaaS": "#8764b8", "Integrations": "#ca5010",
  "AI Expert Assist": "#059669", "Quality Management": "#e74856", "Workforce Management": "#b146c2",
};
// Selectable module tags (the set the Asana export used). "Not Applicable" == none.
const MODULE_OPTIONS = ["UCaaS", "CCaaS", "Integrations", "AI Expert Assist", "Quality Management", "Workforce Management", "Not Applicable"];

function fmt(d: string | null): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Date plausibility (isPlanDate / PLAN_DATE_*) lives in shared/planDates.ts —
// this module's Timeline is what surfaced the bug, but the guard applies app-wide.

export default function CustomPlan({ projectId, canEdit, view }: { projectId: string; canEdit: boolean; view: "timeline" | "tasks" }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<CustomPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  // Assignee picker options: PF staff (real user ids → notifications + My Tasks)
  // and customer/partner contacts (contact ids). Carry ids, not just names.
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  // Blockers (risks) that link to a plan item — drives the ⛔ glyph on the Tasks
  // outline. Managed from the project's Blockers tab; read-only indicator here.
  const [blockers, setBlockers] = useState<Risk[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    api.customPlan(projectId)
      .then(({ items }) => setItems(items))
      .catch(() => {})
      .finally(() => setLoading(false));
    api.risks(projectId).then(setBlockers).catch(() => {});
  }, [projectId]);
  useEffect(load, [load]);

  useEffect(() => {
    Promise.all([
      api.projectStaff(projectId).catch(() => []),
      api.projectContacts(projectId).catch(() => []),
    ]).then(([staffRows, contactRows]) => {
      // De-dupe staff by user_id (a person can hold multiple staff roles).
      const seen = new Set<string>();
      const s: { id: string; name: string }[] = [];
      for (const m of staffRows) {
        if (!m.user_id || seen.has(m.user_id)) continue;
        seen.add(m.user_id);
        s.push({ id: m.user_id, name: m.name ?? m.email });
      }
      setStaff(s);
      setContacts(contactRows.filter((c) => c.name).map((c) => ({ id: c.id, name: c.name })));
    });
  }, [projectId]);

  // Sections in first-appearance order (they are the "stages").
  const sections = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const it of items) if (!seen.has(it.section)) { seen.add(it.section); out.push(it.section); }
    return out;
  }, [items]);

  // Active (non-closed) blockers keyed by the plan item they block.
  const blockersByItem = useMemo(() => {
    const m = new Map<string, Risk[]>();
    for (const b of blockers) {
      if (!b.custom_plan_item_id || b.status === "closed") continue;
      const arr = m.get(b.custom_plan_item_id) ?? [];
      arr.push(b);
      m.set(b.custom_plan_item_id, arr);
    }
    return m;
  }, [blockers]);

  async function patch(id: string, field: keyof CustomPlanItem, value: unknown) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } as CustomPlanItem : it)));
    try { await api.updateCustomPlanItem(projectId, id, { [field]: value } as never); }
    catch (err) { showToast(err instanceof Error ? err.message : "Save failed", "error"); load(); }
  }
  // Assignee spans three columns (real user ref, contact ref, display label) and
  // must be set atomically so notifications fire on the correct field.
  async function patchMany(id: string, partial: Partial<CustomPlanItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...partial } as CustomPlanItem : it)));
    try { await api.updateCustomPlanItem(projectId, id, partial as never); }
    catch (err) { showToast(err instanceof Error ? err.message : "Save failed", "error"); load(); }
  }
  async function addItem(section: string, parent: CustomPlanItem | null) {
    try {
      await api.addCustomPlanItem(projectId, { section, parent_id: parent?.id ?? null, depth: parent ? parent.depth + 1 : 0, name: "New item" });
      load();
    } catch (err) { showToast(err instanceof Error ? err.message : "Add failed", "error"); }
  }
  async function addDep(itemId: string, dependsOnItemId: string) {
    try { await api.addCustomPlanDep(projectId, itemId, dependsOnItemId); load(); }
    catch (err) { showToast(err instanceof Error ? err.message : "Couldn't add dependency", "error"); }
  }
  async function removeDep(itemId: string, depId: string) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, blocked_by: it.blocked_by.filter((d) => d !== depId) } : it)));
    try { await api.removeCustomPlanDep(projectId, itemId, depId); }
    catch (err) { showToast(err instanceof Error ? err.message : "Couldn't remove dependency", "error"); load(); }
  }
  async function del(it: CustomPlanItem) {
    const kids = items.some((x) => x.parent_id === it.id);
    if (!window.confirm(`Delete "${it.name}"${kids ? " and everything under it" : ""}?`)) return;
    try { await api.deleteCustomPlanItem(projectId, it.id); load(); }
    catch (err) { showToast(err instanceof Error ? err.message : "Delete failed", "error"); }
  }
  async function runImport() {
    // Re-import REPLACES the plan (delete + reinsert with fresh ids), so it
    // discards everything done since the last import. Guard the destructive case
    // with an explicit confirm so nothing is lost silently — notably blocker
    // links, which otherwise vanish (the FK is ON DELETE SET NULL) while the
    // blockers themselves linger orphaned on the Blockers tab. First-time import
    // (empty state) has nothing to lose, so it skips the prompt.
    if (items.length > 0 && !window.confirm(
      "Re-import REPLACES the entire plan with the Asana baseline.\n\n" +
      "This permanently discards everything changed since the last import:\n" +
      "• edits, added tasks, dates, statuses\n" +
      "• assignees\n" +
      "• task dependencies (blocked-by)\n" +
      "• blocker links — the blockers stay on the Blockers tab but lose their task association\n\n" +
      "Continue?"
    )) return;
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
    : <TasksView items={items} sections={sections} canEdit={canEdit} patch={patch} patchMany={patchMany} addItem={addItem} del={del} addDep={addDep} removeDep={removeDep} onReimport={canEdit ? runImport : undefined} importing={importing} staff={staff} contacts={contacts} blockersByItem={blockersByItem} />;
}

// ── Timeline: sections as dated bands over the project range; each expands to
//    reveal its tasks as indented sub-bars on the same axis. ─────────────────
function TimelineView({ items, sections }: { items: CustomPlanItem[]; sections: string[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (sec: string) => setExpanded((prev) => { const n = new Set(prev); n.has(sec) ? n.delete(sec) : n.add(sec); return n; });

  // Only plausible dates bound the axis — an out-of-window value (see
  // isPlanDate) would otherwise blow the scale out by centuries. An item keeps
  // its bar as long as ONE of its two dates is usable; it falls back to that one.
  const dated = items.filter((i) => isPlanDate(i.start_date) || isPlanDate(i.due_date));
  const startOf = (i: CustomPlanItem) => Date.parse((isPlanDate(i.start_date) ? i.start_date : i.due_date!) + "T00:00:00");
  const endOf = (i: CustomPlanItem) => Date.parse((isPlanDate(i.due_date) ? i.due_date : i.start_date!) + "T00:00:00");

  // Rows carrying a date the axis had to ignore — surfaced so a PM can go fix
  // the value on the Tasks tab instead of wondering why a bar is missing.
  const badDates = items.filter(
    (i) => (i.start_date && !isPlanDate(i.start_date)) || (i.due_date && !isPlanDate(i.due_date)),
  );

  const all = dated.flatMap((i) => [startOf(i), endOf(i)]);
  const min = all.length ? Math.min(...all) : 0, max = all.length ? Math.max(...all) : 0;
  const span = Math.max(1, max - min);
  const pct = (d: number) => `${((d - min) / span) * 100}%`;
  const iso = (d: number) => new Date(d).toISOString().slice(0, 10);

  const badDateNotice = badDates.length > 0 && (
    <div style={{ marginBottom: 12, padding: "8px 10px", borderRadius: 6, background: "#fef3c7", border: "1px solid #fcd34d", fontSize: 12, color: "#92400e" }}>
      <strong>{badDates.length} task{badDates.length === 1 ? " has" : "s have"} an out-of-range date</strong> (ignored by the chart) — fix on the Tasks tab:
      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {badDates.slice(0, 5).map((i) => (
          <li key={i.id}>
            {i.name}
            {i.start_date && !isPlanDate(i.start_date) && <> — start <code>{i.start_date}</code></>}
            {i.due_date && !isPlanDate(i.due_date) && <> — due <code>{i.due_date}</code></>}
          </li>
        ))}
        {badDates.length > 5 && <li>…and {badDates.length - 5} more</li>}
      </ul>
    </div>
  );

  if (all.length === 0) {
    return (
      <div className="ms-section-card">
        <div className="ms-section-title" style={{ margin: 0, border: "none", padding: 0 }}>Timeline</div>
        {badDateNotice}
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>No tasks have a usable start or due date yet.</div>
      </div>
    );
  }

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
      {badDateNotice}
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

// ── A date cell that won't persist a half-typed year ──────────────────────────
// `<input type="date">` fires `change` on every segment edit, reporting the year
// zero-padded as it's typed ("2" → 0002, "20" → 0020, "26" → 0026). Saving those
// intermediates is what put a year-26 date in the plan and wrecked the Timeline
// axis. Commit only a plausible date; hold anything else until it's usable, and
// flag it inline so a typo isn't silently dropped.
function DateCell({ value, onCommit }: { value: string | null; onCommit: (v: string | null) => void }) {
  const [pending, setPending] = useState<string | null>(null);
  return (
    <>
      <input
        type="date"
        min={PLAN_DATE_MIN}
        max={PLAN_DATE_MAX}
        defaultValue={value ?? ""}
        style={{ width: "100%", border: pending ? "1px solid #f0a30a" : "1px solid transparent", background: "transparent", fontSize: 13, padding: "2px 4px", borderRadius: 4, color: "#1e293b" }}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) { setPending(null); onCommit(null); return; }
          if (isPlanDate(v)) { setPending(null); onCommit(v); return; }
          setPending(v); // keep typing — year not plausible yet
        }}
        onBlur={() => { if (pending) setPending(null); }}
      />
      {pending && (
        <div title={`${pending} is outside ${PLAN_DATE_MIN}…${PLAN_DATE_MAX} — not saved`} style={{ fontSize: 10, color: "#92400e", paddingLeft: 4 }}>
          not saved — check the year
        </div>
      )}
    </>
  );
}

// ── Tasks: nested outline grouped by section, inline-editable ──────────────────
function TasksView({ items, sections, canEdit, patch, patchMany, addItem, del, addDep, removeDep, onReimport, importing, staff, contacts, blockersByItem }: {
  items: CustomPlanItem[]; sections: string[]; canEdit: boolean;
  patch: (id: string, f: keyof CustomPlanItem, v: unknown) => void;
  patchMany: (id: string, partial: Partial<CustomPlanItem>) => void;
  addItem: (section: string, parent: CustomPlanItem | null) => void;
  del: (it: CustomPlanItem) => void;
  addDep: (itemId: string, dependsOnItemId: string) => void;
  removeDep: (itemId: string, depId: string) => void;
  onReimport?: () => void; importing: boolean;
  staff: { id: string; name: string }[]; contacts: { id: string; name: string }[];
  blockersByItem: Map<string, Risk[]>;
}) {
  // Order within a section: preserve sort_order, but render as a tree (parents
  // before their children). The seed is already in document order, so sort_order
  // ascending within a section yields a correct outline.
  const perSection = (sec: string) => items.filter((i) => i.section === sec).sort((a, b) => a.sort_order - b.sort_order);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const incompleteDeps = (it: CustomPlanItem) => it.blocked_by.filter((id) => byId.get(id)?.status !== "completed");
  // The dependency picker is opened per-row on demand (kept off the row until
  // asked for) so every task isn't carrying a dropdown.
  const [addDepFor, setAddDepFor] = useState<string | null>(null);

  // Soft enforcement: warn (but allow) when completing a task whose dependencies
  // aren't all done yet.
  function changeStatus(it: CustomPlanItem, next: string) {
    if (next === "completed") {
      const open = incompleteDeps(it).map((id) => byId.get(id)?.name).filter(Boolean);
      if (open.length && !window.confirm(`This task is still blocked by:\n\n• ${open.join("\n• ")}\n\nComplete it anyway?`)) return;
    }
    patch(it.id, "status", next);
  }

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
                        {(() => {
                          const bl = blockersByItem.get(it.id);
                          if (!bl?.length) return null;
                          const tip = "Blocked by:\n" + bl.map((b) => `⛔ ${b.title}${b.severity ? ` (${b.severity})` : ""}`).join("\n") + "\n\n(manage on the Blockers tab)";
                          return <span title={tip} style={{ color: "#d13438", flexShrink: 0, cursor: "help", fontSize: 12 }}>⛔</span>;
                        })()}
                        {canEdit && (
                          <button
                            onClick={() => setAddDepFor((cur) => (cur === it.id ? null : it.id))}
                            title="Add a dependency (a task this one is blocked by)"
                            style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", padding: "0 2px", color: addDepFor === it.id ? "#0891b2" : "#cbd5e1" }}
                          >
                            + dep
                          </button>
                        )}
                      </div>
                      {(it.blocked_by.length > 0 || addDepFor === it.id) && (
                        <div style={{ paddingLeft: it.depth * 22 + 18, marginTop: 3, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                          {it.blocked_by.length > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0, color: incompleteDeps(it).length ? "#d13438" : "#16a34a" }}>
                              {incompleteDeps(it).length ? "⛔ Blocked by" : "✓ Prereqs done"}
                            </span>
                          )}
                          {it.blocked_by.map((dep) => {
                            const d = byId.get(dep);
                            if (!d) return null;
                            const done = d.status === "completed";
                            return (
                              <span key={dep} style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 3, borderRadius: 4, padding: "1px 5px", background: done ? "#dcfce7" : "#fee2e2", color: done ? "#166534" : "#991b1b" }}>
                                {done ? "✓" : "•"} {d.name}
                                {canEdit && <button onClick={() => removeDep(it.id, dep)} title="Remove dependency" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 10, padding: 0, lineHeight: 1 }}>✕</button>}
                              </span>
                            );
                          })}
                          {addDepFor === it.id && (
                            <select
                              value=""
                              autoFocus
                              onChange={(e) => { if (e.target.value) { addDep(it.id, e.target.value); setAddDepFor(null); } }}
                              onBlur={() => setAddDepFor(null)}
                              title="Add a task this one is blocked by"
                              style={{ fontSize: 10, border: "1px dashed #0891b2", borderRadius: 4, background: "transparent", color: "#64748b", padding: "1px 3px", maxWidth: 190 }}
                            >
                              <option value="">Select prerequisite task…</option>
                              {sections.map((sec) => {
                                const cands = items.filter((cand) => cand.section === sec && cand.id !== it.id && !it.blocked_by.includes(cand.id));
                                if (!cands.length) return null;
                                return <optgroup key={sec} label={sec}>{cands.map((cand) => <option key={cand.id} value={cand.id}>{cand.name}</option>)}</optgroup>;
                              })}
                            </select>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={cell}>
                      {canEdit ? (
                        <select
                          value={it.module ?? ""}
                          style={{ ...input, fontSize: 11, fontWeight: 600, color: it.module && it.module !== "Not Applicable" ? (MODULE_COLOR[it.module] ?? "#64748b") : "#94a3b8" }}
                          onChange={(e) => patch(it.id, "module", e.target.value || null)}
                        >
                          <option value="">—</option>
                          {MODULE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                          {it.module && !MODULE_OPTIONS.includes(it.module) && <option value={it.module}>{it.module}</option>}
                        </select>
                      ) : it.module && it.module !== "Not Applicable" ? (
                        <span className="ms-badge" style={{ fontSize: 10, background: (MODULE_COLOR[it.module] ?? "#64748b") + "1a", color: MODULE_COLOR[it.module] ?? "#64748b", border: `1px solid ${(MODULE_COLOR[it.module] ?? "#64748b")}40` }}>{it.module}</span>
                      ) : <span style={{ color: "#cbd5e1", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={cell}>
                      {canEdit ? <DateCell value={it.start_date} onCommit={(v) => patch(it.id, "start_date", v)} />
                        : <span style={{ fontSize: 12, color: "#64748b" }}>{fmt(it.start_date)}</span>}
                    </td>
                    <td style={cell}>
                      {canEdit ? <DateCell value={it.due_date} onCommit={(v) => patch(it.id, "due_date", v)} />
                        : <span style={{ fontSize: 12, color: "#64748b" }}>{fmt(it.due_date)}</span>}
                    </td>
                    <td style={cell}>
                      <select value={it.status} disabled={!canEdit} onChange={(e) => changeStatus(it, e.target.value)}
                        style={{ ...input, fontWeight: 600, color: STATUS_COLOR[it.status] ?? "#1e293b" }}>
                        {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </td>
                    <td style={cell}>
                      {(() => {
                        // Resolved display name: real user/contact ref wins, else
                        // the imported Asana label (a role like "Customer, Engineer").
                        const resolved = it.assignee_user_id
                          ? staff.find((s) => s.id === it.assignee_user_id)?.name ?? it.assignee
                          : it.assignee_contact_id
                          ? contacts.find((ct) => ct.id === it.assignee_contact_id)?.name ?? it.assignee
                          : it.assignee;
                        if (!canEdit) return <span style={{ fontSize: 12, color: "#475569" }}>{resolved || "—"}</span>;
                        // A real assignment (a person) selects that option; an
                        // un-mapped imported label shows via the sentinel "lbl".
                        const val = it.assignee_user_id ? `u:${it.assignee_user_id}`
                          : it.assignee_contact_id ? `c:${it.assignee_contact_id}`
                          : it.assignee ? "lbl" : "";
                        return (
                          <select
                            value={val}
                            style={{ ...input, fontSize: 12, color: "#475569" }}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "lbl") return; // no-op: keep the imported label
                              if (!v) { patchMany(it.id, { assignee_user_id: null, assignee_contact_id: null, assignee: null }); return; }
                              const kind = v.slice(0, 1), id = v.slice(2);
                              if (kind === "u") {
                                const s = staff.find((x) => x.id === id);
                                patchMany(it.id, { assignee_user_id: id, assignee_contact_id: null, assignee: s?.name ?? null });
                              } else {
                                const ct = contacts.find((x) => x.id === id);
                                patchMany(it.id, { assignee_contact_id: id, assignee_user_id: null, assignee: ct?.name ?? null });
                              }
                            }}
                          >
                            <option value="">— Unassigned —</option>
                            {it.assignee && !it.assignee_user_id && !it.assignee_contact_id && (
                              <option value="lbl">{it.assignee} (imported)</option>
                            )}
                            {staff.length > 0 && (
                              <optgroup label="PF Staff">
                                {staff.map((s) => <option key={s.id} value={`u:${s.id}`}>{s.name}</option>)}
                              </optgroup>
                            )}
                            {contacts.length > 0 && (
                              <optgroup label="Customer / Partner Contacts">
                                {contacts.map((ct) => <option key={ct.id} value={`c:${ct.id}`}>{ct.name}</option>)}
                              </optgroup>
                            )}
                          </select>
                        );
                      })()}
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
