/**
 * Project Dashboard tab — stakeholder-facing read view.
 *
 * Anchored on a single project. Stats are scoped to that project. Multi-phase
 * behavior lives INSIDE the project via the `phases` table: City of Thousand
 * Oaks is one project containing Libraries / Treatment / HQ phases, each with
 * its own per-phase PMI stage chain and go-live. The Phases row only renders
 * when the project has 1+ phases; single-phase projects get a clean two-row
 * layout (stat tiles + three detail panels).
 *
 * Styled to match the rest of the app (light theme on a white surface with
 * PF blue accents) — no dark-mode panels.
 *
 * Internal staff, customer contacts authenticated as `client` users
 * matched to the project's account, and partner AEs explicitly attached
 * via project_staff all see the same payload; access is enforced
 * server-side via canViewProject().
 */

import { useEffect, useState } from "react";
import { api, type StakeholderSummary } from "../../lib/api";

// PF brand palette (mirrored from index.css). Avoiding ad-hoc dark slate
// tokens — phase is light-themed throughout.
const PF_BLUE = "#03395f";
const PF_GREEN = "#17C662";
const PF_BORDER = "#dde4ef";
const TEXT_PRIMARY = "#0f172a";
const TEXT_MUTED = "#64748b";
const TEXT_FAINT = "#94a3b8";

const HEALTH_TONE = {
  on_track:  { label: "On track",  fg: "#166534", bg: "#dcfce7", border: "#bbf7d0" },
  at_risk:   { label: "Monitor",   fg: "#92400e", bg: "#fef3c7", border: "#fde68a" },
  off_track: { label: "At risk",   fg: "#991b1b", bg: "#fee2e2", border: "#fecaca" },
};

