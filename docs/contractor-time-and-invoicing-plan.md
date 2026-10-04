# Contractor Time & Invoicing — augmentation plan

Status: **proposed**, not started. Target module: Projects.

Lets outside consultants track their own hours against a project and generate
invoices for accounting to settle, with those hours reconciling against the
project's opportunity alongside internal time.

---

## 1. The problem, precisely

Two populations of contractor, with different failure modes today.

### Population A — internal-email contractors

Former Packet Fusion staff who come back on contract. They log in with their
`@packetfusion.com` address, so `resolveUserByEmail` auto-provisions them as
`pm` (`middleware/auth.ts:138`) and they get portfolio-wide read. PMs add them
to projects as Implementation Engineers. This all works.

**What's broken:** they are deactivated in CE. Every log-time route resolves the
Dynamics owner first:

```ts
// services/dynamicsService.ts:1213
`/systemusers?$select=systemuserid&$filter=internalemailaddress eq '${escaped}' and isdisabled eq false&$top=1`
```

`isdisabled eq false` excludes them, so `getSystemUserIdByEmail` returns `null`
and `routes/tasks.ts:730` throws:

```
422  No Dynamics user found for {email}
```

Their hours are currently **uncapturable**. Not mis-attributed — simply
impossible to enter. PMs are either re-keying them by hand under their own name
or losing them.

### Population B — external-email contractors

Not `@packetfusion.com`, not a partner domain, not a CRM contact. In
`resolveUserByEmail` they fall through every branch to `return null` — they
**cannot log in at all**. If one happens to also be a customer contact in D365,
they resolve to `client`, scoped to that customer's account, which is worse than
no access.

### What both need

- Log hours against a project, on the same stages everyone else uses.
- Have those hours approved by the PM.
- Generate an invoice from approved hours for accounting to settle.
- Appear to the customer as an **Implementation Engineer**. The contractor
  designation is internal-only and must never reach a client session.

---

## 2. Design decisions

Confirmed with Ryan before drafting:

| Decision | Choice |
|---|---|
| SOW reconciliation | Contractor hours burn SOW hours **1:1**, same as internal |
| Dynamics 365 | **D1 only.** No `amc_timeentry` push |
| Invoice document | **CloudConnect generates it** from approved hours × rate |
| Contractor UX | Reuse the normal app. No separate portal |

### Role and flag are separate concerns

The single most important structural call. Two orthogonal things:

- **Role governs visibility.** Population A keeps whatever role it already has —
  no change, no visibility regression, no disruption to people working today.
  Population B gets a new `contractor` role.
- **A new `users.is_contractor` flag governs billing behavior.** Set on *both*
  populations. This is what routes time away from D365 and unlocks invoicing.

This follows the established additive-flag pattern (`is_project_resource`,
`is_pm_eligible`, `is_support_supervisor`, `is_sales_tools`) and the guidance in
CLAUDE.md § "Session caching is intentional" — add the column, add it to
`findUserByEmail`'s SELECT, expose it on the admin user PATCH, and accept that
it takes effect on next login.

### Why `contractor` as a role scopes correctly for free

`canViewProject` (`services/accessService.ts:33`) returns `true` early for
`admin`, `executive`, `pm`, `pf_sa`, `pf_csm`, `pf_engineer`. Any role not named
falls through to the final branch, which checks `project_access` for that user
only. A new `contractor` role therefore inherits **scoped, explicit-grant-only
visibility** without touching any existing branch.

### ⚠️ Gap this exposes

That fall-through checks `project_access` — **not `project_staff`**. So adding a
`contractor`-role user to `project_staff` as an engineer grants them nothing;
they'd be staffed on a project they cannot open.

Fix: add a `project_staff` check to the fall-through, mirroring what `partner_ae`
already does at `accessService.ts:91-95`. Staffing someone on a project should
be what grants them access to it.

```ts
// accessService.ts — final branch
const explicitAccess = await db
  .prepare("SELECT id FROM project_access WHERE project_id = ? AND user_id = ? LIMIT 1")
  .bind(projectId, user.id).first();
if (explicitAccess) return true;

// NEW: being staffed on the project grants view.
const staffed = await db
  .prepare("SELECT 1 FROM project_staff WHERE project_id = ? AND user_id = ? LIMIT 1")
  .bind(projectId, user.id).first();
return !!staffed;
```

