# CloudConnect — Deployment & UAT Plan

**Stack:** React 19 + TypeScript + Vite · Hono on Cloudflare Workers · D1 SQLite · KV + R2 · Microsoft Graph (transactional email) · `wrangler` CLI · GitHub Actions
**Domain:** cloudconnect.packetfusion.com
**Last Updated:** May 20 2026

---

## 1. Environments

| Environment | URL | Trigger | Database |
|---|---|---|---|
| **Local Dev** | `localhost:5173` (Vite) / `localhost:8787` (Worker) | Manual — `npm run dev` | Local D1 replica via `wrangler dev` |
| **Staging** | staging.cloudconnect.packetfusion.com | Push to `staging` via GitHub Actions | D1 `fusionflow-staging` |
| **Production** | cloudconnect.packetfusion.com | Push to `main` via GitHub Actions | D1 `fusionflow` (live) |

Each environment has its own D1 + KV + R2 bindings (see `wrangler.json`). The staging gate signal is the literal substring `"staging"` in the hostname / `APP_URL` — this controls the staging banner and the PF-only email allow-list filter.

---

## 2. Branch Strategy

```
main                  ← production; every merge auto-deploys via GitHub Actions
  ↑
staging               ← pre-production gate; every merge auto-deploys to staging
  ↑
  └── feature/*       ← all dev work; PR into staging
  └── fix/*           ← bug fixes; PR into staging (use hotfix/* for prod-only urgent)
  └── docs/*          ← doc-only changes; PR into staging
```

**Rules:**
- No direct commits to `main` or `staging` — branch protection enforces PRs.
- PRs require the TypeScript check workflow (`pr-check.yml`) to pass before merge.
- Feature branch → PR to `staging` → user verifies on staging deploy → PR `staging` → `main` to promote.
- Versioning: `vMAJOR.MINOR.PR#` where PR# is the staging-to-main promotion PR (appended to the merge commit title by the maintainer).

---

## 3. Build Pipeline

Three GitHub Actions workflows:

| Workflow | Trigger | Purpose |
|---|---|---|
| `pr-check.yml` | PR to `main` or `staging` | Runs `tsc -b --noEmit`. Gate is enforced via branch protection rulesets. |
| `deploy-staging.yml` | Push to `staging` | Applies D1 migrations, builds, deploys to staging Worker, runs smoke tests, sends Zoom Team Chat notification. |
| `deploy.yml` | Push to `main` | Same steps targeting production. |

**Deploy job steps:**
```
1. npm clean-install --progress=false
2. tsc -b --noEmit                                ← TypeScript check
3. wrangler d1 migrations apply <env> --remote    ← Auto-apply pending D1 migrations
4. vite build                                     ← Bundle client assets
5. wrangler deploy --env <env>                    ← Publish Worker + assets
6. node scripts/smoke-test.mjs                    ← 9-check health probe
7. Zoom Team Chat webhook                         ← 🟡/🔴 staging, ✅/❌ prod
```

**Build fails loudly on:**
- Any TypeScript error (strict mode enforced)
- Vite bundling errors
- Wrangler config errors
- **D1 migration failure** (any pending migration that errors blocks the deploy — fix the migration on a follow-up branch and re-merge to recover; see Section 4)
- Smoke test failure (any of the 9 checks)

---

## 4. Database Migration Process

Migrations live in `/migrations/` as sequentially numbered SQL files (`0001_initial.sql` → current). The deploy workflow runs `wrangler d1 migrations apply` automatically against the target environment before the Worker is published — there is no manual `wrangler d1 execute` step in normal operation.

### Standard Flow

```bash
# 1. Write migration file locally
#    /migrations/XXXX_your_feature.sql

# 2. Apply to local D1 for development and testing
wrangler d1 execute fusionflow --local --file=migrations/XXXX_your_feature.sql

# 3. Test locally — run the app, exercise the new schema

# 4. PR to staging. GitHub Actions runs `wrangler d1 migrations apply --remote` against
#    fusionflow-staging during the staging deploy, then deploys the Worker. Verify on
#    staging.

# 5. PR staging -> main. Production deploy applies the migration against fusionflow
#    BEFORE the Worker publish step, so code+schema always land together.
```

