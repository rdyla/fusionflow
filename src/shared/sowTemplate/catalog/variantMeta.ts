/**
 * Variant-level metadata — product line / project reference / hero image /
 * training paragraphs / E911 footnote toggle.
 *
 * Each entry is picked by the assembler via signature match. The longer
 * the matching `appliesTo` list, the more specific the entry — combo
 * SOWs (e.g. ucaas+ccaas) pick a combo-tagged entry over single-type
 * fallbacks. `priority` resolves ties when two equally-specific entries
 * exist for the same signature (higher wins).
 */

import type { VariantMeta } from "./types";

export const VARIANT_META: VariantMeta[] = [
  // ─── Zoom ─────────────────────────────────────────────────────────────────
  {
    appliesTo: ["ucaas"],
    vendor: ["zoom"],
    productLine: "Zoom UCaaS Professional Services",
    projectReferenceTemplate: "Zoom UCaaS Migration – {customer}",
    heroImageKey: "zoom_ucaas",
    showE911Footnote: true,
    trainingIncluded: "Self-paced end-user training via Zoom's video library and knowledge base; instructor-led administrator training delivered by Packet Fusion.",
    trainingOptional: "Live, remote, instructor-led end-user training sessions (up to 20 attendees per session). See Section 9.2 for pricing. Sessions are recorded and download links are provided.",
  },
  {
    appliesTo: ["ccaas"],
    vendor: ["zoom"],
    productLine: "Zoom Contact Center Professional Services",
    projectReferenceTemplate: "Zoom Contact Center Implementation – {customer}",
    heroImageKey: "ccaas",
    showE911Footnote: false,
    trainingIncluded: "Self-paced agent training via Zoom's video library and knowledge base; instructor-led administrator + supervisor training delivered by Packet Fusion.",
    trainingOptional: "Live, remote, instructor-led agent training sessions (up to 20 attendees per session). See Section 9.2 for pricing.",
  },
  {
    // Combo: Zoom UCaaS + Zoom CCaaS
    appliesTo: ["ucaas", "ccaas"],
    vendor: ["zoom"],
    productLine: "Zoom UCaaS + Contact Center Professional Services",
    projectReferenceTemplate: "Zoom UCaaS + Contact Center Implementation – {customer}",
    heroImageKey: "ccaas",
    showE911Footnote: true,
    trainingIncluded: "Self-paced end-user and agent training via Zoom's video library and knowledge base; instructor-led administrator + supervisor training delivered by Packet Fusion for both UCaaS and Contact Center.",
    trainingOptional: "Live, remote, instructor-led training sessions for end users and agents (up to 20 attendees per session). See Section 9.2 for pricing.",
    priority: 10,
  },
  {
    appliesTo: ["ci"],
    vendor: ["zoom"],
    productLine: "Zoom Revenue Accelerator Professional Services",
    projectReferenceTemplate: "Zoom Revenue Accelerator Implementation – {customer}",
    heroImageKey: "ai_data",
    showE911Footnote: false,
    trainingIncluded: "Administrator + reviewer training delivered by Packet Fusion covering tracker tuning, scorecard authoring, and recording review workflows.",
    trainingOptional: "Live, remote, instructor-led sales-team enablement sessions on Revenue Accelerator usage. See Section 9.2 for pricing.",
  },
  {
    appliesTo: ["va"],
    vendor: ["zoom"],
    productLine: "Zoom AI Virtual Agent Professional Services",
    projectReferenceTemplate: "Zoom AI Virtual Agent Implementation – {customer}",
    heroImageKey: "ai_data",
    showE911Footnote: false,
    trainingIncluded: "Administrator + intent-author training delivered by Packet Fusion covering bot persona configuration, intent library management, fallback handling, and conversation analytics.",
    trainingOptional: "Live, remote, instructor-led intent-design workshops with the Customer's content owners. See Section 9.2 for pricing.",
  },

  // ─── RingCentral ──────────────────────────────────────────────────────────
  {
    appliesTo: ["ucaas"],
    vendor: ["ringcentral"],
    productLine: "RingCentral UCaaS Professional Services",
    projectReferenceTemplate: "RingCentral UCaaS Migration – {customer}",
    heroImageKey: "ucaas_generic",
    showE911Footnote: true,
    trainingIncluded: "Self-paced end-user training via RingCentral's University library; instructor-led administrator training delivered by Packet Fusion.",
    trainingOptional: "Live, remote, instructor-led end-user training sessions (up to 20 attendees per session). See Section 9.2 for pricing.",
  },
  {
    appliesTo: ["ccaas"],
    vendor: ["ringcentral"],
    productLine: "RingCX Contact Center Professional Services",
    projectReferenceTemplate: "RingCX Contact Center Implementation – {customer}",
    heroImageKey: "ccaas",
    showE911Footnote: false,
    trainingIncluded: "Self-paced agent training via RingCentral's University library; instructor-led administrator + supervisor training delivered by Packet Fusion.",
    trainingOptional: "Live, remote, instructor-led agent training sessions (up to 20 attendees per session). See Section 9.2 for pricing.",
  },
  {
    // Combo: RingCentral UCaaS + RingCX
    appliesTo: ["ucaas", "ccaas"],
    vendor: ["ringcentral"],
    productLine: "RingCentral UCaaS + RingCX Professional Services",
    projectReferenceTemplate: "RingCentral UCaaS + RingCX Implementation – {customer}",
    heroImageKey: "ccaas",
    showE911Footnote: true,
    trainingIncluded: "Self-paced training via RingCentral's University library for end users and agents; instructor-led administrator + supervisor training delivered by Packet Fusion for both UCaaS and RingCX.",
    trainingOptional: "Live, remote, instructor-led training sessions for end users and agents. See Section 9.2 for pricing.",
    priority: 10,
  },
  {
    appliesTo: ["rc_air"],
    vendor: ["ringcentral"],
    productLine: "RingCentral AI Receptionist Professional Services",
    projectReferenceTemplate: "RingCentral AI Receptionist Implementation – {customer}",
    heroImageKey: "ai_data",
    showE911Footnote: false,
    trainingIncluded: "Administrator training delivered by Packet Fusion covering AI Receptionist greeting design, routing logic, escalation paths, and conversation analytics.",
    trainingOptional: "Live, remote, instructor-led workshops to refine receptionist scripts with the Customer's content owners. See Section 9.2 for pricing.",
  },
];

/** Fallback used when no entry matches — keeps the renderer from crashing. */
export const FALLBACK_VARIANT_META: Omit<VariantMeta, "appliesTo" | "vendor" | "priority"> = {
  productLine: "Packet Fusion Professional Services",
  projectReferenceTemplate: "Implementation – {customer}",
  showE911Footnote: false,
  trainingIncluded: "Administrator training delivered by Packet Fusion. Detailed scope confirmed at kickoff.",
};
