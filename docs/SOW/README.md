# Packet Fusion SOW Generator — Starter Bundle

This is the working reference implementation for an auto-generated Packet Fusion Statement of Work, produced through several iterations against a real customer SOW (Nutech National — Zoom AI Virtual Agent). It's intended as the **starting point** for a templated SOW generator inside the Packet Fusion web app, not a finished system. Treat the code as the visual/structural source of truth, the README as the design rationale, and the hardcoded customer values as placeholders to be parameterized.

---

## Quick start

```bash
npm install
npm run build
```

Output: `Nutech_National_ZVA_SOW.docx` in the same directory.

To preview as PDF for visual checks (requires LibreOffice):

```bash
soffice --headless --convert-to pdf Nutech_National_ZVA_SOW.docx
```

---

## What's in the bundle

| File | Purpose |
|---|---|
| `build.js` | Single-file SOW generator. ~700 lines. Defines brand constants, helper functions, all sections, and document assembly. |
| `logo-fullcolor.png` | Packet Fusion full-color logo, transparent PNG, 797×313, RGBA. Embedded in the cover. |
| `package.json` | Dependencies (just `docx`). |
| `README.md` | This file. |

---

## Design decisions worth preserving

These were learned the hard way over the iteration that produced this. Don't undo them without a reason.

### Brand: "Packet Fusion" (two words)

The legal entity is **Packet Fusion, Inc.** Always written with a space. Never `PacketFusion`, never `Packet-Fusion`, never lowercase. The brand skill at `/mnt/skills/organization/packetfusion-brand/SKILL.md` (in the Claude environment) is canonical; in a web-app deploy, copy those values into a constants file.

### Brand colors (centralized at top of build.js)

```js
const NAVY  = "003B5C"; // primary
const GREEN = "17C662"; // accent
const BLUE  = "63C1EA"; // secondary (not currently used heavily)
const GREY  = "D9E1E2"; // backgrounds, dividers
```

These are hex without the leading `#` because that's the format docx-js wants.

### Cover bar pattern: single-cell table, NOT stacked shaded paragraphs

The cover's grey bar with the logo is implemented as a one-row, one-cell `Table` with `shading: { fill: GREY }`. We tried stacking three shaded `Paragraph`s with the logo in the middle one — it was technically valid OOXML and rendered fine in Word/LibreOffice, but **broke Claude.ai's preview engine**. The single-cell-table pattern works everywhere. Apply this lesson to any future banner/divider blocks.

### Signature block: paragraph borders, not typed underscores

The legacy SOW used `_______________________________` text strings for signature lines. The modern version uses paragraphs with `border: { bottom: { ... } }` — gives you a real horizontal rule that doesn't shift if the font changes. See the `sigField()` helper. Eyebrow labels ("CUSTOMER" / "SERVICE PROVIDER") are tracked-out small caps in green. Company names below are large navy bold.

### Pagination rules — baked into the helpers

These three rules avoid the most common SOW pagination ugliness:

1. **All `TableRow`s have `cantSplit: true`** — prevents a row from being broken mid-cell across a page boundary.
2. **All headings (`h1/h2/h3` helpers) have `keepNext: true` and `keepLines: true`** — keeps a heading from being orphaned at the bottom of a page without its content.
3. **All bullets (`bullet` helper) have `keepNext: true`** — keeps a list together so you don't get a single orphan bullet at the top of a page.

For sections where a heading + table genuinely won't fit on the current page (e.g. Solution Sizing, Implementation Timeline), use `h2("Heading", { breakBefore: true })` to force a clean page start. The `breakBefore` option is already wired up in the `h2` helper.

### Logo handling

Read the logo as a Buffer relative to the script: `fs.readFileSync(__dirname + "/logo-fullcolor.png")`. **Don't** ask the user to upload it each time — store it in repo. Aspect ratio is 2.55:1; current embed is 192×75 px (≈2 inches wide). If you change dimensions, preserve the aspect ratio.

---

## What needs parameterizing for the web app

Everything customer-specific is currently hardcoded for Nutech National. The natural input shape from your estimator looks roughly like:

