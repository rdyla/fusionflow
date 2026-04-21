# FusionFlow → CloudConnect Migration — Complete

**Status:** ✅ **Cut over to production on 2026-04-21** (early morning UTC, late evening 2026-04-20 US Pacific — one day ahead of the 2026-04-22 target).
**Started:** 2026-04-19
**Production:** `cloudconnect.packetfusion.com`
**Staging:** `staging.cloudconnect.packetfusion.com`

---

## 1. Scope & Motivation

Executive-mandated rebrand from **FusionFlow / FusionFlow360** to **CloudConnect**, folding the tool under the Packet Fusion corporate brand rather than running it as a standalone FusionFlow identity.

Coupled with a transactional email migration from **Resend** → **Microsoft 365 (Graph API)** — originally motivated independently by Resend's 100-emails/day cap (hit during load testing), but scope and timing were merged with the rebrand.

Delivered inside a compressed ~72-hour solo timeline (vs. the original ~2-week estimate) by parallelizing provisioning work and keeping Phase 3 scope tight to human-visible brand surfaces.

---

## 2. Environment Reference

| Item | Value |
|---|---|
| Production domain | `cloudconnect.packetfusion.com` |
| Staging domain | `staging.cloudconnect.packetfusion.com` |
| Sender mailbox | `cloudconnect@packetfusion.com` (shared) |
| Entra app registration | "CloudConnect Mail Sender" — client id `26731d36-df18-46a0-87df-090f00ec17ab` |
| Graph permission | `Mail.Send` (application), scoped to the single mailbox via `New-ApplicationAccessPolicy` |
| Graph `from` display name | "CloudConnect by Packet Fusion" (set in `emailService.ts`) |
| Adobe Fonts kit | `dty1vuu` — serves `avenir-lt-pro` at weights 200/300/400/500/700/800 normal + italic |
| Staging gate signal | Hostname / `APP_URL` must contain the literal substring `"staging"` (controls staging banner + PF-only email filter). The staging domain `staging.cloudconnect.packetfusion.com` satisfies this. |
| Dual-origin CORS window | Both `cloudconnect.packetfusion.com` and `fusionflow360.com` (prod + staging) accepted through **~2026-04-29** (7 days post cut-over). Remove legacy origins from `src/server/index.ts` then. |

---

## 3. Phases — all complete

### Phase 0 — Repo hygiene ✅
- Repo consolidated to a single clone.
- 9 merged branches pruned.
- Env-gating verified for the staging banner and the PF-only email filter via the `"staging"` substring check on hostname / `APP_URL`.

### Phase 1 — Foundations / provisioning ✅
- Created `cloudconnect@packetfusion.com` shared mailbox.
- Registered "CloudConnect Mail Sender" Entra app with `Mail.Send` application permission.
- Scoped that permission to the single mailbox via `New-ApplicationAccessPolicy` (prevents the app from sending as any other mailbox in the tenant).
- Confirmed no new DNS work needed — `packetfusion.com` outbound auth already passes through Exchange Online.

### Phase 2 — Email transport swap (Resend → Graph) ✅ (PR #19)
- Added `src/server/services/graphAuth.ts` with KV-cached token acquisition.
- Rewrote `src/server/services/emailService.ts` on top of Graph `sendMail`, preserving template rendering.
- Added `from.emailAddress.name = "CloudConnect by Packet Fusion"` to the Graph payload so the envelope display name matches the product.
- Deployed to staging and production; real delivery validated.
- `RESEND_API_KEY` secret kept in Cloudflare as a rollback safety net — **delete ~24h post cut-over soak (i.e. on or after 2026-04-22).**

### Phase 3 — Rebrand sweep ✅ (PRs #26 → #37)

All four original open questions resolved:

| Question | Decision |
|---|---|
| CORS cutover posture | Dual-origin for 7 days (see §2) |
| Logo strategy | Reuse PF logo assets — `packetfusionlogo.png` (color) for light backgrounds, `white logo transparency.png` for dark-navy shells |
| `fusionflow360_customer_journey.html` | Left as-is — design reference only, not imported anywhere |
| Graph `from` display name | "CloudConnect by Packet Fusion" |

**Delivered surfaces:**

