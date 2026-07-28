// cutscene.js — the story, told in 3D. Each cutscene is a list of shots; each
// shot moves the camera between two keyframes, shows a set of actors, and
// drops subtitles at timed offsets. Everything on screen is built from
// primitives at load time.

import * as THREE from 'three';
import { TAU, makeRng, lerp, clamp, fmt } from './utils.js';
import * as A from './audio.js';

const lam = (c, f) => new THREE.MeshLambertMaterial({ color: c, flatShading: f !== false });
const bas = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: o != null, opacity: o == null ? 1 : o });

// ── actor builders ──────────────────────────────────────────────────────────

function makeStars(rng, n, D) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x, y, z, l;
    do { x = rng() * 2 - 1; y = rng() * 2 - 1; z = rng() * 2 - 1; l = Math.hypot(x, y, z); } while (l > 1 || l < 0.01);
    const s = D / l;
    pos[i * 3] = x * s; pos[i * 3 + 1] = y * s; pos[i * 3 + 2] = z * s;
    const b = 0.35 + rng() * 0.65;
    col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b * (0.9 + rng() * 0.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: D * 0.004, vertexColors: true, sizeAttenuation: true }));
  p.frustumCulled = false;
  return p;
}

function makePlanet(rng, r, colA, colB, damaged) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 3), lam(colA));
  g.add(body);
  // continents
  for (let i = 0; i < 14; i++) {
    const a = rng() * TAU, e = Math.acos(rng() * 2 - 1);
    const s = r * rng.range(0.14, 0.34);
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), lam(colB));
    m.position.setFromSphericalCoords(r * 0.995, e, a);
    m.scale.y = 0.32;
    m.lookAt(0, 0, 0);
    m.rotateX(Math.PI / 2);
    g.add(m);
  }
  if (damaged) {
    for (let i = 0; i < damaged; i++) {
      const a = rng() * TAU, e = Math.acos(rng() * 2 - 1);
      const s = r * rng.range(0.1, 0.26);
      const m = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), bas(0x000000));
      m.position.setFromSphericalCoords(r * 0.94, e, a);
      g.add(m);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(s * 1.15, s * 0.09, 4, 16), bas(0xff7a2a, 0.85));
      ring.position.copy(m.position);
      ring.lookAt(0, 0, 0);
      g.add(ring);
    }
  }
  const atm = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 24, 16),
    new THREE.MeshBasicMaterial({ color: colB, transparent: true, opacity: 0.13, side: THREE.BackSide }));
  g.add(atm);
  g.userData.body = body;
  return g;
}

function makeSatellite(scale) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 3.0), lam(0x9aa4b4));
  g.add(body);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.5, 12), lam(0x3a3f4c));
  core.position.y = -0.9; g.add(core);
  const ap = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.16, 6, 18), bas(0xff9a3a));
  ap.rotation.x = Math.PI / 2; ap.position.y = -1.15; g.add(ap);
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.6, 18), bas(0x000000));
  eye.rotation.x = Math.PI / 2; eye.position.y = -1.2; g.add(eye);
  for (let i = 0; i < 2; i++) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 1.7), lam(0x2b3a5c));
    arm.position.x = i ? 3.0 : -3.0; g.add(arm);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.14), lam(0x6a7280));
    strut.position.x = i ? 1.7 : -1.7; g.add(strut);
  }
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.15, 0.6, 14, 1, true), lam(0xd8dee8));
  dish.position.set(0, 1.1, -1.0); dish.rotation.x = -0.5; g.add(dish);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bas(0x59ff9a));
  lamp.position.set(0.9, 0.85, 1.4); g.add(lamp);
  g.userData.ap = ap; g.userData.lamp = lamp; g.userData.eye = eye;
  g.scale.setScalar(scale || 1);
  return g;
}

function makeFleet(rng, n, spread) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const s = makeSatellite(0.5 + rng() * 0.4);
    s.position.set(rng.range(-spread, spread), rng.range(-spread * 0.4, spread * 0.4), rng.range(-spread, spread));
    s.rotation.set(rng() * TAU, rng() * TAU, rng() * TAU);
    s.userData.spin = rng.range(-0.3, 0.3);
    g.add(s);
  }
  return g;
}

