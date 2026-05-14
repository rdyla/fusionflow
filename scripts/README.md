# scripts/

Operational scripts for CloudConnect / FusionFlow. Not deployed with the worker.

---

## Screen-grab workflow (staging-only)

For promo videos and launch screenshots: temporarily swap the staging
database's real test data for a small set of obviously-fictional records,
then restore.

**Three commands. Always in this order.**

```sh
# 1. Snapshot current staging data to scripts/snapshots/<timestamp>.sql
npm run staging:snapshot

# 2. Wipe data tables + insert clean demo records (Acme, Globex, Hooli, Initech)
npm run staging:demo-seed

# ... capture screenshots from https://staging.cloudconnect.packetfusion.com ...

# 3. Restore real data from the snapshot file
npm run staging:restore -- scripts/snapshots/staging-<timestamp>.sql
```

### What gets wiped / kept

Two different wipes happen depending on the step:

**Demo-seed wipe** (preserves real OAuth users + templates + config so you can still log in and apply templates during the shoot):

| Wiped                                 | Preserved                                      |
|---------------------------------------|------------------------------------------------|
| customers, solutions, projects         | users (real OAuth identities)                  |
| phases, tasks, risks, notes, documents | templates / template_phases / template_tasks   |
| optimize_accounts, utilization_*       | app_settings, labor_config                     |
| project_staff / contacts / access      | d1_migrations (D1 internals)                   |
| labor_estimates, needs_assessments     |                                                |
| meeting_prep_sends, support_digests    |                                                |
| feature_requests, prospects, etc.      |                                                |
| **demo-fixture-`*`** users only        |                                                |

**Restore wipe** (heavy — snapshot rebuilds everything):

| Wiped                                  | Preserved                          |
|----------------------------------------|------------------------------------|
| Everything above PLUS:                 | d1_migrations / sqlite_* / _cf_*   |
| **all users**, templates, app_settings | (D1 internals — also filtered out  |
| labor_config                           |  of the snapshot at replay time)   |

Demo fixture records use ID prefixes (`demo-fixture-`, `demo-cust-`,
`demo-sol-`, `demo-proj-`, etc.) — easy to spot in the DB if something
goes wrong mid-shoot.

### Safety net

`npm run staging:demo-seed` refuses to run unless `scripts/snapshots/`
has at least one snapshot file. Override with `-- --force` only if you
know you have a snapshot elsewhere.

### Files

| File                              | Purpose                                                |
|-----------------------------------|--------------------------------------------------------|
| `staging-snapshot.mjs`            | `wrangler d1 export` → timestamped file in `snapshots/` |
| `staging-demo-seed.mjs`           | Safety check → `wrangler d1 execute` of the seed SQL    |
| `staging-demo-seed.sql`           | Wipe + INSERT of fictional records                      |
| `staging-restore.mjs`             | Wipe + replay a snapshot file                           |
| `staging-wipe-data.sql`           | Shared FK-safe DELETE list (used by restore)            |
| `snapshots/`                      | Gitignored output directory                             |

---

## Other scripts

| File                          | Purpose                                                   |
|-------------------------------|-----------------------------------------------------------|
| `seed.sql`                    | Legacy seed (predates multi-type schema; do not run)      |
| `seed_migration_history.sql`  | Re-stamps `_d1_migrations` after a fresh DB recreate      |
| `setup-structure.sh`          | One-time project scaffold                                 |
| `smoke-test.mjs`              | Post-deploy smoke checks                                  |
