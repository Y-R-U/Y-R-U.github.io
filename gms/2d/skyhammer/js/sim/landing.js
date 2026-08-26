// Auto-land and take-off scripts. CONTRACTS §9.

import { refuel } from './plane.js';

const SETTLE = 1.2, LAUNCH = 1.0;

/**
 * THE APPROACH GATE.
 *
 * Aaron, after flying the derived-window version: *"it should be fairly simple. it should be a
 * small square at the start of the boat a little above and a little to the left of the boat, you
 * need to be moving toward the boat (not away) and that's is about it... as long as you are moving
 * toward boat and hit the small square you are good, almost cheat mode auto land. but if the box
 * is pretty small like 40px x 40px then only hitting the box when moving the correct direction is
 * the challenge."*
 *
 * So the difficulty is ALL in placing the aeroplane, and none of it in a checklist. There were
 * three other conditions here — speed below landSpeed, wings level, not climbing — and every one
 * of them was invisible: the box went amber and you were not told which of the three had failed,
 * or by how much. A small target you can see is a better test of flying than three thresholds you
 * cannot. Two conditions remain, and both are things the player can read off the screen:
 *
 *   1. your centre is inside the square
 *   2. you are moving toward the ship (vx > 0; the square sits off its left end)
 *
 * The numbers:
 *
 *  - `size` 90 world units. `camera.js` renders VH = 900 world units of height, so the on-screen
 *    size is 90 * H/900 = H/10: about 40 CSS px on a phone in landscape, which is the size Aaron
 *    asked for, and it scales with the viewport instead of being a px constant the sim cannot see.
 *  - `lead` 20 units left of the deck's left end, so the square straddles the start of the boat —
 *    65 units of it out over the water, 25 over the deck.
 *  - `rise` 55 above the deck. With the half-size that is a band of deckY+10 .. deckY+100; the
 *    settle parks the aeroplane at deckY+12, so the bottom edge is "already down" and the top is
 *    about two aeroplane-heights up.
 *
 * The one thing that is still derived rather than chosen: the square has to sit where the settle
 * ROLL-OUT finishes on the ship. stepScript flies landSpeed -> 0 over SETTLE seconds, carrying the
 * aeroplane landSpeed * SETTLE / 2 further along the deck — 148 units in a kestrel, 269 in a
 * vector. Trigger anywhere in this square and the touchdown lands between pad.x-87 (slowest, from
 * the square's left edge) and pad.x+124 (fastest, from its right edge), both comfortably inside
 * the deck's -170 .. +170. That is checked for every tier by tools/landing_gate.mjs, and it is why
 * the square is at the START of the boat rather than the middle: put it amidships and the fast
 * tiers roll off the bow.
 */
export const GATE = {
  size: 90,     // world units, square. ~40 CSS px on a phone: on-screen px = size * H / 900.
  lead: 20,     // centre this far LEFT of the deck's left end
  rise: 55,     // centre this far ABOVE the deck
};

/**
 * The single source of truth for the approach window. `sim` tests against it and `gfx` draws it;
 * nobody restates it. ONE square: `x/y/hw/hh` is both the box to draw and the region the
 * aeroplane's centre must be in. There is no second, invisible, more-forgiving box behind it —
 * that gap is exactly how a drawn cue starts lying.
 *
 * @param pad    a `kind === 'pad'` ent
 * @param plane  the player ent (only `x`, `y` and `vx` are read)
 */
export function approachBox(pad, plane) {
  if (!pad || !plane) return null;
  const deckY = pad.deckY !== undefined ? pad.deckY : pad.y - pad.h;
  const h = GATE.size * 0.5;
  const x = pad.x - pad.w - GATE.lead;
  const y = deckY + GATE.rise;

  // Toward the ship, which is east of the square. Not a speed test and not an attitude test: you
  // may arrive fast, banked or climbing, as long as you are going the right way.
  const dirOk = (plane.vx || 0) > 0;
  const inside = Math.abs(plane.x - x) <= h && Math.abs(plane.y - y) <= h;

  return {
    x, y, hw: h, hh: h,                              // draw this; test against this
    x0: x - h, x1: x + h, y0: y - h, y1: y + h, deckY,
    dirOk,
    ready: dirOk,                                    // amber ONLY while flying away from the ship
    inside,
    accept: inside && dirOk,
  };
}

