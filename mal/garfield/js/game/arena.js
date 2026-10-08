import * as THREE from '../../vendor/three/three.module.js';

// Arena (D19): Garfield vs Odie in Jon's bedroom, first to 20. Garfield scores with a scratch on Odie; Odie scores
// when his tackle lunge connects. Nothing bad happens to Garfield beyond a comic knockback.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const DIFFICULTY = {
  veryEasy: { speed: 1.5, every: [4, 6], tele: 1.1, lunge: 2.0, trip: 0.45, dumb: 0.3, label: 'Very Easy' },
  easy: { speed: 2.0, every: [3, 4.5], tele: 0.85, lunge: 2.3, trip: 0.25, dumb: 0.15, label: 'Easy' },
};
export const ARENA = { to: 20, hitR: 0.55, lungeDur: 0.38, gInvuln: 1.2, oInvuln: 0.9 };

export function createArena(L, { difficulty = 'easy', to = ARENA.to, onPoint } = {}) {
  const { ctx, odie, odieAI } = L;
  const D = DIFFICULTY[difficulty] || DIFFICULTY.easy;
  const A = (n) => ctx.world.anchors?.get?.(n) || null;
  const bounds = A('arenaBounds') || { min: V(2.35, 3, 2.15), max: V(5.85, 3, 5.8) };
  const bmin = (bounds.min || bounds.pos?.clone?.().sub(V(1.7, 0, 1.8))).clone(), bmax = (bounds.max || bounds.pos?.clone?.().add(V(1.7, 0, 1.8))).clone();
  const floorY = bmin.y ?? 3;
  const centre = A('arenaCentre')?.pos?.clone() || V((bmin.x + bmax.x) / 2, floorY, (bmin.z + bmax.z) / 2);
  const ar = {
    g: 0, o: 0, to, over: false, state: 'approach', st: 0, cool: 2.0, gInv: 0, oInv: 0, lungeDir: V(), difficulty, D,
    result: null,
  };
  let resolveEnd;
  ar.done = new Promise((r) => (resolveEnd = r));

  const hud = () => ctx.ui?.hud?.set?.({ arenaScore: { g: ar.g, o: ar.o, to } });
  const clip = (n, o) => odieAI.clip(n, o);
  const gp = () => ctx.controller.pos;
  const clampIn = (p) => { p.x = THREE.MathUtils.clamp(p.x, bmin.x + 0.3, bmax.x - 0.3); p.z = THREE.MathUtils.clamp(p.z, bmin.z + 0.3, bmax.z - 0.3); return p; };
  const ground = (p) => ctx.world.groundAt?.(p.x, p.z, p.y + 0.7) ?? floorY;

  ar.start = () => {
    const off = V(1.1, 0, 0);
    ctx.controller.teleport(clampIn(centre.clone().sub(off)), Math.PI / 2);
    odieAI.place(clampIn(centre.clone().add(off)), -Math.PI / 2);
    odie.root.visible = true;
    try { ctx.world.props?.get?.('bedroomDoor')?.close?.(); } catch {}
    odieAI.onScratch = () => scorePlayer();
    odieAI.scratchable = () => !ar.over && ar.oInv <= 0;
    hud();
    ctx.audio?.music?.('arena', { fade: 0.6 });
    L.say('ar_g_start', { force: true, delay: 0.6 });
    ar.state = 'approach'; ar.cool = 2.0;
  };

  function point(who) {
    if (ar.over) return;
    if (who === 'g') ar.g++; else ar.o++;
    hud();
    onPoint?.(who, ar);
    if (ar.g >= to || ar.o >= to) {
      ar.over = true;
      ar.result = ar.g >= to ? 'win' : 'lose';
      odieAI.clip(ar.result === 'win' ? 'dizzy' : 'bark', { force: true });
      resolveEnd(ar.result);
    }
  }

  function scorePlayer() {
    if (ar.over || ar.oInv > 0) return;
    ar.oInv = ARENA.oInvuln;
    ctx.audio?.sfx?.('hit');
    odieAI.noise('o_yip');
    point('g');
    if (Math.random() < 0.4) L.say('ar_g_hit', { chance: 0.7 });
    if (ar.g > ar.o + 3 && Math.random() < 0.2) L.say('ar_g_lead');
    // knocked back away from Garfield
    const away = V(odie.root.position.x - gp().x, 0, odie.root.position.z - gp().z);
    if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
    ar.kb = { dir: away.normalize(), t: 0 };
    ar.state = 'hit'; ar.st = 0;
    clip('hit', { once: true, fallback: 'dizzy' });
  }

  ar.update = (dt) => {
    if (ar.over) return;
    ar.st += dt; ar.cool -= dt; ar.gInv -= dt; ar.oInv -= dt;
    const o = odie.root, g = gp();
    const d = flat(o.position, g);
    const faceG = (k = 8) => { const want = Math.atan2(g.x - o.position.x, g.z - o.position.z); o.rotation.y += wrap(want - o.rotation.y) * Math.min(1, dt * k); };
    const move = (dir, speed) => {
      const p = o.position.clone().addScaledVector(dir, speed * dt);
      clampIn(p);
      p.y = ground(p);
      o.position.copy(p);
    };
    switch (ar.state) {
      case 'approach': {
        if (Math.random() < dt * D.dumb * 0.4) { ar.state = 'dumb'; ar.st = 0; ar.dumbDir = V(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(); break; }
        faceG();
        if (d > 1.3) { move(V(g.x - o.position.x, 0, g.z - o.position.z).normalize(), D.speed); clip(D.speed > 1.8 ? 'run' : 'walk'); odie.setMove?.(D.speed); }
        else { odie.setMove?.(0); clip('idle_pant'); }
        if (d < 1.9 && ar.cool <= 0) { ar.state = 'tele'; ar.st = 0; odie.setMove?.(0); clip('bark'); ctx.audio?.sfx?.('bark', { vol: 0.6 }); }
        break;
      }
      case 'dumb': {
        move(ar.dumbDir, D.speed * 0.6); clip('walk'); odie.setMove?.(D.speed * 0.6);
        o.rotation.y = Math.atan2(ar.dumbDir.x, ar.dumbDir.z);
        if (ar.st > 1.5) { ar.state = 'approach'; ar.st = 0; odie.setMove?.(0); if (Math.random() < 0.5) clip('sniff'); }
        break;
      }
      case 'tele': {
        faceG(10);
        if (ar.st > D.tele) {
          ar.state = 'lunge'; ar.st = 0;
          ar.lungeDir.set(g.x - o.position.x, 0, g.z - o.position.z).normalize();
          clip('tackle', { once: true, fallback: 'run' });
          ar.hitThis = false;
        }
        break;
      }
      case 'lunge': {
        move(ar.lungeDir, D.lunge / ARENA.lungeDur);
        const gh = g.y - floorY;
        if (!ar.hitThis && ar.gInv <= 0 && flat(o.position, g) < ARENA.hitR && gh < 0.35 + (o.position.y - floorY)) {
          ar.hitThis = true; ar.gInv = ARENA.gInvuln;
          ctx.controller.knockback?.(ar.lungeDir.clone(), 4);
          ctx.audio?.sfx?.('boing');
          point('o');
          if (Math.random() < 0.45) L.say('ar_g_hurt', { chance: 0.8 });
          if (ar.o > ar.g + 3 && Math.random() < 0.3) L.say('ar_g_behind');
        }
        if (ar.st > ARENA.lungeDur) {
          ar.st = 0;
          if (!ar.hitThis && Math.random() < D.trip) { ar.state = 'trip'; clip('land_head', { once: true, fallback: 'dizzy' }); ctx.audio?.sfx?.('boing', { vol: 0.5 }); }
          else { ar.state = 'recover'; clip('idle_pant'); }
        }
        break;
      }
      case 'trip': if (ar.st > 2.2) { ar.state = 'recover'; ar.st = 0; clip('idle_pant'); } break;
      case 'recover': if (ar.st > 0.8) { ar.state = 'approach'; ar.st = 0; ar.cool = D.every[0] + Math.random() * (D.every[1] - D.every[0]); } break;
      case 'hit': {
        if (ar.kb && ar.kb.t < 0.35) { ar.kb.t += dt; move(ar.kb.dir, 3.2 * (1 - ar.kb.t / 0.35)); }
        if (ar.st > 0.7) { ar.state = 'recover'; ar.st = 0; ar.cool = Math.max(ar.cool, 1.0); }
        break;
      }
    }
  };
  ar.dispose = () => { ctx.ui?.hud?.set?.({ arenaScore: null }); odieAI.onScratch = null; };
  return ar;
}
