# CLUED — Team brief (every agent reads this first)

Game folder: `/Users/aaronair/cc/yru/site/gms/2d/clued/` (inside the yru GitHub Pages repo). Read `docs/DESIGN.md`
and `docs/CONTRACT.md` before starting, plus `docs/notes/*.md` from lanes you depend on.

## Hard rules
- **Never `git commit/push/add/stash/rebase/checkout`.** Other sessions share this repo. The manager commits.
- **Only edit files your lane owns** (CONTRACT.md folder map). If you need a change in another lane's file, write it
  under "Requests" in your notes file and the manager relays it. Never touch anything outside `gms/2d/clued/`.
- Plain ES modules, no build step, no service worker, no runtime CDN imports (vendor into `js/vendor/`). A Google
  Fonts `<link>` is fine if the UI degrades gracefully without it.
- No `alert/confirm/prompt`; use styled in-page popups only. Aaron hates blocking modals.
- **Mobile-first portrait** (Samsung S22 Ultra, CSS ~384×854). Landscape (854×384) and desktop (1280×800) must also
  look deliberate, not stretched. Big tap targets, readable type, quick and snappy.
- Comments: sparse, only where genuinely confusing. Small files (prefer < 500 lines).
- Content must be **correct**. Wrong trivia is the worst bug this game can have. Generated facts come from
  structured sources (Wikidata/iNaturalist/Natural Earth), get sanity-checked by a script, and the dodgy ones are dropped,
  not guessed. Hand-written questions need care; when unsure, leave it out.
- Media licences: CC0, PD, CC BY, CC BY-SA only. Record credit + licence + source page for every file.
- Keep `docs/notes/<lane>.md` current: what you built, how to test it, open issues, requests to other lanes.
- Until a dependency lands, code against the contract with a small local stub and delete it once the real module
  exists. Other lanes are writing in parallel.

## Testing
- The local static server is already running at `http://localhost:8888/gms/2d/clued/` (site root). Never start another on 8888.
- Headless Chrome: `~/.claude/bin/cdp start --port <your port>`, driven with raw CDP WebSocket from node (v24 has fetch + WebSocket).
  ALWAYS send `Network.setCacheDisabled {cacheDisabled:true}` or stale ES modules will hide your edits. `cdp stop <port>` when done.
- CDP ports: A 9401, F 9402, M 9403, L 9404, AU 9405, S 9406, C1 9407, C2 9408, QA 9409.
- Screenshot portrait 384×854 @dpr2, landscape 854×384, desktop 1280×800; look at them with the Read tool and judge
  honestly (self-scores run 1.5–2 points high). Test real clicks, not just screenshots.
- Node-testable logic gets `tools/<lane>_test.mjs`. A test must fail when the thing it checks is broken (try it).

## Pause protocol
If the manager messages **PAUSE N**: reach a safe point, update notes, sleep N minutes (`python3 -c "import time;time.sleep(S)"`, S ≤ 540 per call), continue.
