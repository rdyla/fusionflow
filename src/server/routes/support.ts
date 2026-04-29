import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { d365FetchSupport } from "../services/dynamicsService";
import { notifyZoomNewCase } from "../lib/notifications";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function isInternal(role: string): boolean {
  return role !== "client";
}

function stripHtml(html: string | null): string | null {
  if (!html) return html;
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/(\r?\n\s*){3,}/g, "\n\n")
    .trim();
}

const STATE_MAP: Record<number, string> = { 0: "Active", 1: "Resolved", 2: "Cancelled" };

// severitycode option-set values (D365 incident, Packet Fusion tenant)
const CUSTOMER_SEVERITY_VALUES = new Set([1, 173590000, 173590001]); // P1, P2, P3
const DEFAULT_SEVERITY = 173590001; // P3

/** Resolve the D365 account ID for a contact (used for client users when dynamics_account_id is missing). */
async function resolveAccountId(contactId: string, env: Bindings): Promise<string | null> {
  const res = await d365FetchSupport(env, `/contacts(${contactId})?$select=_parentcustomerid_value`);
  if (!res.ok) return null;
  const data = await res.json() as { _parentcustomerid_value: string };
  return data._parentcustomerid_value ?? null;
}

// ── Me ────────────────────────────────────────────────────────────────────────

// GET /api/support/me
app.get("/me", (c) => {
  const auth = c.get("auth");
  const internal = isInternal(auth.role);
  return c.json({
    email: auth.user.email,
    name: auth.user.name,
    isInternal: internal,
    contactId: internal ? null : auth.user.id,
    accountId: internal ? null : (auth.user.dynamics_account_id ?? null),
  });
});

// GET /api/support/me/contacts — contacts on the customer's account (client users only)
app.get("/me/contacts", async (c) => {
  const auth = c.get("auth");
  if (isInternal(auth.role)) return c.json({ error: "Forbidden" }, 403);

  let accountId = auth.user.dynamics_account_id ?? null;
  if (!accountId) {
    accountId = await resolveAccountId(auth.user.id, c.env);
  }
  if (!accountId) return c.json([]);

  const res = await d365FetchSupport(
    c.env,
    `/contacts?$filter=_parentcustomerid_value eq '${accountId}'&$select=contactid,fullname,emailaddress1&$orderby=fullname`
  );
  if (!res.ok) return c.json([]);
  const data = await res.json() as { value: any[] };
  return c.json(data.value.map((ct: any) => ({
    id: ct.contactid,
    name: ct.fullname,
    email: ct.emailaddress1,
  })));
});

// ── Dashboard (internal only) ─────────────────────────────────────────────────

