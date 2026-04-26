import { WELCOME_SECTION_META, type WelcomeSectionId } from "../../shared/welcomeSections";
import type { SolutionType } from "../../shared/solutionTypes";

const APP_NAME = "CloudConnect by Packet Fusion";

function escapeHtml(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function base(body: string, _appUrl = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${APP_NAME}</title></head>
<body style="margin:0;padding:0;background:#0d1b2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#142236;border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;">
    <div style="background:#091525;padding:20px 28px;border-bottom:1px solid rgba(255,255,255,0.07);">
      <div style="font-size:20px;font-weight:800;color:#f0f6ff;letter-spacing:-0.02em;line-height:1.1;">
        Cloud<span style="color:#00c8e0;">Connect</span>
      </div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:rgba(240,246,255,0.35);margin-top:2px;">
        Intelligence Platform
      </div>
    </div>
    <div style="padding:28px 28px 24px;">
      ${body}
    </div>
    <div style="padding:14px 28px;border-top:1px solid rgba(255,255,255,0.07);font-size:12px;color:rgba(240,246,255,0.3);">
      CloudConnect by Packet Fusion &middot; This is an automated notification.
    </div>
  </div>
</body>
</html>`;
}

function ctaButton(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:20px;padding:10px 22px;background:#0078d4;color:#fff;font-weight:600;font-size:14px;text-decoration:none;border-radius:4px;">${label}</a>`;
}

function pill(label: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:${color}1a;color:${color};border:1px solid ${color}40;">${label}</span>`;
}

function detail(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 14px 6px 0;font-size:13px;color:rgba(240,246,255,0.45);white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:13px;color:rgba(240,246,255,0.9);">${value}</td>
  </tr>`;
}

// ── User Invite ────────────────────────────────────────────────────────────────

export function userInvite(data: {
  recipientName: string;
  invitedByName: string;
  role: string;
  appUrl: string;
}): string {
  const roleLabel: Record<string, string> = {
    admin: "Admin",
    pm: "Project Manager",
    pf_ae: "Account Executive",
    pf_sa: "Solution Architect",
    partner_ae: "Partner AE",
  };

  const recipientName = escapeHtml(data.recipientName);
  const invitedByName = escapeHtml(data.invitedByName);
  const roleDisplay = escapeHtml(roleLabel[data.role] ?? data.role);

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f0f6ff;">Welcome to CloudConnect</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);line-height:1.6;">
      Hi ${recipientName},<br><br>
      <strong style="color:rgba(240,246,255,0.9);">${invitedByName}</strong> has added you to
      <strong style="color:#00c8e0;">CloudConnect</strong> — Packet Fusion's intelligence platform
      for managing projects, tracking risks, and keeping every stakeholder aligned in real time.
    </p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <table style="border-collapse:collapse;">
        ${detail("Your Role", pill(roleDisplay, "#0891b2"))}
        ${detail("Sign In", "Use your Packet Fusion SSO credentials")}
        ${detail("Access", "Available immediately — no additional setup required")}
      </table>
    </div>
    <p style="margin:12px 0 0;font-size:13px;color:rgba(240,246,255,0.45);">
      If you have questions, reach out to ${invitedByName} or your team administrator.
    </p>
    ${ctaButton("Open CloudConnect", data.appUrl)}
  `, data.appUrl);
}

// ── Task Assigned ──────────────────────────────────────────────────────────────