function makeCity(rng, w, colA, colB, lit) {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.BoxGeometry(w * 2.6, 1, w * 2.6), lam(0x2a2f3a));
  ground.position.y = -0.5; g.add(ground);
  for (let i = 0; i < 90; i++) {
    const x = rng.range(-w, w), z = rng.range(-w, w);
    const h = Math.pow(rng(), 2) * 22 + 2;
    const bw = rng.range(1.4, 4.2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bw * rng.range(0.7, 1.3)), lam(rng() < 0.5 ? colA : colB));
    m.position.set(x, h / 2, z);
    g.add(m);
    if (lit && rng() < 0.7) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.75, h * 0.7, 0.06), bas(0xffd98a, 0.9));
      win.position.set(x, h * 0.5, z + bw * 0.52);
      g.add(win);
    }
  }
  return g;
}

function makeHoleDisc(r, colA) {
  const g = new THREE.Group();
  const d = new THREE.Mesh(new THREE.CircleGeometry(1, 40), bas(0x000000));
  d.rotation.x = -Math.PI / 2; d.position.y = 0.06; g.add(d);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.4, 44), new THREE.MeshBasicMaterial({
    color: colA, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
  }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
  g.scale.setScalar(r);
  g.userData.ring = ring;
  return g;
}

function makeGuildCore(rng) {
  const g = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 1), lam(0x1c1e28));
  g.add(hub);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(16 + i * 7, 0.9, 6, 48), lam(0x33384a));
    ring.rotation.set(rng() * 0.6 - 0.3 + (i === 1 ? Math.PI / 2 : 0), rng() * TAU, rng() * 0.5);
    g.add(ring);
  }
  for (let i = 0; i < 22; i++) {
    const a = rng() * TAU, rr = 14 + rng() * 18;
    const spur = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, rng.range(4, 12)), lam(0x2a2e3c));
    spur.position.set(Math.cos(a) * rr, rng.range(-8, 8), Math.sin(a) * rr);
    spur.lookAt(0, 0, 0);
    g.add(spur);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 5), bas(0xffc94d));
    l.position.copy(spur.position).multiplyScalar(1.12);
    g.add(l);
  }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), bas(0xffc94d, 0.85));
  g.add(glow);
  g.userData.glow = glow;
  return g;
}

/** A wall of audience lights — one point per few million viewers. */
function makeCrowd(rng, n, spread) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = rng.range(-spread, spread);
    pos[i * 3 + 1] = rng.range(-spread * 0.45, spread * 0.45);
    pos[i * 3 + 2] = rng.range(-spread * 0.5, spread * 0.5) - spread * 0.3;
    const c = rng() < 0.6 ? [1, 0.75, 0.35] : [0.45, 0.85, 1];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  p.frustumCulled = false;
  return p;
}

/** The Vorr handler: tall, thin, more antenna than face. */
function makeHandler() {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 12), lam(0x2e3a44));
  head.scale.set(0.8, 1.35, 0.8);
  g.add(head);
  for (let i = 0; i < 2; i++) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), bas(0xffe08a));
    eye.position.set(i ? 0.85 : -0.85, 0.5, 1.5);
    eye.scale.set(1, 1.5, 0.6);
    g.add(eye);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 3.2, 5), lam(0x1e262e));
    ant.position.set(i ? 0.9 : -0.9, 3.2, 0);
    ant.rotation.z = i ? -0.3 : 0.3;
    g.add(ant);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), bas(0x59ffd0));
    tip.position.set(i ? 1.4 : -1.4, 4.7, 0);
    g.add(tip);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.6, 3.4, 8), lam(0x232c34));
  neck.position.y = -3.6; g.add(neck);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.35, 5, 16), lam(0x4a5560));
  collar.rotation.x = Math.PI / 2; collar.position.y = -2.4; g.add(collar);
  return g;
}

/** The shell: worlds being fitted around a dying star. */
function makeShell(rng) {
  const g = new THREE.Group();
  const star = new THREE.Mesh(new THREE.SphereGeometry(11, 20, 16), bas(0xff6a3a));
  g.add(star);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(14, 20, 16), new THREE.MeshBasicMaterial({ color: 0xff9a5a, transparent: true, opacity: 0.18, side: THREE.BackSide }));
  g.add(halo);
  for (let i = 0; i < 46; i++) {
    const a = rng() * TAU, e = Math.acos(rng() * 2 - 1);
    const r = 30 + rng() * 4;
    const s = rng.range(1.6, 4.4);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), lam(rng() < 0.5 ? 0x4a5162 : 0x38404f));
    m.position.setFromSphericalCoords(r, e, a);
    g.add(m);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(s * 2.4, 0.4, s * 2.4), lam(0x22262f));
    plate.position.copy(m.position).multiplyScalar(0.93);
    plate.lookAt(0, 0, 0);
    g.add(plate);
  }
  g.userData.star = star;
  return g;
}

