/**
 * Shared rendering helpers for meeting-prep emails.
 *
 * Each meeting type has its own body renderer (see `kickoff.ts`), but they
 * share the section-card chrome (`psCard`), the team-member rendering, and
 * a few generic data shapes. Lives here so adding a new meeting type
 * doesn't require duplicating any of this.
 *
 * The base HTML envelope (`base()`), `escapeHtml`, `ctaButton`, `pill`, and
 * `detail` are still in `src/server/lib/emailTemplates.ts` — those are
 * shared with non-meeting-prep templates (task notifications, invites,
 * etc.) and don't belong in this folder.
 */

import { escapeHtml } from "../emailTemplates";

export type MeetingPrepTeamMember = {
  name: string;
  role: string;
  photoUrl: string | null;
  email: string | null;
};

export type MeetingPrepTeamSection = {
  label: string;
  members: MeetingPrepTeamMember[];
};

/** Shared section-card chrome — solid dark backgrounds survive email-client
 *  dark-mode normalization (Zoom web app, Outlook, etc.). */
export function psCard(heading: string, innerHtml: string): string {
  return `
    <div style="background:#1a2a3e;border:1px solid #2a3a51;border-radius:6px;padding:16px 18px;margin:18px 0 6px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#7de3f3;margin-bottom:10px;">${escapeHtml(heading)}</div>
      <div style="font-size:13.5px;color:#e8eef7;line-height:1.6;">${innerHtml}</div>
    </div>`;
}

function initialsAvatar(name: string, size = 48): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#0891b2;color:#f0f6ff;font-size:${Math.floor(size * 0.4)}px;font-weight:700;line-height:${size}px;text-align:center;letter-spacing:0.02em;">${escapeHtml(initials || "?")}</div>`;
}

export function teamMemberRow(m: MeetingPrepTeamMember): string {
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

/** Render the "Your Team" / "{Vendor} Team" section block from the team sections. */
export function teamBlock(sections: readonly MeetingPrepTeamSection[]): string {
  const nonEmpty = sections.filter((s) => s.members.length > 0);
  if (nonEmpty.length === 0) return "";
  return nonEmpty.map((section) => `
    <div style="margin:22px 0 6px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(240,246,255,0.5);margin-bottom:10px;">${escapeHtml(section.label)}</div>
      <table style="border-collapse:collapse;width:100%;">
        ${section.members.map(teamMemberRow).join("")}
      </table>
    </div>
  `).join("");
}
