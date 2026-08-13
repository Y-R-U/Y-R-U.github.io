// One room, built on demand for the house being entered and thrown away on the way out.
// Everything is in the house's own local frame: origin on the ground at its centre, +z out
// through the door. Zone differences come from zones.js `wood`, `stone` and `interior`.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { zone } from './zones.js';
import { Batch, T, openingPts, openingShape, flat, rng, span } from './details.js';
import { textureSet } from './materials.js';
import { stainedTexture, stainedTint } from './textures/stained.js';
import { stairFits, stairFloor, stairBlock, build as buildStairs } from './stairs.js';

// Texture metres per tile, matched to the outdoor kit so a floorboard indoors is the same
// board as a shutter outdoors.
const UV = { wood: 1.2, stone: 2.6, cloth: 1.0 };

const _warm = new THREE.Color(), _warm2 = new THREE.Color();

export class Interior {
  constructor(zoneId, house, opts = {}) {
    const z = zone(zoneId);
    this.zoneId = zoneId;
    this.z = z;
    this.object3D = new THREE.Group();
    this.object3D.name = 'interior';

    const { w, d, t, plinth, wallTop } = house;
    this.rx = w / 2 - t - 0.06;
    this.rz = d / 2 - t - 0.06;
    this.fy = plinth + 0.05;
    // Above this height the exterior already draws a second row of windows, so a loft is what the
    // outside has been promising all along. The ground floor gives up some height to pay for it.
    const twoUp = wallTop - plinth > 4.4;
    this.roomH = twoUp
      ? THREE.MathUtils.clamp((wallTop - plinth) * 0.52 - 0.14, 2.25, 3.0)
      : THREE.MathUtils.clamp(wallTop - plinth - 0.25, 2.25, 3.15);
    this.ceil = this.fy + this.roomH;
    this.loft = twoUp && stairFits(this);
    if (this.loft) {
      this.deck = this.ceil + 0.22;
      this.roomH2 = THREE.MathUtils.clamp(wallTop - this.deck - 0.1, 2.0, 2.7);
      this.ceil2 = this.deck + this.roomH2;
      this.level = this.fy;   // you always come in through a ground floor door
    }
    // Boarding runs to the underside of whatever is overhead. Stopping it at the dado-derived
    // room height leaves a strip of daylight between the wall top and the deck.
    this.wallH = this.loft ? this.deck - this.fy : this.roomH;
    // The aperture the closed leaf plugs. It has to be a shade smaller than the leaf and sit in
    // the leaf's own plane, because once you are inside the outdoor world stops being drawn and
    // any gap round the door is a hole straight to the sky.
    this.apW = house.door.leafW - 0.03;
    this.apH = Math.min(house.door.leafH - 0.09, this.roomH - 0.24);
    this.plugZ = house.door.leafZ - 0.046;

    const R = rng((Math.round(w * 31 + d * 71 + wallTop * 17) | 0) + 5);
    this.mats = materials(z, opts);
    const b = new Batch(zoneId);
    shell(b, this, z, R);
    hearth(b, this);
    furniture(b, this, z, R);
    if (this.loft) buildStairs(b, this, R);
    this.tris = emit(b, this.mats, this.object3D);

    this.glass = stainedGlass(this, z, opts);
    this.object3D.add(this.glass.group);
    this.tris += this.glass.tris;

    this.lights = lights(this, z);
    for (const l of this.lights) this.object3D.add(l);
  }

  // Local-frame half extents the player is allowed to walk in.
  get bounds() { return { rx: this.rx - 0.42, rz: this.rz - 0.42, y: this.fy }; }

  get top() { return this.loft ? this.ceil2 : this.ceil; }

  // Which floor is under a local point. Off the stair there are only ever two answers, and the
  // stair is the only way between them, so the answer is simply wherever the stair last left you.
  // Reading it off the height instead fails at the top: the feet ease upward and lag a sprint by
  // more than a metre, so you arrive on the deck still measuring as downstairs and drop through it.
  floorLocal(lx, lz, y) {
    if (!this.loft) return this.fy;
    const s = stairFloor(this, lx, lz);
    if (s !== null && (this.onStair || Math.abs(s - y) < 0.7)) return s;
    return this.level;
  }