Verify this doesn't widen anything unintended for existing roles that reach this
branch before shipping.

### Relationship to `project_external_resources`

The existing External Resources table (migration `0113`) stays as-is. It serves a
genuinely different case: a flat dollar amount for a one-off vendor (a Field
Nation tech) who will never have a login. Contractors who log in and track hours
are a new model.

Both roll into the same reconciliation view so the PM sees one set of numbers.

---

## 3. Schema

Migration `0139_contractors.sql` (0138 is current head).

```sql
-- Contractor designation. Orthogonal to role: an internal ex-employee keeps
-- their pm/pf_engineer role and just carries this flag; an external contractor
-- carries the flag AND the scoped `contractor` role. The flag alone decides
-- whether time routes to D365 or stays local.
ALTER TABLE users ADD COLUMN is_contractor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN contractor_org TEXT;         -- billing entity name
ALTER TABLE users ADD COLUMN default_hourly_rate REAL;    -- fallback rate

-- Per-project rate override. Rates are compensation data: never exposed to
-- clients, and never to contractors other than the subject.
CREATE TABLE contractor_rates (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hourly_rate        REAL NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, user_id)
);

-- Contractor hours. Deliberately NOT modeled on stage_time_entries: those carry
-- scheduled_start/scheduled_end because D365 requires a window. Contractors
-- bill in hours against a date, and nothing here goes to D365.
CREATE TABLE contractor_time_entries (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_id           TEXT REFERENCES stages(id) ON DELETE SET NULL,
  phase_id           TEXT REFERENCES phases(id) ON DELETE SET NULL,
  user_id            TEXT NOT NULL REFERENCES users(id),
  work_date          TEXT NOT NULL,              -- yyyy-MM-dd
  hours              REAL NOT NULL,
  description        TEXT,
  -- draft | submitted | approved | rejected | invoiced
  status             TEXT NOT NULL DEFAULT 'draft',
  approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at        TEXT,
  reject_reason      TEXT,
  rate_snapshot      REAL,                       -- rate at approval, frozen
  invoice_id         TEXT,                       -- set when invoiced
  created_at         TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_cte_project ON contractor_time_entries (project_id, status);
CREATE INDEX idx_cte_user    ON contractor_time_entries (user_id, work_date);
CREATE INDEX idx_cte_invoice ON contractor_time_entries (invoice_id);

CREATE TABLE contractor_invoices (
  id                 TEXT PRIMARY KEY,
  invoice_number     TEXT NOT NULL UNIQUE,
  user_id            TEXT NOT NULL REFERENCES users(id),
  project_id         TEXT REFERENCES projects(id) ON DELETE SET NULL,
  period_start       TEXT,
  period_end         TEXT,
  total_hours        REAL NOT NULL DEFAULT 0,
  total_amount       REAL NOT NULL DEFAULT 0,
  -- draft | submitted | approved | rejected | paid
  status             TEXT NOT NULL DEFAULT 'draft',
  submitted_at       TEXT,
  approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at        TEXT,
  paid_at            TEXT,
  payment_reference  TEXT,
  reject_reason      TEXT,
  r2_key             TEXT,                       -- immutable rendered snapshot
  created_at         TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ci_user   ON contractor_invoices (user_id, created_at DESC);
CREATE INDEX idx_ci_status ON contractor_invoices (status, created_at DESC);
```

**`rate_snapshot` matters.** The rate is frozen onto the entry at approval time.
Changing a contractor's rate later must not retroactively alter the value of
hours already approved or invoiced.

---

## 4. Time capture

### Routing

The contractor uses the **same Log Time UI** as everyone else. The branch is
server-side, in the stage and project-admin log-time handlers, placed *before*
the Dynamics owner lookup:

```ts
if (auth.user.is_contractor === 1) {
  // Local only. No getSystemUserIdByEmail, no createTimeEntry, no closeTimeEntry.
  // → INSERT INTO contractor_time_entries (status = 'submitted')
}
// else: existing D365 path, untouched
```

