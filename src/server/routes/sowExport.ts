/**
 * SOW Word (.docx) export — forwards the client-built HTML to the
 * LibreOffice converter Lambda and re-streams the binary back as a
 * downloadable .docx.
 *
 * Why a server endpoint at all (vs. the client calling the Lambda
 * directly): keeps the Lambda's shared secret out of the browser. The
 * secret only ever lives in Wrangler secrets + the Lambda's env block,
 * not in the JS bundle.
 *
 * Why this isn't done as a streamed conversion: LibreOffice has to read
 * the full HTML before it starts converting, and the .docx isn't
 * generated incrementally. A whole-file request/response round-trip is
 * the right shape.
 *
 * Endpoint:
 *   POST /api/sow/word-export
 *   Body: { html: string, filename?: string }
 *   Returns: application/vnd.openxmlformats-officedocument.wordprocessingml.document
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const exportSchema = z.object({
  html: z.string().min(50).max(8 * 1024 * 1024),
  filename: z.string().max(255).optional(),
});

// Internal staff only — clients/partner AEs don't need to generate Word
// SOWs (they review them). Admins included implicitly.
app.post(
  "/word-export",
  requireRole("admin", "pm", "pf_ae", "pf_sa", "pf_csm", "executive"),
  async (c) => {
    if (!c.env.SOW_CONVERTER_LAMBDA_URL || !c.env.SOW_CONVERTER_SHARED_SECRET) {
      throw new HTTPException(503, {
        message: "Word export is not configured for this environment. See aws/sow-converter/README.md.",
      });
    }

    const parsed = exportSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      throw new HTTPException(400, { message: "Invalid request body" });
    }
    const { html, filename } = parsed.data;

    // Forward to Lambda. The Function URL accepts JSON POST + shared
    // secret in X-PFI-Auth.
    let lambdaRes: Response;
    try {
      lambdaRes = await fetch(c.env.SOW_CONVERTER_LAMBDA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PFI-Auth": c.env.SOW_CONVERTER_SHARED_SECRET,
        },
        body: JSON.stringify({ html }),
        // Lambda cold-starts can take ~10s; allow generous time before
        // the Worker bails. CF Workers have their own 30s default;
        // explicit AbortSignal here makes the bound clear.
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      console.error("[sow.word-export] Lambda fetch failed:", err);
      throw new HTTPException(502, { message: "Conversion service unreachable. Try again in a few seconds (cold start)." });
    }

    if (!lambdaRes.ok) {
      const detail = await lambdaRes.text().catch(() => "");
      console.error(`[sow.word-export] Lambda returned ${lambdaRes.status}: ${detail}`);
      throw new HTTPException(502, { message: `Conversion failed (${lambdaRes.status}).` });
    }

    const docxBuffer = await lambdaRes.arrayBuffer();
    const safeFilename = (filename ?? "SOW").replace(/[\\/:*?"<>|]/g, "_");
    return new Response(docxBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeFilename}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  },
);

export default app;