  blockLocal(p, y) {
    if (!this.loft) return;
    if (stairBlock(this, p, y, this.onStair ? this.lastH : null)) this.onFlight(stairFloor(this, p.x, p.z));
    else this.onStair = false;
  }

  // The scripted climb writes the player's position itself, so it has to keep these up to date
  // rather than leaving it to blockLocal, which only runs on a frame the player is steering.
  onFlight(h) {
    this.onStair = true;
    this.lastH = h;
    this.level = h > (this.fy + this.deck) / 2 ? this.deck : this.fy;
  }

  landed(top) {
    this.onStair = false;
    this.level = top ? this.deck : this.fy;
  }

  // `sun` is the direction toward the sun in this room's own frame.
  update(sun, env) {
    this.glass.update(sun, env);
    const warm = _warm.set(this.z.interior.warmth);
    const flick = 0.88 + 0.12 * Math.sin(env.t * 7.3) * Math.sin(env.t * 2.9 + 1.1);
    this.lights[0].color.copy(warm);
    this.lights[0].intensity = 9.0 * this.z.interior.glow * env.power * flick;
    this.lights[1].color.copy(this.glass.fill);
    this.lights[1].intensity = (0.7 + 2.1 * this.glass.day) * env.power;
    if (this.lights[2]) {
      this.lights[2].color.copy(warm).lerp(this.glass.fill, 0.5);
      this.lights[2].intensity = (1.1 + 2.4 * this.glass.day) * env.power;
    }
  }

  dispose() {
    this.object3D.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of Object.values(this.mats)) m.dispose();
    this.glass.dispose();
  }
}

function materials(z, opts) {
  const wood = textureSet(z.id, 'wood');
  const stone = textureSet(z.id, 'wall');
  const env = opts.env ?? 0.32;
  const mk = (set, o) => {
    const m = new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, metalness: 0, ...o });
    m.normalScale.set(0.7, 0.7);
    m.envMapIntensity = env;
    return m;
  };
  // Both generators shade their authored colour down by an amount that depends on the zone, so
  // each is normalised to a target value here. Without it the light zone's boarding comes out as
  // dark as the dark zone's and the room stops being a zone read. This is a data read, not a
  // zone check — the same trick roofCfg() plays outdoors.
  const lift = (hex, target, lo, hi) => {
    const c = new THREE.Color(hex);
    const k = THREE.MathUtils.clamp(target / Math.max(0.299 * c.r + 0.587 * c.g + 0.114 * c.b, 0.04), lo, hi);
    return new THREE.Color(k, k, k);
  };
  return {
    wood: mk(wood, { roughness: z.wood.roughness, color: lift(z.wood.base, 0.52, 1, 2.6) }),
    stone: mk(stone, { roughness: 0.9, color: lift(z.stone.base, 0.26, 0.45, 1.5) }),
    cloth: new THREE.MeshStandardMaterial({ color: z.interior.cloth, roughness: 0.95, metalness: 0, envMapIntensity: env }),
  };
}

