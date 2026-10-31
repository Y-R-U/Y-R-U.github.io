import * as THREE from 'three';
import { Builder, monotone, naca, airfoilLoop, sweepRings, streamline, circle, lerp, clamp, srgb } from '../geom.js';
import { uvSide, uvPlan } from '../livery.js';
import { tess, pbrMaterial, RM, mkMesh, hinge, M4, rod, atlas, pick, shade, crest, canvasTexture, fan } from './kit.js';
import { assembleRig } from './rig.js';
import { createAviator } from './aviator.js';
import { buildPanelCockpit, paintDial, stickGeom, COL as CK } from './cub_cockpit.js';

// Piper J-3 Cub ("Butter Cub"). Build frame: y = height above ground with the fuselage datum LEVEL and the main wheels
// on y = 0; z = station aft of the propeller hub face; x = right. Sits tail-down at GROUND_PITCH. Real: span 10.74,
// length 6.83, wing area 16.6 m², prop 1.83. The Royal Cub is flown from the FRONT seat (a corgi rides in the back) with
// the right-hand clamshell door open, as Cubs are on a summer evening.
export const CG = { s: 1.95, y: 1.0 };
export const THRUST_Y = 1.27;
export const MAIN = { s: 1.45, half: 0.9, r: 0.26, w: 0.12 };
export const TAILW = { s: 6.1, r: 0.075, y: 0.99 };
export const GROUND_PITCH = Math.atan2(TAILW.y, TAILW.s - MAIN.s);
export const SEAT = { x: 0, y: 1.06, s: 1.86 };
export const EYE = { x: 0, y: 1.72, s: 1.8, pitch: -0.12 };
const FLOOR = 0.86, SILL = 1.42, CAB = [0.98, 2.95], DOOR = [1.44, 2.36], DOOR_LOW = 0.98, WS_TOP = 1.32;
export const BUTTER = '#f4c22b';

// [station, halfWidth, top, bottom, waist, nTop, nBottom]
const FUS = [
  [0.1, 0.13, 1.42, 1.12, 1.27, 2, 2],
  [0.17, 0.25, 1.53, 1.0, 1.28, 2.3, 2.3],
  [0.32, 0.29, 1.6, 0.94, 1.3, 2.6, 2.6],
  [0.62, 0.31, 1.65, 0.91, 1.32, 2.8, 3],
  [0.98, 0.33, 1.7, 0.86, 1.36, 3, 4],
  [1.32, 0.36, 1.95, 0.8, 1.42, 6, 6],
  [2.0, 0.37, 1.95, 0.78, 1.42, 6, 7],
  [2.95, 0.355, 1.95, 0.83, 1.42, 6, 6],
  [3.5, 0.31, 1.84, 0.91, 1.42, 3, 5],
  [4.5, 0.22, 1.66, 1.04, 1.4, 2.6, 4],
  [5.5, 0.13, 1.52, 1.16, 1.37, 2.3, 3],
  [6.25, 0.055, 1.45, 1.25, 1.36, 2.1, 2.4],
  [6.5, 0.015, 1.43, 1.3, 1.37, 2, 2],
];
const KEYS = FUS.map((k) => k[0]);
const FI = [1, 2, 3, 4, 5, 6].map((c) => monotone(KEYS, FUS.map((k) => k[c])));
export const fus = (s) => ({ w: FI[0](s), yt: FI[1](s), yb: FI[2](s), yw: FI[3](s), nt: FI[4](s), nb: FI[5](s) });
export function fusPt(sec, s, t, inset = 0) {
  const sn = Math.sin(t), cs = Math.cos(t), top = cs >= 0;
  const e = 2 / (top ? sec.nt : sec.nb);
  const x = (sec.w - inset) * Math.sign(sn) * Math.abs(sn) ** e;
  const y = top ? sec.yw + (sec.yt - inset - sec.yw) * Math.abs(cs) ** e : sec.yw - (sec.yw - sec.yb - inset) * Math.abs(cs) ** e;
  return [x, y, s];
}
export function fusHalfWidth(s, y) {
  const sec = fus(s), top = y >= sec.yw;
  const h = top ? (y - sec.yw) / (sec.yt - sec.yw) : (sec.yw - y) / (sec.yw - sec.yb);
  const n = top ? sec.nt : sec.nb;
  return sec.w * Math.max(0, 1 - Math.min(1, h) ** n) ** (1 / n);
}
// the angle t on a section whose point sits at height y (right side; mirror for the left)
function tAtY(s, y) {
  const sec = fus(s);
  if (y >= sec.yw) { const h = clamp((y - sec.yw) / (sec.yt - sec.yw), 0, 1); return Math.acos(h ** (sec.nt / 2)); }
  const h = clamp((sec.yw - y) / (sec.yw - sec.yb), 0, 1); return Math.PI - Math.acos(h ** (sec.nb / 2));
}

// Wing: constant chord, rounded tips, on top of the cabin. NACA 4412-ish.
export const WING = { le: 1.3, c: 1.6, y: 2.0, half: 5.37, root: 0.37, dihedral: Math.tan((1 * Math.PI) / 180), ail: [2.65, 4.85], hinge: 0.76 };
export function wingSec(x) {
  const ax = Math.abs(x), W = WING;
  let le = W.le, c = W.c, thk = 1;
  const y = W.y + Math.max(0, ax - W.root) * W.dihedral;
  const tip = W.half - 0.55;
  if (ax > tip) { const k = (ax - tip) / (W.half - tip); le += 0.32 * k ** 2.4; c = Math.max(0.02, W.c - 0.32 * k ** 2.4 - 0.55 * k ** 3); thk = Math.sqrt(Math.max(0.03, 1 - k ** 2.6)); }
  return { le, c, y, thk };
}
export const STAB = { y: 1.43, half: 1.62, le: 5.72, hinge: 6.24, te: 6.62 };
export const FIN = { base: 1.45, top: 2.2, le0: 5.72, le1: 6.26, hinge: 6.44 };
export const RUD = { hinge: 6.44, bot: 1.22, top: 2.2 };
export const FOIL = naca(0.04, 0.4, 0.12);
const STRUT = { x: 2.55, f: [0.22, 0.68], root: [[0.33, 0.97, 1.55], [0.33, 0.97, 1.76]] };

