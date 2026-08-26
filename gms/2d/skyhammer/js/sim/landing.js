// Auto-land and take-off scripts. CONTRACTS §9.

import { refuel } from './plane.js';

const SETTLE = 1.2, LAUNCH = 1.0;

export function makeLanding(world) {
  return {
    /** True inside the approach box of any pad. See plane.js. */
    nearPad(p) {
      for (const e of world.ents) {
        if (e.kind !== 'pad' || e.dead) continue;
        if (Math.abs(p.x - e.x) < e.w * 4 && Math.abs(p.y - e.y) < e.h * 4) return true;
      }
      return false;
    },

    /** Called every tick from world.step while the player is airborne. */
    check(p) {
      if (p.script || p.landed || p.dead) return;
      if (Math.abs(p.ang) >= 0.25 || p.vx <= 0) return;
      if (p.speed >= (p.def.landSpeed || p.def.stall * 1.3)) return;
      for (const e of world.ents) {
        if (e.kind !== 'pad' || e.dead) continue;
        if (Math.abs(p.x - e.x) > e.w + p.w) continue;
        if (Math.abs(p.y - e.y) > e.h + p.h) continue;
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