```ts
type SOWPayload = {
  customer: {
    name: string;              // "Nutech National"
    legalEntity?: string;      // optional formal legal name
    programOwner: string;      // "Joseph McGugan"
    signoffRole: string;       // "Operations Manager"
  };
  engagement: {
    productLine: "ZVA" | "UCaaS" | "CCaaS" | ...;
    title: string;             // "Zoom AI Virtual Agent Deployment"
    dateIssued: string;        // "April 24, 2026"
    objectives: {
      businessGoals: string[];
      problemsToSolve: string[];
      successAt90Days: string;
      successAt6To12Months: string;
    };
  };
  sizing: {
    channels: string[];        // ["Voice (IVR)"]
    intents: string;           // "1–10"
    monthlySessions: number;
    sites: number;
    goLives: number;
    liveAgentEscalation: boolean;
    implementationStrategy: string;  // "Cloud Professional"
    crmIntegration?: string;   // optional, marked TBD if missing
    platformNotes?: string;
  };
  workstreams: Array<{
    name: string;
    deliverables: string;
    hours: number;
  }>;
  pricing: {
    blendedRate: number;       // $/hr — currently a $165 placeholder
    paymentTerms: "50/50" | "40/40/20";
  };
  timeline: Array<{
    week: string;
    phase: string;
    activities: string;
    milestone: string;
  }>;
  prerequisites: { label: string; value: string }[];
  customerResponsibilities: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
};
```

Things flagged as `[PLACEHOLDER:` or `[TO CONFIRM —` in the rendered doc need real values before any SOW goes to a customer.

---

## Suggested templating direction

The current `build.js` is monolithic. When you split this for the web app, the natural shape is:

```
shared/
  brand.js         // NAVY, GREEN, BLUE, GREY, font names, etc.
  helpers.js       // h1, h2, h3, p, bullet, cell, headerCell, sigField, spacer
  cover.js         // grey bar + logo + facts row + MSA paragraph
  signature.js     // the modern signature block
  footer.js        // page numbers + confidentiality line
  pagination.js    // helpers that already encode cantSplit / keepNext rules

templates/
  zva.js           // Zoom Virtual Agent — workstreams, prereqs, out-of-scope, etc.
  ucaas.js         // UCaaS implementations — different prereqs (network readiness, porting, E911, etc.)
  ccaas.js         // CCaaS — different again
  ...

renderer.js       // takes (payload, templateName) → emits docx Buffer
```

Two architectural decisions to make early:

1. **Read brand constants at render time vs. snapshot them?** If you read the brand skill at render time, brand changes propagate automatically — but old SOWs may render differently if regenerated. Snapshotting keeps old SOWs stable. Recommendation: snapshot brand values into a versioned constants file, bump version when the brand changes.

2. **Per-product T's & C's: separate templates or shared template + product overrides?** ZVA, UCaaS, and CCaaS share ~70% of the SOW (cover, signature, payment terms, change-order language). They differ on workstreams, prerequisite content, and out-of-scope items. A shared base template with product modules is cleaner than three full templates that drift apart over time.

---

## Iteration history (so you don't relearn these)

This bundle is the result of working through:

- A first draft from the estimator that had `voice_ivr`-style enum codes, "Joeph McGugan" typos, and pricing of "81 hours" (no rate, no total)
- Brand styling pulled from a separate brand-guidelines skill (which had the company name spelled wrong — fixed in the latest version)
- A logo handoff that went through three versions (original RGBA-but-actually-white-background → black-background "removebg" output → pure-black-stripped-to-true-RGBA — the version shipped here)
- Three rounds of pagination fixes targeting Solution Sizing, the Timeline table, and orphan bullets in Out-of-Scope
- Signature block redesign from typed-underscores ("we made this 20 years ago") to bottom-bordered paragraph fields with eyebrow labels

The result is the file you have now. Extending it is much easier than recreating it.

---

## Known placeholders in the current rendered output

- **Hourly rate of $165/hr** (red placeholder note in section 3) — this is a default from a previous SOW (Osborn School District). Replace with your current rate card before any actual customer release.
- **CRM Integration: [TO CONFIRM]** — the estimator returned `CRM: other` with no system name; the template flags this for Discovery clarification.
- **Calendar dates in the timeline** — currently described as "Week 1 / Week 2 / etc." with a note that calendar dates are finalized at kickoff. The web app should accept a kickoff date and compute weeks from there.

---

Questions, corrections, or "why did we do it this way" — the build.js is heavily commented and the brand skill SKILL.md has the canonical brand values.
