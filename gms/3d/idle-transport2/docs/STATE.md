# Idle Transport 2 — resumable manager checkpoint

Status: miniature logistics challenge implementation complete, 2026-10-04. Last published transport baseline 684ad2dc. Scoped commit/push/Pages publication remains authorized and follows the final verification checkpoint. Preserve unrelated work, including Idle Life 2.

All builders completed; see CHALLENGE.md for direction, ownership and honest comparison. New art kit uses softened forms, procedural grass/road/paving, detailed central depot, landscaped distinct yards, moving workers and teal fleets. Hero/rows still observe one physical scene and identical trucks. Tour now establishes a business then follows its real leader; close pins and steady reduced-motion views are supported. Camera projection checks keep the followed truck in frame.

UI now uses warm paper/ink/teal/copper, inline income badges, lower-right floating controls, named manager portraits, contextual first-$60 guidance, bounded delivery/upgrade feedback and merged rapid tap floats. Optional Priority Freight requires three live route cycles and one loading-window action; the first three completed jobs grant business/manager/character equipment. Offline cannot complete jobs; deadlines expire while away, claims persist exactly once, tools survive prestige, imports/timestamps are sanitized.

Verification: economy and freight Node suites; gameplay28, touch10, expansion9, recovery6, district13, freight-browser8, graphics/camera5 and portrait3 size checks. Recovery includes three real GPU loss cycles and freeze/foreground return. Same high-DPR starter Chrome measurement:458 draw calls versus606 baseline;15-business network929, both about30 scene paints/sec. GPU texture/geometry/static-instance counts remain stable across repeated region changes. These are Mac Chrome measurements, not physical Samsung/Safari proof. Reports/captures live in docs/verification; test fixtures are explicitly progressed saves. Release version20261004-miniature1.

New delivery:
- Resume recovery for visibility, pagehide/pageshow, freeze/resume and GPU loss/restoration; preserved last good images, one restarted RAF, no duplicate offline interval credit.
- Full-width business scenes, small name badges and floating translucent production/truck/storage/manager icons; ×1/×10/MAX with 44px targets. Journey progress becomes the bottom border. Detailed info and manager office are dialogs.
- Golden Harvest has wheat/corn, combine harvesting, moving conveyor/bin/chute, loaded trucks leaving left. Other business types animate matching commodities/machinery. Same physical truck groups/progress in hero and row. Bin grows only up to18% width/24% height and changes color with storage.
- Production/storage/fleet bulk tracks, manager development through level5 and1–3 equipment slots. Nine unique permanent tools can attach/detach to character, business or manager; character tools benefit main and seasonal fares.
- Eight-minute Halloween side company with pumpkin/candy/ghost businesses, separate currency, six milestones and permanent rewards. Practice available now/year-round; official Oct15–Nov2 UTC. Challenge timer expires while away but earns no offline coins.
- Adversarial fixes: short-away seasonal countdown, failed-save status/warning recovery, over-capacity equipment imports, complete once-only lifecycle credits, parked-truck wheel/dust and cargo/loading phase correctness, unobstructed scene focal area, compact mobile toasts.

Current verification: Node economy/validation/audit suite passes; browser28 checks, tap10, expansion9, resume6 and portrait3size checks. Resume test includes three real WEBGL_lose_context cycles and Chrome freeze/active foreground return. Physical phone/Safari remains untested. Reports/screenshots under docs/verification. All final source modules and assets use v=20261004-miniature1.

Ownership remains scenery/scenes, economy/economy, interface/HTML-CSS-app; root owns regression/tools/docs/release. Actual agent sessions may not survive restart; individual checkpoint docs and this file contain the required continuation state. No outstanding implementation blockers.

Public game URL: https://yru.br8t.com/gms/3d/idle-transport2/

## Open the game

http://localhost:8888/gms/3d/idle-transport2/

The established Python site-root server on port 8888 serves this game. Do not start another server on that port. Original Idle Transport at /gms/pwa/idleTransport/ remains untouched.

## Delivered

