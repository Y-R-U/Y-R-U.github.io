// The reference bot. Drives the same stick and slot buttons a thumb does, so
// tools/sim.mjs and `?auto=1` exercise exactly the player's code path.

import { WEAPONS } from '../data/weapons.js';

const G = 900;

function objectiveWants(world) {
  const tags = new Set(), kinds = new Set();
  let wantsBalloon = false, wantsLand = false, open = 0;
  for (const o of world.mission.objectives) {
    if (o.done) continue;
    open++;
    if (o.type === 'destroy') { if (o.tag) tags.add(o.tag); if (o.kind) kinds.add(o.kind); }
    else if (o.type === 'kill') kinds.add(o.kind || 'fighter');
    else if (o.type === 'collect') wantsBalloon = true;
    else if (o.type === 'land') wantsLand = true;
  }
  return { tags, kinds, wantsBalloon, wantsLand, open };
}

/** A boss is aimed at through its nearest live part. */
function aimPoint(e, from) {
  if (!e.parts) return { x: e.x, y: e.y, w: e.w, h: e.h };
  let best = null, bd = 1e12;
  for (const q of e.parts) {
    if (q.dead) continue;
    const d = (q.x - from.x) ** 2 + (q.y - from.y) ** 2;
    if (d < bd) { bd = d; best = q; }
  }
  return best ? { x: best.x, y: best.y, w: best.w, h: best.h } : { x: e.x, y: e.y, w: e.w, h: e.h };
}

function scoreTarget(e, p, want) {
  if (e.dead || e.team === 0 || e.kind === 'pad' || e.kind === 'pickup') return -1;
  const dx = e.x - p.x;
  if (dx < -20000 || dx > 9000) return -1;
  let s = 6;
  if (e.def && want.tags.has(e.def.tag)) s += 140;
  if (want.kinds.has(e.kind)) s += 140;
  if (e.kind === 'balloon') s += want.wantsBalloon ? 130 : 14;
  if (e.kind === 'flak' && Math.hypot(dx, e.y - p.y) < (e.def.range || 900) * 1.15) s += 90;
  if (e.kind === 'fighter') { const d = Math.hypot(dx, e.y - p.y); s += d < 1700 ? 270 - d * 0.09 : 40; }
  if (e.kind === 'boss') s += 160;
  s -= Math.abs(dx) * 0.008;
  if (dx < 0) s -= 40;                       // prefer forward, but do turn back
  return s;
}

/** Where a bomb released now would land, in x, for a given target altitude. */
function bombImpactX(p, ty) {
  const vx = p.vx * 0.92, vy = p.vy * 0.92 - 30;
  const h = p.y - ty;
  if (h <= 0) return null;
  const t = (vy + Math.sqrt(vy * vy + 2 * G * h)) / G;
  return p.x + vx * t;
}

