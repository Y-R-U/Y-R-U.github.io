// Where the grid meets the ocean — C3. The sim speaks {r,c}; everything cinematic needs metres.
//
// The arrangement is dramatised on purpose (that is what the disclaimer caption is for): a fleet
// laid out on its true grid is a parade of parallel ships at identical spacing, which is the exact
// lattice every critic on this project has punished. `layout()` derives a bearing, a stagger and a
// range offset from each ship's own cell, so the formation is stable, reproducible from the board,
// and never regular.
//
// This file also owns the three scored gunnery scenarios and the funnel/fire smoke plumes, which
// live here rather than in ship.js because one InstancedMesh serves every smoking ship in frame
// for one draw call. round.js still owns all shell-trail smoke.

import * as THREE from 'three';
import { buildShip } from './ship.js';
import { sea } from './ocean.js';
import { defineScenario, frameCamera } from '../scenarios.js';
import { getMaterial } from './materials/index.js';
import { rng, clamp } from './textures/noise.js';
import { track } from '../engine/budget.js';
import { FLEET, KIT_FOR_LENGTH } from '../config.js';
import { setMuzzlePhase, resetGunOrder } from './vfx/gun.js';
import { setShipAmbient } from './materials/hull.js';
import { ROOM } from './bridge.js';

// ── smoke plumes ────────────────────────────────────────────────────────────────────────────

let plumeTex = null;
function plumeTexture() {
  if (plumeTex) return plumeTex;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const r = rng(2207);
  const lobes = Array.from({ length: 11 }, () => [(r() - 0.5) * 0.46, (r() - 0.5) * 0.46, 0.11 + r() * 0.16]);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S - 0.5, v = (y + 0.5) / S - 0.5;
      let a = 0, lit = 0;
      for (const [lx, ly, lr] of lobes) {
        const d = Math.hypot(u - lx, v - ly) / lr;
        const w = Math.max(0, 1 - d * d);
        if (w > a) { a = w; lit = 0.5 + 0.5 * (0.5 - (v - ly) / lr); }
      }
      a *= Math.max(0, 1 - Math.pow(Math.hypot(u, v) * 2.02, 3));
      const i = (y * S + x) * 4;
      const s = 0.55 + 0.45 * clamp(lit, 0, 1);
      img.data[i] = 255 * s; img.data[i + 1] = 252 * s; img.data[i + 2] = 248 * s;
      img.data[i + 3] = Math.min(1, a * 1.3) * 255;
    }
  }
  g.putImageData(img, 0, 0);
  plumeTex = new THREE.CanvasTexture(cv);
  plumeTex.colorSpace = THREE.SRGBColorSpace;
  plumeTex.needsUpdate = true;
  track(plumeTex, { w: S, h: S, fmt: 'rgba', mips: true, label: 'fleet:plume' });
  return plumeTex;
}

