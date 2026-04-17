# FusionFlow — Deployment & UAT Plan

**Stack:** React 19 + TypeScript + Vite · Hono on Cloudflare Workers · D1 SQLite · KV + R2 · Resend · `wrangler` CLI  
**Domain:** fusionflow360.com  
**Last Updated:** April 2026

---

## 1. Environments

| Environment | URL | Trigger | Database |
|---|---|---|---|
| **Local Dev** | `localhost:5173` (Vite) / `localhost:8787` (Worker) | Manual — `npm run dev` | Local D1 replica via `wrangler dev` |
| **Production** | fusionflow360.com | Push to `main` via Cloudflare CI | D1 `fusionflow` (live) |

> **Gap:** No dedicated staging environment currently exists. Recommendation: create a `staging` Cloudflare Workers environment with a separate D1 database and Worker name (`fusionflow-staging`) to gate production releases. This is the highest-priority infrastructure item.

---

## 2. Branch Strategy

```
main                  ← production; every merge auto-deploys
  └── feature/*       ← all dev work; PR into main
  └── hotfix/*        ← urgent production fixes; PR into main, fast-track UAT
```

**Rules:**
- No direct commits to `main` for anything beyond trivial config.
- Every PR requires: TypeScript clean (`tsc --noEmit`), manual smoke test of affected flows.
- Hotfix branches skip feature UAT but must still pass smoke test and deployment verification.

---

## 3. Build Pipeline

Steps executed by Cloudflare CI on every push to `main`:

```
1. npm clean-install --progress=false
2. tsc -b                        ← TypeScript compilation (client + server)
3. vite build                    ← Bundles client assets to /dist
4. wrangler deploy               ← Publishes Worker + assets to Cloudflare edge
```

**Build fails loudly on:**
- Any TypeScript error (strict mode enforced)
- Vite bundling errors
- Wrangler config errors

**What the build does NOT do automatically:**
- Run database migrations (D1 migrations are manual — see Section 4)
- Send deploy notifications
- Run automated tests (none exist yet — see Section 7)

---

## 4. Database Migration Process

Migrations live in `/migrations/` as sequentially numbered SQL files (`0001_initial.sql` → current).

### Standard Migration Flow

```bash
# 1. Write migration file locally
#    /migrations/XXXX_your_feature.sql

# 2. Apply to local D1 for development and testing
wrangler d1 execute fusionflow --local --file=migrations/XXXX_your_feature.sql

# 3. Test locally — run the app, exercise the new schema

# 4. Apply to production D1 BEFORE deploying the Worker code
wrangler d1 execute fusionflow --remote --file=migrations/XXXX_your_feature.sql

# 5. Merge PR to main — Cloudflare CI deploys the Worker automatically
```

> **Critical rule:** Always apply the migration to production D1 **before** the Worker code that depends on it goes live. Deploying code before schema causes 500 errors during the deployment window.

### Rollback

D1 has no built-in migration rollback. Best practices:
- Keep a `-- rollback:` comment block in each migration file with the inverse DDL.
- For destructive data migrations, back up the affected table first:
  ```sql
  CREATE TABLE backup_table AS SELECT * FROM target_table;
  ```

---

## 5. Deployment Checklist

Use this checklist for every non-trivial release.

### Pre-Deploy
- [ ] `npx tsc --noEmit` passes locally with no errors
- [ ] New migration (if any) applied to production D1 via `wrangler d1 execute --remote`
- [ ] Any new environment variables or bindings added to `wrangler.json` and configured in the Cloudflare dashboard
- [ ] Resend email templates (if changed) verified against a test address
- [ ] PR reviewed — no commented-out code, no hardcoded secrets, no console.log left in

### Deploy
- [ ] Merge PR to `main`
- [ ] Monitor Cloudflare CI build log — confirm clean exit (no red)
- [ ] Cloudflare dashboard confirms new Worker version is active

### Post-Deploy (5-Minute Smoke Test)
- [ ] Login flow works (PF user + partner user)
- [ ] Dashboard loads without console errors
- [ ] Any feature touched in this release exercised end-to-end
- [ ] Admin Users page loads; org tabs and grouping function correctly
- [ ] Cloud Support Calculator opens and generates a document
- [ ] Roadmap page loads; voting and submission work
- [ ] No new errors in Cloudflare Workers observability log

---

## 6. UAT Protocol

For significant feature releases (new pages, schema changes, permission logic), UAT should be completed before merging to `main`. Until a staging environment exists, UAT runs against a local `wrangler dev` session seeded with realistic test data.

### Phase 1 — Functional
- Tester exercises the feature's primary happy path end-to-end
- Tester exercises edge cases: empty state, missing data, invalid input, boundary values
- All CRUD operations for affected entities verified (create, read, update, delete)

### Phase 2 — Permissions
- Feature tested under each applicable role: Admin, PF team member (PM/AE/CSM/Engineer), Partner AE, Client
- Confirm unauthorized roles cannot access restricted routes — verify 403 response directly via browser DevTools Network tab, not just UI hiding

### Phase 3 — Document / Export (where applicable)
- Any generated HTML document (proposal, MSO agreement, Cloud Support agreement) opened in print preview
- Pagination visually checked — no headings or section numbers split across page breaks
- PDF printed from browser and reviewed for layout integrity

### Phase 4 — Sign-Off
- UAT summary recorded in the PR description: what was tested, by whom, any deferred issues noted
- Go / No-go decision documented before merge

---

## 7. Gaps & Recommended Next Steps

| Priority | Item | Why |
|---|---|---|
| **High** | Add a `staging` Worker environment | No pre-production gate — all changes currently go straight to prod |
| **High** | Automate D1 migration execution in CI | Manual migration step is easy to skip and causes production outages |
| **Medium** | Add a smoke test script (Playwright or plain fetch) | Build passes even when the API is broken at the application layer |
| **Medium** | PR template with embedded UAT checklist | Ensures pre-deploy checklist is completed consistently by all contributors |
| **Low** | Slack or email deploy notification webhook | No signal currently when a deploy completes or fails |
| **Low** | Automated D1 table backup before migrations | D1 has no auto-snapshot; a backup step before destructive migrations adds a safety net |

---

## 8. Key Scripts Reference

| Command | Purpose |
|---|---|
| `npm run dev` | Start local dev (Vite client + Wrangler Worker concurrently) |
| `npm run build` | Production build (`tsc -b && vite build`) |
| `npx tsc --noEmit` | TypeScript type-check only, no output |
| `npm run check` | Full pre-deploy validation (tsc + build + wrangler dry-run) |
| `wrangler d1 execute fusionflow --local --file=<file>` | Apply migration to local D1 |
| `wrangler d1 execute fusionflow --remote --file=<file>` | Apply migration to production D1 |
| `wrangler deploy` | Manual production deploy (normally handled by CI) |
