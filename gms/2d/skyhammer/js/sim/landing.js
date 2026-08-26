// Auto-land and take-off scripts. CONTRACTS §9.

import { refuel } from './plane.js';

const SETTLE = 1.2, LAUNCH = 1.0;

/**
 * The approach gate. Every number here has a physical reason; none of them is a taste dial that
 * happens to look right.
 *
 * The rule used to be "your AABB overlaps the pad's, anywhere" — for a kestrel on the t-02
 * carrier that is a 460 x 190 slab centred on the ship, so "landing" was "be roughly near the
 * boat, level, and slow". Aaron: *"it should be a small green box above the left side of the
 * ship. basically you need to come into it like you are actually landing before the auto land
 * takes over."*
 *
 * So the gate is a window over the APPROACH (stern) end of the deck. THE WINDOW IS THE DECK,
 * SHIFTED BACK ALONG YOUR OWN ROLL-OUT — that one sentence is the whole design, and nothing in it
 * is a taste dial:
 *
 *  - Roll-out. The settle script flies `landSpeed -> 0` over SETTLE seconds, so it carries the
 *    aeroplane `landSpeed * SETTLE / 2` further down the deck: 148 units in a kestrel, 269 in a
 *    vector. Project the deck's two ends back by that and you have the only set of x from which
 *    the roll-out actually finishes on the ship. Trigger ahead of it and you slide off the bow;
 *    trigger behind it and you "land" in the sea astern, which the first cut of this gate did.
 *    `deckMargin` keeps 20 units of deck in reserve at each end.
 *  - So the width is the DECK's length, 340 - 40 = 300 units, the same in every tier — and the
 *    time you get inside it is not: 1.21 s in a kestrel at its landing speed, 0.67 s in a vector.
 *    That is the difficulty ladder falling out of the deck being a fixed length, which is what
 *    happens to real aeroplanes, rather than a number someone chose.
 *  - `floor` / `ceil`. The band is measured from the DECK, not from the pad ent's centre. The
 *    settle parks the aeroplane at `deckY + 12`, so a floor at +20 is "almost down"; the old rule
 *    reached to `deckY - 15`, i.e. inside the hull. The ceiling at +120 is a bit over two
 *    aeroplane-heights above the deck — low enough that you can only be there by having descended.
 *  - `angMin/angMax`. The 0.25 rad wings-level limit is unchanged; what is new is that the upper
 *    bound is +0.02 instead of +0.25, so you may be level or sinking but you may NOT be climbing
 *    through the gate. Note `vy = sin(ang) * speed`, so a descent-rate condition and an attitude
 *    condition are the same condition — which is the reason to state it as an attitude: the pilot
 *    can read it off the nose, and it needs no instrument the game does not already draw.
 *
 * Deliberately NOT a condition: a MINIMUM sink rate. `PHYS.gravAssist` is 260, so a sustained
 * nose-down of `a` settles the speed at `landSpeed*0.8 + 260*sin(a)/0.9`, which crosses
 * `landSpeed` at 0.172 rad in a kestrel and 0.315 in a vector. The whole usable descent window in
 * the slowest aeroplane is therefore 0.172 rad wide, and a minimum sink eats it from the other
 * end — a 0.08 rad floor would leave 0.09 rad to hold with a thumb on a phone. The band already
 * forces the descent: you cannot be 20-120 units over the deck at the stern without having come
 * down to get there, and the no-climb rule stops you ballooning up through it.
 */
export const GATE = {
  deckMargin: 20,    // deck held in reserve at BOTH ends past the roll-out
  floor: 20,         // band bottom, above deckY
  ceil: 120,         // band top, above deckY
  angMin: -0.25,     // nose-down limit (unchanged from §9)
  angMax: 0.02,      // may be level, may not be climbing
};

const landSpeedOf = (def) => (def && def.landSpeed) || ((def && def.stall) || 190) * 1.3;

/**
 * The single source of truth for the approach window. `sim` tests against it and `gfx` draws it;
 * nobody restates it. ONE rectangle: `x/y/hw/hh` is both the box to draw and the region the
 * aeroplane's centre must be in. There is no second, invisible, more-forgiving box behind it —
 * that gap is exactly how a drawn cue starts lying.
 *
 * The old rule was `|p.x - pad.x| <= pad.w + p.w`, i.e. CONTRACTS §9's "plane AABB overlaps the
 * pad". The aircraft half-extents are deliberately gone: the x window's REAR edge is the physical
 * constraint that the roll-out must finish on the ship, and inflating it by the aeroplane's own
 * nose put the touchdown up to `p.w` units astern of the stern, i.e. in the water.
 *
 * @param pad    a `kind === 'pad'` ent
 * @param plane  the player ent (needs `def`, and for the flags `ang`, `vx`, `speed`)
 */
export function approachBox(pad, plane) {
  if (!pad || !plane) return null;
  const def = plane.def || {};
  const deckY = pad.deckY !== undefined ? pad.deckY : pad.y - pad.h;
  const land = landSpeedOf(def);

  const roll = land * SETTLE * 0.5;                 // x gained during the settle
  // the deck's two ends, each projected back along this aeroplane's roll-out
  const x0 = pad.x - pad.w - roll + GATE.deckMargin;
  const x1 = pad.x + pad.w - roll - GATE.deckMargin;
  const y0 = deckY + GATE.floor, y1 = deckY + GATE.ceil;

  const ang = plane.ang || 0;
  const attitudeOk = ang > GATE.angMin && ang < GATE.angMax;
  const speedOk = (plane.speed || 0) < land;
  const dirOk = (plane.vx || 0) > 0;

  const x = (x0 + x1) * 0.5, y = (y0 + y1) * 0.5;
  const hw = (x1 - x0) * 0.5, hh = (y1 - y0) * 0.5;
  const inside = Math.abs(plane.x - x) <= hw && Math.abs(plane.y - y) <= hh;

  return {
    x, y, hw, hh,                                    // draw this; test against this
    x0, x1, y0, y1, deckY, roll,
    attitudeOk, speedOk, dirOk,
    ready: attitudeOk && speedOk && dirOk,           // would the state be accepted, position aside
    inside,
    accept: inside && attitudeOk && speedOk && dirOk,
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