function emit(b, mats, group) {
  let tris = 0;
  for (const [surface, geos] of b.parts) {
    if (!geos.length) continue;
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    const k = 1 / (UV[surface] || 1);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
    const m = new THREE.Mesh(geo, mats[surface]);
    m.castShadow = m.receiveShadow = false;
    group.add(m);
    tris += geo.attributes.position.count / 3;
  }
  b.parts.clear();
  return tris;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function shell(b, I, z, R) {
  const { rx, rz, fy, ceil, roomH, wallH } = I;
  const panelH = fy + roomH * 0.56;
  const board = z.interior.floor === 'board';

  b.add(board ? 'wood' : 'stone', box(rx * 2, 0.1, rz * 2), T(0, fy - 0.05, 0));
  if (!I.loft) b.add('wood', box(rx * 2, 0.09, rz * 2), T(0, ceil + 0.045, 0));

  // walls: full-height boarding, a proud panelled dado, a rail and a skirting
  const face = [
    { m: T(0, 0, -rz), sx: rx },
    { m: T(0, 0, rz, Math.PI), sx: rx },
    { m: T(rx, 0, 0, Math.PI / 2), sx: rz },
    { m: T(-rx, 0, 0, -Math.PI / 2), sx: rz },
  ];
  for (const [fi, f] of face.entries()) {
    const wide = f.sx * 2;
    // the +z wall carries the doorway, so it is built as two returns and a head
    if (fi === 1) {
      const dw = Math.min(I.apW + 0.18, wide - 0.4), dh = I.apH + 0.09;
      const side = (wide - dw) / 2;
      for (const s of [-1, 1]) {
        b.add('wood', box(side, wallH, 0.05), f.m.clone().multiply(T(s * (dw + side) / 2, fy + wallH / 2, 0.025)));
        b.add('wood', box(side * 0.94, panelH - fy, 0.06), f.m.clone().multiply(T(s * (dw + side) / 2, (fy + panelH) / 2, 0.075)));
      }
      b.add('wood', box(dw, wallH - dh, 0.05), f.m.clone().multiply(T(0, fy + dh + (wallH - dh) / 2, 0.025)));
      // the last few centimetres out to the leaf, lined so the join reads as a reveal
      const gap = Math.max(0.02, I.plugZ - rz);
      for (const s of [-1, 1]) {
        b.add('wood', box(0.09, I.apH + 0.09, gap), T(s * (I.apW / 2 + 0.045), fy + (I.apH + 0.09) / 2, rz + gap / 2));
      }
      b.add('wood', box(I.apW + 0.18, 0.09, gap), T(0, fy + I.apH + 0.045, rz + gap / 2));
    } else {
      b.add('wood', box(wide, wallH, 0.05), f.m.clone().multiply(T(0, fy + wallH / 2, 0.025)));
      // the window wall is left plain, or the dado cuts the leaded light in half
      if (fi !== 0) b.add('wood', box(wide * 0.99, panelH - fy, 0.06), f.m.clone().multiply(T(0, (fy + panelH) / 2, 0.075)));
    }
    if (fi !== 0) b.add('wood', box(wide, 0.09, 0.15), f.m.clone().multiply(T(0, panelH, 0.085)));
    b.add('wood', box(wide, 0.17, 0.12), f.m.clone().multiply(T(0, fy + 0.085, 0.06)));
  }

  // beams across the short axis — with a loft the deck carries its own joists, which dodge the well
  if (I.loft) return boards(b, I, R, board);
  const across = rx < rz;
  const n = Math.max(2, Math.round((across ? rz : rx) * 2 / 1.4));
  const runL = (across ? rx : rz) * 2;
  for (let i = 0; i < n; i++) {
    const u = -(across ? rz : rx) + ((across ? rz : rx) * 2) * (i + 0.5) / n;
    const g = box(runL, 0.17, 0.19);
    b.add('wood', g, across ? T(0, ceil - 0.09, u) : T(u, ceil - 0.09, 0, Math.PI / 2));
  }

  boards(b, I, R, board);
}

function boards(b, I, R, board) {
  if (!board) return;
  const { rx, rz, fy } = I;
  for (let i = 0; i < 5; i++) {
    const u = span(R, -rx * 0.8, rx * 0.8);
    b.add('wood', box(0.04, 0.012, rz * 2), T(u, fy + 0.006, 0));
  }
}

function hearth(b, I) {
  const { rx, rz, fy, roomH } = I;
  const bw = Math.min(rz * 1.1, 1.9), bh = Math.min(roomH * 0.82, 2.3);
  const x = -rx + 0.09;
  b.add('stone', box(0.46, bh, bw), T(x + 0.23, fy + bh / 2, 0));
  b.add('stone', box(0.62, 0.16, bw + 0.34), T(x + 0.31, fy + bh + 0.08, 0));
  b.add('stone', box(0.52, 0.14, bw * 0.66), T(x + 0.26, fy + 1.02, 0));
  // firebox: a recessed dark mouth, and the two jambs that make it read as a recess
  for (const s of [-1, 1]) {
    b.add('stone', box(0.5, 0.98, bw * 0.17), T(x + 0.25, fy + 0.49, s * (bw * 0.415)));
  }
  b.add('wood', box(0.22, 0.14, bw * 0.5), T(x + 0.42, fy + 0.14, 0));
  b.add('wood', box(0.13, 0.13, bw * 0.44), T(x + 0.34, fy + 0.26, 0.06));
  I.fire = new THREE.Vector3(x + 0.36, fy + 0.34, 0);
}

function furniture(b, I, z, R) {
  const { rx, rz, fy } = I;
  const tw = Math.min(rx * 0.9, 1.05), tl = Math.min(rz * 1.1, 1.9);
  const th = 0.78;
  const tx = rx * 0.12, tz = -rz * 0.12;

  b.add('wood', box(tw, 0.08, tl), T(tx, fy + th, tz));
  b.add('wood', box(tw * 0.3, 0.1, tl * 0.86), T(tx, fy + th - 0.11, tz));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add('wood', box(0.1, th - 0.04, 0.1), T(tx + sx * (tw / 2 - 0.11), fy + (th - 0.04) / 2, tz + sz * (tl / 2 - 0.14)));
  }
  for (const sx of [-1, 1]) {
    const bx = tx + sx * (tw / 2 + 0.32);
    if (Math.abs(bx) > rx - 0.3) continue;
    b.add('wood', box(0.3, 0.06, tl * 0.82), T(bx, fy + 0.45, tz));
    b.add('cloth', box(0.26, 0.05, tl * 0.74), T(bx, fy + 0.5, tz));
    for (const sz of [-1, 1]) b.add('wood', box(0.25, 0.42, 0.07), T(bx, fy + 0.22, tz + sz * (tl * 0.33)));
  }

  b.add('cloth', box(Math.min(tw + 0.62, rx * 1.2), 0.014, Math.min(tl + 0.42, rz * 1.2)), T(tx, fy + 0.008, tz));

  // chest and a shelf against the +x wall
  const cz = rz * 0.5;
  b.add('wood', box(0.52, 0.46, 0.9), T(rx - 0.36, fy + 0.23, cz));
  b.add('wood', box(0.56, 0.09, 0.94), T(rx - 0.36, fy + 0.5, cz));
  b.add('wood', box(0.06, 0.3, 0.98), T(rx - 0.36, fy + 0.3, cz));

  const sy = fy + 1.32;
  b.add('wood', box(0.3, 0.05, 1.1), T(rx - 0.2, sy, -rz * 0.35));
  for (const sz of [-1, 1]) b.add('wood', box(0.26, 0.22, 0.06), T(rx - 0.2, sy - 0.12, -rz * 0.35 + sz * 0.48));
  for (let i = 0; i < 4; i++) {
    const h = span(R, 0.14, 0.26);
    b.add('cloth', new THREE.CylinderGeometry(0.055, 0.062, h, 6), T(rx - 0.22, sy + 0.03 + h / 2, -rz * 0.35 + span(R, -0.42, 0.42)));
  }

  // a stool by the fire, and a low bed under the shelf wall
  b.add('wood', new THREE.CylinderGeometry(0.17, 0.16, 0.06, 8), T(-rx + 0.85, fy + 0.44, rz * 0.42));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.add('wood', box(0.05, 0.42, 0.05), T(-rx + 0.85 + Math.cos(a) * 0.11, fy + 0.21, rz * 0.42 + Math.sin(a) * 0.11));
  }
  const bl = Math.min(rz * 0.8, 1.7);
  b.add('wood', box(0.78, 0.16, bl), T(rx - 0.5, fy + 0.24, -rz + bl / 2 + 0.25));
  b.add('cloth', box(0.74, 0.14, bl - 0.1), T(rx - 0.5, fy + 0.39, -rz + bl / 2 + 0.25));
  b.add('wood', box(0.82, 0.5, 0.09), T(rx - 0.5, fy + 0.25, -rz + 0.28));
}