D1 wraps each migration file in a transaction, so a mid-file failure rolls back DDL + DML together (SQLite supports DDL rollback). The migration is NOT marked applied in `d1_migrations` until it succeeds end-to-end.

### Recovering From a Failed Migration

If a deploy fails at the migration step (the deploy workflow stops there, blocking the Worker publish):

1. Inspect the GitHub Actions log for the SQLite error.
2. Cut a `fix/<migration-name>` branch off `staging`.
3. Edit the broken migration file directly — it never persisted, so it's safe to modify in place (this is the one acceptable exception to "migrations are immutable"). If the file *partially* applied somehow, split the offending statement into a new follow-on migration instead.
4. PR to staging. The next deploy re-attempts the migration cleanly.

This recovery path was used for migration `0081_template_go_live_event_flag.sql` in PR #195 after a duplicate primary key in the INSERT broke the deploy.

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

### Pre-Merge (staging PR)
- [ ] `npx tsc --noEmit` passes locally with no errors
- [ ] New migration (if any) tested against local D1 via `wrangler d1 execute --local`
- [ ] Any new environment variables or bindings added to `wrangler.json` and configured in the Cloudflare dashboard for **both** envs (production + staging)
- [ ] Email templates (if changed) verified — Graph mailer sends from `cloudconnect@packetfusion.com`
- [ ] PR reviewed — no commented-out code, no hardcoded secrets, no console.log left in
- [ ] `pr-check.yml` (TypeScript) is green on the PR

### Staging Verification
- [ ] Merge PR to `staging`. Confirm `deploy-staging.yml` finishes green (Zoom Team Chat 🟡).
- [ ] If the deploy fails at the migration step, see Section 4 "Recovering From a Failed Migration".
- [ ] Exercise the affected feature end-to-end on `staging.cloudconnect.packetfusion.com`.

### Promotion to Production
- [ ] PR `staging` → `main`. Append `- v2.1.{PR#}` to the merge commit title (the maintainer does this on merge).
- [ ] Confirm `deploy.yml` finishes green (Zoom Team Chat ✅).
- [ ] Smoke test on `cloudconnect.packetfusion.com`.

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

For significant feature releases (new pages, schema changes, permission logic), UAT runs against the staging deploy (`staging.cloudconnect.packetfusion.com`). Local `wrangler dev` is used for development, but staging is the canonical signoff surface.

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

Resolved since the prior version of this doc (now part of the standard flow):

- ~~Staging Worker environment~~ — done (`fusionflow-staging` + `staging.cloudconnect.packetfusion.com`).
- ~~Automate D1 migrations in CI~~ — done (`wrangler d1 migrations apply --remote` runs in `deploy-staging.yml` and `deploy.yml`).
- ~~Smoke test script~~ — done (`scripts/smoke-test.mjs`, 9 checks, exits non-zero on any failure).
- ~~Deploy notifications~~ — done (Zoom Team Chat webhook from both workflows).

Open items:

| Priority | Item | Why |
|---|---|---|
| **Medium** | PR template with embedded UAT checklist | Ensures pre-deploy checklist is completed consistently by all contributors |
| **Medium** | Automated UI tests (Playwright) | Smoke test only probes API surface; UI regressions still need manual UAT |
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
| `wrangler d1 migrations apply fusionflow-staging --remote --env staging` | Manually apply pending migrations to staging (CI normally handles this) |
| `wrangler d1 migrations apply fusionflow --remote` | Manually apply pending migrations to production (CI normally handles this) |
| `node scripts/smoke-test.mjs` | Run the 9-check smoke probe against `BASE_URL` (defaults to staging) |
| `wrangler deploy --env staging` | Manual staging deploy (normally handled by CI) |
| `wrangler deploy` | Manual production deploy (normally handled by CI) |
