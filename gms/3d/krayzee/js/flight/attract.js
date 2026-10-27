import * as THREE from 'three';
import { Aircraft } from './aircraft.js';
import { Autopilot } from './autopilot.js';
import { aiSpawn } from './routes.js';
import { TOWER } from '../world/layout.js';
import { fitFov } from './cameras.js';
import { PLANE_TYPES } from '../plane/index.js';

// JETCORE (D33): AI is mostly light planes; now and then (one at a time) a heavy or the fast jet drops by, once its model
// exists (until then createPlane would draw a C172 for it). Weights: herc 2, f35 2, jumbo 1.
export const AI_JETS = { chance: 0.07, pool: ['herc', 'herc', 'f35', 'f35', 'jumbo'] };

const NAMES = ['Wobble', 'Fizz', 'Crumpet', 'Toff', 'Bunty', 'Pip', 'Monty', 'Gussie', 'Plum', 'Biffy', 'Tuppence', 'Hector', 'Dottie', 'Jasper', 'Clarice'];
const COMPANIES = ['Fizz Air', 'Posh Wings', 'Crumpet Air', 'Monocle Jet', 'Royal Wobble', 'Tiara Air', 'Scone Air', 'Gin & Wings', 'Duke Air', 'Corgi Air'];
const PALETTES = [
  ['#1f4e8c', '#f3efe4', '#d4a017'], ['#2f6b3a', '#f6f1e6', '#c8102e'], ['#6b1f5c', '#f4ead8', '#e0b12c'],
  ['#e05a1c', '#fbf6ec', '#1b2a41'], ['#111827', '#f2c94c', '#e5e7eb'], ['#0f766e', '#fefce8', '#f97316'],
  ['#9b1c1c', '#f8f4ec', '#1e3a8a'], ['#f2e8d5', '#2a3d66', '#b8860b'],
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Registrations are unique for the session (PLAYTEST B10: K-BIFF ×2). `taken` adds names in use elsewhere (the player).
const usedRegs = new Set();
export function randomLivery(taken = []) {
  const [primary, secondary, accent] = pick(PALETTES);
  const busy = (r) => usedRegs.has(r) || taken.includes(r);
  const free = NAMES.filter((n) => !busy('K-' + n.slice(0, 4).toUpperCase()));
  const name = free.length ? pick(free) : pick(NAMES), company = Math.random() < 0.6 ? pick(COMPANIES) : '';
  let reg = 'K-' + name.slice(0, 4).toUpperCase();
  for (let n = 2; busy(reg); n++) reg = 'K-' + name.slice(0, 3).toUpperCase() + n;
  usedRegs.add(reg);
  return { name, company, primary, secondary, accent, registration: reg };
}

// AI traffic that keeps the airport busy (also used as background traffic during play), plus the menu's cinematic camera.
// types: aircraft types to draw AI from (repeat an id to weight it), e.g. ['c172', 'c172', 'tiger', 'bathtub'].
export function createAttract({ scene, traffic, env, createPlane, quality, max = 4, onRig, onSpawn, onDespawn, activeEnd = () => '09', types = ['c172'] }) {
  const ai = [];
  const pending = new Set();
  let respawnT = 0;

  async function spawn(kind, opts = {}) {
    let type = opts.type || pick(types);
    if (!opts.type && kind !== 'holding' && Math.random() < AI_JETS.chance && !ai.some((e) => AI_JETS.pool.includes(e.type))) {
      const j = pick(AI_JETS.pool);
      if (PLANE_TYPES.includes(j)) type = j;
    }
    const rig = await createPlane({ type, livery: randomLivery(traffic.list.map((e) => e.name)), quality: quality === 'high' ? 'high' : 'low', cockpit: false });
    rig.setView('chase');
    rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    onRig?.(rig);
    const ac = new Aircraft({ type, dims: rig.dims });
    const ap = new Autopilot(ac);
    const plan = aiSpawn(kind, activeEnd(), { ...opts, type, claimStand: () => traffic.claimStand(ac) });
    if (!plan) { rig.dispose(); return null; }
    ac.place(plan.place, env);
    if (plan.stand) traffic.standOwner.set(plan.stand, ac);
    const route = plan.route;
    scene.add(rig.root);
    const ent = traffic.add({ aircraft: ac, ap, rig, name: rig.livery?.().registration || kind });
    ap.setRoute(route);
    ent.kind = kind; ent.type = type;
    ai.push(ent);
    onSpawn?.(ent);
    return ent;
  }

  function despawn(ent) {
    onDespawn?.(ent);
    traffic.remove(ent);
    ent.rig.dispose();
    ai.splice(ai.indexOf(ent), 1);
  }

  async function start() {
    const kinds = ['downwind', 'final', 'parked', 'parked'].slice(0, max);
    await Promise.all(kinds.map((k, i) => spawn(k, { wait: i === 2 ? 3 : 35 })));
  }

  function update(dt) {
    for (const e of [...ai]) {
      if (e.ap.done && e.ap.phase === 'GONE') despawn(e);
      else if (e.ac.crashed) { e.deadT = (e.deadT || 0) + dt; if (e.deadT > 5) despawn(e); }
    }
    if (ai.length + pending.size < max && (respawnT -= dt) <= 0) {
      respawnT = 12 + Math.random() * 15;
      const p = spawn(Math.random() < 0.55 ? 'arrive' : 'depart', { wait: 2 });
      pending.add(p); p.finally(() => pending.delete(p));
    }
  }

  // PLAYTEST #6/#9: someone to be rude to within the first minute — a rival on a long final (≈ 75 s out, so a
  // lined-up player is still cleared at once) and one at the hold. Call on play start and after a respawn.
  async function seedRivals({ final = true, hold = true, finalDist = 3600 } = {}) {
    const out = [];
    const busyFinal = ai.some((e) => e.ap.leg?.kind === 'approach' && !e.ac.onGround);
    const busyHold = ai.some((e) => e.ac.onGround && /HOLD|LINE/.test(e.ap.phase));
    if (final && !busyFinal) out.push(await spawn('final', { dist: finalDist }));
    if (hold && !busyHold) out.push(await spawn('holding'));
    return out.filter(Boolean);
  }

  // Remove AI that would sit on top of the player when play begins (and, on a runway, that runway's users: B6).
  function clearAround(x, z, r) {
    for (const e of traffic.spawnConflicts(x, z, r)) if (ai.includes(e)) despawn(e);
  }

  // ---------- cinematic camera ----------
  const cine = { shot: null, t: 0, dur: 0, i: 0, fov: 70, look: new THREE.Vector3(0, 0, -100), pos: new THREE.Vector3(-900, 200, 700), target: null };
  // PLAYTEST: planes read as specks. Every shot has a plane in it, close: no scenery-only wide orbit while there is
  // traffic, the tower shot only for a plane within 600 m, and long shots zoom so the plane is ~1/8 of the frame.
  const SHOTS = ['orbit', 'tripod', 'follow', 'tower'];
  const interest = (e) => {
    const p = e.ap.phase;
    if (/ROLL|ROTATE|FLARE|ROLLOUT/.test(p)) return 5;
    if (/FINAL|CLIMB/.test(p)) return 4;
    if (/TAXI|LINE/.test(p)) return 2;
    if (e.ac.onGround) return 0.5;
    return 1.5;
  };
  function nextShot() {
    cine.t = 0;
    const live = ai.filter((e) => !e.ac.crashed);
    live.sort((a, b) => interest(b) - interest(a) + (Math.random() - 0.5));
    cine.target = live[0] || null;
    cine.shot = cine.target ? SHOTS[cine.i++ % SHOTS.length] : 'wide';
    if (cine.shot === 'tower' && Math.hypot(cine.target.ac.pos.x - TOWER.position[0], cine.target.ac.pos.z - TOWER.position[2]) > 600) cine.shot = 'follow';
    cine.dur = cine.shot === 'wide' ? 9 : 7 + Math.random() * 3;
    const t = cine.target?.ac;
    if (cine.shot === 'tripod' && t) {
      const v = t.gs > 3 ? [t.vel.x / t.gs, t.vel.z / t.gs] : [Math.sin(t.heading * Math.PI / 180), -Math.cos(t.heading * Math.PI / 180)];
      const ahead = Math.min(220, t.gs * 4 + 25), side = 26 + Math.random() * 20;
      cine.fixed = new THREE.Vector3(t.pos.x + v[0] * ahead - v[1] * side, 0, t.pos.z + v[1] * ahead + v[0] * side);
      cine.fixed.y = env.groundHeightAt(cine.fixed.x, cine.fixed.z) + 1.8 + (t.onGround ? 0 : Math.min(30, t.agl * 0.4));
    }
    cine.orbitA = Math.random() * Math.PI * 2;
    cine.snap = true;
  }
  function updateCamera(dt, camera) {
    cine.t += dt;
    if (!cine.shot || cine.t > cine.dur || (cine.target && !ai.includes(cine.target))) nextShot();
    const t = cine.target?.ac, tp = t ? cine.target.rig.root.position : null;
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    const s = cine.shot;
    if (s === 'wide' || !tp) {
      const a = cine.t * 0.035 + 2.2;
      pos.set(Math.cos(a) * 1100 - 80, 230, Math.sin(a) * 1100 - 100); look.set(-60, 0, -120);
    } else if (s === 'orbit') {
      const a = cine.orbitA + cine.t * 0.16;
      pos.set(tp.x + Math.cos(a) * 24, tp.y + 4.5, tp.z + Math.sin(a) * 24); look.copy(tp);
    } else if (s === 'tripod') {
      pos.copy(cine.fixed); look.copy(tp);
    } else if (s === 'tower') {
      pos.set(TOWER.position[0], TOWER.height + 4, TOWER.position[2] + 10); look.copy(tp);
    } else {
      const h = t.track * Math.PI / 180;
      pos.set(tp.x - Math.sin(h) * 22 + Math.cos(h) * 11, tp.y + 5, tp.z + Math.cos(h) * 22 + Math.sin(h) * 11); look.copy(tp);
    }
    const gy = env.groundHeightAt(pos.x, pos.z) + 1.5;
    if (pos.y < gy) pos.y = gy;
    fitFov(camera, 70, 45, 85);
    const base = camera.fov;
    const want = tp && s !== 'wide' ? Math.min(base, Math.max(10, 16 * Math.atan(5.5 / Math.max(1, pos.distanceTo(tp))) * 180 / Math.PI)) : base;
    if (cine.snap) { cine.pos.copy(pos); cine.look.copy(look); cine.fov = want; cine.snap = false; }
    cine.pos.lerp(pos, 1 - Math.exp(-dt * (s === 'follow' || s === 'orbit' ? 6 : 2.5)));
    cine.look.lerp(look, 1 - Math.exp(-dt * 4));
    cine.fov += (want - cine.fov) * (1 - Math.exp(-dt * 3));
    camera.fov = Math.min(base, cine.fov); camera.updateProjectionMatrix();
    camera.position.copy(cine.pos);
    camera.lookAt(cine.look);
    // the menu covers the left half (landscape) / the bottom (portrait): put the plane in the open part of the screen
    const vf = (camera.fov * Math.PI) / 360;
    if (camera.aspect >= 1) camera.rotateY(Math.atan(0.4 * Math.tan(vf) * camera.aspect));
    else camera.rotateX(-Math.atan(0.1 * Math.tan(vf)));
  }

  return { ai, start, update, updateCamera, clearAround, spawn, despawn, seedRivals, get shot() { return cine.shot; } };
}
