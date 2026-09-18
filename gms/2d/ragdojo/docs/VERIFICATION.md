# Verification — 8 September 2026

## Passed locally

| Check | Result |
| --- | --- |
| Go payment suite, `go test -race ./...` | 17 tests passed; no race reported |
| `go vet ./...` | Passed |
| JS services, `node --test tools/services.test.mjs` | 18 tests passed |
| Existing `progressgate.mjs` | 18 checks, 0 failures, no console errors |
| Existing `darkgate.mjs` | 36 checks, 0 failures, no console errors |
| Existing `stuckgate.mjs` | 10 checks, 0 failures |
| Built itch release in Chrome | Guest fight, premium denial despite forged save flags, legacy DARK progress retained, developer hooks/cheats disabled, portrait layout, no external requests, no runtime errors, 12-second no-reload check |
| Built home release, account services unavailable | Same guest/fail-safe checks passed |
| Built home with local account/API fixtures | Two isolated Chrome profiles restored the same UID's save and purchase; DARK fight started; refund removed access and retained progress; switching accounts required save choice; 12-second no-reload check; no runtime errors |
| Build/archive | Root index.html; relative assets/local fonts; 25 itch files; allowlist and every SHA-256 manifest entry checked; no environment/database/source-map/raw-take files |
| Go deployment artifact | Linux x86-64 ELF, statically linked, prepared locally |
| Shell/JS syntax, Git whitespace checks | Passed |

Payment coverage includes anonymous/invalid identity rejection, cross-origin denial,
live key/event rejection, missing/expired signatures, fixed server price/UID,
repeated Checkout reuse, concurrent duplicate fulfillment, separate-user access,
DB reopen/restoration, unpaid and delayed payments, wrong Price/session mode,
refund-before-payment ordering, full/partial/pending/failed refunds, open/lost/won
disputes, API failures/retries, transaction rollback, multiple valid purchases,
re-purchase after refund, and metric validation/deduplication.

Save/purchase coverage includes fresh-device cloud adoption, guest progress upload,
failed cloud reads, explicit two-save choice, cancellation after identity changes,
remote advancement, stable revision/no repeated adoption, safe-menu application,
transaction failures, independent server ownership, offline fail-closed premium,
refund refresh, fake return URLs and untrusted Checkout URLs.

Browsers used isolated headless Chrome profiles with Metal requested through the
existing CDP harness. This verifies desktop Chrome behavior and emulated viewport
layout; it does not establish physical-phone performance. The rotated-phone upgrade
capture was visually inspected; its close button and main-site link fit on screen.

Artifacts: `dist/home` approximately 20.27 MB; `dist/itch` approximately 12.32 MB
unpacked. Combined minified home JavaScript approximately 124 KB, versus 239 KB of
readable game modules. Most transfer size is music, which the existing game loads
as needed. The deterministic upload ZIP is `dist/ragdojo-itch.zip`; manifests carry
exact byte counts and SHA-256 checksums. Readable sources are retained.

## Honest boundaries / remaining release checks

- No real Stripe keys/Price were configured; no hosted Checkout payment or Stripe
  CLI delivery was performed. Go tests use a local Stripe fixture and real SDK
  webhook-signature verification. Verify the configured product/Price, API version,
  email receipts, test success/cancel/decline, delayed webhook, resend and refund.
- Browser account tests replace auth/Firestore with explicit local fixtures.
  They do not prove actual Google popup/email link, Firebase Admin credential IAM,
  token revocation, Firestore rules/transactions, or provider persistence. Rehearse
  those with the existing Firebase project after private configuration, including
  two-device save conflict, real sign-out/account change and offline/reconnect.
- No server/DNS was changed. Verify actual port availability, Caddy routing/cache
  behavior, webhook reachability, runtime permissions, backups and restore. Do not
  claim a deployed service or working public URL from these local checks.
- No itch project was created/uploaded. Test iframe storage restrictions, real touch,
  mobile rotation, fullscreen, audio and the outbound home link in itch's draft
  preview. Verify creator metadata, cover crop, screenshots and AI disclosure.
- Business/support/privacy terms, tax treatment and purchase-record retention are
  unfinished. The privacy page is explicitly a review draft. Price/currency absent.
- Live keys/events are refused by this implementation. A later live release needs
  explicit approval and separately isolated live configuration/data and entitlement
  semantics. Do not copy test purchase rows into live ownership.
- The public client and historical free versions are modifiable. Minification and
  UI gates do not provide DRM. Purchase database integrity is the security boundary.

Unrelated existing site-root `index.html` changes were not edited, reverted or
committed. No secrets were added to a release artifact. Nothing was committed,
deployed, published, purchased or enabled in live mode by this work.
