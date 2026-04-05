const ZOOM_API_BASE = "https://api.zoom.us/v2";
const ZOOM_OAUTH_URL = "https://zoom.us/oauth/token";

export type ZoomCreds = {
  account_id: string;
  client_id: string;
  client_secret: string;
};

type TokenCache = {
  access_token: string;
  expires_at: number;
};

export type ZoomDevice = {
  id: string;
  display_name: string;
  mac_address: string | null;
  model: string | null;
  status: string | null;
  assignee: { name: string; extension_number: string | null } | null;
};

export type ZoomCallingPlan = {
  name: string;
  type: number;
  subscribed: number;
  assigned: number;
  available: number;
};

export type ZoomStatus = {
  account: {
    id: string;
    account_name: string;
    account_type: number;
  };
  // Raw plans object — parsed dynamically on the frontend
  plans: Record<string, unknown>;
  total_users: number | null;
  active_users_30d: number | null;
  devices: ZoomDevice[];
  devices_total: number;
  warnings: string[];
  phone_users_total: number | null;
  call_queues_total: number | null;
  auto_receptionists_total: number | null;
  cc_users_total: number | null;
  cc_queues_total: number | null;
  calling_plans: ZoomCallingPlan[] | null;
  meeting_activity_30d: { participants: number; meeting_minutes: number } | null;
  phone_calls_30d: number | null;
};

function credsKey(projectId: string) { return `zoom:creds:${projectId}`; }
function tokenKey(projectId: string) { return `zoom:token:${projectId}`; }

// ── Org-level (S2S) token ─────────────────────────────────────────────────────

const ORG_TOKEN_KEY = "zoom:org:token";
const PHOTO_CACHE_TTL = 86_400; // 24 hours

type OrgEnv = { ZOOM_ORG_ACCOUNT_ID?: string; ZOOM_ORG_CLIENT_ID?: string; ZOOM_ORG_CLIENT_SECRET?: string };