// ---------- livery atlas ----------
const REG = {
  fusL: { x0: 0, x1: 1, y0: 0, y1: 0.2, s0: -0.05, s1: 6.95, h0: 0.55, h1: 2.0, flip: false },
  fusR: { x0: 0, x1: 1, y0: 0.2, y1: 0.4, s0: -0.05, s1: 6.95, h0: 0.55, h1: 2.0, flip: true },
  rudL: { x0: 0, x1: 0.33, y0: 0.4, y1: 0.56, s0: 5.6, s1: 6.95, h0: 1.1, h1: 2.3, flip: false },
  rudR: { x0: 0.33, x1: 0.66, y0: 0.4, y1: 0.56, s0: 5.6, s1: 6.95, h0: 1.1, h1: 2.3, flip: true },
  tail: { x0: 0.66, x1: 1, y0: 0.4, y1: 0.56, a0: -1.75, a1: 1.75, s0: 5.6, s1: 6.75, flip: false },
  wT: { x0: 0, x1: 1, y0: 0.56, y1: 0.76, a0: -5.5, a1: 5.5, s0: 1.2, s1: 3.0, flip: false },
  wB: { x0: 0, x1: 1, y0: 0.76, y1: 0.96, a0: -5.5, a1: 5.5, s0: 1.2, s1: 3.0, flip: true },
};
const SW = ['primary', 'secondary', 'accent', 'butter', 'dark', 'black', 'butterDark', 'white'];
const sw = (name) => [(SW.indexOf(name) + 0.5) / SW.length, 1 - 0.99];

// the lightning bolt: nose to s 3.25 along the waist, a jog down, then a tapering streak to the tail
function boltPath(c, grow = 0) {
  const g = grow;
  c.beginPath();
  c.moveTo(0.05, 1.37 + g); c.lineTo(3.3 + g, 1.45 + g); c.lineTo(3.02 - g, 1.3 + g); c.lineTo(6.3 + g * 2, 1.34);
  c.lineTo(3.0 - g, 1.21 - g); c.lineTo(3.25 + g, 1.33 - g); c.lineTo(0.05, 1.25 - g);
  c.closePath();
}

function createCubLivery(quality) {
  const S = quality === 'low' ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const texture = canvasTexture(canvas, { aniso: quality === 'low' ? 4 : 8 });
  const A = atlas(S);
  const rough = document.createElement('canvas'); rough.width = rough.height = 256;
  const roughTex = new THREE.CanvasTexture(rough);
  {
    const g = rough.getContext('2d');
    g.fillStyle = 'rgb(0,175,0)'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgb(0,90,0)';
    for (const r of [REG.fusL, REG.fusR]) { const T = A.side(r), k = 256 / S; g.save(); g.setTransform(T.a * k, 0, 0, T.d * k, T.e * k, T.f * k); g.fillRect(-0.1, 0.5, 1.08, 1.5); g.restore(); }
    roughTex.needsUpdate = true;
  }
  const ribs = (c, x0, x1, s0, s1, step) => {
    for (let x = x0; x <= x1 + 1e-6; x += step) {
      const g = c.createLinearGradient(x, 0, x + step, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(0.5, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
      c.fillStyle = g; c.fillRect(x, s0, step, s1 - s0);
      c.fillStyle = shade(BUTTER, 1.05); c.fillRect(x - 0.018, s0, 0.036, s1 - s0);
      c.fillStyle = 'rgba(0,0,0,0.1)'; c.fillRect(x - 0.019, s0, 0.004, s1 - s0); c.fillRect(x + 0.015, s0, 0.004, s1 - s0);
    }
  };
  function paintSide(c, T, L) {
    const { primary, secondary, accent } = L;
    c.fillStyle = BUTTER; c.fillRect(-1, 0, 9, 3);
    // stringer shading on the fabric turtledeck, a darker belly
    c.fillStyle = 'rgba(0,0,0,0.045)';
    for (let k = 0; k < 4; k++) { c.beginPath(); for (let s = 3.0; s <= 6.4; s += 0.1) { const f = fus(s); c.lineTo(s, f.yw + (f.yt - f.yw) * (0.25 + k * 0.2)); } for (let s = 6.4; s >= 3.0; s -= 0.1) { const f = fus(s); c.lineTo(s, f.yw + (f.yt - f.yw) * (0.25 + k * 0.2) - 0.012); } c.closePath(); c.fill(); }
    c.fillStyle = shade(BUTTER, 0.86);
    c.beginPath(); for (let s = 1.0; s <= 6.5; s += 0.05) c.lineTo(s, fus(s).yb + 0.07); for (let s = 6.5; s >= 1.0; s -= 0.05) c.lineTo(s, fus(s).yb - 0.1); c.closePath(); c.fill();
    // cowl in the player's primary, with panel lines and fasteners
    c.fillStyle = primary; c.fillRect(-1, 0, 1.98, 3);
    c.strokeStyle = 'rgba(10,10,12,0.5)'; c.lineWidth = 0.007;
    c.beginPath(); c.moveTo(0.18, 1.0); c.lineTo(0.18, 1.55); c.moveTo(0.97, 0.86); c.lineTo(0.97, 1.7); c.moveTo(0.2, 1.48); c.lineTo(0.95, 1.52); c.stroke();
    for (let i = 0; i < 5; i++) for (const y of [1.5, 1.0]) { c.fillStyle = 'rgba(20,20,22,0.55)'; c.beginPath(); c.arc(0.3 + i * 0.15, y, 0.008, 0, 7); c.fill(); }
    // the lightning bolt in the player's secondary, accent pinline
    boltPath(c, 0.012); c.fillStyle = accent; c.fill();
    boltPath(c); c.fillStyle = secondary; c.fill();
    // fabric lacing along the belly, footstep
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let s = 3.0; s < 6.3; s += 0.06) c.fillRect(s, fus(s).yb + 0.04, 0.03, 0.006);
    const nameCol = pick(BUTTER, [secondary, primary, accent], 2.6);
    A.text(c, T, L.display, 4.6, fus(4.6).yw + 0.15, 1.85, 0.2, { fill: nameCol, slope: -0.035 });
    const regCol = pick(BUTTER, ['#15181d', secondary], 4);
    A.text(c, T, L.registration, 5.55, 1.2, 0.7, 0.09, { font: '700', fill: regCol, slope: -0.02 });
  }
  function paintRudder(c, T, L) {
    c.fillStyle = BUTTER; c.fillRect(5.5, 1.0, 2, 1.5);
    crest(c, T, 6.3, 1.78, 0.4, { field: shade(L.secondary, 0.7), field2: '#a3162a', gold: '#e3bc55' });
    const regCol = pick(BUTTER, ['#15181d', L.secondary], 4);
    A.text(c, T, L.registration, 6.45, 1.42, 0.6, 0.1, { font: '700', fill: regCol });
    c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 0.006;
    for (let y = 1.3; y < 2.15; y += 0.15) { c.beginPath(); c.moveTo(RUD.hinge, y); c.lineTo(6.9, y + 0.02); c.stroke(); }
  }
  function paintTail(c) {
    c.fillStyle = BUTTER; c.fillRect(-2, 5.5, 4, 1.4);
    ribs(c, -1.5, 1.5, 5.6, 6.7, 0.25);
  }
  function paintWing(c, T, L, top) {
    c.fillStyle = BUTTER; c.fillRect(-6, 1, 12, 3);
    ribs(c, -5.2, 5.2, 1.1, 3.0, 0.3);
    c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 0.008;
    for (const sg of [-1, 1]) {
      c.beginPath(); for (let x = 0.4; x <= 5.0; x += 0.1) { const w = wingSec(x * sg); c.lineTo(x * sg, w.le + 0.2); } c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.beginPath(); c.moveTo(sg * WING.ail[0], WING.le + WING.hinge * WING.c); c.lineTo(sg * WING.ail[1], WING.le + WING.hinge * WING.c); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.2)';
    }
    if (top) {
      // the clear skylight over the cabin, painted dark
      c.fillStyle = 'rgba(30,40,48,0.85)'; c.beginPath(); c.roundRect(-0.3, 1.38, 0.6, 0.5, 0.04); c.fill();
      c.strokeStyle = L.accent; c.lineWidth = 0.02; c.stroke();
    }
    const colT = pick(BUTTER, ['#15181d', L.secondary], 4), nameCol = pick(BUTTER, [L.secondary, L.primary], 2.6);
    if (top) {
      A.text(c, T, L.display, -2.7, 2.1, 3.4, 0.82, { fill: nameCol, plan: true });
      A.text(c, T, L.registration, 2.7, 2.1, 3.2, 0.74, { font: '700', fill: colT, plan: true });
    } else for (const sg of [-1, 1]) A.text(c, T, L.registration, sg * 2.8, 2.1, 3.2, 0.74, { font: '700', fill: colT, plan: true });
  }
  function draw(L) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    A.region(ctx, REG.fusL, A.side(REG.fusL), (c, T) => paintSide(c, T, L));
    A.region(ctx, REG.fusR, A.side(REG.fusR), (c, T) => paintSide(c, T, L));
    A.region(ctx, REG.rudL, A.side(REG.rudL), (c, T) => paintRudder(c, T, L));
    A.region(ctx, REG.rudR, A.side(REG.rudR), (c, T) => paintRudder(c, T, L));
    A.region(ctx, REG.tail, A.plan(REG.tail), (c) => paintTail(c));
    A.region(ctx, REG.wT, A.plan(REG.wT), (c, T) => paintWing(c, T, L, true));
    A.region(ctx, REG.wB, A.plan(REG.wB), (c, T) => paintWing(c, T, L, false));
    const cols = { primary: L.primary, secondary: L.secondary, accent: L.accent, butter: BUTTER, dark: '#24262a', black: '#0c0d0f', butterDark: shade(BUTTER, 0.8), white: '#f2f2ee' };
    const w = S / SW.length;
    SW.forEach((k, i) => { ctx.fillStyle = cols[k]; ctx.fillRect(i * w, S * 0.98, w, S * 0.02); });
    texture.needsUpdate = true;
  }
  return { texture, roughTex, draw, owns: (t) => t === texture || t === roughTex, dispose() { texture.dispose(); roughTex.dispose(); } };
}

