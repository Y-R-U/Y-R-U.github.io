# Interface checkpoint
Status: implemented, syntax verified; root browser integration passed initial desktop + 320/390/430 captures.
Owned files: index.html, style.css, js/app.mjs.

## Direction
NIGHTSHIFT / Idle Transport 2, warm ivory and deep navy operations dashboard. Orange signals investment, lime signals income. Panoramic live transport feed, shared row cameras, landscape world progression map and accessible dialogs. No external fonts/assets.

## Features wired
- Live cash, unattended network/sec, deliveries, permanent reputation bonus.
- Region-specific route cards with shared progress, fare, journey stage, route level, fleet and delivered count.
- Upgrade, expand fleet, manager, dispatch; controls use game stats for affordability and caps.
- Main camera pin from any open row; auto-tour control and changing hero caption. All operations / This region toggle lets the main camera tour every unlocked route across the company; region selection returns the list to that region.
- World map with region unlock requirements, region switch; research prerequisite states; contract progress and reward claim.
- Legacy/prestige preview and confirmation; economy explains reset.
- How-to guide, battery quality, optional synthesized sounds, automatic persistence, JSON export/import, offline earning notice.
- window.transport2={game,scenes} for root harness.

## Validation
node --check js/app.mjs passes. Root browser harness passed initial desktop/mobile startup, simulation/save checks, no overflow and no runtime/network errors. Reviewed desktop and 320px captures. Root owns final interaction checks and visual captures.
CSS handles 320/390/430 widths and all controls have min-height44. Route row uses full width 176px scene on small mobile, 210px left scene on desktop.

## Resume details
Economy action callbacks trigger render. Structure updates on region/unlock; scenes.setRoutes called only when structure changes. Main event loop ticks economy and paints HUD periodically; module scenes owns actual visual RAF. Hidden state saves immediately; returning calls game.resumeAway for manager-only earnings capped at 4/8h without a reload. 12s automatic economy persistence.

## Next
Root: final interactive browser checks and clean screenshot registry (wait for transient import toasts to expire). Shared fixed canvas corner masks are implemented in CSS to preserve panel rounding.

## Final root review fixes
Extended root harness passed 18 interaction and scene checks without errors. Hero focus updates title and bottom journey/pin caption immediately. Planning refresh restores keyboard focus with preventScroll:true and preserves window scroll coordinates while replacing content.

Route camera pinning reveals the main hero with a smooth scroll; reduced-motion preference uses an instant scroll. Unpinning leaves the current position unchanged.

## Compact cockpit revision
Header, scene with overlaid accounts, and region/filter heading remain stationary outside the operations scroller. Explore world sits bottom-left of the main scene. Portrait cards use a 100px scene beside route info and full-width 44px controls below. Scrolling first folds the main view; three active cards enable a smaller 118px view. Native DOM presentation canvases keep scenes attached during scrolling. Layout suite verifies two full rows at top and three after folding at320x740,390x844,430x844.

## Scene-wide earning and Fleet planning
Earn by tapping the main scene; the anchored work button has been removed. Floating Tap to earn guidance, ring/rising cash and bounded world sparkles communicate input. Swipes, multi-touch, camera/world/event buttons never earn. Keyboard Enter/Space also works. Fleet tab provides queued policies and mastery progress without enlarging portrait route rows. Browser native tap highlight disabled.

## Business scene expansion checkpoint
Status: implementing new wide live business rows. Owns index/style/app.
Work planned: full-card scene with name/info/pin overlays, bottom progress edge, compact icon production/fleet/storage/manager controls and quantity selector. Detailed stats/policy/dispatch in info dialog; manager upgrades/tools in manager dialog; season panel. Preserve existing stationary collapsing cockpit and tap exclusions. Awaiting economy bulk/manager/tools/season contract.

## Business scene expansion completion
Implemented full-width live business scenes, title/info/pin overlays, journey border, production/fleet/storage/manager icon controls and global x1/x10/max purchasing (default x1). Portrait rows are206px at top and164px after cockpit fold, retaining the two/three-row target. Buttons remain44px minimum.
Info dialog contains fares, income, production/storage levels, fleet, cargo capacity/stock/rate, deliveries, manager state, mastery, dispatch policy, dispatch action and business tools. Owned manager icon opens manager office with level upgrades, slots and matching inventory tools. Fleet tab holds character inventory alongside policy planning. Season tab is playable8min practice/season company with three businesses, upgrades and permanent keepsake rewards.
Selectors: [data-info=route], #route-dialog, #manager-dialog; [data-action=upgrade/fleet/storage/manager/managerUpgrade]; [data-quantity=1/10/max]; [data-action=equip/detach]; [data-tab=season]; seasonal action selectors seasonStart,seasonTap,seasonUpgrade,seasonUnlock,seasonClaim.
Syntax check passes. Root owns browser and layout verification.
Simulation now records pagehide/visibility suspension and resumes from pageshow/visibility once, clearing hiddenAt before credit.
Independent economy adversarial audit reported to root/economy: short hidden intervals don't deduct seasonal timer; failed storage still reports persistenceAvailable; over-capacity save normalization reserves tools that get sliced away. Economy owns fixes and tests.
Lifecycle final review: only first suspend records/saves; repeat pagehide/visibility/freeze does not reset offline timestamp. Resume waits until document is visible, clears marker before award, and handles pageshow/document resume. Frame loop refuses simulation ticks while suspended. Independently checked all bulk tracks against repeated single purchases and partial affordability; passed.
Visual review: mobile430, business info and manager office captures inspected. Improved disabled icon/cost contrast over terrain. Character tools remain accessible before owning first business. Matching tools attached elsewhere offer detach for transfer.

Final obstruction polish: business name is a single ~30px pill with no cargo/index row. Quantity buttons retain44px targets but render20px visual pills with clear backgrounds around them. Upgrade controls use55% dark glass with high-contrast price text. Toasts capped at1 portrait/2 desktop and portrait uses a single compact truncated line. Existing206/164 row sizes and two/three visible scene targets unchanged. Syntax passes.
Season tap feedback suppresses repeated toasts and shows a short floating +coins label at the seasonal action. Season header displays its Oct15–Nov2 UTC calendar from seasonInfo timestamps, alongside practice availability. Syntax checked.
