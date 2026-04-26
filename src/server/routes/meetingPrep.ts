/**
 * Meeting-prep email engine — server route.
 *
 * Generic over `:meetingType` (kickoff today, discovery / design review later).
 * Each meeting type has its own catalog (in `src/shared/meetingPrep/`) and
 * its own renderer (in `src/server/lib/meetingPrep/`); this route handles
 * the common envelope: load options, build context, preview, test, send.
 *
 * Migrated from `src/server/routes/projectWelcome.ts`. Same draft shape +
 * URL semantics where possible — only meaningful changes are:
 *   - URL prefix `/welcome/...` → `/meeting-prep/:meetingType/...`
 *   - DB column `welcome_sent_at` → `kickoff_sent_at` (migration 0056)
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { canEditProject } from "../services/accessService";
import { sendEmail } from "../services/emailService";
import { getStaffPhotos } from "../services/zoomService";
import { listSharePointFiles, downloadSharePointFile } from "../services/graphService";
import { parseSolutionTypes, joinSolutionTypeLabels, type SolutionType } from "../../shared/solutionTypes";
import {
  applyMeetingPrepSectionDefaults,
  getCatalogFor,
  isMeetingType,
  type MeetingType,
} from "../../shared/meetingPrep";
import { getRendererFor, type MeetingPrepTeamSection } from "../lib/meetingPrep";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Helpers (mostly verbatim from old projectWelcome.ts) ─────────────────────

const STAFF_ROLE_LABEL: Record<string, string> = {
  pm: "Project Manager",
  ae: "Account Executive",
  sa: "Solution Architect",
  csm: "Customer Success Manager",
  engineer: "Engineer",
  pf_ae: "Account Executive",
  pf_sa: "Solution Architect",
  pf_csm: "Customer Success Manager",
  pf_engineer: "Engineer",
};

type ProjectRow = {
  id: string;
  name: string;
  customer_name: string | null;
  customer_id: string | null;
  solution_types: SolutionType[];
  vendor: string | null;
  kickoff_date: string | null;
  target_go_live_date: string | null;
  kickoff_meeting_url: string | null;
  kickoff_sent_at: string | null;
  pm_user_id: string | null;
};

async function loadProject(db: D1Database, projectId: string): Promise<ProjectRow | null> {
  const row = await db
    .prepare(`SELECT id, name, customer_name, customer_id, solution_types, vendor, kickoff_date,
                     target_go_live_date, kickoff_meeting_url, kickoff_sent_at, pm_user_id
              FROM projects WHERE id = ? LIMIT 1`)
    .bind(projectId)
    .first<Omit<ProjectRow, "solution_types"> & { solution_types: string }>();
  return row ? { ...row, solution_types: parseSolutionTypes(row.solution_types) } : null;
}

function partnerLabel(vendor: string | null): string {
  return vendor && vendor.trim() ? `${vendor.trim()} Partner AE` : "Partner AE";
}

// Map project vendor → short prefix used in our per-project distribution list
// naming convention: {prefix}-{customerSlug}@packetfusion.com
function vendorPrefix(vendor: string | null): string {
  const v = (vendor ?? "").toLowerCase().replace(/[\s_-]/g, "");
  if (v.includes("zoom")) return "zm";
  if (v.includes("ringcentral") || v === "rc") return "rc";
  if (v.includes("8x8")) return "8x8";
  if (v.includes("dialpad")) return "dp";
  return "ps";
}

function slugifyCustomer(name: string | null): string {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function computeDistributionListEmail(vendor: string | null, customerName: string | null): string | null {
  const slug = slugifyCustomer(customerName);
  if (!slug) return null;
  return `${vendorPrefix(vendor)}-${slug}@packetfusion.com`;
}

type ContactRow = { id: string; name: string; email: string | null; job_title: string | null };
type StaffRow = { id: string; name: string | null; email: string; role: string; staff_role: string | null };

function staffRoleLabel(s: StaffRow): string {
  const key = s.staff_role ?? s.role;
  return STAFF_ROLE_LABEL[key] ?? (key || "Team Member");
}

function displayRoleFor(s: StaffRow, vendor: string | null): string {
  if (s.staff_role === "partner_ae") return partnerLabel(vendor);
  return staffRoleLabel(s);
}

async function loadRecipientCandidates(db: D1Database, project: ProjectRow) {
  const [contactsRes, staffRes, pmRes] = await Promise.all([
    db.prepare("SELECT id, name, email, job_title FROM project_contacts WHERE project_id = ? ORDER BY name")
      .bind(project.id).all<ContactRow>(),
    db.prepare(`SELECT u.id, u.name, u.email, u.role, ps.staff_role
                FROM project_staff ps JOIN users u ON u.id = ps.user_id
                WHERE ps.project_id = ? ORDER BY u.name`)
      .bind(project.id).all<StaffRow>(),
    project.pm_user_id
      ? db.prepare("SELECT id, name, email, role, NULL as staff_role FROM users WHERE id = ? LIMIT 1")
          .bind(project.pm_user_id).first<StaffRow>()
      : Promise.resolve(null),
  ]);

  const contacts = (contactsRes.results ?? []).filter((c) => !!c.email);

  const staffById = new Map<string, StaffRow>();
  for (const s of staffRes.results ?? []) staffById.set(s.id, s);
  if (pmRes && !staffById.has(pmRes.id)) staffById.set(pmRes.id, { ...pmRes, staff_role: "pm" });

  const staff = Array.from(staffById.values()).filter((s) => !!s.email);
  return { contacts, staff };
}

function parseMeetingTypeParam(c: { req: { param: (k: string) => string } }): MeetingType {
  const raw = c.req.param("meetingType");
  if (!isMeetingType(raw)) {
    throw new HTTPException(400, { message: `Unknown meeting type: ${raw}` });
  }
  return raw;
}

/** Per-project sent-at column for each meeting type. */
const SENT_AT_COLUMN: Record<MeetingType, string> = {
  kickoff: "kickoff_sent_at",
};

