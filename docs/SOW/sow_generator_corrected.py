#!/usr/bin/env python3
"""
Ionis Pharmaceuticals — Zoom Contact Center SOW generator.
One source, two options. Corrections applied per the 14 Aug review:
  FIX-1  Chat scope language conditional on the option (was present in the voice-only SOW)
  FIX-2  AI Expert Assist described in scope, services, and deliverables (was revision-history only)
  FIX-3  Section cross-references corrected (9.2->8.2, 11->10, 10->9)
  FIX-4  Site acceptance no longer conditional on porting / E911 where porting is not in scope
  FIX-5  Status changed to option-for-selection; both cannot be "Final"
  FIX-6  Browser print headers/footers removed; real running footer added
  FIX-7  Porting-dependent Customer responsibilities qualified
  FIX-8  Revision history completed
"""
import base64, pathlib, sys

HERE = pathlib.Path(__file__).parent
COVER_B64 = base64.b64encode((HERE / 'cover.jpg').read_bytes()).decode()

NAVY, GREEN, BLUE, INK, MUTED = '#003B5C', '#17C662', '#63C1EA', '#1c2b33', '#5b6b75'

# ------------------------------------------------------------------ options
OPTIONS = {
    'A': dict(
        opt='A', ver='V5.1', price='$17,500.00',
        workflows=1, workflows_word='one',
        channels='Voice',
        title='Zoom Virtual Agent (Voice) + AI Expert Assist',
        chat=False,
        summary_line='One virtual agent workflow on the voice channel, plus AI Expert Assist for live agents.',
    ),
    'B': dict(
        opt='B', ver='V6.1', price='$26,000.00',
        workflows=2, workflows_word='two',
        channels='Voice and web chat',
        title='Zoom Virtual Agent (Voice + Chat) + AI Expert Assist',
        chat=True,
        summary_line='Two virtual agent workflows — voice and web chat — plus AI Expert Assist for live agents.',
    ),
}

CSS = f"""
@page {{
  size: Letter; margin: 0.85in 0.8in 0.75in 0.8in;
  @bottom-left {{ content: "Packet Fusion  ·  Confidential"; font-family: Georgia, 'Bitstream Charter', serif;
                  font-size: 7.5pt; color: {MUTED}; }}
  @bottom-center {{ content: "SOW — Ionis Pharmaceuticals"; font-family: Georgia, 'Bitstream Charter', serif;
                    font-size: 7.5pt; color: {MUTED}; }}
  @bottom-right {{ content: counter(page) " / " counter(pages); font-family: Georgia, 'Bitstream Charter', serif;
                   font-size: 7.5pt; color: {MUTED}; }}
}}
@page cover {{ margin: 0; @bottom-left {{ content: none }} @bottom-center {{ content: none }}
               @bottom-right {{ content: none }} }}

* {{ box-sizing: border-box; }}
body {{ font-family: Georgia, 'Bitstream Charter', 'DejaVu Serif', serif; font-size: 10pt; line-height: 1.5;
        color: {INK}; margin: 0; }}

/* ---------- cover ---------- */
.cover {{ page: cover; position: relative; height: 11in; width: 8.5in;
          background: {NAVY}; overflow: hidden; }}
.cover img.art {{ position: absolute; right: 0; bottom: 0; width: 100%; height: 100%;
                  object-fit: cover; opacity: 0.92; }}
.cover .scrim {{ position: absolute; inset: 0;
    background: linear-gradient(105deg, rgba(0,22,38,0.94) 0%, rgba(0,28,46,0.62) 42%, rgba(0,28,46,0.12) 100%); }}
.cover .inner {{ position: absolute; inset: 0; padding: 0.95in 0.85in; }}
.cover .brandrow {{ display: flex; justify-content: space-between; align-items: baseline; }}
.cover .pf {{ font-size: 15pt; letter-spacing: 0.16em; color: #fff; font-weight: bold; }}
.cover .pf span {{ color: {GREEN}; }}
.cover .conf {{ font-size: 7.5pt; letter-spacing: 0.34em; color: #cfe0ea; }}
.cover hr {{ border: 0; border-top: 1px solid rgba(255,255,255,0.30); margin: 14pt 0 0 0; }}
.cover h1 {{ font-size: 44pt; line-height: 1.04; color: #fff; margin: 1.55in 0 0 0; font-weight: bold;
             letter-spacing: -0.01em; }}
.cover .sub {{ font-size: 15.5pt; color: {GREEN}; margin-top: 9pt; }}
.cover .optbadge {{ display: inline-block; margin-top: 26pt; padding: 5pt 11pt;
    border: 1px solid {GREEN}; color: {GREEN}; font-size: 8.5pt; letter-spacing: 0.20em; }}
.cover .prep {{ margin-top: 30pt; color: #fff; font-size: 12.5pt; font-weight: bold; }}
.cover .meta {{ color: #b9cfdc; font-size: 10pt; margin-top: 5pt; }}

/* ---------- typography ---------- */
h2 {{ font-size: 16pt; color: {NAVY}; border-bottom: 2px solid {GREEN}; padding-bottom: 4pt;
      margin: 24pt 0 10pt; page-break-after: avoid; }}
h3 {{ font-size: 11.5pt; color: {NAVY}; margin: 15pt 0 5pt; page-break-after: avoid; }}
h4 {{ font-size: 10pt; color: #2f4854; margin: 11pt 0 3pt; page-break-after: avoid; }}
p {{ margin: 0 0 7pt; }}
ul {{ margin: 0 0 8pt; padding-left: 15pt; }}
li {{ margin-bottom: 3.5pt; }}
.lede {{ font-size: 10.5pt; }}
.small {{ font-size: 8.5pt; color: {MUTED}; }}
.mono {{ font-family: 'DejaVu Sans Mono', monospace; font-size: 8.5pt; }}

table {{ width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 9pt; }}
th {{ background: {NAVY}; color: #fff; text-align: left; padding: 5pt 7pt; font-weight: bold;
      font-size: 8.5pt; }}
td {{ padding: 5pt 7pt; border-bottom: 1px solid #dbe4e9; vertical-align: top; }}
tr:nth-child(even) td {{ background: #f6f9fa; }}
td.num, th.num {{ text-align: right; white-space: nowrap; }}
tr.total td {{ font-weight: bold; background: #eef4f7; border-top: 2px solid {NAVY}; }}

.kpis {{ display: flex; gap: 8pt; margin: 10pt 0 14pt; }}
.kpi {{ flex: 1; border: 1px solid #dbe4e9; background: #f6f9fa; padding: 10pt 6pt;
        text-align: center; }}
.kpi b {{ display: block; font-size: 21pt; color: {NAVY}; line-height: 1; }}
.kpi span {{ display: block; font-size: 6.8pt; letter-spacing: 0.09em; color: {MUTED};
             margin-top: 5pt; text-transform: uppercase; }}

.callout {{ border-left: 4px solid {GREEN}; background: #eef9f3; padding: 9pt 12pt; margin: 11pt 0; }}
.callout.blue {{ border-left-color: {BLUE}; background: #eef4f9; }}
.callout .lbl {{ font-size: 7.5pt; letter-spacing: 0.16em; color: {NAVY}; font-weight: bold;
                 display: block; margin-bottom: 5pt; }}
.callout p:last-child {{ margin-bottom: 0; }}

.docctl td:first-child {{ width: 30%; font-weight: bold; color: {NAVY}; background: #f6f9fa; }}
.sig {{ display: flex; gap: 30pt; margin-top: 18pt; }}
.sig div {{ flex: 1; }}
.sigline {{ border-bottom: 1px solid #7d8f99; height: 26pt; margin-bottom: 3pt; }}
.avoid {{ page-break-inside: avoid; }}
"""


