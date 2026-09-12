/* ═══════════════════════════════════════════════════════════════════════════
   BEHAVIOUR
   Boids for the shoals, and a different steering brain per temperament on
   top. A predator's stalk is deliberately slow and deliberately visible: you
   are supposed to have time to notice, and then to regret.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { clamp, lerp, rr, rnd, damp, TAU } from '../util.js';
import { CFG } from '../config.js';
import { flowOf, daylight } from './tank.js';
import { PL, DEC, FD } from '../data/flora.js';
import { foodValue } from './biology.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(),
      _d = new THREE.Vector3(), _e = new THREE.Vector3();

export function zoneY(sp, H, f) {
  let y;
  switch (sp.zone) {
    case 'top':    y = H * 0.78; break;
    case 'bottom': y = H * 0.13; break;
    case 'mid':    y = H * 0.50; break;
    default:       y = H * 0.48;
  }
  if (f) y += f.zoneBias * H * (sp.zone === 'bottom' ? 0.35 : 1);
  return clamp(y, H * 0.08, H * 0.92);
}

export function cruiseSpeed(f) {
  return (0.26 + f.sp.activity * 0.72) * (0.55 + clamp(f.len / 22, 0, 1) * 0.75)
       * f.speedMul * (0.45 + 0.55 * f.health);
}

export function placeFish(T, f) {
  const [W, H, D] = T.dims;
  f.pos = new THREE.Vector3(rr(-W * 0.42, W * 0.42),
    clamp(zoneY(f.sp, H, f) + rr(-0.3, 0.3) * H / 3, 0.15, H - 0.2), rr(-D * 0.34, D * 0.34));
  f.vel = new THREE.Vector3(rr(-1, 1), 0, rr(-1, 1)).normalize().multiplyScalar(cruiseSpeed(f));
  f.target = f.pos.clone();
  f.home = f.pos.clone();
  f.lastDir = f.vel.clone().normalize();
}

/** The single source of truth on who can eat whom. */
export function canEat(pred, prey) {
  if (pred === prey || !prey.alive) return false;
  if (pred.sp.behaviour === 'predator')
    return prey.sp.behaviour !== 'predator' && prey.len < Math.min(12, pred.len * 0.62);
  if (pred.spId === 'puffer') return ['snail', 'cherry', 'shrimp'].includes(prey.spId);
  if (pred.spId === 'angel') return prey.spId === 'neon' && pred.len >= 9;
  /* anything big and not gentle eventually works out what a cherry shrimp is */
  if (prey.spId === 'cherry' && pred.len > 6 && pred.sp.temper !== 'peaceful') return true;
  return false;
}
export function findPrey(f, live) {
  let best = null, bd = 1e9;
  for (const o of live) {
    if (!canEat(f, o)) continue;
    const d = o.pos.distanceTo(f.pos);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export function updateAI(T, dt, G) {
  const [W, H, D] = T.dims;
  const hx = W / 2 - 0.22, hz = D / 2 - 0.22;
  const live = T.fish.filter(f => f.alive);
  const flow = flowOf(T);
  const dark = daylight(T) < 0.22;
  const now = performance.now();

  /* shelter points: decor first, then tall planting */
  const hides = [];
  for (const d of T.decor) if ((DEC[d.id].hides || 0) > 0.3) hides.push(d.wp || _a.clone().set(d.x, 0.3, d.z));
  for (const p of T.plants) if (PL[p.id].hides > 0.4) hides.push(new THREE.Vector3(p.x, PL[p.id].height * 0.6, p.z));
  const anemone = T.decor.find(d => DEC[d.id].host && (d.health ?? 1) > 0.4);

  for (const f of T.fish) {
    if (!f.alive) {
      f.vel.y = lerp(f.vel.y, 0.12, dt);
      f.vel.x *= 0.96; f.vel.z *= 0.96;
      f.pos.addScaledVector(f.vel, dt);
      f.pos.y = Math.min(f.pos.y, H - 0.08);
      f.flash = Math.max(0, f.flash - dt * 2);
      continue;
    }
    const sp = f.sp, B = sp.behaviour;
    const acc = _a.set(0, 0, 0);
    const speed = cruiseSpeed(f);
    f.moodT -= dt;
    f.flash = Math.max(0, f.flash - dt * 2.5);

    /* ── shoal maths ──────────────────────────────────────────────────── */
    if (B === 'school' || B === 'host') {
      const sep = _b.set(0, 0, 0), ali = _c.set(0, 0, 0), coh = _d.set(0, 0, 0);
      let nS = 0, nA = 0;
      const Rr = 0.35 + f.len / 14, R2 = Rr * Rr;
      for (const o of live) {
        if (o === f) continue;
        const dx = o.pos.x - f.pos.x, dy = o.pos.y - f.pos.y, dz = o.pos.z - f.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R2 * 9) continue;
        if (d2 < R2 * 0.6 && d2 > 1e-6) { const k = 1 / Math.max(0.05, Math.sqrt(d2)); sep.x -= dx * k; sep.y -= dy * k; sep.z -= dz * k; nS++; }
        if (o.spId === sp.id) { ali.add(o.vel); coh.x += o.pos.x; coh.y += o.pos.y; coh.z += o.pos.z; nA++; }
      }
      if (nS) acc.addScaledVector(sep.normalize(), speed * 2.4);
      if (nA) {
        ali.divideScalar(nA);
        acc.addScaledVector(ali.normalize().multiplyScalar(speed).sub(f.vel), 1.1);
        coh.divideScalar(nA).sub(f.pos);
        const tight = clamp(nA / Math.max(2, sp.school), 0, 1);
        acc.addScaledVector(coh, 0.9 * (0.4 + 0.6 * tight));
      } else if (sp.school > 1) {
        /* a lone schooling fish hugs the glass and looks miserable. The point. */
        acc.z += (f.pos.z < 0 ? -1 : 1) * speed * 0.4;
      }
    }

    switch (B) {
      case 'territorial': {
        if (f.hunger > 0.30 && (!f.chase || !f.chase.alive)) f.chase = findPrey(f, live);
        if (f.chase && f.chase.alive && canEat(f, f.chase)) {
          const d = f.chase.pos.distanceTo(f.pos);
          f.mood = d < 0.45 + f.len / 30 ? 'strike' : 'stalk';
          acc.addScaledVector(_b.copy(f.chase.pos).sub(f.pos).normalize()
            .multiplyScalar(speed * (f.mood === 'strike' ? 4.0 : 1.15)).sub(f.vel), f.mood === 'strike' ? 3.0 : 1.0);
          if (d < 0.12 + f.len / 40) { G.eat(f, f.chase, T); f.chase = null; f.mood = 'cruise'; }
          break;
        }
        f.chase = null;
        if (!f.homeSet) { f.home.set(rr(-hx * 0.6, hx * 0.6), zoneY(sp, H, f), rr(-hz * 0.5, hz * 0.5)); f.homeSet = true; }
        let intruder = null, best = 1e9;
        for (const o of live) {
          if (o === f || o.len > f.len * 1.25) continue;
          const d = o.pos.distanceTo(f.home);
          if (d < 0.6 + f.len / 12 && d < best) { best = d; intruder = o; }
        }
        if (intruder && f.len > sp.size * 0.5) {
          f.mood = 'chase';
          acc.addScaledVector(_b.copy(intruder.pos).sub(f.pos).normalize().multiplyScalar(speed * 2.0).sub(f.vel), 1.5);
          if (intruder.pos.distanceTo(f.pos) < 0.18 + f.len / 45) G.contact(f, intruder, T);
        } else {
          f.mood = 'patrol';
          if (f.moodT <= 0) { f.moodT = rr(2.5, 6);
            f.target.set(f.home.x + rr(-0.7, 0.7), clamp(f.home.y + rr(-0.4, 0.4) * H / 3, 0.2, H - 0.25), f.home.z + rr(-0.5, 0.5)); }
          acc.addScaledVector(_b.copy(f.target).sub(f.pos).clampLength(0, speed).sub(f.vel), 1.0);
        }
        break;
      }
      case 'predator': case 'hunter': {
        if (f.hunger > (B === 'hunter' ? 0.32 : 0.42) && (!f.chase || !f.chase.alive)) {
          const best = findPrey(f, live);
          if (best && best.pos.distanceTo(f.pos) < W * 0.9) {
            if (f.chase !== best) G.stalkStart(f, best, T);
            f.chase = best; f.mood = 'stalk'; f.stalkT = 0;
          }
        }
        if (f.chase && f.chase.alive) {
          const d = f.chase.pos.distanceTo(f.pos);
          f.stalkT += dt;
          if (d < 0.5 + f.len / 30 || f.mood === 'strike') {
            f.mood = 'strike';
            acc.addScaledVector(_b.copy(f.chase.pos).sub(f.pos).normalize().multiplyScalar(speed * 4.2).sub(f.vel), 3.2);
            if (d < 0.12 + f.len / 40) { G.eat(f, f.chase, T); f.chase = null; f.mood = 'cruise'; }
          } else {
            acc.addScaledVector(_b.copy(f.chase.pos).sub(f.pos).normalize()
              .multiplyScalar(speed * (dark ? 0.95 : 0.6)).sub(f.vel), 0.9);
          }
          if (f.stalkT > 26) { f.chase = null; f.mood = 'cruise'; }
        } else {
          f.mood = 'cruise'; f.chase = null;
          if (f.moodT <= 0) { f.moodT = rr(3, 8);
            f.target.set(rr(-hx, hx), clamp(zoneY(sp, H, f) + rr(-0.5, 0.5) * H / 3, 0.2, H - 0.2), rr(-hz, hz)); }
          acc.addScaledVector(_b.copy(f.target).sub(f.pos).clampLength(0, speed * 0.7).sub(f.vel), 0.7);
        }
        break;
      }
      case 'shy': {
        let near = null, nd = 1e9;
        for (const h of hides) { const d = h.distanceTo(f.pos); if (d < nd) { nd = d; near = h; } }
        let threat = null;
        for (const o of live) if (o !== f && (o.len > f.len * 1.3 || o.sp.temper !== 'peaceful')
          && o.pos.distanceTo(f.pos) < 0.9) { threat = o; break; }
        if (threat && near) {
          acc.addScaledVector(_b.copy(near).sub(f.pos).normalize().multiplyScalar(speed * 1.8).sub(f.vel), 1.6);
          f.mood = 'hide';
        } else {
          if (f.moodT <= 0) {
            f.moodT = rr(3, 7);
            const c = near || _e.set(0, zoneY(sp, H, f), 0);
            f.target.set(clamp(c.x + rr(-0.8, 0.8), -hx, hx),
              clamp(zoneY(sp, H, f) + rr(-0.4, 0.4) * H / 3, 0.2, H - 0.2), clamp(c.z + rr(-0.6, 0.6), -hz, hz));
          }
          acc.addScaledVector(_b.copy(f.target).sub(f.pos).clampLength(0, speed * 0.8).sub(f.vel), 0.8);
          f.mood = near && nd < 0.6 ? 'shelter' : 'cruise';
        }
        break;
      }
      case 'bottom': case 'crawler': {
        const crawl = B === 'crawler';
        if (f.moodT <= 0) {
          f.moodT = crawl ? rr(6, 14) : rr(2, 5);
          const onGlass = crawl && rnd() < 0.35;
          f.target.set(rr(-hx, hx), onGlass ? rr(0.3, H * 0.8) : 0.10 + rnd() * 0.10,
                       onGlass ? hz * 0.98 : rr(-hz, hz));
        }
        let food = null, fd = 1e9;
        for (const p of T.food) if (p.settled || p.pos.y < 0.4) {
          const d = p.pos.distanceTo(f.pos); if (d < fd) { fd = d; food = p; }
        }
        /* a hungry bottom-dweller will cross the tank for a wafer */
        if (food && f.hunger > 0.28 && (fd < 1.6 || f.hunger > 0.45)) {
          f.target.copy(food.pos);
          if (fd < 0.13 + f.len / 50) {
            f.hunger = clamp(f.hunger - foodValue(food, f), 0, 1.4);
            f.flash = 0.4; f.eaten++;
            T.food.splice(T.food.indexOf(food), 1);
          }
        }
        acc.addScaledVector(_b.copy(f.target).sub(f.pos).clampLength(0, speed * (crawl ? 0.22 : 0.85)).sub(f.vel), crawl ? 0.5 : 0.9);
        f.mood = 'graze';
        break;
      }
      case 'host': {
        if (anemone && anemone.wp) {
          f.hostDecor = anemone;
          const c = anemone.wp;
          if (f.moodT <= 0) { f.moodT = rr(0.8, 2.2);
            const ang = rnd() * TAU, r = rr(0.12, 0.42);
            f.target.set(c.x + Math.cos(ang) * r, clamp(c.y + rr(-0.1, 0.3), 0.15, H - 0.2), c.z + Math.sin(ang) * r); }
          acc.addScaledVector(_b.copy(f.target).sub(f.pos).clampLength(0, speed * 1.3).sub(f.vel), 1.8);
          f.mood = 'host';
        } else {
          f.hostDecor = null;
          if (f.moodT <= 0) { f.moodT = rr(2, 5);
            f.target.set(rr(-hx, hx), clamp(zoneY(sp, H, f) + rr(-0.4, 0.4) * H / 3, 0.2, H - 0.2), rr(-hz, hz)); }
          acc.addScaledVector(_b.copy(f.target).sub(f.pos).clampLength(0, speed).sub(f.vel), 0.7);
          f.mood = 'cruise';
        }
        break;
      }
      case 'clinger': {
        let hold = null, hd = 1e9;
        for (const h of hides) { const d = h.distanceTo(f.pos); if (d < hd) { hd = d; hold = h; } }
        if (f.moodT <= 0) {
          f.moodT = rr(5, 12);
          const c = hold || _e.set(0, H * 0.4, 0);
          f.target.set(clamp(c.x + rr(-0.5, 0.5), -hx, hx),
            clamp(c.y + rr(-0.1, 0.5), 0.25, H - 0.3), clamp(c.z + rr(-0.4, 0.4), -hz, hz));
        }
        acc.addScaledVector(_b.copy(f.target).sub(f.pos).clampLength(0, speed * 0.5).sub(f.vel), 0.55);
        f.vel.y += Math.sin(now * 0.0006 + f.phase) * dt * 0.06;
        f.mood = hold && hd < 0.5 ? 'cling' : 'drift';
        break;
      }
      case 'drifter': {
        if (f.moodT <= 0) { f.moodT = rr(4, 9);
          f.target.set(rr(-hx * 0.8, hx * 0.8), rr(H * 0.2, H * 0.88), rr(-hz * 0.8, hz * 0.8)); }
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.0012 * f.speedMul + f.phase);
        acc.addScaledVector(_b.copy(f.target).sub(f.pos).clampLength(0, speed * (0.3 + pulse * 1.1)).sub(f.vel), 0.5);
        f.mood = 'drift';
        break;
      }
      case 'cleaner': {
        let client = null;
        for (const o of live) if (o !== f && o.sick > 0.05 && o.pos.distanceTo(f.pos) < 1.6) { client = o; break; }
        if (client && f.sp.medic) {
          acc.addScaledVector(_b.copy(client.pos).sub(f.pos).clampLength(0, speed * 1.2).sub(f.vel), 1.2);
          if (client.pos.distanceTo(f.pos) < 0.25) { client.sick = Math.max(0, client.sick - dt * 0.5); client.flash = Math.min(1, client.flash + dt); }
          f.mood = 'clean';
        } else {
          if (f.moodT <= 0) { f.moodT = rr(3, 8);
            const h = hides.length ? hides[Math.floor(rnd() * hides.length)] : _e.set(0, 0.3, 0);
            f.target.set(clamp(h.x + rr(-0.4, 0.4), -hx, hx), clamp(h.y + rr(-0.1, 0.3), 0.10, H * 0.6),
                         clamp(h.z + rr(-0.4, 0.4), -hz, hz)); }
          acc.addScaledVector(_b.copy(f.target).sub(f.pos).clampLength(0, speed * 0.6).sub(f.vel), 0.6);
          f.mood = 'forage';
        }
        break;
      }
      default: {
        if (f.moodT <= 0) { f.moodT = rr(2.5, 6);
          f.target.set(rr(-hx, hx), clamp(zoneY(sp, H, f) + rr(-0.45, 0.45) * H / 3, 0.18, H - 0.18), rr(-hz, hz)); }
        acc.addScaledVector(_b.copy(f.target).sub(f.pos).clampLength(0, speed * 0.8).sub(f.vel), 0.55);
        if (f.mood !== 'flee') f.mood = 'cruise';
      }
    }

    /* ── hunger beats everything ──────────────────────────────────────── */
    if (f.hunger > 0.22 && T.food.length && !sp.cleanup) {
      let best = null, bd = 1e9;
      const slow = sp.slowFeeder ? 1.9 : 1.0;
      for (const p of T.food) {
        if (!FD[p.type].feeds.includes(sp.diet)) continue;
        if (sp.zone === 'bottom' && !p.settled && p.pos.y > 0.8) continue;
        const d = p.pos.distanceTo(f.pos);
        if (d < bd) { bd = d; best = p; }
      }
      if (best && bd < W * 1.1) {
        const eager = clamp(f.hunger * 2.2, 0, 2.4) / slow;
        acc.addScaledVector(_b.copy(best.pos).sub(f.pos).normalize().multiplyScalar(speed * (1 + eager)).sub(f.vel), 1.5 / slow);
        if (bd < 0.09 + f.len / 60) {
          f.hunger = clamp(f.hunger - foodValue(best, f), 0, 1.4);
          f.flash = 0.5; f.eaten++;
          T.food.splice(T.food.indexOf(best), 1);
        }
        f.mood = 'feed';
      }
    }

    /* ── fleeing ──────────────────────────────────────────────────────── */
    for (const o of live) {
      if (o === f) continue;
      if (o.sp.behaviour !== 'predator' && o.sp.temper !== 'aggressive') continue;
      if (o.len < f.len * 1.4 && o.sp.behaviour === 'predator') continue;
      const d = o.pos.distanceTo(f.pos);
      const panic = o.mood === 'strike' ? 1.6 : o.sp.behaviour === 'predator' ? 0.75 : 0.40;
      if (d < panic) {
        acc.addScaledVector(_b.copy(f.pos).sub(o.pos).normalize().multiplyScalar(speed * 2.6).sub(f.vel), 2.2 * (1 - d / panic));
        f.mood = 'flee';
      }
    }

    /* ── walls, floor, surface, zone, current ─────────────────────────── */
    const m = 0.30 + f.len / 30;
    if (f.pos.x >  hx - m) acc.x -= (f.pos.x - (hx - m)) * 9;
    if (f.pos.x < -hx + m) acc.x += ((-hx + m) - f.pos.x) * 9;
    if (f.pos.z >  hz - m) acc.z -= (f.pos.z - (hz - m)) * 9;
    if (f.pos.z < -hz + m) acc.z += ((-hz + m) - f.pos.z) * 9;
    const yLo = 0.09 + f.len / 90, yHi = H - 0.12 - f.len / 90;
    if (f.pos.y < yLo) acc.y += (yLo - f.pos.y) * 11;
    if (f.pos.y > yHi) acc.y -= (f.pos.y - yHi) * 11;
    const zy = zoneY(sp, H, f);
    acc.y += (zy - f.pos.y) * (sp.zone === 'any' ? 0.25 : 0.9) * (f.mood === 'feed' || f.mood === 'flee' ? 0.25 : 1);
    acc.x += Math.sin(now * 0.00021 + f.pos.z) * flow * 0.28;

    /* ── integrate ────────────────────────────────────────────────────── */
    const sick = 1 - clamp(f.sick, 0, 1) * 0.55;
    const strained = 1 - clamp(f.stress - 0.6, 0, 1) * 0.3;
    const maxSpd = speed * (f.mood === 'strike' ? 4.5 : f.mood === 'flee' ? 3.0
                          : f.mood === 'chase' ? 2.4 : f.mood === 'stalk' ? 1.1 : 1.35) * sick * strained;
    f.vel.addScaledVector(acc, dt * 2.2);
    if (f.vel.length() > maxSpd) f.vel.setLength(maxSpd);
    if (f.vel.lengthSq() < 1e-6) f.vel.set(rr(-0.1, 0.1), 0, rr(-0.1, 0.1));
    f.pos.addScaledVector(f.vel, dt);
    f.pos.x = clamp(f.pos.x, -hx, hx); f.pos.z = clamp(f.pos.z, -hz, hz);
    f.pos.y = clamp(f.pos.y, 0.06, H - 0.06);

    /* bank into the turn, and let the head lead the body out of it */
    const dir = _b.copy(f.vel).normalize();
    const turn = _c.copy(dir).cross(f.lastDir).y;
    f.bank = damp(f.bank, clamp(turn * 7, -0.7, 0.7), 5, dt);
    f.yawLag = damp(f.yawLag, clamp(-turn * 2.2, -0.5, 0.5), 8, dt);
    f.pitch = damp(f.pitch, clamp(dir.y * 1.1, -0.7, 0.7), 4, dt);
    f.lastDir.copy(dir);
    f.phase += dt * 0.1;
  }

  /* ── nipping ──────────────────────────────────────────────────────────
     The species that shred fins go and find them rather than waiting for a
     guppy to blunder past. It has to happen reliably enough to be learned. */
  const barbs = live.reduce((a, x) => a + (x.spId === 'barb' ? 1 : 0), 0);
  for (const f of live) {
    const nips = f.spId === 'betta' || f.spId === 'puffer' || (f.spId === 'barb' && barbs < 6)
              || (f.spId === 'gramma');
    if (!nips || f.len < f.sp.size * 0.55) continue;
    let vic = null, bd = 1e9;
    for (const o of live) {
      if (o === f) continue;
      const veil = o.sp.body.veil || 0;
      const same = o.spId === f.spId && (f.spId === 'betta' || f.spId === 'gramma');
      if (!(veil >= 0.5 || same)) continue;
      const d = o.pos.distanceTo(f.pos);
      if (d < bd) { bd = d; vic = o; }
    }
    if (!vic) continue;
    if (bd < W * 0.7) {
      f.vel.addScaledVector(_a.copy(vic.pos).sub(f.pos).normalize(), cruiseSpeed(f) * dt * 6);
      if (f.vel.length() > cruiseSpeed(f) * 2.4) f.vel.setLength(cruiseSpeed(f) * 2.4);
      f.mood = 'chase';
    }
    if (bd < 0.3 + f.len / 30) G.contact(f, vic, T);
  }

  /* ── food drifts down ─────────────────────────────────────────────────── */
  for (const p of T.food) {
    if (p.settled) continue;
    p.pos.y -= (0.12 + FD[p.type].sink * 0.85) * dt;
    p.pos.x += Math.sin(now * 0.0004 + p.seed) * flow * 0.16 * dt;
    p.pos.z += Math.cos(now * 0.0003 + p.seed) * flow * 0.14 * dt;
    if (p.pos.y <= 0.07) { p.pos.y = 0.07; p.settled = true; }
  }
}