// One instanced field for every plume in the scene. Puffs are placed once from a seeded drift
// path: a still has to be reproducible, and a plume that animates would put this shot under D13
// for no gain.
class Plumes {
  constructor(cap = 130) {
    const mat = new THREE.MeshBasicMaterial({
      map: plumeTexture(), transparent: true, depthWrite: false, fog: true,
    });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vA;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vA = aAlpha;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vA;')
        .replace('#include <opaque_fragment>', 'gl_FragColor = vec4( outgoingLight, diffuseColor.a * vA );');
    };
    mat.customProgramCacheKey = () => 'waterlinePlumeAlpha';
    this.cap = cap;
    this.n = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.mesh.geometry.setAttribute('aAlpha', this.alpha);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    this.puffs = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
  }

  // drift is metres travelled per puff; tone 0 = white steam, 1 = oil-fire black
  add(x, y, z, { drift = [-14, 4], puffs = 12, rise = 7, scale = 9, tone = 0, seed = 7, spread = 0.5, alpha = 0.5, fire = 0 } = {}) {
    const r = rng(seed);
    for (let i = 0; i < puffs && this.n < this.cap; i++) {
      const t = i / puffs;
      const g = 0.25 + t * 1.5;
      this.puffs.push({
        p: new THREE.Vector3(
          x + drift[0] * t * g + (r() - 0.5) * scale * spread,
          y + rise * t * g + (r() - 0.5) * scale * spread * 0.5,
          z + drift[1] * t * g + (r() - 0.5) * scale * spread,
        ),
        s: scale * (fire && t < fire ? 0.45 : 0.55 + t * 1.9) * (0.8 + r() * 0.4),
        c: fire && t < fire
          ? new THREE.Color().setHSL(0.055 + r() * 0.02, 1, 0.52 + 0.22 * r())
          : new THREE.Color().setHSL(0.08, 0.05 + tone * 0.15, (1 - tone * 0.86) * (0.62 + 0.3 * r())),
        a: (fire && t < fire ? 0.9 : alpha) * (1 - Math.pow(t, 2.2) * 0.75) * (0.7 + r() * 0.45),
      });
      this.n++;
    }
  }

  clear() { this.puffs.length = 0; this.n = 0; this.mesh.count = 0; }

  update(camera) {
    camera.getWorldQuaternion(this.q);
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      this.s.setScalar(p.s);
      this.m.compose(p.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, p.c);
      this.alpha.array[i] = p.a;
    }
    this.mesh.count = this.puffs.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
}

// ── the flagship ────────────────────────────────────────────────────────────────────────────
//
// D30 ruling 3: the bridge is not a room floating at y = 18, it is a room on a ship. One ship of
// side 0 is pinned at the origin with the playable bridge on its tower, and the tower is built up
// to `ROOM.deck − drop` and stops there — the room's own house (bridge.js) continues it. `drop` is
// slack, not a gap: the house reaches down past it, so the joint is a lap and never a seam.

const flagshipIndex = list => {
  let best = -1, len = 0;
  for (let i = 0; i < list.length; i++) if (list[i].len > len) { len = list[i].len; best = i; }
  return best;
};

function buildFlagship(quality) {
  const f = FLEET.flagship;
  return buildShip('battleship', quality, f.cells, {
    seed: f.seed, detail: 2, moored: true,
    bridge: { deck: ROOM.deck - f.drop, top: ROOM.deck + ROOM.h },
  });
}

// Nothing else may park inside the flagship, and two escorts nose to nose read as a collision
// rather than as a formation. Radial push first, then a few relaxation passes, then the radius
// again — the relaxation is what stops the push piling every ship onto one circle.
function standOff(slots, { clear, gap }) {
  const rest = slots.filter(s => !s.flag);
  const out = s => {
    const d = Math.hypot(s.p.x, s.p.z) || 1e-3;
    if (d < clear) s.p.multiplyScalar(clear / d);
  };
  rest.forEach(out);
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        const a = rest[i].p, b = rest[j].p;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz) || 1e-3;
        if (d >= gap) continue;
        const k = (gap - d) / d * 0.5;
        a.x -= dx * k; a.z -= dz * k;
        b.x += dx * k; b.z += dz * k;
      }
    }
    rest.forEach(out);
  }
}

// ── the fleet ───────────────────────────────────────────────────────────────────────────────