function createCubMaterials(quality, livery) {
  const high = quality === 'high';
  const po = { map: livery.texture, roughnessMap: livery.roughTex, roughness: 1, metalness: 0, envMapIntensity: 1 };
  const paint = high ? new THREE.MeshPhysicalMaterial({ ...po, clearcoat: 0.15, clearcoatRoughness: 0.4 }) : new THREE.MeshStandardMaterial(po);
  const trim = pbrMaterial('cub-trim');
  const prop = pbrMaterial('cub-prop', { clearcoat: high ? 0.8 : 0 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xb8c6cf, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });
  const disc = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const list = [paint, trim, prop, glass, disc, lights, beacon];
  return { paint, trim, prop, glass, disc, lights, beacon, all: () => list };
}

const C = {
  tire: srgb('#151618'), steel: srgb('#8f959b'), dark: srgb('#26282b'), black: srgb('#0d0e10'), butter: srgb(BUTTER), butterDark: srgb(shade(BUTTER, 0.75)),
  int: srgb('#6b5a3e'), intDark: srgb('#4a3d2a'), floor: srgb('#3d3226'), seat: srgb('#5a2e1c'), fin: srgb('#3a3c40'), cyl: srgb('#7c8288'),
  wood: srgb('#6a3418'), woodDark: srgb('#4a2010'), alu: srgb('#9aa0a5'), exhaust: srgb('#5c4a3e'), chrome: srgb('#d3d7db'), rubber: srgb('#1b1b1d'),
  lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7],
};
const lerpC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function buildCubExterior(quality, mats) {
  const T = tess(quality);
  const body = new Builder(), trim = new Builder(), glass = new Builder(), lights = new Builder();
  const swP = () => sw('butter');

  // ---------- fuselage: lower shell (door hole on the right), decks fore and aft, the cabin open above the sill ----------
  const Nh = T.n(12, 4), Nd = T.n(12, 4);
  const stations = T.far ? [0.1, 0.14, 0.24] : [0.1, 0.12, 0.14, 0.17, 0.22, 0.28];
  for (let s = 0.4; s < 6.45; s += T.step(0.17)) stations.push(+s.toFixed(3));
  stations.push(...CAB, ...DOOR, 6.5);
  const st = [...new Set(stations)].sort((a, b) => a - b);
  const arc = (s, t0, t1, N, inset = 0) => { const sec = fus(s), r = []; for (let j = 0; j <= N; j++) r.push(fusPt(sec, s, lerp(t0, t1, j / N), inset)); return r; };
  const out = (p) => [p[0], p[1] - fus(p[2]).yw, 0];
  const sideUV = (p) => uvSide(p[0] >= 0 ? REG.fusR : REG.fusL, p[2], p[1]);
  const inDoor = (s) => s >= DOOR[0] - 1e-6 && s <= DOOR[1] + 1e-6;
  // the waist of the shell is the cabin sill: below it fabric, above it glass (cabin) or deck (cowl, turtledeck)
  const waistT = (s) => tAtY(s, Math.min(SILL, fus(s).yt - 0.01));
  body.loft(st.map((s) => arc(s, -Math.PI, -waistT(s), Nh)), { closed: false, out, uv: sideUV });
  const span = (a, b) => st.filter((s) => s >= a - 1e-6 && s <= b + 1e-6);
  body.loft(span(st[0], DOOR[0]).map((s) => arc(s, waistT(s), Math.PI, Nh)), { closed: false, out, uv: sideUV });
  if (!T.far) body.loft(span(DOOR[0], DOOR[1]).map((s) => arc(s, tAtY(s, DOOR_LOW), Math.PI, Nh)), { closed: false, out, uv: sideUV });
  else body.loft(span(DOOR[0], DOOR[1]).map((s) => arc(s, waistT(s), Math.PI, Nh)), { closed: false, out, uv: sideUV });
  body.loft(span(DOOR[1], 6.5).map((s) => arc(s, waistT(s), Math.PI, Nh)), { closed: false, out, uv: sideUV });
  for (const [a, b] of [[st[0], CAB[0]], [CAB[1], 6.5]]) {
    const ss = span(a, b);
    body.loft(ss.map((s) => arc(s, 0, waistT(s), Nd)), { closed: false, out, uv: sideUV });
    body.loft(ss.map((s) => arc(s, -waistT(s), 0, Nd)), { closed: false, out, uv: sideUV });
  }
  for (const [s, dir] of [[st[0], -1], [6.5, 1]]) {
    const ring = arc(s, 0, 2 * Math.PI, 2 * (Nh + Nd)).slice(0, -1);
    fan(body, ring, [0, 0, dir], sw(dir < 0 ? 'primary' : 'butter'));
  }
  // nose bowl: two dark cooling intakes either side of the crankshaft
  for (const sg of [-1, 1]) trim.addGeo(new THREE.SphereGeometry(1, T.n(14, 6), T.n(8, 4), 0, Math.PI * 2, 0, Math.PI / 2), M4(sg * 0.14, 1.24, 0.1, 0.085, 0.06, 0.1, -Math.PI / 2, 0, 0), RM.black, C.black);

  // ---------- cabin: glass, frames, sill, the open right door, inner liner, floor, seats ----------
  const tGlass = (s) => waistT(s);
  {
    const cs = span(CAB[0], CAB[1]);
    const nG = T.n(10, 4);
    // windscreen + left side + right side (the right one stops at the door)
    glass.loft(cs.map((s) => arc(s, -tGlass(s), 0, nG, 0.004)), { closed: false, out: (p) => [p[0], 0.2, 0] });
    glass.loft(span(CAB[0], DOOR[0]).map((s) => arc(s, 0, tGlass(s), nG, 0.004)), { closed: false, out: (p) => [p[0], 0.2, 0] });
    glass.loft(span(DOOR[1], CAB[1]).map((s) => arc(s, 0, tGlass(s), nG, 0.004)), { closed: false, out: (p) => [p[0], 0.2, 0] });
    if (!T.lod2) {
      const frame = (pts, r = 0.011) => trim.loft(sweepRings(pts, circle(T.n(6, 4), r)), { color: C.butter, uv: () => RM.paint, capStart: true, capEnd: true });
      for (const s of [WS_TOP, 2.95, DOOR[1], 1.95]) for (const sg of [-1, 1]) {
        if (s === 1.95 && sg > 0) continue;
        frame(arc(s, 0, tGlass(s), T.n(8, 4), -0.004).map((p) => [p[0] * sg, p[1], p[2]]));
      }
      for (const sg of [-1, 1]) { const pts = []; for (const s of cs) pts.push([sg * (fusHalfWidth(s, SILL) + 0.004), SILL, s]); frame(pts, 0.014); }
      // the door opening's frame below the sill
      if (!T.far) { const pts = []; for (const s of span(DOOR[0], DOOR[1])) pts.push([fusHalfWidth(s, DOOR_LOW) + 0.004, DOOR_LOW, s]); frame(pts, 0.014); }
    }
    // the door: the window half hinged up under the wing, the lower half folded down outside
    if (!T.lod2) {
      const hw = fusHalfWidth(1.9, 1.7), up = 1.93, len = 0.5, ang = 1.25;
      const a = [hw + 0.01, up], b = [hw + 0.01 + Math.cos(Math.PI / 2 - ang) * len, up - Math.sin(Math.PI / 2 - ang) * len];
      const corners = [[a[0], a[1], DOOR[0] + 0.03], [a[0], a[1], DOOR[1] - 0.03], [b[0], b[1], DOOR[1] - 0.03], [b[0], b[1], DOOR[0] + 0.03]];
      glass.addGeo(quadGeo(corners), null);
      const fr = [...corners, corners[0]];
      trim.loft(sweepRings(fr, circle(T.n(6, 4), 0.012)), { color: C.butter, uv: () => RM.paint });
      const lw = fusHalfWidth(1.9, DOOR_LOW) + 0.015;
      body.addGeo(new THREE.BoxGeometry(0.02, SILL - DOOR_LOW, DOOR[1] - DOOR[0] - 0.04), M4(lw, DOOR_LOW - (SILL - DOOR_LOW) / 2, (DOOR[0] + DOOR[1]) / 2, 1, 1, 1, 0, 0, -0.06), swP);
    }
    if (T.detail) {
      // inner liner (left wall + floor + right wall, the right one cut for the door)
      const U = (s, yTopR, inset = 0.02) => {
        const r = [], K = T.i(5, 2);
        for (let k = 0; k <= K; k++) { const y = lerp(SILL, FLOOR, k / K); r.push([-(fusHalfWidth(s, y) - inset), y, s]); }
        for (let k = 0; k <= K; k++) { const y = lerp(FLOOR, yTopR, k / K); r.push([fusHalfWidth(s, y) - inset, y, s]); }
        return r;
      };
      const linerOut = (p) => [-p[0], -(p[1] - 1.5), 0];
      const col = (p) => (p[1] < FLOOR + 0.02 ? C.floor : C.int);
      trim.loft(span(CAB[0] + 0.08, DOOR[0]).map((s) => U(s, SILL)), { closed: false, out: linerOut, color: col, uv: () => RM.cloth });
      trim.loft(span(DOOR[0], DOOR[1]).map((s) => U(s, DOOR_LOW)), { closed: false, out: linerOut, color: col, uv: () => RM.cloth });
      trim.loft(span(DOOR[1], CAB[1] - 0.02).map((s) => U(s, SILL)), { closed: false, out: linerOut, color: col, uv: () => RM.cloth });
      // rear bulkhead (baggage), tandem seats with red leather cushions, the front seat back frame
      const bs = CAB[1] - 0.02, ring = U(bs, SILL);
      ring.push(...arc(bs, Math.PI / 2, -Math.PI / 2, T.n(10, 4), 0.02).slice(1, -1).map((p) => [p[0], p[1], bs]).reverse().reverse());
      fan(trim, ring, [0, 0, -1], RM.cloth, C.intDark);
      for (const [s, back] of [[SEAT.s, true], [2.56, true]]) {
        trim.addGeo(new THREE.BoxGeometry(0.44, 0.08, 0.38), M4(0, FLOOR + 0.17, s - 0.1), RM.leather, C.seat);
        if (back) { trim.addGeo(new THREE.BoxGeometry(0.42, 0.42, 0.06), M4(0, FLOOR + 0.45, s + 0.12, 1, 1, 1, 0.15, 0, 0), RM.leather, C.seat); rod(trim, [-0.21, FLOOR + 0.12, s + 0.12], [-0.21, FLOOR + 0.67, s + 0.18], 0.01, 6, RM.paint, C.dark); rod(trim, [0.21, FLOOR + 0.12, s + 0.12], [0.21, FLOOR + 0.67, s + 0.18], 0.01, 6, RM.paint, C.dark); }
        for (const sg of [-1, 1]) rod(trim, [sg * 0.2, FLOOR, s - 0.25], [sg * 0.2, FLOOR + 0.13, s - 0.25], 0.01, 6, RM.paint, C.dark);
      }
    }
  }

  // ---------- engine: four cylinders poking out of the cowl, exhausts ----------
  if (!T.lod2) {
    for (const sg of [-1, 1]) for (const s of [0.42, 0.66]) {
      const x0 = sg * 0.24, x1 = sg * 0.44;
      const K = T.fine ? 7 : T.detail ? 4 : 0;
      trim.addGeo(new THREE.CylinderGeometry(0.058, 0.058, Math.abs(x1 - x0), T.n(12, 6)), M4((x0 + x1) / 2, 1.27, s + sg * 0.03, 1, 1, 1, 0, 0, Math.PI / 2), RM.darkMetal, C.cyl);
      for (let k = 0; k < K; k++) { const x = lerp(x0 + sg * 0.03, x1 - sg * 0.02, k / Math.max(1, K - 1)); trim.addGeo(new THREE.CylinderGeometry(0.075, 0.075, 0.008, T.n(14, 6)), M4(x, 1.27, s + sg * 0.03, 1, 1, 1, 0, 0, Math.PI / 2), RM.darkMetal, C.fin); }
      trim.addGeo(new THREE.BoxGeometry(0.05, 0.09, 0.13), M4(x1 + sg * 0.02, 1.27, s + sg * 0.03), RM.darkMetal, C.dark);
    }
    for (const sg of [-1, 1]) {
      const ex = [[sg * 0.2, 0.98, 0.5], [sg * 0.16, 0.9, 0.62], [sg * 0.12, 0.86, 0.85]];
      trim.loft(sweepRings(ex, circle(T.n(8, 4), 0.025)), { color: C.exhaust, uv: () => [0.7, 0.4], capStart: true, capEnd: false });
    }
  }

  // ---------- wing ----------
  const nC = T.n(22, 6), wingStep = T.step(0.4);
  const spanX = (a, b, step) => { const n = Math.max(1, Math.ceil(Math.abs(b - a) / step)); return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n); };
  const ring = (x, loop) => { const w = wingSec(x); return loop.map(([xc, yv]) => [x, w.y + yv * w.c * w.thk, w.le + xc * w.c]); };
  const panel = (B, xs, cFrom, cTo, roundNose, caps = [true, true]) => {
    const { loop, topCount } = airfoilLoop(FOIL, nC, cFrom, cTo, roundNose);
    const top = topCount - 1 + (cFrom > 0 && roundNose ? 3 : 0);
    B.loft(xs.map((x) => ring(x, loop)), {
      out: () => [0, 1, 0],
      splits: [[0, top, (p) => uvPlan(REG.wT, p[0], p[2])], [top, loop.length, (p) => uvPlan(REG.wB, p[0], p[2])]],
      capStart: caps[0], capEnd: caps[1], capUV: swP,
    });
  };
  const tipXs = (sign, from) => {
    const r = spanX(from, WING.half - 0.55, wingStep);
    const K = T.i(7, 2);
    for (let k = 1; k <= K; k++) r.push(WING.half - 0.55 + 0.55 * (1 - (1 - k / K) ** 1.7));
    return r.map((x) => x * sign);
  };
  const H = WING.hinge, A0 = WING.ail[0], A1 = WING.ail[1], pieces = {};
  panel(body, [...spanX(-A0, A0, wingStep)], 0, 1, false);
  for (const sg of [1, -1]) {
    const S = (a) => a.map((x) => x * sg);
    panel(body, S(spanX(A0, A1, wingStep)), 0, H, false);
    panel(body, tipXs(sg, A1), 0, 1, false);
    const a = A0 + 0.015, b = A1 - 0.015, B = new Builder();
    panel(B, S(spanX(a, b, wingStep)), H + 0.006, 1, true);
    const hp = (x) => { const w = wingSec(x); const [yu, yl] = FOIL(H + 0.012); return [x, w.y + ((yu + yl) / 2) * w.c, w.le + (H + 0.012) * w.c]; };
    pieces[sg > 0 ? 'ailR' : 'ailL'] = { B, a: hp(sg > 0 ? a : -b), b: hp(sg > 0 ? b : -a) };
  }

  // ---------- lift struts (V each side), jury struts ----------
  const strutProf = (c, t) => streamline(T.n(12, 4), c, t);
  const strut = (B, a, b, c = 0.07, t = 0.024, uv = swP) => {
    const path = [];
    for (let k = 0; k <= 3; k++) path.push([lerp(a[0], b[0], k / 3), lerp(a[1], b[1], k / 3), lerp(a[2], b[2], k / 3)]);
    B.loft(sweepRings(path, strutProf(c, t), { upHint: [0, 0, 1] }), { uv, capStart: true, capEnd: true, capUV: uv });
  };
  const wBot = (x, f) => { const w = wingSec(x); return [x, w.y + FOIL(f)[1] * w.c * w.thk + 0.005, w.le + f * w.c]; };
  for (const sg of [1, -1]) {
    const tops = STRUT.f.map((f) => wBot(sg * STRUT.x, f));
    STRUT.root.forEach((r, i) => strut(body, [sg * r[0], r[1], r[2]], tops[i]));
    if (T.detail) for (const [i, f] of [[0, 0.45], [1, 0.45]]) {
      const r = STRUT.root[i], m = [lerp(sg * r[0], tops[i][0], f), lerp(r[1], tops[i][1], f), lerp(r[2], tops[i][2], f)];
      strut(body, m, wBot(m[0], STRUT.f[i]), 0.035, 0.012);
    }
  }

  // ---------- tail ----------
  const sym = naca(0, 0.4, 0.08);
  const stabSec = (x) => {
    const ax = Math.abs(x), k = clamp((ax - (STAB.half - 0.55)) / 0.55, 0, 1);
    const le = STAB.le + 0.04 * (ax / STAB.half) + 0.4 * k ** 2.2, te = STAB.te - 0.12 * k ** 2.4 - (ax < 0.14 ? 0.2 * (1 - ax / 0.14) ** 0.5 : 0);
    return { le, te, c: te - le, thk: Math.sqrt(Math.max(0.05, 1 - k ** 3)) };
  };
  const tailRing = (x, f0, f1, roundNose) => {
    const s = stabSec(x), fh = (STAB.hinge - s.le) / s.c;
    const { loop } = airfoilLoop(sym, T.n(14, 6), f0 === 'h' ? fh + 0.012 : f0, f1 === 'h' ? fh : f1, roundNose);
    return loop.map(([xc, yv]) => [x, STAB.y + yv * s.c * s.thk, s.le + xc * s.c]);
  };
  const tUV = (p) => uvPlan(REG.tail, p[0], p[2]);
  const stabXs = []; { const K = T.n(14, 4); for (let k = 0; k <= K; k++) stabXs.push(-STAB.half + 2 * STAB.half * (0.5 - 0.5 * Math.cos(Math.PI * k / K))); }
  body.loft(stabXs.map((x) => tailRing(x, 0, 'h', false)), { out: () => [0, 1, 0], uv: tUV, capStart: true, capEnd: true, capUV: swP });
  const elev = new Builder();
  for (const sg of [1, -1]) {
    const xs = stabXs.filter((x) => x * sg >= 0.07);
    if (sg > 0) xs.unshift(0.07); else xs.push(-0.07);
    elev.loft(xs.map((x) => tailRing(x, 'h', 1, true)), { out: () => [0, 1, 0], uv: tUV, capStart: true, capEnd: true, capUV: swP });
  }
  pieces.elevator = { B: elev, a: [-1, STAB.y, STAB.hinge + 0.012], b: [1, STAB.y, STAB.hinge + 0.012] };
  const sym10 = naca(0, 0.4, 0.09);
  const finUV = (p) => uvSide(p[0] >= 0 ? REG.rudR : REG.rudL, p[2], p[1]);
  {
    const ys = [], K = T.i(8, 3);
    for (let k = 0; k <= K; k++) ys.push(lerp(FIN.base, FIN.top - 0.12, k / K));
    const R = ys.map((y) => {
      const u = (y - FIN.base) / (FIN.top - FIN.base), le = lerp(FIN.le0, FIN.le1, u ** 0.9), te = FIN.hinge - 0.012, c = Math.max(0.03, te - le);
      const { loop } = airfoilLoop(sym10, T.n(12, 6), 0, 1, false);
      return loop.map(([xc, yv]) => [yv * c, y, le + xc * c]);
    });
    body.loft(R, { out: () => [1, 0, 0], uv: finUV, capEnd: true, capUV: finUV });
  }
  {
    const rudTe = (y) => { const t = clamp((y - RUD.bot) / (RUD.top - RUD.bot), 0, 1); return RUD.hinge + 0.06 + 0.36 * Math.sqrt(Math.max(0, 1 - (2 * t - 0.85) ** 2)) ** 0.7; };
    const rudLe = (y) => (y > FIN.top - 0.12 ? RUD.hinge - 0.17 * Math.sin(Math.PI * clamp((y - (FIN.top - 0.12)) / 0.12, 0, 1) ** 0.6) * 0.6 : RUD.hinge + 0.012);
    const rud = new Builder(), ys = [], K = T.i(14, 5);
    for (let k = 0; k <= K; k++) ys.push(lerp(RUD.bot, RUD.top, 0.5 - 0.5 * Math.cos(Math.PI * k / K)));
    const R = ys.map((y) => {
      let le = rudLe(y), te = rudTe(y);
      const t = (y - RUD.bot) / (RUD.top - RUD.bot);
      if (t < 0.03 || t > 0.97) te = Math.max(le + 0.03, te);
      const c = Math.max(0.02, te - le), thk = Math.sqrt(Math.max(0.05, 1 - (2 * t - 1) ** 8));
      const { loop } = airfoilLoop(sym10, T.n(12, 6), 0, 1, false);
      return loop.map(([xc, yv]) => [yv * c * thk * 0.9, y, le + xc * c]);
    });
    rud.loft(R, { out: () => [1, 0, 0], uv: finUV, capStart: true, capEnd: true, capUV: finUV });
    pieces.rudder = { B: rud, a: [0, RUD.bot, RUD.hinge + 0.015], b: [0, RUD.top, RUD.hinge + 0.015] };
  }
  if (T.detail) for (const sg of [1, -1]) {
    // tail brace wires
    const w = (a, b) => rod(trim, a, b, 0.005, 4, RM.chrome, C.steel);
    w([sg * 0.9, STAB.y + 0.02, STAB.le + 0.28], [0, FIN.top - 0.25, 6.0]);
    w([sg * 0.9, STAB.y - 0.02, STAB.le + 0.28], [sg * 0.05, fus(6.0).yb + 0.02, 6.0]);
  }

  // ---------- landing gear: bungee V-legs, fat tyres, discs; leaf-spring tailwheel ----------
  for (const sg of [1, -1]) {
    const ax = [sg * MAIN.half, MAIN.r, MAIN.s];
    const fr = [sg * 0.28, fus(1.1).yb + 0.05, 1.1], rr = [sg * 0.28, fus(1.85).yb + 0.04, 1.85], near = [ax[0] - sg * 0.08, ax[1] + 0.03, ax[2]];
    strut(body, fr, near, 0.06, 0.03, swP);
    strut(body, rr, [near[0], near[1], near[2] + 0.02], 0.06, 0.03, swP);
    if (T.detail) {
      rod(trim, [sg * 0.05, fus(1.45).yb + 0.01, 1.45], [near[0] - sg * 0.05, near[1] + 0.05, near[2]], 0.016, T.n(6, 4), RM.paint, C.dark);
      trim.addGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.12, T.n(10, 6)), M4(sg * 0.42, fus(1.45).yb + 0.06, 1.45, 1, 1, 1, 0, 0, Math.PI / 2), RM.cloth, srgb('#d8d2c2'));
    }
    const tire = new THREE.TorusGeometry(MAIN.r - MAIN.w * 0.45, MAIN.w * 0.48, T.n(10, 4), T.n(28, 10));
    tire.scale(1, 1, 1.25);
    trim.addGeo(tire, M4(ax[0], ax[1], ax[2], 1, 1, 1, 0, Math.PI / 2, 0), RM.rubber, C.tire);
    body.addGeo(new THREE.SphereGeometry(1, T.n(20, 8), T.n(6, 3)), M4(ax[0], ax[1], ax[2], 0.05, MAIN.r - MAIN.w * 0.75, MAIN.r - MAIN.w * 0.75), sw('primary'), [1, 1, 1]);
  }
  {
    const ty = TAILW.y + TAILW.r, ts = TAILW.s;
    rod(trim, [0, fus(5.75).yb + 0.01, 5.75], [0, ty + 0.06, ts - 0.04], 0.016, T.n(6, 4), RM.paint, C.dark);
    rod(trim, [0, ty + 0.06, ts - 0.04], [0, ty, ts], 0.012, T.n(6, 4), RM.steel, C.steel);
    const tw = new THREE.TorusGeometry(TAILW.r * 0.62, TAILW.r * 0.38, T.n(8, 4), T.n(16, 8));
    trim.addGeo(tw, M4(0, ty, ts, 1, 1, 1.3, 0, Math.PI / 2, 0), RM.rubber, C.tire);
    trim.addGeo(new THREE.CylinderGeometry(TAILW.r * 0.32, TAILW.r * 0.32, 0.05, T.n(10, 6)), M4(0, ty, ts, 1, 1, 1, 0, 0, Math.PI / 2), RM.steel, C.steel);
  }

  // ---------- lights ----------
  const lightPts = [];
  for (const [sg, col] of [[-1, C.lensR], [1, C.lensG]]) {
    const w = wingSec(sg * (WING.half - 0.05));
    const p = [sg * (WING.half - 0.04), w.y, w.le + 0.08];
    lights.addGeo(new THREE.SphereGeometry(0.03, T.n(8, 4), T.n(6, 3)), M4(...p, 0.8, 0.8, 1.3), [0, 0], col);
    lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
  }
  { const p = [0, 1.62, RUD.hinge + 0.42]; lights.addGeo(new THREE.SphereGeometry(0.022, T.n(8, 4), T.n(6, 3)), M4(...p), [0, 0], C.lensW); lightPts.push({ p, col: [1, 1, 0.92], kind: 'nav' }); }

  // ---------- propeller: two-blade wood, no spinner, a bolted hub ----------
  const prop = new Builder();
  {
    const PR = 0.915;
    prop.addGeo(new THREE.CylinderGeometry(0.08, 0.08, 0.14, T.n(16, 8)), M4(0, 0, 0, 1, 1, 1, Math.PI / 2, 0, 0), RM.varnish, C.wood);
    prop.addGeo(new THREE.CylinderGeometry(0.065, 0.065, 0.025, T.n(16, 8)), M4(0, 0, -0.08, 1, 1, 1, Math.PI / 2, 0, 0), RM.steel, C.steel);
    if (T.detail) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; prop.addGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6), M4(Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.095, 1, 1, 1, Math.PI / 2, 0, 0), RM.steel, C.chrome); }
    const rs = [], K = T.i(14, 5);
    for (let k = 0; k <= K; k++) rs.push(lerp(0.07, PR, k / K));
    rs.splice(rs.length - 1, 0, PR - 0.02, PR - 0.008);
    for (const rot of [0, Math.PI]) {
      const R = [];
      for (const r of rs) {
        const u = (r - 0.07) / (PR - 0.07);
        let c = r < 0.15 ? lerp(0.09, 0.13, (r - 0.07) / 0.08) : 0.13 + 0.015 * Math.sin(Math.PI * Math.min(1, (r - 0.15) / 0.7)) - 0.04 * u * u;
        if (r > PR - 0.06) c *= Math.sqrt(Math.max(0.12, 1 - ((r - (PR - 0.06)) / 0.062) ** 2));
        const t = lerp(0.5, 0.09, Math.min(1, u * 1.4)), phi = Math.atan(1.3 / (2 * Math.PI * Math.max(0.12, r)));
        const { loop } = airfoilLoop(naca(0.035, 0.4, t), T.n(10, 4), 0, 1, false);
        const cp = Math.cos(phi), sp = Math.sin(phi);
        R.push(loop.map(([xc, yv]) => {
          const a = (xc - 0.35) * c, b = yv * c, x = -cp * a - sp * b, z = sp * a - cp * b - 0.01;
          return [x * Math.cos(rot) - r * Math.sin(rot), x * Math.sin(rot) + r * Math.cos(rot), z];
        }));
      }
      prop.loft(R, {
        out: () => [0, 0, -1], capEnd: true, capStart: true,
        color: (p) => { const r = Math.hypot(p[0], p[1]); return r > PR - 0.05 ? C.butter : lerpC(C.wood, C.woodDark, 0.5 + 0.5 * Math.sin(r * 29 + p[2] * 90)); },
        uv: (p) => (Math.hypot(p[0], p[1]) > PR - 0.05 ? RM.paint : RM.varnish),
      });
    }
  }

  // ---------- assemble ----------
  const group = new THREE.Group();
  const meshes = {};
  meshes.body = mkMesh('body', body, mats.paint); group.add(meshes.body);
  meshes.trim = mkMesh('trim', trim, mats.trim); group.add(meshes.trim);
  meshes.glass = mkMesh('glass', glass, mats.glass, { cast: false, receive: false }); meshes.glass.renderOrder = 2; group.add(meshes.glass);
  meshes.lights = mkMesh('lights', lights, mats.lights, { cast: false, receive: false }); group.add(meshes.lights);
  const hinges = {};
  for (const [name, pc] of Object.entries(pieces)) hinges[name] = hinge(group, name, pc.B, mats.paint, pc.a, pc.b);
  const propGroup = new THREE.Group();
  propGroup.position.set(0, THRUST_Y, 0.02);
  const propMesh = new THREE.Mesh(prop.build(), mats.prop);
  propMesh.name = 'prop'; propMesh.castShadow = true;
  propGroup.add(propMesh);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.915, T.n(48, 16)), mats.disc);
  disc.position.z = -0.03; disc.renderOrder = 3; disc.name = 'propDisc';
  propGroup.add(disc);
  group.add(propGroup);
  return { group, meshes, hinges, propGroup, propMesh, disc, lightPts };
}

