/**
 * Project Dashboard tab — stakeholder-facing read view.
 *
 * Anchored on a single project but rolls up across all in-flight projects
 * for the same customer. The "Sites" row (was "Phase progress" in the
 * original mockup) shows sibling projects — e.g. City of Thousand Oaks
 * has separate Libraries / Treatment-Waste / HQ projects with their own
 * go-live dates. Single-project customers hide the Sites row entirely.
 *
 * Renders one round-trip's worth of data (api.stakeholderSummary):
 * five rollup stat tiles, the adaptive Sites row, and three detail
 * columns (open tasks + assignee breakdown / blockers + key updates /
 * team & links). The project's own page-header (customer card, name,
 * status, tech tags, Edit) already lives above the tab strip — this
 * component intentionally adds no second title bar.
 *
 * Internal staff, customer contacts authenticated as `client` users
 * matched to the project's account, and partner AEs explicitly attached
 * via project_staff all see the same payload; access is enforced
 * server-side via canViewProject().
 */

import { useEffect, useState } from "react";
import { api, type StakeholderSummary } from "../../lib/api";

const PF_GREEN = "#17C662";

const TONE = {
  on_track:  { label: "On track",  fg: "#166534", bg: "#dcfce7" },
  at_risk:   { label: "Monitor",   fg: "#92400e", bg: "#fef3c7" },
  off_track: { label: "At risk",   fg: "#991b1b", bg: "#fee2e2" },
};

const SEVERITY_TONE: Record<string, { fg: string; bg: string; border: string }> = {
  critical: { fg: "#7f1d1d", bg: "#fee2e2", border: "#fca5a5" },
  high:     { fg: "#92400e", bg: "#fef3c7", border: "#fcd34d" },
  medium:   { fg: "#1e40af", bg: "#dbeafe", border: "#93c5fd" },
  low:      { fg: "#374151", bg: "#f3f4f6", border: "#d1d5db" },
};