export function buildFleet(quality) {
  const object3D = new THREE.Group();
  object3D.name = 'fleet';

  // D30. Your own side is centred on the bridge and the enemy is out the window, which is +Z.
  // The old layout had these the other way round and put your own fleet 850 m astern of you.
  const sides = [new THREE.Group(), new THREE.Group()];
  sides[1].position.z = FLEET.standoff;
  sides[1].rotation.y = Math.PI;
  object3D.add(...sides);

  const plumes = new Plumes();
  object3D.add(plumes.mesh);

  const ships = [[], []];
  const staged = [];
  const markers = [];
  const live = [];
  const firing = [0, 0];         // index into ships[side] of the ship whose guns we cut to

  // The same point cellToWorld returns, before the side frame is applied.
  const cellLocal = (r, c) => new THREE.Vector3(
    (c - (FLEET.grid.w - 1) / 2) * FLEET.cellMetres,
    0,
    (r - (FLEET.grid.h - 1) / 2) * FLEET.cellMetres,
  );

  // Where every ship of a side stands, in SIDE-LOCAL space. A ship keeps the cell it was placed in
  // — shipAt() and the peg grid still agree — but its bearing, its range offset and its lateral
  // stagger come out of a hash of that cell, so no two ships in a formation share a heading or a
  // spacing. Pure: the same board gives the same stations, which is what lets reform() diff two.
  function stations(side, list) {
    const flag = side === 0 ? flagshipIndex(list) : -1;
    const mid = cellLocal((FLEET.grid.h - 1) / 2, (FLEET.grid.w - 1) / 2);
    const slots = list.map((def, i) => {
      const r = rng(1 + def.r * 131 + def.c * 17 + def.len * 7 + side * 977);
      const seed = (r() * 1e6) | 0;      // drawn first: the rng stream order is the layout
      // pull the fleet in toward its own centre so ships read as a formation rather than as a
      // grid, then jitter what is left. Your own side is pulled in less: you are standing in the
      // middle of it and a tight formation would be parked on the bridge.
      const p = cellLocal(def.r, def.c).lerp(mid, side === 0 ? FLEET.ownPull : FLEET.pull);
      p.x += (r() - 0.5) * FLEET.cellMetres * 0.9;
      p.z += (r() - 0.5) * FLEET.cellMetres * 0.9;
      const heading = (def.dir === 'v' ? Math.PI / 2 : 0) + (r() - 0.5) * 0.42;
      return { def, seed, p, heading, flag: i === flag };
    });
    if (flag >= 0) standOff(slots, FLEET.flagship);
    return { slots, flag };
  }

  // A steaming re-layout: the escorts move to their new stations instead of being disposed and
  // rebuilt. Driven from update() rather than from a camera beat, so it runs whether or not the
  // fly-out is on, and so skipping the fly-out only has to call finish().
  let voyage = null;

  const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
  const near = (from, to) => from + wrapPi(to - from);

  // Side-local, so it is world for side 0 — which is the only side that re-forms.
  function circle(legs) {
    let cx = 0, cz = 0, n = 1;                 // the flagship, at the origin
    for (const l of legs) { cx += l.a.x + l.b.x; cz += l.a.z + l.b.z; n += 2; }
    cx /= n; cz /= n;
    let radius = 60;
    for (const l of legs) {
      radius = Math.max(radius, Math.hypot(l.a.x - cx, l.a.z - cz), Math.hypot(l.b.x - cx, l.b.z - cz));
    }
    return { cx, cz, radius: Math.max(radius, Math.hypot(cx, cz) + 60) };
  }

  function tickVoyage(dt) {
    if (!voyage.on) return;
    voyage.el = Math.min(voyage.ms, voyage.el + dt * 1000);
    const u = voyage.ms ? voyage.el / voyage.ms : 1;
    const e = u * u * (3 - 2 * u);
    for (const leg of voyage.legs) {
      const o = leg.o;
      // quadratic Bézier: ships lean out of the turn instead of sliding along a ruler
      const k = 1 - e;
      o.position.x = k * k * leg.a.x + 2 * k * e * leg.ctrl.x + e * e * leg.b.x;
      o.position.z = k * k * leg.a.z + 2 * k * e * leg.ctrl.z + e * e * leg.b.z;
      o.rotation.y = k * k * leg.h0 + 2 * k * e * leg.h1 + e * e * leg.h2;
    }
    if (u >= 1) voyage = null;
  }

  const api = {
    object3D, sides, ships, plumes,

    cellToWorld(side, r, c) {
      return sides[side].localToWorld(cellLocal(r, c));
    },

    // The dramatised arrangement. A ship keeps the cell it was placed in — shipAt() and the peg
    // grid still agree — but its bearing, its range offset and its lateral stagger come out of a
    // hash of that cell, so no two ships in a formation share a heading or a spacing.
    //
    // Positions are written in SIDE-LOCAL space. cellToWorld returns world and other callers need
    // it to; assigning its result as a local position double-counted the standoff (D30).
    layout(side, view) {
      voyage = null;                     // its legs hold handles this is about to dispose
      for (const s of ships[side]) { sides[side].remove(s.handle.object3D); s.handle.dispose?.(); }
      ships[side].length = 0;
      const list = view?.fleet ?? [];
      const { slots, flag } = stations(side, list);

      firing[side] = flag >= 0 ? flag : 0;
      for (const s of slots) {
        const handle = s.flag ? buildFlagship(quality) : buildShip(
          KIT_FOR_LENGTH(s.def.len), quality, s.def.len, { seed: s.seed, detail: 1 });
        if (s.flag) {
          // bow +Z, and shifted along its own length so the bridge TOWER — not the hull's centre —
          // stands under the room
          handle.object3D.position.set(0, 0, -handle.towerX);
          handle.object3D.rotation.y = -Math.PI / 2;
        } else {
          handle.object3D.position.copy(s.p);
          handle.object3D.rotation.y = s.heading;
        }
        sides[side].add(handle.object3D);
        ships[side].push({ ...s.def, handle, flag: s.flag });
        live.push(handle);
      }
      return ships[side];
    },

    // The same board change as layout(), but steamed rather than rebuilt. `view.fleet` must be the
    // same ships in the same order with the same lengths — which it is, because the sim indexes a
    // placement by fleet slot and setBoard rejects a list that does not. Anything else falls back
    // to layout(), which is correct and merely instant.
    //
    // The flagship carries the bridge and does not move (D34): she is the longest ship of side 0
    // and her slot index cannot change while the lengths do not. What re-forms is the escorts.
    reform(side, view, { ms = 2600 } = {}) {
      const list = view?.fleet ?? [];
      const have = ships[side];
      const same = have.length === list.length && list.every((d, i) => d.len === have[i].len);
      if (!same) { api.layout(side, view); return { ms: 0, finish() {}, done: () => true }; }

      const { slots, flag } = stations(side, list);
      firing[side] = flag >= 0 ? flag : 0;

      const legs = [];
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        const o = have[i].handle.object3D;
        Object.assign(have[i], s.def, { flag: s.flag });
        if (s.flag) continue;                              // pinned under the room
        const a = o.position.clone();
        const b = s.p.clone();
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        // a ship points local +X, so a heading of θ steams toward (cos θ, −sin θ)
        const course = d > 8 ? Math.atan2(-(b.z - a.z), b.x - a.x) : null;
        const h0 = o.rotation.y;
        const h2 = near(h0, s.heading);
        const h1 = course == null ? (h0 + h2) / 2 : near(h0, course);
        legs.push({
          o, a, b, h0, h1, h2,
          ctrl: { x: (a.x + b.x) / 2 - (b.z - a.z) * 0.14, z: (a.z + b.z) / 2 + (b.x - a.x) * 0.14 },
        });
      }

      voyage = { legs, el: 0, on: false, ms: legs.some(l => l.a.distanceTo(l.b) > 1) ? ms : 0 };
      const mine = voyage;
      const handle = {
        ms: voyage.ms,
        // What the fly-out has to frame: the circle that holds every hull at both ends of the move,
        // plus the flagship at the origin, which never leaves it.
        bounds: circle(legs),
        done: () => voyage !== mine,
        start() { if (voyage === mine) mine.on = true; },
        finish() { if (voyage === mine) { mine.on = true; mine.el = mine.ms; tickVoyage(0); } },
      };
      if (!voyage.ms) handle.finish();
      return handle;
    },

    // The ship whose guns a `fire_out` cuts to, and the anchor the muzzle flash is emitted from.
    // One ship, one anchor: picking them separately let the camera and the flash disagree.
    firingShip(side) { return ships[side][firing[side]] ?? ships[side][0] ?? null; },
    firingAnchor(side) { return api.firingShip(side)?.handle.gunAnchors[0] ?? null; },

    shipAt(side, r, c) {
      for (const s of ships[side]) {
        const i = s.dir === 'h' ? (r === s.r ? c - s.c : -1) : (c === s.c ? r - s.r : -1);
        if (i >= 0 && i < s.len) return { ship: s.handle, def: s, t: s.len > 1 ? i / (s.len - 1) : 0.5 };
      }
      return null;
    },

    gunFor(side, shipId) {
      const s = ships[side].find(x => x.id === shipId) ?? ships[side][0];
      return s?.handle.gunAnchors[0] ?? null;
    },

    mark(side, r, c, kind = 'hit') {
      const hit = api.shipAt(side, r, c);
      const pos = hit ? hit.ship.hullSide(hit.t, 1) : api.cellToWorld(side, r, c);
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(FLEET.markerScale, 10, 8),
        getMaterial('hull', kind === 'hit' ? 'marker' : 'boot'),
      );
      m.position.copy(pos);
      object3D.add(m);
      const handle = { object3D: m, kill() { object3D.remove(m); m.geometry.dispose(); } };
      markers.push(handle);
      return handle;
    },

    clearMarks() { for (const m of markers.splice(0)) m.kill(); },

    // Scenario staging: explicit ships at explicit places, outside the two side frames.
    stage(list) {
      const out = [];
      for (const s of list) {
        const h = buildShip(s.kit, quality, s.cells ?? 4, { seed: s.seed ?? 11, detail: s.detail ?? 2 });
        h.object3D.position.set(s.x ?? 0, 0, s.z ?? 0);
        h.object3D.rotation.y = s.heading ?? 0;
        object3D.add(h.object3D);
        staged.push(h);
        live.push(h);
        out.push(h);
      }
      return out;
    },

    clearStage() {
      for (const h of staged.splice(0)) {
        object3D.remove(h.object3D);
        h.dispose?.();
        const i = live.indexOf(h);
        if (i >= 0) live.splice(i, 1);
      }
      plumes.clear();
    },

    update(dt, app) {
      if (voyage) tickVoyage(dt);
      for (const h of live) h.update?.(dt);
      plumes.update(app.camera);
    },
  };

  return api;
}

