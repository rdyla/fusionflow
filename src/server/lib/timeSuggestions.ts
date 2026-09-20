/**
 * Build suggested time entries from meetings the user actually attended.
 *
 * Pure and side-effect free on purpose: all network reads (Zoom recordings,
 * Outlook calendar, D1) happen in the route, and everything decided here —
 * which project a meeting belongs to, what's already logged, what's a duplicate
 * — is testable without a tenant.
 *
 * These are SUGGESTIONS. Confirming one posts through the existing time-entry
 * endpoint, which writes a Dynamics amc_timeentry and immediately closes it for
 * payroll. Nothing in this file may ever submit on its own.
 */

export type SuggestionSource = "zoom" | "outlook";

export type CandidateMeeting = {
  source: SuggestionSource;
  eventId: string;
  subject: string;
  /** ISO 8601 UTC. */
  startIso: string;
  endIso: string;
  attendeeEmails: string[];
};

export type ProjectForMatch = {
  id: string;
  name: string;
  customerName: string | null;
  crmCaseId: string | null;
  /** CAS-xxxxx style ticket number, when we have it — people type this in
   *  meeting titles far more often than the case GUID. */
  crmTicketNumber: string | null;
  zoomEmailAlias: string | null;
  contactEmails: string[];
};

export type ExistingEntry = { projectId: string; startIso: string; endIso: string };

export type MatchReason =
  | "crm_case"
  | "project_name"
  | "customer_name"
  | "zoom_alias"
  | "contact_attendee";

export type Suggestion = {
  source: SuggestionSource;
  eventId: string;
  subject: string;
  startIso: string;
  endIso: string;
  durationMin: number;
  projectId: string;
  projectName: string;
  matchReason: MatchReason;
  /** "high" when the signal names the project itself; "medium" when it's
   *  inferred from people or a customer name that could span projects. */
  confidence: "high" | "medium";
  /** Other projects that also matched. Non-empty means pick carefully — the
   *  UI surfaces it rather than silently choosing. */
  otherProjectIds: string[];
};

const HIGH: MatchReason[] = ["crm_case", "project_name", "zoom_alias"];

/** Lowercased, punctuation collapsed — so "Acme Corp." and "acme corp" match. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const BUSINESS_SUFFIX = /\b(inc|llc|ltd|corp|corporation|company|co|the|group|holdings|technologies)\b/g;

/** Needle inside haystack on word boundaries.
 *
 *  Short needles are rejected: a 3-character customer name like "CTI" would
 *  otherwise match "security" and attach time to the wrong project.
 *
 *  Both the full name AND a suffix-stripped form are tried, because stripping
 *  alone is wrong in both directions: "Acme LLC" must match a title that says
 *  just "Acme", but a project literally named "Acme Corp - Zoom UCaaS" must
 *  still match its own name — and blanket-stripping "corp" from the middle of
 *  that would leave a needle no real title contains. */
function containsName(haystack: string, needle: string | null): boolean {
  if (!needle) return false;
  const full = norm(needle);
  const stripped = full.replace(BUSINESS_SUFFIX, " ").replace(/\s+/g, " ").trim();

  for (const candidate of new Set([full, stripped])) {
    if (candidate.length < 4) continue;
    if (new RegExp(`(^| )${candidate}( |$)`).test(haystack)) return true;
  }
  return false;
}

function minutesBetween(startIso: string, endIso: string): number {
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 60000);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const s1 = Date.parse(aStart), e1 = Date.parse(aEnd);
  const s2 = Date.parse(bStart), e2 = Date.parse(bEnd);
  if ([s1, e1, s2, e2].some((v) => !Number.isFinite(v))) return false;
  return s1 < e2 && s2 < e1;
}

/** Every project a meeting plausibly belongs to, strongest signal first. */
function matchProjects(
  meeting: CandidateMeeting,
  projects: ProjectForMatch[]
): Array<{ project: ProjectForMatch; reason: MatchReason }> {
  const subject = norm(meeting.subject);
  const attendees = new Set(meeting.attendeeEmails.map((e) => e.toLowerCase()));
  const hits: Array<{ project: ProjectForMatch; reason: MatchReason }> = [];

  for (const p of projects) {
    let reason: MatchReason | null = null;

    // The case/ticket number is the least ambiguous thing anyone types.
    if ((p.crmTicketNumber && subject.includes(norm(p.crmTicketNumber))) ||
        (p.crmCaseId && subject.includes(norm(p.crmCaseId)))) {
      reason = "crm_case";
    } else if (containsName(subject, p.name)) {
      reason = "project_name";
    } else if (p.zoomEmailAlias && attendees.has(p.zoomEmailAlias.toLowerCase())) {
      reason = "zoom_alias";
    } else if (containsName(subject, p.customerName)) {
      reason = "customer_name";
    } else if (p.contactEmails.some((e) => attendees.has(e.toLowerCase()))) {
      reason = "contact_attendee";
    }

    if (reason) hits.push({ project: p, reason });
  }

  const rank = (r: MatchReason) => (HIGH.includes(r) ? 0 : 1);
  return hits.sort((a, b) => rank(a.reason) - rank(b.reason));
}

/**
 * Collapse the same real-world meeting appearing in both sources.
 *
 * A Zoom call that was also on the Outlook calendar shows up twice. Zoom wins:
 * its window is when the meeting ACTUALLY ran, while Outlook only knows what
 * was scheduled — and the whole point is logging real time.
 */
export function dedupeCandidates(candidates: CandidateMeeting[]): CandidateMeeting[] {
  const zoom = candidates.filter((c) => c.source === "zoom");
  const others = candidates.filter((c) => c.source !== "zoom");
  const kept: CandidateMeeting[] = [...zoom];

  for (const o of others) {
    const dupe = zoom.some((z) => overlaps(z.startIso, z.endIso, o.startIso, o.endIso));
    if (!dupe) kept.push(o);
  }
  return kept.sort((a, b) => a.startIso.localeCompare(b.startIso));
}

export function buildSuggestions(input: {
  candidates: CandidateMeeting[];
  projects: ProjectForMatch[];
  existingEntries: ExistingEntry[];
  dismissedKeys: Set<string>;
  /** Meetings shorter than this are skipped — a 5-minute "did you get my
   *  message" call isn't worth a payroll record. */
  minMinutes?: number;
}): Suggestion[] {
  const { candidates, projects, existingEntries, dismissedKeys, minMinutes = 10 } = input;

  const out: Suggestion[] = [];

  for (const m of dedupeCandidates(candidates)) {
    if (dismissedKeys.has(`${m.source}:${m.eventId}`)) continue;

    const durationMin = minutesBetween(m.startIso, m.endIso);
    if (durationMin < minMinutes) continue;

    const hits = matchProjects(m, projects);
    if (hits.length === 0) continue;

    const best = hits[0];

    // Already logged: any existing entry on that project overlapping this
    // meeting means the time is accounted for. Overlap rather than exact match,
    // because a hand-entered entry rarely has the same minute boundaries.
    const alreadyLogged = existingEntries.some(
      (e) => e.projectId === best.project.id && overlaps(e.startIso, e.endIso, m.startIso, m.endIso)
    );
    if (alreadyLogged) continue;

    out.push({
      source: m.source,
      eventId: m.eventId,
      subject: m.subject,
      startIso: m.startIso,
      endIso: m.endIso,
      durationMin,
      projectId: best.project.id,
      projectName: best.project.name,
      matchReason: best.reason,
      confidence: HIGH.includes(best.reason) ? "high" : "medium",
      otherProjectIds: hits.slice(1).map((h) => h.project.id),
    });
  }

  return out;
}
