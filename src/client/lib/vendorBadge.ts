// Maps a vendor name from D365 (e.g. "Zoom Communications", "RingCentral, Inc.")
// to a short label and brand color. Substring match — D365 vendor account names
// vary in formatting, so loose matching is more robust than an exact lookup.
export function resolveVendorBadge(rawName: string | null | undefined): { label: string; color: string } | null {
  if (!rawName) return null;
  const n = rawName.toLowerCase();
  if (n.includes("zoom"))         return { label: "Zoom",        color: "#0078d4" };
  if (n.includes("ringcentral"))  return { label: "RingCentral", color: "#ff8c00" };
  if (n.includes("8x8"))          return { label: "8x8",         color: "#8764b8" };
  if (n.includes("shoretel"))     return { label: "ShoreTel",    color: "#64748b" };
  if (n.includes("mitel"))        return { label: "Mitel",       color: "#64748b" };
  if (n.includes("microsoft") || n.includes("teams")) return { label: "MS Teams", color: "#5059c9" };
  if (n.includes("vonage"))       return { label: "Vonage",      color: "#dc2626" };
  return { label: rawName, color: "#475569" };
}

export type LastVendor = {
  vendor: string | null;
  vendorId?: string | null;
  techType?: string | null;
  soldOn?: string | null;
};