// ── scored scenarios ────────────────────────────────────────────────────────────────────────

const fleetOf = () => window.__waterline.world.fleet;

// Every gunnery shot is a pinned still. Unpinned, the flash is 1.3 s long and the harness settles
// for 45 frames before it captures, so the frame we score would be empty — and under D13 two
// renders of the same code would land on different phases anyway.
// ORDER MATTERS AND IT BIT PASS 1. Every sky knob (`skyCover`, `skyHaze`, `skyCloudSize`) re-runs
// sky.applyGrade(), which fires the grade listeners — and lighting.js resets `scene.fog` from the
// grade inside one of them. Pass 1 set the fog first and the knobs after, so `fleet_wide`'s
// documented 500/4200 was silently overwritten by noon's 250/2400 on every run and the convoy sat
// in flat fog colour from 2.4 km. Measured with `--eval=[scene.fog.near, scene.fog.far]`: 250/2400.
// Anything a scenario overrides on the sea or the fog now goes AFTER the knobs, from here.
function sceneSetup(app, grade, { phase = 0.055, spread = 0, seaState, shadow = 90, sky, fog, fade, amb = 0.46 } = {}) {
  const { ocean, lighting } = sea(app, grade, ['fleet']);
  const fleet = fleetOf();
  fleet.clearStage();
  window.__waterline.vfx.clear();
  resetGunOrder();
  setMuzzlePhase(phase, spread);
  // How much of the ship's radiance comes from the sky rather than from the sun. Low under a sun
  // that can cast, high under an overcast that cannot — see materials/hull.js.
  setShipAmbient(amb);
  if (sky) for (const k of Object.keys(sky)) app.quality.set(k, sky[k]);
  if (seaState !== undefined) ocean.setSeaState(seaState);
  if (fog) { app.scene.fog.near = fog[0]; app.scene.fog.far = fog[1]; }
  if (fade) ocean.setDetailFade(fade);
  lighting.setShadowExtent(shadow);
  return { ocean, lighting, fleet };
}

