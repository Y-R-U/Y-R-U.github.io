// world.js — planet sector: ground, sky, road layout, prop placement and the
// instanced field that draws it all.

import * as THREE from 'three';
import { WORLD, TIER_R, TIER_VALUE, DEFAULT_MIX } from './config.js';
import { theme as getTheme } from './palettes.js';
import { PROP_DEFS, DEF_BY_KIND, buildProtos, buildLandmark, tierRadius, makeSolidMaterial, makeGlowMaterial } from './props.js';
import { TAU, makeRng, Grid, clamp, lerp } from './utils.js';

const _m4 = new THREE.Matrix4();
const _qt = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const ZERO = new THREE.Vector3(0, 0, 0);

/** Gentle planetary curvature so the horizon falls away. Physics stays in XZ. */
export function domeY(x, z) {
  return -(x * x + z * z) / (2 * WORLD.DOME);
}

// ── instanced prop field ────────────────────────────────────────────────────

class PropField {
  constructor(scene, protos, counts, opts) {
    this.scene = scene;
    this.protos = protos;
    this.meshes = {};      // kind -> [ {solid, glow, used} per variant ]
    this.solidMat = makeSolidMaterial();
    this.glowMat = makeGlowMaterial();
    this.group = new THREE.Group();
    scene.add(this.group);
    const useGlow = opts.glow !== false;
    const shadows = !!opts.shadows;
    for (const kind in counts) {
      const list = [];
      const protoList = protos[kind];
      if (!protoList) continue;
      for (let v = 0; v < protoList.length; v++) {
        const n = counts[kind][v] | 0;
        if (!n) { list.push(null); continue; }
        const p = protoList[v];
        const entry = { used: 0, cap: n };
        entry.solid = new THREE.InstancedMesh(p.solid, this.solidMat, n);
        entry.solid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        entry.solid.frustumCulled = false;
        entry.solid.castShadow = shadows;
        entry.solid.receiveShadow = shadows;
        this.group.add(entry.solid);
        if (p.glow && useGlow) {
          entry.glow = new THREE.InstancedMesh(p.glow, this.glowMat, n);
          entry.glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          entry.glow.frustumCulled = false;
          this.group.add(entry.glow);
        }
        list.push(entry);
      }
      this.meshes[kind] = list;
    }
  }

  alloc(kind, v) {
    const e = this.meshes[kind] && this.meshes[kind][v];
    if (!e || e.used >= e.cap) return -1;
    return e.used++;
  }

  write(p) {
    const e = this.meshes[p.kind][p.vi];
    if (!e) return;
    if (p.tiltAmt > 0.0001) {
      _ax.set(-Math.sin(p.tiltDir), 0, Math.cos(p.tiltDir));
      _qt.setFromAxisAngle(_ax, p.tiltAmt);
      _qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
      _qt.multiply(_qy);
    } else {
      _qt.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
    }
    _pos.set(p.x, p.y, p.z);
    _scl.set(p.scale, p.scale, p.scale);
    _m4.compose(_pos, _qt, _scl);
    e.solid.setMatrixAt(p.slot, _m4);
    e.solid.instanceMatrix.needsUpdate = true;
    if (e.glow) { e.glow.setMatrixAt(p.slot, _m4); e.glow.instanceMatrix.needsUpdate = true; }
  }

  /**
   * Trim every InstancedMesh to the slots actually filled.
   *
   * three.js zero-fills `instanceMatrix`, and a zero matrix sends every vertex
   * to w=0 — which projects to infinity and draws as enormous garbage polygons
   * across the screen. Any capacity reserved for a prop that then failed
   * placement would render as exactly that, so this must run after placement.
   */
  finalize() {
    for (const kind in this.meshes) {
      for (const e of this.meshes[kind]) {
        if (!e) continue;
        e.solid.count = e.used;
        if (e.glow) e.glow.count = e.used;
      }
    }
  }

  hide(p) {
    const e = this.meshes[p.kind][p.vi];
    if (!e) return;
    _m4.compose(new THREE.Vector3(0, -9999, 0), _qt.identity(), ZERO);
    e.solid.setMatrixAt(p.slot, _m4);
    e.solid.instanceMatrix.needsUpdate = true;
    if (e.glow) { e.glow.setMatrixAt(p.slot, _m4); e.glow.instanceMatrix.needsUpdate = true; }
  }

