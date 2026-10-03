# Idle Life 2: UI lane (L4)

Owns `index.html` (outside the boot guard), `style.css`, `js/ui/*`, `js/state/format.js`, `tools/test-layout.mjs`.
UI reads `game.state` / `game.data` and writes only through `game.act`. `ui/model.js` is the single adapter over the real L1 shapes (CONTRACT "L1 economy"); there are no missing-field fallbacks any more.

## Files
| File | Role |
|---|---|
| `app.js` | Composition: DOM shell, hero/card taps (`host.pick` → event / courier / pile / bin / hustle), reveal rules, card modes, jump dock, tabs, game-event reactions, job scheduler |
| `model.js` | Read-only adapters (stats, quotes, managers, items, goals, life, retire preview, season, keepsakes) |
| `hud.js` | Rolling cash counter (snaps on big drops, e.g. retire), income/s glow, 🎟️, age/gen/family chip, 🎃, ⚙️ |
| `linecard.js` | Line card: diorama, badge, ⓘ, 📌, themed glyphs from `quote()`, hold-to-buy, ghost/compact modes, order chip, `.prog` progress leaf |
| `reveal.js` | Persistent reveal flags (lazy conditions) + the coach (tag parented to its target, never measured per frame) |
| `sheets.js`, `kit.js` | Bottom sheet stack, docked right panel on desktop; buy rows, toggles, segments |
| `lineinfo.js` | ⓘ sheet: stats, milestone bar, level/staff/boost/shelf, supply link (buy + switch source), manager row, night shift, pin |
| `manager.js`, `crew.js` | Manager sheet (stars, trait, level-up with 🎟️, slots, bag, select→equip, merge 3, auto-equip); Crew grid |
| `life.js` | Home + next home, partner choice, kids (stage, `kidWork` select, talent), dog adoption, retire preview, Pass-it-on ceremony (heir → heirloom, skipped when the bag is empty → portrait), family wall + heirlooms |
| `goals.js` | 7-day gift, contracts, daily goals, achievements |
| `gate.js` | Next-district card under the list: tap buys the permit; when contracts block it, the unfinished ones are listed inline with progress |
| `face.js` | Inline-SVG chibi portraits (crowd palette) for partner choices, kids and heirs: face + name first, perk second |
| `season.js` | 🎃 sheet (rank track, keepsakes → You / line / manager) and the in-season card list (`season:<id>` views) |
| `town.js` | Town tab = `heroRig.town(true)`; district pins projected over the 3D world (positioned with the `translate` property so their CSS animations can't move them), permits; a world tap flies there |
| `events.js`, `minigames.js` | Events are 3D markers (L2); UI claims on pick and shows an edge chip when the event's plot is off-frame. Rush Hour (targets around the plot, `miniStart`) and Lucky Delivery (`miniStart`, 3 hits) |
| `offline.js`, `postcard.js` | "While you were away" card (per-line cash, 🍬, cap hint); 📷 postcard PNG |
| `juice.js`, `audio.js`, `toast.js` | Coin arcs, aggregated floats, stamps, rings; WebAudio SFX (unlocked on click/touchend/keydown); toasts |

## Wiring to L1/L2 (P3 integration)
- Hero tap: `host.pick('hero')` → `event` → claim / mini-game; `courier` → `act('courierTap', {lineId, shipmentId})`; bootstrap `bin` target → `cashCans`; `pile` → `tapPile`; else hustle `tap`. Card taps pick on `line:<id>` the same way before `tapPile`.
- Town mode tap → `town.close()` then `heroRig.flyTo(lineId ?? nearestPlot(point))`.
- `graphics:paused` → centred chip → `host.restart()`, else reload with `?v=`. `graphics:resumed` hides it.
- Settings quality → `host.setTier('auto'|'battery'|'high')`; the saved tier is applied at mount unless `?tier=` is set.
- Compact strips (opt-in setting only) → `host.setViewFps('line:'+id, 4)`; 0 when expanded.
- Toasts for `item` (crates outside mini-games), `achievement`, `order:done`, `life:offer`, `season` rank, dog-fetched pigeons; postcard offer pulses 📷 on life beats.

## Performance rules (S22 412×915, CPU 4×: ui.update p95 0.9 ms, whole rAF p95 5.7 ms)
- No layout reads in rAF. Geometry (`geo.viewW/viewH`, doc height) comes from ResizeObservers; hero visibility (`heroOn`) from an IntersectionObserver.
- Per frame: cash counter, one `--p` var on each visible card's `.prog` leaf (quantised, skipped if unchanged), bin position during bootstrap, mini-game/town positions.
- Everything else runs as round-robin jobs (`runJobs`, ≤ ~0.8 ms per frame): visible cards 4 Hz / others 1 Hz (≤3 per slice), core HUD/tabs 4 Hz, events 6 Hz, open sheet 4 Hz, gate 2 Hz, hints 2.5 Hz. `textNow()` runs all of them immediately after player input (outside rAF).
- Animations restart via class remove + rAF re-add, never `offsetWidth`.

## Scrolling layout (2026-10-04, Aaron's S22 feedback)
- Phones/tablets (<900 px): the hero is an ordinary block under the fixed HUD and scrolls away with the page (no sticky hero, no fold). Hero and every line card are `--view-h` tall (`clamp(250px, 57vh, 640px)`; tablet `clamp(300px, 55vh, 680px)`, single column), so fewer than two views are ever fully on screen. Desktop keeps the fixed left hero; side cards are `clamp(260px, 47vh, 440px)`.
- Fewer on-screen views means fewer renders: the host skips views outside the viewport, including the hero (`heroRenders` stays 0 while it's scrolled away), and pre-paints within its `rootMargin: 100%` IO band, so cards scroll in already painted (blank max 0 ms). Demo save, 6 s scroll at 412×915: visible views max 8 / avg 6.3 → **max 3 / avg 2.6**; renders per frame avg 2.4 → 0.9; fully-visible views max 6 → 1. Desktop: max 7 / avg 5.9 → max 5 / avg 3.9.
- Jump dock (`.jump`, bottom-left above the tabs; top-right of the hero on desktop): ⤒ (hero away), ⤓ jump to the bottom (ghost card + gate), and a ×1/×10/MAX cycle button while the hero's qty bar is off-screen. Tapping the HUD cash, or the Lines tab again, also scrolls to the top.
- Events with the hero away: edge chips hide and a fixed `.ev-float` chip under the HUD shows the soonest event (emoji, `+N`, timer bar). A tap scrolls to the top and cuts to the event. Mini-games jump the page to the hero before they start, even when they were triggered from a card pick.
- `test-layout` now asserts, mid-list on every phone/tablet viewport: <2 views fully visible, hero not in `visibleViews`, jump dock shown.

## Hold-to-look (`look.js`, 2026-10-04, Aaron's S22 ask)
- Hero and every full line card: press still for 240 ms (moving > 8 px first = cancelled, so a swipe is a native scroll and a short press is a tap) → look mode: `haptic(8)`, a soft inner vignette + a ring under the finger (`.look-veil`, inserted right after the view so badges/glyphs stay on top). Drag orbits (full view width ≈ 130° yaw, height ≈ 80° pitch); a second finger pinches zoom. Release → the camera holds 1.5 s then eases back (cameras.js `createOrbit`).
- Scroll is blocked only while engaged: a non-passive `touchmove` on the view calls `preventDefault` only when look mode is on. The tap after a look is swallowed by a capture-phase click guard on the card/hero (400 ms). `contextmenu` is suppressed during a press; views are `user-select: none; -webkit-touch-callout: none`.
- While a card is looking or easing back: `host.setFocus(line)` + `setViewFps(view, 60)` + `markDirty` per frame; restored to `setFocus(pinned)` / fps 0 afterwards. The hero tour is paused for the same span. Blocked in town mode and during mini-games; ghost/compact cards never look. Mouse: same hold-drag; the wheel is untouched.
- Not wired: Hollow's Eve `season:` cards (season.js owns them; they share the base plot's card rig, so `look.attach(view, card, 'season:'+id, () => host.world.cardRig(basePlot).orbit)` would be the whole hook).
- `node tools/test-look.mjs` (CDP touch at 412×915 + desktop mouse): tap still clicks, hold engages, drag orbits with no scroll, all 7 probes on world ground at extreme drags, pinch, re-grab during the hold, release holds then eases back to the exact pose, director shot unchanged, fast swipe scrolls, mouse hold-drag + wheel. Shots `docs/shots/look-{hero-mid,hero-extreme,card-mid,card-extreme,desktop-mid}.png`.

## Onboarding (P4)
One coach at a time (queue), each shown once and stored with `act('hint')`. Order of discovery: tap → bin → first stand → **pile** (as soon as stock appears, stays until a pile is sold) → shelf badge → ⬆ level → qty → pin → new tabs → **Move in!** on Life whenever the next home is affordable → 🎟️ tickets / 🎁 gear / ✨ merge on Crew → 📷 postcard at the first life beat. 3D-only things get a **hero tip** (dark chip under the hero label, tap to dismiss): couriers, golden pigeon (once), Rush Hour and Lucky Delivery (every spawn). Rush starts with a stamp + "Tap customers!" header.
- Hero label: persistent chip at the top of the hero (stays visible above sheets), names the shot (`Your bench` / `Home · <home>` / line / season variant).
- Toasts: emoji + short words (≤5), never emoji-only.
- Class names: transient animation classes are scoped (`card-flash`, `cam-flash`) and removed on `animationend`; never add a bare global class to a card.
- Phones (<640 px): card badge sits top-left so the glyph row can grow; ×10/MAX shows as a tag on ⬆, the cost stays unclipped.

## L1 P4 follow-up (2026-10-04)
- Gate card: note = `🏆 done/need · <quote.blocked>`; when open-able it says how many finished contracts auto-claim; after `act('permit')` one gold toast sums the `claimed` rewards.
- Homes: `buyRow` accepts `q.lock` (button text, `.locked`); Life sets it to `🔒 age N` while `quote('housing').young`, cost moves into the sub. Coach/tab dot only fire on `affordable` (false while young).
- `life:beat {kind:'heir'}` → delayed warm `beat` toast ("🧑‍🎓 Your niece Dot wants to learn the trade", niece/nephew from `kin(name)` in life.js) + Life-tab coach. Apprentices show "🧑‍🎓 Your niece" and are valid heirs in the ceremony.
- Walk-in sales: unmanaged cards show `Lv · $/s · 📦 %`; ⓘ shows $/s always plus a "🚶 Walk-ins buy 35%" note; manager row sub "Sells far more than walk-ins"; hire toast "hired · sells more".

## Rules the UI keeps
- **Fresh start**: cash, the scene and a ghost 🍋 card only. Every other control appears through play with one coach hint each.
- **Cards**: ≤5 controls (ⓘ, 📌, ⬆ + the 2 most useful of next staff / next boost / 🕴), maxed glyphs hidden. Global ×1/×10/MAX lives once, on the hero.
- **Compact calm lines** are OFF by default (Settings toggle kept, opt-in). **No alert/confirm/blocking nudges**, **desktop ≥900 px** docked layout, **reduced motion** — unchanged.

## Tests
- `node tools/test-layout.mjs [--shots]`: PASS on all six viewports.
- test-boot PASS · test-lifecycle PASS · test-scroll PASS (phone rAF p95 5.7 ms; host-dominated, rises to ~9 ms when the machine is loaded by other agents).
- P3 play-through shots: `docs/shots/integ-*.png` (bootstrap → first stand → Old Town → goals → Suburbs permit → events/Rush/Lucky → couriers → crew/gear → Hollow's Eve → settings → graphics chip → partner/dog/kid → Pass it on → gen 2 → away card).

## Open (other lanes, see CONTRACT Requests)
- L2: null-lineId events spawn off-frame at `home` and stack; tip couriers can't spawn when shipments are at MAX.