def rows(data):
    return "\n".join(
        "<tr>" + "".join(f'<td{c[1]}>{c[0]}</td>' if isinstance(c, tuple) else f"<td>{c}</td>"
                         for c in r) + "</tr>" for r in data)


def build(o):
    chat = o['chat']
    # ---- FIX-1: channel-conditional language -------------------------------
    if chat:
        ch_scope = ("Voice and web chat channels enabled and validated. Each channel is configured "
                    "as its own virtual agent workflow.")
        ch_wire = "Wire the voice and web chat channels and confirm grammars / NLU coverage."
        ch_test = ("Run test conversations covering the in-scope use cases on both the voice and web "
                   "chat channels.")
        ch_eng = ("Voice and web chat channel wiring — IVR overlay for voice, web chat widget "
                  "deployment, and mobile SDK integration where in scope.")
        ch_intents = "Inventory candidate intents drawn from historical call and chat reasons."
        ch_ctx = "CRM context API — surface caller and chat context for downstream review."
        ch_out = None
    else:
        ch_scope = ("Voice channel only. One virtual agent workflow on voice. Web chat is not in scope "
                    "under this option — see Section 4.")
        ch_wire = "Wire the voice channel and confirm grammars / NLU coverage."
        ch_test = "Run test conversations covering the in-scope use cases on the voice channel."
        ch_eng = "Voice channel wiring — IVR overlay and voice entry-point configuration."
        ch_intents = "Inventory candidate intents drawn from historical call reasons."
        ch_ctx = "CRM context API — surface caller context for downstream review."
        ch_out = ("Web chat virtual agent workflow, web chat widget deployment, and chat channel "
                  "wiring. Available under Option B or by change order under Section 9.")

    # ---- scope at a glance -------------------------------------------------
    scope = [
        ["Locations", "1", "Discrete physical sites in scope for cutover."],
        ["Zoom Contact Center agents", "10", "Agent licensing in scope; supervisor and admin profiles configured."],
        ["Virtual agent workflows", str(o['workflows']),
         ("Voice and web chat, each configured as its own workflow." if chat
          else "Voice only. One workflow.")],
        ["AI Expert Assist", "Included",
         "Real-time knowledge surfacing and response suggestions for live agents. Configured against "
         "the same knowledge sources as the virtual agent. See Section 2.4.3."],
        ["Channels", o['channels'], ch_scope],
        ["Queues, skills, and call flows", "Per design",
         "Validated against the legacy contact-center configuration where one exists."],
        ["Intent library", "Per design", "Trained intents drawn from the Customer's call-deflection priorities."],
        ["CRM / business-system integrations", "Per design",
         "Salesforce, HubSpot, Microsoft Dynamics, or equivalent — Customer provides API access."],
        ["Knowledge sources", "Per design",
         "Ingested knowledge bases and FAQ corpora referenced by both the virtual agent and AI Expert Assist."],
        ["Call recording configuration", "Included", "Retention windows and access permissions confirmed during design."],
        ["Reporting and supervisor dashboards", "Standard library",
         "Customer-specific dashboards available as an optional service."],
        ["Fallback and escalation paths", "Included", "Live-agent handoff and after-hours fallback flows confirmed."],
        ["Go-Live events", "1", "One per site, sequenced per the agreed migration plan."],
        ["End-user training", "Self-paced", "Vendor video and knowledge-base library; instructor-led optional."],
        ["Administrative training", "Included", "Knowledge transfer to Customer system administrators."],
    ]

    stages = [
        ["1", "Initiation", "Project start", "Establish team, internal assets, and the kickoff. Confirm scope, schedule, and tenant access."],
        ["2", "Planning", "6–8 weeks pre Go-Live", "Assessment and design, training plan, and communications strategy."],
        ["3", "Executing", "4–5 weeks pre Go-Live", "Build and provision the tenant, build the bot and AI Expert Assist, coordinate training dates."],
        ["4", "Monitoring / Controlling", "2–3 weeks pre Go-Live", "Execute UAT and intent validation, obtain UAT sign-off."],
        ["5", "Go Live / Production", "1 week pre and Go-Live", "Go/No-Go readiness, deliver training, run the Go-Live event, Day 1 support."],
        ["6", "Closing", "Post Go-Live", "Lessons learned, project closure, transition to CSM."],
    ]

    delivs = [
        ["D1", "Project Plan &amp; RAID Log", "Smartsheet / PDF", "Plan reflects scope, milestones, owners, and dependencies; reviewed and acknowledged in writing by Customer PM."],
        ["D2", "Implementation Workbook", "Excel", "All users, configuration, and feature assignments populated and approved by Customer authorized signer."],
        ["D3", "Queue, Flow &amp; Skill Design Package", "PDF / Visio", "All in-scope queues, IVR and call flows, skill assignments, and routing rules depicted; approved by Customer authorized signer."],
        ["D4", "Bot Persona + Conversation Design", "PDF",
         ("Persona, voice, conversation trees for both the voice and chat workflows, disambiguation prompts, and fallback flows approved by Customer authorized signer."
          if chat else
          "Persona, voice, voice conversation tree, disambiguation prompts, and fallback flows approved by Customer authorized signer.")],
        ["D5", "AI Expert Assist Configuration Summary", "PDF",
         "Documents the knowledge sources connected to AI Expert Assist, the agent-facing surfaces enabled, and the supervisor visibility configured; approved by Customer authorized signer."],
        ["D6", "CRM Integration Design", "PDF", "Documents the API integration design — screen pop fields, contact-lookup keys, activity-logging template; approved by Customer authorized signer."],
        ["D7", "Intent Library", "Platform export", "Trained intents covering the in-scope use cases; signed off by Customer reviewer."],
        ["D8", "Network Readiness Review", "PDF + test screenshots", "Customer runs the platform's network-readiness test at each in-scope site and submits results to Packet Fusion. Packet Fusion documents findings, identified risks, and remediation owners; Customer acknowledges remediation responsibilities."],
        ["D9", "UAT Plan &amp; Results", "PDF / Excel", "All planned test cases executed; pass/fail results recorded; Customer authorized signer accepts UAT results."],
        ["D10", "Go-Live Confirmation", "Sign-off form", "Cutover confirmed by Customer site lead; outstanding items captured for Day 1 Support follow-up."],
        ["D11", "Final Solution Design Report", "PDF", "Documents as-built configuration, integrations, and admin procedures; delivered at or before project closure."],
        ["D12", "Administrator Knowledge Transfer", "Live session + recording", "Recorded session covers admin portal, user and agent lifecycle, configuration edits, AI Expert Assist tuning, and reporting; Customer acknowledges completion."],
        ["D13", "Project Closure Memo", "PDF", "Confirms project closure and CSM transition, and lists any deferred items for future change orders."],
    ]

    oos = [
        "Design, procurement, configuration, or remediation of Customer LAN/WAN infrastructure.",
        "Quality of Service (QoS) policy design or configuration on Customer network equipment.",
        "Firewall, ACL, or NAT/SBC configuration on Customer-owned network equipment.",
        "Installation or configuration of software on Customer end-user PCs or mobile devices.",
        "Customization of individual user endpoints or phone settings beyond the standard profile.",
        "Decommissioning, removal, or disposal of legacy equipment or services.",
        "Configuration, diagnostics, or troubleshooting of the Customer's legacy premise PBX.",
        "Customer mobile-device management (MDM) configuration, diagnostics, or troubleshooting.",
        "Recording, production, or sourcing of greeting prompts, hold music, or IVR audio.",
        "Data migration from legacy voicemail, call recording, or analytics systems.",
        "Workforce Management (WFM) and Quality Management (QM) integration, unless added by change order.",
        "Authoring of new knowledge-base content. Packet Fusion ingests and connects existing sources; content creation remains with the Customer.",
    ]
    if ch_out:
        oos.insert(0, ch_out)

    resp_data = [
        "Procure Customer Service Records (CSRs) from the existing carrier(s), where number porting is in scope.",
        "Provide service addresses, authorized contacts, and Billing Telephone Number (BTN) for each carrier account, where number porting is in scope.",
        "Supply Letters of Authorization (LOAs) signed by an authorized signer for each port order, where number porting is in scope.",
        "Provide accurate Registered E911 address and location information for each user and device, where physical devices or user-assigned numbers are in scope.",
        "Supply pre-recorded greetings, IVR prompts, and hold-music files in the formats required by the vendor.",
        "Provide SSO metadata (IdP) and any directory-sync configuration.",
        "Identify and grant access to the knowledge sources to be ingested for the virtual agent and AI Expert Assist, and nominate an owner for each source.",
    ]

    optional = [
        ("Additional CRM integration build beyond the in-scope system", "Per integration", "By quote"),
        ("Custom reporting / supervisor dashboard build", "Per dashboard", "By quote"),
        ("Live remote instructor-led training session (up to 20 attendees per session)", "Per session", "$290.00"),
    ]
    if not chat:
        optional.insert(0, ("Add the web chat virtual agent workflow (equivalent to Option B)",
                            "One-time", "$8,500.00"))

    tl = [["Initiation &amp; Kickoff", "Week 1"],
          ["Planning — Assessment and Design", "Weeks 1–4"],
          ["Executing — Tenant, Bot, and AI Expert Assist Build", "Weeks 4–7"],
          ["Monitoring / Controlling — UAT and Intent Validation", "Weeks 7–9"],
          ["Go-Live &amp; Day 1 Support", "Week 10"],
          ["Closure &amp; CSM Transition", "Week 11"]]

    rev = [["V1", "August 13, 2026", "Ryan Dyla", "Initial SOW"],
           ["V2", "August 13, 2026", "Ryan Dyla", "Scope and pricing revisions following internal review"],
           ["V3", "August 14, 2026", "Ryan Dyla", "Zoom Virtual Agent added on the voice channel"],
           ["V4", "August 14, 2026", "Ryan Dyla", "Virtual agent on voice and chat, plus AI Expert Assist"],
           ["V5", "August 14, 2026", "Ryan Dyla", "Voice-only variant with AI Expert Assist"],
           ["V6", "August 14, 2026", "Ryan Dyla", "Voice and chat variant with AI Expert Assist"],
           ["V5.1 / V6.1", "August 14, 2026", "Ryan Dyla",
            "Editorial and scope-consistency pass across both variants: channel scope language aligned "
            "to each option, AI Expert Assist documented in scope and deliverables, section "
            "cross-references corrected, site acceptance criteria scoped to this engagement, and the "
            "two variants restated as Option A and Option B for Customer selection."]]

    aea_para = (
        "AI Expert Assist supports live agents rather than deflecting contacts. During a live interaction it "
        "surfaces relevant knowledge-base content and suggested responses to the agent in real time, drawing "
        "on the same knowledge sources configured for the virtual agent. It is included in both options under "
        "this SOW and is configured once, independent of the number of virtual agent workflows.")

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SOW — Ionis Pharmaceuticals — Option {o['opt']}</title>
<style>{CSS}</style></head><body>

