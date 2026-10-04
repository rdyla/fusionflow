# Expert Institute — SOW content blocks

Drop-in replacements for the visible template sections, plus the scope material.
Hours only — rate and totals for Brett.

---

## Executive Summary (replaces existing)

Packet Fusion is pleased to partner with **Expert Institute** (the "Customer") to complete
and extend the Customer's existing Zoom AI Virtual Agent deployment and to deliver a
custom integration between Zoom Auto Dialer and Salesforce Sales Engagement.

The Customer has completed a Zoom Virtual Agent proof of concept, built by Zoom, which is
live in production and handling inbound calls: the agent identifies callers by email
address, performs a Salesforce lookup, and either transfers the caller to their account
owner or schedules a meeting with that representative. Separately, the Customer has been
piloting Zoom Auto Dialer for outbound BDR activity.

Two gaps remain. New prospects with no Salesforce record are captured as a Lead and told
that someone will call back, rather than being routed to a territory representative as
existing contacts are. And Auto Dialer call outcomes do not reach Salesforce Sales
Engagement, so contacts do not progress through their assigned cadence.

This engagement closes both gaps. Because the Virtual Agent work builds on a functional
POC and the Auto Dialer integration depends on a small number of platform behaviours that
must be validated before they can be priced, the engagement is structured as a bucket of
consulting hours delivered in three phases, with a feasibility gate before the largest
build activity.

---

## Engagement Snapshot (replace the four counters)

| Value | Label |
|---|---|
| 2 | WORKSTREAMS |
| 3 | DELIVERY PHASES |
| 40 | CONSULTING HOURS |
| 1 | FEASIBILITY GATE |

The template's LOCATIONS and GO-LIVE EVENTS counters do not apply — there is no site
deployment or cutover in this engagement.

---

## 1.2 Business Objectives (replaces existing)

The Customer is engaging Packet Fusion to achieve the following outcomes:

- Route inbound prospects to the correct territory representative at the point of contact,
  rather than capturing a Lead for later follow-up.
- Give new prospects the same live transfer and self-scheduling experience currently
  available to established contacts.
- Reflect Auto Dialer call activity and dispositions in Salesforce automatically, so BDR
  contacts progress through their Sales Engagement cadence without manual intervention.
- Preserve the configuration and behaviour already built during the Virtual Agent POC.
- Establish supported, documented integration patterns the Customer's Salesforce
  administrator can maintain.

---

## 2. Scope of Services

### 2.1 Workstream A — Virtual Agent Completion

Packet Fusion will extend the existing production Virtual Agent to route new prospects to
a territory representative:

- Add zip code capture to the prospect path, following Lead creation.
- Build a Salesforce lookup returning the territory representative associated with a
  supplied zip code.
- Extend the agent flow so that, once a representative is identified, the caller is offered
  the same options available to an established contact: live transfer to that
  representative, or self-scheduling.
- Write the collected zip code to the Lead record so downstream account assignment on Lead
  conversion behaves consistently with existing Customer automation.
- Test across four inbound paths: known contact, new prospect, representative answers,
  representative does not answer.

### 2.2 Workstream B — Auto Dialer to Sales Engagement Integration

Packet Fusion will deliver middleware that reflects Auto Dialer call outcomes into
Salesforce and advances the associated Sales Engagement cadence step:

- Validate the Auto Dialer API surface: call list management, call history, authentication
  and rate limits.
- Confirm the supported method for advancing a Sales Engagement cadence step
  programmatically (see Section 4, Feasibility Gate).
- Specify the Salesforce prerequisites the Customer must provision: an external connected
  app and an integration user with the required object and field permissions.
- Build a scheduled service that polls Auto Dialer call history, matches records to
  Salesforce contacts, writes call activity and the selected disposition, and advances the
  cadence step.
- Map Auto Dialer dispositions to the Customer's Sales Engagement outcomes.
- Deploy the service and provide an operational runbook.

Polling interval is five minutes, confirmed as acceptable by the Customer. Auto Dialer does
not currently expose webhooks; see Section 6.

---

## 3. Level of Effort

| Workstream | Activity | Hours |
|---|---|---|
| A | Current-state discovery and documentation | No charge |
| A | Territory data model discovery | 2 |
| A | Territory lookup tool build | 3 |
| A | Agent flow extension — zip capture, representative presentation, transfer or schedule | 3 |
| A | Testing across four inbound paths | 3 |
| A | Documentation | 2 |
| | **Workstream A subtotal** | **13** |
| B | Auto Dialer API validation | 3 |
| B | Sales Engagement cadence advance feasibility | 5 |
| B | Salesforce prerequisite specification | 2 |
| B | Middleware build — history polling, disposition mapping, Salesforce write, cadence advance | 10 |
| B | Authentication, phone normalisation, idempotency, retry and logging | 4 |
| B | Deployment | 1 |
| B | Disposition mapping configuration | 1 |
| B | Testing with Customer BDR team | 3 |
| B | Operational runbook | 2 |
| | **Workstream B subtotal** | **27** |
| | **Total** | **40** |

Hours are drawn from a single pooled allocation and are not ring-fenced per activity.
Unused hours remain available to the Customer for the duration of the engagement.

---

## 4. Delivery Phases and Feasibility Gate

**Phase 1 — Virtual Agent completion (13 hours).** Proceeds on execution. Scope is well
understood and builds on comparable Packet Fusion Virtual Agent deployments.