// ── the scripts ─────────────────────────────────────────────────────────────

const SCENES = {
  intro: {
    title: 'CONTRACT 4,411,908',
    build: (rng) => ({
      stars: makeStars(rng, 1400, 600),
      planet: makePlanet(rng, 26, 0x7a6a52, 0x5c7a4a, 0),
      fleet: makeFleet(rng, 18, 30),
      city: makeCity(rng, 34, 0x6e7686, 0x5a6070, true),
      hole: makeHoleDisc(2, 0xff7a2a),
      guild: makeGuildCore(rng),
      crowd: makeCrowd(rng, 2600, 90),
      rig: makeSatellite(3),
      handler: makeHandler(),
    }),
    place: (a) => {
      a.planet.position.set(0, 0, 0);
      a.fleet.position.set(0, 6, 44);
      a.city.position.set(0, -400, 0);
      a.hole.position.set(0, -399.4, 0);
      a.guild.position.set(0, 800, 0);
      a.crowd.position.set(0, 800, 60);
      a.rig.position.set(0, -800, 0);
      a.handler.position.set(0, -806, 0);
    },
    shots: [
      {
        t: 7, show: ['stars', 'planet', 'fleet'],
        cam: { from: [0, 14, 96], to: [-26, 20, 74], look: [0, 0, 0], lookTo: [0, 2, 20] },
        fx: (a, t) => { a.planet.rotation.y = t * 0.05; a.fleet.position.z = 44 - t * 2.2; a.fleet.children.forEach((s, i) => { s.rotation.y += 0.004 * (1 + i % 3); }); },
        lines: [
          { at: 0.4, who: 'GUILD BULLETIN', text: 'THE VORR CLEARANCE GUILD — CONTRACT 4,411,908' },
          { at: 3.0, who: 'HANDLER', text: 'Every world you are sent to has been surveyed, cleared for clearance, and signed off.' },
          { at: 5.4, who: 'HANDLER', text: 'You do not need to read the survey.' },
        ],
      },
      {
        t: 8, show: ['stars', 'city', 'hole'],
        cam: { from: [0, -368, 46], to: [0, -378, 26], look: [0, -398, 0], lookTo: [0, -398, 0] },
        fx: (a, t) => {
          const s = 1.5 + t * 3.2;
          a.hole.scale.setScalar(s);
          a.city.children.forEach((m, i) => {
            if (i === 0 || m.__gone) return;
            const d = Math.hypot(m.position.x, m.position.z);
            if (d < s * 1.1) { m.position.y -= 0.55; m.rotation.z += 0.05; if (m.position.y < -14) m.__gone = true; }
            else if (d < s * 2.2) { m.rotation.z = Math.sin(t * 20 + i) * 0.02; }
          });
        },
        lines: [
          { at: 0.5, who: 'HANDLER', text: 'Your rig generates a micro-singularity. It grows on whatever it takes.' },
          { at: 3.6, who: 'HANDLER', text: 'But the aperture is not yours. It is master-controlled, from here.' },
        ],
      },
      {
        t: 8, show: ['stars', 'guild', 'crowd'],
        cam: { from: [0, 800, 150], to: [30, 812, 96], look: [0, 800, 0], lookTo: [0, 800, 0] },
        fx: (a, t) => { a.guild.rotation.y = t * 0.12; a.guild.userData.glow.scale.setScalar(1 + Math.sin(t * 3) * 0.06); a.crowd.material.opacity = 0.55 + Math.sin(t * 5) * 0.25; },
        lines: [
          { at: 0.4, who: 'HANDLER', text: 'Power is allocated by audience. Entertain them, and we open you up.' },
          { at: 3.6, who: 'HANDLER', text: 'Bore them, and we close you down to a pinhole.' },
          { at: 6.0, who: 'HANDLER', text: 'That is the whole arrangement. It has worked for nine hundred years.' },
        ],
      },
      {
        t: 8.5, show: ['stars', 'rig', 'handler'],
        cam: { from: [10, -797, 18], to: [-6, -800, 12], look: [0, -800, 0], lookTo: [0, -802, 0] },
        fx: (a, t) => {
          a.rig.rotation.y = -0.6 + t * 0.16;
          a.rig.userData.lamp.material.color.setHex(Math.sin(t * 6) > 0 ? 0x59ff9a : 0x1a3a24);
          a.handler.position.y = -806 + Math.sin(t * 1.2) * 0.2;
          a.handler.rotation.y = Math.sin(t * 0.5) * 0.2;
        },
        lines: [
          { at: 0.3, who: 'GUILD RECORD', text: 'UNIT 7 · CLEARANCE WORKER · AUDIENCE: 0' },
          { at: 2.6, who: 'HANDLER', text: 'You are, at present, the least-watched clearance unit in the Guild.' },
          { at: 5.4, who: 'HANDLER', text: 'Go and be interesting, Unit 7.' },
        ],
      },
    ],
  },

  act2: {
    title: 'ACT II — THE COLONY BELT',
    build: (rng) => ({
      stars: makeStars(rng, 1000, 600),
      planet: makePlanet(rng, 24, 0x6f8a52, 0x4a6a3a, 5),
      city: makeCity(rng, 30, 0xd8d2c4, 0xbdb4a2, true),
      crowd: makeCrowd(rng, 4200, 100),
      handler: makeHandler(),
    }),
    place: (a) => {
      a.planet.position.set(0, 0, 0);
      a.city.position.set(0, -400, 0);
      a.crowd.position.set(0, 400, 40);
      a.handler.position.set(0, 402, 0);
    },
    shots: [
      {
        t: 7, show: ['stars', 'planet'],
        cam: { from: [46, 10, 46], to: [22, 26, 40], look: [0, 0, 0], lookTo: [0, 0, 0] },
        fx: (a, t) => { a.planet.rotation.y = 0.3 + t * 0.07; },
        lines: [
          { at: 0.3, who: 'GUILD BULLETIN', text: 'AUDIENCE 2,140,000 — PROMOTION APPROVED' },
          { at: 2.6, who: 'HANDLER', text: 'Two million. The Guild has moved you up to colony work.' },
          { at: 5.0, who: 'HANDLER', text: 'Colonies have streets. Streets are excellent television.' },
        ],
      },
      {
        t: 8, show: ['stars', 'city'],
        cam: { from: [0, -388, 54], to: [-24, -392, 34], look: [0, -400, 0], lookTo: [0, -398, 0] },
        fx: (a, t) => { a.city.rotation.y = -0.2 + t * 0.03; },
        lines: [
          { at: 0.4, who: 'HANDLER', text: 'The residents were relocated ahead of schedule. It is all in the manifest.' },
          { at: 3.6, who: 'CHAT', text: 'why are the lights still on' },
          { at: 5.4, who: 'HANDLER', text: 'Do not answer questions in chat. Answering questions lowers retention.' },
        ],
      },
    ],
  },

  act3: {
    title: 'ACT III — THE HIVE CITIES',
    build: (rng) => ({
      stars: makeStars(rng, 1200, 600),
      city: makeCity(rng, 52, 0x3a4160, 0x2b3050, true),
      crowd: makeCrowd(rng, 7000, 120),
      handler: makeHandler(),
    }),
    place: (a) => {
      a.city.position.set(0, 0, 0);
      a.crowd.position.set(0, 400, 40);
      a.handler.position.set(0, 402, 0);
    },
    shots: [
      {
        t: 8, show: ['stars', 'city'],
        cam: { from: [0, 8, 78], to: [0, 44, 40], look: [0, 6, 0], lookTo: [0, 10, -10] },
        fx: (a, t) => { a.city.rotation.y = t * 0.035; },
        lines: [
          { at: 0.3, who: 'GUILD BULLETIN', text: 'HIVE WORLD 12-KELL · POPULATION AT LAST CENSUS: 91,400,000' },
          { at: 3.0, who: 'HANDLER', text: 'The Guild has filed this world as sparse.' },
          { at: 5.6, who: 'CHAT', text: 'sparse??' },
        ],
      },
      {
        t: 7.5, show: ['stars', 'crowd', 'handler'],
        cam: { from: [0, 402, 40], to: [8, 403, 26], look: [0, 402, 0], lookTo: [0, 402, 0] },
        fx: (a, t) => { a.crowd.material.opacity = 0.6 + Math.sin(t * 6) * 0.3; a.handler.rotation.y = Math.sin(t * 0.6) * 0.25; },
        lines: [
          { at: 0.4, who: 'HANDLER', text: 'Two hundred million concurrent. Your retention is the best in the fleet.' },
          { at: 3.4, who: 'HANDLER', text: 'Keep it that way and nobody will ever ask you a difficult question again.' },
        ],
      },
    ],
  },

  turn: {
    title: 'ACT IV — THE SANCTUM',
    build: (rng) => ({
      stars: makeStars(rng, 900, 600),
      planet: makePlanet(rng, 27, 0x3f7f5a, 0x2f6a4a, 0),
      handler: makeHandler(),
      crowd: makeCrowd(rng, 9000, 130),
      rig: makeSatellite(3),
    }),
    place: (a) => {
      a.planet.position.set(0, 0, 0);
      a.handler.position.set(0, 402, 0);
      a.crowd.position.set(0, 400, 40);
      a.rig.position.set(0, -800, 0);
    },
    shots: [
      {
        t: 8.5, show: ['stars', 'planet'],
        cam: { from: [64, 6, 30], to: [40, 16, 40], look: [0, 0, 0], lookTo: [0, 0, 0] },
        fx: (a, t) => { a.planet.rotation.y = t * 0.06; },
        lines: [
          { at: 0.3, who: 'SURVEY', text: 'UNCATALOGUED · BIOSIGNS: DENSE · CLEARANCE: APPROVED' },
          { at: 3.0, who: 'HANDLER', text: '…' },
          { at: 4.4, who: 'HANDLER', text: 'The contract came down from the Verge itself. I did not write it.' },
        ],
      },
      {
        t: 9, show: ['stars', 'rig'],
        cam: { from: [-14, -798, 16], to: [4, -799, 11], look: [0, -800, 0], lookTo: [0, -800, 0] },
        fx: (a, t) => {
          a.rig.rotation.y = 0.4 - t * 0.1;
          const on = Math.sin(t * 9) > 0;
          a.rig.userData.lamp.material.color.setHex(on ? 0xff4a3a : 0x3a1210);
        },
        lines: [
          { at: 0.3, who: 'UNREGISTERED CHANNEL', text: '…anyone receiving. Anyone at all.' },
          { at: 3.0, who: 'UNREGISTERED CHANNEL', text: 'We are still here. We were always still here.' },
          { at: 6.0, who: 'HANDLER', text: 'That channel is a hazard simulation. Mute it.' },
        ],
      },
      {
        t: 7.5, show: ['stars', 'crowd', 'handler'],
        cam: { from: [0, 402, 34], to: [-10, 403, 24], look: [0, 402, 0], lookTo: [0, 402, 0] },
        fx: (a, t) => { a.crowd.material.opacity = 0.5 + Math.sin(t * 4) * 0.35; a.handler.rotation.y = -0.2 + Math.sin(t * 0.4) * 0.15; },
        lines: [
          { at: 0.4, who: 'HANDLER', text: 'Nine hundred million people are watching you right now, Unit 7.' },
          { at: 3.6, who: 'HANDLER', text: 'Not one of them asked what was down there either.' },
        ],
      },
    ],
  },

  act5: {
    title: 'ACT V — THE CORE VERGE',
    build: (rng) => ({
      stars: makeStars(rng, 1500, 700),
      shell: makeShell(rng),
      guild: makeGuildCore(rng),
      handler: makeHandler(),
      crowd: makeCrowd(rng, 12000, 150),
    }),
    place: (a) => {
      a.shell.position.set(0, 0, 0);
      a.guild.position.set(0, 400, 0);
      a.handler.position.set(0, 800, 0);
      a.crowd.position.set(0, 798, 40);
    },
    shots: [
      {
        t: 7, show: ['stars', 'guild'],
        cam: { from: [0, 400, 130], to: [40, 418, 74], look: [0, 400, 0], lookTo: [0, 400, 0] },
        fx: (a, t) => { a.guild.rotation.y = t * 0.1; },
        lines: [
          { at: 0.3, who: 'GUILD BULLETIN', text: 'AUDIENCE 2,000,000,000 — CLEARED FOR THE VERGE' },
          { at: 2.8, who: 'HANDLER', text: 'Highest retention in Guild history. They want you inside.' },
        ],
      },
      {
        t: 10, show: ['stars', 'shell'],
        cam: { from: [0, 4, 190], to: [16, 34, 66], look: [0, 0, 0], lookTo: [0, 0, 0] },
        fx: (a, t) => {
          a.shell.rotation.y = t * 0.05;
          a.shell.userData.star.material.color.setHSL(0.03, 1, 0.42 + Math.sin(t * 2) * 0.05);
        },
        lines: [
          { at: 1.2, who: '', text: 'The Verge is a shell being built around a dying star.' },
          { at: 4.2, who: '', text: 'It is made of planets.' },
          { at: 6.4, who: 'UNIT 7', text: 'How many worlds.' },
          { at: 8.2, who: 'HANDLER', text: 'That is not a question you have the clearance to ask.' },
        ],
      },
    ],
  },

  finale: {
    title: 'THE LAST BROADCAST',
    build: (rng) => ({
      stars: makeStars(rng, 1800, 700),
      guild: makeGuildCore(rng),
      crowd: makeCrowd(rng, 16000, 170),
      hole: makeHoleDisc(1, 0xffc94d),
      rig: makeSatellite(3),
      shell: makeShell(rng),
    }),
    place: (a) => {
      a.guild.position.set(0, 0, 0);
      a.crowd.position.set(0, 400, 40);
      a.hole.position.set(0, 0, 60);
      a.hole.rotation.x = Math.PI / 2;
      a.rig.position.set(0, -800, 0);
      a.shell.position.set(0, 1200, 0);
    },
    shots: [
      {
        t: 8, show: ['stars', 'rig', 'crowd'],
        cam: { from: [12, -798, 16], to: [-4, -799, 10], look: [0, -800, 0], lookTo: [0, -800, 0] },
        fx: (a, t) => { a.rig.rotation.y = -0.3 + t * 0.06; a.crowd.position.set(0, -800, 40); a.crowd.material.opacity = 0.4 + Math.min(0.55, t * 0.09); },
        lines: [
          { at: 0.3, who: 'AUDIENCE', text: '4,000,000,000,000 CONCURRENT' },
          { at: 2.6, who: 'HANDLER', text: 'Unit 7. Stand down. That is a direct order from the—' },
          { at: 5.4, who: 'UNIT 7', text: 'You told me power comes from the audience.' },
        ],
      },
      {
        t: 9, show: ['stars', 'guild', 'hole'],
        cam: { from: [0, 30, 150], to: [0, 12, 78], look: [0, 0, 0], lookTo: [0, 0, 0] },
        fx: (a, t) => {
          a.guild.rotation.y = t * 0.14;
          const s = 1 + Math.pow(t / 9, 2) * 44;
          a.hole.scale.setScalar(s);
          a.hole.position.z = 60 - t * 5;
          a.guild.scale.setScalar(clamp(1 - Math.max(0, t - 4.5) * 0.14, 0.05, 1));
          a.guild.position.z = -Math.max(0, t - 4.5) * 2;
        },
        lines: [
          { at: 0.6, who: 'UNIT 7', text: 'They are all watching.' },
          { at: 3.0, who: 'CHAT', text: 'WAIT' },
          { at: 4.2, who: 'CHAT', text: 'WHAT IS HE DOING' },
          { at: 6.0, who: 'CHAT', text: 'CLIP THAT CLIP THAT CLIP THAT' },
        ],
      },
      {
        t: 10, show: ['stars', 'shell'],
        cam: { from: [0, 1200, 210], to: [0, 1206, 120], look: [0, 1200, 0], lookTo: [0, 1200, 0] },
        fx: (a, t) => {
          a.shell.rotation.y = t * 0.06;
          const k = clamp((t - 2) / 6, 0, 1);
          a.shell.children.forEach((m, i) => {
            if (i < 2) return;
            m.position.multiplyScalar(1 + k * 0.004 * (1 + (i % 5)));
          });
          a.shell.userData.star.scale.setScalar(1 + k * 0.5);
        },
        lines: [
          { at: 1.0, who: '', text: 'The clearance programme ended at 04:12, Guild Standard.' },
          { at: 4.0, who: '', text: 'It remains the most-watched event in recorded history.' },
          { at: 7.0, who: '', text: 'You were never the product, Unit 7. They were.' },
        ],
      },
    ],
  },
};

