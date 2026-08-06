// Bridge/table private kit — C2. Geometry helpers, the procedural sprites the room needs, and
// the two or three props that were big enough to crowd bridge.js out.
//
// Nothing here imports bridge.js or table.js, so the dependency runs one way.

import * as THREE from 'three';
import { track } from '../engine/budget.js';

// ── geometry helpers ────────────────────────────────────────────────────────────────────────

// A chamfered slab. Every hard 90° edge in a dark room disappears; a 1 cm chamfer catches the
// practicals and is the difference between a box and a piece of equipment.
export function bevelBox(w, h, d, r = 0.012) {
  const s = new THREE.Shape();
  const x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x - r, -y);
  s.lineTo(-x - r, y); s.quadraticCurveTo(-x - r, y + r, -x, y + r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x + r, y + r, x + r, y);
  s.lineTo(x + r, -y); s.quadraticCurveTo(x + r, -y - r, x, -y - r);
  s.lineTo(-x, -y - r); s.quadraticCurveTo(-x - r, -y - r, -x - r, -y);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: d - r * 2, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 1,
    curveSegments: 1, steps: 1,
  });
  g.translate(0, 0, -(d - r * 2) / 2 - r);
  g.computeVertexNormals();
  return g;
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S3 = new THREE.Vector3();
const C = new THREE.Color();

// YXZ throughout: yaw the object into place, then pitch it. XYZ order pitches in world space and
// silently skews anything that is both yawed and tilted, which is every console on the wings.
export function place(im, i, p, rot = [0, 0, 0], sc = [1, 1, 1]) {
  M.compose(V.set(p[0], p[1], p[2]), Q.setFromEuler(E.set(rot[0], rot[1], rot[2], 'YXZ')), S3.set(sc[0], sc[1], sc[2]));
  im.setMatrixAt(i, M);
}

// A quad whose +Z normal is `dir`. Matrix4.lookAt points +Z from the target BACK to the eye, so
// the target is p − dir.
const LOOK_UP = new THREE.Vector3(0, 1, 0);
const LOOK_ALT = new THREE.Vector3(0, 0, 1);
const _t = new THREE.Vector3();
const _m = new THREE.Matrix4();
export function faceQuad(im, i, p, dir, w, h) {
  V.set(p[0], p[1], p[2]);
  _t.set(dir[0], dir[1], dir[2]).normalize();
  _m.lookAt(V, _t.clone().multiplyScalar(-1).add(V), Math.abs(_t.y) > 0.97 ? LOOK_ALT : LOOK_UP);
  Q.setFromRotationMatrix(_m);
  M.compose(V, Q, S3.set(w, h, 1));
  im.setMatrixAt(i, M);
}

export function instanced(parent, geo, mat, list, fn, opts = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  im.count = list.length;
  im.frustumCulled = false;
  if (opts.shadow) im.castShadow = true;
  if (opts.receive) im.receiveShadow = true;
  list.forEach((item, i) => fn(im, i, item));
  im.instanceMatrix.needsUpdate = true;
  parent.add(im);
  return im;
}

// UV scale on a shared texture, per mesh, so a 7 m wall and a 1 m panel keep the same texel size.
export function tileUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

export function setColour(im, i, r, g, b) { im.setColorAt(i, C.setRGB(r, g, b)); }

// ── sprites ─────────────────────────────────────────────────────────────────────────────────

