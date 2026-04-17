/**
 * Smoke test — verifies the API is alive and routing correctly after a deploy.
 *
 * Usage:
 *   node scripts/smoke-test.mjs                          # tests staging (default)
 *   BASE_URL=https://fusionflow360.com node scripts/smoke-test.mjs   # tests production
 *
 * Exit code 0 = all checks passed
 * Exit code 1 = one or more checks failed
 */

const BASE_URL = process.env.BASE_URL ?? "https://staging.fusionflow360.com";

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(8000) });
  return res;
}

console.log(`\n🔍 Smoke test — ${BASE_URL}\n`);

// ── Public ────────────────────────────────────────────────────────────────────

await check("Health endpoint returns 200", async () => {
  const res = await get("/api/health");
  expect(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  expect(body.ok === true, `Expected {ok:true}, got ${JSON.stringify(body)}`);
});

await check("Frontend SPA serves HTML", async () => {
  const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(8000) });
  expect(res.status === 200, `Expected 200, got ${res.status}`);
  const text = await res.text();
  expect(text.includes("<!doctype html") || text.includes("<!DOCTYPE html"), "Response is not HTML");
});

// ── Auth guard (expect 401, not 500) ─────────────────────────────────────────

const PROTECTED = [
  "/api/me",
  "/api/projects",
  "/api/features",
  "/api/admin/users",
  "/api/cloudsupport",
  "/api/customers",
  "/api/inbox",
];

for (const path of PROTECTED) {
  await check(`${path} is protected (401)`, async () => {
    const res = await get(path);
    expect(
      res.status === 401,
      `Expected 401 (auth guard), got ${res.status} — server may be misconfigured`
    );
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`  ${passed} passed · ${failed} failed`);
console.log(`${"─".repeat(40)}\n`);

if (failed > 0) process.exit(1);