// ── GET /api/projects/:projectId/meeting-prep/:meetingType/options ───────────

app.get("/:projectId/meeting-prep/:meetingType/options", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  const meetingType = parseMeetingTypeParam(c);
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const project = await loadProject(c.env.DB, projectId);
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const { contacts, staff } = await loadRecipientCandidates(c.env.DB, project);

  // Customer SharePoint files — tolerate missing config / folder
  let sharepointFiles: Array<{ name: string; webUrl: string; size: number | null; mimeType: string | null }> = [];
  let sharepointUrl: string | null = null;
  if (project.customer_id) {
    const customer = await c.env.DB
      .prepare("SELECT sharepoint_url FROM customers WHERE id = ? LIMIT 1")
      .bind(project.customer_id)
      .first<{ sharepoint_url: string | null }>();
    sharepointUrl = customer?.sharepoint_url ?? null;
    if (sharepointUrl) {
      try {
        const files = await listSharePointFiles(c.env, sharepointUrl);
        sharepointFiles = files
          .filter((f) => !f.isFolder)
          .map((f) => ({ name: f.name, webUrl: f.webUrl, size: f.size, mimeType: f.mimeType }));
      } catch (err) {
        console.warn(`[meeting-prep/${meetingType}] SharePoint list failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return c.json({
    meetingType,
    catalog: getCatalogFor(meetingType),
    project: {
      id: project.id,
      name: project.name,
      customerName: project.customer_name,
      solutionTypes: project.solution_types,
      vendor: project.vendor,
      kickoffDate: project.kickoff_date,
      targetGoLiveDate: project.target_go_live_date,
      kickoffMeetingUrl: project.kickoff_meeting_url,
      sentAt: project.kickoff_sent_at,
      suggestedDistributionListEmail: computeDistributionListEmail(project.vendor, project.customer_name),
    },
    recipients: {
      contacts: contacts.map((ct) => ({ id: ct.id, name: ct.name, email: ct.email, jobTitle: ct.job_title })),
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name ?? s.email,
        email: s.email,
        role: displayRoleFor(s, project.vendor),
        isPartner: s.staff_role === "partner_ae",
      })),
    },
    sharepoint: { folderUrl: sharepointUrl, files: sharepointFiles },
  });
});

// ── Draft schema ─────────────────────────────────────────────────────────────

const draftSchema = z.object({
  pmCustomNote: z.string().max(5000).default(""),
  // Allow any string for the kickoff URL — PMs often paste shortened or
  // scheme-less Zoom links and we don't want strict URL validation to 400.
  kickoffMeetingUrl: z.string().nullable().optional(),
  kickoffWhen: z.string().max(200).nullable().optional(),
  distributionListEmail: z.string().max(200).nullable().optional(),
  // Catalog-driven: client sends whichever section IDs it toggled; server fills
  // in defaults for any applicable section IDs the client omitted.
  sections: z.record(z.string(), z.boolean()).default({}),
  recipients: z.object({
    contactIds: z.array(z.string()).default([]),
    staffUserIds: z.array(z.string()).default([]),
    zoomRep: z.object({ name: z.string(), email: z.string().email() }).nullable().optional(),
    extraEmails: z.array(z.string().email()).default([]),
  }),
  attachmentUrls: z.array(z.string()).default([]),
});

type Draft = z.infer<typeof draftSchema>;

async function buildTemplateContext(c: any, project: ProjectRow, meetingType: MeetingType, draft: Draft) {
  const auth = c.get("auth");

  const { contacts, staff } = await loadRecipientCandidates(c.env.DB, project);
  const contactsById = new Map(contacts.map((ct) => [ct.id, ct]));
  const staffById = new Map(staff.map((s) => [s.id, s]));

  const toContacts = draft.recipients.contactIds
    .map((id) => contactsById.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const toStaff = draft.recipients.staffUserIds
    .map((id) => staffById.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const recipientEmails = [
    ...toContacts.map((c) => c.email!),
    ...toStaff.map((s) => s.email),
    ...(draft.recipients.zoomRep ? [draft.recipients.zoomRep.email] : []),
    ...draft.recipients.extraEmails,
  ].filter((e) => !!e);

  // Team directory for the email body — pulls photos from Zoom by email.
  const teamEmails = toStaff.map((s) => s.email);
  const photos = teamEmails.length > 0 ? await getStaffPhotos(c.env.KV, c.env, teamEmails) : {};

  const pfMembers = toStaff
    .filter((s) => s.staff_role !== "partner_ae")
    .map((s) => ({
      name: s.name ?? s.email,
      role: displayRoleFor(s, project.vendor),
      photoUrl: photos[s.email] ?? null,
      email: s.email,
    }));

  const partnerMembers = toStaff
    .filter((s) => s.staff_role === "partner_ae")
    .map((s) => ({
      name: s.name ?? s.email,
      role: displayRoleFor(s, project.vendor),
      photoUrl: photos[s.email] ?? null,
      email: s.email,
    }));

  if (draft.recipients.zoomRep) {
    partnerMembers.push({
      name: draft.recipients.zoomRep.name,
      role: project.vendor?.trim() ? `${project.vendor.trim()} Rep` : "Zoom Rep",
      photoUrl: null,
      email: draft.recipients.zoomRep.email,
    });
  }

  const partnerSectionLabel = project.vendor?.trim() ? `${project.vendor.trim()} Team` : "Partner Team";
  const teamSections: MeetingPrepTeamSection[] = [
    { label: "Your Team", members: pfMembers },
    { label: partnerSectionLabel, members: partnerMembers },
  ];

  const pm = project.pm_user_id
    ? (await c.env.DB.prepare("SELECT name, email FROM users WHERE id = ? LIMIT 1").bind(project.pm_user_id).first()) as { name: string | null; email: string | null } | null
    : null;
  const pmName = pm?.name ?? auth.user.name ?? auth.user.email;

  const portalUrl = `${c.env.APP_URL ?? ""}/projects/${project.id}`;

  const distributionListEmail = draft.distributionListEmail?.trim()
    || computeDistributionListEmail(project.vendor, project.customer_name);

  const catalog = getCatalogFor(meetingType);
  const resolvedSections = applyMeetingPrepSectionDefaults(catalog, draft.sections, project.solution_types);

  const renderer = getRendererFor(meetingType);
  const { html, subject } = renderer({
    projectName: project.name,
    customerName: project.customer_name,
    pmName,
    pmCustomNote: draft.pmCustomNote,
    portalUrl,
    kickoffMeetingUrl: draft.kickoffMeetingUrl ?? project.kickoff_meeting_url,
    kickoffWhen: draft.kickoffWhen ?? null,
    kickoffDate: project.kickoff_date,
    targetGoLiveDate: project.target_go_live_date,
    solution: joinSolutionTypeLabels(project.solution_types) || null,
    solutionTypes: project.solution_types,
    teamSections,
    distributionListEmail,
    sections: resolvedSections,
  });

  return { html, subject, recipientEmails };
}

// ── Preview ──────────────────────────────────────────────────────────────────

app.post("/:projectId/meeting-prep/:meetingType/preview", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  const meetingType = parseMeetingTypeParam(c);
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const project = await loadProject(c.env.DB, projectId);
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const parsed = draftSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    console.error(`[meeting-prep/${meetingType}/preview] validation failed:`, JSON.stringify(parsed.error.issues));
    return c.json({ error: `Invalid draft: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}` }, 400);
  }

  try {
    const { html, subject, recipientEmails } = await buildTemplateContext(c, project, meetingType, parsed.data);
    return c.json({ subject, html, recipientCount: recipientEmails.length });
  } catch (err) {
    console.error(`[meeting-prep/${meetingType}/preview] buildTemplateContext failed:`, err);
    return c.json({ error: err instanceof Error ? err.message : "Preview failed" }, 500);
  }
});

// ── Attachments ──────────────────────────────────────────────────────────────

const MAX_ATTACHMENT_TOTAL_BYTES = 3 * 1024 * 1024;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function fetchAttachments(env: Bindings, urls: string[]) {
  if (urls.length === 0) return [];
  const downloads = await Promise.all(urls.map((url) => downloadSharePointFile(env, url)));
  let total = 0;
  for (const d of downloads) total += d.content.byteLength;
  if (total > MAX_ATTACHMENT_TOTAL_BYTES) {
    throw new HTTPException(400, {
      message: `Attachment total ${(total / 1024 / 1024).toFixed(1)} MB exceeds 3 MB limit`,
    });
  }
  return downloads.map((d) => ({
    name: d.name,
    contentType: d.mimeType,
    contentBytesBase64: toBase64(d.content),
  }));
}

// ── Test send ────────────────────────────────────────────────────────────────

app.post("/:projectId/meeting-prep/:meetingType/test", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  const meetingType = parseMeetingTypeParam(c);
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const project = await loadProject(c.env.DB, projectId);
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const parsed = draftSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    console.error(`[meeting-prep/${meetingType}/test] validation failed:`, JSON.stringify(parsed.error.issues));
    return c.json({ error: `Invalid draft: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}` }, 400);
  }

  try {
    const { html, subject } = await buildTemplateContext(c, project, meetingType, parsed.data);
    const attachments = await fetchAttachments(c.env, parsed.data.attachmentUrls);

    await sendEmail(c.env, {
      to: auth.user.email,
      subject: `[TEST] ${subject}`,
      html,
      attachments,
    });

    return c.json({ ok: true, sentTo: auth.user.email });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    console.error(`[meeting-prep/${meetingType}/test] send failed:`, err);
    return c.json({ error: err instanceof Error ? err.message : "Test send failed" }, 500);
  }
});

// ── Send ─────────────────────────────────────────────────────────────────────

app.post("/:projectId/meeting-prep/:meetingType/send", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  const meetingType = parseMeetingTypeParam(c);
  if (!(await canEditProject(c.env.DB, auth.user, projectId))) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const project = await loadProject(c.env.DB, projectId);
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const parsed = draftSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    console.error(`[meeting-prep/${meetingType}/send] validation failed:`, JSON.stringify(parsed.error.issues));
    return c.json({ error: `Invalid draft: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}` }, 400);
  }

  let html: string;
  let subject: string;
  let recipientEmails: string[];
  try {
    ({ html, subject, recipientEmails } = await buildTemplateContext(c, project, meetingType, parsed.data));
  } catch (err) {
    console.error(`[meeting-prep/${meetingType}/send] buildTemplateContext failed:`, err);
    return c.json({ error: err instanceof Error ? err.message : "Send failed" }, 500);
  }
  if (recipientEmails.length === 0) {
    throw new HTTPException(400, { message: "No recipients selected" });
  }

  const attachments = await fetchAttachments(c.env, parsed.data.attachmentUrls);

  await sendEmail(c.env, { to: recipientEmails, subject, html, attachments });

  // Persist any kickoff URL the PM set inline (kickoff-only state), and mark
  // this meeting type as sent in its own column.
  const now = new Date().toISOString();
  const sentAtCol = SENT_AT_COLUMN[meetingType];
  if (meetingType === "kickoff") {
    await c.env.DB
      .prepare(`UPDATE projects SET kickoff_meeting_url = COALESCE(?, kickoff_meeting_url), ${sentAtCol} = ?, updated_at = ? WHERE id = ?`)
      .bind(parsed.data.kickoffMeetingUrl ?? null, now, now, projectId)
      .run();
  } else {
    await c.env.DB
      .prepare(`UPDATE projects SET ${sentAtCol} = ?, updated_at = ? WHERE id = ?`)
      .bind(now, now, projectId)
      .run();
  }

  return c.json({ ok: true, sentTo: recipientEmails, sentAt: now });
});

export default app;
