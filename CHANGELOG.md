# FusionFlow Changelog

All notable changes are documented here, newest first.

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
