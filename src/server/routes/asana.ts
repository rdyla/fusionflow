import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { canViewProject } from "../services/accessService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const ASANA_API = "https://app.asana.com/api/1.0";
const TOKEN_KV_KEY = "asana:token";

interface AsanaTokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
}

async function getStoredToken(kv: KVNamespace): Promise<AsanaTokenData | null> {
  const raw = await kv.get(TOKEN_KV_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AsanaTokenData;
  } catch {
    return null;
  }
}

async function doTokenRefresh(
  kv: KVNamespace,
  clientId: string,
  clientSecret: string,
  refresh_token: string
): Promise<AsanaTokenData | null> {
  const res = await fetch("https://app.asana.com/-/oauth_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const tokenData: AsanaTokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refresh_token,
    expires_at: Date.now() + data.expires_in * 1000 - 60_000,
  };
  await kv.put(TOKEN_KV_KEY, JSON.stringify(tokenData));
  return tokenData;
}

export async function getValidToken(
  kv: KVNamespace,
  clientId?: string,
  clientSecret?: string
): Promise<string | null> {
  const tokenData = await getStoredToken(kv);
  if (!tokenData) return null;
  if (Date.now() < tokenData.expires_at) return tokenData.access_token;
  if (!clientId || !clientSecret) return null;
  const refreshed = await doTokenRefresh(kv, clientId, clientSecret, tokenData.refresh_token);
  return refreshed?.access_token ?? null;
}

async function asanaGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${ASANA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new HTTPException(502, { message: `Asana API error ${res.status}: ${body}` });
  }
  const json = await res.json() as { data: T };
  return json.data;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/asana/status
app.get("/status", async (c) => {
  const tokenData = await getStoredToken(c.env.KV);
  return c.json({ connected: !!tokenData });
});

// GET /api/asana/auth — return the Asana OAuth URL as JSON.
// The client navigates there directly (window.location.href) so the browser
// never sends a text/html navigation request to this Worker endpoint, which
// avoids Cloudflare's SPA asset handler intercepting it before the Worker runs.
app.get("/auth", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin" && auth.role !== "pm") {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  const clientId = c.env.ASANA_CLIENT_ID;
  const appUrl = (c.env.APP_URL ?? "http://localhost:8787").replace(/\/$/, "");
  if (!clientId) {
    throw new HTTPException(500, { message: "ASANA_CLIENT_ID not configured" });
  }
  const redirectUri = `${appUrl}/api/asana/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
  });
  return c.json({ url: `https://app.asana.com/-/oauth_authorize?${params}` });
});

// GET /api/asana/workspaces — list accessible workspaces
app.get("/workspaces", async (c) => {
  const token = await getValidToken(c.env.KV, c.env.ASANA_CLIENT_ID, c.env.ASANA_CLIENT_SECRET);
  if (!token) throw new HTTPException(401, { message: "Asana not connected" });
  const workspaces = await asanaGet<{ gid: string; name: string }[]>("/workspaces", token);
  return c.json(workspaces);
});

// GET /api/asana/search-projects?workspace=<gid>&q=<name>
app.get("/search-projects", async (c) => {
  const token = await getValidToken(c.env.KV, c.env.ASANA_CLIENT_ID, c.env.ASANA_CLIENT_SECRET);
  if (!token) throw new HTTPException(401, { message: "Asana not connected" });

  const workspace = c.req.query("workspace");
  if (!workspace) throw new HTTPException(400, { message: "workspace query param required" });

  const params = new URLSearchParams({
    opt_fields: "gid,name,notes,due_on,color",
    limit: "50",
  });
  const projects = await asanaGet<{ gid: string; name: string; notes: string | null; due_on: string | null }[]>(
    `/workspaces/${workspace}/projects?${params}`,
    token
  );
  return c.json(projects);
});

// GET /api/asana/project-data/:projectId — proxy Asana data for a linked FF360 project
app.get("/project-data/:projectId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("projectId");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const row = await db
    .prepare("SELECT asana_project_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ asana_project_id: string | null }>();

  if (!row?.asana_project_id) {
    throw new HTTPException(404, { message: "No Asana project linked" });
  }

  const token = await getValidToken(c.env.KV, c.env.ASANA_CLIENT_ID, c.env.ASANA_CLIENT_SECRET);
  if (!token) throw new HTTPException(401, { message: "Asana not connected" });

  const gid = row.asana_project_id;

  const [asanaProject, sections] = await Promise.all([
    asanaGet<{
      gid: string;
      name: string;
      notes: string | null;
      due_on: string | null;
      created_at: string;
      color: string | null;
    }>(`/projects/${gid}?opt_fields=gid,name,notes,due_on,created_at,color`, token),
    asanaGet<{ gid: string; name: string }[]>(
      `/projects/${gid}/sections?opt_fields=gid,name`,
      token
    ),
  ]);

  const sectionTasks = await Promise.all(
    sections.map(async (section) => {
      const tasks = await asanaGet<
        {
          gid: string;
          name: string;
          completed: boolean;
          due_on: string | null;
          assignee: { gid: string; name: string } | null;
          notes: string | null;
          num_subtasks: number;
        }[]
      >(
        `/sections/${section.gid}/tasks?opt_fields=gid,name,completed,due_on,assignee.name,notes,num_subtasks&limit=100`,
        token
      );
      return { section, tasks };
    })
  );

  return c.json({ project: asanaProject, sections: sectionTasks });
});

export default app;
