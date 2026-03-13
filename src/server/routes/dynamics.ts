import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Bindings, Variables } from "../types";
import { searchAccounts, getAccountContacts, getAccountOpportunities, getPacketFusionPMs, getPacketFusionAEs, getPacketFusionSAs, getPacketFusionCSMs, getPacketFusionEngineers } from "../services/dynamicsService";

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

// GET /api/dynamics/accounts/:id/opportunities
app.get("/accounts/:id/opportunities", async (c) => {
  const accountId = c.req.param("id");

  if (!accountId) {
    throw new HTTPException(400, { message: "Account ID required" });
  }

  try {
    const opps = await getAccountOpportunities(c.env, accountId);
    return c.json(opps);
  } catch (err) {
    console.error("Dynamics opportunities fetch error:", err);
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

export default app;
