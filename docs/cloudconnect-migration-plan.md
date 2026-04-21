# FusionFlow → CloudConnect Migration Plan

**Target go-live:** Wednesday **2026-04-22**
**Started:** 2026-04-19
**New home:** `cloudconnect.packetfusion.com` (subdomain under the Packet Fusion corporate site)

---

## 1. Scope & Motivation

Executive-mandated rebrand from **FusionFlow / FusionFlow360** to **CloudConnect**, folding the tool under the Packet Fusion corporate brand rather than running it as a standalone FusionFlow identity.

Coupled with a transactional email migration from **Resend** → **Microsoft 365 (Graph API)**. The email migration was originally motivated independently by Resend's 100-emails/day cap (hit during load testing), but scope and timing were merged with the rebrand since both require mailbox/DNS/domain work.

Aggressive ~72-hour solo timeline vs. the original ~2-week estimate — delivered by parallelizing provisioning work and cutting Phase 3 scope to the essentials.

---

## 2. Environment Notes

| Item | Value |
|---|---|
| Production domain | `cloudconnect.packetfusion.com` |
| Staging domain | `staging.cloudconnect.packetfusion.com` |
| Sender mailbox | `cloudconnect@packetfusion.com` (shared) |
| Entra app registration | "CloudConnect Mail Sender" — client id `26731d36-df18-46a0-87df-090f00ec17ab` |
| Graph permission | `Mail.Send` (application), scoped to the single mailbox via `New-ApplicationAccessPolicy` |
| Email DNS | `packetfusion.com` SPF/DKIM/DMARC already in place — no new records needed |
| Staging gate signal | Hostname / `APP_URL` must contain the literal substring `"staging"` (controls staging banner + PF-only email filter) |

---

## 3. Phases

### Phase 0 — Repo hygiene ✅ (complete)
- Repo consolidated to a single clone.
- 9 merged branches pruned.
- Env-gating verified for the staging banner and the PF-only email filter via the `"staging"` substring check on hostname / `APP_URL`.

### Phase 1 — Foundations / provisioning ✅ (complete)
- Created `cloudconnect@packetfusion.com` shared mailbox.
- Registered "CloudConnect Mail Sender" Entra app with `Mail.Send` application permission.
- Scoped that permission to the single mailbox via `New-ApplicationAccessPolicy` (prevents the app from sending as any other mailbox in the tenant).
- Confirmed no new DNS work needed — `packetfusion.com` outbound auth already passes through Exchange Online.

### Phase 2 — Email transport swap (Resend → Graph) ✅ (complete — PR #19 merged)
- Added `src/server/services/graphAuth.ts` with KV-cached token acquisition.
- Rewrote `src/server/services/emailService.ts` on top of Graph `sendMail` (template rendering preserved).
- Deployed to staging and production; real delivery from `cloudconnect@packetfusion.com` validated in both.
- `RESEND_API_KEY` secret left in Cloudflare as a rollback safety net — **scheduled for deletion ~24h after Phase 3 cutover soak.**

### Phase 3 — Rebrand sweep ▶️ (active as of 2026-04-20 — full go-ahead received)

**Resolved decisions:**

| Question | Decision |
|---|---|
| Official app title | **"CloudConnect by Packet Fusion"** — use wherever a human-readable product name appears (page titles, headers, email sender display name, metadata) |
| Logo | Reuse the existing standard Packet Fusion logo (`packetfusionlogo.png`) — no new mark, no text-only treatment |
| CORS cutover posture | **Dual-origin for 7 days** — allowlist accepts both `fusionflow360.com` and `cloudconnect.packetfusion.com`; hard flip removes the old origin after the grace period |
| `fusionflow360_customer_journey.html` | **Leave as-is** — not project-relevant; retained only as a design reference |
| Graph `from` display name | **"CloudConnect by Packet Fusion"** (matches the official app title) |

**Scope:**
- UI copy sweep (page titles, navigation, buttons, email templates, metadata) — replace FusionFlow / FusionFlow360 with the official title where human-visible.
- Logo references updated to use `packetfusionlogo.png` where a FusionFlow-specific asset is in use.
- Auth redirect URLs and CORS allowlist updated for the new subdomain (dual-origin posture per above).
- Domain / env configuration for the new subdomain (Cloudflare Worker routes, `APP_URL`, etc.).
- Email templates updated with the new title + Graph `from` display name.
- **Identifiers in code** (variable names, function names, package name, repo directory) are *not* swept in this phase — renamed only where they leak into human-visible output. Identifier sweep + repo directory rename deferred per §4.

---

## 4. Deferred Until After Go-Live

Explicitly out of scope for this migration, to be queued up for a dedicated post-go-live prioritization:

- Repo directory rename (`fusionflow/` → `cloudconnect/`) — touches deploy paths and git history, deliberately *not* renamed reflexively.
- `fusionflow360.com` domain retirement timeline.
- Cloudflare R2 bucket rename.
- pfsupport ↔ main app parity/sync strategy.
- `support-core` package extraction.
- Any non-migration feature work (config freeze in effect — see §5).

---

## 5. Config Freeze

A **config / feature freeze** is in effect from 2026-04-19 through go-live (target 2026-04-22). Only migration-scoped work and direct rollback/fix work is in scope during the freeze. Feature work — even small, seemingly-harmless items — is explicitly deferred until after go-live to avoid merge-noise risk on the compressed timeline.

---

## 6. Related Context

- **Final pre-rebrand release cut:** PR #16 (staging → main merge on 2026-04-19).
- **Email transport migration:** PR #19 (merged; delivered both staging and prod).
- **Planning conversation history:** originally tracked in a Zoom doc shared with the boss and engineer for review — this in-repo doc is the canonical reference going forward.
