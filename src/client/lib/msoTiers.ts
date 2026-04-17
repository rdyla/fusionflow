export type MsoTierKey = "essentials" | "professional" | "advanced" | "enterprise";

export interface MsoDeliverable {
  name: string;
  description: string;
  cadence: string;
}

export interface MsoTier {
  fee: number;
  label: string;
  engineer: string;
  allocation: string;
  scope: string;
  sla: string;
  includes: string;
  coverage: string;
  panels: [string, string][];
  features: string[];
  deliverables: MsoDeliverable[];
}

export const MSO_TIERS: Record<MsoTierKey, MsoTier> = {
  essentials: {
    fee: 15000,
    label: "Essentials",
    engineer: "Shared Engineer Pool",
    allocation: "< 2 hrs/wk",
    scope: "UCaaS or CCaaS environments with standard MACD volume",
    sla: "P1: 30 min · P2: 2 hrs · P3: Next business day",
    includes: "Shared engineer pool, business-hours MACD, monthly health report, portal-based ticket management, annual platform review",
    coverage: "A Packet Fusion engineer monitors your environment from a shared rotation. Requests are handled during business hours with pooled team coverage outside those windows.",
    panels: [
      ["Shared Engineer Pool", "Pooled team of certified engineers handles your environment — no single point of failure, business-hours priority coverage."],
      ["MACD Execution", "Standard adds, moves, changes, and deletes executed by certified engineers without project overhead."],
      ["Platform Configuration", "Core call flow, queue, and routing configuration maintained to vendor-recommended standards."],
      ["Environment Health Monitoring", "Periodic health checks on call quality, licensing utilization, and configuration baseline."],
      ["Monthly Environment Report", "Change log, open item summary, and platform health snapshot delivered each month."],
      ["Annual Platform Review", "Once-per-year strategic review to align your platform to current business needs."],
      ["Vendor Escalation Support", "Engineer coordinates with Zoom, carrier, and integration vendors on your behalf for escalated issues."],
      ["Engineering Response SLA", "P1: 30 min · P2: 2 hrs · P3: Next business day. Escalation through team-wide coverage."],
    ],
    features: [
      "Shared engineer pool — no single point of failure",
      "Business-hours MACD execution",
      "Core platform configuration management",
      "Monthly environment health reports",
      "Annual platform review",
      "Vendor escalation coordination",
      "Portal-based ticket management",
      "Team-wide escalation outside business hours",
    ],
    deliverables: [
      { name: "Shared Engineer Pool", description: "Pooled team of certified engineers assigned to your environment with business-hours priority coverage and team-wide escalation outside those windows.", cadence: "Ongoing" },
      { name: "MACD Execution", description: "Standard adds, moves, changes, and deletes handled by certified engineers through the Packet Fusion customer portal.", cadence: "As needed" },
      { name: "Platform Configuration", description: "Core call flow, queue, and routing configuration maintained to vendor-recommended standards.", cadence: "Ongoing" },
      { name: "Environment Health Monitoring", description: "Periodic health checks covering call quality, licensing utilization, and configuration integrity. Issues flagged and addressed as identified.", cadence: "Monthly" },
      { name: "Monthly Environment Report", description: "Change log, open item summary, and platform health snapshot delivered each month.", cadence: "Monthly" },
      { name: "Annual Platform Review", description: "Once-per-year strategic session to align your platform to current business objectives and upcoming renewals.", cadence: "Annually" },
      { name: "Vendor Escalation Support", description: "Engineer coordinates with platform vendors and carriers for escalated issues and ticket management on your behalf.", cadence: "As needed" },
      { name: "Portal-Based Ticket Management", description: "All requests submitted and tracked through the Packet Fusion customer portal with real-time status updates.", cadence: "Ongoing" },
    ],
  },
  professional: {
    fee: 24000,
    label: "Professional",
    engineer: "Fractional Engineer (5–10 hrs/wk)",
    allocation: "~25% allocation",
    scope: "UCaaS + CCaaS — the recommended sweet spot for most customers",
    sla: "P1: 15 min · P2: 1 hr · P3: 4 hrs · 24/7/365",
    includes: "Assigned primary engineer with direct line, same-day MACD, proactive monitoring, monthly exec report, semi-annual QBR, vendor escalation ownership, backup coverage",
    coverage: "A primary Packet Fusion engineer is fractionally assigned to your account — roughly 5–10 hours per week. They know your environment, your users, and your escalation contacts.",
    panels: [
      ["Fractional Engineer Assignment", "A primary engineer is fractionally assigned — 5–10 hrs/week dedicated to your environment. They know your platform, your team, and your history."],
      ["Hands-On MACD Management", "Your assigned engineer personally executes all adds, moves, changes, and deletes. Same-day turnaround on standard requests."],
      ["Proactive Configuration Management", "Engineer reviews and tunes call flows, auto-attendants, queues, and routing logic on a rolling basis — not just when problems surface."],
      ["Platform Health Monitoring", "Engineer-led monitoring of call quality metrics, utilization trends, and configuration drift. Issues caught before users feel them."],
      ["Monthly Engineering Report", "Detailed report covering MACD volume, call quality trends, open issues, and recommended actions — delivered by your engineer."],
      ["Semi-Annual QBR", "Your engineer leads a bi-annual business review to present platform performance, align roadmap priorities, and plan ahead."],
      ["Direct Vendor Escalation Ownership", "Your engineer owns the Zoom TAM relationship and carrier escalation path. You never navigate vendor support alone."],
      ["24/7 Engineering Response SLA", "P1: 15 min · P2: 1 hr · P3: 4 hrs — direct to your assigned engineer, not a general queue. Backup coverage guaranteed."],
    ],
    features: [
      "Named primary engineer + backup coverage",
      "Fractional assignment — 5–10 hrs/week dedicated",
      "24/7/365 direct engineer access",
      "Same-day MACD execution",
      "Proactive configuration management",
      "Monthly engineering reports",
      "Semi-annual QBR",
      "Direct vendor escalation ownership",
    ],
    deliverables: [
      { name: "Fractional Engineer Assignment", description: "Named primary engineer fractionally dedicated to your account, with backup coverage ensuring continuity. Assigned engineer maintains deep knowledge of your platform, team, and business cadence.", cadence: "Ongoing" },
      { name: "MACD Execution", description: "Your assigned engineer personally executes all adds, moves, changes, and deletes. Same-day turnaround on standard requests.", cadence: "As needed" },
      { name: "Proactive Configuration Management", description: "Engineer reviews and tunes call flows, auto-attendants, queues, and routing logic on a rolling basis — not just when problems surface.", cadence: "Ongoing" },
      { name: "Platform Health Monitoring", description: "Engineer-led monitoring of call quality metrics, utilization trends, and configuration drift. Issues addressed before users feel them.", cadence: "Ongoing" },
      { name: "Monthly Engineering Report", description: "Detailed report covering MACD volume, call quality trends, open issues, and recommended actions — delivered by your assigned engineer.", cadence: "Monthly" },
      { name: "Semi-Annual QBR", description: "Bi-annual business review led by your engineer covering platform performance, roadmap priorities, and forward-looking planning.", cadence: "Semi-Annual" },
      { name: "Direct Vendor Escalation Ownership", description: "Your engineer owns the vendor TAM relationship and carrier escalation path. You never navigate vendor support alone.", cadence: "Ongoing" },
      { name: "Emergency Change Management", description: "Priority handling of urgent configuration changes with defined SLA response windows and no T&M surcharges.", cadence: "As needed" },
    ],
  },
  advanced: {
    fee: 42000,
    label: "Advanced",
    engineer: "Semi-Dedicated Engineer (15–20 hrs/wk)",
    allocation: "~50% allocation",
    scope: "Complex UCaaS + CCaaS environments or multi-site deployments",
    sla: "P1: 15 min · P2: 1 hr · P3: 4 hrs · 24/7/365",
    includes: "Primary + backup engineer both know your environment, unlimited MACD, weekly health monitoring, monthly + quarterly board-ready reporting, full QBR cadence, full vendor coordination",
    coverage: "A semi-dedicated Packet Fusion engineer spends approximately half their working week on your account. They develop deep familiarity with your architecture, your quirks, and your business cadence.",
    panels: [
      ["Semi-Dedicated Engineer", "Deep familiarity with your architecture, users, and business cadence. Primary and backup both know your environment."],
      ["Unlimited MACD Execution", "No cap on adds, moves, changes, and deletes. Your engineer handles configuration work as part of regular workflow, not as discrete project scopes."],
      ["Active Configuration Optimization", "Engineer continuously reviews and improves call flows, integrations, contact center routing, and platform policies — optimization is ongoing, not periodic."],
      ["Weekly Environment Monitoring", "Engineer-run weekly checks on call quality, feature adoption, licensing, and configuration integrity — with direct remediation on identified issues."],
      ["Monthly + Quarterly Reporting", "Detailed monthly engineering report plus a quarterly summary covering platform ROI, adoption metrics, and forward-looking recommendations."],
      ["Full QBR Cadence", "Quarterly business reviews led by your engineer and supported by Packet Fusion leadership — platform roadmap, cost optimization, and expansion planning included."],
      ["Full Vendor Coordination", "Engineer owns all vendor relationships — Zoom, carrier, integration partners. Escalations, renewals, and roadmap alignment managed on your behalf."],
      ["24/7 Engineering Response SLA", "P1: 15 min · P2: 1 hr · P3: 4 hrs — direct to your semi-dedicated team. Both your primary and backup engineer are briefed on all active issues."],
    ],
    features: [
      "Named primary engineer + backup assigned",
      "Deep familiarity with your architecture and users",
      "24/7/365 direct engineer access",
      "Unlimited MACD execution",
      "Active configuration optimization",
      "Weekly environment monitoring",
      "Monthly + quarterly reporting",
      "Full vendor coordination",
      "QBR cadence with PF leadership",
      "Emergency changes — Priority SLA, no T&M",
    ],
    deliverables: [
      { name: "Semi-Dedicated Engineer", description: "Named primary and backup engineer allocated to your account. Both engineers maintain deep familiarity with your architecture, users, and business cadence. Monthly allocation monitored proactively; overages flagged in advance and available at the advanced task rate.", cadence: "Ongoing" },
      { name: "MACD Execution", description: "All adds, moves, changes, and deletes included without a per-request volume cap. Requests requiring significant effort are flagged for acknowledgment before execution and may be evaluated for separate scoping on a recurring basis.", cadence: "As needed" },
      { name: "Active Configuration Optimization", description: "Continuous review and improvement of call flows, integrations, contact center routing, and platform policies.", cadence: "Ongoing" },
      { name: "Weekly Environment Monitoring", description: "Weekly checks on call quality, feature adoption, licensing, and configuration integrity with direct remediation on identified issues.", cadence: "Weekly" },
      { name: "Monthly Engineering Report", description: "Concise report covering ticket trends, MAC volumes, open items, platform health, and licensing status.", cadence: "Monthly" },
      { name: "Quarterly Business Review (QBR)", description: "Leadership-facing review covering platform ROI, adoption metrics, forward-looking recommendations, and roadmap alignment — led by your engineer and supported by Packet Fusion leadership.", cadence: "Quarterly" },
      { name: "Full Vendor Coordination", description: "Client Success owns all vendor relationships including platform vendors, carrier, and integration partners. Escalations, renewals, and roadmap alignment managed on your behalf.", cadence: "Ongoing" },
      { name: "Emergency Change Management", description: "Priority handling of urgent configuration changes with defined SLA response windows and no T&M surcharges.", cadence: "As needed" },
    ],
  },
  enterprise: {
    fee: 90000,
    label: "Enterprise",
    engineer: "Fully Dedicated Engineer (30–40 hrs/wk)",
    allocation: "~100% allocation",
    scope: "Large or highly complex environments requiring embedded expertise",
    sla: "P1: 15 min · P2: 1 hr · P3: 4 hrs · 24/7/365 with SLA credits",
    includes: "Engineer works your account exclusively — effectively an embedded UC engineer. Unlimited MACD, all monitoring/reporting/roadmap included, emergency change SLA, cost & licensing optimization",
    coverage: "A Packet Fusion engineer is fully dedicated to your account — effectively an embedded UC engineer working within your team. They own your environment end-to-end.",
    panels: [
      ["Fully Dedicated Engineer", "One Packet Fusion engineer, working your account exclusively — 30–40 hrs/week. They function as an embedded UC engineer within your organization."],
      ["Unlimited MACD — No Boundaries", "Your engineer handles all configuration work with no scope constraints. Complex integrations, API development, and custom call flows are within scope."],
      ["Continuous Platform Engineering", "Engineer actively improves, documents, and future-proofs your environment on an ongoing basis — not reactively but as part of their daily work on your account."],
      ["Real-Time Environment Monitoring", "Continuous oversight of call quality, platform health, and configuration integrity. Your engineer is watching before tickets are submitted."],
      ["Full Executive Reporting Suite", "Monthly engineering deep-dive plus quarterly executive summary — platform performance, licensing efficiency, adoption metrics, and strategic recommendations."],
      ["Embedded QBR & Roadmap Leadership", "Your engineer runs quarterly business reviews and leads the annual platform roadmap process, coordinating with your IT leadership directly."],
      ["End-to-End Vendor Accountability", "Your engineer owns every vendor relationship — Zoom, carrier, SBC, integration partners. SLA accountability and renewal strategy managed on your behalf."],
      ["24/7 Engineering Response SLA + Credits", "P1: 15 min · P2: 1 hr · P3: 4 hrs — direct to your dedicated engineer. SLA miss triggers service credits. Emergency change SLA available."],
    ],
    features: [
      "Fully dedicated engineer — 30–40 hrs/week",
      "Embedded within your organization",
      "24/7/365 direct engineer access",
      "Unlimited MACD — no scope constraints",
      "Continuous platform engineering",
      "Real-time environment monitoring",
      "Full executive reporting suite",
      "QBR & roadmap leadership",
      "End-to-end vendor accountability",
      "Emergency SLA with service credits",
    ],
    deliverables: [
      { name: "Fully Dedicated Engineer", description: "One Packet Fusion engineer working your account exclusively. Functions as an embedded UC engineer within your organization with full end-to-end ownership of your environment.", cadence: "Ongoing" },
      { name: "Unlimited MACD — No Boundaries", description: "Your engineer handles all configuration work with no scope constraints. Complex integrations, API development, and custom call flows are within standard engagement scope.", cadence: "As needed" },
      { name: "Continuous Platform Engineering", description: "Engineer actively improves, documents, and future-proofs your environment on an ongoing basis — optimization is daily practice, not a periodic deliverable.", cadence: "Ongoing" },
      { name: "Real-Time Environment Monitoring", description: "Continuous oversight of call quality, platform health, and configuration integrity. Your engineer is watching before tickets are submitted.", cadence: "Ongoing" },
      { name: "Full Executive Reporting Suite", description: "Monthly engineering deep-dive plus quarterly executive summary covering platform performance, licensing efficiency, adoption metrics, and strategic recommendations.", cadence: "Monthly / Quarterly" },
      { name: "Embedded QBR & Roadmap Leadership", description: "Your engineer runs quarterly business reviews and leads the annual platform roadmap process, coordinating with your IT leadership directly.", cadence: "Quarterly" },
      { name: "End-to-End Vendor Accountability", description: "Your engineer owns every vendor relationship. SLA accountability and renewal strategy managed on your behalf. SLA miss triggers service credits.", cadence: "Ongoing" },
      { name: "Emergency Change Management with SLA Credits", description: "Priority handling of urgent configuration changes. SLA miss triggers service credits. Emergency change SLA available for mission-critical situations.", cadence: "As needed" },
    ],
  },
};

export function getMsoTier(key: string): MsoTier | null {
  if (!key || key === "custom") return null;
  return (MSO_TIERS as Record<string, MsoTier>)[key] ?? null;
}
