import { useEffect, useState } from "react";
import { api, type AuditLogEntry } from "../../lib/api";

/* Packet Fusion brand tokens (see DESIGN.md). Navy carries emphasis text;
   green is a fill/icon colour only and never used for type. */
const NAVY = "#003B5C";
const GREEN = "#17C662";
const BLUE = "#63C1EA";
const GREY = "#D9E1E2";
const BODY = "#333333";
const MUTED = "#667080";
const DANGER = "#d63637";

/** Dot colour per action — the brand's dot motif, used as a fill. */
const ACTION_DOT: Record<string, string> = {
  create: GREEN,
  update: NAVY,
  delete: DANGER,
  impersonate: BLUE,
};

const ACTION_VERB: Record<string, string> = {
  create: "Added",
  update: "Updated",
  delete: "Removed",
  impersonate: "Viewed as another user",
};

/**
 * Turn an API path into something a PM can read.
 *
 * The log stores method + path because it's captured by middleware, which sees
 * requests rather than domain events. Translating here keeps the stored data
 * faithful while the UI stays legible — and a path we haven't mapped degrades
 * to a readable segment name instead of showing raw REST.
 */
const SEGMENT_LABEL: Record<string, string> = {
  tasks: "a task",
  stages: "a stage",
  phases: "a phase",
  contacts: "a contact",
  staff: "a staff member",
  risks: "a risk",
  notes: "a note",
  documents: "a document",
  meetings: "a meeting",
  shipments: "a shipment",
  "custom-plan": "a plan item",
  "time-entry": "a time entry",
  comments: "a comment",
  close: "the project close-out",
  "audit-log": "the activity log",
};

function describe(entry: AuditLogEntry): string {
  const verb = ACTION_VERB[entry.action] ?? "Changed";
  if (entry.action === "impersonate") return verb;

  const path = entry.path ?? "";
  // Everything after /api/projects/:id names what was touched.
  const rest = path.replace(/^\/api\/(projects|solutions)\/[^/]+\/?/, "");
  const segments = rest.split("/").filter(Boolean);

  // Nothing after the id — the project record itself.
  if (segments.length === 0) return `${verb} the project details`;

  // Scan from the RIGHT: the deepest named resource is the one acted on.
  // /tasks/:id/comments is a comment, not a task — taking the first match
  // would call it a task.
  const named = [...segments].reverse().find((seg) => SEGMENT_LABEL[seg]);
  if (named) return `${verb} ${SEGMENT_LABEL[named]}`;

  // An endpoint we haven't mapped. Say so from the path rather than claiming
  // "the project details", which would be plainly wrong.
  const readable = segments[0].replace(/[-_]/g, " ");
  return `${verb} ${readable}`;
}

function formatWhen(iso: string): string {
  // D1 stores CURRENT_TIMESTAMP as "YYYY-MM-DD HH:MM:SS" in UTC with no zone
  // marker; without the Z browsers read it as local and the times drift.
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function ProjectAuditLog({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.projectAuditLog(projectId)
      .then((res) => { if (!cancelled) setEntries(res.entries); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load the activity log."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <div
      style={{
        background: "#fff", border: `1px solid ${GREY}`, borderRadius: 8,
        boxShadow: "0 2px 12px rgba(0, 59, 92, .08)", padding: 24,
      }}
    >
      <h3 style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 700, color: NAVY, lineHeight: 1.3 }}>
        Activity
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
        Every change made to this project, newest first. Viewing isn't recorded.
      </p>

      {loading && <div style={{ fontSize: 13, color: MUTED }}>Loading activity…</div>}

      {error && (
        <div style={{ fontSize: 13, color: DANGER, lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          Nothing recorded yet. Changes to this project will appear here as the team works on it.
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {entries.map((e) => (
            <li
              key={e.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 0", borderTop: `1px solid ${GREY}`,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8, height: 8, borderRadius: "50%", marginTop: 6, flexShrink: 0,
                  background: ACTION_DOT[e.action] ?? NAVY,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: BODY, lineHeight: 1.5 }}>
                  <strong style={{ color: NAVY, fontWeight: 600 }}>
                    {e.actor_name ?? e.actor_email ?? "Someone"}
                  </strong>
                  {" — "}
                  {describe(e)}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  {formatWhen(e.created_at)}
                  {e.on_behalf_of_email && (
                    <>
                      {" · "}
                      <span style={{ color: NAVY, fontWeight: 600 }}>
                        performed by {e.on_behalf_of_email} while impersonating
                      </span>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
