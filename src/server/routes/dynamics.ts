import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";
import { createAccount, searchAccounts, getAccountContacts, getAccountOpportunities, getPacketFusionPMs, getPacketFusionAEs, getPacketFusionSAs, getPacketFusionCSMs, getPacketFusionEngineers, getCases, getCaseByTicketNumber, diagnoseCaseTimeEntries, inspectTimeEntry } from "../services/dynamicsService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/dynamics/accounts?q=Zoom
app.get("/accounts", async (c) => {
  const q = c.req.query("q") ?? "";

  if (!q.trim() || q.trim().length < 2) {
    return c.json([]);
  }

  try {
    const accounts = await searchAccounts(c.env, q);
    return c.json(accounts);
  } catch (err) {
    // Don't expose Dynamics errors to the client — just return empty
    console.error("Dynamics account search error:", err);
    return c.json([]);
  }
});

// POST /api/dynamics/accounts — create a new D365 account from the New
// Solution flow. SA + admin only (mirrors who can create solutions).
// Returns the created account in the same shape as searchAccounts so the
// client can drop it straight into the customer picker.
const createAccountSchema = z.object({
  name: z.string().min(1).max(160),
  emailaddress1: z.string().email().max(100),
  websiteurl: z.string().url().max(200).optional().or(z.literal("")),
});
app.post("/accounts", requireRole("admin", "pf_sa"), async (c) => {
  const parsed = createAccountSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const { name, emailaddress1, websiteurl } = parsed.data;

  try {
    const account = await createAccount(c.env, {
      name,
      emailaddress1,
      websiteurl: websiteurl || null,
    });
    return c.json(account, 201);
  } catch (err) {
    console.error("Dynamics account create error:", err);
    throw new HTTPException(502, { message: "Failed to create account in CRM" });
  }
});

// GET /api/dynamics/accounts/:id/contacts
app.get("/accounts/:id/contacts", async (c) => {
  const accountId = c.req.param("id");

  if (!accountId) {
    throw new HTTPException(400, { message: "Account ID required" });
  }

  try {
    const contacts = await getAccountContacts(c.env, accountId);
    return c.json(contacts);
  } catch (err) {
    console.error("Dynamics contacts fetch error:", err);
    return c.json([]);
  }
});

// GET /api/dynamics/accounts/:id/opportunities[?state=open|open_or_won|all]
// `state=open_or_won` (default) returns statecode in (0, 1) — the solution
// creation modal binds new solutions to in-flight OR recently won deals
// (implementation work often starts right after Won). `state=open` is
// statecode=0 only; `state=all` returns every state so the projects page
// can render a pinned opp's name even after it's lost.
app.get("/accounts/:id/opportunities", async (c) => {
  const accountId = c.req.param("id");
  const state = c.req.query("state") ?? "open_or_won";

  if (!accountId) {
    throw new HTTPException(400, { message: "Account ID required" });
  }

  const allowedStates =
    state === "open" ? [0] :
    state === "open_or_won" ? [0, 1] :
    undefined; // "all"

  try {
    const opps = await getAccountOpportunities(c.env, accountId, { allowedStates });
    return c.json(opps);
  } catch (err) {
    console.error("Dynamics opportunities fetch error:", err);
    return c.json([]);
  }
});

// GET /api/dynamics/cases/search?accountId=&q=
// Returns cases for an account, optionally filtered by ticket number substring.
// Used by PMs to find and link an implementation case to a project.
app.get("/cases/search", async (c) => {
  const accountId = c.req.query("accountId") ?? "";
  const q = c.req.query("q") ?? "";
  try {
    // If q looks like a ticket number, look it up directly
    if (q.toUpperCase().startsWith("CAS-")) {
      const found = await getCaseByTicketNumber(c.env, q.trim());
      return c.json(found ? [found] : []);
    }
    const cases = await getCases(c.env, accountId || undefined);
    const filtered = q
      ? cases.filter((cs) =>
          cs.ticketNumber?.toLowerCase().includes(q.toLowerCase()) ||
          cs.title.toLowerCase().includes(q.toLowerCase())
        )
      : cases;
    return c.json(filtered.slice(0, 50));
  } catch (err) {
    console.error("Dynamics case search error:", err);
    return c.json([]);
  }
});

// GET /api/dynamics/staff/project-managers
app.get("/staff/project-managers", async (c) => {
  try {
    const pms = await getPacketFusionPMs(c.env);
    return c.json(pms);
  } catch (err) {
    console.error("Dynamics PM fetch error:", err);
    return c.json([]);
  }
});

// GET /api/dynamics/staff/account-executives
app.get("/staff/account-executives", async (c) => {
  try {
    const aes = await getPacketFusionAEs(c.env);
    return c.json(aes);
  } catch (err) {
    console.error("Dynamics AE fetch error:", err);
    return c.json([]);
  }
});

// GET /api/dynamics/staff/solution-architects
app.get("/staff/solution-architects", async (c) => {
  try {
    return c.json(await getPacketFusionSAs(c.env));
  } catch (err) {
    console.error("Dynamics SA fetch error:", err);
    return c.json([]);
  }
});

// GET /api/dynamics/staff/client-success-managers
app.get("/staff/client-success-managers", async (c) => {
  try {
    return c.json(await getPacketFusionCSMs(c.env));
  } catch (err) {
    console.error("Dynamics CSM fetch error:", err);
    return c.json([]);
  }
});

// GET /api/dynamics/staff/engineers
app.get("/staff/engineers", async (c) => {
  try {
    return c.json(await getPacketFusionEngineers(c.env));
  } catch (err) {
    console.error("Dynamics engineer fetch error:", err);
    return c.json([]);
  }
});

// GET /api/dynamics/time-entries/:id/inspect  (admin only — dumps all fields on a single amc_timeentry record)
app.get("/time-entries/:id/inspect", async (c) => {
  const auth = c.get("auth");
  if (!auth || auth.role !== "admin") return c.json({ error: "Admin only" }, 403);
  const result = await inspectTimeEntry(c.env, c.req.param("id"));
  return c.json(result);
});

// GET /api/dynamics/cases/:id/diagnose  (admin only — returns raw probe data)
app.get("/cases/:id/diagnose", async (c) => {
  const auth = c.get("auth");
  if (!auth || auth.role !== "admin") {
    return c.json({ error: "Admin only" }, 403);
  }
  const caseId = c.req.param("id");
  try {
    const result = await diagnoseCaseTimeEntries(c.env, caseId);
    return c.json(result);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

export default app;