<!-- ============ COVER ============ -->
<div class="cover">
  <img class="art" src="data:image/jpeg;base64,{COVER_B64}">
  <div class="scrim"></div>
  <div class="inner">
    <div class="brandrow"><div class="pf">PACKET<span>FUSION</span></div>
      <div class="conf">CONFIDENTIAL</div></div>
    <hr>
    <h1>STATEMENT<br>OF WORK</h1>
    <div class="sub">{o['title']}</div>
    <div class="optbadge">OPTION {o['opt']}</div>
    <div class="prep">Prepared for Ionis Pharmaceuticals</div>
    <div class="meta">August 14, 2026 &nbsp;·&nbsp; {o['ver']} &nbsp;·&nbsp; {o['price']}</div>
  </div>
</div>

<!-- ============ DOCUMENT CONTROL ============ -->
<h2>Document Control</h2>
<table class="docctl">
<tr><td>Prepared for</td><td>Ionis Pharmaceuticals</td></tr>
<tr><td>Prepared by</td><td>Packet Fusion, Inc.<br>Ryan Dyla, Solution Architect<br>rdyla@packetfusion.com</td></tr>
<tr><td>SOW number</td><td>{o['ver']} — Option {o['opt']}</td></tr>
<tr><td>Issue date</td><td>August 14, 2026</td></tr>
<tr><td>Project reference</td><td>Zoom Contact Center Implementation — Ionis Pharmaceuticals</td></tr>
<tr><td>Status</td><td><b>For Customer review and selection.</b> This is one of two priced options.
  Options A and B are mutually exclusive; the option Ionis selects becomes the SOW presented for signature.</td></tr>