function fire(app, ship, turrets, size = 9) {
  const emit = window.__waterline.vfx.emit;
  for (const i of turrets) emit.muzzle(ship.fireGun(i), size);
}

defineScenario({
  id: 'guns_fire',
  label: 'Over the bridge wing as the forward turrets fire',
  ref: '1172620_07',
  setup(app) {
    // noon's stock cover of 0.34 leaves an empty gradient sky behind the flash
    const { fleet } = sceneSetup(app, 'noon', {
      phase: 0.024, seaState: 2, shadow: 80, fog: [900, 5200], fade: { lod: 0.95 },
      sky: { skyCover: 1.15, skyCloudSize: 1.5 },
    });

    const [me] = fleet.stage([{ kit: 'battleship', cells: 5, x: 0, z: 0, heading: 0, seed: 4021 }]);
    me.trainGuns(-Math.PI / 2);                       // broadside to starboard
    fleet.stage([{ kit: 'cruiser', cells: 4, x: 640, z: 900, heading: 2.4, detail: 1, seed: 771 }]);

    fleet.plumes.add(2.5, me.freeboard * 2.3, 0,
      { drift: [-34, -12], puffs: 22, rise: 8, scale: 3.6, tone: 0.30, seed: 41, alpha: 0.13, spread: 0.9 });

    frameCamera(app, { pos: [-44, 18, 36], look: [24, 10, 4], fov: 50, near: 0.5, far: 9000 });
    fire(app, me, [0, 1], 9);
  },
});

