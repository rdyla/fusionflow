const APOLLO_BASE = "https://api.apollo.io/api/v1";

// ── Tech stack detection ───────────────────────────────────────────────────

const UC_PATTERNS: Array<[RegExp, string]> = [
  [/cisco webex|webex calling|webex teams/i, "Cisco Webex"],
  [/microsoft teams|ms teams|skype for business|lync/i, "Microsoft Teams"],
  [/zoom phone/i, "Zoom Phone"],
  [/ringcentral/i, "RingCentral"],
  [/avaya aura|avaya ip office|avaya communication/i, "Avaya"],
  [/\b8x8\b/i, "8x8"],
  [/vonage business/i, "Vonage"],
  [/mitel/i, "Mitel"],
  [/nec univerge|nec sv\d/i, "NEC"],
  [/unify openscape|siemens enterprise/i, "Unify"],
  [/nextiva/i, "Nextiva"],
  [/dialpad/i, "Dialpad"],
  [/goto connect|jive communications/i, "GoTo Connect"],
];

const CC_PATTERNS: Array<[RegExp, string]> = [
  [/genesys cloud|genesys engage|genesys pureconnect/i, "Genesys"],
  [/nice incontact|nice cxone/i, "NICE CXone"],
  [/five9/i, "Five9"],
  [/talkdesk/i, "Talkdesk"],
  [/twilio flex|twilio contact center/i, "Twilio Flex"],
  [/amazon connect/i, "Amazon Connect"],
  [/cisco uccx|cisco finesse|cisco contact center/i, "Cisco UCCX"],
  [/avaya aura contact|avaya call center/i, "Avaya CC"],
  [/zoom contact center/i, "Zoom CC"],
  [/freshcaller|freshdesk contact/i, "Freshcaller"],
  [/salesforce service cloud/i, "Salesforce SC"],
  [/zendesk talk/i, "Zendesk Talk"],
  [/8x8 contact center/i, "8x8 CC"],
  [/ringcentral contact center/i, "RingCentral CC"],
];

export function detectProviders(technologies: string[]): { ucProvider: string | null; ccProvider: string | null } {
  let ucProvider: string | null = null;
  let ccProvider: string | null = null;
  for (const tech of technologies) {
    if (!ucProvider) {
      for (const [re, label] of UC_PATTERNS) {
        if (re.test(tech)) { ucProvider = label; break; }
      }
    }
    if (!ccProvider) {
      for (const [re, label] of CC_PATTERNS) {
        if (re.test(tech)) { ccProvider = label; break; }
      }
    }
    if (ucProvider && ccProvider) break;
  }
  return { ucProvider, ccProvider };
}

// ── Scoring ────────────────────────────────────────────────────────────────

const HIGH_VALUE_INDUSTRIES = new Set([
  "finance", "financial_services", "banking", "insurance", "capital_markets",
  "accounting", "investment_management", "venture_capital_private_equity",
  "healthcare", "hospital_health_care", "medical_devices", "pharmaceuticals",
  "health_wellness_and_fitness",
  "information_technology_and_services", "computer_software", "internet",
  "telecommunications", "wireless", "computer_networking",
  "retail", "consumer_goods", "supermarkets",
  "education_management", "higher_education", "e_learning",
  "government_administration", "law_enforcement", "defense_space",
  "real_estate", "hospitality", "staffing_and_recruiting",
  "logistics_and_supply_chain", "transportation_trucking_railroad",
  "utilities", "oil_energy", "legal_services",
]);

export function scoreProspect(params: {
  employeeCount: number | null;
  industry: string | null;
  technologies: string[];
  ucProvider: string | null;
  ccProvider: string | null;
  hasDescription: boolean;
}): { score: number; tier: "hot" | "warm" | "cold" } {
  let score = 0;

  // Employee count: sweet spot for UCaaS/CCaaS is 100-5000
  const emp = params.employeeCount ?? 0;
  if (emp >= 100 && emp <= 5000) score += 25;
  else if ((emp >= 50 && emp < 100) || (emp > 5000 && emp <= 20000)) score += 15;
  else if (emp > 0) score += 5;

  // Industry relevance
  const industry = (params.industry ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (HIGH_VALUE_INDUSTRIES.has(industry)) score += 20;

  // Existing UC tech = migration opportunity
  if (params.ucProvider) score += 30;
  if (params.ccProvider) score += 20;

  // Has description (data quality indicator)
  if (params.hasDescription) score += 5;

  score = Math.min(score, 100);
  const tier: "hot" | "warm" | "cold" = score >= 70 ? "hot" : score >= 45 ? "warm" : "cold";
  return { score, tier };
}

// ── Apollo API types ───────────────────────────────────────────────────────

export interface ApolloOrg {
  id: string | null;
  name: string | null;
  industry: string | null;
  employeeCount: number | null;
  annualRevenuePrinted: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  foundedYear: number | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  technologies: string[];
  phone: string | null;
}

export interface ApolloContact {
  id: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  seniority: string | null;
}

// ── API calls ──────────────────────────────────────────────────────────────

export async function enrichOrganization(domain: string, apiKey: string): Promise<ApolloOrg | null> {
  try {
    const url = `${APOLLO_BASE}/organizations/enrich?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) return null;

    const data = await res.json() as { organization?: Record<string, unknown> };
    const org = data.organization;
    if (!org) return null;

    const primaryPhone = (org.primary_phone as { number?: string } | null)?.number ?? null;
    const technologies: string[] = Array.isArray(org.technology_names) ? (org.technology_names as string[]) : [];

    return {
      id: (org.id as string) || null,
      name: (org.name as string) || null,
      industry: (org.industry as string) || null,
      employeeCount: typeof org.num_employees === "number" ? org.num_employees : null,
      annualRevenuePrinted: (org.revenue_range as string) || null,
      description: (org.short_description as string) || null,
      city: (org.city as string) || null,
      state: (org.state as string) || null,
      country: (org.country as string) || null,
      foundedYear: typeof org.founded_year === "number" ? org.founded_year : null,
      websiteUrl: (org.website_url as string) || null,
      linkedinUrl: (org.linkedin_url as string) || null,
      logoUrl: (org.logo_url as string) || null,
      technologies,
      phone: primaryPhone,
    };
  } catch {
    return null;
  }
}

const TOP_SENIORITIES = new Set(["c_suite", "vp", "director"]);

export async function searchContacts(domain: string, apiKey: string): Promise<ApolloContact[]> {
  try {
    const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({
        api_key: apiKey,
        organization_domains: [domain],
        person_seniorities: ["c_suite", "vp", "director", "manager"],
        per_page: 10,
        page: 1,
      }),
    });
    if (!res.ok) return [];

    const data = await res.json() as { people?: Array<Record<string, unknown>> };
    const people = data.people ?? [];

    // Sort: c_suite/vp first
    people.sort((a, b) => {
      const aTop = TOP_SENIORITIES.has((a.seniority as string) ?? "");
      const bTop = TOP_SENIORITIES.has((b.seniority as string) ?? "");
      return aTop === bTop ? 0 : aTop ? -1 : 1;
    });

    return people.map((p) => ({
      id: (p.id as string) || null,
      firstName: (p.first_name as string) || null,
      lastName: (p.last_name as string) || null,
      title: (p.title as string) || null,
      email: (p.email as string) || null,
      phone: (p.sanitized_phone as string) || (p.direct_dial_number as string) || null,
      linkedinUrl: (p.linkedin_url as string) || null,
      seniority: (p.seniority as string) || null,
    }));
  } catch {
    return [];
  }
}
