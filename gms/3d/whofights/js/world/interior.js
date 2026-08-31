// One room, built on demand for the house being entered and thrown away on the way out.
// Everything is in the house's own local frame: origin on the ground at its centre, +z out
// through the door. Zone differences come from zones.js `wood`, `stone` and `interior`.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { zone } from './zones.js';
import { Batch, T, openingPts, openingShape, flat, rng, span, taperBox } from './details.js';
import { textureSet, flagSet, INTERIOR_TILE } from './materials.js';
import { stainedTexture, stainedTint } from './textures/stained.js';
import { stairFits, stairFloor, stairBlock, build as buildStairs } from './stairs.js';
import { boardPanel } from './boards.js';
import { pushOut } from './colliders.js';

// Texture metres per tile. `stone` and `wood` are the outdoor kit's own numbers (materials.js
// INTERIOR_TILE), so a course of masonry indoors is the same course as the facade outside — the
// old 2.6 m stone was a third of the wall's own tile and turned a 35 m floor into brickwork.
const UV = { ...INTERIOR_TILE };

// Everything the great hall is shaped by. Registered as knobs through registerHallKnobs() —
// lighting.js calls it, because that is the module that already gets handed the quality registry.
// The geometry ones rebuild; the light ones are read live out of this object every frame.
export const HALL = {
  plate: 0.52,      // wall-plate height as a fraction of the exterior wall — the rest is roof
  pitch: 0.55,      // roof rise over half-span
  // The flat crown of the roof, as a fraction of the half-span. A camp ceiling rather than a
  // full gable, and not only for the look: buildings.js puts a solid roof slab over the house
  // and its underside is the real ceiling of the world. Measured over this hall it sits at about
  // 13.5 m at the ridge and comes down to 8.5 m near the side walls, so an interior roof that
  // ran to a point would push straight through it. Clipping the top is what fits inside.
  crown: 0.45,
  bay: 5.8,         // metres between pilasters, and therefore between roof trusses
  bake: 1,          // strength of the baked vertex gradient
  sconces: 6,       // real point lights among the wall sconces
  sconcePower: 22,
  dress: 1,         // furniture density
  shadows: true,    // let the building's own roof shadow its interior
};

export function registerHallKnobs(q) {
  const G = 'Hall';
  const geo = { group: G, rebuild: true };
  q.register({ key: 'hallPlate', label: 'Wall plate height', type: 'range', min: 0.5, max: 1, step: 0.02, default: HALL.plate, ...geo },
    v => { HALL.plate = v; });
  q.register({ key: 'hallPitch', label: 'Roof pitch', type: 'range', min: 0.22, max: 0.8, step: 0.02, default: HALL.pitch, ...geo },
    v => { HALL.pitch = v; });
  q.register({ key: 'hallCrown', label: 'Roof flat crown', type: 'range', min: 0, max: 0.8, step: 0.05, default: HALL.crown, ...geo },
    v => { HALL.crown = v; });
  q.register({ key: 'hallBay', label: 'Bay spacing (m)', type: 'range', min: 3, max: 12, step: 0.2, default: HALL.bay, ...geo },
    v => { HALL.bay = v; });
  q.register({ key: 'hallBake', label: 'Baked hall gradient', type: 'range', min: 0, max: 1.6, step: 0.05, default: HALL.bake, ...geo },
    v => { HALL.bake = v; });
  q.register({ key: 'hallDress', label: 'Hall furniture', type: 'range', min: 0, max: 1.5, step: 0.1, default: HALL.dress, ...geo },
    v => { HALL.dress = v; });
  q.register({ key: 'hallShadows', label: 'Hall catches shadow', type: 'toggle', default: HALL.shadows, ...geo },
    v => { HALL.shadows = !!v; });
  // Not a rebuild: the lights exist either way, this only moves how many are alight and how hard.
  q.register({ key: 'hallSconces', label: 'Sconce lights', type: 'range', min: 0, max: 12, step: 1, default: HALL.sconces, group: G },
    (v, all) => { HALL.sconces = Math.min(v, Math.max(0, (all.lightCap ?? 24) - 4)); });
  q.register({ key: 'hallSconcePower', label: 'Sconce power', type: 'range', min: 0, max: 90, step: 1, default: 22, group: G },
    v => { HALL.sconcePower = v; });
}

const _warm = new THREE.Color(), _warm2 = new THREE.Color();