<tr><td>Total fee</td><td><b>{o['price']}</b> fixed fee</td></tr>
</table>

<h3>Revision History</h3>
<table><tr><th style="width:11%">Version</th><th style="width:15%">Date</th><th style="width:12%">Author</th><th>Description of change</th></tr>
{rows(rev)}</table>

<p class="small"><b>Confidentiality notice.</b> This document contains confidential and proprietary
information of Packet Fusion, Inc. and the Customer named above. It is provided solely for the purpose of
evaluating and executing the services described herein and may not be reproduced, distributed, or
disclosed to any third party without the prior written consent of Packet Fusion.</p>

<!-- ============ EXEC SUMMARY ============ -->
<h2>Executive Summary</h2>
<p class="lede">Packet Fusion is pleased to partner with <b>Ionis Pharmaceuticals</b> (the "Customer") on
the deployment of <b>Zoom Contact Center Professional Services</b>. This Statement of Work ("SOW")
defines the services, deliverables, schedule, fees, and shared responsibilities for that engagement.</p>
<p>Our objective is a seamless cutover to the new platform — completed on schedule, with verified service
quality, with users prepared to be productive on day one, and with a documented hand-off to Customer
administrators for ongoing operation.</p>

<div class="callout"><span class="lbl">OPTION {o['opt']} — WHAT THIS SOW COVERS</span>
<p>{o['summary_line']} Both options include the full contact-center build, CRM integration, knowledge
source ingestion, UAT, training, and go-live support described in Section 2. The options differ only in the
number of virtual agent workflows and the corresponding fee.</p></div>

<h3>Engagement Snapshot</h3>
<div class="kpis">
  <div class="kpi"><b>1</b><span>Location</span></div>
  <div class="kpi"><b>10</b><span>Contact Center Agents</span></div>
  <div class="kpi"><b>{o['workflows']}</b><span>Virtual Agent Workflows</span></div>
  <div class="kpi"><b>1</b><span>Go-Live Event</span></div>
</div>

<h3>Pricing Summary</h3>
<table><tr><th>Item</th><th class="num">Fee</th></tr>
<tr><td>Professional Services — Option {o['opt']}</td><td class="num">{o['price']}</td></tr>
<tr class="total"><td>Project total</td><td class="num">{o['price']}</td></tr></table>
<p class="small">Optional services are listed in Section 2.10 and priced in Section 8.2, and may be added
by mutual written agreement.</p>

<!-- ============ 1 ============ -->
<h2>1. Engagement Overview</h2>
<h3>1.1 About This SOW</h3>
<p>This SOW is executed by Packet Fusion, Inc. ("Packet Fusion") and Ionis Pharmaceuticals (the
"Customer") under, and is subject to, the Packet Fusion Master Services Agreement (the "MSA") executed
between the parties. Capitalized terms used but not defined herein have the meanings given in the MSA.
In the event of any conflict between this SOW and the MSA, the MSA controls except where this SOW
expressly states otherwise.</p>

<h3>1.2 Business Objectives</h3>
<p>The Customer is engaging Packet Fusion to achieve the following outcomes:</p>
<ul>
<li>Consolidate communications on a single, cloud-delivered platform.</li>
<li>Improve reliability and service quality through verified network readiness and a managed cutover.</li>
<li>Reduce administrative overhead by standardizing call flows, user profiles, and policies.</li>
<li>Deflect routine, repeatable contacts to a virtual agent so live agents handle higher-value work.</li>
<li>Shorten handle time and improve first-contact resolution by surfacing knowledge to agents in real time.</li>
<li>Provide a documented configuration and trained administrators capable of ongoing operation.</li>
</ul>

<h3>1.3 Scope at a Glance</h3>
<table><tr><th style="width:24%">Element</th><th style="width:13%">Quantity</th><th>Notes</th></tr>
{rows(scope)}</table>

<!-- ============ 2 ============ -->
<h2>2. Scope of Services</h2>
<h3>2.1 Delivery Methodology</h3>
<p>Packet Fusion delivers cloud migrations using a PMI-aligned phased methodology. Each stage has
defined activities, owners, and exit criteria; the project does not advance from one stage to the next until
exit criteria are met and confirmed in writing (email is acceptable). This engagement is sized for
approximately eleven calendar weeks from project initiation through closure, with variation based on
Customer readiness and the volume of knowledge content to be ingested.</p>
<table><tr><th style="width:6%">#</th><th style="width:20%">Stage</th><th style="width:22%">When</th><th>Purpose</th></tr>
{rows(stages)}</table>

