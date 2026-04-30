# Support Module — Port Notes for Standalone Support Portal

Reference doc for the support-module work done in FusionFlow during the
2026-04-28 → 2026-04-29 sprint (PRs #86–#94). Use this as a checklist when
porting the same features into the standalone support portal codebase.

## What was added

| Feature | Surface | Audience |
| --- | --- | --- |
| **Support Dashboard** | `/support/dashboard` | Internal staff |
| **Drill-down filters** | `/support/cases?stale=Nd` and `?stuck=customer` | Internal staff |
| **Vendor pill** | Account name on case detail (and customer detail in FF) | Internal staff |
| **Support Supervisor flag** | Admin user-edit modal | Admin to grant; supervisor to use |
| **Customer Digest emails** | `/support/digests` | Supervisors only |

PRs in chronological order: #86, #87, #88, #89, #91, #92, #93, #94.

---

## D365 dependencies

The standalone portal will need the same D365 access. Key entities/fields:

### `incident` (cases)
- Filter to **Support board only**: `amc_serviceboard eq 173590005` ("Support" option-set value). Without this filter, project-board cases (Install, Onboard, PreSales, Internal, etc.) get mixed in and skew every metric. The full picklist is in PR #88's commit message.
- `severitycode` (option set) — formatted-value annotation gives `"P1"` / `"P2"` / `"P3"` / `"E1"` / `"E2"`
- `statuscode` (option set) — formatted gives `"New"` / `"In Progress"` / `"Waiting on Customer"` / `"Waiting on Vendor"` / etc.
- `statecode` — 0=Active, 1=Resolved, 2=Cancelled
- `createdon`, `modifiedon`
- `_customerid_value` — account GUID (used for per-account filters)
- `owninguser` expanded to `fullname`

### `am_soldtechnology` (vendor pill source)
- Custom entity, list of things sold to an account (UCaaS, hardware, support agreements, etc.)
- Account link: `_am_account_value`
- Vendor link: `_am_vendor_value` (lookup → `am_vendoraccount`); read the formatted-value annotation for the vendor display name
- Category: `am_techtype` (option set). UCaaS-relevant values:
  - `930680017` = UCaaS
  - `930680034` = UCaaS & CCaaS
- Order by `createdon desc`, top 1 → latest UCaaS platform sold

### "Unassigned" heuristic
- Cases owned by the **support-portal D365 app user** count as unassigned. The `owninguser.fullname` for that user is `"# pfsupport portal"` (Packet Fusion's leading-`#` convention for non-human app users). Substring-match `pfsupport portal` to detect them — exact-match misses the `# ` prefix.

### Auth model
- FusionFlow uses **two separate D365 app registrations**: a main one (`d365Fetch`) for general account/incident reads, and a dedicated **support-portal app reg** (`d365FetchSupport`) so cases created via the portal are owned by the `pfsupport portal` user. The standalone portal will likely use the support-portal app reg for its own writes too.

---

## Server endpoints (Hono routes)

All under `/api/support`:

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/dashboard` | Internal-only. Aggregates two D365 queries (open cases + last-30d touched) into KPIs / distributions / aging / trend / staleOpen. |
| GET | `/digests/preview?accountId=…&accountName=…` | Supervisor-only. Returns the digest data + rendered HTML. |
| POST | `/digests/send` | Supervisor-only. Body: `{ accountId, accountName, recipients: [{name?, email}] }`. Fires email via Microsoft Graph + records to D1. |
| GET | `/digests/history?limit=N` | Supervisor-only. Returns recent sends. |
| GET | `/accounts/:id/last-vendor` | Internal-only. Most-recent UCaaS sold-tech for a D365 account GUID. |

Companion endpoint on the customers route: `GET /api/customers/:id/last-vendor` (FF-specific because it goes through a local `customers.crm_account_id` lookup; the standalone portal probably won't need this version).

---

## D1 migrations

### `0059_support_supervisor_flag.sql`
```sql
ALTER TABLE users ADD COLUMN is_support_supervisor INTEGER NOT NULL DEFAULT 0;
```

### `0060_support_digests.sql`
```sql
CREATE TABLE IF NOT EXISTS support_digests (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,           -- D365 account GUID, no FK (incidents are remote)
  account_name TEXT,
  recipients TEXT NOT NULL,           -- JSON: [{ name, email }]
  sent_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  sent_by_name TEXT,
  sent_by_email TEXT,
  open_cases_count     INTEGER NOT NULL DEFAULT 0,
  resolved_cases_count INTEGER NOT NULL DEFAULT 0,
  stale_cases_count    INTEGER NOT NULL DEFAULT 0,
  stuck_cases_count    INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_support_digests_account_id ON support_digests(account_id);
CREATE INDEX idx_support_digests_sent_at    ON support_digests(sent_at DESC);
```

Counts are **snapshotted at send-time** so history rows stay meaningful even after case data shifts later.

---

## Key implementation notes / gotchas

### Permission/role plumbing
- `is_support_supervisor` is an **additive flag** on top of role, not a role itself. Any internal user (PM, AE, CSM, engineer) can be a supervisor. Clients can never be supervisors regardless of flag value (force `is_support_supervisor = 0` server-side when role = `client`).
- Helper: `isSupportSupervisor(auth)` in [src/server/lib/permissions.ts](../src/server/lib/permissions.ts) — checks `isInternal(role) && auth.user.is_support_supervisor === 1`.

### Three-place wiring for any new user field
PR #94 hot-fixed a footgun — when adding a new user column, all three of these must be updated or the value silently doesn't propagate:
1. `findUserByEmail` SELECT in [middleware/auth.ts](../src/server/middleware/auth.ts) (auth context source)
2. `GET /api/admin/users` SELECT in [routes/admin.ts](../src/server/routes/admin.ts) (admin list query)
3. `handleEdit` PATCH payload in [pages/AdminUsersPage.tsx](../src/client/pages/AdminUsersPage.tsx) (the form whitelists fields explicitly)

### Session caching / re-login required
Auth middleware reads the AppUser blob from KV (cached at login). Permission flag changes don't take effect until the affected user logs out and back in. Documented decision (per Ryan): rare events, not worth the complexity of session invalidation. Don't propose otherwise unless requirements change.

### Dashboard math (for digest consistency)
The digest body uses the **same** stale/stuck thresholds as the dashboard so numbers are consistent across surfaces:
- **Stale** = open + `ageDays(createdon) >= 7`
- **Stuck on Customer** = open + `status === "Waiting on Customer"` + `modifiedon <= now - 7d`
- **Window** = 30 days for resolved counts and trend
- **List limit** = top 10 oldest open / most recent resolved on the digest

### Drill-down filters on the cases page
Dashboard KPIs deep-link via URL query params:
- `?stale=Nd` → filters to active + age >= N days
- `?stuck=customer` → filters to active + status `Waiting on Customer` + idle 7d+

When a deep-link filter is active, default `mineOnly` to `false` (team-wide view), and render a clearable red `Filter: <label> ✕` chip. Both filters are pure client-side over the existing `cases` array — no new fetch.

### Module landing for staff
On `ModuleSelectPage`, internal users' Support card routes to `/support/dashboard` (not `/support/cases`). Clients still go to `/support/cases`. Conditional in the `visibleModules.map`.

### Subnav strip
Inlined per-page (Dashboard / Cases / Digests). Active tab: `borderBottom: 2px solid #0891b2`, color `#0891b2`, cursor `default`. Digests tab gated on `user.isSupportSupervisor`.

### Page wrappers
All support pages use `maxWidth: 1200, margin: "0 auto"` to match the implementation dashboard's gutters. PR #89 fixed an inconsistency where cases / case-detail were full-width while dashboard was constrained.

---

## Email infrastructure

### Template
[src/server/lib/emailTemplates.ts](../src/server/lib/emailTemplates.ts) — `supportDigestEmail({ accountName, recipientName, windowDays, kpis, openCases, resolvedCases, appUrl })` returns `{ subject, html }`. Uses the dark CloudConnect theme via the shared `base()` wrapper. Inline-styled HTML (no MJML).

### Send service
[src/server/services/emailService.ts](../src/server/services/emailService.ts) — `sendEmail(env, { to, subject, html })`. Routes via Microsoft Graph as `MAIL_SENDER_UPN` (the CloudConnect shared mailbox). Never throws.

### Dev/staging routing rules (worth replicating)
- `DEV_EMAIL` set → all mail diverted to that address; subject prefixed `[DEV → original-recipients]`
- `APP_URL` contains "staging" → only `@packetfusion.com` recipients delivered; subject prefixed `[STAGING]`
- Otherwise → unmodified production delivery

This is critical to replicate in the standalone portal — it's why testing on staging needs to send to a PF email.

---

## Files to mirror (FF paths → look up the equivalents in the portal repo)

### Server
- `src/server/routes/support.ts` — dashboard + digest endpoints + existing case CRUD
- `src/server/lib/permissions.ts` — `isInternal` + `isSupportSupervisor`
- `src/server/lib/emailTemplates.ts` — `supportDigestEmail` + `base()` helper
- `src/server/services/emailService.ts` — Graph sender
- `src/server/services/dynamicsService.ts` — `d365Fetch`, `d365FetchSupport`, `getLastUcaasVendor`
- `src/server/middleware/auth.ts` — supervisor field in SELECT
- `src/server/routes/admin.ts` — supervisor field in zod + list SELECT
- `migrations/0059_*.sql`, `migrations/0060_*.sql`

### Client
- `src/client/pages/SupportDashboardPage.tsx` — KPIs / donuts / aging / trend / stale list
- `src/client/pages/SupportCasesPage.tsx` — query-param filters + chip
- `src/client/pages/SupportCaseDetailPage.tsx` — vendor pill in metadata card
- `src/client/pages/SupportDigestsPage.tsx` — full digest UI
- `src/client/pages/AdminUsersPage.tsx` — supervisor checkbox + handleEdit payload
- `src/client/components/support/AccountSearch.tsx` — reused by digest page
- `src/client/lib/supportApi.ts` — types + helpers
- `src/client/lib/vendorBadge.ts` — `resolveVendorBadge` (substring match against UCaaS vendor names)
- `src/client/lib/api.ts` — `User` type + `adminUpdateUser` payload type

---

## Out-of-scope for v1 (deferred, may need in the portal)

- **Scheduled / recurring digests** — Cloudflare cron exists but adds state management
- **Per-send content editing** — current preview is read-only
- **Multi-account batch send**
- **Customer-facing dashboard** — internal staff only today; was discussed for v2 with MTD/YTD case stats but specifics never locked
- **Per-customer case stats on the dashboard** — only global aggregates today

---

## Testing notes (lessons from staging)

- D365 creds aren't in local `.dev.vars`, so anything calling `d365Fetch*` must be tested on staging. Workflow is **code → commit → push → small PR → merge to staging → test → iterate**, each iteration its own PR.
- Staging emails filter to `@packetfusion.com` only — send the digest to your own PF email to actually see one.
- Supervisor flag changes require a **re-login** to take effect (KV session caching).
- LevelUp browser addon (Ryan has it) is the fastest way to look up D365 schema — logical names, option-set values, lookup targets. Use it instead of building inspect endpoints.
