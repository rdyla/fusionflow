# CloudConnect Changelog

All notable changes are documented here, newest first.

---

## 2026-04-16

### CI/CD Infrastructure — GitHub Actions, Staging, Automated Migrations

Full production-grade deployment pipeline replacing Cloudflare Git integration.

**GitHub Actions Workflows**
- `pr-check.yml` — runs `tsc -b --noEmit` on every PR targeting `main` or `staging`; gate is enforced via branch protection rulesets
- `deploy-staging.yml` — triggers on push to `staging`; applies D1 migrations, builds, deploys to staging Worker, runs smoke tests, sends Zoom notification
- `deploy.yml` — triggers on push to `main`; same steps targeting production

**Staging Environment**
- New Cloudflare Worker: `fusionflow-staging` at `staging.fusionflow360.com`
- Separate D1 (`fusionflow-staging`), KV, and R2 (`fusionflow-docs-staging`) bindings in `wrangler.json`
- Branch protection rulesets on both `main` and `staging` require the PR type-check to pass before merge

**Automated D1 Migrations**
- Switched from manual `wrangler d1 execute` to `wrangler d1 migrations apply` (tracking via `d1_migrations` table)
- `scripts/seed_migration_history.sql` registers all 46 pre-existing manually-applied migrations before handing off to automated tracking
- Migration 0047: formalizes `dynamics_account_id` column on `projects` (existed in production but was never in a migration file)

**Smoke Test Script**
- `scripts/smoke-test.mjs` — 9 checks: health endpoint (`/api/health`), frontend HTML, and 7 protected routes returning 401
- Accepts `BASE_URL` env var; defaults to staging; exits non-zero if any check fails

**Zoom Team Chat Notifications**
- Staging deploys notify with 🟡 (success) / 🔴 (failure)
- Production deploys notify with ✅ (success) / ❌ (failure)
- Uses incoming webhook `Authorization` header with `ZOOM_WEBHOOK_VERIFICATION_TOKEN` secret

**Deployment & UAT Plan Document**
- `docs/fusionflow-deployment-uat-plan.md` — comprehensive doc covering environments, branch strategy, build pipeline, migration process, deployment checklist, 4-phase UAT protocol, gaps table, and key scripts reference

---

### Roadmap & Feature Request Tracking

New module for collecting and managing product feedback across user roles.

**User-Facing Roadmap (`/roadmap`)**
- Status tabs: All, Submitted, Under Review, Planned, In Progress, Released
- Feature cards with upvote button (optimistic update), status badge, category chip, submitter name, and vote count
- Submit modal: title, description, category
- Visible to all non-client authenticated users

**Admin Kanban (`/admin/roadmap`)**
- Six-column board: Submitted / Under Review / Planned / In Progress / Released / Declined
- ← → arrow buttons on each card for inline status moves (optimistic update, rollback on API error)
- Click-to-edit modal: status pill selector, priority (low/medium/high/critical), category, admin notes, delete
- "Show/Hide Declined" toggle
- Create modal for admin-initiated requests

**Backend**
- `GET /api/features` — all requests with vote counts and `user_has_voted` flag
- `POST /api/features` — any authenticated user can submit
- `PATCH /api/features/:id` — admin only
- `DELETE /api/features/:id` — admin only
- `POST /api/features/:id/vote` — toggle vote (idempotent)

**Database**: `feature_requests` and `feature_request_votes` tables (migration 0046)

**Navigation**: Roadmap link added to sidebar for non-client users; Admin Roadmap link added for admin users

---

### Admin Users — Org Tabs, Partner AE Cleanup, Role/Manager Grouping

**Organizational Tabs**
- Admin Users page split into tabbed view: Packet Fusion, Partners, Clients (and inactive users)
- Each tab shows only the relevant user groups for that organization context

**Partner AE UI Cleanup**
- Cloud Support role chip hidden in the users table for `partner_ae` role (not applicable)
- Cloud Support permission block hidden in the partner AE edit modal

