# Idle Life 2: UI lane (L4)

Owns `index.html` (outside the boot guard), `style.css`, `js/ui/*`, `js/state/format.js`, `tools/test-layout.mjs`.
UI reads `game.state` / `game.data` and writes only through `game.act`. `ui/model.js` is the single adapter over the real L1 shapes (CONTRACT "L1 economy"); there are no missing-field fallbacks any more.

## Files
| File | Role |
|---|---|
| `app.js` | Composition: DOM shell, hero/card taps (`host.pick` → event / courier / pile / bin / hustle), reveal rules, card modes, fold, tabs, game-event reactions, job scheduler |
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
- Compact strips → `host.setViewFps('line:'+id, 4)`; 0 when expanded.
- Toasts for `item` (crates outside mini-games), `achievement`, `order:done`, `life:offer`, `season` rank, dog-fetched pigeons; postcard offer pulses 📷 on life beats.

## Performance rules (S22 412×915, CPU 4×: ui.update p95 0.9 ms, whole rAF p95 5.7 ms)
- No layout reads in rAF. Geometry (`geo.viewW/viewH/spacerH`) comes from ResizeObservers; the fold is computed (`heroH = viewH − fold`, `offY = −fold/2`). `--fold` is set on the hero only, not `:root`.
- Per frame: cash counter, one `--p` var on each visible card's `.prog` leaf (quantised, skipped if unchanged), bin position during bootstrap, mini-game/town positions.
- Everything else runs as round-robin jobs (`runJobs`, ≤ ~0.8 ms per frame): visible cards 4 Hz / others 1 Hz (≤3 per slice), core HUD/tabs 4 Hz, events 6 Hz, open sheet 4 Hz, gate 2 Hz, hints 2.5 Hz. `textNow()` runs all of them immediately after player input (outside rAF).
- Animations restart via class remove + rAF re-add, never `offsetWidth`.

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
- **Compact calm lines** (default on from 6 lines), **fold**, **no alert/confirm/blocking nudges**, **desktop ≥900 px** docked layout, **reduced motion** — unchanged.

## Tests
- `node tools/test-layout.mjs [--shots]`: PASS on all six viewports.
- test-boot PASS · test-lifecycle PASS · test-scroll PASS (phone rAF p95 5.7 ms; host-dominated, rises to ~9 ms when the machine is loaded by other agents).
- P3 play-through shots: `docs/shots/integ-*.png` (bootstrap → first stand → Old Town → goals → Suburbs permit → events/Rush/Lucky → couriers → crew/gear → Hollow's Eve → settings → graphics chip → partner/dog/kid → Pass it on → gen 2 → away card).

## Open (other lanes, see CONTRACT Requests)
- L2: null-lineId events spawn off-frame at `home` and stack; tip couriers can't spawn when shipments are at MAX.
