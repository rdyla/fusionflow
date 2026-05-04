# Claude project notes — CloudConnect / FusionFlow

Notes here are auto-loaded on every Claude Code session in this repo. They capture the kind of project context you can't derive by reading the code: workflow conventions, design decisions, and pointers to external systems. Keep entries short and load-bearing.

---

## Project context

CloudConnect (internally still "FusionFlow" in code) is a project management platform for **Packet Fusion**, a UCaaS/CCaaS managed services provider. Live at **cloudconnect.packetfusion.com**.

**Stack:** React 19 + React Router 7 (client) · Hono on Cloudflare Workers (server) · D1 (SQLite) · R2 storage · Tailwind CSS.

**CRM:** Microsoft Dynamics 365 at `packetfusioncrm.crm.dynamics.com` — OAuth via Azure AD client credentials.

**Lifecycle chain (1:1:1):**
`Customer (crm_account_id → Dynamics) → Solution (pre-sales) → Project (implementation) → Optimize Account (post go-live)`. Architecture decisions should respect this chain.

**Custom field prefix:** `pfi_` for PacketFusion custom fields in Dynamics (e.g. `pfi_solutionarchitect`, `pfi_sowhours`).

---

## Git workflow

**Never commit directly to `main`.** Cloudflare worker deploys are wired to `main` (production) and `staging` (staging environment). Direct commits to `main` would push untested code to prod customers.

The release flow is:

1. Feature branch off `main` (naming: `feature/<short-description>` or `fix/<short>` or `docs/<short>`)
2. PR feature branch → `staging`
3. Ryan tests on staging
4. After staging verification, PR `staging` → `main` to promote to prod

**Versioning:** version labels follow `vMAJOR.MINOR.PR_NUMBER` (e.g. `v2.1.120`). The PR number is the staging→main promotion PR. Ryan appends `- v2.1.{PR#}` to the merge commit title himself — you don't need to put it in the PR title.

---

## Local-first dev workflow

Default: **edit locally → Ryan verifies via `npm run dev` → only commit/push/PR when ready**.

`npm run dev` runs Vite (client) and `wrangler dev` (worker) concurrently. The worker reads from a local SQLite-backed D1 + KV; secrets come from `.dev.vars` in the repo root (not committed).

**Don't** reflexively `git add` + commit + push + `gh pr create` after editing. Wait for Ryan to say "ready" / "looks good" / "ship it". Tiny one-line fixes Ryan asks you to commit immediately are exempt.

**CRM-dependent work is the exception.** Ryan does NOT have D365 (`DYNAMICS_*`) creds in `.dev.vars`, so anything that calls D365 (support cases, CRM customer pickers, dynamics services) cannot be tested locally. For that work the loop is **code → commit → push → PR → merge to staging → test on staging deploy → iterate**. Each iteration is its own small PR — don't bundle iterations, since Ryan can't verify until something is on staging. If a fix lands on a branch whose PR was already merged, cut a fresh branch off `origin/staging` and cherry-pick the fix into a new PR.

---

## D365 schema lookup

Ryan has the **LevelUp** browser addon (Chrome/Edge) installed and can inspect logical field names, option-set values, and lookup targets directly from D365 forms.

**Don't** build admin-only inspect endpoints or `$select` probes as a first move. Just ask Ryan for the field metadata — he can pull it from LevelUp in seconds.

Example: when filtering `incident` records to "Support" cases, asked for `amc_serviceboard` field type + value → LevelUp screenshot showed it as an OptionSet with "Support" = `173590005`.

---

## CRM case integration (hours compliance)

Migration `0029` adds `crm_case_id TEXT` to projects. PMs link a Dynamics 365 case (incident GUID) to a project via the "CRM Case" tab.