export default function ProjectDashboardTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<StakeholderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.stakeholderSummary(projectId)
      .then((res) => { setData(res); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <Center>Loading dashboard…</Center>;
  if (error) return <Center error>{error}</Center>;
  if (!data) return <Center>No data.</Center>;

  const { stats, related_projects, open_tasks, assignee_breakdown, blockers, key_updates, team, links } = data;
  const multiSite = related_projects.length > 1;
  const rollupLabel = multiSite ? `Across ${related_projects.length} sites` : "Across this project";

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Tile
          label="Overall complete"
          value={`${stats.overall_complete_pct}%`}
          sublabel={rollupLabel}
        />
        <Tile
          label="Total tasks"
          value={`${stats.tasks.total}`}
          sublabel={`${stats.tasks.done} done · ${stats.tasks.in_progress} in progress`}
        />
        <Tile
          label="Blockers"
          value={`${stats.blockers.total}`}
          sublabel={stats.blockers.critical > 0 ? `${stats.blockers.critical} critical` : "—"}
          danger={stats.blockers.critical > 0}
        />
        <Tile
          label={multiSite ? "Days to final go-live" : "Days to go-live"}
          value={stats.days_to_final_go_live !== null ? `${stats.days_to_final_go_live}` : "—"}
          sublabel={stats.target_go_live_date ? `${fmtDate(stats.target_go_live_date)} target` : "Not set"}
        />
        <Tile
          label="Next call"
          value={stats.next_call ? fmtCallDate(stats.next_call.scheduled_at) : "—"}
          sublabel={stats.next_call ? fmtCallSubLabel(stats.next_call) : "Not scheduled"}
        />
      </div>

      {/* Sites row — hidden when there's only one project under the customer */}
      {multiSite && (
        <>
          <SectionLabel>Sites</SectionLabel>
          <div style={{
            display: "grid",
            gridTemplateColumns: related_projects.length <= 3 ? `repeat(${related_projects.length}, 1fr)` : "repeat(3, 1fr)",
            gap: 12, marginBottom: 18,
          }}>
            {related_projects.map((rp) => (
              <SiteCard key={rp.id} site={rp} />
            ))}
          </div>
        </>
      )}

      <SectionLabel>Detail</SectionLabel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {/* Open tasks + assignee breakdown */}
        <Panel title="Open tasks">
          {open_tasks.length === 0 ? (
            <Empty>No open tasks</Empty>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {open_tasks.slice(0, 5).map((t) => (
                <li key={t.id} style={{ display: "flex", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                  <PriorityDot priority={t.priority} />
                  <span style={{ flex: 1, marginLeft: 8 }}>
                    {t.title}
                    {multiSite && t.project_name && (
                      <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 400, marginLeft: 6 }}>· {t.project_name}</span>
                    )}
                  </span>
                  <span style={{ color: dueTone(t.due_date), fontSize: 12, fontWeight: 500 }}>
                    {fmtDueDate(t.due_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {assignee_breakdown.length > 0 && multiSite && (
            <>
              <div style={{ marginTop: 16, marginBottom: 8, fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                By assignee
              </div>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <tbody>
                  {assignee_breakdown.slice(0, 6).map((a) => (
                    <tr key={a.user_id}>
                      <td style={{ padding: "4px 0", color: "#475569" }}>{a.name}</td>
                      {related_projects.map((rp, i) => (
                        <td key={rp.id} style={{ padding: "4px 0", textAlign: "right", color: "#64748b", paddingLeft: 8 }}>
                          <span style={{ color: "#94a3b8", fontSize: 10 }}>S{i + 1}</span> <strong style={{ color: "#334155" }}>{a.counts[rp.id] ?? 0}</strong>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>

        {/* Blockers + key updates */}
        <Panel title="Blockers">
          {blockers.length === 0 ? (
            <Empty>No active blockers</Empty>
          ) : (
            <div>
              {blockers.slice(0, 3).map((b) => {
                const tone = SEVERITY_TONE[b.severity ?? "medium"] ?? SEVERITY_TONE.medium;
                return (
                  <div key={b.id} style={{
                    background: tone.bg, border: `1px solid ${tone.border}`,
                    borderRadius: 6, padding: "8px 10px", marginBottom: 8,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: tone.fg }}>{b.title}</div>
                    {b.description && (
                      <div style={{ fontSize: 11, color: tone.fg, opacity: 0.85, marginTop: 2 }}>{b.description}</div>
                    )}
                    {multiSite && b.project_name && (
                      <div style={{ fontSize: 10, color: tone.fg, opacity: 0.7, marginTop: 4, fontWeight: 600 }}>{b.project_name}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 14, marginBottom: 8, fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Key updates
          </div>
          {key_updates.length === 0 ? (
            <Empty>No recent updates</Empty>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {key_updates.map((u) => (
                <li key={u.id} style={{ display: "flex", alignItems: "flex-start", padding: "5px 0", borderBottom: "1px solid #f1f5f9", fontSize: 12 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 6, background: u.kind === "document" ? PF_GREEN : "#3b82f6",
                    marginTop: 6, marginRight: 8, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, color: "#334155" }}>
                    {u.body}
                    {u.author_name && <span style={{ color: "#94a3b8" }}> — {u.author_name}</span>}
                  </span>
                  <span style={{ color: "#94a3b8", fontSize: 11, marginLeft: 8, whiteSpace: "nowrap" }}>{relative(u.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Team & links */}
        <Panel title="Team & links">
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <tbody>
              {team.pm && <TeamRow label="PM" name={team.pm.name ?? team.pm.email} />}
              {team.engineer && <TeamRow label="Engineer" name={team.engineer.name ?? team.engineer.email} />}
              {team.primary_contact && <TeamRow label="Contact" name={team.primary_contact.name} />}
              {team.partner_ae && <TeamRow label="Partner AE" name={team.partner_ae.name ?? team.partner_ae.email} />}
            </tbody>
          </table>

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {stats.next_call?.join_url && (
              <LinkButton href={stats.next_call.join_url} primary>
                Join {fmtCallDate(stats.next_call.scheduled_at)} call
              </LinkButton>
            )}
            {links.sharepoint_url && (
              <LinkButton href={links.sharepoint_url}>SharePoint documents</LinkButton>
            )}
            {links.crm_case_id && (
              <div style={{ ...linkButtonStyle(false), cursor: "default" }}>
                CRM case #{links.crm_case_id}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function Tile({ label, value, sublabel, danger }: { label: string; value: string; sublabel?: string; danger?: boolean }) {
  return (
    <div style={{
      background: "#1e293b", color: "#fff", borderRadius: 8, padding: "12px 14px", minHeight: 92,
      border: danger ? "1px solid #ef4444" : "1px solid #334155",
    }}>
      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: danger ? "#fca5a5" : "#fff" }}>{value}</div>
      {sublabel && <div style={{ fontSize: 11, color: danger ? "#fca5a5" : "#94a3b8", marginTop: 2 }}>{sublabel}</div>}
    </div>
  );
}

function SiteCard({ site }: { site: StakeholderSummary["related_projects"][number] }) {
  const tone = TONE[site.health];
  const border = site.is_current ? "2px solid #3b82f6" : "1px solid #334155";
  return (
    <div style={{ background: "#1e293b", border, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
          {site.name}
          {site.is_current && <span style={{ fontSize: 10, color: "#60a5fa", fontWeight: 600, marginLeft: 6 }}>· this site</span>}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
          background: tone.bg, color: tone.fg, whiteSpace: "nowrap",
        }}>
          {tone.label}
        </span>
      </div>
      <div style={{ background: "#0f172a", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ background: PF_GREEN, height: "100%", width: `${site.completion_pct}%` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, color: "#94a3b8" }}>
        <span>{site.target_go_live_date ? `Go-live: ${fmtDate(site.target_go_live_date)}` : "No date set"}</span>
        <span>{site.days_left !== null ? `${site.days_left} days left` : "—"}</span>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 8, padding: "14px 16px", border: "1px solid #334155", color: "#e2e8f0" }}>
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: "#fff" }}>{title}</div>
      <div style={{ background: "#fff", borderRadius: 6, padding: "10px 12px", color: "#0f172a" }}>
        {children}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, marginTop: 4 }}>
      {children}
    </div>
  );
}

function TeamRow({ label, name }: { label: string; name: string | null }) {
  return (
    <tr>
      <td style={{ padding: "4px 0", color: "#94a3b8", fontSize: 12, width: 90 }}>{label}</td>
      <td style={{ padding: "4px 0", color: "#0f172a", fontWeight: 600, textAlign: "right" }}>{name ?? "—"}</td>
    </tr>
  );
}

function PriorityDot({ priority }: { priority: string | null }) {
  const c = priority === "high" || priority === "critical" ? "#ef4444"
          : priority === "medium" ? "#f59e0b"
          : priority === "low" ? "#3b82f6"
          : "#94a3b8";
  return <span style={{ width: 7, height: 7, borderRadius: 7, background: c, display: "inline-block" }} />;
}

function LinkButton({ href, children, primary }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" style={linkButtonStyle(!!primary)}>{children}</a>;
}

function linkButtonStyle(primary: boolean): React.CSSProperties {
  return {
    display: "block", padding: "8px 12px",
    background: primary ? "#3b82f6" : "#f1f5f9",
    color: primary ? "#fff" : "#0f172a",
    borderRadius: 6, fontSize: 12, fontWeight: 600,
    textDecoration: "none", textAlign: "left",
  };
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ textAlign: "center", color: "#94a3b8", padding: "12px 0", fontSize: 12 }}>{children}</div>;
}

function Center({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div style={{ padding: 32, textAlign: "center", color: error ? "#991b1b" : "#64748b" }}>
      {children}
    </div>
  );
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function fmtCallDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return iso; }
}

function fmtCallSubLabel(call: { scheduled_at: string; title: string; source: string }): string {
  try {
    const t = new Date(call.scheduled_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    return `${t} · ${call.title}`;
  } catch {
    return call.title;
  }
}

function fmtDueDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dueMidnight = new Date(d); dueMidnight.setHours(0, 0, 0, 0);
    const diffDays = Math.round((dueMidnight.getTime() - today.getTime()) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays < 0)   return `${-diffDays}d overdue`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return iso; }
}

function dueTone(iso: string | null): string {
  if (!iso) return "#94a3b8";
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueMidnight = new Date(d); dueMidnight.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueMidnight.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0)  return "#ef4444";
  if (diffDays === 0) return "#ef4444";
  if (diffDays <= 3) return "#f59e0b";
  return "#94a3b8";
}

function relative(iso: string): string {
  try {
    const d = new Date(iso); const now = new Date();
    const mins = Math.round((now.getTime() - d.getTime()) / 60_000);
    if (mins < 60) return `${Math.max(mins, 1)}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days === 1) return "Yest.";
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
}