export class Interior {
  constructor(zoneId, house, opts = {}) {
    const z = zone(zoneId);
    this.zoneId = zoneId;
    this.z = z;
    this.object3D = new THREE.Group();
    this.object3D.name = 'interior';

    const { w, d, t, plinth, wallTop } = house;
    this.rx = w / 2 - t - 0.09;
    this.rz = d / 2 - t - 0.09;
    this.fy = plinth + 0.05;
    // Above this height the exterior already draws a second row of windows, so a loft is what the
    // outside has been promising all along. The ground floor gives up some height to pay for it.
    // A great hall is one room by definition: no loft, and the ceiling takes the whole wall.
    this.hall = !!opts.hall;
    this.fillK = 1;
    this.flames = [];
    this.sconces = [];
    // Everything solid in the room, in this frame, floor-based. blockLocal pushes the player out
    // of them and doors.js hands the same list to the walk world so the crowd sees them too.
    this.solids = [];
    for (const l of house.door.leaves || []) this.solids.push({ ...l, c: Math.cos(l.ry), s: Math.sin(l.ry) });
    const twoUp = !this.hall && wallTop - plinth > 6.6;
    // 3.40 m floor / 4.70 m cap: below 4 m the ceiling is inside the camera frustum from 1.9 m in
    // front of the player, which is WORLD.md §2.2 and the reason for the whole scale pass.
    const ceilK = z.interior.ceiling ?? 1;
    if (this.hall) {
      // A great hall is one room to the roof. The masonry stops at a wall plate and an open
      // timber roof takes it from there, so there are two heights, not one: `wallH` is what the
      // stone reaches and `roomH` is the ridge. The old code clamped a single ceiling at 14 m and
      // hung cottage beams under it, which is the "empty barn" the brief is about.
      this.wallH = Math.max(6, (wallTop - plinth) * ceilK * HALL.plate);
      // The ridge runs along the door axis, so from the doorway you look up the length of the
      // roof through truss after truss. Across the door it would put two trusses side-on and
      // nothing in the middle distance.
      this.hs = this.rx;
      this.xc = this.hs * HALL.crown;
      this.rise = (this.hs - this.xc) * HALL.pitch;
      this.roomH = this.wallH + this.rise;
      this.loft = false;
    } else {
      this.roomH = twoUp
        ? THREE.MathUtils.clamp(((wallTop - plinth) * 0.52 - 0.21) * ceilK, 3.40, 4.50)
        : THREE.MathUtils.clamp((wallTop - plinth - 0.38) * ceilK, 3.40, 4.70);
      this.loft = twoUp && stairFits(this);
    }
    this.ceil = this.fy + this.roomH;
    this.plateY = this.fy + (this.wallH ?? this.roomH);
    if (this.loft) {
      this.deck = this.ceil + 0.33;
      this.roomH2 = THREE.MathUtils.clamp((wallTop - this.deck - 0.15) * ceilK, 3.00, 4.05);
      this.ceil2 = this.deck + this.roomH2;
      this.level = this.fy;   // you always come in through a ground floor door
    }
    // Boarding runs to the underside of whatever is overhead. Stopping it at the dado-derived
    // room height leaves a strip of daylight between the wall top and the deck.
    if (!this.hall) this.wallH = this.loft ? this.deck - this.fy : this.roomH;
    // The aperture the closed leaf plugs. It has to be a shade smaller than the leaf and sit in
    // the leaf's own plane, because once you are inside the outdoor world stops being drawn and
    // any gap round the door is a hole straight to the sky.
    this.apW = house.door.leafW - 0.045;
    this.apH = Math.min(house.door.leafH - 0.135, this.roomH - 0.36);
    this.plugZ = house.door.leafZ - 0.069;

    const R = rng((Math.round(w * 31 + d * 71 + wallTop * 17) | 0) + 5);
    this.mats = materials(z, opts, this.hall);
    const b = new Batch(zoneId);
    if (this.hall) {
      this.bays = { x: bayLines(this.rx * 2, HALL.bay), z: bayLines(this.rz * 2, HALL.bay) };
      hallShell(b, this, z);
      hallRoof(b, this);
      hearth(b, this);
      hallDress(b, this, z, R);
      this.glass = hallGlass(b, this, z, opts);
    } else {
      shell(b, this, z, R);
      hearth(b, this);
      furniture(b, this, z, R);
      if (this.loft) buildStairs(b, this, R);
      this.glass = stainedGlass(this, z, opts);
    }
    this.tris = emit(b, this.mats, this.object3D, this.hall ? this : null);
    this.object3D.add(this.glass.group);
    this.tris += this.glass.tris;

    this.lights = lights(this, z);
    for (const l of this.lights) this.object3D.add(l);
    if (this.hall) hallFlames(this);

    for (const o of opts.boards || []) {
      const g = boardPanel(o.zone || zoneId, o.p);
      g.position.set(o.x, this.fy, o.z);
      g.rotation.y = o.ry || 0;
      this.object3D.add(g);
    }
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

  blockLocal(p, y, radius) {
    for (const b of this.solids) {
      if (b.top <= y + 0.05) continue;
      const q = pushOut(b, p.x, p.z, radius);
      if (q) { p.x = q.x; p.z = q.z; }
    }
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
    this.lights[1].intensity = (0.7 + 2.1 * this.glass.day) * env.power * this.fillK;
    if (this.hall) {
      // The doorway light is daylight, so it goes out with the sun; the sconces are the opposite
      // and carry the room after it does.
      this.doorLight.color.copy(env.sunColor);
      this.doorLight.intensity = (0.4 + 2.8 * this.glass.day) * env.power;
      const sconce = HALL.sconcePower * (0.55 + 0.45 * (1 - this.glass.day)) * this.z.interior.glow;
      for (let i = 0; i < this.sconceLights.length; i++) {
        const l = this.sconceLights[i];
        l.color.copy(warm);
        // Every sconce has its own phase, or twelve flames pulse as one and it reads as a fault.
        const f = 0.86 + 0.14 * Math.sin(env.t * 6.1 + i * 2.4) * Math.sin(env.t * 2.7 + i);
        l.intensity = i < HALL.sconces ? sconce * env.power * f : 0;
      }
      if (this.glowMat) this.glowMat.opacity = 0.55 + 0.25 * flick;
      return;
    }
    if (this.lights[2]) {
      this.lights[2].color.copy(warm).lerp(this.glass.fill, 0.5);
      this.lights[2].intensity = (1.1 + 2.4 * this.glass.day) * env.power;
    }
  }

  dispose() {
    this.object3D.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of Object.values(this.mats)) m.dispose();
    this.glowMat?.dispose();
    this.glass.dispose();
  }
}

function materials(z, opts, hall) {
  const wood = textureSet(z.id, 'wood');
  const stone = textureSet(z.id, 'wall');
  const env = opts.env ?? 0.32;
  const mk = (set, o) => {
    const m = new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, metalness: 0, ...o });
    m.normalScale.set(0.7, 0.7);
    m.envMapIntensity = env;
    // A hall carries its light in the mesh: emit() writes a colour per vertex for the fall from
    // the doorway into the depth of the room, the gloom up in the trusses and the contact shade
    // in every corner. Three point lights cannot do that over 35 m and the flat result is
    // exactly what made the room read as a barn.
    if (hall) m.vertexColors = true;
    return m;
  };
  // Both generators shade their authored colour down by an amount that depends on the zone, so
  // each is normalised to a target value here. Without it the light zone's boarding comes out as
  // dark as the dark zone's and the room stops being a zone read. This is a data read, not a
  // zone check — the same trick roofCfg() plays outdoors.
  const warm = new THREE.Color(1.06, 1.0, 0.90);
  const _hsl = {};
  const dye = (hex, sat, light) => {
    const c = new THREE.Color(hex);
    c.getHSL(_hsl);
    return c.setHSL(_hsl.h, sat, light);
  };
  const lift = (hex, target, lo, hi) => {
    const c = new THREE.Color(hex);
    const k = THREE.MathUtils.clamp(target / Math.max(0.299 * c.r + 0.587 * c.g + 0.114 * c.b, 0.04), lo, hi);
    return new THREE.Color(k, k, k);
  };
  // A flat colour is a painted panel, not a hanging — but tinting the timber ALBEDO blue cancels
  // its tan against the tint and every tapestry came out the same neutral olive. What a hanging
  // wants is the grain as *relief*, so it takes the timber normal map and keeps its own colour.
  const cloth = new THREE.MeshStandardMaterial({
    // The zone's accent pushed to a value and saturation a hanging can hold across 30 m of stone.
    // It is still the zone's own hue — a read off z.interior.cloth, not a colour picked here —
    // but the authored pastel came out as a grey patch, which a critic pass called a missing
    // material rather than a tapestry.
    color: hall ? dye(z.interior.cloth, 0.52, 0.44) : new THREE.Color(z.interior.cloth),
    normalMap: hall ? wood.normalMap : null, roughness: 0.96, metalness: 0, envMapIntensity: env,
  });
  if (hall) { cloth.normalScale.set(0.55, 0.55); cloth.vertexColors = true; }
  const out = {
    wood: mk(wood, { roughness: z.wood.roughness, color: lift(z.wood.base, 0.52, 1, 2.6) }),
    // A hall's walls are the castle's own masonry, so they take the wall texture at the wall's
    // own value — the 0.26 target is a cottage's boarded room read through one candle. The warm
    // bias is not decoration: the room is lit by a cool hemisphere and by firelight, and a
    // neutral multiplier came out blue-grey against a cream facade, which reads as a different
    // building. `warm` is a fixed cast on whatever the zone's own stone is, not a colour choice.
    stone: mk(stone, { roughness: 0.9, color: lift(z.stone.base, hall ? 0.62 : 0.26, 0.45, 1.6).multiply(warm) }),
    cloth,
  };
  if (hall) {
    out.flag = mk(flagSet(z.id, 0.9, UV.flag), { roughness: 0.88, color: lift(z.stone.base, 0.44, 0.45, 1.6).multiply(warm) });
    // Roof timber reads darker than joinery or a whole roof turns into one bright lid.
    out.beam = mk(wood, { roughness: Math.min(1, z.wood.roughness + 0.12), color: lift(z.wood.base, 0.30, 0.16, 2.0) });
  }
  return out;
}

