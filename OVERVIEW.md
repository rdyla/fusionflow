# CloudConnect — Product Overview

**cloudconnect.packetfusion.com**

---

## What It Is

CloudConnect is an internal operations platform built specifically for Packet Fusion. It manages the full lifecycle of a customer engagement — from the first pre-sales conversation through implementation delivery and long-term customer success — in a single, purpose-built tool.

Rather than stitching together generic project management software, spreadsheets, and manual CRM updates, CloudConnect gives every role on the team a unified view of where every deal and every project stands, at any moment.

---

## The Problem It Solves

Today, the information needed to run a UCaaS or CCaaS engagement lives in too many places: Dynamics for account info, Asana or email threads for project tasks, spreadsheets for labor estimates, and tribal knowledge for everything else. This creates gaps — risks get missed, handoffs are rough, customers don't always know what's happening, and leadership has no reliable portfolio view.

CloudConnect brings all of that into one place, purpose-built for the way Packet Fusion actually works.

---

## Four Core Modules

### 1. Solutioning
*For AEs and Solution Architects — before the deal is signed*

Tracks opportunities from first conversation to closed deal. AEs can run a structured **Needs Assessment** that scores a prospect's readiness across five dimensions and produces a composite score that informs how to position the solution. A built-in **Labor Estimation** tool then projects implementation hours by workstream — discovery, PM, engineering, training, integration, and more — based on the scope.

The labor estimate flows directly into a customer-ready **Statement of Work** — generated as a printable PDF with the workstream breakdown, key deliverables, and total project investment. **Cloud Support agreements** (recurring support contracts) use the same generator with their own template, branded logo banner, and dedicated signature page.

This means every deal that enters implementation already has documented assumptions, a readiness score, an estimated hours breakdown, and a customer-facing SOW attached to it.

### 2. Implementation
*For Project Managers, Engineers, and the delivery team — during the project*

Full project management built around how UCaaS/CCaaS implementations actually run. Projects are structured into standard phases (Discovery, Design, Build, Testing, Training, Go-Live, Hypercare) with tasks, milestones, risks, team assignments, and document storage.

Project health is automatically computed from task completion and open risks, giving PMs, leadership, and customers a real-time status view without manual updates. Customers with portal access can log in and see their own project — no more "can you send me a status update?" emails.

**Customer touchpoint emails** are built into the project lifecycle. CloudConnect generates and sends branded, project-specific emails at every key milestone — kickoff, discovery, design review, UAT, and go-live — pre-populated with the right links, contacts, and discovery focus areas for each phase. The PM gets a one-click send flow per type, with full send history maintained per project so nothing is lost.

### 3. Support
*For customers and the Packet Fusion support team — at any time*

Customer support is a first-class module within CloudConnect. Customers open and track support cases directly through the same portal they use for projects — no separate ticketing system, no email-only support flow. Cases sync with Packet Fusion's Dynamics 365 case database in real time, so the customer-facing portal and the internal CRM never drift apart.

Internal staff get a dedicated **Support dashboard** surfacing what matters most: open cases by severity, a 30-day resolution trend, and — critically — **stale and stuck cases**. Stale cases haven't moved in days; stuck cases are waiting on customer input. Both have one-click filters so nothing falls through the cracks. Each case detail surfaces the customer's sold technology platform inline (RingCentral, Zoom, etc.) so engineers have immediate context.

Support supervisors can also send branded **activity digest emails** to their customers — a summary of open and recently-resolved cases over a configurable window. This turns what was previously a manual report into a single click, with full send history retained for audit.

### 4. Optimize
*For CSMs and SAs — after go-live*

Once a project completes, it automatically graduates into the Optimize module — a post-implementation success tracker. CSMs can conduct periodic assessments (adoption reviews, QBRs) with structured scoring, track action items, and schedule next reviews.

Critically, Optimize pulls **live utilization data** directly from the customer's RingCentral or Zoom platform, giving CSMs an objective picture of how much the customer is actually using what they bought — not just what they say in a check-in call.

---

## CloudConnect — Lifecycle Chain

The engagement modules are linked into a single customer journey chain: **Solution → Project → Optimization**.

- A solution can spawn one or more projects. When a project is created from a solution, account info, CRM team assignments (AE, SA, CSM), technology, vendor, and partner AE are automatically inherited.
- A project carries a link back to its originating solution and forward to its Optimize account once graduated.
- Existing records can be retroactively linked without disrupting any existing data.
- All links are optional — standalone solutions, projects, and Optimize accounts are fully supported.

**Support runs alongside.** Support cases can be opened by any customer at any time, independent of where they sit in the engagement chain. Every case is tied back to its Dynamics account, so customers and staff see a unified history regardless of which module they came in through.

**Navigation:** every detail page surfaces the full chain. From an Optimize account page, a breadcrumb shows `← Solution › ← Project › Optimization (here)`, with each step linking directly to the corresponding record. Solutions and Projects list pages show badges indicating how many records are downstream (e.g. "2 Projects", "Has Optimization").

---

## Live Platform Integrations

### RingCentral
Connect any customer's RingCentral tenant to see, directly within CloudConnect:

- **Service plan and billing type** — what they're contracted for
- **Seat utilization** — how many of their included lines are actually provisioned, with a visual progress bar
- **Full extension breakdown** — Users, Virtual Users, Call Queues, IVR Menus, Shared Lines Groups, Park Locations, and more
- **30-day call activity** — total call volume, answer rate, inbound/outbound split, average call duration, missed calls
- **After-hours and abandonment** — how many calls are happening outside business hours, and how many are being abandoned

This gives an AE or CSM an immediate, data-driven picture of customer health and utilization without needing to log in to the customer's RingCentral admin portal.

### Zoom
Live license and utilization data for Zoom customers — licenses purchased vs. assigned, active user counts, and usage trends — pulled directly into the Optimize module.

### Microsoft Dynamics 365
CloudConnect connects deeply to Packet Fusion's Dynamics instance: it searches and links accounts when creating projects and solutions, pulls contact information, automatically provisions customer portal users, and **syncs the entire support case lifecycle** — open, update, resolve, reopen — so the portal and the internal CRM never diverge. When a customer signs in, their access is scoped to their account via Dynamics, and internal staff get inline context (sold-technology vendor, account hierarchy) wherever it's relevant.

---

## Who Uses It

| Role | How They Use CloudConnect |
|------|------------------------|
| AE (PF or Partner) | Run assessments, estimate labor, generate SOWs and Cloud Support agreements, track solutions through pipeline |
| Solution Architect | Review readiness scores, scope projects, conduct QBRs |
| Project Manager | Manage phases, tasks, milestones, risks, team assignments, and customer touchpoint emails |
| Engineer | Track assigned tasks, access project documents and context |
| Support Engineer | Pick up cases from the support dashboard, manage status and notes, escalate when needed |
| Support Supervisor | Triage stale and stuck cases, send activity digests to customers |
| CSM | Monitor accounts post-go-live, pull utilization data, schedule reviews |
| Executive | Read-only portfolio visibility — project status, health, and distribution |
| Customer | Portal access to their own projects, support cases, and documents |

---

## Where It Lives

CloudConnect is live at **[cloudconnect.packetfusion.com](https://cloudconnect.packetfusion.com)**. It runs on Cloudflare's global edge network — no servers to manage, fast everywhere, and built to scale. New users from `@packetfusion.com` are automatically provisioned when they first sign in. Partner users (`@ringcentral.com`, `@zoom.com`) are provisioned as Partner AEs. Customer users are identified via Dynamics.
