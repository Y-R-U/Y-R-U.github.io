import * as THREE from 'three';
import { Aircraft } from './aircraft.js';
import { Autopilot } from './autopilot.js';
import { circuitRoute, departureRoute, arrivalRoute, runwayEnd, fromRunway, standInfo, circuitLegs } from './routes.js';
import { KT } from './vmath.js';
import { TOWER } from '../world/layout.js';

const NAMES = ['Wobble', 'Fizz', 'Crumpet', 'Toff', 'Bunty', 'Pip', 'Monty', 'Gussie', 'Plum', 'Biffy', 'Tuppence', 'Hector', 'Dottie', 'Jasper', 'Clarice'];
const COMPANIES = ['Fizz Air', 'Posh Wings', 'Crumpet Air', 'Monocle Jet', 'Royal Wobble', 'Tiara Air', 'Scone Air', 'Gin & Wings', 'Duke Air', 'Corgi Air'];
const PALETTES = [
  ['#1f4e8c', '#f3efe4', '#d4a017'], ['#2f6b3a', '#f6f1e6', '#c8102e'], ['#6b1f5c', '#f4ead8', '#e0b12c'],
  ['#e05a1c', '#fbf6ec', '#1b2a41'], ['#111827', '#f2c94c', '#e5e7eb'], ['#0f766e', '#fefce8', '#f97316'],
  ['#9b1c1c', '#f8f4ec', '#1e3a8a'], ['#f2e8d5', '#2a3d66', '#b8860b'],
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function randomLivery() {
  const [primary, secondary, accent] = pick(PALETTES);
  const name = pick(NAMES), company = Math.random() < 0.6 ? pick(COMPANIES) : '';
  const reg = 'K-' + (name.slice(0, 4).toUpperCase());
  return { name, company, primary, secondary, accent, registration: reg };
}

// AI traffic that keeps the airport busy (also used as background traffic during play), plus the menu's cinematic camera.
export function createAttract({ scene, traffic, env, createPlane, quality, max = 4, onRig, onSpawn, onDespawn, activeEnd = () => '09' }) {
  const ai = [];
  const pending = new Set();
  let respawnT = 0;

  async function spawn(kind, opts = {}) {
    const rig = await createPlane({ type: 'c172', livery: randomLivery(), quality: quality === 'high' ? 'high' : 'low', cockpit: false });
    rig.setView('chase');
    rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    onRig?.(rig);
    const ac = new Aircraft({ dims: rig.dims });
    const ap = new Autopilot(ac);
    const E = activeEnd(), e9 = runwayEnd(E);
    let route;
    if (kind === 'parked' || kind === 'depart') {
      const sid = opts.stand || traffic.claimStand(ac);
      if (!sid) { rig.dispose(); return null; }
      const s = standInfo(sid);
      ac.place({ x: s.pos[0], z: s.pos[1], heading: s.heading }, env);
      route = departureRoute(E);
      route = { ...route, legs: [{ kind: 'park', seconds: opts.wait ?? 4 + Math.random() * 20, label: 'BOARDING' }, ...route.legs] };
      traffic.standOwner.set(sid, ac);
    } else if (kind === 'downwind') {
      const legs = circuitLegs(E);
      const d = legs[2].to, c = legs[1].to;
      ac.place({ x: (c[0] + d[0]) / 2, z: (c[2] + d[2]) / 2, alt: 300, heading: (e9.hdg + 180) % 360, speed: 85 * KT, throttle: 0.6 }, env);
      route = arrivalRoute(E, { stand: 'auto', parkSeconds: 15 + Math.random() * 20, then: departureRoute(E) });
      route = { ...route, legs: route.legs.slice(1) };
    } else if (kind === 'final') {
      const [x, z] = fromRunway(e9, -opts.dist || -2600, 0);
      ac.place({ x, z, alt: (opts.dist || 2600) * 0.07 + 10, heading: e9.hdg, speed: 68 * KT, throttle: 0.4, flaps: 1 }, env);
      route = arrivalRoute(E, { stand: 'auto', parkSeconds: 20 + Math.random() * 20, then: departureRoute(E) });
      route = { ...route, legs: route.legs.filter((l) => l.kind !== 'fly') };
    } else {
      const a = Math.random() * Math.PI * 2, r = 5000;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      ac.place({ x, z, alt: 420, heading: (Math.atan2(-x, z) * 180 / Math.PI + 360) % 360, speed: 95 * KT, throttle: 0.6 }, env);
      route = arrivalRoute(E, { stand: 'auto', parkSeconds: 20 + Math.random() * 30, then: departureRoute(E) });
    }
    scene.add(rig.root);
    const ent = traffic.add({ aircraft: ac, ap, rig, name: rig.livery?.().registration || kind });
    ap.setRoute(route);
    ent.kind = kind;
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

  // Remove AI that would sit on top of the player when play begins.
  function clearAround(x, z, r) {
    for (const e of [...ai]) if (Math.hypot(e.ac.pos.x - x, e.ac.pos.z - z) < r && e.ac.onGround) despawn(e);
  }

  // ---------- cinematic camera ----------
  const cine = { shot: null, t: 0, dur: 0, i: 0, look: new THREE.Vector3(0, 0, -100), pos: new THREE.Vector3(-900, 200, 700), target: null };
  const SHOTS = ['wide', 'orbit', 'tripod', 'tower', 'follow'];
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
      pos.set(tp.x - Math.sin(h) * 30 + Math.cos(h) * 14, tp.y + 7, tp.z + Math.cos(h) * 30 + Math.sin(h) * 14); look.copy(tp);
    }
    const gy = env.groundHeightAt(pos.x, pos.z) + 1.5;
    if (pos.y < gy) pos.y = gy;
    if (cine.snap) { cine.pos.copy(pos); cine.look.copy(look); cine.snap = false; }
    cine.pos.lerp(pos, 1 - Math.exp(-dt * 2.5));
    cine.look.lerp(look, 1 - Math.exp(-dt * 4));
    camera.position.copy(cine.pos);
    camera.lookAt(cine.look);
  }

  return { ai, start, update, updateCamera, clearAround, spawn, despawn, get shot() { return cine.shot; } };
}