function emit(b, mats, group, hall) {
  let tris = 0;
  for (const [surface, geos] of b.parts) {
    if (!geos.length) continue;
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    const k = 1 / (UV[surface] || 1);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
    if (hall) bakeVertexLight(geo, hall);
    const m = new THREE.Mesh(geo, mats[surface]);
    m.castShadow = false;
    // The building's own roof and walls already cast into the shadow map, and the doorway is a
    // real hole in them — so letting the room receive shadow is what puts a shaft of daylight on
    // the floor inside the door for nothing. Nothing here casts: a room lit from a hemisphere
    // and six sconces has no shadow worth two dozen extra draw calls.
    m.receiveShadow = !!(hall && HALL.shadows);
    group.add(m);
    tris += geo.attributes.position.count / 3;
  }
  b.parts.clear();
  return tris;
}

// ── the baked hall gradient ─────────────────────────────────────────────────────────────────
// Three point lights over a 35 x 29 m room give an even, low-contrast wash — which is what the
// first hall looked like. The fall from the doorway, the pool under each window, the gloom in the
// roof and the shade in every corner are all functions of position and none of them move, so they
// are multiplied into the vertex colour once at build time and cost nothing per frame.
//
// It is deliberately floored well above zero: the FORGE lighting notes are explicit that nothing
// in the reference plates is crushed, and a black corner reads as a hole, not as shade.
const _bc = new THREE.Color();

function bakeVertexLight(geo, I) {
  const p = geo.attributes.position;
  const n = p.count;
  const col = new Float32Array(n * 3);
  const K = HALL.bake;
  const { rx, rz, fy, plateY, apW, apH } = I;
  const roofTop = I.ceil;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.max(0, y - fy);
    // daylight through the open doors: a pool on the floor that falls off into the room
    const dz = Math.max(0, rz - z);
    const dx = Math.max(0, Math.abs(x) - apW * 0.55);
    const dh = Math.max(0, h - apH * 0.55);
    const door = Math.exp(-Math.hypot(dz, dx * 1.25, dh * 0.8) / 11);
    // the window band: bright where a wall is at leaded-light height, and on the floor below it
    const wallGap = Math.min(rx - Math.abs(x), rz - Math.abs(z));
    const band = Math.exp(-Math.abs(h - I.winY) / 3.4);
    const win = band * (0.45 + 0.55 * Math.exp(-wallGap / 6));
    // roof gloom, and the shade that collects in every corner and along the floor line
    const gloom = 1 - 0.30 * smooth(plateY - fy - 2.5, roofTop - fy, h);
    const corner = 1 - 0.40 * Math.exp(-wallGap / 1.6) * Math.exp(-h / 3.2)
                     - 0.22 * Math.exp(-wallGap / 0.9);
    let k = 0.52 + 0.42 * door + 0.34 * win;
    // Floors wear in paths. A low-frequency lane from the doorway up the middle of the room,
    // and grime in the corners, is what stops a per-block random tone reading as salt and
    // pepper — the generator has no idea where anyone walks and this is the only thing that does.
    if (h < 0.35) k *= 1.10 - 0.22 * Math.min(1, Math.abs(x) / (rx * 0.55)) - 0.10 * Math.max(0, 1 - dz / 6);
    k *= gloom * Math.max(0.4, corner);
    k = 1 + (k - 1) * K;
    _bc.setScalar(Math.min(1.45, Math.max(0.44, k)));
    col[i * 3] = _bc.r; col[i * 3 + 1] = _bc.g; col[i * 3 + 2] = _bc.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
}