// ── the leaded light, and the sun through it ────────────────────────────────────────────────
// The pane is emissive rather than lit: the room's outer shell is solid behind it, so there is
// no real light to transmit. Everything the eye reads as "sun through glass" — the patch on the
// floor, the shaft, the pane's own brightness — is driven off the same sun direction the
// outdoor key uses, so it agrees with the world outside.

function stainedGlass(I, z, opts) {
  const group = new THREE.Group();
  const { rx, rz, fy, roomH } = I;
  const kind = z.window.shape;
  const gw = Math.min(rx * 1.5, 2.0);
  const gy = fy + Math.min(0.8, roomH * 0.28);
  const gh = Math.min(roomH * 0.78, I.ceil - gy - 0.3);
  const zw = -rz + 0.055;

  const tex = stainedTexture(z.id);
  const tint = stainedTint(z.id);

  const paneMat = new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1,
    roughness: 0.22, metalness: 0, side: THREE.DoubleSide,
  });
  paneMat.envMapIntensity = 0.2;
  const pane = new THREE.Mesh(uvUnit(flat(openingShape(kind, gw, gh)), gw, gh), paneMat);
  pane.position.set(0, gy, zw);
  group.add(pane);

  // the reveal the pane sits in, mitred so it catches the room light and reads as depth
  const bat = new Batch(z.id);
  const jamb = 0.16;
  for (const s of [-1, 1]) {
    bat.add('stone', box(jamb, gh + 0.36, 0.22), T(s * (gw / 2 + jamb / 2), gy + gh / 2, zw + 0.11));
  }
  bat.add('stone', box(gw + jamb * 2, 0.2, 0.22), T(0, gy + gh + 0.2, zw + 0.11));
  bat.add('stone', box(gw + jamb * 2 + 0.24, 0.16, 0.34), T(0, gy - 0.07, zw + 0.17));
  for (let i = 1; i < 3; i++) {
    bat.add('stone', box(0.045, gh * 0.99, 0.05), T(-gw / 2 + gw * i / 3, gy + gh / 2, zw + 0.03));
  }
  // The loft gets the same light in a smaller opening: it shares this pane's material, so it
  // brightens and cools with the hour without a second set of state.
  const panes = [pane];
  if (I.loft) {
    const lw = Math.min(rx * 0.7, 1.1), lh = 0.85, ly = I.deck + 0.5;
    const p2 = new THREE.Mesh(uvUnit(flat(openingShape(kind, lw, lh)), lw, lh), paneMat);
    p2.position.set(0, ly, zw);
    group.add(p2);
    panes.push(p2);
    for (const s of [-1, 1]) bat.add('stone', box(0.14, lh + 0.3, 0.2), T(s * (lw / 2 + 0.07), ly + lh / 2, zw + 0.1));
    bat.add('stone', box(lw + 0.28, 0.18, 0.2), T(0, ly + lh + 0.18, zw + 0.1));
    bat.add('stone', box(lw + 0.48, 0.14, 0.3), T(0, ly - 0.06, zw + 0.15));
  }

  const tris = emit(bat, I.mats, group) + panes.reduce((n, p) => n + p.geometry.attributes.position.count / 3, 0);

  // patch + shaft, rebuilt only when the sun has actually moved
  const patchMat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, opacity: 0,
  });
  const shaftMat = new THREE.MeshBasicMaterial({
    color: tint, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, vertexColors: true, opacity: 0,
  });
  const outline = openingPts(kind, gw, gh).map(p => [p[0], p[1] + gy]);
  const patch = new THREE.Mesh(patchGeo(outline, gw, gh), patchMat);
  const shaft = new THREE.Mesh(shaftGeo(outline.length), shaftMat);
  patch.renderOrder = shaft.renderOrder = 3;
  patch.frustumCulled = shaft.frustumCulled = false;
  group.add(patch, shaft);

  const state = { last: -9, day: 0, fill: tint.clone() };

  return {
    group, tris,
    get day() { return state.day; },
    get fill() { return state.fill; },
    update(sun, env) {
      // sun is in room-local space; the window looks out along -z
      const facing = Math.max(0, -sun.z);
      const up = Math.max(0, sun.y);
      state.day = facing * Math.min(1, up * 2.2) * env.day;
      state.fill.copy(tint).lerp(_warm2.set(z.interior.warmth), 1 - state.day);

      paneMat.emissiveIntensity = (0.16 + 1.15 * state.day) * env.glow;
      paneMat.color.setScalar(0.3 + 0.7 * state.day);

      const strength = state.day * env.glow;
      patchMat.opacity = strength * 0.62;
      shaftMat.opacity = strength * env.shaft * 0.32;
      patch.visible = patchMat.opacity > 0.01;
      shaft.visible = shaftMat.opacity > 0.01;
      if (!patch.visible) return;

      patchMat.color.copy(env.sunColor);
      shaftMat.color.copy(tint).lerp(env.sunColor, 0.25);
      const moved = Math.abs(sun.x - state.sx) + Math.abs(sun.y - state.sy) + Math.abs(sun.z - state.sz);
      if (moved < 0.002) return;
      state.sx = sun.x; state.sy = sun.y; state.sz = sun.z;
      const hits = outline.map(p => project(p[0], p[1], zw, sun, fy, rx, rz));
      fillPatch(patch.geometry, hits);
      fillShaft(shaft.geometry, outline, zw, hits);
    },
    dispose() {
      for (const p of panes) p.geometry.dispose();
      patch.geometry.dispose(); shaft.geometry.dispose();
      paneMat.dispose(); patchMat.dispose(); shaftMat.dispose();
    },
  };
}