  dispose() {
    this.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    this.scene.remove(this.group);
    this.solidMat.dispose();
    this.glowMat.dispose();
  }
}

// ── ground texture ──────────────────────────────────────────────────────────

function groundTexture(th, rng, R, roads, size) {
  const S = size || 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = hex(th.ground);
  g.fillRect(0, 0, S, S);

  const toPx = (v) => (v / (R * 2) + 0.5) * S;
  const scale = S / (R * 2);

  // blotchy terrain variation
  for (let i = 0; i < 130; i++) {
    const x = rng() * S, y = rng() * S, r = rng() * S * 0.09 + S * 0.02;
    g.globalAlpha = 0.16 + rng() * 0.18;
    g.fillStyle = hex(rng() < 0.5 ? th.groundAlt : th.ground);
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;

  // roads
  g.strokeStyle = hex(th.road);
  g.lineCap = 'round';
  for (const rd of roads) {
    g.lineWidth = rd.w * scale;
    g.beginPath();
    if (rd.type === 'ring') {
      g.arc(S / 2, S / 2, rd.r * scale, 0, TAU);
    } else {
      g.moveTo(toPx(rd.x0), toPx(rd.z0));
      g.lineTo(toPx(rd.x1), toPx(rd.z1));
    }
    g.stroke();
  }
  // centre lines
  g.globalAlpha = 0.35;
  g.strokeStyle = hex(th.accent);
  for (const rd of roads) {
    g.lineWidth = Math.max(1, 0.35 * scale);
    g.setLineDash([6 * scale, 7 * scale]);
    g.beginPath();
    if (rd.type === 'ring') g.arc(S / 2, S / 2, rd.r * scale, 0, TAU);
    else { g.moveTo(toPx(rd.x0), toPx(rd.z0)); g.lineTo(toPx(rd.x1), toPx(rd.z1)); }
    g.stroke();
  }
  g.setLineDash([]);
  g.globalAlpha = 1;

  // landing pads / plazas
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU, d = rng() * R * 0.85;
    const x = toPx(Math.cos(a) * d), y = toPx(Math.sin(a) * d);
    const r = (5 + rng() * 11) * scale;
    g.globalAlpha = 0.5;
    g.fillStyle = hex(th.road);
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.globalAlpha = 0.7;
    g.strokeStyle = hex(th.accent);
    g.lineWidth = Math.max(1, 0.5 * scale);
    g.beginPath(); g.arc(x, y, r * 0.72, 0, TAU); g.stroke();
    g.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ── road layout ─────────────────────────────────────────────────────────────

function makeRoads(rng, R, style) {
  const roads = [];
  if (style === 'none') return roads;
  const spokes = style === 'dense' ? rng.int(7, 9) : rng.int(4, 6);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU + rng.range(-0.12, 0.12);
    roads.push({ type: 'line', x0: Math.cos(a) * R * 0.04, z0: Math.sin(a) * R * 0.04, x1: Math.cos(a) * R * 0.98, z1: Math.sin(a) * R * 0.98, w: WORLD.ROAD_W });
  }
  const rings = style === 'dense' ? 3 : 2;
  for (let i = 0; i < rings; i++) {
    roads.push({ type: 'ring', r: R * (0.3 + i * (0.62 / rings)), w: WORLD.ROAD_W * 0.9 });
  }
  return roads;
}

function distToRoads(x, z, roads) {
  let best = 1e9;
  const d = Math.hypot(x, z);
  for (const rd of roads) {
    if (rd.type === 'ring') best = Math.min(best, Math.abs(d - rd.r));
    else {
      const dx = rd.x1 - rd.x0, dz = rd.z1 - rd.z0;
      const l2 = dx * dx + dz * dz;
      let t = l2 ? ((x - rd.x0) * dx + (z - rd.z0) * dz) / l2 : 0;
      t = clamp(t, 0, 1);
      best = Math.min(best, Math.hypot(x - (rd.x0 + dx * t), z - (rd.z0 + dz * t)));
    }
  }
  return best;
}

/** Nearest point on a road, used to put vehicles where vehicles belong. */
function pointOnRoad(rng, roads, R) {
  if (!roads.length) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * R * 0.9;
    return { x: Math.cos(a) * d, z: Math.sin(a) * d, dir: rng() * TAU };
  }
  const rd = rng.pick(roads);
  if (rd.type === 'ring') {
    const a = rng() * TAU;
    return { x: Math.cos(a) * rd.r, z: Math.sin(a) * rd.r, dir: a + Math.PI / 2 };
  }
  const t = rng();
  const dx = rd.x1 - rd.x0, dz = rd.z1 - rd.z0;
  return { x: rd.x0 + dx * t, z: rd.z0 + dz * t, dir: Math.atan2(dz, dx) };
}

