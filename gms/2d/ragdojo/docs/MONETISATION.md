# Ragdojo monetisation — local review package

Prepared 8 September 2026; payments section revised 12 October 2026. **Payments are
built and rehearsed in Stripe TEST mode only; nothing is deployed.**

## Payments (decided 12 October 2026 — supersedes the price/tax notes below)

- **Stripe account BR8T.COM** (acct_1UPc1kRFADho7PSJ), **Managed Payments**: Stripe is
  merchant of record and collects/remits GST/VAT; the customer sees "Sold through Link"
  (statement `LINK.COM*`). Hosted Checkout only. Prices are **tax-inclusive AUD**.
- **RAGDOJO Supporter** (`ragdojo_supporter`): A$1.99 one-off, product tax code
  `txcd_10201000`. Unlocks CYBER + DEITIES, forever.
- **br8t Pass** (`br8t_pass_monthly` A$1.49/month, `br8t_pass_yearly` A$4.99/year,
  `txcd_10201004`): everything across br8t games, including RAGDOJO's paid worlds and future
  paid features; free online play allowance is unlimited with it.
- The client treats **either** entitlement as owning CYBER + DEITIES. The upgrade panel
  offers both (warm "two ways to say thanks" copy), shows Manage subscription (Stripe
  customer portal) for Pass holders, Restore purchases, and terms/privacy links.
- Pass lifecycle: works while active/trialing, and for 7 days of past_due while Stripe
  retries a failed renewal; cancel = runs to period end; full refund of the latest payment
  or an open/lost dispute removes it until the next paid renewal.
- 14-day no-questions refund applies to the supporter payment and the **first Pass
  payment**; renewals can be cancelled any time in the portal (or at link.com).
- Free daily allowance API (`/api/br8t/allowance`, default 3/day for `ragdojo`) exists
  server-side for future online battles; **not wired into the game**.
- API: the client now calls **`/api/br8t/*`** (offer/entitlement/checkout/portal/analytics);
  the server keeps `/api/ragdojo/*` as an alias for the build already on games.br8t.com.
  Still graceful when the API is absent: one offer probe, "coming soon", no polling.
- Service, endpoints, webhook list, deploy steps and the real test-mode rehearsal:
  `~/cc/ionos/ragdojo-payments/README.md`.

## Product decision (revised 11 October 2026 — supersedes the September DARK gate)

Since September the game grew to four worlds (LIGHT → DARK → CYBER → DEITIES). Aaron's
current model:

| World | Access |
| --- | --- |
| **LIGHT** | Free. |
| **DARK** | **Free.** A small, dismissible "support the developer" note appears in the hub on entering DARK or returning to the hub after a DARK win: at most once every 48 hours per device (`ragdojo.nudge.v1` in localStorage), never mid-fight, never for supporters/family, never a modal. It links to the upgrade panel. |
| **CYBER, DEITIES** | **Paid**: one permanent payment, presented as **"Support the developer"** (warm, not salesy), that unlocks both worlds as a thank-you. Tied to a signed-in (non-anonymous Google/email) br8t account, server-verified by Firebase UID (product id `ragdojo_supporter`); restore by signing in on any device. |

Each world keeps its gameplay prerequisite: win BULLY → DARK, win THUG → CYBER, win
SIMULANT → DEITIES. Paying never skips one. Earned CYBER/DEITIES progress is parked, not
deleted, while access is unavailable (signed out, refunded, offline); a parked run lands
in DARK if you have a DARK run, else LIGHT (`parkPaid()` in main.js). Skill caps follow
the same split: DARK's +5 levels are free; the +1 per later world needs the upgrade.

**Payments are not deployed** (test-mode service built; the deployed webhook endpoint is
still needed). The client probes `GET /api/br8t/offer` once; if it is missing or unconfigured, CYBER and
DEITIES show "support the dev · soon", the panel says support is coming soon, checkout is
a disabled "SUPPORT · COMING SOON" button, Restore is hidden, and no entitlement request
is ever sent (no retry/focus polling). Off games.br8t.com (GitHub Pages, LAN, itch) there
are no account/payment requests at all.

The `192.*` family exception (4 October 2026) is unchanged in mechanism and now stands in
for the supporter upgrade: on a literal `192.*` IPv4 host the panel offers "Skip payment —
I'm a family member", remembered in a separate origin-local preference, never in saves,
excluded on public hosts and in the itch edition. Skipping from a world you have earned
walks straight into it.

Old `ragdojo_dark` purchases: none exist (nothing was ever deployed); the client rejects
that product id. DARK careers parked by the September build simply reopen, free.

Regression commands: `node --test tools/family-access.test.mjs tools/services.test.mjs`,
`npm run build`, `node tools/releasegate.mjs`, `node tools/accountgate.mjs`,
`node tools/familygate.mjs`, `node tools/darkgate.mjs`, `node tools/stuckgate.mjs`,
`node tools/progressgate.mjs`; payments: `go test -race ./...` in `~/cc/ionos/ragdojo-payments`.