export async function getOrgToken(kv: KVNamespace, env: OrgEnv): Promise<string> {
  const cached = await kv.get<TokenCache>(ORG_TOKEN_KEY, "json");
  if (cached && cached.expires_at > Date.now() + 60_000) return cached.access_token;

  const { ZOOM_ORG_ACCOUNT_ID, ZOOM_ORG_CLIENT_ID, ZOOM_ORG_CLIENT_SECRET } = env;
  if (!ZOOM_ORG_ACCOUNT_ID || !ZOOM_ORG_CLIENT_ID || !ZOOM_ORG_CLIENT_SECRET) {
    throw new Error("Zoom org credentials not configured");
  }

  const res = await fetch(
    `${ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(ZOOM_ORG_ACCOUNT_ID)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${ZOOM_ORG_CLIENT_ID}:${ZOOM_ORG_CLIENT_SECRET}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!res.ok) throw new Error(`Zoom org token fetch failed: ${res.status} ${await res.text()}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  await kv.put(
    ORG_TOKEN_KEY,
    JSON.stringify({ access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 }),
    { expirationTtl: data.expires_in - 60 }
  );
  return data.access_token;
}

export async function getStaffPhotos(
  kv: KVNamespace,
  env: OrgEnv,
  emails: string[]
): Promise<Record<string, string | null>> {
  if (emails.length === 0) return {};

  const result: Record<string, string | null> = {};
  const toFetch: string[] = [];

  // Check KV cache first
  await Promise.all(
    emails.map(async (email) => {
      const cached = await kv.get(`zoom:photo:${email.toLowerCase()}`);
      if (cached !== null) {
        result[email] = cached === "" ? null : cached;
      } else {
        toFetch.push(email);
      }
    })
  );

  if (toFetch.length === 0) return result;

  const token = await getOrgToken(kv, env);

  await Promise.all(
    toFetch.map(async (email) => {
      try {
        const res = await fetch(`${ZOOM_API_BASE}/users/${encodeURIComponent(email)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          await kv.put(`zoom:photo:${email.toLowerCase()}`, "", { expirationTtl: PHOTO_CACHE_TTL });
          result[email] = null;
          return;
        }
        const data = await res.json() as { pic_url?: string };
        const url = data.pic_url ?? null;
        await kv.put(`zoom:photo:${email.toLowerCase()}`, url ?? "", { expirationTtl: PHOTO_CACHE_TTL });
        result[email] = url;
      } catch {
        result[email] = null;
      }
    })
  );

  return result;
}

export async function saveCreds(kv: KVNamespace, projectId: string, creds: ZoomCreds): Promise<void> {
  await kv.put(credsKey(projectId), JSON.stringify(creds));
}

export async function deleteCreds(kv: KVNamespace, projectId: string): Promise<void> {
  await Promise.all([kv.delete(credsKey(projectId)), kv.delete(tokenKey(projectId))]);
}

export async function getCredsConfigured(kv: KVNamespace, projectId: string): Promise<boolean> {
  return (await kv.get(credsKey(projectId))) !== null;
}

async function getCreds(kv: KVNamespace, projectId: string): Promise<ZoomCreds | null> {
  return kv.get<ZoomCreds>(credsKey(projectId), "json");
}

async function getToken(kv: KVNamespace, creds: ZoomCreds, projectId: string): Promise<string> {
  const cached = await kv.get<TokenCache>(tokenKey(projectId), "json");
  if (cached && cached.expires_at > Date.now() + 60_000) return cached.access_token;

  const res = await fetch(
    `${ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(creds.account_id)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${creds.client_id}:${creds.client_secret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!res.ok) throw new Error(`Zoom token fetch failed: ${res.status} ${await res.text()}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  await kv.put(
    tokenKey(projectId),
    JSON.stringify({ access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 }),
    { expirationTtl: data.expires_in - 60 }
  );
  return data.access_token;
}

async function zoomGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${ZOOM_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zoom API ${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

// ── Utilization snapshot ──────────────────────────────────────────────────────

type ZoomActiveUser = {
  id?: string;
  display_name?: string;
  email?: string;
  meetings?: number;
  participants?: number;
  meeting_minutes?: number;
};

type ZoomReportUsersResponse = {
  total_records: number;
  users?: ZoomActiveUser[];
};

type ZoomDailyReportResponse = {
  dates?: Array<{ date: string; new_meeting: number; participants: number; meeting_minutes: number }>;
};

type ZoomPhoneCallLogsResponse = {
  total_records?: number;
  // owner = the internal Zoom user on this call, regardless of direction
  call_logs?: Array<{ duration?: number; owner?: { id?: string; name?: string } }>;
};

export type ZoomUtilizationData = {
  licenses_purchased: number | null;
  licenses_assigned: number | null;
  active_users_30d: number | null;
  active_users_90d: number | null;
  total_meetings: number | null;
  raw_data: Record<string, unknown>;
};

export async function fetchZoomUtilizationSnapshot(kv: KVNamespace, projectId: string): Promise<ZoomUtilizationData> {
  const creds = await getCreds(kv, projectId);
  if (!creds) throw new Error("No Zoom credentials configured for this project");

  const token = await getToken(kv, creds, projectId);

  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const ago = (days: number) => { const d = new Date(today); d.setDate(d.getDate() - days); return d; };

  const from30Date = ago(30);
  const from30 = fmt(from30Date);
  const from90 = fmt(ago(90));
  const to = fmt(today);

  // For rolling 30d meetings we may need two calendar months
  const currYear = today.getFullYear();
  const currMonth = today.getMonth() + 1;
  const needsPrevMonth = from30Date.getMonth() !== today.getMonth() || from30Date.getFullYear() !== today.getFullYear();
  const prevYear  = currMonth === 1 ? currYear - 1 : currYear;
  const prevMonth = currMonth === 1 ? 12 : currMonth - 1;

  type CallDef = { name: string; path: string };
  const callDefs: CallDef[] = [
    { name: "plans",       path: "/accounts/me/plans" },
    { name: "users",       path: "/users?page_size=1" },
    { name: "active30",    path: `/report/users?type=active&from=${from30}&to=${to}&page_size=300` },
    { name: "active90",    path: `/report/users?type=active&from=${from90}&to=${to}&page_size=1` },
    { name: "daily_curr",  path: `/report/daily?year=${currYear}&month=${currMonth}` },
    ...(needsPrevMonth ? [{ name: "daily_prev", path: `/report/daily?year=${prevYear}&month=${prevMonth}` }] : []),
    { name: "phone_users",    path: "/phone/users?page_size=1" },
    { name: "phone_call_logs", path: `/phone/call_logs?from=${from30}&to=${to}&type=all&page_size=1000` },
  ];

  const responses = await Promise.allSettled(callDefs.map((c) => zoomGet<unknown>(token, c.path)));

  function getResult<T>(name: string): T | null {
    const idx = callDefs.findIndex((c) => c.name === name);
    if (idx === -1) return null;
    return settled(responses[idx] as PromiseSettledResult<T>);
  }

  const api_calls = callDefs.map((c, i) => ({
    name: c.name,
    path: c.path,
    ok: responses[i].status === "fulfilled",
    error: responses[i].status === "rejected"
      ? String((responses[i] as PromiseRejectedResult).reason)
      : null,
  }));

  // Licenses
  const plans = getResult<Record<string, unknown>>("plans") ?? {};
  let licenses_purchased: number | null = null;
  const planBase = plans.plan_base as { hosts?: number } | undefined;
  if (planBase?.hosts != null) licenses_purchased = planBase.hosts;

  const licenses_assigned = getResult<{ total_records: number }>("users")?.total_records ?? null;

  // Active users — active30 fetches full user list (page_size=300) for top-user ranking
  const active30Data = getResult<ZoomReportUsersResponse>("active30");
  const active_users_30d = active30Data?.total_records ?? null;
  const active_users_90d = getResult<ZoomReportUsersResponse>("active90")?.total_records ?? null;

  const top_meeting_users = [...(active30Data?.users ?? [])]
    .sort((a, b) => (b.meetings ?? 0) - (a.meetings ?? 0))
    .slice(0, 10)
    .map((u) => ({
      name: u.display_name ?? u.email ?? u.id ?? "Unknown",
      email: u.email ?? null,
      meetings: u.meetings ?? 0,
      meeting_minutes: u.meeting_minutes ?? 0,
    }));

  // Rolling 30-day meetings — merge prev + curr month, filter to window
  // Use `participants` (total participant-sessions) rather than `new_meeting`
  // (new_meeting only counts meetings explicitly started, often 0 for scheduled/recurring)
  const currDates = getResult<ZoomDailyReportResponse>("daily_curr")?.dates ?? [];
  const prevDates = needsPrevMonth ? (getResult<ZoomDailyReportResponse>("daily_prev")?.dates ?? []) : [];
  const windowDates = [...prevDates, ...currDates].filter((d) => d.date >= from30 && d.date <= to);
  const total_meetings = windowDates.length > 0 ? windowDates.reduce((sum, d) => sum + (d.participants ?? 0), 0) : null;
  const meeting_minutes_30d = windowDates.length > 0 ? windowDates.reduce((sum, d) => sum + (d.meeting_minutes ?? 0), 0) : null;

  // Zoom Phone — owner.id identifies the internal user on each call (inbound or outbound)
  const phoneUsersTotal = getResult<{ total_records: number }>("phone_users")?.total_records ?? null;
  const callLogs = getResult<ZoomPhoneCallLogsResponse>("phone_call_logs");
  const phoneTotalCalls30d = callLogs?.total_records ?? null;
  const logs = callLogs?.call_logs ?? null;
  const phoneActiveUsers30d = logs != null
    ? new Set(logs.map((l) => l.owner?.id).filter(Boolean)).size
    : null;
  const phoneCallMinutes30d = logs != null
    ? Math.round(logs.reduce((sum, l) => sum + (l.duration ?? 0), 0) / 60)
    : null;

  // Top phone callers — aggregate call_logs by owner
  const callerMap = new Map<string, { name: string; calls: number; minutes: number }>();
  for (const log of logs ?? []) {
    const id = log.owner?.id;
    if (!id) continue;
    const existing = callerMap.get(id);
    const mins = (log.duration ?? 0) / 60;
    if (existing) {
      existing.calls += 1;
      existing.minutes += mins;
    } else {
      callerMap.set(id, { name: log.owner?.name ?? id, calls: 1, minutes: mins });
    }
  }
  const top_phone_callers = [...callerMap.values()]
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 10)
    .map((c) => ({ name: c.name, calls: c.calls, minutes: Math.round(c.minutes) }));

  return {
    licenses_purchased,
    licenses_assigned,
    active_users_30d,
    active_users_90d,
    total_meetings,
    raw_data: {
      plans,
      api_calls,
      meeting_minutes_30d,
      top_meeting_users,
      phone: { users_total: phoneUsersTotal, total_calls_30d: phoneTotalCalls30d, active_users_30d: phoneActiveUsers30d, call_minutes_30d: phoneCallMinutes30d },
      top_phone_callers,
    },
  };
}

// ── Recordings ───────────────────────────────────────────────────────────────

export type ZoomRecordingFile = {
  id: string;
  file_type: string;
  file_size: number;
  play_url: string | null;
  download_url: string | null;
  recording_type: string;
  recording_start: string;
  recording_end: string;
};

export type ZoomMeeting = {
  uuid: string;
  id: number;
  topic: string;
  start_time: string;
  duration: number;
  host_email: string;
  recording_files?: ZoomRecordingFile[];
};

type ZoomRecordingsPage = {
  meetings?: ZoomMeeting[];
  next_page_token?: string;
};

type ZoomUsersPage = {
  users?: Array<{ id: string; email: string }>;
  next_page_token?: string;
};

/** Fetch all active users in the account (paginated). */
async function getAllUsers(token: string): Promise<Array<{ id: string; email: string }>> {
  const users: Array<{ id: string; email: string }> = [];
  let nextPageToken = "";
  do {
    const qs = new URLSearchParams({ status: "active", page_size: "300" });
    if (nextPageToken) qs.set("next_page_token", nextPageToken);
    const page = await zoomGet<ZoomUsersPage>(token, `/users?${qs}`);
    users.push(...(page.users ?? []));
    nextPageToken = page.next_page_token ?? "";
  } while (nextPageToken);
  return users;
}

type PmInfo = { zoom_user_id: string | null; email: string | null };

/** Zoom recordings API allows a maximum 30-day window per request — chunk accordingly. */
async function fetchUserRecordings(token: string, userId: string, from: string, to: string): Promise<ZoomMeeting[]> {
  // Build list of 30-day chunks covering [from, to]
  const chunks: Array<{ from: string; to: string }> = [];
  let chunkStart = new Date(from);
  const end = new Date(to);
  while (chunkStart <= end) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + 29);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({ from: chunkStart.toISOString().slice(0, 10), to: chunkEnd.toISOString().slice(0, 10) });
    chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() + 1);
  }

  const seen = new Set<string>();
  const meetings: ZoomMeeting[] = [];

  for (const chunk of chunks) {
    let nextPageToken = "";
    do {
      const qs = new URLSearchParams({ from: chunk.from, to: chunk.to, page_size: "300", mc: "false", trash: "false" });
      if (nextPageToken) qs.set("next_page_token", nextPageToken);
      const page = await zoomGet<ZoomRecordingsPage>(token, `/users/${encodeURIComponent(userId)}/recordings?${qs}`);
      for (const m of page.meetings ?? []) {
        if (!seen.has(String(m.id))) {
          seen.add(String(m.id));
          meetings.push(m);
        }
      }
      nextPageToken = page.next_page_token ?? "";
    } while (nextPageToken);
  }

  return meetings;
}

/** Fetch cloud recordings.
 *  - If pmInfo provided: fetch only that PM's recordings (by zoom_user_id, or by email lookup).
 *  - Otherwise: fetch all users' recordings.
 *  Always uses org-level credentials — recordings are sourced from the PF Zoom tenant,
 *  not per-project customer credentials. */
export async function getZoomRecordings(
  kv: KVNamespace,
  projectId: string,
  env?: OrgEnv,
  pmInfo?: PmInfo,
): Promise<ZoomMeeting[]> {
  if (!env) throw new Error("Org environment not available");
  const token = await getOrgToken(kv, env);
  void projectId; // retained for signature compatibility

  const today = new Date();
  const from = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);

  // PM-scoped fetch
  if (pmInfo) {
    // Try zoom_user_id first; if it fails (stale/wrong ID), fall back to email lookup
    if (pmInfo.zoom_user_id) {
      try {
        return await fetchUserRecordings(token, pmInfo.zoom_user_id, from, to);
      } catch {
        console.warn(`Zoom user ID ${pmInfo.zoom_user_id} failed, falling back to email lookup`);
      }
    }
    if (pmInfo.email) {
      const users = await getAllUsers(token);
      const match = users.find((u) => u.email.toLowerCase() === pmInfo.email!.toLowerCase());
      if (match) return fetchUserRecordings(token, match.id, from, to);
    }
    throw new Error("PM's Zoom account could not be found — verify their Zoom User ID or email in user settings");
  }

  // No PM — fetch all users
  const users = await getAllUsers(token);
  const allMeetings: ZoomMeeting[] = [];
  const BATCH = 10;
  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map((u) => fetchUserRecordings(token, u.id, from, to)));
    for (const result of results) {
      if (result.status === "fulfilled") allMeetings.push(...result.value);
    }
  }
  return allMeetings;
}

// Phase keyword map — order matters: more specific terms first
const PHASE_KEYWORDS: Array<{ keywords: RegExp[]; phase_pattern: RegExp }> = [
  { keywords: [/hypercare/i, /post[\s-]?go[\s-]?live/i], phase_pattern: /hypercare/i },
  { keywords: [/go[\s-]?live/i, /cutover/i, /migration/i], phase_pattern: /go[\s-]?live/i },
  { keywords: [/training/i, /train\b/i, /end[\s-]?user/i], phase_pattern: /training/i },
  { keywords: [/\buat\b/i, /user[\s-]?acceptance/i, /testing/i, /\btest\b/i], phase_pattern: /test/i },
  { keywords: [/\bbuild\b/i, /config/i, /implementation/i, /install/i, /deploy/i], phase_pattern: /build/i },
  { keywords: [/\bdesign\b/i, /architect/i, /solution/i], phase_pattern: /design/i },
  { keywords: [/kick[\s-]?off/i, /discovery/i, /scoping/i, /requirement/i, /onboard/i], phase_pattern: /discovery|kick.?off/i },
];

type PhaseRow = { id: string; name: string; planned_start: string | null; planned_end: string | null };

export type RecordingMatch = {
  meeting: ZoomMeeting;
  phase_id: string | null;
  match_reason: string | null;
};

/**
 * Match Zoom meetings to project phases using four signals (in priority order):
 * 1. Customer name in topic
 * 2. CRM case ID in topic
 * 3. Phase keyword matching on topic
 * 4. Date range — meeting start_time within a phase's planned_start..planned_end
 *
 * When hasPm is false (no PM assigned), only meetings that match via signal 1 or 2
 * are returned — date/keyword matches across all users would produce too much noise.
 */
export function matchRecordingsToPhases(
  meetings: ZoomMeeting[],
  phases: PhaseRow[],
  crmCaseId: string | null,
  customerName: string | null,
  hasPm: boolean,
): RecordingMatch[] {
  const customerRe = customerName
    ? new RegExp(customerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    : null;
  const caseRe = crmCaseId
    ? new RegExp(crmCaseId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    : null;

  const matched: RecordingMatch[] = [];

  for (const meeting of meetings) {
    const topic = meeting.topic ?? "";

    // Signal 1: Customer name
    if (customerRe?.test(topic)) {
      matched.push({ meeting, phase_id: null, match_reason: "customer_name" });
      continue;
    }

    // Signal 2: CRM case ID
    if (caseRe?.test(topic)) {
      matched.push({ meeting, phase_id: null, match_reason: "case_number" });
      continue;
    }

    // No PM → skip keyword/date signals (too noisy across all users)
    if (!hasPm) continue;

    // Signal 3: Keyword → phase name match
    let keywordMatched = false;
    for (const { keywords, phase_pattern } of PHASE_KEYWORDS) {
      if (!keywords.some((kw) => kw.test(topic))) continue;
      const phase = phases.find((p) => phase_pattern.test(p.name));
      if (phase) {
        matched.push({ meeting, phase_id: phase.id, match_reason: `keyword:${phase.name}` });
        keywordMatched = true;
        break;
      }
    }
    if (keywordMatched) continue;

    // Signal 4: Date range
    const meetingDate = meeting.start_time?.slice(0, 10);
    if (meetingDate) {
      const phaseInRange = phases.find((p) => {
        if (!p.planned_start || !p.planned_end) return false;
        return meetingDate >= p.planned_start && meetingDate <= p.planned_end;
      });
      if (phaseInRange) {
        matched.push({ meeting, phase_id: phaseInRange.id, match_reason: "date_range" });
        continue;
      }
    }

    matched.push({ meeting, phase_id: null, match_reason: null });
  }

  return matched;
}

export async function getZoomStatus(kv: KVNamespace, projectId: string): Promise<ZoomStatus | null> {
  const creds = await getCreds(kv, projectId);
  if (!creds) return null;

  const token = await getToken(kv, creds, projectId);

  // Date ranges for 30-day activity window
  const today = new Date();
  const from30Date = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const from30 = fmt(from30Date);
  const to = fmt(today);
  const currYear = today.getFullYear();
  const currMonth = today.getMonth() + 1;
  const needsPrevMonth = from30Date.getMonth() !== today.getMonth() || from30Date.getFullYear() !== today.getFullYear();
  const prevYear = currMonth === 1 ? currYear - 1 : currYear;
  const prevMonth = currMonth === 1 ? 12 : currMonth - 1;

  const [
    accountRes,
    plansRes,
    usersRes,
    devicesRes,
    phoneUsersRes,
    callQueuesRes,
    autoReceptionistsRes,
    ccUsersRes,
    ccQueuesRes,
    callingPlansRes,
    activeUsersRes,
    dailyCurrRes,
    dailyPrevRes,
    phoneCallsRes,
  ] = await Promise.allSettled([
    zoomGet<{ id: string; account_name: string; account_type: number }>(token, "/accounts/me"),
    zoomGet<Record<string, unknown>>(token, "/accounts/me/plans"),
    zoomGet<{ total_records: number }>(token, "/users?page_size=1"),
    zoomGet<{ devices?: ZoomDevice[]; total_records: number }>(token, "/phone/devices?page_size=100"),
    zoomGet<{ total_records: number }>(token, "/phone/users?page_size=1"),
    zoomGet<{ total_records: number }>(token, "/phone/call_queues?page_size=1"),
    zoomGet<{ total_records: number }>(token, "/phone/auto_receptionists?page_size=1"),
    zoomGet<{ total_records: number }>(token, "/contact_center/users?page_size=1"),
    zoomGet<{ total_records: number }>(token, "/contact_center/queues?page_size=1"),
    zoomGet<{ calling_plans?: ZoomCallingPlan[] }>(token, "/phone/calling_plans"),
    zoomGet<{ total_records: number }>(token, `/report/users?type=active&from=${from30}&to=${to}&page_size=1`),
    zoomGet<{ dates?: Array<{ date: string; participants: number; meeting_minutes: number }> }>(token, `/report/daily?year=${currYear}&month=${currMonth}`),
    needsPrevMonth
      ? zoomGet<{ dates?: Array<{ date: string; participants: number; meeting_minutes: number }> }>(token, `/report/daily?year=${prevYear}&month=${prevMonth}`)
      : Promise.resolve(null),
    zoomGet<{ total_records: number }>(token, `/phone/call_logs?from=${from30}&to=${to}&type=all&page_size=1`),
  ]);

  if (accountRes.status === "rejected") {
    throw new Error(`Zoom account lookup failed: ${accountRes.reason}`);
  }

  const warnings: string[] = [];
  const checks: [PromiseSettledResult<unknown>, string][] = [
    [plansRes, "/accounts/me/plans"],
    [usersRes, "/users"],
    [devicesRes, "/phone/devices"],
  ];
  for (const [res, label] of checks) {
    if (res.status === "rejected") warnings.push(`${label}: ${(res as PromiseRejectedResult).reason}`);
  }

  const accountData = accountRes.value;
  const devicesData = settled(devicesRes);

  // Roll up daily report dates into 30-day totals
  const currDates = settled(dailyCurrRes)?.dates ?? [];
  const prevDates = settled(dailyPrevRes)?.dates ?? [];
  const windowDates = [...prevDates, ...currDates].filter((d) => d.date >= from30 && d.date <= to);
  const meeting_activity_30d = windowDates.length > 0 ? {
    participants: windowDates.reduce((s, d) => s + (d.participants ?? 0), 0),
    meeting_minutes: windowDates.reduce((s, d) => s + (d.meeting_minutes ?? 0), 0),
  } : null;

  return {
    account: {
      id: accountData.id,
      account_name: accountData.account_name,
      account_type: accountData.account_type,
    },
    plans: settled(plansRes) ?? {},
    total_users: settled(usersRes)?.total_records ?? null,
    active_users_30d: settled(activeUsersRes)?.total_records ?? null,
    devices: devicesData?.devices ?? [],
    devices_total: devicesData?.total_records ?? 0,
    warnings,
    phone_users_total: settled(phoneUsersRes)?.total_records ?? null,
    call_queues_total: settled(callQueuesRes)?.total_records ?? null,
    auto_receptionists_total: settled(autoReceptionistsRes)?.total_records ?? null,
    cc_users_total: settled(ccUsersRes)?.total_records ?? null,
    cc_queues_total: settled(ccQueuesRes)?.total_records ?? null,
    calling_plans: settled(callingPlansRes)?.calling_plans ?? null,
    meeting_activity_30d,
    phone_calls_30d: settled(phoneCallsRes)?.total_records ?? null,
  };
}