export function taskAssigned(data: {
  assigneeName: string;
  taskTitle: string;
  projectName: string;
  dueDate: string | null;
  priority: string | null;
  appUrl: string;
  projectId: string;
}): string {
  const priorityColor: Record<string, string> = { high: "#d13438", medium: "#ff8c00", low: "#0891b2" };
  const pc = data.priority ? priorityColor[data.priority] ?? "#94a3b8" : "#94a3b8";

  const assigneeName = escapeHtml(data.assigneeName);
  const taskTitle = escapeHtml(data.taskTitle);
  const projectName = escapeHtml(data.projectName);
  const dueDate = escapeHtml(data.dueDate ?? "Not set");
  const priority = escapeHtml(data.priority ?? "");

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f0f6ff;">You've been assigned a task</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${assigneeName}, a task has been assigned to you in CloudConnect.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:12px;">${taskTitle}</div>
      <table style="border-collapse:collapse;">
        ${detail("Project", projectName)}
        ${detail("Due Date", dueDate)}
        ${detail("Priority", priority ? pill(priority, pc) : "—")}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `, data.appUrl);
}

// ── Task Blocked ───────────────────────────────────────────────────────────────

export function taskBlocked(data: {
  pmName: string;
  taskTitle: string;
  projectName: string;
  assigneeName: string | null;
  appUrl: string;
  projectId: string;
}): string {
  const pmName = escapeHtml(data.pmName);
  const taskTitle = escapeHtml(data.taskTitle);
  const projectName = escapeHtml(data.projectName);
  const assigneeName = escapeHtml(data.assigneeName ?? "Unassigned");

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#d13438;">Task Blocked</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${pmName}, a task on your project has been marked as blocked and may need your attention.</p>
    <div style="background:rgba(209,52,56,0.08);border:1px solid rgba(209,52,56,0.25);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:12px;">${taskTitle}</div>
      <table style="border-collapse:collapse;">
        ${detail("Project", projectName)}
        ${detail("Assignee", assigneeName)}
        ${detail("Status", pill("Blocked", "#d13438"))}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `, data.appUrl);
}

// ── PM: Task Updated ───────────────────────────────────────────────────────────

export function pmTaskUpdate(data: {
  pmName: string;
  taskTitle: string;
  projectName: string;
  updatedByName: string;
  status: string | null;
  appUrl: string;
  projectId: string;
}): string {
  const statusColor: Record<string, string> = {
    completed: "#22c55e",
    in_progress: "#0891b2",
    blocked: "#d13438",
    not_started: "#94a3b8",
  };
  const statusLabel: Record<string, string> = {
    completed: "Completed",
    in_progress: "In Progress",
    blocked: "Blocked",
    not_started: "Not Started",
  };
  const sc = data.status ? statusColor[data.status] ?? "#94a3b8" : "#94a3b8";
  const sl = data.status ? statusLabel[data.status] ?? data.status : "—";

  const pmName = escapeHtml(data.pmName);
  const projectName = escapeHtml(data.projectName);
  const updatedByName = escapeHtml(data.updatedByName);
  const taskTitle = escapeHtml(data.taskTitle);

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f0f6ff;">Task Updated</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${pmName}, a task on your project <strong style="color:rgba(240,246,255,0.9);">${projectName}</strong> was updated by <strong style="color:rgba(240,246,255,0.9);">${updatedByName}</strong>.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:12px;">${taskTitle}</div>
      <table style="border-collapse:collapse;">
        ${detail("Project", projectName)}
        ${detail("Status", data.status ? pill(sl, sc) : "—")}
        ${detail("Updated By", updatedByName)}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `, data.appUrl);
}

// ── Risk Assigned ──────────────────────────────────────────────────────────────

export function riskAssigned(data: {
  ownerName: string;
  riskTitle: string;
  riskDescription: string | null;
  projectName: string;
  severity: string | null;
  appUrl: string;
  projectId: string;
}): string {
  const severityColor: Record<string, string> = { high: "#d13438", medium: "#ff8c00", low: "#0891b2" };
  const sc = data.severity ? severityColor[data.severity] ?? "#94a3b8" : "#94a3b8";

  const ownerName = escapeHtml(data.ownerName);
  const projectName = escapeHtml(data.projectName);
  const riskTitle = escapeHtml(data.riskTitle);
  const riskDescription = escapeHtml(data.riskDescription);

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f0f6ff;">You've been assigned a risk</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${ownerName}, you have been assigned as the owner of a risk on <strong style="color:rgba(240,246,255,0.9);">${projectName}</strong> in CloudConnect.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:6px;">${riskTitle}</div>
      ${riskDescription ? `<div style="font-size:13px;color:rgba(240,246,255,0.6);margin-bottom:12px;">${riskDescription}</div>` : ""}
      <table style="border-collapse:collapse;">
        ${detail("Project", projectName)}
        ${detail("Severity", data.severity ? pill(data.severity, sc) : "—")}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `, data.appUrl);
}

// ── PM: Risk Notification ──────────────────────────────────────────────────────