// ── the sector ──────────────────────────────────────────────────────────────

export class Sector {
  constructor(scene, spec, opts) {
    this.scene = scene;
    this.spec = spec;
    this.opts = opts || {};
    this.mix = spec.mix || DEFAULT_MIX;
    this.maxTier = spec.maxTier || 7;
    // Mean footprint area of one prop under this mix, which is what actually
    // decides how many fit. Clamp the play radius so MAX_PROPS can cover it —
    // everything downstream is percentage-based, so a smaller sector on a
    // weaker device plays identically, just tighter.
    let wsum = 0, asum = 0;
    for (let t = 1; t <= this.maxTier; t++) {
      const f = this.mix[t] || 0;
      wsum += f;
      asum += f * Math.PI * Math.pow(tierRadius(t), 2);
    }
    this.meanArea = wsum ? asum / wsum : 4;
    const coverage = WORLD.COVERAGE * (spec.density || 1);
    const budget = this.opts.maxProps || WORLD.MAX_PROPS;
    const maxR = Math.sqrt((budget * this.meanArea) / (coverage * Math.PI));
    this.R = Math.min(spec.radius, maxR);
    this.themeKey = spec.theme;
    this.th = getTheme(spec.theme);
    this.rng = makeRng(spec.seed);
    this.props = [];
    this.movers = [];
    this.grid = new Grid(10);
    this.totalMass = 0;
    this.eatenMass = 0;
    // "clearance" is measured in ground area removed, not mass — otherwise a
    // single tower would be worth more of the quota than half the suburbs.
    this.totalArea = 0;
    this.eatenArea = 0;
    this.landmarks = [];
    this._build();
  }