const smooth = (a, b, x) => THREE.MathUtils.smootherstep(x, a, b);

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function shell(b, I, z, R) {
  const { rx, rz, fy, ceil, roomH, wallH } = I;
  const panelH = fy + roomH * 0.56;
  const board = z.interior.floor === 'board';
  // A hall's dado would be six metres up: panelling and a rail only read at cottage scale.
  // Boarding stays — bare limestone at this size went flat and grey under the room's own fill.
  const W = 'wood';
  const dado = !I.hall;

  b.add(board ? 'wood' : 'stone', box(rx * 2, 0.15, rz * 2), T(0, fy - 0.075, 0));
  if (!I.loft) b.add('wood', box(rx * 2, 0.135, rz * 2), T(0, ceil + 0.068, 0));

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
      const dw = Math.min(I.apW + 0.27, wide - 0.6), dh = I.apH + 0.135;
      const side = (wide - dw) / 2;
      for (const s of [-1, 1]) {
        b.add(W, box(side, wallH, 0.075), f.m.clone().multiply(T(s * (dw + side) / 2, fy + wallH / 2, 0.038)));
        if (dado) b.add('wood', box(side * 0.94, panelH - fy, 0.09), f.m.clone().multiply(T(s * (dw + side) / 2, (fy + panelH) / 2, 0.113)));
      }
      b.add(W, box(dw, wallH - dh, 0.075), f.m.clone().multiply(T(0, fy + dh + (wallH - dh) / 2, 0.038)));
      // the last few centimetres out to the leaf, lined so the join reads as a reveal
      const gap = Math.max(0.03, I.plugZ - rz);
      for (const s of [-1, 1]) {
        b.add('wood', box(0.135, I.apH + 0.135, gap), T(s * (I.apW / 2 + 0.068), fy + (I.apH + 0.135) / 2, rz + gap / 2));
      }
      b.add('wood', box(I.apW + 0.27, 0.135, gap), T(0, fy + I.apH + 0.068, rz + gap / 2));
    } else {
      b.add(W, box(wide, wallH, 0.075), f.m.clone().multiply(T(0, fy + wallH / 2, 0.038)));
      // the window wall is left plain, or the dado cuts the leaded light in half
      if (dado && fi !== 0) b.add('wood', box(wide * 0.99, panelH - fy, 0.09), f.m.clone().multiply(T(0, (fy + panelH) / 2, 0.113)));
    }
    if (dado && fi !== 0) b.add('wood', box(wide, 0.135, 0.225), f.m.clone().multiply(T(0, panelH, 0.128)));
    b.add('wood', box(wide, 0.255, 0.18), f.m.clone().multiply(T(0, fy + 0.128, 0.09)));
  }

  // beams across the short axis — with a loft the deck carries its own joists, which dodge the well
  if (I.loft) return boards(b, I, R, board);
  const across = rx < rz;
  const n = Math.max(2, Math.round((across ? rz : rx) * 2 / 2.1));
  const runL = (across ? rx : rz) * 2;
  for (let i = 0; i < n; i++) {
    const u = -(across ? rz : rx) + ((across ? rz : rx) * 2) * (i + 0.5) / n;
    const g = box(runL, 0.26, 0.29);
    b.add('wood', g, across ? T(0, ceil - 0.13, u) : T(u, ceil - 0.13, 0, Math.PI / 2));
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
  // A cottage fireplace at 2.85 x 3.45 m is a letterbox in an 11 m wall. A hall's is architecture
  // and takes its size from the room, the way its doorway does.
  const bw = I.hall ? Math.min(rz * 0.42, 5.4) : Math.min(rz * 1.1, 2.85);
  const bh = I.hall ? Math.min(I.wallH * 0.62, 6.2) : Math.min(roomH * 0.82, 3.45);
  const x = -rx + 0.09;
  const mh = I.hall ? Math.min(bh * 0.52, 3.2) : 0.98;   // the mouth, not the whole stack
  b.add('stone', box(0.46, bh, bw), T(x + 0.23, fy + bh / 2, 0));
  b.add('stone', box(0.62, 0.16, bw + 0.34), T(x + 0.31, fy + bh + 0.08, 0));
  b.add('stone', box(0.52, 0.14, bw * 0.66), T(x + 0.26, fy + mh + 0.04, 0));
  // firebox: a recessed dark mouth, and the two jambs that make it read as a recess
  for (const s of [-1, 1]) {
    b.add('stone', box(0.5, mh, bw * 0.17), T(x + 0.25, fy + mh / 2, s * (bw * 0.415)));
  }
  b.add('wood', box(0.22, 0.14, bw * 0.5), T(x + 0.42, fy + 0.14, 0));
  b.add('wood', box(0.13, 0.13, bw * 0.44), T(x + 0.34, fy + 0.26, 0.06));
  solid(I, x + 0.31, 0, 0.31, bw / 2 + 0.17, fy + bh);
  I.fire = new THREE.Vector3(x + 0.36, fy + 0.34, 0);
  if (I.hall) I.flames.push({ p: I.fire.clone().setX(x + 0.5), r: 0.85 });
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
  const gw = Math.min(rx * 1.5, 3.0);
  const gy = fy + Math.min(1.20, roomH * 0.28);
  const gh = Math.min(roomH * 0.78, I.ceil - gy - 0.45);
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
  const jamb = 0.24;
  for (const s of [-1, 1]) {
    bat.add('stone', box(jamb, gh + 0.54, 0.33), T(s * (gw / 2 + jamb / 2), gy + gh / 2, zw + 0.165));
  }
  bat.add('stone', box(gw + jamb * 2, 0.3, 0.33), T(0, gy + gh + 0.3, zw + 0.165));
  bat.add('stone', box(gw + jamb * 2 + 0.36, 0.24, 0.51), T(0, gy - 0.11, zw + 0.255));
  for (let i = 1; i < 3; i++) {
    bat.add('stone', box(0.068, gh * 0.99, 0.075), T(-gw / 2 + gw * i / 3, gy + gh / 2, zw + 0.045));
  }
  // The loft gets the same light in a smaller opening: it shares this pane's material, so it
  // brightens and cools with the hour without a second set of state.
  const panes = [pane];
  if (I.loft) {
    const lw = Math.min(rx * 0.7, 1.65), lh = 1.28, ly = I.deck + 0.75;
    const p2 = new THREE.Mesh(uvUnit(flat(openingShape(kind, lw, lh)), lw, lh), paneMat);
    p2.position.set(0, ly, zw);
    group.add(p2);
    panes.push(p2);
    for (const s of [-1, 1]) bat.add('stone', box(0.21, lh + 0.45, 0.3), T(s * (lw / 2 + 0.105), ly + lh / 2, zw + 0.15));
    bat.add('stone', box(lw + 0.42, 0.27, 0.3), T(0, ly + lh + 0.27, zw + 0.15));
    bat.add('stone', box(lw + 0.72, 0.21, 0.45), T(0, ly - 0.09, zw + 0.225));
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
  const fire = new THREE.PointLight(0xffffff, 0, 12.0, 2);
  fire.position.copy(I.fire);
  // Inverse-square from one point cannot light a 35 m room without blowing out everything within
  // 3 m of it, so a hall's fill is a hemisphere instead. update() only ever sets colour and
  // intensity, which both lights answer to.
  // The ground colour is nearly as bright as the sky one on purpose: a hemisphere light gives a
  // vertical face the mean of the two, and with a dark floor colour every wall — and every board
  // on one — came out slate grey while the floor was in full light.
  const fill = I.hall
    ? new THREE.HemisphereLight(0xffffff, 0xd8cdb8, 0)
    : new THREE.PointLight(0xffffff, 0, Math.max(I.rx, I.rz) * 4.5, 2);
  fill.position.set(0, I.fy + (I.ceil - I.fy) * 0.62, -I.rz * 0.2);
  if (I.hall) {
    // One cool light just inside the doors standing in for the daylight coming through them, and
    // a warm one on every sconce the budget will pay for. `hallSconces` is clamped against the
    // preset's own lightCap when the knob is applied, so potato never lights twelve of them.
    const dr = new THREE.PointLight(0xffffff, 0, I.rz * 2.2, 2);
    dr.position.set(0, I.fy + Math.min(4.5, I.apH * 0.75), I.rz - 3.2);
    I.doorLight = dr;
    I.sconceLights = pickSconces(I).map(sc => {
      const l = new THREE.PointLight(0xffffff, 0, 17, 2);
      l.position.copy(sc.p);
      return l;
    });
    return [fire, fill, dr, ...I.sconceLights];
  }
  if (!I.loft) return [fire, fill];
  // The deck cuts the ground floor's fill off from the loft entirely, so upstairs needs its own.
  const up = new THREE.PointLight(0xffffff, 0, Math.max(I.rx, I.rz) * 3.6, 2);
  up.position.set(0, I.deck + I.roomH2 * 0.5, -I.rz * 0.25);
  return [fire, fill, up];
}

// ══ the great hall ══════════════════════════════════════════════════════════════════════════
// Same kit as a cottage — panels, boxes, openings, one Batch — at the size the building outside
// actually is. Nothing below reads the zone id; every difference between a light hall and a dark
// one comes through `z` from zones.js, exactly as the rest of the file does.

const V2 = (x, y) => new THREE.Vector2(x, y);

// Pier lines across a wall. Always an even number of bays, so a wall has a centre pier and the
// two end bays match — an odd count puts a pier where the eye wants the middle of the wall.
export function bayLines(wide, target) {
  const n = Math.max(2, 2 * Math.round(wide / (2 * Math.max(1, target))));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(-wide / 2 + wide * i / n);
  return out;
}

// The four wall frames, +z of each pointing INTO the room. (The cottage table above lets the two
// side faces point outward, which is harmless there because everything it places is a thin skin
// either side of the line; here the walls carry piers, windows and doorways and the sign matters.)
function hallFaces(I) {
  const { rx, rz } = I;
  return [
    { m: T(0, 0, -rz), wide: rx * 2, lines: I.bays.x, gable: true, far: true },
    { m: T(0, 0, rz, Math.PI), wide: rx * 2, lines: I.bays.x, gable: true, door: true },
    { m: T(rx, 0, 0, -Math.PI / 2), wide: rz * 2, lines: I.bays.z, side: 1 },
    { m: T(-rx, 0, 0, Math.PI / 2), wide: rz * 2, lines: I.bays.z, side: -1 },
  ];
}

// A wall is a subdivided plane, not a box: it is only ever seen from inside, and the extra
// vertices are what the baked gradient has to work with.
function wallPanel(b, surface, f, x0, x1, y0, y1, dz = 0.02, segX = 0, segY = 6) {
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0.02 || h <= 0.02) return;
  const g = new THREE.PlaneGeometry(w, h, segX || Math.max(1, Math.round(w / 2.4)), segY);
  b.add(surface, g, f.m.clone().multiply(T((x0 + x1) / 2, (y0 + y1) / 2, dz)));
}

