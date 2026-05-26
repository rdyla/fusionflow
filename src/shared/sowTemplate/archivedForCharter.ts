/**
 * Archived SOW content — formerly rendered as Section 7 (Project Approach &
 * Governance) on the customer SOW. Per the May-2026 SOW content review,
 * Governance / RACI / Escalation / Communication Cadence / Status Reporting
 * are too detailed for the SOW stage and were removed from the customer-
 * facing renderer.
 *
 * The content is preserved here pending a future Project Charter and/or
 * RFP-response document where this level of detail belongs. Nothing imports
 * from this file at the moment — it's a deliberate parking lot, not dead
 * code. Don't delete; revive into a charter renderer when that scope picks
 * up.
 */

// R = Responsible, A = Accountable, C = Consulted, I = Informed
export const RACI_ROWS_ARCHIVED: Array<{ activity: string; pm: string; ie: string; sa: string; cust_pm: string; cust_tech: string; cust_signer: string }> = [
  { activity: "Project plan & schedule",            pm: "A/R", ie: "I",   sa: "C",   cust_pm: "C",   cust_tech: "I", cust_signer: "I" },
  { activity: "Discovery / Assessment & Design",    pm: "A",   ie: "R",   sa: "C",   cust_pm: "C",   cust_tech: "R", cust_signer: "I" },
  { activity: "Customer validation rounds",          pm: "A",   ie: "C",   sa: "I",   cust_pm: "R",   cust_tech: "R", cust_signer: "—" },
  { activity: "E911 / Emergency Services config",    pm: "C",   ie: "A/R", sa: "I",   cust_pm: "C",   cust_tech: "R", cust_signer: "—" },
  { activity: "10 DLC SMS registration",             pm: "A",   ie: "R",   sa: "I",   cust_pm: "C",   cust_tech: "C", cust_signer: "—" },
  { activity: "LOA / port order submission",         pm: "A/R", ie: "C",   sa: "I",   cust_pm: "C",   cust_tech: "I", cust_signer: "R (sign)" },
  { activity: "Tenant build & provisioning",         pm: "A",   ie: "R",   sa: "C",   cust_pm: "I",   cust_tech: "I", cust_signer: "—" },
  { activity: "UAT execution",                       pm: "A",   ie: "R",   sa: "I",   cust_pm: "C",   cust_tech: "R", cust_signer: "—" },
  { activity: "UAT sign-off",                        pm: "C",   ie: "I",   sa: "I",   cust_pm: "C",   cust_tech: "I", cust_signer: "A/R" },
  { activity: "Training delivery",                   pm: "C",   ie: "R",   sa: "I",   cust_pm: "C",   cust_tech: "I", cust_signer: "—" },
  { activity: "Go-Live event & Day 1 Support",       pm: "A/R", ie: "R",   sa: "C",   cust_pm: "C",   cust_tech: "C", cust_signer: "I" },
  { activity: "Go-Live acceptance",                  pm: "C",   ie: "I",   sa: "I",   cust_pm: "C",   cust_tech: "I", cust_signer: "A/R" },
  { activity: "Project closure & CSM transition",    pm: "A/R", ie: "I",   sa: "C",   cust_pm: "C",   cust_tech: "I", cust_signer: "R (sign)" },
];

export const CADENCE_ROWS_ARCHIVED: Array<{ forum: string; frequency: string; participants: string; output: string }> = [
  { forum: "Project Kickoff",            frequency: "Once",                  participants: "All stakeholders",       output: "Kickoff deck, signed-off plan" },
  { forum: "PM Status Call",             frequency: "Weekly",                participants: "PF PM, Cust PM",         output: "Written status report" },
  { forum: "Technical Working Session",  frequency: "Bi-weekly",             participants: "PF IE, Cust Tech",       output: "Updated workbook / design" },
  { forum: "Executive Steering Review",  frequency: "Monthly",               participants: "Sponsors + PMs",         output: "Risk & milestone summary" },
  { forum: "Go-Live Bridge",             frequency: "Per Go-Live",           participants: "Cutover team",           output: "Go-Live log + sign-off" },
  { forum: "Day 1 Support Stand-up",     frequency: "Daily (Go-Live week)",  participants: "PF + Cust support",      output: "Issue log update" },
  { forum: "CSM Transition Meeting",     frequency: "Project close",         participants: "PF PM, CSM, Cust PM",    output: "Handoff package & contacts" },
];

export const ESCALATION_ROWS_ARCHIVED: Array<{ level: string; pf: string; cust: string }> = [
  { level: "L1 Tactical",   pf: "Project Manager",                       cust: "Project Manager" },
  { level: "L2 Technical",  pf: "Solution Architect / Engineering Lead", cust: "Technical Lead" },
  { level: "L3 Commercial", pf: "Director, Professional Services",       cust: "IT Director / Sponsor" },
  { level: "L4 Executive",  pf: "VP, Professional Services",             cust: "Executive Sponsor" },
];

export const STATUS_REPORTING_BLURB =
  "The Packet Fusion PM will distribute a written status report each week containing: progress against milestones, completed work, planned work, open risks and issues, decisions required, and updated forecast for upcoming milestones. The report serves as the project record of record.";