**Role/Manager Grouping**
- Users now grouped by role label + manager in the table
- Fixed group header rendering bug: destructures `{ label, color, users }` from grouped items (was incorrectly reading `role` which was always `undefined`)

---

### Cloud Support Calculator — Document Improvements

- Renamed "Special Inclusions" section to "Inclusions"
- Fixed section numbering to maintain consistent order across custom, MSO, and inclusions sections
- Fixed section number alignment between definition arrays and render order
- Added custom inclusions: named line items with blurbs, no pricing impact
- Removed CCaaS pricing formula from agreement doc sub-labels

---

## 2026-04-15

### Cloud Support Calculator

New module for creating, versioning, and managing managed services support proposals with financial calculations.

**Core Functionality**
- Create proposals by name; each proposal can have multiple saved versions (full snapshots of form inputs and calculated results)
- Each version stores `form_data` (inputs) and `calc_result` (Annual Value + TCV) as JSON snapshots — older versions remain intact when a new one is saved
- Proposals list shows version count, latest Annual Value, TCV, creator, and last updated date
- Click-through to proposal detail page where versions are listed and can be loaded back into the calculator

**Permissions**
- Access is gated per-user via a new `cs_permission` column on `users` (default: `none`)
  - `none` — no access; module not visible
  - `user` — can create and manage their own proposals
  - `power_user` — can view all proposals and edit/delete any
- Admin can set `cs_permission` per user from the Admin Users edit modal
- `admin` role always has full access

**Backend**
- `GET /api/cloudsupport` — list proposals (own only, or all for power_user/admin)
- `POST /api/cloudsupport` — create proposal
- `GET /api/cloudsupport/:id` — proposal detail with all versions
- `PATCH /api/cloudsupport/:id` — rename proposal
- `DELETE /api/cloudsupport/:id` — delete proposal and all versions
- `POST /api/cloudsupport/:id/versions` — save a new version snapshot

**Database**: `cs_proposals`, `cs_versions` tables (migration 0044); `cs_permission` column on `users` (migration 0045)

---

### Inbox & Direct Messaging

Unified notification center and peer-to-peer messaging for all FusionFlow users.

**Notifications**
- System-generated notifications for: task assigned, task blocked, risk assigned, risk added, note added, go-live reminder
- Each notification links to the relevant project entity (task, risk, note, project page)
- Color-coded by type (cyan = task, red = blocked, orange = risk, indigo = note, green = go-live, teal = DM)
- Unread dot badge on notification icon in the top bar; updates on `GET /api/inbox/unread-count`

**Direct Messages**
- Compose panel with recipient search (by name or email, up to 8 suggestions)
- 2000-character message body
- Cannot message yourself
- Messages appear in the recipient's inbox as a `direct_message` notification with sender attribution

**UI**
- Three tabs: All, Notifications, Messages
- Items sorted: unread first, then newest
- Per-item actions: navigate to entity (marks read), mark read, delete
- "Mark all read" bulk action
- "Load more" pagination (30 per page)
- Relative timestamps ("just now", "5m", "2h", "3d")

**Backend**
- `GET /api/inbox` — paginated list with tab filter
- `GET /api/inbox/unread-count` — badge count
- `PATCH /api/inbox/:id/read` — mark single read
- `POST /api/inbox/read-all` — bulk mark all read
- `DELETE /api/inbox/:id` — delete notification
- `POST /api/inbox/messages` — send direct message

**Database**: `notifications` table (migration 0022); `createNotification()` helper used by task, risk, and note routes to fan out notifications on creation/assignment

---

## 2026-04-02 (continued)

### Prospecting — Contact Targeting & Apollo API Fixes

