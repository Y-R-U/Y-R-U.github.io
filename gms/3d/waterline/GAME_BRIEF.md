# WATERLINE — game brief

*Working title. A mobile-first Three.js game built on classic Battleship.*
Named for the line a shell has to hit to sink something — and the line between a hit and a miss.

**Location:** `~/cc/yru/site/gms/3d/waterline/` (GitHub Pages, no build step)
**Reference plates:** `~/cc/yru/gms/3d/aaa_refs/naval/` — read its `README.md` first
**Graphics prior art:** `~/cc/yru/site/gms/3d/forge/` — read its `CLAUDE.md` first

---

## The pitch

You are on the bridge of a battleship. In front of you is an electronic planning table — a lit
grid, the peg board's modern descendant. You mark a target. The camera flies out of the bridge
window, watches your guns fire, and **follows the shell through the air** to a towering splash or
a hull-tearing explosion. Then the enemy fires back and you watch, from your own deck, exactly
which of your ships takes it and where. Camera returns to the bridge. Your turn again.

The whole game is that loop. It has to feel expensive and it has to run at 60fps on a mid-range
phone.

---

## Game rules

### Modes
- **Classic** — Battleship's own grid (10×10) and fleet (5, 4, 3, 3, 2).
- **Custom** — grid size and ship set both configurable, within sane limits.
  - Grid: sensible min/max (planner to pick — suggest 6×6 … 16×16).
  - Ship sizes: 1 … min(gridW, gridH). A size-10 ship is fine on a large grid.
  - Ship count: bounded so the fleet can always be placed (occupancy cap).
- **Single player** — vs AI.
- **Single-player tournament** — a ladder/bracket of AI opponents of rising difficulty.
- **Multiplayer** — built but *dormant*. Only lights up on games.br8t.com (shared Firebase auth
  layer at `/lib/auth/`). Must not be reachable or broken-looking on GitHub Pages.

### Bullet / ordnance size (the twist)
| Size | Footprint | Ordnance |
|---|---|---|
| **1** (default) | the single targeted cell | shell |
| **4** | the 2×2 block at the intersection the player taps | heavy shell |
| **9** | targeted cell + all 8 neighbours | missile / heavy salvo |

Bigger ordnance should look bigger in flight — larger shell, or a missile with a smoke trail.
The larger footprints need their own targeting affordance on the table (you are picking a corner
or a centre, not a cell).

---

## The camera loop — this is the game's whole first impression

1. **Opening flyover.** Camera sweeps your fleet at sea, then flies *into* the bridge and settles
   overlooking the planning table.
2. **Bridge / board view.** The table is the brightest thing in a dark room. Ship controls, glass,
   crew silhouettes visible behind it. **You can look around** — drag to pan the view. After a few
   seconds of no input the camera eases back to the board. (Ease, don't snap — a hard snap on a
   phone reads as a bug.)
3. **Fire.** Camera flies out the window, watches your guns fire (muzzle bloom, recoil, drifting
   smoke), then **follows the shell** on its arc toward the enemy.
4. **Disclaimer caption.** Above the shell in flight, a very short line making clear that the ships
   and impact points shown are dramatisation, not the true grid positions. Keep it as short as
   language allows — a few words, not a sentence.
5. **Impact.** Miss → tall splash column, hang, collapse into mist and a spreading foam ring.
   Hit → flash, black smoke column, fire that persists on the hull and lights the water around it.
6. **Enemy turn.** You see the *enemy* ships fire, and because these are *your* ships you see
   exactly which one is struck and where — with a red indicator marking the spot.
7. Camera returns to the bridge for your next turn.

Every one of those beats must be **skippable/fast-forwardable**. A player on turn 40 does not want
the full cinematic each time. Assume a "hold to skip" or an auto-shorten after N turns.

---

## Constraints

- **Mobile first.** Mid-to-high-end phone, 60fps. Portrait-capable; landscape is the hero.
- **Three.js, no build step.** ES modules + importmap, matching the rest of the repo.
- **GitHub Pages playable** in single-player from day one.
- **Comment style:** Aaron has ADHD and finds comment noise hard to read. Comment only what is
  genuinely non-obvious — a formula, a Three.js quirk, a unit you can't guess. Never restate what
  a line does. No section banners, no JSDoc blocks.
- **projects.js entry** goes in at ship time, not before.

---

## How work is judged

Every visual component is scored **blind** against a real AAA reference plate by a critic agent
that is not told which image is ours. See `~/cc/yru/gms/3d/aaa_refs/naval/README.md` for the plate
set and the shot map.

**The gate: our render must score within 2.0 points of the reference plate's own blind score.**
The critic scores *both* images, so the bar is self-calibrating — if the critic is harsh that day,
it is harsh on both.

Each component gets **3 passes**. Pass → move on. Fail three times → record the score, keep the
work, move on anyway; it stands as phase 1 and we revisit later.

The named shots to be built and scored are listed in section 02 of the reference board.
