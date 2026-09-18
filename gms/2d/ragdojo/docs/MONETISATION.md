# Ragdojo monetisation — local review package

Prepared 8 September 2026. **No deployment, publishing, account creation, live
payments or spending has been performed.** Price and currency remain undecided.

## Product decision

Aaron approved: **require purchase for DARK, including existing players**.
Keep earned DARK progress; do not grandfather editable save flags into ownership.

| Free on games.br8t.com and itch.io | One permanent DARK upgrade on games.br8t.com |
| --- | --- |
| All 45 LIGHT fights / nine bandana ranks | Existing 45-fight DARK campaign |
| Eight LIGHT gesture moves and earned upgrades | Eight existing dark moves, including knife volleys and gun mechanics |
| BULLY replay, record book and new games | THUG replay and earned dark-move carry-back |
| Fourteen LIGHT music tracks | Ten DARK tracks and five extra skill levels |
| Local saves; login optional for play | Account-based purchase restoration |
| Optional Google/email cloud saves on main site | Existing DARK career retained behind verified access |

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

1. **One-time price and currency.** Needed to create/configure the Stripe test Price.
2. **Private test configuration:** Stripe sandbox/test account and API/webhook keys,
   Price ID; Firebase Admin credential with user lookup permission. Configure these
   locally, never send secrets in chat. Then run the real test-mode rehearsal.
3. **Business name, support email, intended sales countries, customer terms/refund
   policy and purchase-record retention/tax setup.** Replace the draft privacy text.
4. **itch creator account/slug and review of listing/media/AI metadata.** No upload yet.
5. **Approval to deploy the reviewed test service/game, and separately publish itch.**
   Live mode requires another explicit review/change: this executable rejects live
   keys/events, and test entitlements must never migrate into a future live DB.

Ads remain deferred. First look at completion/drop-off by fight, returning browsers
and voluntary upgrade interest. Only investigate providers when those observations
justify the work and the provider explicitly supports the actual host/embed, content,
age audience and consent model. No arbitrary engagement threshold or provider was chosen.