- **Title-based contact scoring** — contacts are now ranked by relevance to technology/CX buying decisions before the top 3 are selected. Priority: CTO/CIO/CDO → VP/Director of IT or Technology → VP/Director of CX, Contact Center, or Communications → COO/VP Operations → CEO/President
- **Apollo `mixed_people/api_search` migration** — switched from the deprecated `mixed_people/search` endpoint (which was silently returning no contacts for all domains) to the new `mixed_people/api_search` endpoint with corrected `q_organization_domains` filter parameter
- **Last name mapping** — updated field mapping from `last_name` to `last_name_obfuscated` to match the new endpoint's response shape
- **Prospecting landing page card** — added module card on the home screen, visible to admin, executive, pf_ae, and partner_ae roles; hidden from client and other internal roles
- **Debug endpoint** — added `/api/prospecting/debug/apollo-people?domain=xxx` (admin only) for testing Apollo people search responses directly

---

## 2026-04-02

### Prospecting Module

New module for pre-sales domain research and AI-powered sales intelligence.

**Core Functionality**
- Upload prospect lists by pasting domains (one per line, comma, or tab-separated) or uploading a CSV file — domain column auto-detected
- Lists are enriched via Apollo.io: organization details, industry, headcount, tech stack, UCaaS/CCaaS signal detection
- Prospects scored and tiered automatically: Hot / Warm / Cold based on fit signals
- Claude AI generation per prospect: "Why Now" statement, key challenges, proposed solution, email sequence, talk track, and LinkedIn message — all copyable with one click
- Expandable rows show key contacts (decision-makers, champions) pulled from Apollo people search

**Access & Permissions**
- `admin` — full access to all lists
- `executive` and `partner_ae` with reports — can see lists assigned to their team
- `pf_ae` / `partner_ae` — can see their own lists
- Sales leaders (admin) can assign lists to managed AEs at creation time

**UI**
- Prospecting list index: table with name, owner, status badge (Enriching / Ready), domain count, enriched count, and Hot/Warm/Cold mini-bar
- List detail: stats bar (total, enriched, hot/warm/cold counts), filterable table with expandable prospect rows

**Database**: `prospect_lists`, `prospects`, `prospect_contacts` tables (migration 0032)

### Navigation Redesign

Replaced the top navigation bar with a flat left sidebar.

- Sidebar contains all module links with icons
- Inbox icon and user avatar moved to top bar (top-right)
- Connection status indicator moved to bottom of sidebar
- Internal users (non-client roles) now see direct nav links to Projects, Solutions, and Optimizations in addition to module cards

### Discovery Assessments — Extended Technology Journeys

Added Needs Assessment support for all non-UCaaS/CCaaS technology journeys: Conversational Intelligence, Virtual Agent, and any additional journey types configured in the solution create flow.

### Solution Create Flow — Journey Picker

- Replaced single-technology dropdown with a journey-based multi-select
- Technology and Vendor dropdowns on the Solution overview page expanded with additional options
- "New Solution" modal on the Customer Detail page updated to use the journey picker

### Bug Fixes
- Fixed AI generation getting stuck (increased `max_tokens`, resolved streaming stuck state)
- Fixed Apollo API key header (`X-Api-Key`), base URL, field names, and industry normalization
- Fixed missing `enrichOrganizationWithError` import in prospecting route

---

## 2026-04-01

### Module Restructure

- Removed the Design & Dev module
- Optimizations renumbered to module 03

---

## 2026-03-31

### Client Portal — Solutioning Access

- Solutioning module card now visible to client users on the landing page
- Clients can view solutions and needs assessments linked to their account

### CRM Links — UI Redesign

- CRM Links section on project detail pages redesigned as consistent tiles (account, contact, case, opportunity)

### Bug Fixes
- Fixed duplicate legend entries appearing in dashboard donut charts
- Updated favicon to the official green-dot Packet Fusion version

---

## 2026-03-30

### CRM Case & Opportunity Integration — Hours Compliance

New "CRM Case" tab on project detail pages for tracking time entry compliance against the SOW.

**CRM Links**
- Projects can now be linked to a Dynamics 365 case (`crm_case_id`) and opportunity (`crm_opportunity_id`)
- Compact CRM Links card shows account, case, and opportunity with inline label/value rows