<h3>2.2 Stage 1 — Initiation</h3>
<p>Packet Fusion assigns a dedicated Project Manager (PM) and Implementation Engineer (IE) and
establishes the working environment for the project before the customer-facing kickoff.</p>
<h4>2.2.1 Resource assignment</h4>
<ul><li>Assign Packet Fusion Project Manager (PM) as the Customer's single point of contact.</li>
<li>Assign Packet Fusion Implementation Engineer (IE) responsible for technical delivery.</li></ul>
<h4>2.2.2 Project workspace</h4>
<p>Packet Fusion uses its Cloud Connect portal as the single workspace for project artifacts, documents,
and ongoing collaboration with the Customer team.</p>
<ul>
<li>Cloud Connect project workspace provisioned for the engagement; access invitations sent to the
Customer Project Manager, Technical Lead, and authorized signer.</li>
<li>Document workspace (SharePoint folder, surfaced inside Cloud Connect) created for SOWs,
workbooks, network test results, and design artifacts.</li>
<li>Contract and SOW reviewed by the assigned PM.</li></ul>
<h4>2.2.3 Kickoff</h4>
<ul>
<li>Customer kickoff scheduled within five (5) business days of project assignment. The PM delivers the
kickoff deck, an AI-generated meeting summary is shared, recurring cadence meetings are scheduled,
and the first technical session is calendared.</li>
<li>Packet Fusion admin profile confirmed in the Customer's tenant.</li>
<li>On request post-kickoff, a shared collaboration channel can be established between the Packet Fusion
project team and the Customer team for day-to-day work outside scheduled meetings.</li></ul>

<h3>2.3 Stage 2 — Planning</h3>
<p>Planning typically begins 6–8 weeks before the target Go-Live date. Contact center design and
integration work streams run in parallel.</p>
<h4>2.3.1 Queue, flow, and skill design</h4>
<ul>
<li>Inventory the legacy contact-center configuration (queues, IVR menus, after-hours and holiday hours,
skill assignments) where one exists.</li>
<li>Design call queues with target service levels and overflow / fallback rules.</li>
<li>Design IVR and call flows with menu options, business-hours logic, and exception paths.</li>
<li>Design skill-based routing and agent groups.</li>
<li>Customer signs off on the queue / flow / skill design before tenant build begins.</li></ul>
<h4>2.3.2 Bot persona and conversation design</h4>
<ul>
<li>Confirm the use cases the virtual agent should handle (top deflection candidates).</li>
<li>Design the bot persona — name, voice, tone, fallback language.</li>
<li>Map the conversation tree for each use case, including disambiguation and confirmation prompts.</li>
<li>Identify live-agent handoff triggers and the queues that receive transferred conversations.</li></ul>
<h4>2.3.3 AI Expert Assist design</h4>
<ul>
<li>Confirm which knowledge sources AI Expert Assist draws on, and whether that set differs from the
virtual agent's set.</li>
<li>Confirm the agent-facing surfaces enabled and the supervisor visibility required.</li>
<li>Agree the acceptance measure to be used at UAT for suggestion relevance.</li></ul>
<h4>2.3.4 CRM and business-system integrations</h4>
<ul>
<li>Identify CRM(s) in scope (Salesforce, HubSpot, Microsoft Dynamics, Zendesk, ServiceNow, or equivalent).</li>
<li>Confirm API access, OAuth scopes, and data mapping (contact lookup, screen pops, activity logging).</li>
<li>Document the integration design and sequence integration work in the Executing stage.</li></ul>
<h4>2.3.5 Knowledge sources and intent library</h4>
<ul>
<li>Identify the knowledge bases, FAQs, and corpora to ingest.</li>
<li>Confirm refresh cadence and a named owner for each source.</li>
<li>{ch_intents}</li>
<li>Define language coverage and the fallback when an unsupported language is detected.</li></ul>
<h4>2.3.6 Call recording and retention</h4>
<ul>
<li>Confirm recording scope (always-on, on-demand, agent-pause), retention windows, and access permissions.</li>
<li>Confirm any PCI / PII redaction requirements and the rules that drive pause-and-resume.</li>
<li>Document storage destination (vendor cloud or customer-provided) and access controls.</li></ul>
<h4>2.3.7 Training planning</h4>
<ul><li>Confirm end-user and agent training count and audience.</li>
<li>Confirm the administrator training plan.</li></ul>
<h4>2.3.8 Change management and end-user enablement</h4>
<p>Packet Fusion helps the Customer drive adoption with a light-weight change-management approach
focused on user readiness, not just compliance communications.</p>
<ul>
<li>Joint review of the Customer's change-management approach (stakeholders, audiences, key messages,
training plan).</li>
<li>End-user and agent communication templates provided (pre-cutover save-the-date, what-to-expect,
training links, day-of cheatsheet); the Customer adapts and sends them under their brand.</li>
<li>Self-paced training resource library curated for the Customer's audience mix; Customer Champions
and IT identified for first-line questions.</li>
<li>Optional instructor-led training sessions are scoped under Section 2.8 if the Customer wants live
coverage in addition to self-paced resources.</li></ul>

<h3>2.4 Stage 3 — Executing</h3>
<h4>2.4.1 Tenant build</h4>
<ul>
<li>Build queues, IVR and call flows, and skill assignments per the validated design.</li>
<li>Configure business hours, holiday calendars, and overflow routing rules.</li>
<li>Assign agent licenses, supervisor profiles, and admin roles.</li>
<li>Apply call-recording configuration including any pause-and-resume rules.</li></ul>
<h4>2.4.2 Bot build and intent training</h4>
<ul>
<li>Build the bot persona per the Planning-stage design.</li>
<li>Ingest the knowledge sources and train the intent library.</li>
<li>{ch_wire}</li>
<li>Build live-agent handoff to the agreed queues.</li></ul>
<h4>2.4.3 AI Expert Assist build</h4>
<ul>
<li>Enable AI Expert Assist for the in-scope agent population and connect the agreed knowledge sources.</li>
<li>Configure the agent-facing surfaces and the supervisor visibility agreed in Planning.</li>
<li>Tune suggestion relevance against a representative set of interactions.</li></ul>
<h4>2.4.4 Integrations</h4>
<ul>
<li>Build the in-scope CRM integration(s) per the Planning-stage design.</li>
<li>Validate screen pops, contact lookups, and activity logging end-to-end.</li>
<li>Configure SSO and SCIM / directory synchronization.</li></ul>
<h4>2.4.5 Training coordination</h4>
<ul><li>Packet Fusion PM coordinates the training schedule with the Packet Fusion Trainer.</li>
<li>Customer finalizes training dates.</li></ul>

