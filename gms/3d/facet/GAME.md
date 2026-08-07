# FACET — the playable layer

FACET started as a graphics test bed. This document is the design for turning it into something you
can actually play, and the contract the game modules are built against. Read `CLAUDE.md` first for
the renderer, the art rules and the module contract that owns the *world*; this owns the *player*.

Everything here lives under `js/game/`. Nothing in `js/world/` knows the game exists.

## Decisions already made — don't relitigate without asking

**Tap to move.** Tap the ground and the character walks there. No virtual joystick. It matches the
RuneScape reference, it works one-handed on a phone, and it is the only scheme that composes
cleanly with tap-to-interact and auto-attack. A joystick would fight all three.

**One tap does everything.** The tap raycasts against the interactable registry first and the
ground second:

| Tapped | Result |
|---|---|
| ground | walk there |
| ground item | walk into reach, pick up into the first free belt-then-pack slot |
| enemy | walk into weapon range, then auto-attack until it dies or you move away |
| villager | walk into reach, greet |
| hotspot | walk into reach, run its action |

**Auto-attack, both ways.** Once a fight starts it continues on the weapon's own swing timer. Taking
damage while idle starts you fighting back automatically.

**Isometric throughout.** The camera never leaves the diorama angle. It follows the player, and drag
still orbits, pinch still zooms — the rig is unchanged, it just gets a follow target.

**Take control.** A button in the HUD picks the nearest villager, eases the camera to them and hands
you the controls. Before that it is a diorama you are looking at, after it a character you are.

## Inventory model

Two zones in one grid. **Belt** first, then **pack**.

- **Belt** — 5 slots, expandable to 10 (two rows of 5). These are the quick-use slots; anything you
  might need in a hurry (health, mana) belongs here, and the game will fill belt before pack.
- **Pack** — 0 slots at the start. Grows in rows of 5 as you equip things with pockets, and a
  backpack. Caps at 8 rows = 40, so **50 total**. Pack slots are drawn a shade darker than belt
  slots so the two zones read apart at a glance.
- The panel is semi-transparent and can be shrunk back to just the belt.
- **Testing shortcut:** tapping the inventory icon cycles the visible size — `5 → 10 → 25 → 50 → 5`.
  This is a test affordance, not the real progression; the real thing is driven by equipment.
- A magic bag is planned later as a *separate* popup inventory, not more rows in this one.

## Equipment slots

Aaron's list plus five additions that earn their place.

```
head        neck        earL   earR      shoulders
back        torso       gloves waist
handL       handR
braceletL   braceletR
ring1 … ring5   (left hand)
ring6 … ring10  (right hand)
legs        feet        ammo
```

25 slots. `back` is cloak-or-backpack — it is the slot that grows the pack. `waist` is the belt
itself, and it is what takes the belt from 5 to 10. `gloves`, `shoulders` and `ammo` are there
because a sword-and-staff game wants them and they cost nothing to add now.

## Skills

Rectangular tiles, not RuneScape's square grid — there are fewer skills and the names are longer.
Each tile shows name, level and an xp bar.

```
Vitality  Strength  Defence
Melee     Magic     Ranged
Gathering Crafting  Cooking
Fishing   Trade     Exploring
```

## Combat

Two weapons for the test, deliberately different in shape:

| | Sword | Staff |
|---|---|---|
| range | 1.9 | 9.0 |
| swing | 1.6 s | 2.2 s |
| damage | 3–7 | 2–9 |
| cost | — | 4 mana |
| delivery | instant on swing | travelling bolt, damage on impact |

Health and mana regenerate slowly out of combat. Damage pops as a floating number. Death respawns
at the village centre.

## Module layout and ownership

```
js/game/state.js    the data layer — player stats, inventory, equipment, skills, events
js/game/items.js    item definitions and their glyphs
js/game/ui.js       every DOM panel: bars, inventory grid, equipment, skills, buttons
js/game/ui.css
js/game/actor.js    the character mesh + walk/attack animation, shared by player and NPCs
js/game/control.js  tap-to-move, ground pathing, camera follow, the take-control button
js/game/combat.js   swings, bolts, damage, auto-retaliate, death
js/game/props.js    ground items, hotspots, and the test dummies to fight
js/game/game.js     wiring; owns the tap raycast and the frame update order
```

## The contract

`state.js` and `items.js` are the stable core. Everything else talks to the game through them.

```js
import { Game } from './state.js';

Game.player            // { pos, hp, hpMax, mp, mpMax, alive, level, skills }
Game.actors            // every living thing, player included
Game.interactables     // tap targets, see below
Game.on(evt, fn)       // 'change' 'pickup' 'damage' 'death' 'equip' 'levelup' 'select'
Game.emit(evt, data)

// inventory — belt and pack are one indexed array, belt occupying the first `beltSize`
Game.inv.slots         // [{ id, qty } | null]
Game.inv.beltSize      // 5 or 10
Game.inv.packSize      // 0…40
Game.inv.add(itemId, qty)      // → true if it fit; fills belt before pack
Game.inv.removeAt(i, qty)
Game.inv.moveTo(from, to)
Game.inv.useAt(i)              // eat/drink/equip depending on the item
Game.equip.slots       // { head: itemId|null, … } — 25 keys, see above
Game.equip.put(slot, itemId)
Game.equip.take(slot)
```

An interactable is a plain object; anything can register one:

```js
Game.addInteractable({
  id, kind,            // 'item' | 'npc' | 'enemy' | 'hotspot'
  pos,                 // THREE.Vector3
  radius,              // tap tolerance in world units
  reach,               // how close the player must stand to act (default 1.6)
  label,               // shown on the tap toast
  onReach(game),       // runs once the player is within `reach`
});
Game.removeInteractable(id);
```

## Testing it

The scene boots as a diorama. `?play=1` takes control immediately and skips the button.
`?give=sword,staff,hpot,mpot` seeds the inventory. `?dummies=4` spawns test enemies.

```bash
node tools/shot.mjs --shot=village_day --set=play=1 --w=1200 --h=800 --dpr=1
node tools/shot.mjs --shot=craft_macro --set=play=1&give=sword --w=1200 --h=800 --dpr=1 --mobile
```

`--mobile` matters here: the app picks its preset off the user agent and its controls off
`(pointer: coarse)`, so a desktop window is not a test of what a phone does.

## Known gotcha, already paid for

Pointer drag on the canvas: do **not** listen to `pointerleave` to end a drag. The pointer is
captured, so a drag that travels past the canvas edge is still ours — listening to it ended every
swipe the moment a finger crossed the bound, which read as rotation moving a little and stopping
dead. The canvas also needs `touch-action: none` or the browser claims the gesture and fires
`pointercancel` mid-drag.