// Where the light leaving a point on the pane lands on the floor. Clamped into the room:
// at a grazing sun the true patch runs out through the far wall, and a patch that stops at
// the skirting is a smaller lie than one drawn through masonry.
function project(x, y, z, sun, fy, rx, rz) {
  const s = (y - fy) / Math.max(0.06, sun.y);
  return [
    THREE.MathUtils.clamp(x - sun.x * s, -rx + 0.08, rx - 0.08),
    THREE.MathUtils.clamp(z - sun.z * s, -rz + 0.08, rz - 0.08),
  ];
}

function patchGeo(outline, gw, gh) {
  const n = outline.length;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = outline[i][0] / gw + 0.5;
    uv[i * 2 + 1] = (outline[i][1] - outline[0][1]) / gh;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const idx = [];
  for (let i = 1; i < n - 1; i++) idx.push(0, i, i + 1);
  g.setIndex(idx);
  return g;
}

function fillPatch(g, hits) {
  const p = g.attributes.position;
  for (let i = 0; i < hits.length; i++) p.setXYZ(i, hits[i][0], 0.012, hits[i][1]);
  p.needsUpdate = true;
  g.computeBoundingSphere();
}

function shaftGeo(n) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 2 * 3), 3));
  const col = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    col[i * 6] = col[i * 6 + 1] = col[i * 6 + 2] = 1;
    col[i * 6 + 3] = col[i * 6 + 4] = col[i * 6 + 5] = 0.18;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const idx = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = ((i + 1) % n) * 2;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  g.setIndex(idx);
  return g;
}

function fillShaft(g, outline, zw, hits) {
  const p = g.attributes.position;
  for (let i = 0; i < outline.length; i++) {
    p.setXYZ(i * 2, outline[i][0], outline[i][1], zw + 0.02);
    p.setXYZ(i * 2 + 1, hits[i][0], 0.05, hits[i][1]);
  }
  p.needsUpdate = true;
  g.computeBoundingSphere();
}

function uvUnit(g, w, h) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / h);
  return g;
}

function lights(I, z) {
  const fire = new THREE.PointLight(0xffffff, 0, 8.5, 2);
  fire.position.copy(I.fire);
  const fill = new THREE.PointLight(0xffffff, 0, Math.max(I.rx, I.rz) * 4.5, 2);
  fill.position.set(0, I.fy + (I.ceil - I.fy) * 0.62, -I.rz * 0.2);
  if (!I.loft) return [fire, fill];
  // The deck cuts the ground floor's fill off from the loft entirely, so upstairs needs its own.
  const up = new THREE.PointLight(0xffffff, 0, Math.max(I.rx, I.rz) * 3.6, 2);
  up.position.set(0, I.deck + I.roomH2 * 0.5, -I.rz * 0.25);
  return [fire, fill, up];
}