export function pmRiskNotification(data: {
  pmName: string;
  riskTitle: string;
  riskDescription: string | null;
  projectName: string;
  severity: string | null;
  status: string | null;
  isNew: boolean;
  appUrl: string;
  projectId: string;
}): string {
  const severityColor: Record<string, string> = { high: "#d13438", medium: "#ff8c00", low: "#0891b2" };
  const sc = data.severity ? severityColor[data.severity] ?? "#94a3b8" : "#94a3b8";
  const headerColor = data.severity === "high" ? "#ff8c00" : "#f0f6ff";
  const action = data.isNew ? "logged on" : "updated on";

  const pmName = escapeHtml(data.pmName);
  const projectName = escapeHtml(data.projectName);
  const riskTitle = escapeHtml(data.riskTitle);
  const riskDescription = escapeHtml(data.riskDescription);

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:${headerColor};">Risk ${data.isNew ? "Added" : "Updated"}</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${pmName}, a risk has been ${action} <strong style="color:rgba(240,246,255,0.9);">${projectName}</strong>.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:6px;">${riskTitle}</div>
      ${riskDescription ? `<div style="font-size:13px;color:rgba(240,246,255,0.6);margin-bottom:12px;">${riskDescription}</div>` : ""}
      <table style="border-collapse:collapse;">
        ${detail("Project", projectName)}
        ${detail("Severity", data.severity ? pill(data.severity, sc) : "—")}
        ${detail("Status", data.status ? pill(data.status, "#94a3b8") : "—")}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `, data.appUrl);
}

// ── PM: Note Added ─────────────────────────────────────────────────────────────

export function pmNoteAdded(data: {
  pmName: string;
  authorName: string;
  projectName: string;
  noteBody: string;
  visibility: string;
  appUrl: string;
  projectId: string;
}): string {
  const visibilityColor: Record<string, string> = { internal: "#0891b2", partner: "#7c3aed", public: "#22c55e" };
  const vc = visibilityColor[data.visibility] ?? "#94a3b8";
  const pmName = escapeHtml(data.pmName);
  const authorName = escapeHtml(data.authorName);
  const projectName = escapeHtml(data.projectName);
  const raw = data.noteBody.length > 200 ? data.noteBody.slice(0, 200) + "…" : data.noteBody;
  const preview = escapeHtml(raw);

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f0f6ff;">New Note on Your Project</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${pmName}, <strong style="color:rgba(240,246,255,0.9);">${authorName}</strong> added a note to <strong style="color:rgba(240,246,255,0.9);">${projectName}</strong>.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:13px;color:rgba(240,246,255,0.8);line-height:1.6;margin-bottom:12px;">${preview}</div>
      <table style="border-collapse:collapse;">
        ${detail("Project", projectName)}
        ${detail("Visibility", pill(data.visibility, vc))}
        ${detail("Author", authorName)}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `, data.appUrl);
}

// ── Go-Live Reminder ───────────────────────────────────────────────────────────

export function goLiveReminder(data: {
  recipientName: string;
  projectName: string;
  customerName: string | null;
  goLiveDate: string;
  daysOut: number;
  appUrl: string;
  projectId: string;
}): string {
  const urgency = data.daysOut === 1 ? "tomorrow" : `in ${data.daysOut} days`;
  const color = data.daysOut === 1 ? "#d13438" : "#ff8c00";

  const recipientName = escapeHtml(data.recipientName);
  const projectName = escapeHtml(data.projectName);
  const customerName = escapeHtml(data.customerName);
  const goLiveDate = escapeHtml(data.goLiveDate);

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:${color};">Go-Live ${data.daysOut === 1 ? "Tomorrow" : `in ${data.daysOut} Days`}</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${recipientName}, this is a reminder that <strong style="color:rgba(240,246,255,0.9);">${projectName}</strong> is scheduled to go live ${urgency}.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <table style="border-collapse:collapse;">
        ${detail("Project", projectName)}
        ${customerName ? detail("Customer", customerName) : ""}
        ${detail("Go-Live Date", goLiveDate)}
        ${detail("Days Out", pill(`${data.daysOut} day${data.daysOut !== 1 ? "s" : ""}`, color))}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `, data.appUrl);
}

// ── Project At Risk ────────────────────────────────────────────────────────────

export function projectAtRisk(data: {
  recipientName: string;
  projectName: string;
  customerName: string | null;
  appUrl: string;
  projectId: string;
}): string {
  const recipientName = escapeHtml(data.recipientName);
  const projectName = escapeHtml(data.projectName);
  const customerName = escapeHtml(data.customerName);

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#ff8c00;">Project Health: At Risk</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${recipientName}, the project <strong style="color:rgba(240,246,255,0.9);">${projectName}</strong> has been flagged as <strong style="color:#ff8c00;">At Risk</strong> and may need attention.</p>
    <div style="background:rgba(255,140,0,0.08);border:1px solid rgba(255,140,0,0.25);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <table style="border-collapse:collapse;">
        ${detail("Project", projectName)}
        ${customerName ? detail("Customer", customerName) : ""}
        ${detail("Health", pill("At Risk", "#ff8c00"))}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `, data.appUrl);
}

