const APP_NAME = "FusionFlow360";

function base(body: string, appUrl = ""): string {
  const logoUrl = appUrl ? `${appUrl}/logo.png` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${APP_NAME}</title></head>
<body style="margin:0;padding:0;background:#0d1b2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#142236;border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;">
    <div style="background:#091525;padding:20px 28px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:14px;">
      ${logoUrl ? `<img src="${logoUrl}" alt="FusionFlow360" style="height:36px;width:auto;display:block;" />` : ""}
      <div>
        <div style="font-size:20px;font-weight:800;color:#f0f6ff;letter-spacing:-0.02em;line-height:1.1;">
          Fusion<span style="color:#00c8e0;">Flow</span><span style="color:rgba(240,246,255,0.6);font-weight:400;">360</span>
        </div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:rgba(240,246,255,0.35);margin-top:2px;">
          Intelligence Platform
        </div>
      </div>
    </div>
    <div style="padding:28px 28px 24px;">
      ${body}
    </div>
    <div style="padding:14px 28px;border-top:1px solid rgba(255,255,255,0.07);font-size:12px;color:rgba(240,246,255,0.3);">
      FusionFlow360 &middot; Packet Fusion &middot; This is an automated notification.
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
    partner_ae: "Partner AE",
  };

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f0f6ff;">Welcome to FusionFlow360</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);line-height:1.6;">
      Hi ${data.recipientName},<br><br>
      <strong style="color:rgba(240,246,255,0.9);">${data.invitedByName}</strong> has added you to
      <strong style="color:#00c8e0;">FusionFlow360</strong> — Packet Fusion's intelligence platform
      for managing projects, tracking risks, and keeping every stakeholder aligned in real time.
    </p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <table style="border-collapse:collapse;">
        ${detail("Your Role", pill(roleLabel[data.role] ?? data.role, "#0891b2"))}
        ${detail("Sign In", "Use your Packet Fusion SSO credentials")}
        ${detail("Access", "Available immediately — no additional setup required")}
      </table>
    </div>
    <p style="margin:12px 0 0;font-size:13px;color:rgba(240,246,255,0.45);">
      If you have questions, reach out to ${data.invitedByName} or your team administrator.
    </p>
    ${ctaButton("Open FusionFlow360", data.appUrl)}
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

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f0f6ff;">You've been assigned a task</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${data.assigneeName}, a task has been assigned to you in FusionFlow360.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:12px;">${data.taskTitle}</div>
      <table style="border-collapse:collapse;">
        ${detail("Project", data.projectName)}
        ${detail("Due Date", data.dueDate ?? "Not set")}
        ${detail("Priority", data.priority ? pill(data.priority, pc) : "—")}
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
  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#d13438;">Task Blocked</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${data.pmName}, a task on your project has been marked as blocked and may need your attention.</p>
    <div style="background:rgba(209,52,56,0.08);border:1px solid rgba(209,52,56,0.25);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:12px;">${data.taskTitle}</div>
      <table style="border-collapse:collapse;">
        ${detail("Project", data.projectName)}
        ${detail("Assignee", data.assigneeName ?? "Unassigned")}
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

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f0f6ff;">Task Updated</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${data.pmName}, a task on your project <strong style="color:rgba(240,246,255,0.9);">${data.projectName}</strong> was updated by <strong style="color:rgba(240,246,255,0.9);">${data.updatedByName}</strong>.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:12px;">${data.taskTitle}</div>
      <table style="border-collapse:collapse;">
        ${detail("Project", data.projectName)}
        ${detail("Status", data.status ? pill(sl, sc) : "—")}
        ${detail("Updated By", data.updatedByName)}
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

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f0f6ff;">You've been assigned a risk</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${data.ownerName}, you have been assigned as the owner of a risk on <strong style="color:rgba(240,246,255,0.9);">${data.projectName}</strong> in FusionFlow360.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:6px;">${data.riskTitle}</div>
      ${data.riskDescription ? `<div style="font-size:13px;color:rgba(240,246,255,0.6);margin-bottom:12px;">${data.riskDescription}</div>` : ""}
      <table style="border-collapse:collapse;">
        ${detail("Project", data.projectName)}
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

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:${headerColor};">Risk ${data.isNew ? "Added" : "Updated"}</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${data.pmName}, a risk has been ${action} <strong style="color:rgba(240,246,255,0.9);">${data.projectName}</strong>.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:6px;">${data.riskTitle}</div>
      ${data.riskDescription ? `<div style="font-size:13px;color:rgba(240,246,255,0.6);margin-bottom:12px;">${data.riskDescription}</div>` : ""}
      <table style="border-collapse:collapse;">
        ${detail("Project", data.projectName)}
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
  const preview = data.noteBody.length > 200 ? data.noteBody.slice(0, 200) + "…" : data.noteBody;

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f0f6ff;">New Note on Your Project</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${data.pmName}, <strong style="color:rgba(240,246,255,0.9);">${data.authorName}</strong> added a note to <strong style="color:rgba(240,246,255,0.9);">${data.projectName}</strong>.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:13px;color:rgba(240,246,255,0.8);line-height:1.6;margin-bottom:12px;">${preview}</div>
      <table style="border-collapse:collapse;">
        ${detail("Project", data.projectName)}
        ${detail("Visibility", pill(data.visibility, vc))}
        ${detail("Author", data.authorName)}
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

  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:${color};">Go-Live ${data.daysOut === 1 ? "Tomorrow" : `in ${data.daysOut} Days`}</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.7);">Hi ${data.recipientName}, this is a reminder that <strong style="color:rgba(240,246,255,0.9);">${data.projectName}</strong> is scheduled to go live ${urgency}.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <table style="border-collapse:collapse;">
        ${detail("Project", data.projectName)}
        ${data.customerName ? detail("Customer", data.customerName) : ""}
        ${detail("Go-Live Date", data.goLiveDate)}
        ${detail("Days Out", pill(`${data.daysOut} day${data.daysOut !== 1 ? "s" : ""}`, color))}
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