defineScenario({
  id: 'guns_broadside',
  label: 'Full main-battery broadside from the port quarter',
  ref: '236390_09',
  setup(app) {
    const { fleet } = sceneSetup(app, 'noon', {
      phase: 0.036, spread: 0.010, seaState: 1, shadow: 90, fog: [900, 6000], fade: { lod: 0.95 },
      sky: { skyCover: 1.10, skyCloudSize: 1.6 },
    });

    const [me] = fleet.stage([{ kit: 'battleship', cells: 5, x: 0, z: 0, heading: 0.16, seed: 3307 }]);
    me.trainGuns(-Math.PI / 2 - 0.16);

    fleet.plumes.add(0, me.freeboard * 2.4, 0,
      { drift: [-52, -20], puffs: 26, rise: 9, scale: 4.2, tone: 0.36, seed: 97, alpha: 0.20, spread: 0.9 });

    // no horizon in the plate: the camera is pitched far enough down that the whole frame is sea
    // nearly astern, and to port: from abeam the bridge sits on the sight line to every forward
    // muzzle, but from here those muzzles are 14 m outboard of a 4 m-wide tower and clear it
    frameCamera(app, { pos: [-150, 46, -52], look: [8, 11, 6], fov: 32, near: 1, far: 9000 });
    fire(app, me, [0, 1, 2, 3], 9);
  },
});