const cache = new Map();
function sprite(label, S, draw, { srgb = true, mips = false } = {}) {
  if (cache.has(label)) return cache.get(label);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  draw(cv.getContext('2d'), S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = mips;
  if (mips) t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  track(t, { w: S, h: S, fmt: 'rgba', mips, label });
  cache.set(label, t);
  return t;
}

const stops = (g, S, list) => {
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (const [t, a] of list) grd.addColorStop(t, `rgba(255,255,255,${a})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
};

// The broad soft pool used for painted light on the deck.
export const radialTexture = () => sprite('bridge:pool', 128, (g, S) =>
  stops(g, S, [[0, 0.95], [0.35, 0.34], [1, 0]]));

// Tight core, long tail — a lamp seen directly, or a distant navigation light.
export const haloTexture = () => sprite('bridge:halo', 128, (g, S) =>
  stops(g, S, [[0, 1], [0.05, 0.92], [0.14, 0.42], [0.34, 0.10], [0.62, 0.02], [1, 0]]));

// What a screen actually throws on the bulkhead behind and around it: an ellipse elongated ALONG
// the wall, hottest right at the emitter. The old radial gradient produced a perfectly circular
// blob whatever the surface's orientation, which is a billboard sprite, not a wash.
export const spillTexture = () => sprite('bridge:spill', 128, (g, S) => {
  g.clearRect(0, 0, S, S);
  g.save();
  g.translate(S / 2, S / 2);
  g.scale(1, 0.42);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  for (const [t, a] of [[0, 1], [0.10, 0.72], [0.30, 0.26], [0.62, 0.05], [1, 0]]) {
    grd.addColorStop(t, `rgba(255,255,255,${a})`);
  }
  g.fillStyle = grd;
  g.fillRect(-S / 2, -S / 2, S, S);
  g.restore();
});

// A recessed fixture lens: two soft tubes behind diffuser glass, dimmed toward the frame so the
// panel has a gradient across it instead of a hard-edged rectangle.
export const lensTexture = () => sprite('bridge:lens', 128, (g, S) => {
  g.clearRect(0, 0, S, S);
  const grd = g.createLinearGradient(0, 0, 0, S);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.16, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.84, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  // soften the ends of the tube the same way
  g.globalCompositeOperation = 'destination-in';
  const h = g.createLinearGradient(0, 0, S, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.12, 'rgba(0,0,0,0.85)');
  h.addColorStop(0.5, 'rgba(0,0,0,1)');
  h.addColorStop(0.88, 'rgba(0,0,0,0.85)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = h;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  for (const y of [0.34, 0.66]) {
    const t = g.createLinearGradient(0, S * (y - 0.09), 0, S * (y + 0.09));
    t.addColorStop(0, 'rgba(255,255,255,0)');
    t.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    t.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = t;
    g.fillRect(S * 0.1, S * (y - 0.09), S * 0.8, S * 0.18);
  }
});

// The light shaft under the pendant. WIDEST AT THE BOTTOM — a shaft widens away from its source —
// with the density falling along its length and the silhouette fading to nothing at both edges.
let beamTex = null;
export function beamTexture() {
  if (beamTex) return beamTex;
  const W = 96, H = 192;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const p = img.data;
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);                       // 0 at the bulb, 1 at the floor
    const halfW = 0.052 + v * 0.44;
    // A shaft of light in haze thins with distance but does not disappear a third of the way down.
    // The old exponent put all the density at the bulb, which read as a glow blob rather than as a
    // cone with a defined penumbra edge and an elliptical footprint.
    const density = Math.pow(1 - v, 0.80) * 0.52 + 0.07;
    for (let x = 0; x < W; x++) {
      const u = (x / (W - 1) - 0.5) / halfW;     // −1..1 across the shaft
      const a = Math.abs(u) >= 1 ? 0 : Math.pow(Math.cos(u * Math.PI / 2), 1.15) * density;
      const i = (y * W + x) * 4;
      p[i] = p[i + 1] = p[i + 2] = 255;
      p[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  beamTex = new THREE.CanvasTexture(cv);
  beamTex.colorSpace = THREE.SRGBColorSpace;
  beamTex.needsUpdate = true;
  track(beamTex, { w: W, h: H, fmt: 'rgba', mips: false, label: 'bridge:beam' });
  return beamTex;
}

// A whole-deck wear layer at 1:1, so the scuffing never repeats. Traffic lanes are polished, the
// corners are not, and nothing sits on a lattice.
let wearTex = null;
export function deckWearTexture(size = 512) {
  if (wearTex) return wearTex;
  const S = size;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, S, S);

  let a = 20250806 >>> 0;
  const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);

  // u = port→starboard, v = forward(window)→aft. The door is aft-centre; the table is the middle.
  const LANES = [
    [[0.50, 1.00], [0.50, 0.62], [0.50, 0.44]],   // door to the table
    [[0.50, 0.80], [0.26, 0.60], [0.17, 0.31]],   // to the port chair
    [[0.50, 0.80], [0.72, 0.58], [0.85, 0.33]],   // to the starboard chair
    [[0.17, 0.31], [0.40, 0.20], [0.62, 0.19], [0.85, 0.33]],  // along the forward console run
  ];

  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const lane of LANES) {
    for (let pass = 0; pass < 3; pass++) {
      g.strokeStyle = `rgba(196,206,214,${0.030 + pass * 0.018})`;
      g.lineWidth = S * (0.10 - pass * 0.028);
      g.beginPath();
      g.moveTo(lane[0][0] * S, lane[0][1] * S);
      for (let i = 1; i < lane.length; i++) g.lineTo(lane[i][0] * S, lane[i][1] * S);
      g.stroke();
    }
  }

  // Scuffs. Position is biased onto the lanes, and rotation, radius and arc length are all free —
  // a deck is worn where feet go, not on a grid.
  const near = (u, v) => {
    let best = 1;
    for (const lane of LANES) {
      for (let i = 1; i < lane.length; i++) {
        const [x0, y0] = lane[i - 1], [x1, y1] = lane[i];
        const dx = x1 - x0, dy = y1 - y0;
        const t = Math.max(0, Math.min(1, ((u - x0) * dx + (v - y0) * dy) / (dx * dx + dy * dy)));
        best = Math.min(best, Math.hypot(u - (x0 + dx * t), v - (y0 + dy * t)));
      }
    }
    return best;
  };

  for (let i = 0, tries = 0; i < 110 && tries < 4000; tries++) {
    const u = rnd(), v = rnd();
    const d = near(u, v);
    if (rnd() > Math.exp(-d * 7.5) * 0.95 + 0.03) continue;
    i++;
    const r = S * (0.004 + rnd() * 0.014);
    const rot = rnd() * Math.PI * 2;
    const span = 0.7 + rnd() * 2.4;
    const light = rnd() < 0.62;
    g.save();
    g.translate(u * S, v * S);
    g.rotate(rot);
    g.scale(1, 0.45 + rnd() * 0.7);
    g.strokeStyle = light
      ? `rgba(206,214,222,${0.05 + rnd() * 0.13})`
      : `rgba(16,18,22,${0.06 + rnd() * 0.14})`;
    g.lineWidth = Math.max(1, r * (0.10 + rnd() * 0.22));
    g.beginPath();
    g.arc(0, 0, r, rot, rot + span);
    g.stroke();
    g.restore();
  }

  // A few soft stains, big and low-contrast, to break the mid-tone up at a different scale.
  for (let i = 0; i < 9; i++) {
    const x = rnd() * S, y = rnd() * S, r = S * (0.05 + rnd() * 0.14);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.6;
    grd.addColorStop(0, dark ? 'rgba(10,12,15,0.16)' : 'rgba(150,160,168,0.10)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  wearTex = new THREE.CanvasTexture(cv);
  wearTex.colorSpace = THREE.SRGBColorSpace;
  wearTex.wrapS = wearTex.wrapT = THREE.ClampToEdgeWrapping;
  wearTex.generateMipmaps = true;
  wearTex.minFilter = THREE.LinearMipmapLinearFilter;
  wearTex.needsUpdate = true;
  track(wearTex, { w: S, h: S, fmt: 'rgba', mips: true, label: 'bridge:deckWear' });
  return wearTex;
}

// What the compartment leaves on the glass: a couple of instrument bands smeared low in the pane,
// one diagonal wipe from the cloth, and a faint deckhead streak. Nothing here is a real reflection
// — it is the recognisable *look* of one, for the cost of a 256² texture on a quad that exists.
export const glassTexture = () => sprite('bridge:glassRefl', 256, (g, S) => {
  g.clearRect(0, 0, S, S);
  const band = (y, h, a) => {
    const grd = g.createLinearGradient(0, S * (y - h), 0, S * (y + h));
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, `rgba(255,255,255,${a})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, S * (y - h), S, S * h * 2);
  };
  band(0.80, 0.055, 0.30);
  band(0.70, 0.020, 0.16);
  band(0.14, 0.045, 0.10);

  // broken into segments so it reads as separate instruments rather than one continuous bar
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) {
    const x = (i + 0.5) / 9 * S + (i % 3 - 1) * 6;
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.fillRect(x - S * 0.018, S * 0.66, S * 0.036, S * 0.24);
  }
  g.globalCompositeOperation = 'source-over';

  const w = g.createLinearGradient(0, S, S * 0.9, 0);
  w.addColorStop(0, 'rgba(255,255,255,0)');
  w.addColorStop(0.46, 'rgba(255,255,255,0.055)');
  w.addColorStop(0.62, 'rgba(255,255,255,0)');
  g.fillStyle = w;
  g.fillRect(0, 0, S, S);
});