function hallShell(b, I, z) {
  const { rx, rz, fy, wallH, plateY, hs, rise } = I;
  const kind = z.window.shape;
  const baseH = 1.25, pierW = 0.9, proud = 0.30, stringY = fy + wallH * 0.55;
  I.sconces = [];

  // ── floor ── flagged, at the size a flag is. The old floor took the wall texture at 2.6 m a
  // tile, which over 35 m is 13 repeats of a course of masonry and reads as a brick path.
  const fg = new THREE.PlaneGeometry(rx * 2, rz * 2, 18, 16);
  fg.rotateX(-Math.PI / 2);
  b.add('flag', fg, T(0, fy, 0));

  for (const f of hallFaces(I)) {
    const hw = f.wide / 2;
    const dw = f.door ? Math.min(I.apW + 0.5, f.wide - 1.2) : 0, dh = I.apH + 0.24;
    if (f.door) {
      wallPanel(b, 'stone', f, -hw, -dw / 2, fy, plateY);
      wallPanel(b, 'stone', f, dw / 2, hw, fy, plateY);
      wallPanel(b, 'stone', f, -dw / 2, dw / 2, fy + dh, plateY, 0.02, 3, 3);
      // the last few centimetres out to the leaf, lined so the join reads as a reveal
      const gap = Math.max(0.03, I.plugZ - rz);
      for (const s of [-1, 1]) {
        b.add('stone', box(0.32, I.apH + 0.16, gap), T(s * (I.apW / 2 + 0.16), fy + (I.apH + 0.16) / 2, rz + gap / 2));
      }
      b.add('stone', box(I.apW + 0.64, 0.32, gap), T(0, fy + I.apH + 0.16, rz + gap / 2));
      // a relieving arch over the doorway, which is what a 5.4 m hole in 11 m of stone needs
      const ring = openingShape('arch', dw + 1.5, dh + 1.1);
      ring.holes = [openingShape('arch', dw, dh)];
      b.add('stone', new THREE.ShapeGeometry(ring, 5), f.m.clone().multiply(T(0, fy, 0.05)));
    } else {
      wallPanel(b, 'stone', f, -hw, hw, fy, plateY);
    }

    // base course, string course, wall plate — three horizontal lines is what stops eleven
    // metres of masonry reading as one flat field. A course low enough to cross the doorway is
    // drawn as two returns instead: run through the opening it is a knee-high wall standing in
    // the door, which is what you walk into on the way in.
    const course = (surface, geo, y, h, dz) => {
      const runs = dw && y - h / 2 < fy + dh ? [[-hw, -dw / 2], [dw / 2, hw]] : [[-hw, hw]];
      for (const [u0, u1] of runs) b.add(surface, geo(u1 - u0), f.m.clone().multiply(T((u0 + u1) / 2, y, dz)));
    };
    course('stone', w => box(w, baseH, 0.34), fy + baseH / 2, baseH, 0.17);
    course('stone', w => taperBox(w, 0.20, 0.26, w, 0.34), fy + baseH + 0.13, 0.26, 0.10);
    course('stone', w => box(w, 0.28, 0.34), stringY, 0.28, 0.17);
    course('beam', w => box(w, 0.38, 0.48), plateY - 0.19, 0.38, 0.24);

    // ── piers ── one at every bay line, carrying a corbel where a truss lands on it
    for (const [li, u] of f.lines.entries()) {
      const end = li === 0 || li === f.lines.length - 1;
      // The bay grid is the same on every wall, and on the door wall its centre line lands in
      // the middle of the opening. A pier standing in a 5.4 m doorway is the dark bar you could
      // see down the middle of it from the road.
      if (f.door && Math.abs(u) < I.apW / 2 + pierW) continue;
      const w = end ? pierW * 1.35 : pierW;
      b.add('stone', box(w, wallH - 0.2, proud), f.m.clone().multiply(T(u, fy + (wallH - 0.2) / 2, proud / 2)));
      b.add('stone', taperBox(w + 0.34, proud + 0.22, 0.30, w, proud), f.m.clone().multiply(T(u, plateY - 0.5, (proud + 0.22) / 2)));
      b.add('stone', taperBox(w + 0.2, proud + 0.1, 0.24, w + 0.34, proud + 0.3), f.m.clone().multiply(T(u, fy + baseH + 0.14, (proud + 0.1) / 2)));
      // a sconce on every pier but the corners; how many of them are a real light is a knob
      // No sconce on the wall the contract boards hang on: a flame 0.9 m off the stone sits
      // in front of a board that is 0.8 m off it, and lands on the lettering.
      if (!end && !f.far) {
        const sy = fy + wallH * 0.55;
        // an open bracket and a shallow basket: a solid housing would occlude its own flame
        b.add('beam', box(0.16, 0.5, 0.7), f.m.clone().multiply(T(u, sy - 0.4, proud + 0.35)));
        b.add('beam', box(0.16, 0.62, 0.16), f.m.clone().multiply(T(u, sy - 0.75, proud + 0.62, 0, -0.7)));
        for (let k = 0; k < 4; k++) {
          b.add('beam', box(0.08, 0.34, 0.08), f.m.clone().multiply(T(u + (k < 2 ? -0.22 : 0.22), sy - 0.1, proud + 0.36 + (k % 2 ? 0.44 : 0))));
        }
        const p = new THREE.Vector3(0, sy + 0.18, proud + 0.58).applyMatrix4(f.m.clone().multiply(T(u, 0, 0)));
        I.sconces.push({ p });
      }
    }

    // ── gable ── the two walls the ridge runs into carry the roof line up to the apex, with the
    // hall's one big window in it. Above the contract boards at the far end, that window is the
    // only thing in the room the eye goes to before it reads the wall.
    if (f.gable) {
      const gh = rise * 0.74, gw = Math.min(gh * 0.66, I.xc * 1.5);
      const sill = rise * 0.15;
      const tri = new THREE.Shape([V2(-hs, 0), V2(hs, 0), V2(I.xc, rise), V2(-I.xc, rise)]);
      tri.holes = [openingShape(kind, gw, gh, sill)];
      b.add('stone', new THREE.ShapeGeometry(tri, 6), f.m.clone().multiply(T(0, plateY, 0.02)));
      f.gableWin = { w: gw, h: gh, y: plateY + sill };
    }
  }
  I.winY = 5.2;   // the height the baked gradient pools light at; see hallGlass
}