**Phase 2 — Auto Dialer feasibility (10 hours).** Validates the Auto Dialer API surface and
confirms that a Sales Engagement cadence step can be advanced through a supported
programmatic interface. Deliverable is a written finding and a confirmed build estimate.

**Phase 3 — Auto Dialer integration build (17 hours).** Proceeds on the Customer's written
approval of the Phase 2 finding.

**Why the gate exists.** Advancing a Sales Engagement cadence step is not a standard
Salesforce record write. If the required interface proves unavailable or requires an
approach materially different from the one assumed here, Phase 3 effort will differ from
the estimate above, and Packet Fusion will issue a revised estimate for the Customer's
approval before continuing. Without the gate, the alternative is either an inflated
contingency or a mid-project change order, and neither serves the Customer.

---

## 5. Deliverables

| # | Deliverable | Phase |
|---|---|---|
| 1 | Current-state assessment of the existing Virtual Agent configuration | 1 |
| 2 | Extended Virtual Agent with prospect territory routing, in production | 1 |
| 3 | Salesforce prerequisite specification — connected app and integration user permissions | 2 |
| 4 | Auto Dialer and Sales Engagement feasibility finding, with confirmed build estimate | 2 |
| 5 | Auto Dialer to Salesforce middleware, deployed | 3 |
| 6 | Disposition mapping configuration | 3 |
| 7 | Operational runbook and handover documentation | 3 |

---

## 6. Preconditions

Work cannot begin, or will be delayed, absent the following:

1. **Zoom resolution of the Virtual Agent transfer-back behaviour.** When a call is
   transferred to a representative who does not answer and the caller elects to schedule
   via voicemail, the call currently returns to the top of the Virtual Agent and re-collects
   information already provided. Zoom has confirmed this is not the intended behaviour and
   has committed to correcting it. Packet Fusion's scope assumes handover of a Virtual Agent
   in which this is resolved; remediation of this behaviour is not included.

2. **Salesforce access.** An external connected app and an integration user with read and
   write permissions on the objects and fields in scope, provisioned by the Customer's
   Salesforce administrator to the specification in Deliverable 3.

3. **Zoom tenant access.** Administrative access to the Customer's Zoom tenant for the
   duration of the engagement, with validity periods sufficient to cover the delivery
   window.

4. **Documentation of the existing build.** The current-state write-up and Salesforce MCP
   configuration notes from the Zoom resource who built the POC.

5. **Confirmation that Salesforce list upload to Auto Dialer is functioning.** The Customer
   has advised that lists and reports can already be loaded into Auto Dialer. This estimate
   excludes building that direction. If it proves non-functional, an additional 6 hours
   applies.

---

## 7. Assumptions

- The Virtual Agent remains in the Customer's production Zoom tenant, with POC
  configuration intact.
- Territory assignment by zip code is available through a queryable Salesforce object or
  equivalent supported interface. If the mapping exists only as a report requiring
  reverse-engineering, additional discovery effort applies.
- A five-minute polling interval between an Auto Dialer call outcome and its appearance in
  Salesforce is acceptable. Real-time reflection is not achievable without Auto Dialer
  webhooks.
- Auto Dialer webhooks do not become available during the engagement. Should Zoom release
  them mid-engagement, migrating from polling to event-driven delivery is a change to scope
  and will be estimated separately. It would improve latency and reduce API consumption.
- Salesforce API request volume associated with the polling service falls within the
  Customer's existing entitlement.
- Customer resources are available for scheduled testing, including BDR participation for
  Workstream B.
- Work is delivered remotely during Packet Fusion business hours.

---

## 8. Out of Scope

- Zoom Contact Center Outbound Campaign configuration. This engagement addresses Zoom Auto
  Dialer, a Zoom Phone capability, which is a separate product with a separate API.
- Remediation of the Virtual Agent transfer-back behaviour described in Section 6.1.
- Salesforce development, including Apex, Flow, and validation rule changes, other than the
  integration user and connected app configuration specified in Deliverable 3.
- Building the Salesforce to Auto Dialer list upload direction.
- Sales Engagement cadence design, content, or restructuring.
- Zoom licence procurement, including Auto Dialer seats and Virtual Agent minute
  commitments.
- Net-new Virtual Agent intents, skills, or conversational paths beyond the prospect
  territory routing described in Section 2.1.
- End user training and change management.

---

## 9. Customer Responsibilities

| Responsibility | Owner |
|---|---|
| Business requirements and acceptance decisions | Ana Griffin |
| Commercial approval | James Palmiotto |
| Salesforce connected app, integration user and permissions | Customer Salesforce administrator |
| Existing build documentation and Salesforce MCP notes | Zoom |
| Virtual Agent transfer-back remediation | Zoom |
| Auto Dialer product guidance and feature request status | Zoom |
| BDR availability for Workstream B testing | Customer |

---

## Notes for Brett

- Hours only above. Rate and totals to be inserted.
- Brad Whitlock and Ana Griffin both asked for the two projects in a single SOW; this is
  structured as one SOW, two workstreams, three phases.
- The Section 4 gate is what allows 40 hours rather than a padded number. If the phasing is
  removed, Workstream B should carry a contingency instead.
- The no-charge discovery line reflects what was offered on the 28 July call.
- Section 6.5 is worth verbally confirming with Ana before issue — it removes 6 hours from
  the estimate on the strength of a passing comment.
