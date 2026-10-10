import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthContext, Bindings } from "../types";
import { findProjects, listMyProjects, projectDetails } from "./projects";
import { listTimeEntries } from "./timeEntries";
import { pacificToday, addDays } from "../lib/pacificTime";
import {
  WORK_TYPES, createTimeEntryForUser, deleteTimeEntryForUser, isFailure, updateTimeEntryForUser, type WorkType,
} from "./timeWrites";

const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, 24-hour");
const zHours = z.number().positive().max(24);
const zWorkType = z.enum(Object.keys(WORK_TYPES) as [WorkType, ...WorkType[]]);

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** A write result: failures go back as isError with their recovery details. */
function writeResult(result: unknown) {
  return isFailure(result)
    ? { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], isError: true }
    : json(result);
}

/** Candidates the model can show the user when a lookup is ambiguous. */
function candidates(rows: Awaited<ReturnType<typeof findProjects>>) {
  return rows.map((r) => ({ project_id: r.id, customer: r.customer_name, project: r.name, closed: !!r.closed_at }));
}

/**
 * One server per request (stateless transport). Tools run as `auth.user`, with
 * the same visibility the UI gives them.
 */
export function buildMcpServer(env: Bindings, ctx: ExecutionContext, auth: AuthContext): McpServer {
  const server = new McpServer(
    { name: "cloudconnect", title: "CloudConnect", version: "1.0.0" },
    {
      instructions:
        "CloudConnect is Packet Fusion's project management platform. Projects are customer " +
        "implementations, each linked to a Dynamics 365 CE case (CAS-xxxxx-xxxxxx) that time is " +
        "logged against. Dates and times are US Pacific. Hours: allotted_hours is the SOW quote, " +
        "hours_used is everything logged to the CE case. Logged time is billable and goes straight to " +
        "payroll: confirm project, date, hours and description with the user before calling " +
        "create_time_entry, and show them the entry_id and ce_time_entry_id it returns.",
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

  // ── Writes ───────────────────────────────────────────────────────────────

  server.registerTool(
    "create_time_entry",
    {
      title: "Log time",
      description:
        "Log time to a project's CE case as me. Project-level by default (CE subject " +
        "\"Project Admin | description\"); pass a stage to log against it instead. Starts at 08:00 " +
        "Pacific unless start_time is given. Pay code comes from my profile. Cost code: pass " +
        "work_type (project_management, software_config, go_live, service_support) based on the " +
        "work described, or cost_code by name; otherwise my last one on this project, then project " +
        "management. Safe to retry: an identical request returns the original entry " +
        "(status \"duplicate\") instead of logging twice. Returns entry_id, logged_at, and " +
        "ce_push with the CE time entry id.",
      inputSchema: {
        project: z.string().min(1).describe("Case number, project id, or name"),
        date: zDate.optional().describe("YYYY-MM-DD, Pacific. Defaults to today"),
        hours: zHours.describe("Duration in hours, e.g. 1.5"),
        description: z.string().min(1).max(500).describe("What the work was"),
        start_time: zTime.optional().describe("HH:MM 24-hour Pacific. Defaults to 08:00"),
        stage: z.string().optional().describe("Stage name or id, to log at stage level"),
        work_type: zWorkType.optional(),
        cost_code: z.string().optional().describe("Exact cost code name or id; overrides work_type"),
        idempotency_key: z.string().max(200).optional().describe("Reuse the same key when retrying this exact request"),
        allow_duplicate: z.boolean().optional().describe("Log even if I already have an entry at exactly this time"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) => {
      const rows = await findProjects(env, user, args.project);
      if (rows.length === 0) return toolError(`No project you can see matches "${args.project}".`);
      if (rows.length > 1) return json({ ambiguous: true, matches: candidates(rows) });
      const project = await env.DB
        .prepare("SELECT id, name, crm_case_id, phase_scoped_visibility FROM projects WHERE id = ?")
        .bind(rows[0].id)
        .first<{ id: string; name: string; crm_case_id: string | null; phase_scoped_visibility: number | null }>();
      if (!project) return toolError("Project not found.");

      return writeResult(await createTimeEntryForUser(env, ctx, auth, {
        project,
        stage: args.stage,
        date: args.date ?? pacificToday(),
        startTime: args.start_time,
        hours: args.hours,
        description: args.description,
        workType: args.work_type,
        costCode: args.cost_code,
        idempotencyKey: args.idempotency_key,
        allowDuplicate: args.allow_duplicate,
      }));
    }
  );

  server.registerTool(
    "update_time_entry",
    {
      title: "Edit my time entry",
      description:
        "Correct one of my own time entries (entry_id from list_time_entries or create_time_entry). " +
        "Only the fields given change; the CE time entry keeps its id. Changing the date or " +
        "start_time keeps the duration unless hours is also given.",
      inputSchema: {
        entry_id: z.string().min(1),
        date: zDate.optional(),
        start_time: zTime.optional(),
        hours: zHours.optional(),
        description: z.string().min(1).max(500).optional(),
        work_type: zWorkType.optional(),
        cost_code: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) => writeResult(await updateTimeEntryForUser(env, ctx, auth, {
      entryId: args.entry_id,
      date: args.date,
      startTime: args.start_time,
      hours: args.hours,
      description: args.description,
      workType: args.work_type,
      costCode: args.cost_code,
    }))
  );

  server.registerTool(
    "delete_time_entry",
    {
      title: "Delete my time entry",
      description: "Delete one of my own time entries, from CloudConnect and from CE. Confirm with the user first.",
      inputSchema: { entry_id: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ entry_id }) => writeResult(await deleteTimeEntryForUser(env, ctx, auth, entry_id))
  );

  return server;
}