**Hours Compliance**
- Pulls time entries from Dynamics (`amc_timeentry`) for the linked case
- Compares logged hours against SOW hours from the linked opportunity quote (`am_sow`)
- Compliance card shows a progress bar and per-workstream breakdown
- Time entries table lists all individual entries

**Backend**
- `GET /api/projects/:id/case-compliance` — returns time entries vs. SOW hours, resolves opportunity name from account opportunities
- New Dynamics diagnostic endpoints for admin: case search, diagnose, time entry inspect
- New DB columns: `crm_case_id`, `crm_opportunity_id` on `projects` (migrations 0029, 0030)

---

## 2026-03-24

### Customer-Centric Journey — Full End-to-End Flow

Major session focused on making customers the primary entry point for all work in FusionFlow.

**New Customer Onboarding**
- "+" New Customer" button on the Customers list page opens a CRM search modal
- Searches Dynamics 365 accounts in real time (debounced); shows name + city/state from CRM
- On selection: creates the customer record and immediately fires a CRM sync to populate AE/SA/CSM team and address
- Navigates directly to the new customer's detail page on creation

**Starting Journeys from the Customer Page**
- Solutions tab: "+ New Solution" button — picks technology (UCaaS/CCaaS/CI/VA) and vendor; auto-names the solution and pre-populates PF team from the customer record; navigates to solution detail
- Implementations tab: "+ New Implementation" button — picks name, technology, provider, and target go-live date; navigates to project detail
- Optimizations flow naturally from completed projects; the customer's optimization tab populates automatically

**Customer Detail Page — PF Team Upgrade**
- PF Team card in Overview tab now shows photo cards with MS Graph headshots (or initials avatar)
- Each card shows role label, name, and email
- Photos refresh automatically after a CRM sync
- SharePoint URL replaced with a styled "Open SharePoint ↗" button

**Customer Detail Page — Documents Tab**
- New "Documents" tab (shown when a CRM account ID exists) renders the full SharePointDocs file browser — same widget used on solutions and opportunities
- Falls back to a direct "Open SharePoint ↗" link if no Dynamics document locations are configured for the record

**Dashboard — Projects List Redesign**
- Removed "Status", "Partner AE", and separate "Vendor" / "Target Go-Live" columns
- New columns: Project (with Target Go-Live as a subtitle line), Customer, Provider / Tech, Phases, Health
- Provider / Tech: vendor and technology rendered as color-coded badges side by side
- Phases: phase-flow bubble indicator (green = completed, blue pulsing = in progress, gray = not started) with connecting lines — same as the Projects list page
- Completed projects: muted (50% opacity + gray background), sorted to the bottom
- Blocked projects: subtle red left border + faint red background
- Rows are now fully clickable (navigate to project)
- New projects now default to `in_progress` status instead of `not_started`

**Vendor Standardization**
- New Implementation modal uses a dropdown (Zoom, RingCentral, Cato Networks, Microsoft, Cisco, TBD) instead of free text
- `createProject` backend now accepts and stores `customer_id`; `createSolution` backend accepts and stores `customer_id`

**Database**
- No new migrations (customer_id columns were added in 0027)
- Backend routes updated to pass `customer_id` through on creation for both solutions and projects

**SharePoint Resilience**
- `getSharePointLocations` no longer throws on Dynamics API failures — each step individually try/caught, errors logged server-side, empty array returned to client
- Removed `servicetype eq 0` filter from Dynamics document location query (was causing 500 errors for some account records)
- `SharePointDocs` component: merged error and empty-locations states into a single graceful fallback; shows "Open SharePoint ↗" button when a `sharepointUrl` prop is provided

---

## 2026-03-23

### FusionFlow 360 — Lifecycle Chain (Solutions → Projects → Optimizations)

Full end-to-end lifecycle linking across all three core modules.

**Database**
- Added `solution_id` column to `projects` table (`migrations/0026_project_solution_link.sql`)
- Backfill: existing handoff-created projects automatically linked to their originating solution
- Index added on `projects.solution_id`