// GET /api/support/dashboard
app.get("/dashboard", async (c) => {
  const auth = c.get("auth");
  if (!isInternal(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const now = Date.now();
  const WINDOW_DAYS = 30;
  const since = new Date(now - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  const formattedHeader = { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' };

  // amc_serviceboard option-set value 173590005 = "Support" (vs Install, Onboard,
  // PreSales, etc.) — without this the dashboard mixes project-board cases in.
  const SUPPORT_BOARD = 173590005;

  const [openRes, recentRes] = await Promise.all([
    d365FetchSupport(
      c.env,
      `/incidents?$filter=statecode eq 0 and amc_serviceboard eq ${SUPPORT_BOARD}&$select=incidentid,severitycode,statuscode,createdon&$expand=owninguser($select=fullname)&$orderby=createdon desc&$top=2000`,
      { headers: formattedHeader },
    ),
    d365FetchSupport(
      c.env,
      `/incidents?$filter=amc_serviceboard eq ${SUPPORT_BOARD} and (createdon ge ${sinceIso} or (statecode eq 1 and modifiedon ge ${sinceIso}))&$select=createdon,statecode,modifiedon&$top=5000`,
    ),
  ]);

  if (!openRes.ok) return c.json({ error: await openRes.text() }, openRes.status as any);
  if (!recentRes.ok) return c.json({ error: await recentRes.text() }, recentRes.status as any);

  const openData = await openRes.json() as { value: any[] };
  const recentData = await recentRes.json() as { value: any[] };

  // Cases owned by the support-portal app user (created by customers via the
  // portal but not yet picked up by an engineer) — treat these as unassigned.
  // D365 returns the fullname as "# pfsupport portal" (the leading "# " is a
  // Packet Fusion convention for non-human app users), so substring-match it.
  function isUnassigned(owner: string | null): boolean {
    return owner === null || owner.toLowerCase().includes("pfsupport portal");
  }

  type OpenRow = {
    severity: string;
    status: string;
    owner: string | null;
    createdOn: string;
  };

  const openCases: OpenRow[] = openData.value.map((r) => ({
    severity: r["severitycode@OData.Community.Display.V1.FormattedValue"] ?? "Unknown",
    status:   r["statuscode@OData.Community.Display.V1.FormattedValue"]   ?? "Active",
    owner:    r.owninguser?.fullname ?? null,
    createdOn: r.createdon,
  }));

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalOpen   = openCases.length;
  const p1Open      = openCases.filter((c) => c.severity === "P1" || c.severity === "E1").length;
  const unassigned  = openCases.filter((c) => isUnassigned(c.owner)).length;

  const resolved = recentData.value.filter((r) => r.statecode === 1 && r.modifiedon && new Date(r.modifiedon).getTime() >= since.getTime());
  const resolvedLast30d = resolved.length;
  const resolveDurations = resolved
    .map((r) => (new Date(r.modifiedon).getTime() - new Date(r.createdon).getTime()) / (1000 * 60 * 60 * 24))
    .filter((d) => d >= 0 && Number.isFinite(d));
  const avgResolveDays = resolveDurations.length
    ? resolveDurations.reduce((s, d) => s + d, 0) / resolveDurations.length
    : null;

  // ── Distributions ─────────────────────────────────────────────────────────
  function groupCount<T>(rows: T[], key: (r: T) => string): { label: string; count: number }[] {
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = key(r);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  const severityDistribution = groupCount(openCases, (c) => c.severity);
  const statusDistribution   = groupCount(openCases, (c) => c.status);
  const ownerDistribution    = groupCount(openCases, (c) => isUnassigned(c.owner) ? "Unassigned" : c.owner!).slice(0, 8);

  // ── Aging buckets (open cases) ────────────────────────────────────────────
  const agingBuckets = [
    { label: "<1d",   count: 0 },
    { label: "1–3d",  count: 0 },
    { label: "3–7d",  count: 0 },
    { label: "7d+",   count: 0 },
  ];
  for (const c of openCases) {
    const ageDays = (now - new Date(c.createdOn).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 1)      agingBuckets[0].count++;
    else if (ageDays < 3) agingBuckets[1].count++;
    else if (ageDays < 7) agingBuckets[2].count++;
    else                  agingBuckets[3].count++;
  }

  // ── Trend (last 30d, daily) ──────────────────────────────────────────────
  const days: string[] = [];
  const openedByDay = new Map<string, number>();
  const resolvedByDay = new Map<string, number>();
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    days.push(key);
    openedByDay.set(key, 0);
    resolvedByDay.set(key, 0);
  }
  for (const r of recentData.value) {
    if (r.createdon) {
      const k = r.createdon.slice(0, 10);
      if (openedByDay.has(k)) openedByDay.set(k, (openedByDay.get(k) ?? 0) + 1);
    }
    if (r.statecode === 1 && r.modifiedon) {
      const k = r.modifiedon.slice(0, 10);
      if (resolvedByDay.has(k)) resolvedByDay.set(k, (resolvedByDay.get(k) ?? 0) + 1);
    }
  }

  return c.json({
    windowDays: WINDOW_DAYS,
    kpis: {
      totalOpen,
      p1Open,
      unassigned,
      resolvedLast30d,
      avgResolveDays,
    },
    severityDistribution,
    statusDistribution,
    ownerDistribution,
    agingBuckets,
    trend: {
      days,
      opened:   days.map((d) => openedByDay.get(d) ?? 0),
      resolved: days.map((d) => resolvedByDay.get(d) ?? 0),
    },
  });
});

// ── Cases ─────────────────────────────────────────────────────────────────────

// GET /api/support/cases
app.get("/cases", async (c) => {
  const auth = c.get("auth");
  const search = c.req.query("search")?.trim() ?? "";
  const internal = isInternal(auth.role);

  let filter: string;

  if (internal) {
    const mine = c.req.query("mine") === "true";
    const baseFilter = mine
      ? `owninguser/internalemailaddress eq '${auth.user.email.replace(/'/g, "''")}'`
      : "statecode ge 0";
    if (search) {
      const s = search.replace(/'/g, "''");
      filter = `(${baseFilter}) and (contains(ticketnumber,'${s}') or contains(title,'${s}') or contains(description,'${s}'))`;
    } else {
      filter = baseFilter;
    }
  } else {
    let accountId = auth.user.dynamics_account_id ?? null;
    if (!accountId) {
      accountId = await resolveAccountId(auth.user.id, c.env);
    }
    if (!accountId) {
      return c.json({ error: "Could not determine account" }, 400);
    }
    const contactId = auth.user.id;
    const baseFilter = `(_customerid_value eq '${accountId}' or _customerid_value eq '${contactId}')`;
    if (search) {
      const s = search.replace(/'/g, "''");
      filter = `${baseFilter} and (contains(ticketnumber,'${s}') or contains(title,'${s}'))`;
    } else {
      filter = `_customerid_value eq '${accountId}' or _customerid_value eq '${contactId}'`;
    }
  }

  const top = search ? 100 : 500;
  const select = "incidentid,ticketnumber,title,severitycode,statuscode,statecode,createdon,_customerid_value";
  const expand = "owninguser($select=fullname)";
  const res = await d365FetchSupport(
    c.env,
    `/incidents?$filter=${encodeURIComponent(filter)}&$select=${select}&$expand=${expand}&$orderby=createdon desc&$top=${top}`,
    { headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } }
  );

  if (!res.ok) {
    const error = await res.text();
    return c.json({ error }, res.status as any);
  }

  const data = await res.json() as { value: any[] };
  return c.json(data.value.map((r: any) => ({
    id: r.incidentid,
    ticketNumber: r.ticketnumber,
    title: r.title,
    severity: r["severitycode@OData.Community.Display.V1.FormattedValue"] ?? null,
    status: r["statuscode@OData.Community.Display.V1.FormattedValue"] ?? (STATE_MAP[r.statecode] ?? "Active"),
    state: STATE_MAP[r.statecode] ?? "Active",
    createdOn: r.createdon,
    owner: r.owninguser?.fullname ?? null,
    accountName: r["_customerid_value@OData.Community.Display.V1.FormattedValue"] ?? null,
  })));
});

// GET /api/support/cases/:id
app.get("/cases/:id", async (c) => {
  const { id } = c.req.param();

  const select = "incidentid,ticketnumber,title,description,severitycode,statuscode,statecode,createdon,modifiedon,_customerid_value,_primarycontactid_value,_amc_notificationcontact1_value,_am_escalationengineer_value";
  const expand = "owninguser($select=fullname,systemuserid)";
  const res = await d365FetchSupport(c.env, `/incidents(${id})?$select=${select}&$expand=${expand}`,
    { headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } });

  if (!res.ok) {
    const error = await res.text();
    return c.json({ error }, res.status as any);
  }

  const raw = await res.json() as any;
  const caseData = {
    id: raw.incidentid,
    ticketNumber: raw.ticketnumber,
    title: raw.title,
    description: raw.description,
    severity: raw["severitycode@OData.Community.Display.V1.FormattedValue"] ?? null,
    severitycode: raw.severitycode as number | null,
    status: raw["statuscode@OData.Community.Display.V1.FormattedValue"] ?? (STATE_MAP[raw.statecode] ?? "Active"),
    state: STATE_MAP[raw.statecode] ?? "Active",
    statecode: raw.statecode as number,
    statuscode: raw.statuscode as number,
    createdOn: raw.createdon,
    modifiedOn: raw.modifiedon,
    owner: raw.owninguser?.fullname ?? null,
    ownerId: raw.owninguser?.systemuserid ?? null,
    accountId: raw._customerid_value ?? null,
    accountName: raw["_customerid_value@OData.Community.Display.V1.FormattedValue"] ?? null,
    primaryContactId: raw._primarycontactid_value ?? null,
    primaryContactName: raw["_primarycontactid_value@OData.Community.Display.V1.FormattedValue"] ?? null,
    notificationContactId: raw._amc_notificationcontact1_value ?? null,
    notificationContactName: raw["_amc_notificationcontact1_value@OData.Community.Display.V1.FormattedValue"] ?? null,
    escalationEngineerId: raw._am_escalationengineer_value ?? null,
    escalationEngineerName: raw["_am_escalationengineer_value@OData.Community.Display.V1.FormattedValue"] ?? null,
  };

  const [caseNoteRes, attachmentRes, emailRes] = await Promise.all([
    d365FetchSupport(c.env, `/vtx_casenotes?$filter=_regardingobjectid_value eq '${id}'&$select=subject,description,createdon&$expand=createdby($select=fullname)&$orderby=createdon asc`),
    d365FetchSupport(c.env, `/annotations?$filter=_objectid_value eq '${id}' and isdocument eq true&$select=annotationid,subject,filename,mimetype,filesize,createdon&$expand=createdby($select=fullname)&$orderby=createdon asc`),
    d365FetchSupport(c.env, `/emails?$filter=_regardingobjectid_value eq '${id}'&$select=activityid,subject,description,createdon,sender,directioncode&$orderby=createdon asc`),
  ]);

  const notes: any[] = [];

  if (caseNoteRes.ok) {
    const data = await caseNoteRes.json() as { value: any[] };
    for (const n of data.value) {
      notes.push({ id: n.activityid, subject: n.subject, text: n.description, isAttachment: false, filename: null, mimetype: null, filesize: null, createdOn: n.createdon, createdBy: n.createdby?.fullname ?? "Unknown" });
    }
  }
  if (attachmentRes.ok) {
    const data = await attachmentRes.json() as { value: any[] };
    for (const n of data.value) {
      notes.push({ id: n.annotationid, subject: n.subject, text: null, isAttachment: true, filename: n.filename, mimetype: n.mimetype, filesize: n.filesize, createdOn: n.createdon, createdBy: n.createdby?.fullname ?? "Unknown" });
    }
  }
  if (emailRes.ok) {
    const data = await emailRes.json() as { value: any[] };
    for (const n of data.value) {
      if (n.sender?.toLowerCase() === "tac-update@packetfusion.com") continue;
      notes.push({ id: n.activityid, subject: n.subject, text: stripHtml(n.description), isAttachment: false, filename: null, mimetype: null, filesize: null, createdOn: n.createdon, createdBy: n.sender ?? "Unknown" });
    }
  }

  notes.sort((a, b) => a.createdOn.localeCompare(b.createdOn));
  return c.json({ ...caseData, notes });
});

// POST /api/support/cases
app.post("/cases", async (c) => {
  const auth = c.get("auth");
  const internal = isInternal(auth.role);
  const body = await c.req.json() as {
    title: string; description: string; severitycode?: number;
    accountId?: string; primaryContactId?: string; notificationContactId?: string; escalationEngineerId?: string;
  };

  if (!body.title || !body.description) {
    return c.json({ error: "Title and description are required" }, 400);
  }

  const severitycode = body.severitycode ?? DEFAULT_SEVERITY;
  if (!internal && !CUSTOMER_SEVERITY_VALUES.has(severitycode)) {
    return c.json({ error: "Invalid severity" }, 400);
  }

  const payload: any = {
    title: body.title,
    description: body.description,
    severitycode,
  };

  if (internal) {
    if (body.accountId) payload["customerid_account@odata.bind"] = `/accounts(${body.accountId})`;
    if (body.primaryContactId) payload["primarycontactid@odata.bind"] = `/contacts(${body.primaryContactId})`;
    if (body.notificationContactId) payload["amc_notificationcontact1@odata.bind"] = `/contacts(${body.notificationContactId})`;
    if (body.escalationEngineerId) payload["am_escalationengineer@odata.bind"] = `/systemusers(${body.escalationEngineerId})`;
  } else {
    const contactId = auth.user.id;
    payload["primarycontactid@odata.bind"] = `/contacts(${contactId})`;
    let accountId = auth.user.dynamics_account_id ?? null;
    if (!accountId) accountId = await resolveAccountId(contactId, c.env);
    if (accountId) {
      payload["customerid_account@odata.bind"] = `/accounts(${accountId})`;
    } else {
      payload["customerid_contact@odata.bind"] = `/contacts(${contactId})`;
    }
  }

  const res = await d365FetchSupport(c.env, "/incidents", { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) {
    const error = await res.text();
    return c.json({ error }, res.status as any);
  }

  const entityId = res.headers.get("OData-EntityId") ?? "";
  const match = entityId.match(/\(([^)]+)\)$/);
  if (!match) return c.json({ error: "Case created but could not determine ID" }, 500);
  const newId = match[1];

  // PATCH title + description — CRM plugin on create clears these fields
  await d365FetchSupport(c.env, `/incidents(${newId})`, {
    method: "PATCH",
    body: JSON.stringify({ title: payload.title, description: payload.description }),
  });

  // Record who submitted via portal
  await d365FetchSupport(c.env, "/annotations", {
    method: "POST",
    body: JSON.stringify({
      subject: "Case submitted via CloudConnect",
      notetext: `Submitted by ${auth.user.name ?? auth.user.email} (${auth.user.email})`,
      "objectid_incident@odata.bind": `/incidents(${newId})`,
    }),
  });

  const fetchRes = await d365FetchSupport(c.env, `/incidents(${newId})?$select=incidentid,ticketnumber&$expand=customerid_account($select=name)`);
  const created = fetchRes.ok ? await fetchRes.json() as any : {};
  const ticketNumber = created.ticketnumber ?? "";
  const accountName = created.customerid_account?.name ?? null;

  if (c.env.ZOOM_WEBHOOK_URL && c.env.ZOOM_WEBHOOK_SECRET) {
    c.executionCtx.waitUntil(
      notifyZoomNewCase(c.env.ZOOM_WEBHOOK_URL, c.env.ZOOM_WEBHOOK_SECRET, {
        ticketNumber,
        caseId: newId,
        accountName,
        submittedBy: auth.user.name ?? auth.user.email,
        title: body.title,
      })
    );
  }

  return c.json({ id: newId, ticketNumber }, 201);
});

// POST /api/support/cases/:id/notes
app.post("/cases/:id/notes", async (c) => {
  const { id } = c.req.param();
  const auth = c.get("auth");
  const body = await c.req.json() as { text: string };

  if (!body.text?.trim()) return c.json({ error: "Note text is required" }, 400);

  const res = await d365FetchSupport(c.env, "/vtx_casenotes", {
    method: "POST",
    body: JSON.stringify({
      subject: `Note from ${auth.user.name ?? auth.user.email}`,
      description: body.text,
      "regardingobjectid_incident@odata.bind": `/incidents(${id})`,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    return c.json({ error }, res.status as any);
  }
  return c.json({ ok: true }, 201);
});

// POST /api/support/cases/:id/attachments
app.post("/cases/:id/attachments", async (c) => {
  const { id } = c.req.param();
  const auth = c.get("auth");
  const body = await c.req.json() as { filename: string; mimetype: string; documentbody: string; notetext?: string };

  if (!body.filename || !body.documentbody) return c.json({ error: "filename and documentbody are required" }, 400);

  const res = await d365FetchSupport(c.env, "/annotations", {
    method: "POST",
    body: JSON.stringify({
      subject: `Attachment from ${auth.user.name ?? auth.user.email}`,
      filename: body.filename,
      mimetype: body.mimetype,
      documentbody: body.documentbody,
      notetext: body.notetext ?? "",
      isdocument: true,
      "objectid_incident@odata.bind": `/incidents(${id})`,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    return c.json({ error }, res.status as any);
  }
  return c.json({ ok: true }, 201);
});

// POST /api/support/cases/:id/status
app.post("/cases/:id/status", async (c) => {
  const { id } = c.req.param();
  const auth = c.get("auth");
  const body = await c.req.json() as { action: string; comment?: string };
  const internal = isInternal(auth.role);

  // Customers can only reopen, and only within 30 days of closure.
  if (!internal) {
    if (body.action !== "reopen") {
      return c.json({ error: "Forbidden" }, 403);
    }
    const check = await d365FetchSupport(c.env, `/incidents(${id})?$select=statecode,modifiedon`);
    if (!check.ok) {
      return c.json({ error: await check.text() }, check.status as any);
    }
    const incident = await check.json() as { statecode: number; modifiedon: string };
    if (incident.statecode !== 1 && incident.statecode !== 2) {
      return c.json({ error: "Case is not closed" }, 400);
    }
    const daysSince = (Date.now() - new Date(incident.modifiedon).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) {
      return c.json({ error: "Case was closed more than 30 days ago" }, 403);
    }
  }

  let res: Response;
  if (body.action === "resolve") {
    res = await d365FetchSupport(c.env, "/CloseIncident", {
      method: "POST",
      body: JSON.stringify({
        IncidentResolution: {
          "incidentid@odata.bind": `/incidents(${id})`,
          subject: "Resolved via CloudConnect",
          description: body.comment || "",
        },
        Status: -1,
      }),
    });
  } else if (body.action === "reopen") {
    res = await d365FetchSupport(c.env, `/incidents(${id})`, { method: "PATCH", body: JSON.stringify({ statecode: 0, statuscode: 1 }) });
  } else if (body.action === "in-progress") {
    res = await d365FetchSupport(c.env, `/incidents(${id})`, { method: "PATCH", body: JSON.stringify({ statuscode: 1 }) });
  } else if (body.action === "cancel" && internal) {
    res = await d365FetchSupport(c.env, `/incidents(${id})`, { method: "PATCH", body: JSON.stringify({ statecode: 2, statuscode: 6 }) });
  } else {
    return c.json({ error: "Invalid action" }, 400);
  }

  if (!res.ok) {
    const error = await res.text();
    return c.json({ error }, res.status as any);
  }

  if (body.comment) {
    await d365FetchSupport(c.env, "/vtx_casenotes", {
      method: "POST",
      body: JSON.stringify({
        subject: `Status updated by ${auth.user.name ?? auth.user.email}`,
        description: body.comment,
        "regardingobjectid_incident@odata.bind": `/incidents(${id})`,
      }),
    });
  }
  return c.json({ ok: true });
});

// PATCH /api/support/cases/:id/contacts
app.patch("/cases/:id/contacts", async (c) => {
  const { id } = c.req.param();
  const auth = c.get("auth");
  const body = await c.req.json() as {
    primaryContactId?: string | null;
    notificationContactId?: string | null;
    escalationEngineerId?: string | null;
    ownerId?: string | null;
  };

  const payload: any = {};
  if ("primaryContactId" in body) {
    payload[body.primaryContactId ? "primarycontactid@odata.bind" : "primarycontactid"] =
      body.primaryContactId ? `/contacts(${body.primaryContactId})` : null;
  }
  if ("notificationContactId" in body) {
    payload[body.notificationContactId ? "amc_notificationcontact1@odata.bind" : "amc_notificationcontact1"] =
      body.notificationContactId ? `/contacts(${body.notificationContactId})` : null;
  }
  if ("escalationEngineerId" in body) {
    payload[body.escalationEngineerId ? "am_escalationengineer@odata.bind" : "am_escalationengineer"] =
      body.escalationEngineerId ? `/systemusers(${body.escalationEngineerId})` : null;
  }
  if ("ownerId" in body && isInternal(auth.role) && body.ownerId) {
    payload["ownerid@odata.bind"] = `/systemusers(${body.ownerId})`;
  }

  const res = await d365FetchSupport(c.env, `/incidents(${id})`, { method: "PATCH", body: JSON.stringify(payload) });
  if (!res.ok) {
    const error = await res.text();
    return c.json({ error }, res.status as any);
  }
  return c.json({ ok: true });
});

// GET /api/support/cases/:id/contacts
app.get("/cases/:id/contacts", async (c) => {
  const { id } = c.req.param();
  const res = await d365FetchSupport(c.env, `/incidents(${id})/incident_customer_contacts?$select=contactid,fullname,emailaddress1&$orderby=fullname`);
  if (!res.ok) return c.json([]);
  const data = await res.json() as { value: any[] };
  return c.json(data.value.map((ct: any) => ({ id: ct.contactid, name: ct.fullname, email: ct.emailaddress1 })));
});

// POST /api/support/cases/:id/contacts
app.post("/cases/:id/contacts", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json() as { contactId: string };
  if (!body.contactId) return c.json({ error: "contactId required" }, 400);

  const res = await d365FetchSupport(c.env, `/incidents(${id})/incident_customer_contacts/$ref`, {
    method: "POST",
    body: JSON.stringify({ "@odata.id": `https://packetfusioncrm.crm.dynamics.com/api/data/v9.2/contacts(${body.contactId})` }),
  });
  if (!res.ok) {
    const error = await res.text();
    return c.json({ error }, res.status as any);
  }
  return c.json({ ok: true });
});

// DELETE /api/support/cases/:id/contacts/:contactId
app.delete("/cases/:id/contacts/:contactId", async (c) => {
  const { id, contactId } = c.req.param();
  const res = await d365FetchSupport(c.env, `/incidents(${id})/incident_customer_contacts(${contactId})/$ref`, { method: "DELETE" });
  if (!res.ok) {
    const error = await res.text();
    return c.json({ error }, res.status as any);
  }
  return c.json({ ok: true });
});

// GET /api/support/cases/:id/attachments/:annotId/download
app.get("/cases/:id/attachments/:annotId/download", async (c) => {
  const { annotId } = c.req.param();
  const res = await d365FetchSupport(c.env, `/annotations(${annotId})?$select=filename,mimetype,documentbody`);
  if (!res.ok) return c.json({ error: "Not found" }, 404);

  const data = await res.json() as { filename: string; mimetype: string; documentbody: string };
  const binary = atob(data.documentbody);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "Content-Type": data.mimetype || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${data.filename}"`,
    },
  });
});

// ── Account search (internal only) ───────────────────────────────────────────

// GET /api/support/accounts?search=q
app.get("/accounts", async (c) => {
  const auth = c.get("auth");
  if (!isInternal(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const search = c.req.query("search") ?? "";
  if (search.length < 2) return c.json([]);

  const res = await d365FetchSupport(c.env, `/accounts?$filter=${encodeURIComponent(`contains(name,'${search.replace(/'/g, "''")}')`)}&$select=accountid,name&$top=15&$orderby=name`);
  if (!res.ok) return c.json([]);
  const data = await res.json() as { value: any[] };
  return c.json(data.value.map((a: any) => ({ id: a.accountid, name: a.name })));
});

// GET /api/support/accounts/:id/contacts
app.get("/accounts/:id/contacts", async (c) => {
  const auth = c.get("auth");
  if (!isInternal(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const { id } = c.req.param();
  const res = await d365FetchSupport(c.env, `/contacts?$filter=_parentcustomerid_value eq '${id}'&$select=contactid,fullname,emailaddress1&$orderby=fullname`);
  if (!res.ok) return c.json([]);
  const data = await res.json() as { value: any[] };
  return c.json(data.value.map((ct: any) => ({ id: ct.contactid, name: ct.fullname, email: ct.emailaddress1 })));
});

// ── System user search (internal only) ───────────────────────────────────────

// GET /api/support/users?search=q
app.get("/users", async (c) => {
  const auth = c.get("auth");
  if (!isInternal(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const search = c.req.query("search") ?? "";
  if (search.length < 2) return c.json([]);

  const filter = `contains(fullname,'${search.replace(/'/g, "''")}') and isdisabled eq false`;
  const res = await d365FetchSupport(c.env, `/systemusers?$filter=${encodeURIComponent(filter)}&$select=systemuserid,fullname,internalemailaddress&$top=15&$orderby=fullname`);
  if (!res.ok) return c.json([]);
  const data = await res.json() as { value: any[] };
  return c.json(data.value.map((u: any) => ({ id: u.systemuserid, name: u.fullname, email: u.internalemailaddress })));
});

export default app;
