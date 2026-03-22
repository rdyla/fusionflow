# FusionFlow

FusionFlow is an internal platform for Packet Fusion teams that manages the full lifecycle of unified communications and contact center implementations — from pre-sales solutioning through delivery and post-go-live customer success.

It is purpose-built for the way Ring and Packet Fusion AEs, SAs, PMs, Engineers, and CSMs actually work, with live integrations into RingCentral, Zoom, and Microsoft Dynamics 365.

---

## Who It's For

| Role | What They Use It For |
|------|----------------------|
| **AE (PF or Partner)** | Track solutions, run needs assessments, estimate labor, link to CRM accounts |
| **Solution Architect** | Scope projects, review assessment results, conduct post-go-live QBRs |
| **Project Manager** | Manage phases, tasks, milestones, risks, and team assignments |
| **Engineer** | Track assigned tasks, view project context, access documents |
| **CSM** | Monitor Optimize accounts, pull utilization metrics, schedule reviews |
| **Executive** | Read-only portfolio visibility across all projects and solutions |
| **Client (Customer)** | View-only access to their own project status and documents |

---

## Core Modules

### Solutioning
Manage opportunities from first conversation to signed deal.

- Track solutions through a structured pipeline: **Draft → Needs Assessment → Requirements → Scope of Work → Handoff Ready → Won/Lost**
- **Needs Assessment** — A structured survey that scores business readiness across five dimensions (business clarity, technical readiness, CRM readiness, methodology, and organizational readiness) and produces a composite readiness score
- **Labor Estimation** — AI-assisted labor hour estimation broken down by workstream (discovery, solution design, PM, implementation, integration, migration, testing, training, documentation, hypercare) with driver-based adjustments and complexity scoring
- Link solutions to Dynamics 365 accounts and contacts
- Assign Packet Fusion AE, Partner AE, and supporting roles

### Implementation
Full project management for UCaaS and CCaaS delivery.

- **Phase-based tracking** — Discovery, Design, Build, Testing, Training, Go-Live, Hypercare
- **Tasks** — Create, assign, and track completion within phases; comment threads per task
- **Milestones** — Target and actual dates with health tracking
- **Risks** — Log and track risks with severity (high/medium/low) and ownership
- **Team assignments** — PM, AE, SA, CSM, Engineer roles per project
- **Documents** — Upload and store project files up to 50MB each (Cloudflare R2)
- **Notes** — Internal and client-visible note types
- **Project health** — Automatically computed from task completion and open risks; manually overridable by admins
- **Templates** — Admin-managed template library for common solution types to pre-populate phases and tasks on new projects

### Optimize
Post-go-live account management and customer success tracking.

- Projects automatically graduate to Optimize when all implementation phases complete, or can be enrolled directly
- **Impact Assessments** — Periodic structured reviews capturing overall score, adoption score, satisfaction score, action items, and next review date. Assessment types include Impact, Adoption, QBR, and Other
- **Utilization snapshots** — Pull live utilization data from Zoom and RingCentral APIs (licenses purchased vs. assigned, active users, call volume, adoption trends) and store point-in-time records for trend tracking
- SA and CSM assignments per account
- Account status tracking: Active, Paused, Churned

---

## Integrations

### RingCentral
Connect a customer's RingCentral tenant to pull live account data directly into FusionFlow.

**Setup** — Create a Private App in the customer's RingCentral developer console with JWT auth and the following scopes: **Read Account**, **Read Call Log**, **Analytics**. Enter the Client ID, Client Secret, and JWT Token in the project's RingCentral tab.

**What it shows:**

*Licensing*
- Service plan (e.g., Professional, Enterprise)
- Billing plan (Monthly / Annual)
- Seat utilization — provisioned extensions vs. included lines, with a visual progress bar

*Extensions & Devices*
- Full breakdown of all extension types: Users, Digital Users, Virtual Users, Call Queues, IVR Menus, Voicemail-Only, Announcement-Only, Shared Lines Groups, Paging Groups, Park Locations
- Total registered devices

*Call Activity — Last 30 Days* (via RingCentral Business Intelligence API)
- Total call volume
- Answer rate (color-coded: green ≥ 85%, amber ≥ 70%, red < 70%)
- Inbound vs. outbound split
- Average call duration
- Missed / no-answer count

*After-Hours & Abandonment*
- Abandoned call count
- After-hours call volume and percentage
- Business hours call volume

### Zoom
Connect a Zoom account to pull license and utilization data for Optimize accounts. Configured via organization-level S2S OAuth credentials.

### Microsoft Dynamics 365
- Search and link CRM accounts when creating projects and solutions
- Pull contact lists and opportunity context
- Used to identify and provision client (customer) portal users

### Asana *(optional)*
Link projects to Asana workspaces to sync phases and tasks into Asana for teams that use it as their primary task tool.

---

## User Roles

| Role | Access Level |
|------|-------------|
| `admin` | Full access — manage all entities, users, and settings; can impersonate other users |
| `executive` | Read-only across the full portfolio |
| `pf_ae` | Manage assigned solutions and view related projects |
| `pf_sa` | Portfolio-wide visibility; conduct assessments |
| `pf_csm` | Portfolio-wide visibility; manage Optimize accounts |
| `pf_engineer` | Portfolio-wide read access for technical reference |
| `pm` | Manage assigned projects and their tasks |
| `partner_ae` | Access only to projects explicitly shared with them |
| `client` | View-only access to their own project |

**Auto-provisioning:** New users signing in with a `@packetfusion.com` email are automatically provisioned as `pm`. Users with `@zoom.com`, `@zoom.us`, or `@ringcentral.com` emails are provisioned as `partner_ae`. All others are looked up against Dynamics 365 and provisioned as `client` if a matching portal contact is found.

---

## Getting Started (Development)

### Prerequisites
- Node.js 18+
- A Cloudflare account with Workers and D1 enabled
- Wrangler CLI: `npm install -g wrangler`

### Install dependencies
```bash
npm install
```

### Configure environment
Copy `wrangler.toml` and fill in your D1 database binding, KV namespace, R2 bucket, and any API keys. For local development, create a `.dev.vars` file:
```
DYNAMICS_TENANT_ID=...
DYNAMICS_CLIENT_ID=...
DYNAMICS_CLIENT_SECRET=...
RESEND_API_KEY=...
ZOOM_ORG_ACCOUNT_ID=...
ZOOM_ORG_CLIENT_ID=...
ZOOM_ORG_CLIENT_SECRET=...
```

### Run migrations
```bash
npx wrangler d1 migrations apply fusionflow --local
```

### Start the development server
```bash
npm run dev
```

The app will be available at [http://localhost:5173](http://localhost:5173).

### Deploy to production
```bash
npm run build && npm run deploy
```

### Monitor worker logs
```bash
npx wrangler tail
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router 7, TypeScript, Vite |
| Backend | Hono (edge-compatible web framework) |
| Runtime | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Key-Value Store | Cloudflare KV (sessions, credentials, tokens) |
| File Storage | Cloudflare R2 |
| Email | Resend |
| Validation | Zod |