const SEVERITY_TONE: Record<string, { fg: string; bg: string; border: string }> = {
  critical: { fg: "#7f1d1d", bg: "#fef2f2", border: "#fecaca" },
  high:     { fg: "#92400e", bg: "#fffbeb", border: "#fde68a" },
  medium:   { fg: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" },
  low:      { fg: "#374151", bg: "#f8fafc", border: "#e2e8f0" },
};

// Constructed Dynamics CRM URL pattern — matches the link format already in
// use by support notifications. The short form (no appid) lets Dynamics pick
// the user's default app.
function dynamicsCaseUrl(caseId: string): string {
  return `https://packetfusioncrm.crm.dynamics.com/main.aspx?etn=incident&id=${caseId}&pagetype=entityrecord`;
}

export default function ProjectDashboardTab({ projectId, currentUserRole, onChangeTab }: { projectId: string; currentUserRole?: string; onChangeTab?: (tab: string) => void }) {
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

  const { stats, phases, open_tasks, assignee_stage_breakdown, blockers, key_updates, team, links, stage_progress } = data;
  const multiPhase = phases.length > 0;
  const rollupLabel = multiPhase ? `Across ${phases.length} phase${phases.length === 1 ? "" : "s"}` : "Across this project";

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Tile label="Overall complete" value={`${stats.overall_complete_pct}%`} sublabel={rollupLabel} />
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
          label={multiPhase ? "Days to final go-live" : "Days to go-live"}
          value={stats.days_to_final_go_live !== null ? `${stats.days_to_final_go_live}` : "—"}
          sublabel={stats.target_go_live_date ? `${fmtDate(stats.target_go_live_date)} target` : "Not set"}
        />
        <Tile
          label="Next call"
          value={stats.next_call ? fmtCallDate(stats.next_call.scheduled_at) : "—"}
          sublabel={stats.next_call ? fmtCallSubLabel(stats.next_call) : "Not scheduled"}
        />
      </div>

      {/* Phases row — hidden for single-phase projects */}
      {multiPhase && (
        <>
          <SectionLabel>Phases</SectionLabel>
          <div style={{
            display: "grid",
            gridTemplateColumns: phases.length <= 3 ? `repeat(${phases.length}, 1fr)` : "repeat(3, 1fr)",
            gap: 12, marginBottom: 18,
          }}>
            {phases.map((s) => <PhaseCard key={s.id} phase={s} />)}
          </div>
        </>
      )}

      {/* Stage progress — one column per phase (plus shared if multi-phase).
          Single-phase projects collapse to a single full-width column. */}
      {stage_progress.length > 0 && (
        <>
          <SectionLabel>Stage progress</SectionLabel>
          <div style={{
            background: "#fff", border: `1px solid ${PF_BORDER}`, borderRadius: 12,
            padding: "16px 18px", marginBottom: 18,
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${stage_progress.length}, minmax(0, 1fr))`,
              gap: 18,
            }}>
              {stage_progress.map((col) => (
                <div key={col.phase_id ?? "shared"} style={{ minWidth: 0 }}>
                  {stage_progress.length > 1 && (
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: PF_BLUE,
                      textTransform: "uppercase", letterSpacing: "0.1em",
                      marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${PF_BORDER}`,
                    }}>
                      {col.site_name ?? "Shared"}
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {col.stages.map((p) => <StageSlider key={p.id} stage={p} />)}
                  </div>
                </div>
              ))}
            </div>
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
                <li key={t.id} style={{ display: "flex", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${PF_BORDER}`, fontSize: 13 }}>
                  <PriorityDot priority={t.priority} />
                  <span style={{ flex: 1, marginLeft: 8, color: TEXT_PRIMARY }}>
                    {t.title}
                    {multiPhase && t.site_name && (
                      <span style={{ color: TEXT_FAINT, fontSize: 11, fontWeight: 400, marginLeft: 6 }}>· {t.site_name}</span>
                    )}
                  </span>
                  <span style={{ color: dueTone(t.due_date), fontSize: 12, fontWeight: 500 }}>
                    {fmtDueDate(t.due_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {assignee_stage_breakdown.rows.length > 0 && assignee_stage_breakdown.stage_columns.length > 0 && (
            <>
              <Subheading>Open tasks remaining by assignee</Subheading>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {assignee_stage_breakdown.rows.slice(0, 8).map((a) => (
                  <div key={a.user_id}>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "baseline",
                      paddingBottom: 4, marginBottom: 4, borderBottom: `1px solid ${PF_BORDER}`,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: TEXT_MUTED }}>
                        <strong style={{ color: PF_BLUE }}>{a.total}</strong> remaining
                      </span>
                    </div>
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                      <tbody>
                        {assignee_stage_breakdown.stage_columns.map((name) => {
                          const v = a.counts[name] ?? 0;
                          return (
                            <tr key={name}>
                              <td style={{ padding: "2px 0", color: v > 0 ? TEXT_MUTED : TEXT_FAINT }}>{name}</td>
                              <td style={{ padding: "2px 0", textAlign: "right" }}>
                                <strong style={{ color: v > 0 ? TEXT_PRIMARY : TEXT_FAINT }}>{v}</strong>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
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
                  </div>
                );
              })}
            </div>
          )}

          <Subheading>Key updates</Subheading>
          {key_updates.length === 0 ? (
            <Empty>No recent updates</Empty>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {key_updates.map((u) => (
                <li key={u.id} style={{ display: "flex", alignItems: "flex-start", padding: "5px 0", borderBottom: `1px solid ${PF_BORDER}`, fontSize: 12 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 6,
                    background: u.kind === "document" ? PF_GREEN : PF_BLUE,
                    marginTop: 6, marginRight: 8, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, color: TEXT_PRIMARY }}>
                    {u.body}
                    {u.author_name && <span style={{ color: TEXT_FAINT }}> — {u.author_name}</span>}
                  </span>
                  <span style={{ color: TEXT_FAINT, fontSize: 11, marginLeft: 8, whiteSpace: "nowrap" }}>{relative(u.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Team & links */}
        <Panel title="Team & links">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {team.pm && <ContactCard label="Project Manager" member={team.pm} />}
            {team.engineers.map((eng) => (
              <ContactCard key={eng.id} label="Implementation Engineer" member={eng} />
            ))}
            {team.partner_ae && <ContactCard label="Partner AE" member={team.partner_ae} />}
            {team.primary_contact && (
              <div style={{ border: `1px solid ${PF_BORDER}`, borderRadius: 10, padding: "10px 12px", background: "#f8fafc" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                  Primary Contact
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY }}>{team.primary_contact.name}</div>
                {team.primary_contact.job_title && (
                  <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>{team.primary_contact.job_title}</div>
                )}
                {team.primary_contact.email && (
                  <a href={`mailto:${team.primary_contact.email}`} style={{ fontSize: 12, color: PF_BLUE, textDecoration: "none", display: "block", marginTop: 4 }}>
                    {team.primary_contact.email}
                  </a>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {stats.next_call?.join_url && (
              <LinkButton href={stats.next_call.join_url} primary>
                Join {fmtCallDate(stats.next_call.scheduled_at)} call
              </LinkButton>
            )}
            {links.sharepoint_url && (
              <LinkButton href={links.sharepoint_url}>SharePoint documents</LinkButton>
            )}
            {links.crm_case_id && currentUserRole && currentUserRole !== "client" && currentUserRole !== "partner_ae" && (
              <CrmCaseLink caseId={links.crm_case_id} onOpenTab={onChangeTab ? () => onChangeTab("case") : undefined} />
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
      background: "#fff",
      border: `1px solid ${danger ? "#fecaca" : PF_BORDER}`,
      borderRadius: 12, padding: "14px 16px", minHeight: 92,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6, lineHeight: 1, color: danger ? "#991b1b" : PF_BLUE }}>
        {value}
      </div>
      {sublabel && (
        <div style={{ fontSize: 11, color: danger ? "#991b1b" : TEXT_MUTED, marginTop: 6 }}>{sublabel}</div>
      )}
    </div>
  );
}

function PhaseCard({ phase }: { phase: StakeholderSummary["phases"][number] }) {
  const tone = HEALTH_TONE[phase.health];
  return (
    <div style={{ background: "#fff", border: `1px solid ${PF_BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, lineHeight: 1.3 }}>{phase.name}</div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
          background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`,
          whiteSpace: "nowrap",
        }}>
          {tone.label}
        </span>
      </div>
      <div style={{ background: "#f1f5f9", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ background: PF_GREEN, height: "100%", width: `${phase.completion_pct}%` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, color: TEXT_MUTED }}>
        <span>{phase.target_go_live_date ? `Go-live: ${fmtDate(phase.target_go_live_date)}` : "No date set"}</span>
        <span>{phase.days_left !== null ? `${phase.days_left} days left` : "—"}</span>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${PF_BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: PF_BLUE,
        textTransform: "uppercase", letterSpacing: "0.1em",
        marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${PF_BORDER}`,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: TEXT_MUTED,
      textTransform: "uppercase", letterSpacing: "0.1em",
      marginBottom: 8, marginTop: 4,
    }}>
      {children}
    </div>
  );
}

