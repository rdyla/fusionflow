import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthContext, Bindings } from "../types";
import { findProjects, listMyProjects, projectDetails } from "./projects";
import { listTimeEntries } from "./timeEntries";
import { pacificToday, addDays } from "../lib/pacificTime";

const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Candidates the model can show the user when a lookup is ambiguous. */
function candidates(rows: Awaited<ReturnType<typeof findProjects>>) {
  return rows.map((r) => ({ project_id: r.id, customer: r.customer_name, project: r.name, closed: !!r.closed_at }));
}

/**
 * One server per request (stateless transport). Tools run as `auth.user`, with
 * the same visibility the UI gives them.
 */
export function buildMcpServer(env: Bindings, auth: AuthContext): McpServer {
  const server = new McpServer(
    { name: "cloudconnect", title: "CloudConnect", version: "1.0.0" },
    {
      instructions:
        "CloudConnect is Packet Fusion's project management platform. Projects are customer " +
        "implementations, each linked to a Dynamics 365 CE case (CAS-xxxxx-xxxxxx) that time is " +
        "logged against. Dates and times are US Pacific. Hours: allotted_hours is the SOW quote, " +
        "hours_used is everything logged to the CE case.",
    }
  );
  const user = auth.user;

  server.registerTool(
    "list_my_projects",
    {
      title: "List my projects",
      description:
        "Projects I manage or am staffed on: customer, project name, CE case number, status, " +
        "allotted (SOW) hours, and hours used. Active projects only unless include_closed is true.",
      inputSchema: { include_closed: z.boolean().optional().describe("Also include closed/complete projects") },
      annotations: { readOnlyHint: true },
    },
    async ({ include_closed }) => json(await listMyProjects(env, user, include_closed ?? false))
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description:
        "One project's details by CE case number (CAS-…), project id, or part of the project or " +
        "customer name. Includes hours, staff, and stages. If several projects match, returns the " +
        "candidates instead — ask the user which one.",
      inputSchema: { query: z.string().min(1).describe("Case number, project id, or name") },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const rows = await findProjects(env, user, query);
      if (rows.length === 0) return toolError(`No project you can see matches "${query}".`);
      if (rows.length > 1) return json({ ambiguous: true, matches: candidates(rows) });
      return json(await projectDetails(env, rows[0]));
    }
  );

  server.registerTool(
    "list_time_entries",
    {
      title: "List time entries",
      description:
        "Time entries logged through CloudConnect, newest first, for a project and/or a date range " +
        "(Pacific dates, inclusive). Defaults to my own entries over the last 7 days. Set " +
        "everyone=true with a project to see the whole team's entries on it.",
      inputSchema: {
        project: z.string().optional().describe("Case number, project id, or name"),
        from: zDate.optional().describe("Start date, YYYY-MM-DD"),
        to: zDate.optional().describe("End date, YYYY-MM-DD"),
        everyone: z.boolean().optional().describe("Include other people's entries (requires project)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ project, from, to, everyone }) => {
      if (everyone && !project) return toolError("everyone=true needs a project.");

      let projectIds: string[] | undefined;
      if (project) {
        const rows = await findProjects(env, user, project);
        if (rows.length === 0) return toolError(`No project you can see matches "${project}".`);
        if (rows.length > 1) return json({ ambiguous: true, matches: candidates(rows) });
        projectIds = [rows[0].id];
      }

      // No project and no dates: "what did I log recently".
      const range = !project && !from && !to
        ? { from: addDays(pacificToday(), -6), to: pacificToday() }
        : { from, to };

      const entries = await listTimeEntries(env, {
        projectIds,
        userId: everyone ? undefined : user.id,
        ...range,
      });
      const total = entries.reduce((s, e) => s + e.hours, 0);
      return json({
        filter: { project: project ?? null, from: range.from ?? null, to: range.to ?? null, everyone: !!everyone },
        total_hours: Math.round(total * 100) / 100,
        count: entries.length,
        entries,
      });
    }
  );

  return server;
}
