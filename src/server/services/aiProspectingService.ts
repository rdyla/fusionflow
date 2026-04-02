export interface ProspectContext {
  companyName: string;
  domain: string;
  industry: string | null;
  employeeCount: number | null;
  location: string | null;
  description: string | null;
  technologies: string[];
  ucProvider: string | null;
  ccProvider: string | null;
  annualRevenue: string | null;
}

export interface AIProspectContent {
  whyNow: string;
  companyChallenges: string;
  proposedSolution: string;
  storeRationale: string;
  emailSequence: string;
  talkTrack: string;
  linkedinInmail: string;
}

function buildPrompt(ctx: ProspectContext): string {
  const techList = ctx.technologies.length > 0 ? ctx.technologies.slice(0, 20).join(", ") : "Not detected";
  const location = ctx.location ?? "Unknown";
  const industry = ctx.industry ?? "Unknown";
  const employees = ctx.employeeCount ? ctx.employeeCount.toLocaleString() : "Unknown";
  const revenue = ctx.annualRevenue ? ` | Revenue: ${ctx.annualRevenue}` : "";

  return `You are a sales intelligence analyst for Packet Fusion, a technology solutions provider that sells and implements cloud communications platforms including Zoom Phone, Zoom Contact Center, RingCentral UCaaS/CCaaS, and related AI-powered solutions. We compete against legacy on-premise and first-gen cloud vendors.

Analyze this prospect and generate a targeted sales intelligence report:

COMPANY: ${ctx.companyName}
DOMAIN: ${ctx.domain}
INDUSTRY: ${industry}
EMPLOYEES: ${employees}${revenue}
LOCATION: ${location}
CURRENT TECH STACK: ${techList}
CURRENT UC PROVIDER: ${ctx.ucProvider ?? "Unknown / On-Prem"}
CURRENT CC PROVIDER: ${ctx.ccProvider ?? "None Detected"}
ABOUT: ${ctx.description ?? "N/A"}

Return ONLY valid JSON with exactly these keys. Be specific and actionable — reference the company's industry, size, and tech stack. Avoid generic statements:

{
  "why_now": "3 concise bullet points (each 1-2 sentences) explaining why this company needs to evaluate their communications stack NOW. Reference industry trends, their current vendor's limitations, or growth signals.",
  "company_challenges": "3-4 specific operational or technology pain points this company likely faces given their profile. Be concrete — mention their industry, scale, and current tools.",
  "proposed_solution": "2-3 sentences on what Packet Fusion should lead with (UCaaS migration, CC modernization, AI overlay, full stack consolidation, etc.) and why it fits this specific company.",
  "store_rationale": "2-3 sentences making the business case for a CIO or VP of IT. Focus on TCO reduction, consolidation benefits, compliance, or competitive advantage relevant to their industry.",
  "email_sequence": "Subject: [compelling subject line]\\n\\nHi [First Name],\\n\\n[150-word personalized outreach email from a Packet Fusion AE. Open with a specific insight about their company or industry — not a generic opener. No 'I hope this email finds you well'. Close with a low-friction ask.]\\n\\nBest,\\n[Name]",
  "talk_track": "• [5-6 bullet points for a discovery call opener. Start with a compelling observation about their company/industry. Include 2 open-ended discovery questions. Keep each bullet 1-2 sentences.]",
  "linkedin_inmail": "[280 characters max. Personal and specific — reference something concrete about their company or role. No generic connection requests. Include a subtle hook.]"
}`;
}

export async function generateProspectContent(
  ctx: ProspectContext,
  apiKey: string
): Promise<AIProspectContent | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: buildPrompt(ctx) }],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text;
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;

    return {
      whyNow: parsed.why_now ?? "",
      companyChallenges: parsed.company_challenges ?? "",
      proposedSolution: parsed.proposed_solution ?? "",
      storeRationale: parsed.store_rationale ?? "",
      emailSequence: parsed.email_sequence ?? "",
      talkTrack: parsed.talk_track ?? "",
      linkedinInmail: parsed.linkedin_inmail ?? "",
    };
  } catch {
    return null;
  }
}
