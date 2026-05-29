/**
 * Engagement Snapshot tiles. The cover page shows exactly 4 tiles —
 * assembler filters by (vendor, solution_types), sorts by priority
 * desc, dedupes by label, takes the first 4.
 *
 * Per-vendor variants override generic ones via priority + vendor tag
 * (e.g. "Zoom Phone Users" beats the generic "UCaaS Users" tile when
 * vendor=zoom and solution_types contains ucaas).
 */

import type { SnapshotTile } from "./types";

export const SNAPSHOT_TILES: SnapshotTile[] = [
  // Locations — every variant. Always shown first.
  {
    label: "Locations",
    value: (ctx) => String(ctx.locationCount || 0),
    priority: 100,
  },

  // UCaaS
  {
    appliesTo: ["ucaas"],
    vendor: ["zoom"],
    label: "Zoom Phone Users",
    value: (ctx) => String(ctx.primarySeatCount || 0),
    priority: 90,
  },
  {
    appliesTo: ["ucaas"],
    vendor: ["ringcentral"],
    label: "RingCentral Users",
    value: (ctx) => String(ctx.primarySeatCount || 0),
    priority: 90,
  },
  {
    appliesTo: ["ucaas"],
    label: "DIDs to Port",
    value: (ctx) => String(ctx.ditNumbers || 0),
    priority: 80,
  },
  {
    appliesTo: ["ucaas"],
    vendor: ["zoom"],
    label: "Zoom Meetings",
    value: (ctx) => String(ctx.meetingsCount || 0),
    priority: 70,
  },

  // CCaaS
  {
    appliesTo: ["ccaas"],
    vendor: ["zoom"],
    label: "Zoom Contact Center Agents",
    value: (ctx) => String(ctx.primarySeatCount || 0),
    priority: 90,
  },
  {
    appliesTo: ["ccaas"],
    vendor: ["ringcentral"],
    label: "RingCX Agents",
    value: (ctx) => String(ctx.primarySeatCount || 0),
    priority: 90,
  },
  // Combo (UCaaS + CCaaS) — both seat counts side-by-side, agents tile
  // takes priority 95 so it lands before DIDs in the 4-tile budget.
  {
    appliesTo: ["ucaas", "ccaas"],
    label: "CCaaS Agents",
    value: (ctx) => String(ctx.primarySeatCount || 0),
    priority: 85,
  },

  // CI / VA / AIR
  {
    appliesTo: ["ci"],
    label: "Recorded Seats",
    value: (ctx) => String(ctx.primarySeatCount || 0),
    priority: 90,
  },
  {
    appliesTo: ["va"],
    label: "Bots",
    value: (ctx) => String(ctx.primarySeatCount || 0),
    priority: 90,
  },
  {
    appliesTo: ["rc_air"],
    label: "AI Receptionist Numbers",
    value: (ctx) => String(ctx.primarySeatCount || 0),
    priority: 90,
  },

  // Go-live count — common across all variants, lower priority so it
  // only appears when there's room.
  {
    label: "Go-Live Events",
    value: (ctx) => String(ctx.goLiveCount || 0),
    priority: 30,
  },
];