defineScenario({
  id: 'fleet_wide',
  label: 'Escort making smoke in a convoy, wide',
  ref: '1272010_00',
  setup(app) {
    // the convoy has to fade into the horizon rather than stop at it; noon's stock 250/2400 buries
    // anything past 2.4 km in flat fog colour and reads as a row of cut-outs
    const { fleet, ocean } = sceneSetup(app, 'noon', {
      phase: 0.055, spread: 0.02, seaState: 1, shadow: 130, fog: [620, 4600], amb: 0.86,
      // the plate is a flat overcast North Atlantic afternoon; noon's own 0.94 lands 40 luma
      // brighter than it at the median
      sky: { skyCover: 2.0, skyHaze: 1.85, exposure: 0.60 },
      // lod: how fast the ripple octave scale walks with distance. The grade's 0.55 leaves the
      // same 6-8 screen-pixel period at the horizon as in the foreground, and detail that never
      // shrinks with range destroys depth. 1.15 makes the far water converge on a smooth haze.
      fade: { fade: [150, 1500], rip: [170, 1600], lod: 1.15 },
    });

    const [me] = fleet.stage([{ kit: 'cruiser', cells: 4, x: 0, z: 0, heading: 0.30, seed: 6151 }]);
    me.trainGuns(-0.5);
    fleet.plumes.add(-6, me.freeboard * 2.4, 2,
      { drift: [-40, 24], puffs: 26, rise: 9, scale: 4.2, tone: 0.20, seed: 233, alpha: 0.24, spread: 1.1 });

    // near escorts, then the convoy strung along the horizon. Kits, ranges, bearings and headings
    // are all different on purpose — a line of identical silhouettes at identical spacing is the
    // single most punished defect on this project.
    const near = [
      { kit: 'destroyer', cells: 3, x: 520, z: -430, heading: 0.44, detail: 1, seed: 811 },
      { kit: 'battleship', cells: 5, x: -260, z: 760, heading: -0.22, detail: 1, seed: 1523 },
    ];
    fleet.stage(near);
    fleet.plumes.add(520, 12, -430, { drift: [-62, 40], puffs: 12, rise: 12, scale: 6, tone: 0.22, seed: 613, alpha: 0.24, spread: 0.9 });
    fleet.plumes.add(-260, 15, 760, { drift: [-70, 44], puffs: 12, rise: 13, scale: 7, tone: 0.26, seed: 907, alpha: 0.22, spread: 0.9 });

    const r = rng(70707);
    const far = [];
    for (let i = 0; i < 9; i++) {
      const a = -0.62 + i * 0.15 + (r() - 0.5) * 0.06;
      const d = 2100 + r() * 1500;
      const kit = ['destroyer', 'cruiser', 'battleship'][(r() * 3) | 0];
      far.push({
        kit, cells: 2 + ((r() * 4) | 0), detail: 0, seed: (r() * 1e6) | 0,
        x: Math.cos(a) * d, z: Math.sin(a) * d, heading: a + Math.PI / 2 + (r() - 0.5) * 1.2,
      });
      if (r() < 0.7) {
        fleet.plumes.add(Math.cos(a) * d, 18, Math.sin(a) * d,
          { drift: [-140, 90], puffs: 6, rise: 40, scale: 22, tone: 0.14 + r() * 0.12, seed: (r() * 1e6) | 0, alpha: 0.30 });
      }
    }
    fleet.stage(far);

    // a burning ship on the horizon — the plate's one warm accent in an otherwise cool frame
    const bx = Math.cos(0.52) * 2600, bz = Math.sin(0.52) * 2600;
    fleet.stage([{ kit: 'cruiser', cells: 4, x: bx, z: bz, heading: 1.9, detail: 0, seed: 55 }]);
    fleet.plumes.add(bx, 18, bz, { drift: [-60, 40], puffs: 18, rise: 74, scale: 26, tone: 0.86, seed: 313, alpha: 0.55, fire: 0.16 });
    ocean.setSeaLights([{ pos: new THREE.Vector3(bx, 8, bz), colour: '#ff8a30', intensity: 0.9, radius: 240 }]);

    // horizon at 0.34 of frame: for a plane running to infinity that is a pure pitch statement,
    // so the look height is 46 - dist*tan(atan((2f-1)*tan(fov/2)))
    frameCamera(app, { pos: [-196, 46, -152], look: [6, 27.5, 4], fov: 30, near: 1, far: 9000 });
    fire(app, me, [0], 4);
  },
});