export const CUTSCENE_IDS = Object.keys(SCENES);
export function cutsceneTitle(id) { return SCENES[id] ? SCENES[id].title : ''; }

// ── the director ────────────────────────────────────────────────────────────

export class Cutscene {
  constructor(renderer, dom) {
    this.renderer = renderer;
    this.dom = dom;            // { root, text, who, skip, title }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02030a);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 3000);
    const amb = new THREE.AmbientLight(0x7280a0, 1.7);
    this.scene.add(amb);
    const key = new THREE.DirectionalLight(0xfff0d8, 2.1);
    key.position.set(60, 80, 60);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x5a8aff, 1.0);
    rim.position.set(-70, -20, -60);
    this.scene.add(rim);
    this.actors = null;
    this.playing = false;
    this._built = {};
  }

  play(id, onDone) {
    const def = SCENES[id];
    if (!def) { onDone && onDone(); return; }
    this.stop();
    this.id = id;
    this.def = def;
    const rng = makeRng(id.length * 7919 + id.charCodeAt(0) * 131);
    this.actors = def.build(rng);
    for (const k in this.actors) { this.actors[k].visible = false; this.scene.add(this.actors[k]); }
    def.place(this.actors);
    this.shotI = -1;
    this.shotT = 0;
    this.onDone = onDone;
    this.playing = true;
    this.dom.root.classList.remove('hidden');
    if (this.dom.title) { this.dom.title.textContent = def.title; this.dom.title.classList.add('show'); }
    this._nextShot();
    A.startMusic('verge', 66);
  }

  _nextShot() {
    this.shotI++;
    const s = this.def.shots[this.shotI];
    if (!s) { this.finish(); return; }
    this.shotT = 0;
    this.shot = s;
    this.lineI = 0;
    for (const k in this.actors) this.actors[k].visible = s.show.includes(k);
    this._setLine(null);
  }

  _setLine(l) {
    if (!this.dom.text) return;
    if (!l) { this.dom.text.classList.remove('show'); return; }
    this.dom.who.textContent = l.who || '';
    this.dom.who.style.display = l.who ? 'block' : 'none';
    this.dom.text.querySelector('p').textContent = l.text;
    this.dom.text.classList.add('show');
    A.sfxUi(true);
  }

  update(dt) {
    if (!this.playing) return;
    this.shotT += dt;
    const s = this.shot;
    const t = this.shotT;
    const k = clamp(t / s.t, 0, 1);
    const e = k * k * (3 - 2 * k);
    const c = s.cam;
    this.camera.position.set(
      lerp(c.from[0], c.to[0], e), lerp(c.from[1], c.to[1], e), lerp(c.from[2], c.to[2], e));
    const lx = lerp(c.look[0], (c.lookTo || c.look)[0], e);
    const ly = lerp(c.look[1], (c.lookTo || c.look)[1], e);
    const lz = lerp(c.look[2], (c.lookTo || c.look)[2], e);
    this.camera.lookAt(lx, ly, lz);
    if (s.fx) s.fx(this.actors, t, dt);
    while (s.lines && this.lineI < s.lines.length && t >= s.lines[this.lineI].at) {
      this._setLine(s.lines[this.lineI]);
      this.lineI++;
    }
    if (this.shotI === 0 && t > 2.4 && this.dom.title) this.dom.title.classList.remove('show');
    if (t >= s.t) this._nextShot();
  }

  render(w, h) {
    if (!this.playing) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  skip() {
    if (!this.playing) return;
    this.finish();
  }

  finish() {
    this.playing = false;
    this.dom.root.classList.add('hidden');
    if (this.dom.title) this.dom.title.classList.remove('show');
    this._setLine(null);
    A.stopMusic();
    this.stop();
    const cb = this.onDone;
    this.onDone = null;
    if (cb) cb();
  }

  stop() {
    if (!this.actors) return;
    for (const k in this.actors) {
      const a = this.actors[k];
      this.scene.remove(a);
      a.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose()); else o.material.dispose(); }
      });
    }
    this.actors = null;
  }
}
