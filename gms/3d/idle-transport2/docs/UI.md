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