- **SOW Hours source:** `pfi_sowhours` field on Dynamics 365 **Opportunities** (linked to the customer account). This is the authoritative quoted hours for compliance.
- **Time entries source:** `msdyn_timeentry` entity, filtered by `_msdyn_relateditem_id_value eq {caseId}`. Returns gracefully empty if Field Service module not present.
- **Case search:** `/api/dynamics/cases/search?q=CAS-XXXXX` — supports direct ticket number lookup and keyword search within account cases.
- Test case: Beta Bionics, implementation case `CAS-195894-C3P8Q0`.

When working on hours compliance: quoted = SOW hours from opportunity, actual = sum of `msdyn_timeentry` durations. The `labor_estimates` table (via `solution_id`) is secondary reference.

---

## Session caching is intentional

The auth middleware caches the full `AppUser` blob in KV at login time and reads it from KV (not D1) on every request. **Flag/role/permission changes don't take effect until the affected user logs out and back in.**

This is intentional: permission grants are rare events done by an admin, not on-the-fly assignments. The realistic blast radius is "the one or two people who actually got the new flag have to log out once" — not worth the complexity of session-invalidation logic or per-request DB hits.

When adding a new boolean permission/flag (`is_support_supervisor`, `cs_permission`, `is_project_resource`, etc.):

- ✓ Add the column, add it to `findUserByEmail`'s SELECT, expose it via the admin user PATCH
- ✗ Don't propose re-resolving AppUser from D1 on each request
- ✗ Don't propose a KV invalidation pass on the admin user-PATCH endpoint
- ✗ Don't propose a user-id → session-id secondary index

If Ryan hits "I granted myself the flag but the UI doesn't see it" — just remind him to re-login.

---

## Security audit (April 2026)

Full 48-item audit completed. The five Priority-1 items below are the ones to fix before pen test.

### Priority 1 — fix before launch (critical)

| # | File | Issue | Effort |
|---|---|---|---|
| 1 | `src/server/lib/emailTemplates.ts` | XSS: user data (`projectName`, `taskTitle`, `noteBody`, `riskDescription`, etc.) embedded raw into HTML email strings — no escaping | 30 min |
| 2 | `src/server/index.ts:38` | CORS wide open: `app.use("*", cors())` with no origin — change to `cors({ origin: "https://fusionflow360.com" })` | 5 min |
| 3 | `src/server/routes/documents.ts` | IDOR: download endpoint checks doc belongs to project but never calls `canViewProject()` — user with a doc ID can download from any project | 15 min |
| 4 | `src/server/middleware/auth.ts:107-116` | Impersonation has no audit trail: admin can silently impersonate any user via `x-impersonate-email` with no logging | 20 min |
| 5 | `src/server/middleware/auth.ts:60-63` | Partner auto-provisioning: any `@zoom.com`, `@zoom.us`, `@ringcentral.com` email auto-gets `partner_ae` access — remove or require manual approval | 10 min |

### Priority 2 — fix soon (high)

| # | File | Issue |
|---|---|---|
| 6 | `src/server/index.ts` | Add security headers middleware: HSTS, X-Frame-Options, X-Content-Type-Options |
| 7 | `src/server/routes/documents.ts:84` | File upload: no MIME type whitelist — accept only PDF/images/Office docs; randomize stored filename |
| 8 | `src/server/routes/authPublic.ts` | Rate limiting: per-email OTP limit exists but no IP-based limiting — add IP rate limit before public launch |
| 9 | `src/server/routes/authPublic.ts:8` | Session TTL 8 hours — reduce to 4 hours |
| 10 | Multiple routes | Date fields accept any string — add Zod `.regex(/^\d{4}-\d{2}-\d{2}$/)` validation |

### Non-issues (sound scary, actually fine)

- Dynamic SQL `inPlaceholders()` — uses `?,?,?` bound separately, NOT injectable
- KV session signing — KV not externally accessible on Cloudflare Workers
- Column-level encryption — not standard for D1; Cloudflare encrypts at rest
- No 2FA — OTP email login IS a form of MFA, sufficient for this use case