**Backend — Solutions (`/api/solutions`)**
- `GET /` — `linked_project_count` subquery added to solution list
- `POST /:id/create-project` — inherits `dynamics_account_id`, vendor, technology, and staff (AE/SA/CSM) from solution; sets `solution_id` on the new project
- `GET /:id/projects` — lists all projects linked to a solution
- `POST /:id/link-project` — retroactively links an existing project to a solution
- `DELETE /:id/link-project/:projectId` — unlinks a project from a solution

**Backend — Projects (`/api/projects`)**
- List and detail queries: added `solution_id`, `linked_solution_name`, `linked_solution_customer`, `linked_solution_status`, `linked_solution_type`, `has_optimization` fields
- `GET /:id/chain` — returns `{ solution, optimizeAccount }` for the full chain view
- Create/update schemas accept optional `solution_id`

**Backend — Optimize (`/api/optimize`)**
- Account list and detail queries: joined to solutions via projects, exposing `solution_id` and `linked_solution_name`
- `GET /accounts/:projectId/linked-solution` — fetch the solution linked to an optimize account's project
- `POST /accounts/direct` — accepts optional `project_id` to link a direct-enrolled account to an existing project

**UI — Solutions list (`/solutions`)**
- Added "Projects" badge column showing linked project count

**UI — Solution detail (`/solutions/:id`)**
- "Lifecycle Chain" card in overview tab listing linked projects with navigation links
- "+ Link Existing Project" modal for retroactive association
- Handoff tab: shows existing linked projects and always-available "Create Project" button

**UI — Projects list (`/projects`)**
- Added "Chain" column with `← Solution` (purple) and `Optimize →` (teal) badges

**UI — Project detail (`/projects/:id`)**
- "Lifecycle Chain" card at top of overview tab: back-link to solution, forward-link to optimization
- "+ Link to Solution" and "Unlink Solution" actions

**UI — Optimize list (`/optimize`)**
- Added "Solution" column linking back to the originating solution

**UI — Optimize account detail (`/optimize/:projectId`)**
- Chain breadcrumb below back button: `← Solution › ← Project › Optimization (here)`

**UI — Optimize direct enroll modal**
- Optional "Link to Project" select to associate a direct-enrolled account with an existing project

### Unified `LifecycleChain` Component

Replaced three separate chain/breadcrumb implementations with a single shared component (`src/client/components/ui/LifecycleChain.tsx`).

- Consistent pill design across all three detail pages (Solution, Project, Optimize account)
- Color-coded by module: purple = Solution, teal = Project, cyan = Optimization
- Always renders all three steps with `→` arrows between them
- Filled pill with `●` dot = current page; outlined pill = linked (clickable); dashed pill = not yet linked
- `actions` slot for link/unlink buttons, rendered below the chain row

### 1:1:1 Chain Enforcement (Solution → Project → Optimization)

Tightened the lifecycle relationship from one-to-many to strictly one-to-one at every step.

- **Backend**: `POST /solutions/:id/create-project` and `POST /solutions/:id/link-project` now return `409` if the solution already has a linked project
- **UI — Solution detail**: "Create Project" button hidden once a project is linked; "Unlink Project" action added; link modal filters to only show unlinked projects
- **UI — Solution detail**: `linkedProject` state is now a single `Project | null` (was an array)
- **LifecycleChain**: `projects` array prop replaced with single `project` prop; Optimization node always visible on all three pages

---

## 2026-03-20

### SharePoint Integration — Microsoft Graph API

- Switched SharePoint file operations to Microsoft Graph API
- Added endpoint to enable SharePoint app-only auth via Graph API
- `GET /sharepoint/enable-app-auth` now shows before/after settings
- Fixed `clear-token-cache` to also delete SP REST token
- SharePoint REST API (`/_api`) fallback retained for reference

---

## Earlier

*Prior changes not yet documented. See git log for full history.*