- **Client UI copy sweep** — page title, AppShell, LoginPage, ModuleSelectPage, SOR/SOW document footers, notifications, route subject lines all say CloudConnect / "CloudConnect by Packet Fusion".
- **Hero layout** (ModuleSelectPage) — PF seal stacked above the `Cloud` + `Connect` wordmark (Cloud white, Connect `#22c55e`). Tagline "Engage. Deliver. Grow." in muted off-white (`rgba(240,246,255,0.78)`, weight 700).
- **Module cards** — Solutioning subtitle "Evaluate and Recommend"; Implementation pill "CloudPro"; Support pill "CloudSupport"; Optimization left as-is.
- **AppShell sidebar + mobile drawer** — CloudConnect text wordmark (replaces the PF logo image). Top-bar module label removed (was broken — only toggled two hardcoded values — and redundant with the sidebar's active-nav highlight).
- **Logo asset**: added `src/client/assets/white logo transparency.png` for use in dark-navy shells.
- **Background palette**: swapped `#03395f` (PF mid-blue, collided with the logo wordmark) → `#021e34` (darker navy) in the three shells that hosted the logo — hero, sidebar, mobile drawer. `#03395f` remains the app's primary brand color everywhere else (buttons, tabs, text, SOR/SOW accents).
- **Typography** — Jost → Avenir LT Pro via Adobe Fonts kit `dty1vuu`. Weight 600 callers fall back to 500 or 700 (browser-handled, looks fine).
- **Email templates** (`emailTemplates.ts`, `authPublic` OTP, subject lines across admin/solutions/support) — all say CloudConnect.
- **CORS** — dual-origin array in `src/server/index.ts`.
- **APP_URL** — flipped to `cloudconnect.packetfusion.com` (prod) and `staging.cloudconnect.packetfusion.com` (staging) in `wrangler.json`; auth fallback URL in `authPublic.ts` matches.
- **CI workflows** — deploy titles, smoke-test BASE_URL, Zoom notify payloads updated; plus a **quoting-safety fix** (PR #32) so commit messages containing `"` don't break the Zoom notifier via shell tokenization (also closes a latent command-injection surface).
- **Docs** — README, OVERVIEW, CHANGELOG title, deployment-uat-plan updated.

### Cut-over ✅ (PR #37)
- Merged `staging` → `main` on 2026-04-21 at 06:00 UTC.
- `deploy.yml` fired successfully.
- Production live at `cloudconnect.packetfusion.com`.
- SSO redirect URIs verified in Entra for both prod and staging before cut-over.
- Cloudflare worker routes for both domains confirmed wired.
- Live email send test validated the full pipeline end-to-end (Graph auth → CloudConnect sender display name → rebranded user-invite template).

### Post-cutover polish
- **PR #38 / #39** — admin users kebab menu flipped upward when near viewport bottom (bottom row's ⋮ controls were previously clipped off-screen).

---

## 4. Post-go-live TODO

Explicitly deferred during the migration; queued for a dedicated prioritization conversation after thorough prod testing:

- **Remove legacy CORS origins** ~2026-04-29 (after the 7-day grace window). Edit `src/server/index.ts` to drop `https://fusionflow360.com` and `https://staging.fusionflow360.com` from the allowlist.
- **Delete `RESEND_API_KEY` secret** from Cloudflare after the ~24h email soak confirms Graph delivery is stable.
- **Retire `fusionflow360.com` domain** — timing TBD; Cloudflare route + DNS decommission.
- **Rename infra identifiers** — Cloudflare Worker name `fusionflow`, D1 DB `fusionflow` / `fusionflow-staging`, R2 bucket `fusionflow-docs` / `fusionflow-docs-staging`, `package.json` name, repo directory (`fusionflow/` → `cloudconnect/`). Touches deploy paths and git history — **do not rename reflexively**; needs a coordinated plan.
- **Dead-code cleanup** — `src/worker/index.ts` is unreferenced (wrangler `main` points at `src/server/index.ts`). Safe to delete.
- **Code-identifier sweep** — variables/functions/types still named with `fusionflow*` (e.g., `fusionflow-sso` comment in `types/index.ts`, `ff_session` cookie name). Purely internal, no user impact, can move at a relaxed pace.
- **pfsupport ↔ main app parity/sync strategy** — previously deferred during the freeze; reconsider now.
- **`support-core` package extraction** — same.

---

## 5. Key PRs (reference trail)

| PR | Purpose |
|---|---|
| #16 | Final pre-rebrand release cut (staging → main) |
| #19 | Phase 2 — email transport Resend → Graph |
| #26 | Phase 3 initial rebrand sweep |
| #27 | Fix logo-background shells to `#021e34` |
| #28 | Swap in white-variant logo on dark-navy shells |
| #29 | Hero wordmark layout + Avenir LT Pro |
| #30 | Stack hero: PF seal over CloudConnect wordmark |
| #31 | Hero tagline: "Engage. Deliver. Grow." (initially tri-color) |
| #32 | Mute tagline to single off-white + CI workflow quoting-safety fix |
| #33 | Tighten CloudConnect ↔ tagline gap |
| #34 | Module-card copy updates (Solutioning / CloudPro / CloudSupport) |
| #35 | AppShell sidebar/drawer → CloudConnect text wordmark |
| #36 | Drop broken/redundant top-bar module label |
| #37 | **Cut-over staging → main** |
| #38 / #39 | Admin users kebab menu overflow fix (staging → main) |

---

## 6. Rollback posture (if issues surface during thorough testing tomorrow)

- **Code rollback:** `git revert` the offending merge commit on `main`, push, `deploy.yml` redeploys the prior state.
- **Email rollback:** `RESEND_API_KEY` secret is still in Cloudflare; swapping `emailService.ts` back to the Resend SDK + the secret would restore the legacy path.
- **Legacy domain:** `fusionflow360.com` is untouched and still inside the dual-origin CORS window, so old bookmarks ride through until ~2026-04-29 without breaking.
