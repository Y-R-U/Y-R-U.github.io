# DEADTAP — "I tap Flashcards and nothing happens until I refresh"

Aaron, Android Chrome, 2026-10-10: *Sometimes when I go to flashcards I click on it and it doesn't work until I refresh
the page. I think other buttons can have the same problem.*

## The real cause: a tab left open across a deploy loads a second copy of the screen manager

games.br8t.com sends `cache-control: no-cache` for js and ignores the `?v=` query, so any module a page fetches for the
first time *after* a deploy is the new file, whatever `?v=` the old page asked for. Learn and Online are lazy
(`import('../learn/index.js?v=OLD')`), so after a deploy:

1. the old shell imports `learn/index.js?v=OLD` and gets the **new** file;
2. the new file statically imports `../ui/app.js?v=NEW`: a different URL, so a **second, fresh instance of app.js**
   with `root = null` and an empty screen table;
3. Learn's hub renders fine (the old shell builds it), but every tile on it calls the *new* instance's `go()`, which throws
   `TypeError: Cannot read properties of null (reading 'querySelectorAll')` inside the onclick. Nothing visible happens.
   Learn's Back button hits the same copy ("no screen home"), so the player is stuck on Learn until a refresh.

Online had the identical failure (`net/index.js` → `go('online')` on the second app.js). Reproduced at 384×854 with real
CDP touch events and the HTTP cache on: pre-fix code fails 13 of 16 checks in `deadtap_e2e stale` (stuck on Learn
from the second tap onwards).

**Second real cause (flaky mobile data):** `ui/net.js` cached a *failed* import as `null` forever, so one dropped
request turned Learn into "Coming soon" and Online into "Coming soon" until a refresh; Learn's own lazy screens and
Chrome both remember a failed module URL, so a Flashcards load that failed once failed on every later tap.
Pre-fix: 5 failures in `deadtap_e2e netfail`.

**Not causes (checked, nothing found):**
- *Invisible overlays.* Every fixed/absolute full-screen layer already has `pointer-events: none` or is removed:
  `.screen.leaving`, `#popups` (toasts inherit none, `.pop.out` none, removed after 220 ms), confetti canvas (none,
  removed when its animation ends), `#boot.gone`, `.net-link-dot`, lib/auth's pester pill (a small pill, not a scrim).
  The new `window.__clued.hits()` sweep found zero intercepted points on 20 screens/states (learn tools, credits,
  stats, settings, daily, setup, play, reveal card, results with confetti running, popup open / 30 ms / 330 ms after
  close, toast) and across 570 stress taps. Falsified: an injected `canvas.confetti` with `pointer-events: auto` is
  flagged at 50/50 points and does eat the Learn tap.
- *Stuck navigation locks.* `go()` has no busy flag; with consistent modules 10 rounds (170 taps) of the stress loop pass
  on the pre-fix code too, and double-tapping Start doesn't start two runners. The only "lock" was the null `root`
  above. One latent race was fixed anyway (below).

## What changed

- **`js/ui/app.js`**: nav state lives on `globalThis.__cluedNav` (the same pattern packs.js and registry.js already
  use), so a duplicate app.js instance drives the same screens. `go()` keeps a per-call token: if another `go()` took
  over while a screen was still building, the stale build's cleanup runs and its guard/cleanup no longer get attached
  to the newer screen. A failed build shows "Something went wrong" with **Retry** (`data-act="retry"`) plus Home, or
  **Refresh** when it was a module load error. Never blocks later navigation.
- **`js/ui/update.js`** (new):
  - `lazyImport(url)`: import, then one retry on a fresh `&r=` URL (Chrome caches a failed module URL), then a banner.
    A success removes an error banner.
  - Banner (`.upd-banner`, top centre, non-blocking, between the back button and the account avatar):
    "Clued has been updated · Tap to refresh" (`data-kind="upd"`) or "Couldn't load that part of Clued · Tap to refresh"
    (`err`). Tap = `location.replace(pathname + '?<existing params>&v=' + Date.now())` (drops the hash so a `#lc=`
    challenge doesn't reopen).
  - `watchVersion()`: a `PerformanceObserver` flags any of our js/css fetched with another build's `?v=` (a mixed page);
    on `visibilitychange`→visible and every 10 min (while visible) `fetch('js/build.js?t=…', { cache: 'no-store' })`.
    Newer build on **home** with no popup / sign-in scrim open → silent reload; anywhere else (games, online rooms,
    Learn) → banner only, never a reload. Polling is off under `?test`/`?noauth` unless `?vcheck` is added (other
    lanes' e2e runs would otherwise reload mid-test when someone bumps BUILD); the observer and banner always run.
  - `checkVersion()`, `updateState()` exposed on `window.__clued`.
- **`js/ui/net.js`**: `loadNet`/`loadLearn` go through `lazyImport` and forget a failure, so the next tap retries.
  `loadLearn` now rejects (the 'learn' screen shows Retry) instead of resolving null ("Coming soon").
- **`js/ui/settings.js`**: 'learn' screen no longer falls back to "Coming soon" (Learn shipped); 'online-soon' is now
  "Couldn't connect · Retry" for when js/net/ fails to load. `comingSoon()` removed.
- **`js/ui/home.js`**: unchanged behaviour (Online still lands on 'online-soon' when net fails, which now has Retry).
- **Lane L** (`js/learn/index.js` screen loader, `progress.js` map, `explore.js` map, `ui.js` clip player): lazy imports
  go through `lazyImport` (the clip loader also forgets a failure).
- **`js/main.js`**: `watchVersion()` after `mountApp`; test hook `window.__clued.hits({ cols, rows })` →
  `{ screen, bad: [{ x, y, el }] }`: what `elementFromPoint` hits on a grid, flagging anything that isn't inside the
  live screen, an open popup, the update banner or the account widget.
- **`css/base.css`**: `.upd-banner` styles.

## How to test

`~/.claude/bin/cdp start --port 9500 -- --use-angle=metal`, then `node tools/deadtap_e2e.mjs [stale,netfail,vcheck,stress] [rounds]`.
It serves a temp copy of the game on :8932 (so it can bump BUILD under an open page and 503 single modules) and uses
real `Input.dispatchTouchEvent` taps at 384×854. `stale` and `vcheck` run with the HTTP cache **on** (that's the bug);
`netfail`/`stress` with it off. `CLUED_SRC=<dir>` runs it against another copy of the files: against the pre-fix files
it fails 18 checks (stale 13 + netfail 5), against the fix it passes.

## Results (2026-10-10, BUILD 202610100431, not bumped)

- `deadtap_e2e stale,netfail,vcheck,stress 30`: all passed (stale 16/16, netfail 11/11, vcheck 6/6, stress 30 rounds =
  570 real touch taps through Learn → Flashcards, Stats, Settings, Online and a quick game (start, answer, quit), every
  tap navigated, zero overlay hits). Pre-fix files: 18 failures.
- a_test 467/0, l_test 60/0, stats_test 63/0; l_e2e portrait all passed; a_e2e portrait all 11 scenarios ok.

## Open / for the manager

- Needs a BUILD bump + deploy (manager). The fix only helps pages loaded *after* it ships: a tab already open on the
  old build can still hit the dead Learn tiles once more. After this deploy every later one is covered.
- The `?v=` on `index.html` itself is never sent by the server; reloads rely on `no-cache` revalidation of index.html
  (games.br8t.com) or the `?v=<now>` page query (GitHub Pages, max-age 600).