// Greyscale, white at the rim: a true contact-darkening term under MultiplyBlending rather than a
// black quad whose strength depends on whatever happens to be behind it.
export const contactTexture = () => sprite('bridge:contact', 64, (g, S) => {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.35, 'rgba(0,0,0,0.72)');
  grd.addColorStop(0.72, 'rgba(0,0,0,0.20)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
});

// ── materials ───────────────────────────────────────────────────────────────────────────────

export function additive(colour, map, opts = {}) {
  return new THREE.MeshBasicMaterial({
    color: colour, map, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: true, forceSinglePass: true,
    side: opts.side ?? THREE.FrontSide, opacity: opts.opacity ?? 1,
  });
}

let contactMat = null;
export function contactMaterial() {
  if (contactMat) return contactMat;
  contactMat = new THREE.MeshBasicMaterial({
    map: contactTexture(), transparent: true, depthWrite: false,
    blending: THREE.MultiplyBlending, fog: false, toneMapped: false,
  });
  return contactMat;
}

// A dark body with a view-angle rim. Without it a crewman in front of a bright window is a hole in
// the frame; with it he has an edge and the room has depth.
export function rimMaterial({ colour = 0x191d23, rim = 0x2c4358, power = 2.6, strength = 1, floor = 0.22 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.78, metalness: 0.08 });
  m.userData.rim = {
    uRimCol: { value: new THREE.Color(rim).multiplyScalar(strength) },
    uRimPow: { value: power },
    // The fresnel term is zero wherever a surface faces the lens square-on, which is exactly the
    // large flat area of a crewman's back — a silhouette with no rim and no key is a hole.
    uRimFloor: { value: floor },
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, m.userData.rim);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimCol;\nuniform float uRimPow;\nuniform float uRimFloor;')
      .replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         totalEmissiveRadiance += uRimCol * mix( uRimFloor, 1.0,
           pow( clamp( 1.0 - abs( dot( normal, normalize( vViewPosition ) ) ), 0.0, 1.0 ), uRimPow ) );`);
  };
  m.customProgramCacheKey = () => 'waterlineRim';
  return m;
}

// ── the pendant chart lamp ──────────────────────────────────────────────────────────────────
//
// Returns { group, billboard(camera), light } — `light` is a SpotLight the caller parents and
// aims; the prop shadows it throws on the chart are the most legible shadow in the lamp shot.

export function pendantLamp({ x, y, z, ceiling, beamTo = 0, colour = 0xffc98a, shadeR = 0.235 }) {
  const group = new THREE.Group();
  group.name = 'chartLamp';

  const shell = new THREE.MeshStandardMaterial({
    color: 0x7d7469, roughness: 0.46, metalness: 0.30, side: THREE.DoubleSide,
    emissive: new THREE.Color(colour), emissiveIntensity: 0.06,
  });
  const inner = new THREE.MeshStandardMaterial({
    color: 0xf6ecdc, roughness: 0.55, metalness: 0.0, side: THREE.BackSide,
    emissive: new THREE.Color(colour), emissiveIntensity: 2.2,
  });

  // The rim is the part of the shade nearest the bulb, so it is the hottest — the cone used to get
  // DARKER downwards, which is what makes a lampshade read as a brown traffic cone. The ramp runs
  // off the cylinder's own local y, not a uv, so it cannot depend on how the geometry is unwrapped.
  const SHADE_H = 0.20;
  const shadeMat = shell.clone();
  shadeMat.color = new THREE.Color(0x4c443b);
  shadeMat.metalness = 0.52;
  shadeMat.userData.hot = { uHot: { value: new THREE.Color(colour).multiplyScalar(0.24) } };
  shadeMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, shadeMat.userData.hot);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vRimT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvRimT = 0.5 - position.y / ${SHADE_H.toFixed(3)};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRimT;\nuniform vec3 uHot;')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uHot * pow( clamp( vRimT, 0.0, 1.0 ), 2.6 );');
  };
  shadeMat.customProgramCacheKey = () => 'waterlineShadeRim';

  // Shade: an open truncated cone, narrow at the top where the cable enters, wide at the rim.
  // Nothing in the fixture casts — the bulb is INSIDE the shade, so a shadow-casting shade puts a
  // hard ring right through the middle of its own pool.
  const shadeGeo = new THREE.CylinderGeometry(0.075, shadeR, SHADE_H, 26, 1, true);
  const shade = new THREE.Mesh(shadeGeo, shadeMat);
  shade.position.set(x, y + 0.115, z);
  group.add(shade);
  const lining = new THREE.Mesh(shadeGeo, inner);
  lining.position.copy(shade.position);
  lining.scale.setScalar(0.985);
  group.add(lining);

  const rimMat = shell.clone();
  rimMat.emissiveIntensity = 0.85;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(shadeR, 0.011, 6, 30), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, y + 0.017, z);
  group.add(rim);

  // The aperture itself. A hanging lamp reads as a lamp because you can see the hot disc of light
  // in its mouth, not because the cone is a lighter brown.
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(shadeR * 0.97, 26),
    additive(new THREE.Color(colour).multiplyScalar(0.85), radialTexture(), { side: THREE.DoubleSide }));
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.set(x, y + 0.026, z);
  mouth.renderOrder = 6;
  group.add(mouth);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), new THREE.MeshBasicMaterial({
    color: new THREE.Color(colour).multiplyScalar(4.2), fog: false,
  }));
  bulb.position.set(x, y + 0.055, z);
  group.add(bulb);

  const cableLen = ceiling - (y + 0.215);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, cableLen, 6), shell);
  cable.position.set(x, y + 0.215 + cableLen / 2, z);
  group.add(cable);

  const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.058, 0.045, 12), shell);
  clamp.position.set(x, ceiling - 0.022, z);
  group.add(clamp);

  // Halo around the bulb, and the warm patch the fixture throws back onto the deckhead.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture(), color: new THREE.Color(colour).multiplyScalar(0.8),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  halo.scale.setScalar(0.72);
  halo.position.set(x, y + 0.05, z);
  halo.renderOrder = 6;
  group.add(halo);

  const ceilPatch = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), additive(new THREE.Color(colour).multiplyScalar(0.16), radialTexture()));
  ceilPatch.rotation.x = Math.PI / 2;
  ceilPatch.position.set(x, ceiling - 0.012, z);
  ceilPatch.renderOrder = 5;
  group.add(ceilPatch);

  // The shaft. Camera-facing about the lamp axis, widest at the bottom, no hard edge anywhere.
  const beamH = Math.max(0.2, y - beamTo);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(beamH * 2.4, beamH),
    additive(new THREE.Color(colour).multiplyScalar(0.34), beamTexture(), { side: THREE.DoubleSide }));
  beam.position.set(x, y - beamH / 2 + 0.03, z);
  beam.renderOrder = 5;
  group.add(beam);

  const _v = new THREE.Vector3();
  return {
    group, beam, halo,
    // Billboard about Y only — the shaft is vertical and must stay vertical. The camera is brought
    // into the beam's parent space first, or a yawed room turns the card edge-on.
    billboard(camera) {
      if (!beam.parent) return;
      camera.getWorldPosition(_v);
      beam.parent.worldToLocal(_v);
      beam.rotation.y = Math.atan2(_v.x - beam.position.x, _v.z - beam.position.z);
    },
  };
}