export function makeAutopilot() {
  let phase = 'cruise';
  let phaseT = 0;
  let takeoffCool = 0;

  return {
    get mode() { return phase; },
    target: null,

    step(world, dt) {
      const p = world.player;
      if (!p || p.dead || world.over) { world.releaseStick(); return; }
      phaseT += dt;
      takeoffCool -= dt;
      for (let i = 0; i < 4; i++) world.slots[i] = false;

      if (p.landed) { if (takeoffCool <= 0) { world.takeOff(); takeoffCool = 2; } return; }
      if (p.script) return;

      const want = objectiveWants(world);
      const gAhead = Math.max(
        world.terrain.heightAt(p.x),
        world.terrain.heightAt(p.x + 400),
        world.terrain.heightAt(p.x + 850),
      );
      const floor = gAhead + 340;

      let best = null, bs = -1;
      for (const e of world.ents) {
        const s = scoreTarget(e, p, want);
        if (s > bs) { bs = s; best = e; }
      }
      this.target = best;

      const pad = want.wantsLand ? world.ents.find((e) => e.kind === 'pad' && !e.dead) : null;
      const landNow = pad && (want.open === 1 || p.x > pad.x - 2200);
      const hurt = p.hp < p.hpMax * 0.32;
      let bombs = 0;
      for (let i = 0; i < 4; i++) { const w = WEAPONS[p.loadout[i]]; if (w && w.gravity) bombs += p.ammo[i]; }

      let a = 0.05;

      if (landNow) {
        phase = 'land';
        // Descend EARLY and arrive level. Diving on final adds gravAssist speed (~36/s at
        // 0.14 rad nose-down) faster than the near-pad throttle bleeds it off, so a bot that
        // descends all the way in crosses the §9 box still above landSpeed and never triggers.
        const ty = pad.deckY + 80;
        const run = pad.x - 1000 - p.x;
        if (run > 0) a = Math.max(-0.5, Math.min(0.5, Math.atan2((ty - p.y) * 1.2, Math.max(run, 400))));
        else a = Math.max(-0.05, Math.min(0.05, (ty - p.y) * 0.0012));
      } else if (hurt && phase !== 'evade' && phaseT > 3) {
        phase = 'evade'; phaseT = 0;
      } else if (phase === 'evade') {
        // climb and open the range on whatever is shooting
        let th = null, td = 1e12;
        for (const e of world.ents) {
          if (e.dead || e.team !== 1) continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < td) { td = d; th = e; }
        }
        a = th ? Math.atan2(Math.abs(p.y - th.y) + 700, (p.x - th.x) || 1) * 0 + (p.x > th.x ? 0.45 : 0.55) : 0.5;
        if (th && p.x < th.x) a = 0.55;
        if (phaseT > 4 || (p.y > 1900 && td > 1500)) { phase = 'cruise'; phaseT = 0; }
      } else if (!best) {
        phase = 'cruise';
        a = Math.atan2(((gAhead + 780) - p.y) * 0.6, 900);
      } else if (best.kind === 'fighter') {
        phase = 'air';
        const t = Math.min(0.8, Math.hypot(best.x - p.x, best.y - p.y) / 1500);
        a = Math.atan2(best.y + best.vy * t - p.y, best.x + best.vx * t - p.x);
      } else if (best.kind === 'balloon') {
        phase = 'collect';
        a = Math.atan2(best.y - p.y, best.x - p.x);
      } else {
        // ground / flak / boss — a strafing run with a deliberate pull-out
        const tp = aimPoint(best, p);
        const dx = tp.x - p.x, dist = Math.hypot(dx, tp.y - p.y);
        if (phase === 'pullout') {
          a = 0.85;
          if (phaseT > 1.1 && p.y > floor + 200) { phase = 'setup'; phaseT = 0; }
        } else if (phase !== 'setup' && phase !== 'run') { phase = 'setup'; phaseT = 0; }

        if (phase === 'setup') {
          const apx = tp.x - 1500, apy = tp.y + (bombs > 0 ? 780 : 620);
          a = Math.atan2((apy - p.y) * 0.8, apx - p.x || 1);
          if (bombs <= 0 && dx > 300 && dx < 2100 && p.y > tp.y + 320) { phase = 'run'; phaseT = 0; }
          if (phaseT > 9) { phase = 'run'; phaseT = 0; }
        } else if (phase === 'run') {
          a = Math.atan2(tp.y - p.y, Math.max(dx, 160));
          if (dist < 420 || p.y < floor || phaseT > 3.4 || dx < 0) { phase = 'pullout'; phaseT = 0; }
        }
      }

      // The terrain floor guard sits at ground + 340, which over water is ABOVE the top of the
      // approach box (deckY + 175). It is a hard clamp, not a preference: with it in place the
      // bot cannot descend into the box at all and never lands, on any seed. During the
      // approach it has to key off the deck instead of the terrain.
      const lowLimit = (phase === 'land' && pad) ? pad.deckY + 24 : floor;
      const hardLimit = (phase === 'land' && pad) ? pad.deckY + 8 : gAhead + 190;
      if (p.y < lowLimit) a = Math.max(a, 0.6);
      if (p.y < hardLimit) a = 1.0;
      if (p.y > 2150) a = Math.min(a, -0.2);
      world.setStickAngle(Math.max(-1.3, Math.min(1.3, a)));

      // --- ordnance ---
      if (!best || phase === 'evade' || phase === 'land') return;
      const tp = aimPoint(best, p);
      const isGround = best.kind === 'ground' || best.kind === 'flak' || best.kind === 'boss';
      const dist = Math.hypot(tp.x - p.x, tp.y - p.y);
      const err = Math.abs(Math.atan2(tp.y - p.y, tp.x - p.x) - p.ang);

      for (let i = 0; i < 4; i++) {
        const w = WEAPONS[p.loadout[i]];
        if (!w || p.ammo[i] <= 0 || p.cool[i] > 0) continue;
        if (w.gravity) {
          if (!isGround) continue;
          const ix = bombImpactX(p, tp.y + tp.h);
          if (ix !== null && ix > tp.x - tp.w - 30 && ix < tp.x + tp.w + 30) world.slots[i] = true;
        } else if (dist < 1200 && err < 0.12) {
          world.slots[i] = true;
        }
      }
    },
  };
}