export function makeLanding(world) {
  return {
    approachBox,

    /** True inside the approach box of any pad. See plane.js. */
    nearPad(p) {
      for (const e of world.ents) {
        if (e.kind !== 'pad' || e.dead) continue;
        // The zone has to scale with the AIRCRAFT, not the pad. A fixed e.w*4 = 680 units is
        // ample for a kestrel, which needs 516 to bleed cruise down to landSpeed, and hopeless
        // for a vector, which needs 1219 — which is why every tier-6+ plane was physically
        // unable to land and every `land` objective in acts 3-5 was impossible in one.
        const reach = Math.max(e.w * 4, (p.def && p.def.cruise ? p.def.cruise * 2.2 : 0));
        if (Math.abs(p.x - e.x) < reach && Math.abs(p.y - e.y) < e.h * 4) return true;
      }
      return false;
    },

    /** The gate for the nearest live pad ahead, or null. gfx and ui read this, they do not restate it. */
    boxFor(p) {
      let best = null, bd = Infinity;
      for (const e of world.ents) {
        if (e.kind !== 'pad' || e.dead) continue;
        const d = Math.abs(e.x - p.x);
        if (d < bd) { bd = d; best = e; }
      }
      return best ? approachBox(best, p) : null;
    },

    /** Called every tick from world.step while the player is airborne. */
    check(p) {
      if (p.script || p.landed || p.dead) return;
      for (const e of world.ents) {
        if (e.kind !== 'pad' || e.dead) continue;
        const g = approachBox(e, p);
        if (!g || !g.accept) continue;
        p.script = { kind: 'land', t: 0, x0: p.x, y0: p.y, ang0: p.ang, pad: e };
        return;
      }
    },

    stepScript(p, w, dt) {
      const s = p.script;
      s.t += dt;
      if (s.kind === 'land') {
        const k = Math.min(1, s.t / SETTLE);
        const ease = k * k * (3 - 2 * k);
        const targetY = s.pad.deckY + 12;
        p.y = s.y0 + (targetY - s.y0) * ease;
        p.ang = s.ang0 * (1 - ease);
        p.speed = p.def.landSpeed * (1 - ease);
        p.x += p.speed * dt;
        p.vx = p.speed; p.vy = 0;
        if (k >= 1) {
          p.script = null; p.landed = true; p.pad = s.pad;
          p.y = targetY; p.ang = 0; p.speed = 0; p.vx = 0; p.vy = 0;
          refuel(p);
          w.push({ e: 'ui', what: 'landed', padId: s.pad.padId });
          w.push({ e: 'haptic', pattern: 'boom' });
          w.mission.onLand(w, s.pad.padId);
        }
      } else {
        const k = Math.min(1, s.t / LAUNCH);
        p.speed = p.def.stall * 0.4 + (p.def.cruise - p.def.stall * 0.4) * k;
        p.ang = 0.28 * Math.sin(k * Math.PI);
        p.x += Math.cos(p.ang) * p.speed * dt;
        p.y += Math.sin(p.ang) * p.speed * dt + 90 * k * dt;
        p.vx = Math.cos(p.ang) * p.speed; p.vy = Math.sin(p.ang) * p.speed;
        if (k >= 1) { p.script = null; p.want = 0; p.hasWant = false; p.invuln = 1.2; }
      }
    },

    takeOff(p) {
      if (!p.landed || p.script) return false;
      p.landed = false;
      p.pad = null;
      p.script = { kind: 'takeoff', t: 0 };
      return true;
    },
  };
}