### Refunds and terms (decided 11 October 2026)

Full refund on request within **14 days** of purchase, no questions asked — even if the
player finished the paid worlds. A refund removes CYBER/DEITIES access (the service
already revokes on a full refund); progress is kept. After 14 days, help only if
something is broken. "This doesn't affect your rights under the Australian Consumer Law."
Because a 14-day refund is offered, no EU withdrawal-waiver checkbox is needed.
Draft page: `terms.html` (next to `privacy.html`, linked from the upgrade panel); support
contact support@br8t.com; business name **BR8T.COM (trading as BR8T)**, no ABN shown.
Updated 12 October for the Pass (cancel any time via the portal; first Pass payment also
14-day refundable; renewals not auto-refunded; ACL line kept). Link it in Stripe
(see the payments README: Public details + Checkout policies).

### Future plans — TODO only, not built

- **Events**: some free, some paid.
- **Online battles**: a couple of free battles per day; unlimited with the br8t Pass
  (server allowance API exists; game not wired).

### Original September notes (DARK gate — superseded)

DARK retains its existing gameplay prerequisite: finish LIGHT, then win a BULLY
run. Buying does not skip that prerequisite. The upgrade panel says so before
Checkout. No new paid content, price, subscription, consumable, artificial timer,
paid currency or advertising system has been invented.

The second campaign reuses the game's 45-fight frame; describe it as the existing
DARK campaign, not 45 newly built arenas. Old public source/releases remain
available: minification is a size optimization and modest casual-inspection barrier,
not DRM. A determined player can modify client gameplay. Server purchase records
and verified restoration remain authoritative and cannot be granted by editing saves.

Aaron confirmed in this session that the Suno soundtrack has **100% commercial-use
licensing**. Preserve the corresponding license/subscription evidence with private
business records. Local Google Fonts ship with their SIL Open Font Licenses.

## What was inspected

- Workspace, Y-R-U and site AGENTS.md; Ragdojo and games hub CLAUDE.md.
- IONOS plan/runbook, Go/SQLite service convention, Caddy routing/deployment.
- Existing hub `games/deploy.sh`, shared Firebase Auth/Firestore/UI, Firestore rules.
- Ragdojo input, campaign, LIGHT/DARK swaps, progression, save, audio and tests.

The code uses **Firebase Auth + Firestore**, not Cloudflare authentication or a
Worker. Cloudflare manages domain infrastructure; Caddy/IONOS serves the game at
paths on games.br8t.com. Repo docs describe historical DNS settings; no live server
or DNS configuration was modified or newly verified. Ragdojo previously had only
local saves and was not in the games hub's deployed lineup.

The existing uncommitted **site-root `index.html` edit was preserved**. It is unrelated
to this work and must not be accidentally included in a payment deployment review.
The original Ragdojo raw-audio and screenshot ignores are retained.

## Changes

- Game-specific cloud coordinator with explicit Firebase UIDs and revision tokens.
  Failed reads stop cloud writes; blank saves cannot replace a played cloud career;
  competing played saves require a visible choice. Firestore transactions compare
  the expected revision before overwriting another device. No automatic reloads.
- Account changes cancel old requests/writes. Copying another signed-in account's
  local career to a new account requires a choice. In-progress fights never sync.
- Shared auth exposes a short-lived ID token; shared cloud adds opt-in strict,
  UID-specific operations. Other games retain their existing sync behavior.
- Separate Go/SQLite test payment service at `ionos/ragdojo-payments`.
  Verified idempotent webhooks, durable UID ownership, refunds and disputes.
- DARK gate checks in theme switching and fight entry, plus restore/checkout UI.
  Old DARK progress is parked safely while access is unavailable. Save flags,
  query-string success and local storage cannot grant recorded ownership.
- Opt-in first-party metrics with privacy controls and a draft privacy page.
  Starts, fight starts/ends, returning browsers and upgrade conversion; no email,
  save payloads, third-party analytics scripts or advertising. Respect DNT/GPC.
- Minified home/itch builds, local fonts/licenses, developer flags/hooks disabled
  in release artifacts, allowlisted files only, no source maps or raw music takes.
- Ragdojo entry in the games hub and deploy script wired to the minified home build.

## Build / test

From `yru/site/gms/2d/ragdojo`:

```sh
npm ci
npm run build
node --test tools/services.test.mjs
node tools/releasegate.mjs
node tools/accountgate.mjs
node tools/progressgate.mjs
node tools/darkgate.mjs
node tools/stuckgate.mjs
```

Outputs, intentionally git-ignored:

- `dist/home/`: main game, deploy to `/gms/2d/ragdojo/` alongside `/lib/auth/`.
- `dist/ragdojo-itch.zip`: upload-ready playable LIGHT build, root `index.html`.
- `dist/itch-cover.jpg`: existing game screenshot copied as a cover candidate.
- `dist/home-manifest.json`, `dist/itch-manifest.json`: file sizes and SHA-256 hashes.
- `dist/itch-portrait.png`, `dist/home-portrait.png`: browser review captures.

Do not upload the source directory, `node_modules`, backend folder, `.env`, database,
raw takes or `dist` as a whole. Upload only `ragdojo-itch.zip` to the HTML5 slot.
The builder zips deterministically and checks itch's documented file/size/path limits.

The detailed backend environment, Stripe account setup, Caddy fragment, systemd unit,
backup/restore and real test-card rehearsal are in
`/Users/aaronair/cc/ionos/ragdojo-payments/README.md`. `prepare.sh` builds locally only.

Automated tests use local fixtures; browser tests use isolated Chrome profiles.
They do not replace a real test-mode Stripe Checkout, Google popup/email-link sign-in,
Firestore transaction/rules verification, physical-phone test or actual itch iframe
preview. Those require account configuration or publishing approval and remain in
`VERIFICATION.md` as explicit release checks.

## itch.io setup draft

Use `ITCH_LISTING.md` for copy and configuration. The demo uploads actual playable
content rather than a link-only page. No sign-in prompt or payment form in the
iframe. The upgrade link opens games.br8t.com in a new tab; its login/storage origin
is separate. Local itch progress does not automatically transfer. No itch purchase
is claimed to grant the br8t upgrade. Recommend free/no donations for this first
listing to avoid two payment paths and confusion about entitlement.

Keep the itch project in Draft until the home destination and release information
are ready. Use HTML Game, click-to-play, mobile-friendly after device validation,
and fullscreen. Test desktop keyboard, touch, rotation, storage denied and the
external home link in itch's actual preview before making it public.

## Official requirements checked 8 September 2026

- [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment): reliable
  grants use webhooks, not just the return page; fulfillment must tolerate repeats.
- [Stripe webhooks](https://docs.stripe.com/webhooks): raw-body signature validation,
  HTTPS delivery, duplicates, retries and unordered events; pin the endpoint version.
- [Stripe refunds](https://docs.stripe.com/refunds) and
  [refund list API](https://docs.stripe.com/api/refunds/list): distinguish successful,
  pending and failed refunds when reconciling access.
- [Stripe disputes](https://docs.stripe.com/api/disputes/list): recheck current dispute
  status when deciding whether a disputed purchase should regain access.
- [Firebase ID verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens):
  verify tokens on your backend; use revocation checks when required.
- [itch HTML5 uploads](https://itch.io/docs/creators/html5): ZIP with root index.html,
  relative paths, HTTPS external resources and mobile/fullscreen settings. HTML5
  payments are donations rather than automatic br8t purchase entitlements.
- [itch quality guidelines](https://itch.io/docs/creators/quality-guidelines): accurate
  content/media/tags, playable files, no obtrusive login, and accurate generative-AI
  disclosure. Disclose the Suno music; review other applicable categories honestly.
- [esbuild minification](https://esbuild.github.io/api/#minify): minify release output
  while retaining readable sources. Splitting preserves optional account loading.
- [Suno commercial rights](https://help.suno.com/en/articles/9601665): paid-generation
  rights are relevant; Aaron has confirmed commercial-use licensing for these tracks.
- [Stripe Tax / Checkout](https://docs.stripe.com/tax/checkout): tax setup is a separate
  business/integration decision. No paid tax service or live mode has been enabled.

## Remaining decisions and release approvals

Decided: the model above (LIGHT/DARK free, "Support the developer" unlocks CYBER +
DEITIES) and the 14-day no-questions refund policy.

Still open:

1. ~~Price and currency~~ (A$1.99 / A$1.49 / A$4.99, decided 2026-10-12).
2. ~~Stripe test keys~~ (in the service's private `.env`); the **deployed webhook signing
   secret** is created when the test endpoint is registered.
3. ~~Firebase Admin credential~~ not needed: the service verifies ID tokens against Google's
   public certs (Aaron's org forbids service-account keys); no revocation check, 1-hour tokens.
4. ~~Business name~~ (BR8T.COM; ABN to add when one exists).
5. ~~Tax treatment~~ (Managed Payments); purchase-record retention policy still open.
6. itch creator account/slug and listing review; no upload yet.
7. **Approval to deploy** the game to games.br8t.com and the test service, and separately
   to publish itch. Live mode requires another explicit review: this executable rejects
   live keys/events, and test entitlements must never migrate into a future live DB.

Ads remain deferred. First look at completion/drop-off by fight, returning browsers
and voluntary upgrade interest. Only investigate providers when those observations
justify the work and the provider explicitly supports the actual host/embed, content,
age audience and consent model. No arbitrary engagement threshold or provider was chosen.
