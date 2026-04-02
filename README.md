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

### Prospecting
Pre-sales domain research and AI-powered sales intelligence.

- Upload lists of prospect domains via paste or CSV upload; domain column is auto-detected in CSV files
- Each domain is enriched via **Apollo.io**: company name, industry, headcount, tech stack, UCaaS/CCaaS signal detection
- Prospects are scored and tiered automatically: **Hot / Warm / Cold**
- **Claude AI generation** per prospect: "Why Now" statement, key challenges, proposed solution, email sequence, talk track, and LinkedIn message copy — all one-click copyable
- Key contacts (decision-makers, champions) pulled from Apollo people search
- Sales leaders can create lists and assign them to managed AEs
- Role-gated: admins see all lists; executives and managers see team lists; AEs see their own

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
- **CRM Case & Hours Compliance** — link a project to a Dynamics case and opportunity; pulls time entries (`amc_timeentry`) and compares logged hours against SOW hours from the linked opportunity quote for compliance tracking

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

## Labor Estimation: How the Numbers Are Calculated

The labor estimate is built in four sequential steps. Each step is visible in the workstream breakdown table.

### Step 1 — Base Hours

Every solution type starts with a fixed set of baseline hours per workstream. These represent a clean, straightforward engagement with no complications. They can be adjusted at the solution-type level by an admin via the Labor Config settings.

| Workstream | UCaaS | CCaaS | CI | Virtual Agent |
|---|---|---|---|---|
| Discovery & Requirements | 8h | 12h | 10h | 12h |
| Solution Design | 12h | 18h | 14h | 16h |
| Project Management | 10h | 14h | 10h | 12h |
| Implementation & Configuration | 20h | 32h | 18h | 24h |
| Integration | 4h | 8h | 8h | 10h |
| Migration & Data Porting | 12h | 12h | 2h | 2h |
| Testing & UAT | 8h | 12h | 8h | 10h |
| Training & Enablement | 6h | 8h | 6h | 6h |
| Documentation & Handover | 4h | 6h | 4h | 4h |
| Hypercare | 6h | 8h | 6h | 8h |

### Step 2 — Driver Adjustments (+Drivers column)

Drivers are additive hour adjustments triggered by specific answers in the Needs Assessment. Each driver targets one or more workstreams and distributes its total hours equally across them (e.g., a driver adding 12h across 3 workstreams adds 4h to each).

**Global drivers** apply to every solution type:

| Assessment Field | Trigger | Hours Added | Workstreams Affected |
|---|---|---|---|
| Sandbox testing required | Yes | +8h | Integration, Testing |
| Sandbox testing required | Maybe | +4h | Integration, Testing |
| Security review required | Yes | +6h | Project Management, Documentation |
| Security review required | Unknown | +4h | Project Management, Documentation |
| Future phase scope | Any value entered | +4h | Solution Design, Project Management |

**UCaaS-specific drivers:**

| Assessment Field | What It Measures | Workstreams Affected |
|---|---|---|
| User count band | 1–25 → +2h, 26–100 → +6h, 101–250 → +12h, 251–500 → +20h, 500+ → +32h | Implementation, Training, Testing |
| Common area / shared device count | 1–10 → +2h, 11–50 → +6h, 51+ → +12h | Implementation, Testing |
| Calling capabilities required | Count of selected items (0→0h, 1–3→+2h, 4–6→+4h, 7–9→+8h, 10+→+12h) | Solution Design, Implementation, Testing |
| Call flow components required | Count of selected items (0→0h, 1–2→+3h, 3–5→+8h, 6–7→+14h, 8+→+20h) | Solution Design, Implementation, Testing |
| Endpoint types required | Count of selected items (0→0h, 1–2→+2h, 3–4→+6h, 5–6→+10h, 7+→+14h) | Implementation, Testing, Training |
| Integrations required | Count of selected items (0→0h, 1–2→+4h, 3–4→+10h, 5–6→+16h, 7+→+24h) | Integration, Testing, Solution Design |
| Number porting required | Yes → +16h, Partial → +8h | Migration, Project Management, Testing |
| Fax / analog required | Phase 1 → +12h, Future phase → +4h | Solution Design, Implementation, Testing |
| Network readiness known | Validated → +0h, Partial → +4h, Unknown → +8h | Discovery, Solution Design |

**CCaaS-specific drivers:**

| Assessment Field | What It Measures | Workstreams Affected |
|---|---|---|
| Agent count band | 1–25 → +4h, 26–100 → +10h, 101–250 → +18h, 251–500 → +30h, 500+ → +45h | Implementation, Testing, Training |
| Channels required (Phase 1) | Count of channels (1→+4h, 2→+10h, 3→+18h, 4→+26h, 5+→+36h) | Solution Design, Implementation, Testing, Training |
| Routing capabilities required | Count of selected items (1–2→+6h, 3–4→+12h, 5–6→+20h, 7+→+28h) | Solution Design, Implementation, Testing |
| IVR / self-service required | Phase 1 → +16h, Future phase → +4h | Solution Design, Implementation, Testing |
| WFM required | Phase 1 → +24h, Future phase → +6h | Solution Design, Implementation, Testing, Training |
| QM required | Phase 1 → +20h, Future phase → +5h | Solution Design, Implementation, Testing, Training |
| Migration required | Yes → +20h, Partial → +10h | Migration, Project Management, Testing |
| CRM integration (Phase 1) | Yes → +18h, Future phase → +4h | Integration, Testing, Solution Design |

