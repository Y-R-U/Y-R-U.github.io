// Splash columns and shell hits — C4. The shell itself is round.js (C6).
//
// Two things the plates make non-negotiable and they are what most of this file is for.
//
// A splash column is TRANSLUCENT. In 2853730_08 the fort wall and a flag read straight through the
// upper two thirds of the column; only the dense root is opaque. A solid white cone is the single
// loudest tell, and the second is a bright plume floating over undisturbed water — the plate's
// column stands in a broken foam ring with the water inside it darkened.
//
// A hit LIGHTS things: the plating around it, the smoke it is making, and the sea. Smoke is
// MeshBasic, so no PointLight can ever reach it and the warm term is computed here, from the
// fireball's centre — that is C3's fix and it is the most repeated finding on this project.

import * as THREE from 'three';
import { registerEmitter } from './index.js';
import { defineScenario, frameCamera } from '../../scenarios.js';
import { seaCamera } from '../ocean.js';
import { VFX } from '../../config.js';
import { rng, clamp, smoothstep, fields } from '../textures/noise.js';
import { track } from '../../engine/budget.js';
import {
  WaterPatch, pumpCards, pumpSea, seaSource, dropSeaSource, sunDir, seaHeight, apronTexture,
  sprayField, smokeField, hotField, ringTexture, vfxScene, dbg, useCtx, setImpactPhase, setFirePhase, impactPin, impactSpread,
  warmSource, dropWarmSource,
} from './field.js';

export { setImpactPhase, setFirePhase, vfxScene } from './field.js';

const COLUMN_M = 15;      // metres of column at size 1, before VFX[size].scale
const FIREBALL_M = 6.4;   // metres of fireball radius at size 1
const G = 15.5;           // splash gravity: real water decelerates under drag as well as gravity,
                          // and 9.81 alone gives a 39 m column a 5.6 s hang that reads as slow motion

let order = 0;

export function resetImpactOrder() { order = 0; }

function resolve(size) {
  const o = typeof size === 'object' && size !== null ? size : { size };
  const cfg = VFX[o.size] ?? VFX[1];
  return [cfg, o];
}

// `at` poses this one effect; otherwise the shared pin does, staggered by emission order so a
// salvo is never four identical splashes. Unpinned, it runs on the clock.
function phaseOf(o, ord, t, dt) {
  if (o.at != null) return o.at;
  const p = impactPin();
  return p != null ? Math.max(0.004, p - ord * impactSpread()) : t + dt;
}

const posed = o => o.at != null || impactPin() != null;

// ── the column body ─────────────────────────────────────────────────────────────────────────
// Cards alone cannot hold the dense root of a splash: forty soft quads integrate into a smooth
// lozenge and the eye counts them. This is a real ragged tube, faded by |N·V| so its silhouette
// dissolves instead of drawing a mesh edge — the same trick C3's flame body uses, at a gentler
// exponent because a water column should keep a visible edge where a flame should not.

let columnGeo = null;
let columnMat = null;
const columns = [];

function columnTexture() {
  const W = 64, H = 96;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const f = fields();
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H;                        // 0 at the waterline, 1 at the crown
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      // sampled with v stretched so the features run up the column as torn vertical sheets
      const n = f.coarse.at(u * 2, v * 0.55 + 0.2);
      const m = f.warp.at(u * 4 + 0.3, v * 1.1 + 0.7);
      const a = clamp(Math.pow(1 - v, 0.75) * (0.30 + 1.15 * n) * (0.55 + 0.75 * m), 0, 1)
        // the bottom fade is long on purpose: the tube's lower rings sit under the water and the
        // sea cuts them, and a hard alpha there draws a stair-stepped ellipse round the base that
        // is the loudest thing in the frame at 4x
        // the top ramp runs out well before the geometry does: the tube's last ring is a closed
        // polygon and any alpha left on it draws a straight rim across the spray behind it
        * smoothstep(0.90, 0.24, v) * smoothstep(-0.04, 0.44, v);
      const lit = 0.72 + 0.28 * (1 - v);
      const i = (y * W + x) * 4;
      img.data[i] = 250 * lit; img.data[i + 1] = 253 * lit; img.data[i + 2] = 255 * lit;
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return track(t, { w: W, h: H, fmt: 'rgba', mips: true, label: 'vfx:column' });
}