Everything about the existing internal path is unchanged. This is purely
additive — which also means it immediately fixes the `422` for Population A
rather than working around it.

Pay code and cost code are **not collected** from contractors. They're D365
payroll concepts with no meaning for a 1099 invoice, and both are currently
required by `logStageTimeSchema` — the contractor variant of the schema drops
them and requires `work_date` + `hours` + `description` instead.

### Approval

`draft → submitted → approved → invoiced`, with `rejected` as a side exit.

Only `approved` hours are invoiceable and only `approved` hours count toward SOW
consumption. Approval is `canEditProject` — the PM who owns the project. Without
this gate, a contractor self-reports and self-invoices with no control, which
accounting will rightly refuse to settle.

Rejection requires a reason; the entry returns to `draft` so it can be corrected
and resubmitted rather than being deleted.

---

## 5. Reconciliation — the part most likely to go wrong

`GET /projects/:id/case` currently carries an explicit warning
(`routes/projects.ts:690-698`): do **not** add `project_time_entries` to the
compliance total, because those hours were pushed to the same CRM case and are
already present in the `getCaseTimeEntries` read-back. Adding them double-counts.

**Contractor hours are the exact opposite.** They never reach D365, so they are
*not* in the read-back, and they therefore **must be added**. Getting this
backwards in either direction silently corrupts every compliance number on the
tab, with no error and no visible symptom.

New shape of the tab:

| Line | Source | Counts toward consumed? |
|---|---|---|
| Quoted SOW hours | `am_sow` on the opportunity's quote | baseline |
| Internal logged | D365 `getCaseTimeEntries` read-back | yes — already included |
| Project admin time | `project_time_entries` (local shadow) | **no** — already in read-back |
| Contractor logged (approved) | `contractor_time_entries` | **yes — add** |
| External resources | `SUM(amount) / 165` blended | yes — already added today |

```
consumed  = internal_readback + contractor_approved + (external_total / 165)
remaining = quoted − consumed
```

Two figures shown alongside but explicitly *outside* the consumed total:

- **Pending approval** — submitted contractor hours not yet approved, so the PM
  can see what's about to land.
- **Contractor spend** — `Σ(hours × rate_snapshot)`. This is cost/margin, not SOW
  burn. Internal staff only.

---

## 6. Invoicing

### Generation

CloudConnect builds the invoice from approved, un-invoiced entries for one
contractor over a chosen period:

1. Contractor picks a period and (optionally) a project.
2. App gathers `status = 'approved' AND invoice_id IS NULL` entries.
3. Line items group by project + stage; amount = `hours × rate_snapshot`.
4. Entries flip to `invoiced` and get stamped with `invoice_id`.
5. A rendered snapshot is written to R2 (`contractor-invoices/{userId}/{invoiceId}/{number}.html`),
   following the existing R2 pattern in `routes/documents.ts:84`.

Snapshot at generation time. Later edits to a project, stage name, or rate must
not mutate an invoice already sent to accounting.

### Invoice numbers

`PF-{contractorShort}-{YYYYMM}-{NNN}`. Uniqueness is enforced by the `UNIQUE`
constraint on `invoice_number` with retry-on-conflict, rather than a counter
table — simplest thing that's actually correct under D1's concurrency model.

### PDF

Two options, and this is worth a decision from accounting before Phase 4:

- **v1 — print-optimized HTML** served from a route, with a `@media print`
  stylesheet. Zero new infrastructure. The contractor or AP clerk saves as PDF.
- **v2 — server-rendered PDF**, following the existing SOW converter Lambda
  pattern (`SOW_CONVERTER_LAMBDA_URL` / `SOW_CONVERTER_SHARED_SECRET`, runbook in
  `aws/sow-converter/README.md`).

Recommend shipping v1 and moving to v2 only if AP needs a PDF attached without a
human in the loop. The invoice's authority comes from the approved-hours record
in D1, not the file format.

### Settlement

`draft → submitted → approved → paid`, with `rejected` as a side exit. Approval
here is a **finance** action, distinct from PM approval of hours — see open
question 1. `paid` records `paid_at` + `payment_reference` so a contractor can
self-serve "where's my money" without emailing accounting.