// ── the open timber roof ────────────────────────────────────────────────────────────────────
// Trusses land on the pier corbels, purlins run between the trusses, commons sit on the purlins
// and the boarding closes it. Built in that order because that is the order it is read in: what
// makes a roof read as structure rather than as a lid is seeing one member carried by another.
function hallRoof(b, I) {
  const { rz, plateY, hs, rise } = I;
  const xc = I.xc;
  const run = hs - xc;                        // horizontal reach of one slope
  const a = Math.atan2(rise, run);
  const sl = Math.hypot(run, rise);
  const runL = rz * 2;
  const apex = plateY + rise;
  const mid = plateY + rise / 2;
  const cx = s => s * (xc + run / 2);         // centre of one slope
  const slope = s => (s > 0 ? -a : a);

  // the flat crown, and a slope either side of it
  const crown = new THREE.PlaneGeometry(xc * 2, runL, 8, 10);
  crown.rotateX(Math.PI / 2);
  b.add('beam', crown, T(0, apex, 0));
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(sl, runL, 5, 10);
    g.rotateX(Math.PI / 2);
    b.add('beam', g, T(cx(s), mid, 0, 0, 0, slope(s)));
    for (const u of [0.34, 0.72]) {
      b.add('beam', box(0.30, 0.34, runL), T(s * (hs - run * u), plateY + rise * u - 0.36, 0));
    }
    const n = Math.max(2, Math.round(runL / 1.9));
    for (let i = 0; i <= n; i++) {
      const z = -rz + runL * i / n;
      b.add('beam', box(sl, 0.26, 0.30), T(cx(s), mid - 0.22, z, 0, 0, slope(s)));
      b.add('beam', box(xc * 2, 0.22, 0.28), T(0, apex - 0.20, z));
    }
    b.add('beam', box(0.34, 0.40, runL), T(s * xc, apex - 0.28, 0));
  }

  // ── trusses ── on the same bay lines the side-wall piers are on, so every one lands on stone
  for (const z of I.bays.z) {
    for (const s of [-1, 1]) {
      b.add('beam', box(sl * 0.99, 0.42, 0.54), T(cx(s), mid - 0.32, z, 0, 0, slope(s)));
      // arch brace from the pier corbel up under the rafter — the member that makes a big roof
      // look carried rather than balanced
      const x0 = s * (hs - 0.34), y0 = plateY - 1.9;
      const x1 = s * (hs - run * 0.55), y1 = plateY + rise * 0.55 - 0.55;
      const len = Math.hypot(x1 - x0, y1 - y0);
      b.add('beam', box(len, 0.34, 0.42), T((x0 + x1) / 2, (y0 + y1) / 2, z, 0, 0, Math.atan2(y1 - y0, x1 - x0)));
      // a hanging post down from the crown's edge onto the rafter head
      b.add('beam', box(0.30, 0.9, 0.36), T(s * xc, apex - 0.55, z));
    }
    b.add('beam', box(xc * 2, 0.40, 0.48), T(0, apex - 0.32, z));
  }
}

// ── dressing ────────────────────────────────────────────────────────────────────────────────
// Tables and benches are human-scale and do not take K: a 0.78 m table in an 11 m room is what
// tells you the room is 11 m. Everything else here is the same box the rest of the kit is.
function hallDress(b, I, z, R) {
  const { rx, rz, fy, wallH, plateY } = I;
  const D = HALL.dress;
  if (D <= 0.01) return;

  // ── two refectory tables down the length of the hall ──
  const tl = Math.min(rz * 1.0, 13), tw = 1.5, th = 0.78;
  for (const s of [-1, 1]) {
    const tx = s * rx * 0.44;
    b.add('wood', box(tw, 0.10, tl), T(tx, fy + th, -1.5));
    for (const u of [-0.34, 0.34]) {
      const tz = -1.5 + tl * u;
      b.add('wood', box(0.26, th - 0.05, 0.9), T(tx, fy + (th - 0.05) / 2, tz));
      b.add('wood', box(0.5, 0.14, 1.5), T(tx, fy + 0.07, tz));
      b.add('wood', box(1.1, 0.16, 0.34), T(tx, fy + th - 0.16, tz));
    }
    b.add('wood', box(0.22, 0.20, tl * 0.74), T(tx, fy + 0.42, -1.5));
    for (const bs of [-1, 1]) {
      const bx = tx + bs * 1.35;
      b.add('wood', box(0.44, 0.09, tl * 0.92), T(bx, fy + 0.47, -1.5));
      for (const u of [-0.38, 0.38]) {
        b.add('wood', box(0.4, 0.42, 0.1), T(bx, fy + 0.22, -1.5 + tl * u));
      }
    }
    // one box for the table and both its benches: they are one piece of furniture to walk round
    solid(I, tx, -1.5, 1.35 + 0.22, tl / 2, fy + th);
  }

  // ── tapestries ── the cheapest way to break eleven metres of stone, and the only colour in it
  // A hanging has to read as cloth from across the room or it is a grey rectangle set into the
  // wall — which is exactly what a critic pass called the first version. What sells it is a
  // heavy pole with finials, a dark border on all four sides, and folds standing proud enough
  // to catch the sconce beside them.
  const tapY = fy + wallH * 0.62, tapW = 4.0, tapH = wallH * 0.46;
  const hang = (f, u) => {
    const M = (x, y, z, ...r) => f.m.clone().multiply(T(u + x, y, z, ...r));
    b.add('beam', box(tapW + 0.8, 0.22, 0.24), M(0, tapY + 0.11, 0.44));
    for (const sx of [-1, 1]) b.add('beam', new THREE.SphereGeometry(0.17, 8, 6), M(sx * (tapW / 2 + 0.4), tapY + 0.11, 0.44));
    const g = new THREE.PlaneGeometry(tapW, tapH, 5, 6);
    b.add('cloth', g, M(0, tapY - tapH / 2, 0.40));
    for (let i = 0; i < 4; i++) {
      b.add('cloth', box(0.12, tapH - 0.24, 0.09), M(-tapW / 2 + tapW * (i + 0.5) / 4, tapY - tapH / 2, 0.45));
    }
    for (const sx of [-1, 1]) b.add('beam', box(0.20, tapH, 0.13), M(sx * (tapW / 2 - 0.10), tapY - tapH / 2, 0.44));
    b.add('beam', box(tapW, 0.20, 0.13), M(0, tapY - tapH + 0.10, 0.44));
    b.add('beam', box(tapW, 0.20, 0.13), M(0, tapY - 0.10, 0.44));
  };
  const faces = hallFaces(I);
  const bayMids = lines => lines.slice(0, -1).map((v, i) => (v + lines[i + 1]) / 2);
  const farMids = bayMids(faces[0].lines);
  for (const u of [farMids[0], farMids[farMids.length - 1]]) hang(faces[0], u);
  const sideMids = bayMids(faces[2].lines);
  hang(faces[2], sideMids[sideMids.length - 1]);
  hang(faces[3], sideMids[0]);
  hang(faces[3], sideMids[sideMids.length - 1]);

  // ── doorways to the rest of the academy ── one open onto a dark stub of passage, two shut.
  // The hotspots that make them locked or not are in the level document; nothing here knows.
  const dw = 2.6, dh = Math.min(3.8, wallH * 0.60), kind = z.window.shape;
  const doorAt = (f, u, open) => {
    const ring = openingShape(kind, dw + 0.9, dh + 0.62);
    ring.holes = [openingShape(kind, dw, dh)];
    b.add('stone', new THREE.ShapeGeometry(ring, 5), f.m.clone().multiply(T(u, fy, 0.06)));
    b.add('stone', taperBox(dw + 1.5, 0.44, 0.24, dw + 1.1, 0.34), f.m.clone().multiply(T(u, fy + dh + 0.42, 0.14)));
    if (open) {
      // a passage stub: five inward faces. The baked gradient buries anything this far from a
      // window, so it reads as a dark corridor without a second material.
      const pd = 3.2, mm = f.m.clone().multiply(T(u, fy, 0.02));
      b.add('stone', new THREE.PlaneGeometry(dw, dh), mm.clone().multiply(T(0, dh / 2, -pd)));
      const fl = new THREE.PlaneGeometry(dw, pd); fl.rotateX(-Math.PI / 2);
      b.add('flag', fl, mm.clone().multiply(T(0, 0.01, -pd / 2)));
      const cl = new THREE.PlaneGeometry(dw, pd); cl.rotateX(Math.PI / 2);
      b.add('stone', cl, mm.clone().multiply(T(0, dh, -pd / 2)));
      for (const s of [-1, 1]) {
        const sw = new THREE.PlaneGeometry(pd, dh); sw.rotateY(-s * Math.PI / 2);
        b.add('stone', sw, mm.clone().multiply(T(s * dw / 2, dh / 2, -pd / 2)));
      }
    } else {
      // Set well back in the reveal, and boarded: a single flat slab flush with the masonry is
      // what a critic pass read as a missing material rather than as a door.
      const lz = -0.26, planks = 5;
      for (let i = 0; i < planks; i++) {
        const px = -dw / 2 + dw * (i + 0.5) / planks;
        b.add('beam', box(dw / planks - 0.06, dh - 0.16, 0.16), f.m.clone().multiply(T(u + px, fy + (dh - 0.16) / 2, lz)));
      }
      b.add('beam', box(dw - 0.1, dh - 0.16, 0.06), f.m.clone().multiply(T(u, fy + (dh - 0.16) / 2, lz - 0.09)));
      for (const y of [dh * 0.22, dh * 0.56, dh * 0.88]) {
        b.add('wood', box(dw - 0.24, 0.18, 0.10), f.m.clone().multiply(T(u, fy + y, lz + 0.13)));
        for (const sx of [-1, 1]) b.add('wood', box(0.13, 0.13, 0.13), f.m.clone().multiply(T(u + sx * (dw / 2 - 0.24), fy + y, lz + 0.18)));
      }
      b.add('wood', box(0.5, 0.24, 0.16), f.m.clone().multiply(T(u + dw * 0.28, fy + 1.15, lz + 0.16)));
      b.add('wood', new THREE.TorusGeometry(0.17, 0.045, 4, 10), f.m.clone().multiply(T(u + dw * 0.28, fy + 0.92, lz + 0.16)));
    }
  };
  doorAt(faces[3], sideMids[1], true);
  doorAt(faces[2], sideMids[1], false);
  doorAt(faces[2], sideMids[2], false);

  // ── presses and chests ── something along the wall, and no more than that
  for (const s of [-1, 1]) {
    const cz = s * rz * 0.34;
    b.add('wood', box(0.95, 2.7, 2.4), T(-rx + 0.62, fy + 1.35, cz));
    b.add('wood', box(1.1, 0.22, 2.7), T(-rx + 0.66, fy + 2.8, cz));
    b.add('wood', box(0.06, 2.0, 0.16), T(-rx + 1.1, fy + 1.5, cz));
    solid(I, -rx + 0.66, cz, 0.55, 1.35, fy + 2.9);
  }
  for (let i = 0; i < 3; i++) {
    const cz = -rz * 0.6 + rz * 0.6 * i;
    b.add('wood', box(1.5, 0.85, 0.9), T(rx - 0.9, fy + 0.42, cz));
    b.add('wood', box(1.6, 0.16, 1.0), T(rx - 0.9, fy + 0.9, cz));
    b.add('beam', box(1.62, 0.1, 0.14), T(rx - 0.9, fy + 0.55, cz + span(R, -0.2, 0.2)));
    solid(I, rx - 0.9, cz, 0.8, 0.5, fy + 0.98);
  }
}

