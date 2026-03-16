const APP_NAME = "FusionFlow360";

function base(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${APP_NAME}</title></head>
<body style="margin:0;padding:0;background:#0d1b2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#142236;border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;">
    <div style="background:#091525;padding:20px 28px;border-bottom:1px solid rgba(255,255,255,0.07);">
      <span style="font-size:20px;font-weight:800;color:#f0f6ff;letter-spacing:-0.02em;">
        Fusion<span style="color:#00c8e0;">Flow</span><span style="color:rgba(240,246,255,0.6);font-weight:400;">360</span>
      </span>
      <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:rgba(240,246,255,0.3);margin-left:10px;">
        Intelligence Platform
      </span>
    </div>
    <div style="padding:28px 28px 24px;">
      ${body}
    </div>
    <div style="padding:14px 28px;border-top:1px solid rgba(255,255,255,0.07);font-size:12px;color:rgba(240,246,255,0.3);">
      FusionFlow360 · Packet Fusion · This is an automated notification.
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
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.55);">Hi ${data.assigneeName}, a task has been assigned to you in FusionFlow360.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:12px;">${data.taskTitle}</div>
      <table style="border-collapse:collapse;">
        ${detail("Project", data.projectName)}
        ${detail("Due Date", data.dueDate ?? "Not set")}
        ${detail("Priority", data.priority ? pill(data.priority, pc) : "—")}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `);
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
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.55);">Hi ${data.pmName}, a task on your project has been marked as blocked and may need attention.</p>
    <div style="background:rgba(209,52,56,0.08);border:1px solid rgba(209,52,56,0.25);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:12px;">${data.taskTitle}</div>
      <table style="border-collapse:collapse;">
        ${detail("Project", data.projectName)}
        ${detail("Assignee", data.assigneeName ?? "Unassigned")}
        ${detail("Status", pill("Blocked", "#d13438"))}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `);
}

// ── High Severity Risk ─────────────────────────────────────────────────────────

export function highRiskAdded(data: {
  pmName: string;
  riskTitle: string;
  riskDescription: string | null;
  projectName: string;
  appUrl: string;
  projectId: string;
}): string {
  return base(`
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#ff8c00;">High Severity Risk Added</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.55);">Hi ${data.pmName}, a high severity risk has been logged on <strong style="color:rgba(240,246,255,0.9);">${data.projectName}</strong>.</p>
    <div style="background:rgba(255,140,0,0.08);border:1px solid rgba(255,140,0,0.25);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <div style="font-size:16px;font-weight:700;color:#f0f6ff;margin-bottom:6px;">${data.riskTitle}</div>
      ${data.riskDescription ? `<div style="font-size:13px;color:rgba(240,246,255,0.6);margin-bottom:12px;">${data.riskDescription}</div>` : ""}
      <table style="border-collapse:collapse;">
        ${detail("Project", data.projectName)}
        ${detail("Severity", pill("High", "#d13438"))}
      </table>
    </div>
    ${ctaButton("View Risks", `${data.appUrl}/projects/${data.projectId}`)}
  `);
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
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.55);">Hi ${data.recipientName}, this is a reminder that <strong style="color:rgba(240,246,255,0.9);">${data.projectName}</strong> is scheduled to go live ${urgency}.</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <table style="border-collapse:collapse;">
        ${detail("Project", data.projectName)}
        ${data.customerName ? detail("Customer", data.customerName) : ""}
        ${detail("Go-Live Date", data.goLiveDate)}
        ${detail("Days Out", pill(`${data.daysOut} day${data.daysOut !== 1 ? "s" : ""}`, color))}
      </table>
    </div>
    ${ctaButton("View Project", `${data.appUrl}/projects/${data.projectId}`)}
  `);
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
    <h2 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#f0f6ff;">You're invited to FusionFlow360</h2>
    <p style="margin:0 0 20px;font-size:14px;color:rgba(240,246,255,0.55);">
      Hi ${data.recipientName}, <strong style="color:rgba(240,246,255,0.9);">${data.invitedByName}</strong> has added you to FusionFlow360 — Packet Fusion's intelligence platform.
    </p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:16px 18px;margin-bottom:6px;">
      <table style="border-collapse:collapse;">
        ${detail("Your Role", pill(roleLabel[data.role] ?? data.role, "#0891b2"))}
        ${detail("Access", "Sign in with your company SSO to get started")}
      </table>
    </div>
    ${ctaButton("Open FusionFlow360", data.appUrl)}
  `);
}