<h3>2.5 Stage 4 — Monitoring / Controlling</h3>
<p>User Acceptance Testing is executed and signed off prior to Go-Live. Outstanding configuration issues
are remediated and re-tested in the same window.</p>
<h4>2.5.1 Communications</h4>
<ul><li>Customer sends user and agent communications confirming the cutover date.</li></ul>
<h4>2.5.2 Contact Center UAT</h4>
<ul>
<li>Packet Fusion provides a UAT test form covering queue routing, IVR menus, skill assignment,
business-hours logic, recording capture, and CRM screen pops.</li>
<li>Customer executes UAT with representative agent and supervisor users.</li>
<li>Packet Fusion and Customer review UAT results together; Packet Fusion makes modifications as needed.</li>
<li>Customer signs off on UAT prior to Go-Live.</li></ul>
<h4>2.5.3 Intent validation and NLP testing</h4>
<ul>
<li>{ch_test}</li>
<li>Customer reviews intent coverage and disambiguation behavior.</li>
<li>Packet Fusion tunes intent boundaries, phrasing, and fallback triggers.</li>
<li>Customer signs off on the intent library prior to Go-Live.</li></ul>
<h4>2.5.4 AI Expert Assist validation</h4>
<ul>
<li>Agents exercise AI Expert Assist against representative live or simulated interactions.</li>
<li>Customer reviews suggestion relevance against the measure agreed in Section 2.3.3.</li>
<li>Packet Fusion tunes knowledge-source weighting and surfacing behavior.</li></ul>

<h3>2.6 Stage 5 — Go Live / Production</h3>
<h4>2.6.1 Go/No-Go readiness</h4>
<ul>
<li>Determine readiness for Go-Live, including Tier 1 Support readiness on the Customer side.</li>
<li>Packet Fusion Trainer delivers end-user and agent training.</li>
<li>Packet Fusion IE delivers administrator training.</li></ul>
<h4>2.6.2 Go-Live event</h4>
<ul><li>Packet Fusion and Customer follow the Go-Live test plan and record results.</li>
<li>Packet Fusion provides Day 1 Support during the cutover window.</li></ul>
<h4>2.6.3 Change management and Day 1 support</h4>
<ul>
<li>Customer sends the Go-Live announcement using the template provided in Planning, with day-one
cheatsheet and support contact information.</li>
<li>Packet Fusion provides Day 1 guidance (remote) and escalation paths for issues that surface during
the cutover window.</li>
<li>Customer Champions and IT first-line owners pre-briefed on common Day 1 questions.</li></ul>

<h3>2.7 Stage 6 — Closing</h3>
<ul>
<li>Customer requests cancellation of legacy cloud services (if applicable).</li>
<li>Customer requests cancellation of legacy telco services (if applicable).</li>
<li>Packet Fusion PM hosts the lessons-learned call and project closure meeting.</li>
<li>Project transitions to the Customer Success Manager (CSM) for ongoing engagement and any future
change orders.</li></ul>

<h3>2.8 Training Services</h3>
<p><b>Included.</b> Self-paced agent training via Zoom's video library and knowledge base;
instructor-led administrator and supervisor training delivered by Packet Fusion.</p>
<p><b>Optional.</b> Live, remote, instructor-led agent training sessions (up to 20 attendees per
session). See Section 8.2 for pricing.</p>

<h3>2.9 Engineering &amp; Integration Services</h3>
<p>The following services are included where indicated in the Scope at a Glance (Section 1.3) or added
via change order under Section 9:</p>
<ul>
<li>CRM integration (Salesforce, HubSpot, Microsoft Dynamics, Zendesk, ServiceNow, or equivalent) —
screen pop, contact lookup, activity logging.</li>
<li>Knowledge-source ingestion — connectors to FAQ and KB sources with an agreed refresh cadence.</li>
<li>AI Expert Assist configuration — knowledge-source connection, agent surfaces, supervisor visibility,
and relevance tuning.</li>
<li>Intent training — iterative tuning against a corpus of representative utterances.</li>
<li>{ch_eng}</li>
<li>Custom IVR and call-flow design for complex menus, after-hours routing, and queue overflow logic.</li>
<li>Live-agent handoff — queue and context-transfer configuration.</li>
<li>Single Sign-On (SSO) and SCIM directory sync for agents, supervisors, and admins.</li>
<li>{ch_ctx}</li></ul>

<h3>2.10 Optional Services</h3>
<p>The following services are not included in the base scope and may be added by mutual written
agreement. Pricing is summarized in Section 8.2.</p>
<ul>
{"<li>Addition of the web chat virtual agent workflow, bringing scope to the equivalent of Option B.</li>" if not chat else ""}
<li>Custom reporting and supervisor dashboards beyond the standard library.</li>
<li>Bot persona localization — additional language coverage beyond the in-scope set.</li>
<li>Workforce Management (WFM) and Quality Management (QM) integration.</li>
<li>Workforce Optimization (WFO) suite integration — recording, evaluation, and coaching workflow handoff.</li>
<li>Conversation flow optimization — A/B testing of intent paths and fallback rules.</li>
<li>Additional live, instructor-led remote training sessions.</li></ul>

<!-- ============ 3 ============ -->
<h2>3. Deliverables</h2>
<p>The following deliverables will be produced under this SOW. Each deliverable is subject to the
acceptance process described in Section 10.</p>
<table><tr><th style="width:6%">#</th><th style="width:22%">Deliverable</th><th style="width:16%">Format</th><th>Acceptance criteria</th></tr>
{rows(delivs)}</table>