// An axis-aligned blocker in the room's own frame; `top` is its height above the room's origin.
function solid(I, x, z, hw, hd, top) {
  I.solids.push({ x, z, hw, hd, c: 1, s: 0, top });
}

// The sconces that get a real point light, spread out rather than clustered: taking the first N
// off the list hands every light to one wall.
function pickSconces(I) {
  const all = I.sconces || [];
  if (all.length < 2) return all;
  const out = [];
  const step = all.length / Math.min(all.length, 12);
  for (let i = 0; i < all.length; i++) out.push(all[Math.round(i * step) % all.length]);
  return out.filter((v, i, arr) => arr.indexOf(v) === i);
}

// One additive mesh for every flame in the room. Nested front-face-only shells, because a single
// additive sphere is a hard-edged octagon — NOTES_PROPS.md, and it is still true here.
function hallFlames(I) {
  const geos = [];
  const push = (p, r) => {
    for (let k = 0; k < 4; k++) {
      const g = new THREE.IcosahedronGeometry(r * (0.42 + k * 0.22), 1);
      g.translate(p.x, p.y, p.z);
      geos.push(g);
    }
  };
  for (const sc of I.sconces || []) push(sc.p, 0.20);
  for (const fl of I.flames || []) push(fl.p, fl.r);
  if (!geos.length) return null;
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(I.z.interior.warmth).multiplyScalar(0.72), transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos.map(g => g.toNonIndexed()), false), mat);
  mesh.renderOrder = 4;
  I.glowMat = mat;
  I.tris += mesh.geometry.attributes.position.count / 3;
  I.object3D.add(mesh);
  return mesh;
}

// ── the leaded lights, at hall scale ────────────────────────────────────────────────────────
// The cottage builds one pane on the wall opposite the door. At 35 m that pane came out 3 m wide
// and 9 m tall — a slot, which is the "barely reads" the handoff recorded. A hall gets a row per
// wall instead, and the two long walls each throw a real patch of coloured light on the floor.
function hallGlass(shellBatch, I, z, opts) {
  const { rx, rz, fy, wallH, plateY } = I;
  const kind = z.window.shape;
  const tex = stainedTexture(z.id);
  const tint = stainedTint(z.id);
  const paneMat = new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1,
    roughness: 0.22, metalness: 0, side: THREE.DoubleSide,
  });
  paneMat.envMapIntensity = 0.2;

  const faces = hallFaces(I);
  const mids = lines => lines.slice(0, -1).map((v, i) => (v + lines[i + 1]) / 2);
  const sideMids = mids(faces[2].lines);
  // A clerestory: high enough to clear the doorways in the same bays, low enough to leave the
  // wall plate its own band of stone.
  const sillY = fy + wallH * 0.62;
  const winH = wallH * 0.30;
  I.winY = sillY + winH / 2 - fy;

  const groups = [];
  // the two long walls: a light in every bay, and the sun through them lands on the floor
  for (const [fi, ry] of [[2, -Math.PI / 2], [3, Math.PI / 2]]) {
    groups.push({
      ry, halfW: rz, halfD: rx, shaft: true,
      panes: sideMids.map(u => ({ x: fi === 2 ? u : -u, y: sillY, w: 2.4, h: winH, kind })),
    });
  }
  // The far wall is the contract wall and gets no clerestory of its own: the four boards and the
  // gable window over them are what the eye is meant to go to.
  // and the gable window in each end wall
  for (const [fi, ry] of [[0, 0], [1, Math.PI]]) {
    const gwin = faces[fi].gableWin;
    if (!gwin) continue;
    groups.push({
      // The door wall faces the sun for most of the day here, so its gable light is the one that
      // actually throws a patch — and it lands in the middle of the floor rather than in a corner.
      ry, halfW: rx, halfD: rz, shaft: fi === 1,
      panes: [{ x: 0, y: gwin.y, w: gwin.w, h: gwin.h, kind }],
    });
  }

  const group = new THREE.Group();
  let tris = 0;
  const parts = groups.map(cfg => {
    const p = glassWall(shellBatch, I, z, cfg, paneMat, tint);
    group.add(p.group);
    tris += p.tris;
    return p;
  });

  const state = { day: 0, fill: tint.clone() };
  const _s = new THREE.Vector3();
  return {
    group, tris,
    get day() { return state.day; },
    get fill() { return state.fill; },
    update(sun, env) {
      let day = 0;
      for (const p of parts) {
        // the sun rotated into this wall's own frame, so one projection serves all four walls
        const c = Math.cos(p.ry), s = Math.sin(p.ry);
        _s.set(sun.x * c - sun.z * s, sun.y, sun.x * s + sun.z * c);
        day = Math.max(day, p.update(_s, env));
      }
      state.day = day;
      state.fill.copy(tint).lerp(_warm2.set(z.interior.warmth), 1 - day);
      paneMat.emissiveIntensity = (0.16 + 1.15 * day) * env.glow;
      paneMat.color.setScalar(0.3 + 0.7 * day);
    },
    dispose() {
      for (const p of parts) p.dispose();
      paneMat.dispose();
    },
  };
}

