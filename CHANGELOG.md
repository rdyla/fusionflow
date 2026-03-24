# FusionFlow Changelog

All notable changes are documented here, newest first.

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