**CI (Conversational Intelligence) drivers:**

| Assessment Field | What It Measures | Workstreams Affected |
|---|---|---|
| Estimated user count | 1–25 → +2h, 26–100 → +6h, 101–250 → +10h, 251–500 → +16h, 500+ → +24h | Implementation, Training |
| Core capabilities required | Count of selected items (1–3→+4h, 4–6→+8h, 7–8→+14h, 9+→+20h) | Solution Design, Implementation, Testing |
| Custom trackers required | Phase 1 → +12h, Future phase → +3h | Implementation, Testing |
| Custom scorecards required | Phase 1 → +12h, Future phase → +3h | Implementation, Testing, Training |
| Methodology tracking | Required → +14h, Nice to have → +4h | Solution Design, Implementation, Testing |
| Auto scoring required | Required → +10h, Yes if reliable → +6h, Manual only → +2h, Undecided → +4h | Solution Design, Implementation, Testing |
| CRM integration (Phase 1) | Yes → +16h, Future phase → +4h | Integration, Testing, Solution Design |

**Virtual Agent drivers:**

| Assessment Field | What It Measures | Workstreams Affected |
|---|---|---|
| Channels required (Phase 1) | Count of channels (1→+4h, 2→+10h, 3→+18h, 4+→+26h) | Solution Design, Implementation, Testing |
| Primary use cases | Count of selected items (1–2→+6h, 3–4→+14h, 5–6→+22h, 7+→+30h) | Solution Design, Implementation, Testing |
| Estimated intent count | Scales from +6h (1–10 intents) up to +44h (60+ intents) | Implementation, Testing |
| Handoff to agent required | Yes / Phase 1 → +12h, Future phase → +4h | Solution Design, Integration, Testing |
| Content quality / readiness | Ready → +0h, Needs review/cleanup → +10h, Needs creation/significant gaps → +22h, Unknown → +6h | Discovery, Solution Design, Implementation |
| Integration use cases required | Count of selected items (1–2→+6h, 3–4→+14h, 5–6→+24h, 7+→+34h) | Integration, Testing, Solution Design |

### Step 3 — Deployment Type Multiplier

Applied to (Base + Drivers) for every workstream before complexity scoring. This reflects the inherent effort difference between engagement types.

| Deployment Type | Multiplier |
|---|---|
| New deployment | ×1.0 |
| Optimization / redesign | ×1.1 |
| Replacement | ×1.15 |
| Migration | ×1.2 |
| Expansion | ×0.85 |

### Step 4 — Complexity Multiplier (Computed column)

A complexity score (0–100) is derived from the heaviest scope indicators in the Needs Assessment. The score determines a multiplier applied on top of Step 3 to produce the **Computed** hours shown in the table.

| Complexity Band | Score Range | Multiplier |
|---|---|---|
| Low | 0–34 | ×0.9 |
| Medium | 35–69 | ×1.0 |
| High | 70–100 | ×1.2 |

**What feeds the complexity score by solution type:**

*UCaaS:* Multi-country or geographic scope (+20), migration required (+15–30), number porting (+15–30), number of endpoint types (up to +20).

*CCaaS:* Number of channels in scope (+10 each, max +40), routing capabilities count (+8 each, max +32), WFM in Phase 1 (+15), QM in Phase 1 (+15).

*CI:* Methodology elements to track (+5 each, max +30), custom trackers in Phase 1 (+15), custom scorecards in Phase 1 (+15), CRM integration (+10–25).

*Virtual Agent:* Intent count band (+5 to +60), integration use case count (+8 each, max +40), content readiness gaps (+10–35).

### Step 5 — User Overrides and Final Hours

Any workstream can be manually overridden. When an override is present, the Computed value is shown with a strikethrough and the Final column reflects the override. The total displayed in the summary header is the sum of all Final hours.

### Low / High Hour Range

The summary header shows a Low–Expected–High range. The spread is determined by the **confidence band**, which is based on how many key assessment fields were answered.

| Confidence Band | Key Fields Answered | Low Spread | High Spread |
|---|---|---|---|
| High | ≥ 80% | ×0.9 | ×1.1 |
| Medium | 60–79% | ×0.85 | ×1.2 |
| Low | < 60% | ×0.75 | ×1.35 |

A low confidence score does not change the Expected hours — it widens the range to signal that the estimate carries more uncertainty.

---

## Deployment

FusionFlow is live at **[fusionflow360.com](https://fusionflow360.com)**, deployed on Cloudflare Workers with a D1 database, KV store for sessions and credentials, and R2 for document storage.

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