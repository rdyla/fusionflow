/**
 * CloudConnect SOW → DOCX Lambda handler.
 *
 * Invocation: Lambda Function URL with POST + JSON body.
 *
 *   POST {function-url}
 *   Headers:
 *     Content-Type: application/json
 *     X-PFI-Auth: <shared secret matching SOW_CONVERTER_SHARED_SECRET env var>
 *   Body:
 *     { "html": "<full SOW HTML document>" }
 *
 * Response: base64-encoded .docx with the proper content type. The CF
 * Worker that invokes this function is responsible for restreaming the
 * binary body back to the browser and triggering download.
 *
 * Why a shared secret instead of IAM SigV4: keeps the Worker integration
 * one HTTP call with no AWS SDK dep. The secret is set at deploy time
 * via `aws lambda update-function-configuration --environment` and
 * mirrored as a Wrangler secret on the CF side.
 */

import { writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const SHARED_SECRET = process.env.SOW_CONVERTER_SHARED_SECRET ?? "";
const MAX_HTML_BYTES = 8 * 1024 * 1024; // 8 MB — generous; real SOWs are ~200 KB

export const handler = async (event) => {
  // Lambda Function URLs send the request body as a string. API Gateway
  // sends an object. Handle both.
  const headers = lowercaseHeaders(event.headers ?? {});
  const rawBody = event.body ?? "";

  // Auth
  const provided = headers["x-pfi-auth"] ?? "";
  if (!SHARED_SECRET || provided !== SHARED_SECRET) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  // Size guard
  const bodyBytes = event.isBase64Encoded
    ? Math.floor(rawBody.length * 0.75) // approx after base64
    : Buffer.byteLength(rawBody, "utf8");
  if (bodyBytes > MAX_HTML_BYTES) {
    return jsonResponse(413, { error: "HTML payload too large" });
  }

  // Decode body if base64'd (Function URLs base64 when content-type is
  // binary; for JSON it's typically plain).
  const bodyText = event.isBase64Encoded
    ? Buffer.from(rawBody, "base64").toString("utf8")
    : rawBody;

  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }
  const html = typeof parsed.html === "string" ? parsed.html : null;
  if (!html) return jsonResponse(400, { error: "Missing html field" });

  // Run LibreOffice. /tmp is the only writable dir on Lambda.
  const reqId = randomUUID();
  const workDir = tmpdir();
  const inputPath  = join(workDir, `sow-${reqId}.html`);
  const outputPath = join(workDir, `sow-${reqId}.docx`);

  try {
    await writeFile(inputPath, html, "utf8");

    await runLibreOffice(["--headless", "--convert-to", "docx", "--outdir", workDir, inputPath]);

    const docx = await readFile(outputPath);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Cache-Control": "no-store",
      },
      isBase64Encoded: true,
      body: docx.toString("base64"),
    };
  } catch (err) {
    console.error("LibreOffice conversion failed:", err);
    return jsonResponse(500, { error: "Conversion failed", detail: String(err?.message ?? err) });
  } finally {
    // Best-effort cleanup. Failures here are non-fatal — /tmp is wiped
    // between cold starts anyway.
    unlink(inputPath).catch(() => {});
    unlink(outputPath).catch(() => {});
  }
};

function runLibreOffice(args) {
  // `soffice` is LibreOffice's canonical CLI; `libreoffice` is just a
  // symlink in some distros (and missing in our tarball install on
  // AL2023). HOME=/tmp because the profile-init step needs a writable
  // home directory; /tmp is the only writable path on Lambda.
  return new Promise((resolve, reject) => {
    const proc = spawn("soffice", args, {
      env: { ...process.env, HOME: "/tmp" },
    });
    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`soffice exited ${code}: ${stderr.trim()}`));
    });
  });
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function lowercaseHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
}