<!-- ============ 4 ============ -->
<h2>4. Out of Scope</h2>
<p>The following are explicitly out of scope for this SOW. They may be added by change order under
Section 9 if the Customer wishes Packet Fusion to perform them.</p>
<ul>{"".join(f"<li>{x}</li>" for x in oos)}</ul>

<!-- ============ 5 ============ -->
<h2>5. Assumptions</h2>
<p>This SOW, including the schedule and fees, is based on the following assumptions. A material change
to any assumption may require a change order under Section 9.</p>
<ul>
<li>The Customer has an active Zoom Contact Center tenant (or will procure one) sized appropriately for
the in-scope agents, including the licensing required for the virtual agent workflows and AI Expert
Assist, with administrative access available to Packet Fusion under a documented account.</li>
<li>The Customer's network meets the vendor's published bandwidth, jitter, latency, and packet-loss
recommendations at each in-scope location, or remediation will be completed by the Customer in
advance of cutover.</li>
<li>The Customer will make available a designated Project Manager, Technical Lead, and an authorized
signer with decision-making authority throughout the engagement.</li>
<li>Knowledge sources to be ingested exist and are maintained by the Customer. Authoring new content
is not included; see Section 4.</li>
<li>Services are delivered remotely Monday–Friday during U.S. business hours (8:00 AM – 6:00 PM
Pacific) unless explicitly stated otherwise. Cutover support may extend outside business hours by
mutual agreement.</li>
<li>Where number porting is in scope, porting timelines are subject to the losing carrier's acceptance and
FOC scheduling, which are outside Packet Fusion's control.</li>
<li>All required Customer-provided inputs (workbook entries, prompts, knowledge-source access, SSO
metadata) will be returned to Packet Fusion within five (5) business days of request.</li>
<li>Existing premise systems remain the responsibility of the Customer and their incumbent vendor
throughout migration.</li>
<li>The work in this SOW is performed under the master pricing and terms in effect as of the SOW issue date.</li></ul>

<!-- ============ 6 ============ -->
<h2>6. Customer Responsibilities</h2>
<p>The Customer is responsible for the following throughout the engagement. Delays in any of these items
may impact the project schedule and may trigger a change order under Section 9.</p>
<h3>6.1 Engagement and Governance</h3>
<ul>
<li>Identify and make available a Customer Project Manager, Technical Lead, Site Lead, and an
authorized signer.</li>
<li>Attend scheduled meetings and respond to Packet Fusion requests within the agreed turnaround times.</li>
<li>Approve or reject deliverables in writing within five (5) business days of delivery.</li></ul>
<h3>6.2 Network and Infrastructure</h3>
<ul>
<li>Provide and maintain LAN/WAN, Wi-Fi, firewall, and Internet connectivity meeting the vendor's
published requirements.</li>
<li>Implement remediation recommended in the Network Readiness Review prior to cutover.</li>
<li>Configure firewalls, ACLs, NAT/SBC, and QoS to support the vendor's voice traffic.</li></ul>
<h3>6.3 Data and Inputs</h3>
<ul>{"".join(f"<li>{x}</li>" for x in resp_data)}</ul>
<h3>6.4 Premise and Endpoints</h3>
<ul>
<li>Manage all Customer-side premise PBX configuration, diagnostics, and troubleshooting.</li>
<li>Manage Customer mobile-device configuration, diagnostics, and troubleshooting.</li>
<li>Decommission and dispose of legacy equipment after project closure.</li></ul>

<!-- ============ 7 ============ -->
<h2>7. Timeline &amp; Milestones</h2>
<div class="callout blue"><span class="lbl">COMMITTED DATE</span>
<p>Anticipated go-live: <b>October 15, 2026</b>. This is the only date Packet Fusion commits to under this
SOW. The week ranges below are illustrative stage distribution, not commitments.</p></div>
<p>This engagement is sized for approximately eleven weeks from project initiation to closure. Specific
dates are finalized in the project plan produced during Planning, based on Customer readiness and
knowledge-source availability.</p>
<table><tr><th>Stage</th><th style="width:26%">Relative weeks</th></tr>
{rows(tl)}</table>
<p class="small">Week 1 begins at SOW execution. Durations are working weeks and exclude federal
holidays and Customer-declared blackout windows.</p>

<!-- ============ 8 ============ -->
<h2>8. Pricing &amp; Payment Schedule</h2>
<h3>8.1 Fee Summary</h3>
<table><tr><th>Service</th><th style="width:18%">Type</th><th class="num" style="width:18%">Fee</th></tr>
<tr><td>Zoom Contact Center Professional Services — Option {o['opt']} (base scope per Section 2)</td>
<td>Fixed fee</td><td class="num">{o['price']}</td></tr>
<tr class="total"><td>Project total</td><td></td><td class="num">{o['price']}</td></tr></table>

<h3>8.2 Optional Services</h3>
<table><tr><th>Optional service</th><th style="width:20%">Unit</th><th class="num" style="width:16%">Fee</th></tr>
{rows([[a, b, (c, ' class="num"')] for a, b, c in optional])}</table>
<p class="small">Optional services are added by mutual written agreement (email accepted) and invoiced
upon completion of the optional engagement, unless otherwise stated.</p>

<h3>8.3 Invoicing Milestones</h3>
<p>Packet Fusion will invoice against the following milestones. Invoices are net 30 from issue date unless
the MSA states otherwise.</p>
<table><tr><th>Trigger</th><th style="width:18%">Percent</th><th class="num" style="width:22%">Amount</th></tr>
<tr><td>SOW execution</td><td>50%</td><td class="num">Per Section 8.1</td></tr>
<tr><td>Go-Live and Customer acceptance</td><td>50%</td><td class="num">Per Section 8.1</td></tr></table>

<h3>8.4 Expenses</h3>
<p>All services are delivered remotely unless otherwise stated. Any pre-approved travel will be invoiced
at cost per the MSA travel and expense policy.</p>
<h3>8.5 Taxes</h3>
<p>All fees are exclusive of applicable sales, use, and similar transaction taxes. The Customer is
responsible for any such taxes other than taxes based on Packet Fusion's net income.</p>