// One wall's worth of leaded light: the panes merged into a single mesh, the stone reveals handed
// to the room's own batch so they cost no draw call of their own, and optionally the patch and
// shaft the sun throws through them.
function glassWall(shellBatch, I, z, cfg, paneMat, tint) {
  const group = new THREE.Group();
  group.rotation.y = cfg.ry;
  const RM = T(0, 0, 0, cfg.ry);
  const zw = -cfg.halfD + 0.06;
  const geos = [];
  const outs = [];

  for (const p of cfg.panes) {
    const g = uvUnit(flat(openingShape(p.kind, p.w, p.h)), p.w, p.h);
    g.translate(p.x, p.y, zw);
    geos.push(g.toNonIndexed());
    outs.push({ pts: openingPts(p.kind, p.w, p.h).map(q => [q[0] + p.x, q[1] + p.y]), w: p.w, h: p.h, y: p.y });
    const jamb = 0.34;
    for (const s of [-1, 1]) {
      shellBatch.add('stone', box(jamb, p.h + 0.8, 0.44), RM.clone().multiply(T(p.x + s * (p.w / 2 + jamb / 2), p.y + p.h / 2, zw + 0.22)));
    }
    shellBatch.add('stone', box(p.w + jamb * 2, 0.34, 0.44), RM.clone().multiply(T(p.x, p.y + p.h + 0.34, zw + 0.22)));
    shellBatch.add('stone', taperBox(p.w + jamb * 2 + 0.4, 0.62, 0.26, p.w + jamb * 2, 0.44), RM.clone().multiply(T(p.x, p.y - 0.13, zw + 0.31)));
    for (let i = 1; i < 3; i++) {
      shellBatch.add('stone', box(0.09, p.h * 0.99, 0.10), RM.clone().multiply(T(p.x - p.w / 2 + p.w * i / 3, p.y + p.h / 2, zw + 0.06)));
    }
  }

  const mesh = new THREE.Mesh(mergeGeometries(geos, false), paneMat);
  group.add(mesh);
  let tris = mesh.geometry.attributes.position.count / 3;

  let patch = null, shaft = null, patchMat = null, shaftMat = null;
  if (cfg.shaft) {
    patchMat = new THREE.MeshBasicMaterial({
      map: paneMat.map, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, opacity: 0,
    });
    shaftMat = new THREE.MeshBasicMaterial({
      color: tint, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, vertexColors: true, opacity: 0,
    });
    patch = new THREE.Mesh(patchGeoN(outs), patchMat);
    shaft = new THREE.Mesh(shaftGeoN(outs), shaftMat);
    patch.renderOrder = shaft.renderOrder = 3;
    patch.frustumCulled = shaft.frustumCulled = false;
    group.add(patch, shaft);
    tris += (patch.geometry.index.count + shaft.geometry.index.count) / 3;
  }

  const st = { sx: 9, sy: 9, sz: 9 };
  return {
    group, tris, ry: cfg.ry,
    update(sun, env) {
      const facing = Math.max(0, -sun.z);
      const day = facing * Math.min(1, Math.max(0, sun.y) * 2.2) * env.day;
      if (!patch) return day;
      const strength = day * env.glow;
      patchMat.opacity = strength * 0.62;
      shaftMat.opacity = strength * env.shaft * 0.30;
      patch.visible = patchMat.opacity > 0.01;
      shaft.visible = shaftMat.opacity > 0.01;
      if (!patch.visible) return day;
      patchMat.color.copy(env.sunColor);
      shaftMat.color.copy(tint).lerp(env.sunColor, 0.25);
      if (Math.abs(sun.x - st.sx) + Math.abs(sun.y - st.sy) + Math.abs(sun.z - st.sz) < 0.002) return day;
      st.sx = sun.x; st.sy = sun.y; st.sz = sun.z;
      const hits = outs.map(o => o.pts.map(q => project(q[0], q[1], zw, sun, I.fy, cfg.halfW, cfg.halfD)));
      fillPatchN(patch.geometry, hits);
      fillShaftN(shaft.geometry, outs, zw, hits);
      return day;
    },
    dispose() {
      mesh.geometry.dispose();
      patch?.geometry.dispose(); shaft?.geometry.dispose();
      patchMat?.dispose(); shaftMat?.dispose();
    },
  };
}

// The cottage patch is one outline; a hall wall is four, so both buffers are the concatenation
// and every fan is indexed from its own first vertex.
function patchGeoN(outs) {
  const n = outs.reduce((a, o) => a + o.pts.length, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const uv = new Float32Array(n * 2);
  const idx = [];
  let base = 0;
  for (const o of outs) {
    for (let i = 0; i < o.pts.length; i++) {
      uv[(base + i) * 2] = (o.pts[i][0] - o.pts[0][0]) / o.w + 0.5;
      uv[(base + i) * 2 + 1] = (o.pts[i][1] - o.pts[0][1]) / o.h;
    }
    for (let i = 1; i < o.pts.length - 1; i++) idx.push(base, base + i, base + i + 1);
    base += o.pts.length;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function fillPatchN(g, hits) {
  const p = g.attributes.position;
  let i = 0;
  for (const h of hits) for (const q of h) p.setXYZ(i++, q[0], 0.012, q[1]);
  p.needsUpdate = true;
  g.computeBoundingSphere();
}

function shaftGeoN(outs) {
  const n = outs.reduce((a, o) => a + o.pts.length, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 2 * 3), 3));
  const col = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    col[i * 6] = col[i * 6 + 1] = col[i * 6 + 2] = 1;
    col[i * 6 + 3] = col[i * 6 + 4] = col[i * 6 + 5] = 0.18;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const idx = [];
  let base = 0;
  for (const o of outs) {
    const m = o.pts.length;
    for (let i = 0; i < m; i++) {
      const a = (base + i) * 2, c = (base + (i + 1) % m) * 2;
      idx.push(a, a + 1, c + 1, a, c + 1, c);
    }
    base += m;
  }
  g.setIndex(idx);
  return g;
}

function fillShaftN(g, outs, zw, hits) {
  const p = g.attributes.position;
  let i = 0;
  for (let k = 0; k < outs.length; k++) {
    const o = outs[k];
    for (let j = 0; j < o.pts.length; j++) {
      p.setXYZ(i * 2, o.pts[j][0], o.pts[j][1], zw + 0.02);
      p.setXYZ(i * 2 + 1, hits[k][j][0], 0.05, hits[k][j][1]);
      i++;
    }
  }
  p.needsUpdate = true;
  g.computeBoundingSphere();
}