  _build() {
    const rng = this.rng, th = this.th, R = this.R;
    const scene = this.scene;

    scene.fog = new THREE.Fog(th.fog, R * 0.7, R * 2.9);
    scene.background = new THREE.Color(th.sky[0]);

    // ── lights ──
    const hemi = new THREE.HemisphereLight(th.sky[1], th.ground, th.ambI);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(th.sun, 1.15);
    sun.position.set(th.sunDir[0], th.sunDir[1], th.sunDir[2]).normalize().multiplyScalar(120);
    if (this.opts.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const s = Math.min(R * 0.9, 110);
      sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
      sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
      sun.shadow.camera.far = 400;
      sun.shadow.bias = -0.0015;
      this.sun = sun;
    }
    scene.add(sun);
    this.hemi = hemi;
    this.sunLight = sun;

    // ── sky dome ──
    this.sky = makeSkyDome(th, R);
    scene.add(this.sky);
    this.stars = makeStars(th, rng, R);
    if (this.stars) scene.add(this.stars);
    this.bodies = makeSkyBodies(th, rng, R, this.spec.act);
    scene.add(this.bodies);

    // ── ground ──
    const roads = makeRoads(rng, R, this.spec.roads || 'normal');
    this.roads = roads;
    const segs = 96;
    const geo = new THREE.CircleGeometry(R * 1.02, segs, 0, TAU);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, domeY(x, z));
    }
    geo.computeVertexNormals();
    const tex = groundTexture(th, rng, R * 1.02, roads, this.opts.lowTex ? 512 : 1024);
    this.groundTex = tex;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.receiveShadow = !!this.opts.shadows;
    this.ground.renderOrder = -1;
    scene.add(this.ground);

    // rim: terrain falling away past the play area
    const rimGeo = new THREE.RingGeometry(R * 1.01, R * 2.4, 72, 6);
    rimGeo.rotateX(-Math.PI / 2);
    const rp = rimGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i), z = rp.getZ(i);
      const d = Math.hypot(x, z);
      const over = Math.max(0, d - R);
      rp.setY(i, domeY(x, z) - over * over * 0.012);
    }
    rimGeo.computeVertexNormals();
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshLambertMaterial({ color: th.groundAlt }));
    rim.renderOrder = -1;
    scene.add(rim);
    this.rim = rim;

    // ── props ──
    this._placeProps();
  }

  _placeProps() {
    const rng = this.rng, R = this.R, spec = this.spec;
    const act = spec.act | 0;
    const area = Math.PI * R * R;
    const coverage = WORLD.COVERAGE * (spec.density || 1);
    let budget = Math.round((area * coverage) / this.meanArea);
    budget = Math.min(budget, this.opts.maxProps || WORLD.MAX_PROPS);

    const avail = PROP_DEFS.filter((d) => d.acts.includes(act));
    const byTier = {};
    for (const d of avail) (byTier[d.tier] ||= []).push(d);

    const maxTier = this.maxTier;
    const mix = this.mix;
    const plan = [];
    let wsum = 0;
    for (let t = 1; t <= maxTier; t++) if (byTier[t]) wsum += mix[t] || 0;
    for (let t = 1; t <= maxTier; t++) {
      if (!byTier[t]) continue;
      const n = Math.max(1, Math.round(budget * ((mix[t] || 0) / wsum)));
      for (let i = 0; i < n; i++) plan.push(t);
    }
    // Biggest first: towers get first refusal on the space they need, instead
    // of arriving last to a floor already covered in bins.
    plan.sort((a, b) => b - a);

    // choose kinds first so we know instance capacities up front
    const picks = [];
    const counts = {};
    const VARIANTS = this.opts.variants || 3;
    for (const t of plan) {
      const def = rng.weighted(byTier[t].map((d) => [d, d.weight]));
      const vi = rng.int(0, VARIANTS - 1);
      picks.push({ def, vi });
      (counts[def.kind] ||= new Array(VARIANTS).fill(0))[vi]++;
    }
    const lmCount = spec.landmarks == null ? (act >= 1 ? 1 : 0) : spec.landmarks;

    const kinds = Object.keys(counts);
    const protos = buildProtos(this.th, spec.seed ^ 0x9e37, kinds, VARIANTS, this.opts.lowTex);
    if (lmCount > 0) {
      protos.__landmark = [buildLandmark(this.themeKey, this.th, spec.seed ^ 0x5150)];
      counts.__landmark = [lmCount];
      DEF_BY_KIND.__landmark = { kind: '__landmark', tier: 8, weight: 0, acts: [] };
    }
    this.field = new PropField(this.scene, protos, counts, this.opts);
    this.protos = protos;

    // landmarks go first, near the middle
    for (let i = 0; i < lmCount; i++) {
      const a = rng() * TAU, d = i === 0 ? rng.range(0, R * 0.12) : rng.range(R * 0.2, R * 0.45);
      this._add('__landmark', 0, Math.cos(a) * d, Math.sin(a) * d, rng() * TAU, 8, 1, null);
    }

    for (const { def, vi } of picks) {
      const t = def.tier;
      const rad = tierRadius(t);
      let placed = false;
      // Big things skew downtown, small things skew to the rim — but only a
      // skew. Confining towers to a small central disc used to make them
      // unplaceable, and they silently disappeared from the sector.
      const mean = 1 - ((t - 1) / 7) * 0.42;
      for (let tries = 0; tries < 40 && !placed; tries++) {
        let x, z, rot = rng() * TAU;
        if (def.mover === 'drive') {
          const p = pointOnRoad(rng, this.roads, R);
          x = p.x + Math.cos(p.dir + Math.PI / 2) * rng.range(-1.6, 1.6);
          z = p.z + Math.sin(p.dir + Math.PI / 2) * rng.range(-1.6, 1.6);
          rot = -p.dir;
        } else {
          // widen the search band the longer we fail to find a home
          const slack = 1 + tries * 0.02;
          const target = R * clamp(mean * rng.range(0.42 / slack, 1.32 * slack), 0.04, 0.96);
          const a = rng() * TAU;
          x = Math.cos(a) * target; z = Math.sin(a) * target;
          if (Math.hypot(x, z) > R * 0.96) continue;
          if (!def.mover && distToRoads(x, z, this.roads) < WORLD.ROAD_W * 0.55 + rad) continue;
        }
        if (this._overlaps(x, z, rad * 1.1)) continue;
        const scale = rng.range(0.86, 1.16);
        this._add(def.kind, vi, x, z, rot, t, scale, def.mover);
        placed = true;
      }
    }
    this.field.finalize();
    this.totalMass = this.props.reduce((s, p) => s + p.value, 0);
    this.totalArea = this.props.reduce((s, p) => s + p.area, 0);
  }

  _overlaps(x, z, r) {
    let hit = false;
    this.grid.query(x, z, r + 16, (p) => {
      if (hit || p.dead) return;
      const dx = p.x - x, dz = p.z - z;
      const rr = p.r + r;
      if (dx * dx + dz * dz < rr * rr) hit = true;
    });
    return hit;
  }

  _add(kind, vi, x, z, rot, tier, scale, mover) {
    const slot = this.field.alloc(kind, vi);
    if (slot < 0) return null;
    const proto = this.protos[kind][vi];
    const p = {
      kind, vi, slot, x, z, y: domeY(x, z), rot, tier,
      r: tierRadius(tier) * scale,
      h: proto.height * scale,
      value: TIER_VALUE[tier] * scale * scale,
      area: Math.pow(tierRadius(tier) * scale, 2),
      scale, baseScale: scale,
      mover: mover || null,
      vx: 0, vz: 0, state: 0, sinkT: 0,
      tiltAmt: 0, tiltDir: 0, shake: 0,
      dead: false, shielded: false,
    };
    this.props.push(p);
    this.grid.insert(p);
    this.field.write(p);
    if (mover) {
      p.speed = mover === 'drive' ? 5.5 + Math.random() * 4 : mover === 'hover' ? 3 + Math.random() * 3 : 1.6 + Math.random() * 1.4;
      p.dir = -rot;
      p.bobT = Math.random() * TAU;
      p.baseY = p.y + (mover === 'hover' ? 2.5 + Math.random() * 3 : 0);
      p.y = p.baseY;
      this.movers.push(p);
    }
    if (tier === 8) this.landmarks.push(p);
    return p;
  }

  /** Remove a prop from play (swallowed). */
  kill(p) {
    if (p.dead) return;
    p.dead = true;
    this.eatenMass += p.value;
    this.eatenArea += p.area;
    this.grid.remove(p);
    this.field.hide(p);
  }

  clearPct() { return this.totalArea ? this.eatenArea / this.totalArea : 0; }

  /** Mass still on the ground that the given radius could actually take. */
  edibleMassFor(radius) {
    let m = 0;
    for (const p of this.props) if (!p.dead && TIER_R[p.tier] <= radius) m += p.value;
    return m;
  }

  updateMovers(dt, holes) {
    const R = this.R;
    for (const p of this.movers) {
      if (p.dead || p.state >= 2) continue;
      // flee the nearest hole that could eat us
      let fx = 0, fz = 0, panic = 0;
      for (const h of holes) {
        if (!h.alive) continue;
        const dx = p.x - h.x, dz = p.z - h.z;
        const d = Math.hypot(dx, dz) || 1;
        const range = h.radius * 5.5;
        if (d < range) {
          const w = (1 - d / range);
          fx += (dx / d) * w; fz += (dz / d) * w;
          panic = Math.max(panic, w);
        }
      }
      let sp = p.speed;
      if (panic > 0.02) {
        const a = Math.atan2(fz, fx);
        p.dir = a;
        sp = p.speed * (1 + panic * 1.9);
        p.fleeing = true;
      } else if (p.fleeing) {
        p.fleeing = false;
      }
      if (p.mover === 'walk' && !p.fleeing) {
        p.wanderT = (p.wanderT || 0) - dt;
        if (p.wanderT <= 0) { p.wanderT = 1.5 + Math.random() * 2.5; p.dir += (Math.random() - 0.5) * 2.2; }
      }
      p.x += Math.cos(p.dir) * sp * dt;
      p.z += Math.sin(p.dir) * sp * dt;
      const d = Math.hypot(p.x, p.z);
      if (d > R * 0.97) {
        p.x = (p.x / d) * R * 0.97; p.z = (p.z / d) * R * 0.97;
        p.dir += Math.PI * (0.7 + Math.random() * 0.6);
      }
      p.rot = -p.dir + (p.mover === 'drive' ? 0 : 0);
      if (p.mover === 'hover') {
        p.bobT += dt * 2.2;
        p.y = domeY(p.x, p.z) + (p.baseY - domeY(0, 0)) + Math.sin(p.bobT) * 0.35;
      } else {
        p.y = domeY(p.x, p.z);
        if (p.mover === 'walk') { p.bobT += dt * 7; p.y += Math.abs(Math.sin(p.bobT)) * 0.14; }
      }
      this.grid.remove(p); this.grid.insert(p);
      this.field.write(p);
    }
  }

  dispose() {
    if (this.field) this.field.dispose();
    this.scene.remove(this.ground, this.rim, this.sky, this.bodies, this.hemi, this.sunLight);
    if (this.stars) this.scene.remove(this.stars);
    this.ground.geometry.dispose(); this.ground.material.dispose();
    this.rim.geometry.dispose(); this.rim.material.dispose();
    if (this.groundTex) this.groundTex.dispose();
    this.scene.fog = null;
  }
}