function Subheading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 16, marginBottom: 8, fontSize: 10, fontWeight: 700,
      color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em",
    }}>
      {children}
    </div>
  );
}

function StageSlider({
  stage,
}: {
  stage: { name: string; status: string | null; total_tasks: number; done_tasks: number; pct: number };
}) {
  const isComplete = stage.pct >= 100;
  const isNotStarted = stage.total_tasks === 0 || (stage.done_tasks === 0 && stage.status !== "in_progress");
  const fill = isComplete ? PF_GREEN : isNotStarted ? "#cbd5e1" : PF_BLUE;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {stage.name}
        </span>
        <span style={{ fontSize: 11, color: TEXT_MUTED, flexShrink: 0 }}>
          {stage.total_tasks > 0
            ? `${stage.done_tasks}/${stage.total_tasks} · ${stage.pct}%`
            : "no tasks"}
        </span>
      </div>
      <div style={{ background: "#f1f5f9", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ background: fill, height: "100%", width: `${stage.pct}%`, transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function ContactCard({
  label,
  member,
}: {
  label: string;
  member: { id: string; name: string | null; email: string; title: string | null; phone: string | null; scheduler_url: string | null; avatar_url: string | null };
}) {
  const display = member.name ?? member.email;
  const abbr = initials(member.name, member.email);
  return (
    <div style={{ border: `1px solid ${PF_BORDER}`, borderRadius: 10, padding: "10px 12px", background: "#f8fafc" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {member.avatar_url ? (
          <img
            src={member.avatar_url}
            alt={display}
            style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `1px solid ${PF_BORDER}` }}
          />
        ) : (
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: "linear-gradient(135deg, #63c1ea, #17c662)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "0.04em",
            flexShrink: 0,
          }}>
            {abbr}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {label}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY, marginTop: 2, lineHeight: 1.25 }}>{display}</div>
          {member.title && (
            <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 1 }}>{member.title}</div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, fontSize: 12 }}>
        <a href={`mailto:${member.email}`} style={{ color: PF_BLUE, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {member.email}
        </a>
        {member.phone && (
          <a href={`tel:${member.phone.replace(/[^\d+]/g, "")}`} style={{ color: PF_BLUE, textDecoration: "none" }}>
            {member.phone}
          </a>
        )}
        {member.scheduler_url && (
          <a href={member.scheduler_url} target="_blank" rel="noopener noreferrer" style={{ color: PF_GREEN, textDecoration: "none", fontWeight: 600 }}>
            Schedule a meeting →
          </a>
        )}
      </div>
    </div>
  );
}

function PriorityDot({ priority }: { priority: string | null }) {
  const c = priority === "critical" ? "#dc2626"
          : priority === "high"     ? "#ef4444"
          : priority === "medium"   ? "#f59e0b"
          : priority === "low"      ? PF_BLUE
          : TEXT_FAINT;
  return <span style={{ width: 7, height: 7, borderRadius: 7, background: c, display: "inline-block", flexShrink: 0 }} />;
}

function LinkButton({ href, children, primary }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" style={linkButtonStyle(!!primary)}>{children}</a>;
}

/**
 * CRM case row. Primary action opens the in-portal CRM Case tab (where the
 * rich case + time entries + SOW-hours adherence view lives). Secondary
 * action opens the case directly in Dynamics CRM in a new tab.
 */
function CrmCaseLink({ caseId, onOpenTab }: { caseId: string; onOpenTab?: () => void }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {onOpenTab ? (
        <button type="button" onClick={onOpenTab} style={{ ...linkButtonStyle(false), flex: 1, border: "none", cursor: "pointer" }}>
          CRM case
        </button>
      ) : (
        <div style={{ ...linkButtonStyle(false), flex: 1, cursor: "default" }}>CRM case</div>
      )}
      <a
        href={dynamicsCaseUrl(caseId)}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in Dynamics CRM"
        style={{
          ...linkButtonStyle(false),
          width: 36, textAlign: "center", padding: "8px 0",
        }}
      >
        ↗
      </a>
    </div>
  );
}

function linkButtonStyle(primary: boolean): React.CSSProperties {
  return {
    display: "block", padding: "8px 12px",
    background: primary ? PF_BLUE : "#f1f5f9",
    color: primary ? "#fff" : TEXT_PRIMARY,
    borderRadius: 6, fontSize: 12, fontWeight: 600,
    textDecoration: "none", textAlign: "left",
  };
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ textAlign: "center", color: TEXT_FAINT, padding: "12px 0", fontSize: 12 }}>{children}</div>;
}

function Center({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div style={{ padding: 32, textAlign: "center", color: error ? "#991b1b" : TEXT_MUTED }}>
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
  if (!iso) return TEXT_FAINT;
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueMidnight = new Date(d); dueMidnight.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueMidnight.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0)  return "#dc2626";
  if (diffDays === 0) return "#dc2626";
  if (diffDays <= 3) return "#f59e0b";
  return TEXT_MUTED;
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