function quadGeo(c) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...c[0], ...c[1], ...c[2], ...c[3]], 3));
  const n = new THREE.Vector3().subVectors(new THREE.Vector3(...c[1]), new THREE.Vector3(...c[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c[3]), new THREE.Vector3(...c[0]))).normalize();
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...n.toArray(), ...n.toArray(), ...n.toArray(), ...n.toArray()], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

// ---------- cockpit: a brown-black J-3 panel with five dials, a wet compass, stick, wall throttle, heel pedals ----------
const PS = 1.06;
export const THROTTLE = { x: -0.3, y: 1.1, s: 1.66, len: 0.14 };
export const throttleKnob = (th) => { const a = (0.5 - th) * 0.95; return [THROTTLE.x + 0.025, THROTTLE.y + Math.cos(a) * THROTTLE.len, THROTTLE.s + Math.sin(a) * THROTTLE.len]; };
function cubCockpit(quality, mats, ctx) {
  const y0 = 1.24, y1 = 1.66, outline = [];
  for (let k = 0; k <= 4; k++) { const y = lerp(y0, y1 - 0.04, k / 4); outline.push([fusHalfWidth(PS, y) - 0.02, y]); }
  for (let k = 0; k <= 8; k++) { const x = lerp(fusHalfWidth(PS, y1) - 0.06, -(fusHalfWidth(PS, y1) - 0.06), k / 8); outline.push([x, y1 + 0.012 * Math.cos((x / 0.3) * 1.2)]); }
  for (let k = 4; k >= 0; k--) { const y = lerp(y0, y1 - 0.04, k / 4); outline.push([-(fusHalfWidth(PS, y) - 0.02), y]); }
  const gauges = { asi: [-0.2, 1.47, 0.08], alt: [-0.07, 1.5, 0.08], tach: [0.07, 1.5, 0.085], tc: [0.2, 1.47, 0.075] };
  return buildPanelCockpit(quality, mats, ctx, {
    name: 'cub', PS, outline, box: { x0: -0.4, x1: 0.4, y0, y1: y1 + 0.02 }, gauges, bezel: 'chrome', screws: '#9a9a96',
    paint(g, txt, h) {
      g.fillStyle = '#1e1a16'; g.fillRect(-0.4, y0, 0.8, 0.5);
      h.noise(4000, 0.1, true);
      for (const [k, l] of [['asi', 'AIRSPEED'], ['alt', 'ALTITUDE'], ['tach', 'R.P.M.'], ['tc', 'TURN']]) txt(l, gauges[k][0], gauges[k][1] - gauges[k][2] / 2 - 0.022, 0.0105, '#e9dfc4');
      paintDial(g, 'oil', -0.07, 1.35, 0.05); paintDial(g, 'oil', 0.07, 1.35, 0.05);
      txt('OIL °', -0.07, 1.31, 0.0085); txt('OIL PSI', 0.07, 1.31, 0.0085);
      g.fillStyle = '#d8ccab'; g.beginPath(); g.roundRect(-0.13, y1 - 0.045, 0.26, 0.036, 0.004); g.fill();
      txt('BY ROYAL WARRANT', 0, y1 - 0.022, 0.0105, '#2a2418'); txt('BUTTER UP BEFORE TAKEOFF', 0, y1 - 0.036, 0.0078, '#2a2418', '600');
      g.fillStyle = '#d8ccab'; g.beginPath(); g.roundRect(-0.3, 1.3, 0.13, 0.034, 0.003); g.fill();
      txt('MAGS  OFF·L·R·BOTH', -0.235, 1.317, 0.0068, '#2a2418');
      g.fillStyle = '#d8ccab'; g.beginPath(); g.roundRect(0.17, 1.3, 0.13, 0.034, 0.003); g.fill();
      txt('FUEL: SEE CORK', 0.235, 1.322, 0.0074, '#2a2418'); txt('ON THE WIRE', 0.235, 1.309, 0.0068, '#2a2418', '600');
    },
    extras(B, n, high) {
      // wet compass on the glareshield, the fuel-gauge cork wire out of the nose, mag switch, primer
      B.addGeo(new THREE.BoxGeometry(0.075, 0.065, 0.07), M4(0, y1 + 0.04, PS - 0.01), RM.black, CK.black);
      B.addGeo(new THREE.CylinderGeometry(0.026, 0.026, 0.004, n(16)), M4(0, y1 + 0.04, PS + 0.026, 1, 1, 1, Math.PI / 2, 0, 0), RM.glass, CK.cream);
      B.addGeo(new THREE.BoxGeometry(0.66, 0.02, 0.08), M4(0, y1 + 0.005, PS - 0.03), RM.leatherWorn, CK.black);
      rod(B, [0, 1.62, 0.5], [0, 1.8, 0.62], 0.0025, 4, RM.steel, CK.steel);
      if (high) B.addGeo(new THREE.SphereGeometry(0.012, 8, 6), M4(0, 1.8, 0.62), RM.cloth, srgb('#c9a67a'));
      B.addGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.03, n(10)), M4(-0.24, 1.38, PS + 0.016, 1, 1, 1, Math.PI / 2, 0, 0), RM.chrome, CK.chrome);
      B.addGeo(new THREE.BoxGeometry(0.025, 0.012, 0.012), M4(-0.24, 1.38, PS + 0.034), RM.black, CK.black);
      B.addGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.05, n(8)), M4(0.24, 1.38, PS + 0.025, 1, 1, 1, Math.PI / 2, 0, 0), RM.chrome, CK.chrome);
      // firewall and footwell under the panel, floor boards
      { const ring = []; for (let k = 0; k <= 6; k++) { const y = lerp(FLOOR - 0.02, y0, k / 6); ring.push([fusHalfWidth(PS, y) - 0.015, y, PS - 0.002]); } for (let k = 6; k >= 0; k--) { const y = lerp(FLOOR - 0.02, y0, k / 6); ring.push([-(fusHalfWidth(PS, y) - 0.015), y, PS - 0.002]); } fan(B, ring, [0, 0, 1], RM.cloth, srgb('#2e2820')); }
      B.addGeo(new THREE.BoxGeometry(0.5, 0.012, 1.2), M4(0, FLOOR + 0.006, PS + 0.6), RM.wood, srgb('#4a3423'));
      // the throttle's slot on the left wall
      B.addGeo(new THREE.BoxGeometry(0.02, 0.05, 0.22), M4(THROTTLE.x - 0.005, THROTTLE.y + 0.08, THROTTLE.s), RM.black, CK.black);
    },
    stick: (sb, n, high) => stickGeom(sb, n, high, { len: 0.5 }),
    throttle: {
      pos: [THROTTLE.x + 0.025, THROTTLE.y, THROTTLE.s], len: THROTTLE.len,
      build(tb) { tb.addGeo(new THREE.BoxGeometry(0.01, THROTTLE.len, 0.016), M4(0, THROTTLE.len / 2, 0), RM.steel, CK.steel); tb.addGeo(new THREE.SphereGeometry(0.02, 10, 8), M4(0, THROTTLE.len, 0, 1, 0.8, 1.2), RM.plastic, CK.black); },
      anim(g, th) { g.rotation.x = (0.5 - th) * 0.95; },
    },
    rudder: { pos: [0, FLOOR + 0.03, 1.28], w: 0.42 },
  });
}