function buildColumnGeo() {
  const NA = 24, NH = 18;
  const pos = [], nor = [], uv = [], idx = [];
  const f = fields();
  for (let h = 0; h <= NH; h++) {
    const v = h / NH;
    // wide at the root, narrowing through the body, opening out again as the crown breaks up
    const prof = 0.34 + 0.66 * Math.pow(1 - v, 1.7) + 0.16 * smoothstep(0.55, 1.0, v);
    for (let a = 0; a <= NA; a++) {
      const th = (a / NA) * Math.PI * 2;
      // per-angle raggedness, so the silhouette is never a lathe's clean revolution
      const rag = (0.55 + 0.90 * f.coarse.at((a % NA) / NA * 2, v * 0.8 + 0.11))
        * (0.82 + 0.36 * f.fine.at((a % NA) / NA * 3, v * 1.7 + 0.4));
      const r = prof * rag;
      pos.push(Math.cos(th) * r, v, Math.sin(th) * r);
      nor.push(Math.cos(th), 0.18, Math.sin(th));
      uv.push((a / NA) * 2, v);
    }
  }
  for (let h = 0; h < NH; h++) {
    for (let a = 0; a < NA; a++) {
      const i0 = h * (NA + 1) + a, i1 = i0 + 1, i2 = i0 + NA + 1, i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// A translucent shell drawn flat is a bottle: its alpha is highest exactly at the silhouette and
// the eye reads a hard rim. Fading by |N·V| inverts that, so the body is densest where a ray passes
// through the most of it and dissolves at the edge.
function columnShade(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNv;\nvarying vec3 vVv;')
      .replace('#include <project_vertex>', `
        vNv = normalize( normalMatrix * normal );
        #include <project_vertex>
        vVv = normalize( -mvPosition.xyz );`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNv;\nvarying vec3 vVv;')
      .replace('#include <opaque_fragment>',
        'float dk = pow( abs( dot( normalize( vNv ), normalize( vVv ) ) ), 4.2 );\n'
        + 'gl_FragColor = vec4( outgoingLight, diffuseColor.a * dk );');
  };
  mat.customProgramCacheKey = () => 'waterlineSplashColumn';
  return mat;
}

function takeColumn(ctx) {
  if (!columnGeo) {
    columnGeo = buildColumnGeo();
    columnMat = columnShade(new THREE.MeshBasicMaterial({
      map: columnTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide,
      fog: true, toneMapped: true, opacity: 1, forceSinglePass: true,
    }));
  }
  let m = columns.find(c => !c.userData.busy);
  if (!m) {
    if (columns.length >= 3) m = columns[0];
    else { m = new THREE.Mesh(columnGeo, columnMat.clone()); m.frustumCulled = false; m.renderOrder = 2; ctx.root.add(m); columns.push(m); }
  }
  m.userData.busy = true;
  m.visible = true;
  return m;
}

function freeColumn(m) { if (m) { m.userData.busy = false; m.visible = false; } }

let apronMat = null;
const aprons = [];
function takeApron(ctx) {
  if (!apronMat) {
    apronMat = new THREE.MeshBasicMaterial({
      map: apronTexture(), transparent: true, depthWrite: false, depthTest: false, opacity: 1,
      side: THREE.DoubleSide, fog: true, toneMapped: true, forceSinglePass: true,
    });
  }
  let p = aprons.find(a => !a.busy);
  if (!p) {
    if (aprons.length >= 3) p = aprons[0];
    else { p = new WaterPatch(apronMat.clone(), { rings: 13, seg: 46, root: ctx.root }); aprons.push(p); }
  }
  p.busy = true;
  return p;
}

function freeApron(p) { if (p) { p.busy = false; p.hide(); } }

// The wave the impact sends out. The apron is the disturbed patch the column stands in; this is the
// thing that leaves it, and without it a column at 300 m meets the sea with nothing happening at
// the intersection at all.
let ringMat = null;
const rings = [];
function takeRing(ctx) {
  if (!ringMat) {
    ringMat = new THREE.MeshBasicMaterial({
      map: ringTexture(), transparent: true, depthWrite: false, depthTest: false, opacity: 1,
      side: THREE.DoubleSide, fog: true, toneMapped: true, forceSinglePass: true,
    });
  }
  let p = rings.find(a => !a.busy);
  if (!p) {
    if (rings.length >= 3) p = rings[0];
    else { p = new WaterPatch(ringMat.clone(), { rings: 10, seg: 40, root: ctx.root }); rings.push(p); }
  }
  p.busy = true;
  return p;
}

function freeRing(p) { if (p) { p.busy = false; p.hide(); } }

// ── splash ──────────────────────────────────────────────────────────────────────────────────

const V3 = new THREE.Vector3();
const ZERO = new THREE.Vector3();
let shots = 0;

registerEmitter('splash', (ctx, pos, size = 9) => {
  useCtx(ctx);
  const [cfg, o] = resolve(size);
  const H = (o.height ?? COLUMN_M) * cfg.scale;
  const R = H * 0.135;
  const V = Math.sqrt(2 * G * H);
  const LIFE = 1.1 + H / 11;
  const ord = order++;
  const r = rng(o.seed ?? (7717 + (shots++ % 64) * 131));
  const sun = sunDir().clone();
  const sunH = new THREE.Vector3(sun.x, 0, sun.z).normalize();

  const field = sprayField(ctx.root);
  const puffs = [];

  // The jet keeps throwing for EJECT seconds rather than launching everything at t=0, and that one
  // choice is what fills the column. Fire it all at once and every card is ballistic from the same
  // instant, so by the time the plume is tall the bottom 15 m of it is empty and only a mesh can
  // stand there — which is exactly what the first render looked like: a traffic cone.
  const EJECT = 0.55;
  const N = Math.round(58 * cfg.cards);
  for (let i = 0; i < N; i++) {
    const s = field.take();
    if (!s) break;
    const f = i / N;
    const rr = Math.pow(r(), 0.55);
    const a = r() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    puffs.push({
      s, dir, rr,
      off: dir.clone().multiplyScalar(R * rr * 0.55).setY(R * 0.2 * r()),
      // the core throws highest and the skirt throws widest; that ratio is the whole silhouette
      vy: V * (0.26 + 0.74 * (1 - rr)) * (0.72 + 0.42 * r()),
      vout: R * (0.30 + 2.0 * rr) * (0.4 + 0.8 * r()),
      // A shell splash is a narrow stem that opens out above about 60% of its height. Spreading
      // every card linearly in time gives a debris cone — widest at the bottom, which is the
      // opposite profile and reads as an explosion in the water rather than a column of it.
      f0: 0.13 + 0.10 * r(), fk: 1.4 + 0.9 * r(),
      sx: R * (0.22 + 0.62 * r()) * (1 + rr * 0.5),
      ar: 1.15 + 0.85 * r(),                    // taller than wide: a torn sheet, not a disc
      grow: R * (0.60 + 0.70 * r()),
      alpha: 0.42 + 0.44 * (1 - rr) * (0.7 + 0.6 * r()),
      dur: 2.3 + 1.5 * r(),
      born: EJECT * Math.pow(f, 0.85) * (0.55 + 0.85 * r()),
      rot: (r() - 0.5) * 1.5,
      jit: new THREE.Vector3((r() - 0.5) * R * 0.9, 0, (r() - 0.5) * R * 0.9),
    });
  }

  // The crown: the low, wide, dense skirt the impact throws sideways before the column is up. It is
  // the brightest water in the plate and the reason the base does not read as a plume floating.
  // MANY SMALL cards, not a few big ones — a card centred near the waterline extends below it and
  // the sea depth-clips it along its own triangle edges, so one 19 m card is a hard-edged polygon
  // and twenty 4 m ones are foam.
  const crown = [];
  for (let i = 0; i < Math.round(22 * cfg.cards); i++) {
    const s = field.take();
    if (!s) break;
    const a = r() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    crown.push({
      s, dir, rr: 1,
      off: dir.clone().multiplyScalar(R * (0.5 + 0.5 * r())).setY(R * (0.3 + 0.45 * r())),
      vy: V * (0.10 + 0.16 * r()),
      vout: R * (2.2 + 3.0 * r()),
      f0: 1, fk: 0,                             // the crown IS the flare; it does not gate on height
      sx: R * (0.16 + 0.34 * r()),
      ar: 0.75 + 0.4 * r(),
      grow: R * (0.8 + 0.8 * r()),
      alpha: 0.62 + 0.30 * r(),
      dur: 1.6 + 1.0 * r(),
      born: 0.02 * i,
      rot: (r() - 0.5) * 1.8,
      jit: new THREE.Vector3((r() - 0.5) * R * 0.6, 0, (r() - 0.5) * R * 0.6),
    });
  }

  // a veil: a handful of very large, very faint cards over the whole column. The jet is a swarm of
  // small cards and a swarm has gaps between its members; the veil is the mist that fills them, and
  // it is what stops the mid-height of the column reading as an hourglass.
  const veil = [];
  for (let i = 0; i < Math.round(9 * cfg.cards); i++) {
    const s = field.take();
    if (!s) break;
    const a = r() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    veil.push({
      s, dir, rr: 0.35,
      // high enough that a 20 m card never straddles the waterline
      off: dir.clone().multiplyScalar(R * 0.4 * r()).setY(H * (0.30 + 0.14 * r())),
      vy: V * (0.30 + 0.26 * r()),
      vout: R * (0.3 + 0.5 * r()),
      f0: 0.25, fk: 1.5,
      sx: R * (0.70 + 0.85 * r()),
      ar: 1.35 + 0.5 * r(),
      grow: R * (0.4 + 0.4 * r()),
      alpha: 0.10 + 0.07 * r(),
      dur: 3.4,
      born: 0.10 + 0.45 * r(),
      rot: (r() - 0.5) * 1.2,
      jit: new THREE.Vector3((r() - 0.5) * R * 0.5, 0, (r() - 0.5) * R * 0.5),
    });
  }

  // Ejecta: water torn clear of the mass, arcing on its own. This is the population a 4× crop looks
  // for first — without it the column is one uniformly feathered grey mass and reads as vapour.
  // They must LEAVE the silhouette, so their throw is faster than the jet's and they are not gated
  // by the flare.
  const drops = [];
  for (let i = 0; i < Math.round(30 * cfg.cards); i++) {
    const s = field.take();
    if (!s) break;
    const a = r() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const big = Math.pow(r(), 2.2);              // a few fat lumps among many fine specks
    drops.push({
      s, dir, rr: 0.5,
      off: dir.clone().multiplyScalar(R * (0.2 + 0.8 * r())).setY(R * (0.3 + 1.4 * r())),
      vy: V * (0.34 + 0.62 * r()),
      vout: R * (0.45 + 1.35 * r()) * (0.35 + 0.85 * r()),
      f0: 1, fk: 0,
      sx: R * (0.035 + 0.055 * r() + 0.16 * big),
      ar: 1.6 + 3.4 * r(),
      grow: R * 0.045,
      alpha: 0.62 + 0.38 * r(),
      dur: 3.2,
      born: 0.16 * r(),
      rot: (r() - 0.5) * 0.7,
      jit: ZERO,
    });
  }

  const column = takeColumn(ctx);
  const apron = takeApron(ctx);
  const ring = takeRing(ctx);
  const y0 = seaHeight(pos.x, pos.z);
  const wash = o.sea === false ? null : seaSource();
  if (wash) { wash.colour = '#b9d2e0'; wash.radius = H * 1.15; }
  const col = new THREE.Color();
  let t = 0;

  const shape = () => {
    const k = clamp(t / LIFE, 0, 1);
    // the root: a dense body only where the jet is still solid water. Above that the cards own it —
    // a mesh tall enough to be the whole column reads as a moulded cone whatever is drawn on it.
    const climb = clamp(t / 0.30, 0, 1);
    const rootH = H * 0.34 * (climb - 0.7 * Math.pow(smoothstep(0.30, 1.0, k), 2));

    column.position.set(pos.x, y0 + 0.8, pos.z);
    // narrow: the root of a shell splash is a stem. At 1.25·R it was the widest part of the column
    // and the whole thing read as a traffic cone.
    const cw = R * (0.72 + 0.34 * k);
    column.scale.set(cw, Math.max(0.5, rootH), cw);
    column.rotation.y = 0.9 + ord;
    const cf = smoothstep(0, 0.08, t) * (1 - smoothstep(0.34, 0.9, k));
    column.material.opacity = 0.44 * cf * dbg.col;
    // must match the spray cards' 1.52–1.62. At 1.32 the mesh was DARKER than the cards it covers,
    // so its low-poly silhouette stamped a dark polygon across the base of every column.
    column.material.color.setScalar(1.58);
    column.visible = cf > 0.01 && rootH > 0.5;

    apron.set(pos.x, pos.z, R * (1.6 + 2.4 * Math.pow(k, 0.45)), 0.75);
    apron.mesh.material.opacity = 0.34 * dbg.apron * smoothstep(0, 0.05, t) * (1 - smoothstep(0.6, 1.0, k));

    // a real celerity: shallow-water waves run at sqrt(g·h), so the ring travels at a constant
    // speed and thins as its circumference grows, rather than easing out on a curve
    const rr = R * 1.1 + Math.sqrt(9.81 * H * 0.06) * t;
    ring.set(pos.x, pos.z, rr, 0.8);
    ring.mesh.material.opacity = 0.26 * dbg.apron * smoothstep(0, 0.07, t)
      * (1 - smoothstep(0.35, 1.05, k)) * Math.min(1, (R * 2.2) / rr);

    // 20 m of aerated white water lights the sea it stands in. Without this the wave under the
    // column is the same value as the wave 40 m away and the column reads as pasted on.
    if (wash) {
      // well above the surface: the ocean's sea-light term is max(dot(N,L),0), and a source sitting
      // at y=2 makes L near-horizontal, so the terminator lands on the wave mesh as a straight edge
      wash.pos.set(pos.x, y0 + H * 0.3, pos.z);
      wash.intensity = 0.42 * smoothstep(0, 0.12, t) * (1 - smoothstep(0.45, 0.95, k));
    }

    for (const p of [veil, puffs, crown, drops]) {
      for (const c of p) {
        const age = Math.max(0, t - c.born);
        const y = c.off.y + c.vy * age - 0.5 * G * age * age;
        const hf = clamp(y / H, 0, 1.3);
        const flare = c.f0 + c.fk * smoothstep(0.34, 1.05, hf);
        const rad = c.vout * age * (1 - 0.35 * clamp(age / c.dur, 0, 1)) * flare;
        c.s.pos.set(pos.x + c.off.x + c.jit.x + c.dir.x * rad, y0 + Math.max(-R * 0.4, y),
          pos.z + c.off.z + c.jit.z + c.dir.z * rad);
        const sx = (c.sx + c.grow * age) * (1 + 0.55 * smoothstep(0.4, 1.1, hf));
        c.s.sx = sx;
        c.s.sy = sx * c.ar;
        c.s.rot = c.rot;
        // three terms of shading, and the point of all three is that a splash is not one white:
        // the sun side of the mass is bright, the inside of the mass is shadowed by the water in
        // front of it, and the thin stuff up top takes its colour from the sky behind it
        const lit = 0.66 + 0.34 * c.dir.dot(sunH);
        const depth = 1 - 0.26 * (1 - c.rr) * (1 - clamp(y / (H * 0.6), 0, 1));
        const l = lit * depth;
        // over 1.0 on purpose: ACES at this grade's exposure maps a colour of 1 to about the same
        // luminance as the overcast sky, and spray that is not brighter than the sky reads as smoke
        col.setRGB(1.52 * l, 1.56 * l, 1.62 * l);
        c.s.colour.copy(col);
        // spray thins as it spreads and as it climbs, and what has fallen back is already foam
        const spread = Math.pow(clamp(1 - age / c.dur, 0, 1), 0.55);
        const fall = y < R * 0.2 && age > 0.35 ? 0.45 : 1;
        const thin = 1 - 0.38 * Math.pow(clamp(y / (H * 0.9), 0, 1), 1.3);
        c.s.alpha = dbg.spray * c.alpha * thin * fall * spread * smoothstep(0, 0.06, age)
          * (1 - smoothstep(0.55, 1.0, k)) * (age > 0 ? 1 : 0);
      }
    }
  };

  shape();

  return ctx.add({
    update(dt) {
      t = phaseOf(o, ord, t, dt);
      shape();
      pumpCards(ctx.app.camera);
      pumpSea();
      return posed(o) || t < LIFE;
    },
    kill() {
      for (const c of puffs) field.give(c.s);
      for (const c of crown) field.give(c.s);
      for (const c of veil) field.give(c.s);
      for (const c of drops) field.give(c.s);
      freeColumn(column);
      freeApron(apron);
      freeRing(ring);
      if (wash) { wash.intensity = 0; dropSeaSource(wash); pumpSea(); }
    },
  });
});

// ── hit ─────────────────────────────────────────────────────────────────────────────────────

registerEmitter('hit', (ctx, pos, size = 9) => {
  useCtx(ctx);
  const [cfg, o] = resolve(size);
  const R = FIREBALL_M * cfg.scale;
  const LIFE = o.seconds ?? 6.0;
  const ord = order++;
  const r = rng(o.seed ?? (3313 + (shots++ % 64) * 97));
  const out = (o.out ? V3.copy(o.out) : V3.set(0, 0, 1)).clone().normalize();
  const side = new THREE.Vector3(-out.z, 0, out.x).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const wind = o.wind ? new THREE.Vector3(o.wind[0], 0, o.wind[1]) : new THREE.Vector3(-3.5, 0, 1.4);

  const hotF = hotField(ctx.root);
  const smokeF = smokeField(ctx.root);

  const balls = [], embers = [], puffs = [], debris = [];

  // the fireball as an outward shell rather than a filled blob: each card well under unit
  // brightness so the sum keeps its colour, largest and deepest-orange at the fringe, which is
  // what gives the cauliflower edge in the plates
  const NB = Math.round(15 * cfg.cards);
  for (let i = 0; i < NB; i++) {
    const s = hotF.take();
    if (!s) break;
    const f = i / NB;
    const a = r() * Math.PI * 2;
    const rad = R * (0.14 + Math.pow(f, 0.6) * 0.52) * (0.6 + 0.6 * r());
    // clear of the plating: centred on the hull surface, half the shell is inside the ship and
    // depth-culled, and what is left reads as a glow on the paint rather than as a fireball
    const off = out.clone().multiplyScalar(R * (0.45 + 0.55 * r()))
      .addScaledVector(side, Math.cos(a) * rad)
      .addScaledVector(up, Math.sin(a) * rad * 0.92 + R * 0.25);
    const heat = Math.pow(1 - f, 1.05) * (0.65 + 0.5 * r());
    const b = 0.10 + heat * 1.30;
    balls.push({
      s, off,
      vel: off.clone().normalize().multiplyScalar(R * (0.55 + 1.1 * r())).addScaledVector(up, R * 0.35),
      s0: R * (0.22 + f * 0.56 + 0.18 * r()), grow: R * (0.5 + 0.65 * r()), ar: 0.68 + 0.62 * r(),
      // green held to ~0.35·red and blue to ~0.15: see the ceiling note in field.js's flameTexture
      col: new THREE.Color().setRGB(b, b * (0.15 + heat * 0.32), b * (0.004 + heat * 0.15)),
      fade: 0.34 + f * 0.60 + 0.14 * r(), born: f * 0.035,
      rot: (r() - 0.5) * 2.4,
    });
  }

  for (let i = 0; i < Math.round(10 * cfg.cards); i++) {
    const s = hotF.take();
    if (!s) break;
    const d = out.clone().multiplyScalar(0.5 + r())
      .addScaledVector(side, (r() - 0.5) * 1.7).addScaledVector(up, 0.3 + r() * 1.4).normalize();
    embers.push({
      s, off: d.clone().multiplyScalar(R * (0.3 + 0.6 * r())),
      vel: d.multiplyScalar(R * (1.4 + 2.8 * r())), grav: -R * 1.2,
      s0: R * (0.012 + 0.018 * r()), grow: 0,
      col: new THREE.Color(0.40 + 0.2 * r(), 0.24, 0.09), fade: 0.7 + 1.1 * r(), born: 0.02 * r(),
    });
  }

  // dark smoke wrapped AROUND and behind the fireball, then rising into a column. The dark ring
  // hugging a bright centre is the shape that says "explosion" rather than "orange light".
  const NS = Math.round(28 * cfg.cards);
  for (let i = 0; i < NS; i++) {
    const s = smokeF.take();
    if (!s) break;
    const f = i / NS;
    const a = r() * Math.PI * 2;
    const rad = R * (0.45 + f * 0.9) * (0.5 + 0.9 * r());
    const off = out.clone().multiplyScalar(R * (-0.15 + f * 0.7))
      .addScaledVector(side, Math.cos(a) * rad)
      .addScaledVector(up, Math.sin(a) * rad * 0.8 + R * f * 1.5);
    const n = off.clone().normalize();
    const s0 = R * (0.30 + f * 0.62) * (0.45 + 1.05 * r());
    // Cards are camera-facing, so a group whose offsets differ only in `side` and `up` all sit at
    // the same depth — that is what draws five same-radius lobes along one horizontal line. The
    // jitter is scaled by the card's own size so it always breaks the plane it would have shared.
    off.set(off.x + (r() - 0.5) * s0 * 1.9, off.y + (r() - 0.5) * s0 * 1.5, off.z + (r() - 0.5) * s0 * 1.9);
    puffs.push({
      s, off, n,
      vel: n.clone().multiplyScalar(R * (0.22 + 0.4 * r())).addScaledVector(up, R * (0.35 + 0.9 * f)),
      s0, grow: R * (0.45 + 0.65 * r()),
      // born early and growing fast: at the age this shot is posed at, a slow smoke shell is still
      // a scatter of separate balls, and separate balls are countable
      dark: 0.048 + 0.050 * r(), fade: 3.0 + 3.6 * r(), born: 0.01 + f * 0.085,
      // wide but not full: the texture's baked ramp is the "lit from above" read, and a free roll
      // throws it away
      rot: (r() - 0.5) * 2.8, drift: 0.20 + 0.7 * f,
    });
  }

  for (let i = 0; i < Math.round(3 * cfg.cards); i++) {
    const s = smokeF.take();
    if (!s) break;
    const d = out.clone().multiplyScalar(0.4 + r())
      .addScaledVector(side, (r() - 0.5) * 2).addScaledVector(up, 0.4 + r()).normalize();
    debris.push({
      s, off: d.clone().multiplyScalar(R * 0.4), vel: d.multiplyScalar(R * (1.2 + 2.2 * r())),
      grav: -14, s0: R * (0.012 + 0.022 * r()), fade: 1.6 + r(), born: 0,
    });
  }

  const light = ctx.lights.acquire();
  light.color.set(0xffa552);
  // the cutoff is the shadow face: at R*11 one hit lit a whole 140 m hull to one value
  light.distance = o.lightRange ?? R * 4.5;
  // off the impact normal: on it, a hull plate running along that same plane takes the light at
  // grazing incidence and comes back stone cold next to a white core
  light.position.copy(pos).addScaledVector(out, R * 0.35).addScaledVector(up, R * 0.55);

  const source = o.sea === false ? null : seaSource();
  if (source) {
    source.colour = '#ff8c33';
    // The ocean's sea-light falls off as (r/(r+d))², which is a very fat tail: at r = 200 m the
    // term was still a third of its peak two hundred metres away and half the frame's water came
    // back the same orange. The pool has to end.
    source.radius = o.seaRadius ?? R * 2.6;
    source.pos.set(pos.x, R * 0.8, pos.z);
  }
  const warm = warmSource(R * 5);

  const ball = new THREE.Vector3();
  const w = new THREE.Vector3();
  const sun = sunDir();
  const col = new THREE.Color();
  const seaY = seaHeight(pos.x, pos.z);
  let t = 0;

  const shape = () => {
    const glow = Math.max(0, 1 - t / 0.45);
    ball.copy(pos).addScaledVector(up, R * 0.4);

    for (const c of balls) {
      const age = Math.max(0, t - c.born);
      const k = Math.max(0, 1 - age / c.fade);
      c.s.pos.copy(pos).add(c.off).addScaledVector(c.vel, age);
      const sc = c.s0 + c.grow * age;
      c.s.sx = sc; c.s.sy = sc * c.ar;
      c.s.rot = c.rot;
      c.s.colour.copy(c.col).multiplyScalar(k * k * dbg.hot * (age > 0 ? 1 : 0));
      c.s.alpha = k > 0 ? 1 : 0;
    }

    for (const c of embers) {
      const age = Math.max(0, t - c.born);
      const k = Math.max(0, 1 - age / c.fade);
      c.s.pos.copy(pos).add(c.off).addScaledVector(c.vel, age);
      c.s.pos.y += 0.5 * c.grav * age * age;
      c.s.sx = c.s.sy = c.s0;
      c.s.colour.copy(c.col).multiplyScalar(k * k * dbg.hot * (age > 0 ? 1 : 0));
      c.s.alpha = k > 0 ? 1 : 0;
    }

    for (const c of puffs) {
      const age = Math.max(0, t - c.born);
      const k = Math.max(0, 1 - age / c.fade);
      c.s.pos.copy(pos).add(c.off).addScaledVector(c.vel, age).addScaledVector(wind, age * c.drift);
      c.s.pos.y += age * age * 0.8;
      const sc = c.s0 + c.grow * age;
      c.s.sx = sc; c.s.sy = sc * 1.05;
      // A card whose quad crosses the sea is depth-clipped along the sea's own triangle edges and
      // comes back as a hard-sided black polygon lying flat on the water.
      const floorY = seaY + sc * 0.60;
      if (c.s.pos.y < floorY) c.s.pos.y = floorY;
      c.s.rot = c.rot;
      const top = clamp(0.5 + 0.5 * c.n.dot(sun), 0, 1);
      w.copy(c.s.pos).sub(ball);
      const dist = Math.max(R * 0.6, w.length());
      w.divideScalar(dist);
      const facing = Math.pow(clamp(-w.dot(c.n), 0, 1), 1.4);
      const l = c.dark * (0.8 + 1.9 * top);
      const warm = glow * 0.95 * facing * Math.min(1, (R * 0.95) / dist) ** 2;
      col.setRGB(l * 1.05 + warm, l * 0.92 + warm * 0.45, l * 0.85 + warm * 0.14);
      c.s.colour.copy(col);
      c.s.alpha = dbg.smoke * Math.min(0.66, k * 0.95) * smoothstep(0, 0.08, age) * (age > 0 ? 1 : 0);
    }

    for (const c of debris) {
      const age = Math.max(0, t - c.born);
      const k = Math.max(0, 1 - age / c.fade);
      c.s.pos.copy(pos).add(c.off).addScaledVector(c.vel, age);
      c.s.pos.y += 0.5 * c.grav * age * age;
      c.s.sx = c.s.sy = c.s0;
      c.s.colour.setRGB(0.03, 0.028, 0.026);
      c.s.alpha = k > 0 && c.s.pos.y > seaY + c.s0 * 0.6 ? 0.6 * k : 0;
    }

    light.intensity = 320 * cfg.light * Math.pow(glow, 1.5) * dbg.light;
    if (source) source.intensity = 0.62 * Math.pow(glow, 1.2);
    warm.pos.copy(ball);
    warm.intensity = 2.2 * Math.pow(glow, 1.2);
  };

  shape();

  return ctx.add({
    update(dt) {
      t = phaseOf(o, ord, t, dt);
      shape();
      pumpCards(ctx.app.camera);
      pumpSea();
      return posed(o) || t < LIFE;
    },
    kill() {
      for (const c of balls) hotF.give(c.s);
      for (const c of embers) hotF.give(c.s);
      for (const c of puffs) smokeF.give(c.s);
      for (const c of debris) smokeF.give(c.s);
      ctx.lights.release(light);
      dropWarmSource(warm);
      if (source) { source.intensity = 0; dropSeaSource(source); pumpSea(); }
    },
  });
});

// ── scored scenarios ────────────────────────────────────────────────────────────────────────

defineScenario({
  id: 'splash_miss',
  label: 'A shell falls short — splash column on a storm sea',
  ref: '2853730_08',
  setup(app) {
    const { fleet } = vfxScene(app, 'noon', {
      seaState: 3, shadow: 140, fog: [500, 5200],
      sky: { skyCover: 2.0, skyHaze: 1.7, skyCloudSize: 1.5, exposure: 0.42 },
      fade: { fade: [150, 1500], rip: [170, 1600], lod: 1.1 },
    });
    resetImpactOrder();
    setImpactPhase(null);

    fleet.stage([{ kit: 'battleship', cells: 5, x: -72, z: -215, heading: 0.58, seed: 4021 }]);
    fleet.plumes.add(-72, 24, -215, { drift: [-52, 22], puffs: 14, rise: 34, scale: 15, tone: 0.30, seed: 617, alpha: 0.26, spread: 1.15 });
    // the destroyer sits directly behind the near column, so the column has something to be
    // translucent in front of — in the plate you read a fort wall and a flag straight through it
    fleet.stage([{ kit: 'destroyer', cells: 3, x: 62, z: -520, heading: -0.42, detail: 1, seed: 811 }]);

    const emit = window.__waterline.vfx.emit;
    // two rounds of a straddle, posed at different ages: one column at its hang, one already
    // collapsing back into its own foam
    emit.splash(new THREE.Vector3(12, 0, -125), { size: 9, seed: 991, at: 1.35 });
    emit.splash(new THREE.Vector3(112, 0, -330), { size: 4, seed: 55, at: 1.75 });

    seaCamera(app, { y: 19, fov: 33, horizon: 0.50 });
  },
});

defineScenario({
  id: 'hit_explode',
  label: 'A hit at close range — white core, black smoke, water lit to the camera',
  ref: '1272010_06',
  setup(app) {
    const { fleet } = vfxScene(app, 'dusk', {
      seaState: 2, shadow: 90, fog: [300, 3400], amb: 0.075,
      // skyHaze was 1.6 and seaHaze 1.0: between them they mixed the grade's orange uHorizon into
      // the lower sky AND into every metre of sea past 400 m, so the water two kilometres from the
      // fire measured the same hue as the water twenty metres from it. That is a tint, not a light.
      sky: { skyCover: 1.9, skyHaze: 0.5, skyCloudSize: 1.5, exposure: 0.98, seaHaze: 0.5 },
      fade: { lod: 1.0 },
    });
    // the plate's light comes from the fire, not from the sky: the sun is under the horizon and
    // what is left is the last of the dusk. With C1's dusk sun where the grade puts it we get a
    // postcard sunset and the burning ship is the second brightest thing in frame.
    window.__waterline.world.sky.setSun(196, -3.5);
    resetImpactOrder();
    setImpactPhase(0.24);
    setFirePhase(26);

    const [target] = fleet.stage([{ kit: 'battleship', cells: 5, x: -40, z: -128, heading: 0.24, detail: 2, seed: 1523 }]);
    target.setDamage(0.55);

    const emit = window.__waterline.vfx.emit;
    const wind = [-14, 6];

    emit.hit(target.hullSide(0.42, 1), { size: 9, out: new THREE.Vector3(0.22, 0.16, 0.96), seed: 4409, wind, sea: false });
    emit.fire(target.object3D, target.object3D.worldToLocal(target.hullSide(0.33, 1)), { seconds: 0, size: 9, scale: 1.25, seed: 71, wind, candela: 210, seaIntensity: 0.9, seaRadius: 28 });
    emit.fire(target.object3D, target.object3D.worldToLocal(target.hullSide(0.58, 1)), { seconds: 0, size: 4, scale: 1.15, seed: 613, candela: 90, sea: false, wind });

    // burning oil in the near field. This is the plate's foreground: the biggest, hottest thing in
    // frame is on the water a few tens of metres away, not on the ship.
    // world-metre sizes, so they fall off with distance like everything else. The near pool was the
    // same size class as fires twice as far away and came out only 1.4x their screen height.
    emit.fire(null, new THREE.Vector3(-20, 0, -66), { seconds: 0, size: 9, scale: 1.15, seed: 1201, wind, light: false, smoke: 0.28, seaIntensity: 0.55, seaRadius: 24, warmRadius: 110 });
    emit.fire(null, new THREE.Vector3(22, 0, -72), { seconds: 0, size: 4, scale: 1.05, seed: 1777, smoke: 0.3, wind, light: false, sea: false });
    emit.fire(null, new THREE.Vector3(-72, 0, -96), { seconds: 0, size: 4, scale: 0.9, seed: 2003, smoke: 0.6, wind, light: false, sea: false });

    // the right half of the plate is not empty water: a second casualty mid-distance and escorts
    // strung along the horizon
    const [second] = fleet.stage([{ kit: 'cruiser', cells: 4, x: 126, z: -276, heading: 1.05, detail: 1, seed: 6151 }]);
    second.setDamage(0.8);
    emit.fire(second.object3D, second.object3D.worldToLocal(second.hullSide(0.45, 1)), { seconds: 0, size: 4, scale: 1.1, seed: 3301, wind, light: false, sea: false });
    // drift, not rise, was carrying these: at -120 m of lean against 40 m of climb the puffs left
    // their own funnel and stood in clear air as a horizontal row with nothing under them
    fleet.plumes.add(126, 26, -276, { drift: [-34, 14], puffs: 17, rise: 86, scale: 17, tone: 0.72, seed: 977, alpha: 0.40, spread: 1.15 });
    fleet.stage([{ kit: 'destroyer', cells: 3, x: 520, z: -880, heading: 2.1, detail: 0, seed: 811 }]);
    fleet.stage([{ kit: 'cruiser', cells: 4, x: 780, z: -1420, heading: 1.4, detail: 0, seed: 55 }]);
    fleet.plumes.add(780, 18, -1420, { drift: [-40, 20], puffs: 14, rise: 105, scale: 20, tone: 0.75, seed: 313, alpha: 0.4, fire: 0.14, spread: 1.1 });

    seaCamera(app, { y: 11, fov: 40, horizon: 0.55 });
  },
});