<!-- ============ 9 ============ -->
<h2>9. Change Management</h2>
<p>Changes to scope, schedule, fees, deliverables, or assumptions require a written Change Order signed
by both parties before work on the change commences. The process is intentionally lightweight but explicit:</p>
<p><b>Step 1 — Request.</b> Either party submits a written change request to the other party's Project
Manager describing the change and the reason for it.</p>
<p><b>Step 2 — Impact assessment.</b> Within five (5) business days, Packet Fusion will assess the impact
on scope, schedule, fees, deliverables, and assumptions, and provide a written Change Order for the
Customer's review.</p>
<p><b>Step 3 — Approval.</b> The Change Order takes effect when signed by the authorized signers of both
parties. Until then, the original SOW remains in force and the project schedule continues to count the
impact-assessment time against the affected milestones.</p>
<p><b>Step 4 — Execution.</b> Packet Fusion incorporates the approved change into the project plan and
tracks it through the normal status-reporting cadence.</p>
<p><b>Customer-caused delay.</b> Delays in performance or delivery caused by the Customer — including
without limitation delays in completing the implementation workbook, approving the call-flow design,
providing knowledge-source access, or remediating network findings — may result in schedule adjustment
and/or additional fees, processed through this same change-order procedure.</p>

<!-- ============ 10 ============ -->
<h2>10. Acceptance Process</h2>
<h3>10.1 Deliverable Acceptance</h3>
<p>For each deliverable listed in Section 3, the following process applies:</p>
<ul>
<li>Packet Fusion submits the deliverable to the Customer's designated reviewer in writing (email is
acceptable).</li>
<li>The Customer reviews against the stated acceptance criteria within five (5) business days.</li>
<li>If accepted, the Customer authorized signer confirms acceptance in writing.</li>
<li>If rejected, the Customer provides a written list of specific, defensible deficiencies referencing the
acceptance criteria. Packet Fusion remedies the deficiencies and resubmits.</li>
<li>If the Customer does not respond within five (5) business days, the deliverable is deemed accepted.</li></ul>

<h3>10.2 Go-Live Acceptance</h3>
<p>Go-Live is deemed accepted when all of the following are confirmed:</p>
<ul>
<li>Inbound contacts reach the correct queue on each in-scope channel ({o['channels'].lower()}).</li>
<li>The virtual agent handles the in-scope use cases and hands off to a live agent on the agreed triggers.</li>
<li>AI Expert Assist surfaces suggestions to agents during a live interaction.</li>
<li>CRM screen pop and activity logging function on a representative interaction.</li>
<li>Call recording captures and retains per the configured policy.</li>
<li>The Customer site lead signs off on the cutover form.</li></ul>
<p>Where number porting or E911 registration is in scope for this engagement, completion of ported
numbers and correct E911 location return are additional acceptance conditions. Where they are not in
scope, they are not conditions of acceptance. Outstanding cosmetic items are captured for Day 1 Support
follow-up.</p>

<h3>10.3 Project Closure</h3>
<p>The project is closed when: (a) all deliverables in Section 3 have been accepted; (b) Day 1 Support has
completed; and (c) the Project Closure Memo is signed by both Project Managers. Any open items at
closure are deferred to a future change order or to the Customer's ongoing support relationship.</p>

<!-- ============ 11 ============ -->
<h2>11. Terms &amp; References</h2>
<h3>11.1 Master Services Agreement</h3>
<p>This SOW is governed by the Packet Fusion Master Services Agreement (the "MSA") executed between
the parties and incorporated here by reference. The MSA controls all terms not expressly modified by this
SOW, including confidentiality, intellectual property, warranty, indemnification, limitation of liability,
term and termination, and governing law.</p>
<h3>11.2 Confidentiality</h3>
<p>Each party will protect the Confidential Information of the other party as required by the MSA. Project
deliverables produced under this SOW are considered Confidential Information of the Customer except for
Packet Fusion's pre-existing methodologies, templates, and know-how, which remain the property of
Packet Fusion.</p>
<h3>11.3 Data Handling</h3>
<p>Packet Fusion will access only the Customer data and systems necessary to deliver the services in this
SOW. Any Customer data received will be handled per the MSA and applicable privacy laws. The
Customer is responsible for ensuring its vendor tenant and downstream integrations comply with its own
regulatory requirements. Where knowledge sources or interaction content contain regulated data, the
Customer confirms the classification of each source before ingestion.</p>
<h3>11.4 Order of Precedence</h3>
<p>In the event of a conflict between documents, the order of precedence is: (1) the MSA; (2) any signed
Change Order to this SOW; (3) this SOW; (4) any attached appendices.</p>
<h3>11.5 Entire Agreement</h3>
<p>This SOW, together with the MSA and any signed Change Orders, constitutes the entire agreement of
the parties with respect to its subject matter and supersedes all prior or contemporaneous
communications, representations, or agreements, whether oral or written, relating to that subject matter.</p>

<!-- ============ 12 ============ -->
<h2>12. Authorization &amp; Signature</h2>
<p>By signing below, each party agrees to the terms of this Statement of Work — <b>Option {o['opt']},
{o['price']} fixed fee</b> — and authorizes Packet Fusion to proceed with the services described herein.</p>
<div class="sig avoid">
  <div><div class="small" style="letter-spacing:.14em;color:{NAVY}"><b>PACKET FUSION, INC.</b></div>
    <div class="sigline"></div><div class="small">Authorized signature</div>
    <div class="sigline"></div><div class="small">Name &amp; title</div>
    <div class="sigline"></div><div class="small">Date</div></div>
  <div><div class="small" style="letter-spacing:.14em;color:{NAVY}"><b>IONIS PHARMACEUTICALS</b></div>
    <div class="sigline"></div><div class="small">Authorized signature</div>
    <div class="sigline"></div><div class="small">Name &amp; title</div>
    <div class="sigline"></div><div class="small">Date</div></div>
</div>
</body></html>"""


if __name__ == '__main__':
    from weasyprint import HTML
    for key, o in OPTIONS.items():
        html = build(o)
        name = f"Ionis_SOW_Option_{key}_{'Voice' if not o['chat'] else 'Voice_Chat'}_AI_Expert_Assist_{o['ver']}"
        (HERE / f"{name}.html").write_text(html)
        HTML(string=html, base_url=str(HERE)).write_pdf(HERE / f"{name}.pdf")
        print("built", name)
