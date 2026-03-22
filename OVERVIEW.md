# FusionFlow — Product Overview

**fusionflow360.com**

---

## What It Is

FusionFlow is an internal operations platform built specifically for Packet Fusion. It manages the full lifecycle of a customer engagement — from the first pre-sales conversation through implementation delivery and long-term customer success — in a single, purpose-built tool.

Rather than stitching together generic project management software, spreadsheets, and manual CRM updates, FusionFlow gives every role on the team a unified view of where every deal and every project stands, at any moment.

---

## The Problem It Solves

Today, the information needed to run a UCaaS or CCaaS engagement lives in too many places: Dynamics for account info, Asana or email threads for project tasks, spreadsheets for labor estimates, and tribal knowledge for everything else. This creates gaps — risks get missed, handoffs are rough, customers don't always know what's happening, and leadership has no reliable portfolio view.

FusionFlow brings all of that into one place, purpose-built for the way Packet Fusion actually works.

---

## Three Core Modules

### 1. Solutioning
*For AEs and Solution Architects — before the deal is signed*

Tracks opportunities from first conversation to closed deal. AEs can run a structured **Needs Assessment** that scores a prospect's readiness across five dimensions and produces a composite score that informs how to position the solution. A built-in **Labor Estimation** tool then projects implementation hours by workstream — discovery, PM, engineering, training, integration, and more — based on the scope.

This means every deal that enters implementation already has documented assumptions, a readiness score, and an estimated hours breakdown attached to it.

### 2. Implementation
*For Project Managers, Engineers, and the delivery team — during the project*

Full project management built around how UCaaS/CCaaS implementations actually run. Projects are structured into standard phases (Discovery, Design, Build, Testing, Training, Go-Live, Hypercare) with tasks, milestones, risks, team assignments, and document storage.

Project health is automatically computed from task completion and open risks, giving PMs, leadership, and customers a real-time status view without manual updates. Customers with portal access can log in and see their own project — no more "can you send me a status update?" emails.

### 3. Optimize
*For CSMs and SAs — after go-live*

Once a project completes, it automatically graduates into the Optimize module — a post-implementation success tracker. CSMs can conduct periodic assessments (adoption reviews, QBRs) with structured scoring, track action items, and schedule next reviews.

Critically, Optimize pulls **live utilization data** directly from the customer's RingCentral or Zoom platform, giving CSMs an objective picture of how much the customer is actually using what they bought — not just what they say in a check-in call.

---

## Live Platform Integrations

### RingCentral
Connect any customer's RingCentral tenant to see, directly within FusionFlow:

- **Service plan and billing type** — what they're contracted for
- **Seat utilization** — how many of their included lines are actually provisioned, with a visual progress bar
- **Full extension breakdown** — Users, Virtual Users, Call Queues, IVR Menus, Shared Lines Groups, Park Locations, and more
- **30-day call activity** — total call volume, answer rate, inbound/outbound split, average call duration, missed calls
- **After-hours and abandonment** — how many calls are happening outside business hours, and how many are being abandoned

This gives an AE or CSM an immediate, data-driven picture of customer health and utilization without needing to log in to the customer's RingCentral admin portal.

### Zoom
Live license and utilization data for Zoom customers — licenses purchased vs. assigned, active user counts, and usage trends — pulled directly into the Optimize module.

### Microsoft Dynamics 365
FusionFlow connects to Packet Fusion's Dynamics instance to search and link accounts when creating projects and solutions, pull contact information, and automatically provision customer portal users. When a customer user signs in, their access is scoped to their account by looking them up in Dynamics.

### Asana *(optional)*
For teams that run their day-to-day task work in Asana, projects can be linked to sync phases and tasks bidirectionally.

---

## Who Uses It

| Role | How They Use FusionFlow |
|------|------------------------|
| AE (PF or Partner) | Run assessments, estimate labor, track solutions through pipeline |
| Solution Architect | Review readiness scores, scope projects, conduct QBRs |
| Project Manager | Manage phases, tasks, milestones, risks, and team assignments |
| Engineer | Track assigned tasks, access project documents and context |
| CSM | Monitor accounts post-go-live, pull utilization data, schedule reviews |
| Executive | Read-only portfolio visibility — project status, health, and distribution |
| Customer | View-only portal access to their own project status and documents |

---

## Where It Lives

FusionFlow is live at **[fusionflow360.com](https://fusionflow360.com)**. It runs on Cloudflare's global edge network — no servers to manage, fast everywhere, and built to scale. New users from `@packetfusion.com` are automatically provisioned when they first sign in. Partner users (`@ringcentral.com`, `@zoom.com`) are provisioned as Partner AEs. Customer users are identified via Dynamics.