// ── Partner AE: Note Posted ────────────────────────────────────────────────────

export function partnerNotePosted(data: {
  recipientName: string;
  authorName: string;
  projectName: string;
  noteBody: string;
  appUrl: string;
  projectId: string;
}): string {
  const recipientName = escapeHtml(data.recipientName);
  const authorName = escapeHtml(data.authorName);
  const projectName = escapeHtml(data.projectName);
  const raw = data.noteBody.length > 200 ? data.noteBody.slice(0, 200) + "…" : data.noteBody;
  const preview = escapeHtml(raw);

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f0f6ff;">New Comment on Your Project</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${recipientName}, <strong style="color:rgba(240,246,255,0.9);">${authorName}</strong> posted a comment on <strong style="color:rgba(240,246,255,0.9);">${projectName}</strong> that is visible to you.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:13px;color:rgba(240,246,255,0.8);line-height:1.6;margin-bottom:12px;">${preview}</div>
      <table style="border-collapse:collapse;">
        ${detail("Project", projectName)}
        ${detail("Posted By", authorName)}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `, data.appUrl);
}

// ── Milestone Overdue ──────────────────────────────────────────────────────────

export function milestoneOverdue(data: {
  pmName: string;
  milestoneName: string;
  projectName: string;
  targetDate: string;
  daysOverdue: number;
  appUrl: string;
  projectId: string;
}): string {
  const pmName = escapeHtml(data.pmName);
  const projectName = escapeHtml(data.projectName);
  const milestoneName = escapeHtml(data.milestoneName);
  const targetDate = escapeHtml(data.targetDate);

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#d13438;">Milestone Overdue</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${pmName}, a milestone on <strong style="color:rgba(240,246,255,0.9);">${projectName}</strong> is past its target date.</p>
    <div style="background:rgba(209,52,56,0.08);border:1px solid rgba(209,52,56,0.25);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:12px;">${milestoneName}</div>
      <table style="border-collapse:collapse;">
        ${detail("Project", projectName)}
        ${detail("Target Date", targetDate)}
        ${detail("Days Overdue", pill(`${data.daysOverdue} day${data.daysOverdue !== 1 ? "s" : ""}`, "#d13438"))}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `, data.appUrl);
}

// ── High Severity Risk (legacy — kept for compatibility) ───────────────────────

export function highRiskAdded(data: {
  pmName: string;
  riskTitle: string;
  riskDescription: string | null;
  projectName: string;
  appUrl: string;
  projectId: string;
}): string {
  return pmRiskNotification({ ...data, severity: "high", status: "open", isNew: true });
}

// ── Project Welcome Package ────────────────────────────────────────────────────

function initialsAvatar(name: string, size = 48): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#0891b2;color:#f0f6ff;font-size:${Math.floor(size * 0.4)}px;font-weight:700;line-height:${size}px;text-align:center;letter-spacing:0.02em;">${escapeHtml(initials || "?")}</div>`;
}

function teamMemberRow(m: { name: string; role: string; photoUrl: string | null; email: string | null }): string {
  const photo = m.photoUrl
    ? `<img src="${escapeHtml(m.photoUrl)}" alt="" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:50%;object-fit:cover;">`
    : initialsAvatar(m.name);
  const email = m.email
    ? `<div style="font-size:12px;color:rgba(240,246,255,0.45);margin-top:1px;"><a href="mailto:${escapeHtml(m.email)}" style="color:#00c8e0;text-decoration:none;">${escapeHtml(m.email)}</a></div>`
    : "";
  return `<tr>
    <td style="padding:8px 14px 8px 0;vertical-align:middle;width:48px;">${photo}</td>
    <td style="padding:8px 0;vertical-align:middle;">
      <div style="font-size:13px;font-weight:600;color:#f0f6ff;">${escapeHtml(m.name)}</div>
      <div style="font-size:12px;color:rgba(240,246,255,0.6);">${escapeHtml(m.role)}</div>
      ${email}
    </td>
  </tr>`;
}