---

## 7. Client-leakage checklist

Hard requirement: *to us they're a contractor, to the customer they're an
Implementation Engineer.* Every item below must be verified before Phase 2 ships.

- [ ] `is_contractor` and `contractor_org` stripped from any payload a `client`
      session can reach — most importantly the project staff list.
- [ ] Contractor avatars/names render identically to internal engineers. No
      badge, no tag, no styling difference in client-visible views.
- [ ] `contractor_rates` unreadable by `client`, and by any contractor other than
      the subject.
- [ ] `contractor_invoices` internal + own-record only.
- [ ] Contractor hours contribute to the client's consumed-hours total (correct —
      it is their SOW burn) but carry **no** contractor attribution in that view.
- [ ] `project_staff` writes for contractors use `staff_role = 'engineer'`, which
      keeps every existing client-facing render correct by default.
- [ ] A contractor session cannot enumerate projects, customers, or other
      contractors — confirm the `canViewProject` fall-through and the projects
      list scoping both hold.

---

## 8. Provisioning

**External contractors are admin-invited only.** Create the user in
`AdminUsersPage` with `role = 'contractor'`, `is_contractor = 1`,
`is_project_resource = 1`. They then log in through the existing OTP flow in
`routes/authPublic.ts` with no auth changes at all, because `findUserByEmail`
finds them.

**Do not add a contractor domain auto-provision rule.** Security audit item #5
already flags the existing `PARTNER_DOMAINS` auto-provisioning as a
fix-before-launch item; adding a second instance of the same pattern moves in
the wrong direction.

**Internal contractors** get `is_contractor` toggled on their existing user via
the admin PATCH. Per CLAUDE.md, the KV session cache means this takes effect on
their **next login** — expect "I set the flag and nothing happened" and answer
it with "log out and back in."

The staff picker already accepts them: `ProjectDetailPage.tsx:3903` filters
engineers on `u.role === "pf_engineer" || u.is_project_resource === 1`, so
setting `is_project_resource = 1` is sufficient to make a contractor selectable
with no client change.

---

## 9. Build sequence

Each phase is independently shippable to staging, which suits the
feature → staging → main flow.

**Phase 1 — Foundation.** Migration `0139`. `contractor` added to `AppRole`.
`is_contractor` into `findUserByEmail`'s SELECT and the admin user PATCH.
`canViewProject` fall-through fix + `project_staff` grant. Admin UI for the flag
and rates. *No user-visible feature; everything else depends on it.*

**Phase 2 — Time capture.** Contractor branch in the log-time handlers.
Timesheet view. PM approval queue. *Closes the `422` and makes contractor hours
capturable for the first time.*

**Phase 3 — Reconciliation.** CRM Case tab math, pending-approval and
contractor-spend figures. *Makes the hours mean something.*

**Phase 4 — Invoicing.** Generation, numbering, R2 snapshot, print view,
submit/approve/pay lifecycle.

**Phase 5 — Accounting handoff.** Notification to AP on submit (existing
`notifications` + `emailService`), CSV export, paid-status write-back.

Phase 2 has standalone value even if 4 and 5 slip — it fixes a live bug.

---

## 10. Open questions

1. **Who approves the invoice?** PM approves the *hours*. Does the PM also
   approve the invoice, or does it route straight to accounting once hours are
   approved? Changes the state machine and who needs a new permission.
2. **What does accounting actually consume?** Emailed PDF, CSV export into AP, or
   a real integration? Shapes Phase 5 entirely — worth asking them now, not in
   two months.
3. **One rate per contractor, or per project?** Schema above supports both
   (user default + per-project override). Confirm that's real and not
   over-engineering.
4. **Do contractor hours ever need to reach Dynamics** for revenue recognition,
   even if not for payroll? If yes, that's a Phase 6 and `contractor_time_entries`
   should gain `crm_time_entry_id` now while the table is empty.
5. **Rate variations** — overtime, travel, after-hours, non-billable? Currently a
   single rate per project.
6. **Retention** — how long do settled invoices stay in R2, and does anything
   need to be purgeable?