- One offscreen Three.js renderer paints DOM-attached hero/route canvases. Their shared scene/vehicle positions remain synchronized, and native scrolling/clipping prevents the old fixed-canvas lag.
- Stationary compact cockpit: account HUD overlays the scene; smaller header; Explore world bottom-left; simple region heading. Main view folds from 230px to 156px, or 118px with three active routes, then returns on scrolling to the top.
- Compact portrait route cards retain 44px controls. Two full rows at the top and three full active rows after folding verified at 320x740, 390x844, 430x844.
- Shared real delivery progress, animated trucks and machinery, nine procedural site types, shadows, atmospheric sky, river shimmer, bridges and detailed scenery.
- Twelve-second automatic highlights, camera pins, automatic reveal of the main scene when pinning a row.
- Five regions and fifteen routes. Regional operations and full-network list modes.
- Route upgrades, fleets, managers, hands-on dispatch, ten research projects, eleven milestone contracts, permanent prestige bonuses.
- Scene-wide earning with floating hint/cash, ripples, pooled 3D particles, keyboard access, and gesture/control exclusion. Continued taps build a capped 2x momentum bonus after the first purchase.
- Fleet policies Steady/Express/Heavy haul queue for the next departure; four delivery mastery levels add permanent fares. Depots visibly expand with level, fleet and mastery, while trucks unload returning cargo and kick up subtle dust.
- Fresh companies start closed with $0 and no idle income: twelve taps anywhere on the main 3D scene fund the $60 first company. Existing saves retain purchased companies.
- Random rush/backhaul/supplier opportunities with countdowns, scaling cash rewards, single-claim validation, and no offline spawning.
- Automatic saves, validated JSON backups/imports, capped manager-only offline and background-tab earnings, quality/sound settings and guide.
- Mobile layouts and touch controls, project registry entry and assets/screenshots/idle-transport2.jpg.

## Work ownership and handoffs

- /root/scenery: js/scenes.mjs, docs/SCENES.md — completed.
- /root/economy: js/economy.mjs, tools/economy-test.mjs, tools/economy-pacing.mjs, docs/ECONOMY.md — completed.
- /root/interface: index.html, style.css, js/app.mjs, docs/UI.md — completed.
- Root manager: integration reviews, final browser tests, captures, README, favicon, registry/screenshot — completed.

Contract remains in docs/CONTRACT.md. Individual checkpoint files explain APIs and decisions. Actual agent sessions may not survive a future restart; the files are sufficient to recreate assignments without needing conversation history.

## Verification evidence

- Node syntax checks passed for all game modules and projects.js.
- tools/economy-test.mjs passed: purchases and region gates, research, fleet scaling, dispatch/cooldown, contract single claims, prestige reset, save roundtrip/sanitization, manager-only four/eight-hour offline cap, repeated reload protection and live-tab resume.
- tools/browser-test.mjs passed 28 checks in Chrome, including actual mouse upgrade and camera controls, touch settings, shared progress/vehicle motion, all fifteen routes, twelve-second auto-cycle, pin persistence and battery quality.
- Desktop 1440x1050 and emulated portrait widths 320/390/430: no horizontal overflow; single WebGL renderer with native presentation canvases; no console errors or failed network assets.
- Final fresh tools/capture.mjs run after scenery refinements: ten screenshots, zero console errors, and row camera pin reveals hero.
- docs/verification/report.json records automated checks. docs/verification/desktop.png, mobile-*.png, mobile-routes.png and region-*.png are review evidence. Regional captures deliberately load a progressed test company, not a naturally played save.
- Physical phone/Safari have not been tested. Desktop GPU/browser evidence does not establish phone frame rates. Public release verification follows the Pages deployment in GitHub Actions.
- Automated no-dispatch pacing benchmark: first region ~4 minutes, final region ~58 minutes, all routes ~78 minutes. This is an optimistic automated investment policy, not measured human play.

## Resume commands

From /Users/aaronair/cc/yru/site/gms/3d/idle-transport2:

```
node tools/economy-test.mjs
node tools/browser-test.mjs
node tools/capture.mjs
node tools/layout-test.mjs
node tools/tap-test.mjs
node tools/resume-test.mjs
node tools/expansion-test.mjs
node tools/economy-pacing.mjs
node tools/district-test.mjs
node tools/freight-test.mjs
node tools/freight-browser-test.mjs
node tools/quality-test.mjs
```

Browser scripts require local Chrome/socket access outside the restricted sandbox. TRANSPORT_URL can point the browser scripts at an explicitly requested deployment.

## Change boundaries

Only gms/3d/idle-transport2/, projects.js, and assets/screenshots/idle-transport2.jpg belong to this task. Unrelated changes already existed in games/, tinpot/, and lib/auth/; preserve them. Publication is authorized; release only these files and verify deployment completion and the actual public URL.

Scene-wide tapping expansion: economy tests cover legacy save migration, policy timing, mastery transitions and combo limits. tools/tap-test.mjs verifies actual touch positions, swipe/multi-touch/control exclusion, keyboard earning, continued tapping, policy UI and visible depot progression. Tap FX use bounded DOM nodes and a fixed 24-particle world pool.

Release assets use the same v=20261004-miniature1 query across HTML stylesheet/app and app/scene economy imports to avoid mixing old cached interfaces with new modules. Keep the shared economy import version identical across modules when changing it.