const D2R = Math.PI / 180;
const MAX = { aileron: 20 * D2R, elevUp: 28 * D2R, elevDown: 22 * D2R, rudder: 25 * D2R };
export const CUB_DIMS = { length: 6.83, span: 10.74, height: 2.03, gearHeight: CG.y, groundPitch: GROUND_PITCH };

export function createCub(opts = {}) {
  const def = {
    id: 'cub', cg: CG, eye: EYE, eyeCenter: { x: 0, y: EYE.y + 0.05, s: EYE.s + 0.08, pitch: -0.08 },
    portrait: { center: [0, 0.06, 0.18], cockpit: [0, 0.05, 0.16], fov: 90, pitch: -0.1 },
    dims: { ...CUB_DIMS, restHeight: CG.y * Math.cos(GROUND_PITCH) - (CG.s - MAIN.s) * Math.sin(GROUND_PITCH) },
    lod: [240, 140], rpm: { idle: 600, max: 1500 },
    pilotWithoutCockpit: true,
    createLivery: (q) => createCubLivery(q),
    createMaterials: (q, l) => createCubMaterials(q, l),
    buildExterior: (q, mats) => buildCubExterior(q, mats),
    buildCockpit: (q, mats, ctx) => cubCockpit(q, mats, ctx),
    stick: { pos: [0, FLOOR, 1.56], move(stick, cur) { stick.rotation.set(cur.elevator * 0.24, 0, -cur.aileron * 0.24); } },
    createPilot: (q, cfg) => createAviator({
      quality: q, cfg, seat: SEAT, outfit: 'flyer', gripLocal: [0, 0.48, 0],
      leftHand: (cur) => throttleKnob(cur.throttle), elbowOut: 0.2,
      passengers: cfg.passenger === false ? [] : [{ kind: 'corgi', at: [0, FLOOR + 0.28, 2.5] }],
    }),
    animate(ext, cur) {
      const h = ext.hinges;
      h.ailR.rotation.x = -cur.aileron * MAX.aileron * (cur.aileron > 0 ? 1 : 0.6);
      h.ailL.rotation.x = cur.aileron * MAX.aileron * (cur.aileron < 0 ? 1 : 0.6);
      h.elevator.rotation.x = -(cur.elevator > 0 ? cur.elevator * MAX.elevUp : cur.elevator * MAX.elevDown);
      h.rudder.rotation.x = cur.rudder * MAX.rudder;
    },
  };
  return assembleRig(def, opts);
}