type WelcomeTeamMember = { name: string; role: string; photoUrl: string | null; email: string | null };
type WelcomeTeamSection = { label: string; members: WelcomeTeamMember[] };

type WelcomeSectionMap = Partial<Record<WelcomeSectionId, boolean>>;

/**
 * Render the HTML body for a single welcome-email section. Adding a new section
 * ID to `WELCOME_SECTION_META` requires a matching case here.
 *
 * Returning an empty string suppresses the section (e.g., adminAccess needs a
 * distributionListEmail to be meaningful).
 */
function renderWelcomeSection(
  id: WelcomeSectionId,
  ctx: { distributionListEmail: string | null },
  psCard: (heading: string, innerHtml: string) => string
): string {
  const meta = WELCOME_SECTION_META.find((m) => m.id === id);
  if (!meta) return "";
  switch (id) {
    case "adminAccess":
      if (!ctx.distributionListEmail) return "";
      return psCard(
        meta.label,
        `To configure and support your platform, please grant administrator access in your cloud portal to
         <a href="mailto:${escapeHtml(ctx.distributionListEmail)}" style="color:#7de3f3;text-decoration:underline;">${escapeHtml(ctx.distributionListEmail)}</a>.
         This covers the implementation and ongoing support after your transition. We'll walk through the steps with your Implementation Engineer during the first technical meeting.`
      );
    case "porting":
      return psCard(
        meta.label,
        `<ul style="margin:0;padding-left:18px;">
          <li style="margin:0 0 8px;">Request a <strong>Customer Service Record (CSR)</strong> from your voice carrier(s). Carriers typically return it within a couple of business days — it lists every number and service on the account.</li>
          <li style="margin:0 0 8px;">Send us a copy of your most recent phone bill(s) and identify the <strong>authorized contact</strong> on the account.</li>
          <li style="margin:0;">Send us the list of numbers to port (analog, fax, back-office — anything that rings). Excel, CSV, or plain text works.</li>
        </ul>`
      );
    case "timeline":
      return psCard(
        meta.label,
        `Please be prepared to discuss target go-live date(s) and production timing at kickoff so we can plan resourcing accordingly.`
      );
    case "discoveryUcaas":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">UCaaS topics we'll work through during discovery. You don't need to bring answers to kickoff &mdash; these are the questions we'll explore in the coming weeks. It helps to start identifying who internally owns each topic so the right voices are at the table.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Current dial plan, extension scheme, and auto-attendant call flows</li>
           <li style="margin:0 0 8px;">Network readiness &mdash; bandwidth, QoS, LAN configuration</li>
           <li style="margin:0 0 8px;">E911 dispatchable location data</li>
           <li style="margin:0 0 8px;">Hardware logistics &mdash; phones, gateways, headsets</li>
           <li style="margin:0;">Auto-attendant + IVR redesign opportunities</li>
         </ul>`
      );
    case "discoveryCcaas":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Contact-center topics we'll work through during discovery. You don't need answers at kickoff &mdash; these are the questions that will guide the design and configuration sessions ahead.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Agent roster, skill matrix, and license assignment</li>
           <li style="margin:0 0 8px;">Queue list, skill-based routing rules, and after-hours behavior</li>
           <li style="margin:0 0 8px;">Call recording &mdash; retention period, consent / disclaimer requirements, storage location</li>
           <li style="margin:0 0 8px;">Reporting + BI integration (Power BI, Tableau, data warehouse exports)</li>
           <li style="margin:0;">Survey and post-call workflow</li>
         </ul>`
      );
    case "discoveryVa":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Virtual-agent topics we'll work through during discovery. You don't need answers at kickoff &mdash; start identifying who internally owns each topic.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Knowledge base content sources and content owners</li>
           <li style="margin:0 0 8px;">Phase 1 intent prioritization (top 10&ndash;25 intents)</li>
           <li style="margin:0 0 8px;">Escalation paths to live agents &mdash; handoff triggers and warm-transfer destinations</li>
           <li style="margin:0 0 8px;">Customer-to-system mapping and APIs to query for caller identification</li>
           <li style="margin:0;">Voice and chat channel selection</li>
         </ul>`
      );
    case "discoveryCi":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Conversation-intelligence topics we'll explore during discovery. These shape how the platform integrates with your existing systems and how supervisors will use it day-to-day.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">CRM integration prerequisites &mdash; Salesforce / HubSpot / Dynamics admin contact and OAuth scope</li>
           <li style="margin:0 0 8px;">Transcript storage compliance &mdash; retention period and PII redaction policy</li>
           <li style="margin:0 0 8px;">Scorecard and trigger-phrase design</li>
           <li style="margin:0;">Agent training and rollout plan</li>
         </ul>`
      );
    case "discoveryWfm":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Workforce-management topics we'll explore during discovery. We'll need historical data and policy inputs to model forecasts and shift plans accurately.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Twelve-month historical interval data &mdash; volume, handle time, AHT</li>
           <li style="margin:0 0 8px;">Forecasting inputs &mdash; channels, queues, skill groups, service-level targets</li>
           <li style="margin:0;">Shift, time-off, and overtime policy inputs</li>
         </ul>`
      );
    case "discoveryQm":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Quality-management topics we'll explore during discovery. These define how evaluations are scored and how feedback flows back to agents.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Scoring rubric &mdash; evaluation form and section weighting</li>
           <li style="margin:0 0 8px;">Calibration cadence and supervisor sign-off process</li>
           <li style="margin:0;">Coaching workflow &mdash; feedback loop and agent acknowledgement</li>
         </ul>`
      );
    case "ssoIdentity":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Identity and access topics we'll cover during discovery. These determine how users sign in and how licenses are provisioned.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Identity provider (Azure AD / Okta / Google) and admin contact</li>
           <li style="margin:0 0 8px;">SAML SSO setup and SCIM provisioning preferences</li>
           <li style="margin:0;">User group and role mapping for license assignment</li>
         </ul>`
      );
    case "changeManagement":
      return psCard(
        meta.label,
        `<p style="margin:0 0 10px;">Change-management and rollout topics we'll cover during discovery. The earlier we agree on the rollout shape, the smoother go-live will be.</p>
         <ul style="margin:0;padding-left:18px;">
           <li style="margin:0 0 8px;">Internal communications plan &mdash; who's announcing the change, on what cadence</li>
           <li style="margin:0 0 8px;">Training rollout &mdash; admin training first, then end-user; live or recorded</li>
           <li style="margin:0;">Pilot group and phased cutover preferences</li>
         </ul>`
      );
  }
}

export function welcomePackage(data: {
  projectName: string;
  customerName: string | null;
  pmName: string;
  pmCustomNote: string;
  portalUrl: string;
  kickoffMeetingUrl: string | null;
  kickoffWhen: string | null;
  kickoffDate: string | null;
  targetGoLiveDate: string | null;
  solution: string | null;
  solutionTypes: readonly SolutionType[];
  teamSections: WelcomeTeamSection[];
  distributionListEmail: string | null;
  sections: WelcomeSectionMap;
}): string {
  const projectName = escapeHtml(data.projectName);
  const customerName = escapeHtml(data.customerName ?? "");
  const pmName = escapeHtml(data.pmName);
  const noteHtml = escapeHtml(data.pmCustomNote).replace(/\r?\n/g, "<br>");

  const summaryRows = [
    data.customerName ? detail("Customer", customerName) : "",
    data.solution ? detail("Solution", escapeHtml(data.solution)) : "",
    data.kickoffDate ? detail("Kickoff", escapeHtml(data.kickoffDate)) : "",
    data.targetGoLiveDate ? detail("Target Go-Live", escapeHtml(data.targetGoLiveDate)) : "",
    detail("Project Manager", pmName),
  ].filter(Boolean).join("");

  const kickoffContent = (() => {
    if (!data.kickoffMeetingUrl) return "";
    const raw = data.kickoffMeetingUrl.trim();
    if (!raw) return "";
    // Auto-linkify standalone http(s) URLs; render everything else as-is with
    // line breaks preserved so dial-ins, access codes, and mixed free-form
    // text (RingCentral / 8x8 / Dialpad / Zoom / etc.) all render cleanly.
    const urlRe = /https?:\/\/[^\s<>"]+/g;
    const escaped = escapeHtml(raw);
    const linkified = escaped.replace(urlRe, (m) =>
      `<a href="${m}" style="color:#7de3f3;text-decoration:underline;word-break:break-all;">${m}</a>`
    );
    return linkified.replace(/\r?\n/g, "<br>");
  })();

  const kickoffWhenLine = data.kickoffWhen && data.kickoffWhen.trim()
    ? `<div style="color:#e8eef7;font-size:13px;font-weight:600;margin-bottom:8px;">${escapeHtml(data.kickoffWhen.trim())}</div>`
    : "";

  const kickoffBlock = (kickoffContent || kickoffWhenLine)
    ? `<div style="background:#14323c;border:1px solid #2a6d7e;border-radius:6px;padding:14px 18px;margin:18px 0 6px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#7de3f3;margin-bottom:6px;">Kickoff Meeting</div>
        ${kickoffWhenLine}
        ${kickoffContent ? `<div style="color:#e8eef7;font-size:14px;line-height:1.55;word-break:break-word;">${kickoffContent}</div>` : ""}
      </div>`
    : "";

  const teamSections = data.teamSections.filter((s) => s.members.length > 0);
  const teamBlock = teamSections.length
    ? teamSections.map((section) => `
        <div style="margin:22px 0 6px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(240,246,255,0.5);margin-bottom:10px;">${escapeHtml(section.label)}</div>
          <table style="border-collapse:collapse;width:100%;">
            ${section.members.map(teamMemberRow).join("")}
          </table>
        </div>
      `).join("")
    : "";

  // ── Optional PS sections (admin access / porting / timeline) ────────────────
  // Shared card styling for the three optional boilerplate blocks — solid dark
  // backgrounds survive email-client dark-mode normalization (Zoom web app etc.)
  const psCard = (heading: string, innerHtml: string) => `
    <div style="background:#1a2a3e;border:1px solid #2a3a51;border-radius:6px;padding:16px 18px;margin:18px 0 6px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#7de3f3;margin-bottom:10px;">${escapeHtml(heading)}</div>
      <div style="font-size:13.5px;color:#e8eef7;line-height:1.6;">${innerHtml}</div>
    </div>`;

  // Walk the catalog, render enabled sections applicable to this project's solution types.
  // Kickoff block sits inline between Admin Access and Porting (historical layout);
  // keep that placement by inserting it after the adminAccess block if present.
  const sectionsHtml = WELCOME_SECTION_META
    .filter((meta) =>
      (meta.appliesTo === "all" || meta.appliesTo.some((t) => data.solutionTypes.includes(t))) &&
      data.sections[meta.id] === true
    )
    .map((meta) => {
      const rendered = renderWelcomeSection(meta.id, { distributionListEmail: data.distributionListEmail }, psCard);
      // Kickoff block has always rendered immediately after adminAccess in the prior layout —
      // preserve that by splicing it in after adminAccess only.
      if (meta.id === "adminAccess" && rendered) {
        return `${rendered}${kickoffBlock}`;
      }
      return rendered;
    })
    .filter(Boolean)
    .join("");

  // If adminAccess is filtered out (not enabled, suppressed, or not applicable), the kickoff
  // block still needs a placement — render it between the summary and the first section.
  const adminAccessRendered = data.sections.adminAccess === true && data.distributionListEmail;
  const kickoffBlockFallback = !adminAccessRendered ? kickoffBlock : "";

  return base(`
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f0f6ff;">Welcome to ${projectName}</h2>
    <p style="margin:0 0 18px;font-size:14px;color:rgba(240,246,255,0.6);line-height:1.6;">
      A note from <strong style="color:rgba(240,246,255,0.9);">${pmName}</strong>, your Project Manager.
    </p>
    ${data.pmCustomNote.trim()
      ? `<div style="background:rgba(255,255,255,0.04);border-left:3px solid #00c8e0;padding:14px 18px;margin:0 0 18px;font-size:14px;color:rgba(240,246,255,0.85);line-height:1.65;">${noteHtml}</div>`
      : ""}
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(240,246,255,0.5);margin-bottom:10px;">Project Summary</div>
      <table style="border-collapse:collapse;">${summaryRows}</table>
    </div>
    ${kickoffBlockFallback}
    ${sectionsHtml}
    ${teamBlock}
    ${ctaButton("Open Project Portal", data.portalUrl)}
  `, data.portalUrl);
}
