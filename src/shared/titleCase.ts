/**
 * Title Case normalizer for template task titles.
 *
 * Applied at apply-template time so every task that lands on a project reads
 * consistently regardless of how the template author cased the source. The
 * migration files (0069, 0072, 0073) write tasks in Title Case as well; this
 * is the defensive belt for admin-edited custom templates and legacy data.
 *
 * Rules:
 *   - Capitalize the first letter of every word.
 *   - Stopwords (a, an, and, as, at, but, by, for, from, in, of, on, or, the,
 *     to, with) stay lowercase unless they are the first or last word.
 *   - Recognized acronyms / branded mixed-case tokens (CRM, IVR, RC, CCaaS,
 *     E911, …) are preserved exactly via the `ACRONYMS` map.
 *   - Tokens that are already genuinely mixed-case (e.g. RingCentral) are left
 *     alone — assume the author meant the casing they wrote.
 *   - Hyphenated words are title-cased on both sides ("set-up" → "Set-Up").
 */

const STOPWORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from",
  "in", "of", "on", "or", "the", "to", "with",
]);

const ACRONYMS: Record<string, string> = {
  crm: "CRM", ivr: "IVR", uat: "UAT", qa: "QA", ai: "AI", rc: "RC",
  bat: "BAT", sdk: "SDK", csm: "CSM", pe: "PE", pm: "PM", ie: "IE",
  ce: "CE", sso: "SSO", e911: "E911", zra: "ZRA", ccaas: "CCaaS",
  ucaas: "UCaaS", did: "DID", dids: "DIDs", ars: "ARs", sow: "SOW",
  wfm: "WFM", "10dlc": "10DLC", sla: "SLA", byo: "BYO", id: "ID", ids: "IDs",
};

function titleCaseWord(token: string, isFirst: boolean, isLast: boolean): string {
  const lower = token.toLowerCase();
  if (ACRONYMS[lower]) return ACRONYMS[lower];
  if (STOPWORDS.has(lower) && !isFirst && !isLast) return lower;
  // Preserve genuine mixed-case (RingCentral, iPhone, etc.) — only "mixed" if
  // there's an uppercase letter somewhere past position 0.
  const hasInternalUpper = /[A-Z]/.test(token.slice(1));
  if (hasInternalUpper && token !== token.toUpperCase()) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export function toTitleCase(s: string): string {
  if (!s) return s;
  // Split keeping whitespace and hyphens as separator tokens.
  const parts = s.split(/(\s+|-)/);
  // Indices of parts that start with a letter — the actual "words".
  const wordIdx: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] && /^[A-Za-z]/.test(parts[i])) wordIdx.push(i);
  }
  if (wordIdx.length === 0) return s;
  const first = wordIdx[0];
  const last = wordIdx[wordIdx.length - 1];
  return parts
    .map((p, i) => {
      if (!p || !/^[A-Za-z]/.test(p)) return p;
      return titleCaseWord(p, i === first, i === last);
    })
    .join("");
}