// ── backdrop ────────────────────────────────────────────────────────────────

function makeSkyDome(th, R) {
  const geo = new THREE.SphereGeometry(Math.max(700, R * 6), 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(th.sky[0]) },
      bot: { value: new THREE.Color(th.sky[1]) },
    },
    vertexShader: `varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bot; varying float vY;
      void main(){ float t = clamp(vY*0.5+0.5, 0.0, 1.0); vec3 c = mix(bot, top, pow(t, 0.75)); gl_FragColor = vec4(c,1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -1000;
  m.frustumCulled = false;
  return m;
}

function makeStars(th, rng, R) {
  const n = Math.round(900 * th.star);
  if (n < 20) return null;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const D = Math.max(600, R * 5);
  for (let i = 0; i < n; i++) {
    let x, y, z, l;
    do { x = rng() * 2 - 1; y = rng() * 2 - 1; z = rng() * 2 - 1; l = Math.hypot(x, y, z); } while (l > 1 || l < 0.001);
    y = Math.abs(y) * 0.9 + 0.06;
    const s = D / Math.hypot(x, y, z);
    pos[i * 3] = x * s; pos[i * 3 + 1] = y * s; pos[i * 3 + 2] = z * s;
    const b = 0.5 + rng() * 0.5;
    col[i * 3] = b; col[i * 3 + 1] = b * (0.9 + rng() * 0.1); col[i * 3 + 2] = b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: D * 0.006, vertexColors: true, sizeAttenuation: true, fog: false, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.renderOrder = -999;
  p.frustumCulled = false;
  return p;
}

/** Distant planets and, from act 3, the Guild fleet hanging in the sky. */
function makeSkyBodies(th, rng, R, act) {
  const g = new THREE.Group();
  g.renderOrder = -998;
  const D = Math.max(520, R * 4.2);
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, el = rng.range(0.14, 0.6);
    const size = D * rng.range(0.035, 0.12);
    const col = new THREE.Color().setHSL(rng(), 0.4, rng.range(0.35, 0.65));
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(size, 18, 12),
      new THREE.MeshBasicMaterial({ color: col, fog: false })
    );
    m.position.set(Math.cos(a) * D * Math.cos(el), D * Math.sin(el), Math.sin(a) * D * Math.cos(el));
    g.add(m);
    if (rng.chance(0.4)) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(size * 1.4, size * 2.2, 40),
        new THREE.MeshBasicMaterial({ color: col.clone().offsetHSL(0.1, 0, 0.15), side: THREE.DoubleSide, transparent: true, opacity: 0.55, fog: false })
      );
      ring.position.copy(m.position);
      ring.rotation.set(rng.range(0.8, 1.4), rng() * TAU, 0);
      g.add(ring);
    }
  }
  if (act >= 2) {
    // guild dreadnoughts on the horizon
    const cnt = act >= 4 ? 5 : 2;
    for (let i = 0; i < cnt; i++) {
      const a = rng() * TAU;
      const dd = D * 0.55;
      const s = D * 0.02;
      const sh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(s, s * 5, 6), new THREE.MeshBasicMaterial({ color: 0x22242e, fog: false }));
      body.rotation.z = Math.PI / 2;
      sh.add(body);
      const gl = new THREE.Mesh(new THREE.SphereGeometry(s * 0.4, 8, 6), new THREE.MeshBasicMaterial({ color: th.accent, fog: false }));
      gl.position.x = -s * 2.4;
      sh.add(gl);
      sh.position.set(Math.cos(a) * dd, D * rng.range(0.08, 0.2), Math.sin(a) * dd);
      sh.rotation.y = rng() * TAU;
      g.add(sh);
    }
  }
  g.frustumCulled = false;
  return g;
}
