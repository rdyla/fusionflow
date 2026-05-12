/**
 * Canonical vendor enum + tolerant normalizer for the projects.vendor column.
 *
 * Historical data has free-text values ("Ring Central", "RingCentral",
 * "Zoom Phone", etc.) because the project-create form used a free-text input.
 * The form is now a select bound to VENDOR_KEYS; the normalizer below
 * absorbs legacy values into one of the canonical keys so client/server
 * platform-detection logic can branch on a stable string.
 *
 * Consumed by both client (src/client) and server (src/server) — each
 * tsconfig includes src/shared. New vendors: add to VENDOR_OPTIONS and
 * the substring map in canonicalizeVendor() simultaneously.
 */

export const VENDOR_OPTIONS = [
  { value: "zoom",            label: "Zoom" },
  { value: "ringcentral",     label: "RingCentral" },
  { value: "microsoft_teams", label: "Microsoft Teams" },
  { value: "webex",           label: "Webex" },
  { value: "8x8",             label: "8x8" },
  { value: "mitel",           label: "Mitel" },
  { value: "shoretel",        label: "ShoreTel" },
  { value: "vonage",          label: "Vonage" },
  { value: "tbd",             label: "TBD" },
  { value: "other",           label: "Other" },
] as const;

export type VendorKey = typeof VENDOR_OPTIONS[number]["value"];

const VENDOR_KEYS: ReadonlySet<string> = new Set(VENDOR_OPTIONS.map((o) => o.value));

/**
 * Substring-based normalizer. Strips whitespace + lowercases, then matches
 * against known fragments. Most-specific patterns first.
 */
export function canonicalizeVendor(raw: string | null | undefined): VendorKey | null {
  if (!raw) return null;
  const exact = raw.trim().toLowerCase();
  if (VENDOR_KEYS.has(exact)) return exact as VendorKey;

  const stripped = exact.replace(/[\s\-_.,]/g, "");
  if (!stripped) return null;
  if (stripped.includes("ringcentral") || stripped === "rc") return "ringcentral";
  if (stripped.includes("zoom"))                              return "zoom";
  if (stripped.includes("teams") || stripped.includes("microsoft")) return "microsoft_teams";
  if (stripped.includes("webex") || stripped.includes("cisco"))     return "webex";
  if (stripped.includes("8x8"))                                     return "8x8";
  if (stripped.includes("mitel"))                                   return "mitel";
  if (stripped.includes("shoretel"))                                return "shoretel";
  if (stripped.includes("vonage"))                                  return "vonage";
  if (stripped === "tbd" || stripped === "tba")                     return "tbd";
  return null;
}

/** Display label for a stored vendor value (canonical or legacy free-text). */
export function vendorLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  const canonical = canonicalizeVendor(raw);
  if (canonical) {
    const opt = VENDOR_OPTIONS.find((o) => o.value === canonical);
    if (opt) return opt.label;
  }
  return raw; // legacy / unknown — surface as-is rather than dropping
}
