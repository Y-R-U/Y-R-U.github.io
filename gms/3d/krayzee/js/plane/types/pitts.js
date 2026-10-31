import * as THREE from 'three';
import { Builder, monotone, naca, airfoilLoop, sweepRings, streamline, circle, latheRings, lerp, clamp, srgb } from '../geom.js';
import { uvSide, uvPlan } from '../livery.js';
import { tess, pbrMaterial, RM, mkMesh, hinge, M4, rod, atlas, pick, shade, crest, canvasTexture, fan } from './kit.js';
import { assembleRig } from './rig.js';
import { createAviator } from './aviator.js';
import { buildPanelCockpit, paintDial, stickGeom, COL as CK } from './cub_cockpit.js';

// Pitts Special S-2 ("Show-Off"): short, stubby aerobatic biplane, sunburst paint, spatted wheels, swept upper wing,
// four ailerons, I-struts. Build frame as the Tiger: y = height above ground with the datum LEVEL and the mains on
// y = 0; z = station aft of the propeller hub face. Real: span 6.1, length 5.4, wing area 11.6 m², prop 1.93.
// Flown from the rear (open) cockpit; the front one wears its metal cover.
export const CG = { s: 1.45, y: 1.05 };
export const THRUST_Y = 1.32;
export const MAIN = { s: 1.1, half: 0.75, r: 0.2, w: 0.12 };
export const TAILW = { s: 4.75, r: 0.06, y: 0.776 };
export const GROUND_PITCH = Math.atan2(TAILW.y, TAILW.s - MAIN.s);
export const OPEN = [2.18, 2.82];
export const SEAT = { x: 0, y: 1.2, s: 2.64 };
export const EYE = { x: 0, y: 1.86, s: 2.58, pitch: -0.14 };
const FLOOR = 0.98;

// [station, halfWidth, top, bottom, waist, nTop, nBottom]
const FUS = [
  [0.1, 0.28, 1.58, 1.06, 1.32, 2.2, 2.2],
  [0.2, 0.35, 1.67, 0.97, 1.32, 2.3, 2.4],
  [0.45, 0.385, 1.72, 0.91, 1.32, 2.5, 2.8],
  [0.9, 0.385, 1.75, 0.88, 1.33, 2.6, 3.2],
  [1.3, 0.37, 1.77, 0.87, 1.34, 2.6, 4],
  [1.9, 0.345, 1.78, 0.88, 1.36, 2.5, 5],
  [2.6, 0.31, 1.76, 0.92, 1.38, 2.4, 5],
  [3.3, 0.24, 1.66, 1.01, 1.38, 2.3, 4],
  [4.2, 0.14, 1.52, 1.13, 1.36, 2.2, 3],
  [4.85, 0.05, 1.45, 1.23, 1.35, 2.1, 2.4],
  [5.05, 0.015, 1.43, 1.28, 1.36, 2, 2],
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

const CH = 1.0;
export const UPPER = { le0: 0.92, y: 2.06, centre: 0.3, half: 3.05, sweep: Math.tan((7 * Math.PI) / 180), ail: [0.9, 2.75], hinge: 0.72 };
export const LOWER = { le0: 1.42, y: 0.96, root: 0.34, half: 2.98, dihedral: Math.tan((3 * Math.PI) / 180), ail: [0.75, 2.7], hinge: 0.72 };
function tipShape(ax, half, le, c, thk, y) {
  const tip = half - 0.32;
  if (ax > tip) { const k = (ax - tip) / (half - tip); const te = le + c - 0.06 * k ** 2.4; le += 0.3 * k ** 2.2; c = Math.max(0.02, te - le); thk = Math.sqrt(Math.max(0.03, 1 - k ** 2.4)); y -= 0.015 * k; }
  return { le, c, y, thk };
}
export function upperSec(x) { const ax = Math.abs(x); return tipShape(ax, UPPER.half, UPPER.le0 + Math.max(0, ax - UPPER.centre) * UPPER.sweep, CH, 1, UPPER.y); }
export function lowerSec(x) { const ax = Math.max(LOWER.root, Math.abs(x)); return tipShape(ax, LOWER.half, LOWER.le0, CH * 0.96, 1, LOWER.y + (ax - LOWER.root) * LOWER.dihedral); }
export const STAB = { y: 1.41, half: 1.0, le: 4.3, hinge: 4.68, te: 5.02 };
export const RUD = { hinge: 4.97, bot: 1.12, top: 2.14 };
export const FOIL = naca(0.008, 0.4, 0.13);
const STRUT_X = 2.5;

// ---------- livery: the sunburst ----------
const REG = {
  fusL: { x0: 0, x1: 1, y0: 0, y1: 0.2, s0: -0.05, s1: 5.5, h0: 0.8, h1: 1.85, flip: false },
  fusR: { x0: 0, x1: 1, y0: 0.2, y1: 0.4, s0: -0.05, s1: 5.5, h0: 0.8, h1: 1.85, flip: true },
  rudL: { x0: 0, x1: 0.33, y0: 0.4, y1: 0.56, s0: 4.3, s1: 5.5, h0: 1.05, h1: 2.2, flip: false },
  rudR: { x0: 0.33, x1: 0.66, y0: 0.4, y1: 0.56, s0: 4.3, s1: 5.5, h0: 1.05, h1: 2.2, flip: true },
  tail: { x0: 0.66, x1: 1, y0: 0.4, y1: 0.56, a0: -1.15, a1: 1.15, s0: 4.2, s1: 5.15, flip: false },
  uwT: { x0: 0, x1: 1, y0: 0.56, y1: 0.67, a0: -3.15, a1: 3.15, s0: 0.85, s1: 2.35, flip: false },
  uwB: { x0: 0, x1: 1, y0: 0.67, y1: 0.76, a0: -3.15, a1: 3.15, s0: 0.85, s1: 2.35, flip: true },
  lwT: { x0: 0, x1: 1, y0: 0.76, y1: 0.87, a0: -3.1, a1: 3.1, s0: 1.35, s1: 2.5, flip: false },
  lwB: { x0: 0, x1: 1, y0: 0.87, y1: 0.975, a0: -3.1, a1: 3.1, s0: 1.35, s1: 2.5, flip: true },
};
const SW = ['primary', 'secondary', 'accent', 'metal', 'dark', 'black', 'primaryDark', 'white'];
const sw = (name) => [(SW.indexOf(name) + 0.5) / SW.length, 1 - 0.99];

// alternating wedges radiating from (cx, cy) between angles a0..a1
function rays(c, cx, cy, n, a0, a1, len, col, edge) {
  for (let i = 0; i < n; i++) {
    const u0 = a0 + (a1 - a0) * (i / n), u1 = a0 + (a1 - a0) * ((i + 0.5) / n);
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(u0) * len, cy + Math.sin(u0) * len); c.lineTo(cx + Math.cos(u1) * len, cy + Math.sin(u1) * len); c.closePath();
    c.fillStyle = col; c.fill();
    if (edge) { c.strokeStyle = edge; c.lineWidth = 0.012; c.stroke(); }
  }
}

function createPittsLivery(quality) {
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
    g.fillStyle = 'rgb(0,120,0)'; g.fillRect(0, 0, 256, 256);   // a glossy show finish
    roughTex.needsUpdate = true;
  }
  function paintSide(c, T, L) {
    const { primary, secondary, accent } = L;
    c.fillStyle = primary; c.fillRect(-1, 0, 7, 3);
    // sunburst from the nose, fanning aft along the fuselage
    c.save(); c.beginPath(); c.rect(0.2, 0.7, 2.4, 1.3); c.clip();
    rays(c, -0.4, 1.32, 9, -0.42, 0.42, 3.4, secondary, accent);
    c.restore();
    // the cowl in secondary with an accent ring, louvres, fasteners
    c.fillStyle = secondary; c.fillRect(-1, 0, 1.22, 3);
    c.fillStyle = accent; c.fillRect(0.2, 0, 0.035, 3);
    c.strokeStyle = 'rgba(10,10,12,0.45)'; c.lineWidth = 0.006;
    c.beginPath(); c.moveTo(1.18, 0.9); c.lineTo(1.18, 1.75); c.moveTo(0.3, 1.33); c.lineTo(1.18, 1.34); c.stroke();
    for (let i = 0; i < 7; i++) { const x = 0.45 + i * 0.08; c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.roundRect(x, 1.04, 0.05, 0.014, 0.006); c.fill(); }
    for (let i = 0; i < 6; i++) for (const y of [1.6, 1.05]) { c.fillStyle = 'rgba(20,20,22,0.55)'; c.beginPath(); c.arc(0.35 + i * 0.15, y, 0.008, 0, 7); c.fill(); }
    // accent pinstripe down the length, the front cockpit's cover outline
    c.fillStyle = accent; c.beginPath(); for (let s = 0.25; s <= 5.0; s += 0.05) c.lineTo(s, fus(s).yw + 0.03); for (let s = 5.0; s >= 0.25; s -= 0.05) c.lineTo(s, fus(s).yw + 0.012); c.closePath(); c.fill();
    c.fillStyle = shade(primary, 0.85);
    c.beginPath(); for (let s = 1.2; s <= 5.0; s += 0.05) c.lineTo(s, fus(s).yb + 0.06); for (let s = 5.0; s >= 1.2; s -= 0.05) c.lineTo(s, fus(s).yb - 0.1); c.closePath(); c.fill();
    const nameCol = pick(primary, [secondary, accent], 2.6);
    A.text(c, T, L.display, 3.65, (fus(3.65).yw + fus(3.65).yt) / 2 - 0.02, 1.25, 0.17, { fill: nameCol, stroke: accent !== nameCol ? accent : null, strokeW: 6, slope: -0.05 });
    const regCol = pick(primary, ['#15181d', secondary, '#ffffff'], 4);
    A.text(c, T, L.registration, 3.7, fus(3.7).yb + 0.13, 0.7, 0.085, { font: '700', fill: regCol, slope: 0.03 });
  }
  function paintRudder(c, T, L) {
    c.fillStyle = L.primary; c.fillRect(4.2, 1.0, 1.4, 1.3);
    // classic stripes across the rudder, a crest at the top
    for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? L.primary : L.secondary; c.fillRect(RUD.hinge, 1.12 + i * 0.13, 0.6, 0.13); }
    c.fillStyle = L.accent; c.fillRect(RUD.hinge - 0.01, 1.0, 0.02, 1.3);
    crest(c, T, RUD.hinge + 0.2, 1.93, 0.32, { field: shade(L.secondary, 0.65), field2: '#a3162a', gold: '#e3bc55' });
  }
  function paintTail(c, L) {
    c.fillStyle = L.primary; c.fillRect(-2, 4, 4, 1.5);
    c.save(); c.beginPath(); c.rect(-1.2, 4.2, 2.4, 1.0); c.clip();
    rays(c, 0, 5.1, 10, -Math.PI + 0.2, -0.2, 1.4, L.secondary, L.accent);
    c.restore();
  }
  function paintWing(c, T, L, up, top) {
    const { primary, secondary, accent } = L;
    c.fillStyle = primary; c.fillRect(-4, 0.5, 8, 2.5);
    // the sunburst: rays from behind the wing centre fanning out to the tips
    const cy = up ? 2.25 : 2.45;
    rays(c, 0, cy, 14, -Math.PI + 0.12, -0.12, 4.2, secondary, accent);
    if (!top) { c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(-4, 0.5, 8, 2.5); }
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.006;
    const W = up ? UPPER : LOWER, sec = up ? upperSec : lowerSec;
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(sg * W.ail[0], sec(W.ail[0]).le + W.hinge * CH); c.lineTo(sg * W.ail[1], sec(W.ail[1]).le + W.hinge * CH); c.stroke(); }
    const colT = pick(primary, ['#15181d', '#ffffff'], 4);
    if (up && top) A.text(c, T, L.display, 0, (UPPER.le0 + UPPER.le0 + CH) / 2 - 0.05, 2.6, 0.42, { fill: pick(primary, [accent, '#ffffff', '#15181d'], 2.6), stroke: '#15181d', strokeW: 6, plan: true });
    if (!up && !top) for (const sg of [-1, 1]) A.text(c, T, L.registration, sg * 1.75, LOWER.le0 + 0.45, 1.6, 0.4, { font: '700', fill: colT, plan: true });
  }
  function draw(L) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    A.region(ctx, REG.fusL, A.side(REG.fusL), (c, T) => paintSide(c, T, L));
    A.region(ctx, REG.fusR, A.side(REG.fusR), (c, T) => paintSide(c, T, L));
    A.region(ctx, REG.rudL, A.side(REG.rudL), (c, T) => paintRudder(c, T, L));
    A.region(ctx, REG.rudR, A.side(REG.rudR), (c, T) => paintRudder(c, T, L));
    A.region(ctx, REG.tail, A.plan(REG.tail), (c) => paintTail(c, L));
    for (const k of ['uwT', 'uwB', 'lwT', 'lwB']) A.region(ctx, REG[k], A.plan(REG[k]), (c, T) => paintWing(c, T, L, k[0] === 'u', k[2] === 'T'));
    const cols = { primary: L.primary, secondary: L.secondary, accent: L.accent, metal: '#b9bec4', dark: '#24262a', black: '#0c0d0f', primaryDark: shade(L.primary, 0.8), white: '#f2f2ee' };
    const w = S / SW.length;
    SW.forEach((k, i) => { ctx.fillStyle = cols[k]; ctx.fillRect(i * w, S * 0.98, w, S * 0.02); });
    texture.needsUpdate = true;
  }
  return { texture, roughTex, draw, owns: (t) => t === texture || t === roughTex, dispose() { texture.dispose(); roughTex.dispose(); } };
}

function createPittsMaterials(quality, livery) {
  const high = quality === 'high';
  const po = { map: livery.texture, roughnessMap: livery.roughTex, roughness: 1, metalness: 0, envMapIntensity: 1.1 };
  const paint = high ? new THREE.MeshPhysicalMaterial({ ...po, clearcoat: 0.6, clearcoatRoughness: 0.18 }) : new THREE.MeshStandardMaterial(po);
  const trim = pbrMaterial('pitts-trim');
  const prop = pbrMaterial('pitts-prop');
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xb8c6cf, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });
  const disc = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const list = [paint, trim, prop, glass, disc, lights, beacon];
  return { paint, trim, prop, glass, disc, lights, beacon, all: () => list };
}

const C = {
  tire: srgb('#151618'), steel: srgb('#8f959b'), dark: srgb('#26282b'), black: srgb('#0d0e10'), leather: srgb('#3a2214'),
  int: srgb('#3c3f44'), intDark: srgb('#2a2c30'), floor: srgb('#2a2622'), alu: srgb('#c3c8cd'), aluDark: srgb('#7f858b'), exhaust: srgb('#6a5646'),
  chrome: srgb('#d3d7db'), smoke: srgb('#b9bdc2'), lensR: [3, 0.12, 0.1], lensG: [0.12, 3, 0.35], lensW: [3, 3, 2.7],
};

export function buildPittsExterior(quality, mats) {
  const T = tess(quality);
  const body = new Builder(), trim = new Builder(), glass = new Builder(), lights = new Builder();
  const swP = () => sw('primary'), swS = () => sw('secondary');

  // ---------- fuselage: lower shell full length, the deck with the rear cockpit opening ----------
  const Nh = T.n(12, 4), Nd = T.n(12, 4);
  const stations = T.far ? [0.1, 0.16, 0.26] : [0.1, 0.12, 0.15, 0.2, 0.27, 0.36];
  for (let s = 0.5; s < 5.0; s += T.step(0.15)) stations.push(+s.toFixed(3));
  stations.push(...OPEN, 5.05);
  const st = [...new Set(stations)].sort((a, b) => a - b);
  const arc = (s, t0, t1, N, inset = 0) => { const sec = fus(s), r = []; for (let j = 0; j <= N; j++) r.push(fusPt(sec, s, lerp(t0, t1, j / N), inset)); return r; };
  const out = (p) => [p[0], p[1] - fus(p[2]).yw, 0];
  const sideUV = (p) => uvSide(p[0] >= 0 ? REG.fusR : REG.fusL, p[2], p[1]);
  body.loft(st.map((s) => arc(s, Math.PI / 2, Math.PI, Nh)), { closed: false, out, uv: sideUV });
  body.loft(st.map((s) => arc(s, Math.PI, 1.5 * Math.PI, Nh)), { closed: false, out, uv: sideUV });
  for (const [a, b] of [[st[0], OPEN[0]], [OPEN[1], 5.05]]) {
    const ss = st.filter((s) => s >= a - 1e-6 && s <= b + 1e-6);
    body.loft(ss.map((s) => arc(s, 0, Math.PI / 2, Nd)), { closed: false, out, uv: sideUV });
    body.loft(ss.map((s) => arc(s, -Math.PI / 2, 0, Nd)), { closed: false, out, uv: sideUV });
  }
  for (const [s, dir] of [[st[0], -1], [5.05, 1]]) {
    const ring = arc(s, 0, 2 * Math.PI, 2 * (Nh + Nd)).slice(0, -1);
    fan(body, ring, [0, 0, dir], sw(dir < 0 ? 'secondary' : 'primary'));
  }
  // cowl intake lips and the dark nose mouth around the spinner, cheek bumps, exhaust stubs, smoke pipe
  trim.addGeo(new THREE.TorusGeometry(0.24, 0.022, T.n(8, 4), T.n(28, 10)), M4(0, THRUST_Y - 0.02, 0.1), RM.chrome, C.chrome);
  trim.addGeo(new THREE.CircleGeometry(0.235, T.n(28, 10)), M4(0, THRUST_Y - 0.02, 0.095, 1, 1, 1, Math.PI, 0, 0), RM.black, C.black);
  if (!T.lod2) for (const sg of [-1, 1]) {
    body.addGeo(new THREE.SphereGeometry(1, T.n(14, 6), T.n(8, 4)), M4(sg * 0.33, 1.12, 0.62, 0.09, 0.08, 0.32), swS, [1, 1, 1]);
    for (const k of [0, 1, 2]) trim.addGeo(new THREE.CylinderGeometry(0.022, 0.025, 0.12, T.n(8, 4), 1, true), M4(sg * (0.29 - k * 0.01), 0.93, 0.78 + k * 0.13, 1, 1, 1, 0.5, 0, 0), RM.darkMetal, C.exhaust);
  }
  if (T.detail) rod(trim, [0, 0.9, 1.0], [0, 0.88, 1.5], 0.022, T.n(8, 4), RM.steel, C.smoke);

  // ---------- rear cockpit: padded coaming, tub, seat, windscreen; the front cockpit's cover ----------
  {
    const [s0, s1] = OPEN, path = [];
    const nA = T.n(18, 6), nS = T.i(6, 2);
    for (let j = 0; j <= nA; j++) path.push(fusPt(fus(s0), s0, lerp(-Math.PI / 2, Math.PI / 2, j / nA)));
    for (let k = 1; k < nS; k++) { const s = lerp(s0, s1, k / nS); path.push(fusPt(fus(s), s, Math.PI / 2)); }
    for (let j = 0; j <= nA; j++) path.push(fusPt(fus(s1), s1, lerp(Math.PI / 2, -Math.PI / 2, j / nA)));
    for (let k = 1; k < nS; k++) { const s = lerp(s1, s0, k / nS); path.push(fusPt(fus(s), s, -Math.PI / 2)); }
    path.push(path[0], path[1]);
    if (!T.lod2) trim.loft(sweepRings(path, circle(T.n(10, 4), 0.02)), { color: C.leather, uv: () => RM.leatherWorn });
    const U = (s, inset) => {
      const sec = fus(s), r = [], K = T.i(5, 2);
      for (let k = 0; k <= K; k++) { const y = lerp(sec.yw, FLOOR, k / K); r.push([-(fusHalfWidth(s, y) - inset), y, s]); }
      for (let k = 0; k <= K; k++) { const y = lerp(FLOOR, sec.yw, k / K); r.push([fusHalfWidth(s, y) - inset, y, s]); }
      return r;
    };
    trim.loft([s0 + 0.01, (s0 + s1) / 2, s1 - 0.01].map((s) => U(s, 0.018)), { closed: false, out: (p) => [-p[0], -(p[1] - 1.4), 0], color: (p) => (p[1] < FLOOR + 0.02 ? C.floor : C.int), uv: () => RM.cloth });
    for (const [s, facing] of [[s0 + 0.012, 1], [s1 - 0.012, -1]]) {
      const ring = [...U(s, 0.018).slice(0, -1)];
      const top = arc(s, Math.PI / 2, -Math.PI / 2, T.n(10, 4), 0.02).slice(1, -1);
      ring.push(...top.reverse().map((p) => [p[0], p[1], s]).reverse());
      fan(trim, ring, [0, 0, facing], RM.cloth, facing > 0 ? C.intDark : C.int);
    }
    if (T.detail) {
      const ss = s1 - 0.14;
      trim.addGeo(new THREE.CylinderGeometry(0.22, 0.2, 0.46, T.n(14), 1, true, -Math.PI / 2 - 1.1, 2.2), M4(0, FLOOR + 0.36, ss, 1, 1, 0.7, 0.25, 0, 0), RM.darkMetal, C.dark);
      trim.addGeo(new THREE.BoxGeometry(0.36, 0.07, 0.34), M4(0, FLOOR + 0.18, ss - 0.12), RM.leather, srgb('#7a1420'));
      // five-point harness straps over the seat
      for (const sg of [-1, 1]) trim.addGeo(new THREE.BoxGeometry(0.04, 0.32, 0.006), M4(sg * 0.09, FLOOR + 0.5, ss + 0.04, 1, 1, 1, 0.25, 0, 0), RM.cloth, srgb('#c9a23a'));
    }
    // a small curved windscreen ahead of the opening
    const ws = s0 - 0.03, wsH = 0.16, R = 0.24, sp = 0.62, nW = T.n(12, 4), yb = fus(ws).yt - 0.04, rake = 0.62, rows = [];
    for (let i = 0; i <= 2; i++) {
      const v = i / 2, h = v * wsH, r = [];
      for (let j = 0; j <= nW; j++) { const a = lerp(-sp, sp, j / nW), drop = (1 - Math.cos(a)) * 0.14 * (1 - v); r.push([Math.sin(a) * R * (1 - 0.1 * v), yb + h - drop, ws + h * Math.tan(rake) - (Math.cos(a) - 1) * R * 0.5]); }
      rows.push(r);
    }
    glass.loft(rows, { closed: false, out: () => [0, 0.3, -1] });
    if (!T.lod2) trim.loft(sweepRings(rows[2], circle(T.n(6, 4), 0.005)), { color: C.alu, uv: () => RM.steel, capStart: true, capEnd: true });
    // the front cockpit's metal cover (painted outline + a bulge with a hand hold)
    if (T.detail) {
      const cs = 1.62, ce = 2.02, rr = [];
      for (const s of [cs, (cs + ce) / 2, ce]) rr.push(arc(s, -0.9, 0.9, T.n(10, 4), -0.008));
      body.loft(rr, { closed: false, out: (p) => [p[0], 1, 0], uv: () => sw('secondary') });
      rod(trim, [-0.1, fus(1.82).yt + 0.012, 1.82], [0.1, fus(1.82).yt + 0.012, 1.82], 0.008, 6, RM.chrome, C.chrome);
    }
  }

  // ---------- wings: swept upper (centre section on cabanes), straight lower with dihedral; four ailerons ----------
  const nC = T.n(20, 6), wingStep = T.step(0.32);
  const span = (a, b, step) => { const n = Math.max(1, Math.ceil(Math.abs(b - a) / step)); return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n); };
  const ring = (secFn, x, loop) => { const w = secFn(x); return loop.map(([xc, yv]) => [x, w.y + yv * w.c * w.thk, w.le + xc * w.c]); };
  const panel = (B, secFn, xs, cFrom, cTo, roundNose, regT, regB, caps = [true, true]) => {
    const { loop, topCount } = airfoilLoop(FOIL, nC, cFrom, cTo, roundNose);
    const top = topCount - 1 + (cFrom > 0 && roundNose ? 3 : 0);
    B.loft(xs.map((x) => ring(secFn, x, loop)), {
      out: () => [0, 1, 0],
      splits: [[0, top, (p) => uvPlan(regT, p[0], p[2])], [top, loop.length, (p) => uvPlan(regB, p[0], p[2])]],
      capStart: caps[0], capEnd: caps[1], capUV: swP,
    });
  };
  const tipXs = (half, sign, from) => {
    const r = span(from, half - 0.32, wingStep), K = T.i(6, 2);
    for (let k = 1; k <= K; k++) r.push(half - 0.32 + 0.32 * (1 - (1 - k / K) ** 1.6));
    return r.map((x) => x * sign);
  };
  const pieces = {};
  for (const [W, secFn, regT, regB, nm, root] of [[UPPER, upperSec, REG.uwT, REG.uwB, 'u', 0], [LOWER, lowerSec, REG.lwT, REG.lwB, 'l', LOWER.root]]) {
    const H = W.hinge, A0 = W.ail[0], A1 = W.ail[1];
    if (nm === 'u') panel(body, secFn, [-A0, -0.3, 0, 0.3, A0], 0, 1, false, regT, regB);
    for (const sg of [1, -1]) {
      const S = (a) => a.map((x) => x * sg);
      if (nm === 'l') panel(body, secFn, S(span(root, A0, wingStep)), 0, 1, false, regT, regB);
      panel(body, secFn, S(span(A0, A1, wingStep)), 0, H, false, regT, regB);
      panel(body, secFn, tipXs(W.half, sg, A1), 0, 1, false, regT, regB);
      const a = A0 + 0.015, b = A1 - 0.015, B = new Builder();
      panel(B, secFn, S(span(a, b, wingStep)), H + 0.006, 1, true, regT, regB);
      const hp = (x) => { const w = secFn(x); const [yu, yl] = FOIL(H + 0.012); return [x, w.y + ((yu + yl) / 2) * w.c, w.le + (H + 0.012) * w.c]; };
      pieces[`${nm}${sg > 0 ? 'R' : 'L'}`] = { B, a: hp(sg > 0 ? a : -b), b: hp(sg > 0 ? b : -a) };
    }
  }

  // ---------- struts: wide I-struts, N cabanes ----------
  const strutProf = (c, t) => streamline(T.n(12, 4), c, t);
  const strut = (B, a, b, c = 0.06, t = 0.02, uv = swP) => {
    const path = [];
    for (let k = 0; k <= 3; k++) path.push([lerp(a[0], b[0], k / 3), lerp(a[1], b[1], k / 3), lerp(a[2], b[2], k / 3)]);
    B.loft(sweepRings(path, strutProf(c, t), { upHint: [0, 0, 1] }), { uv, capStart: true, capEnd: true, capUV: uv });
  };
  const lowTop = (x, f) => { const w = lowerSec(x); return [x, w.y + FOIL(f)[0] * w.c * w.thk - 0.004, w.le + f * w.c]; };
  const upBot = (x, f) => { const w = upperSec(x); return [x, w.y + FOIL(f)[1] * w.c * w.thk + 0.004, w.le + f * w.c]; };
  const ipts = [];
  for (const sg of [1, -1]) {
    // the I-strut: a broad fairing from the lower spar pair to the upper one
    const xl = sg * STRUT_X, xu = sg * (STRUT_X + 0.04);
    const a = lowTop(xl, 0.42), b = upBot(xu, 0.42);
    const path = []; for (let k = 0; k <= 3; k++) path.push([lerp(a[0], b[0], k / 3), lerp(a[1], b[1], k / 3), lerp(a[2], b[2], k / 3)]);
    body.loft(sweepRings(path, streamline(T.n(14, 6), 0.55, 0.04), { upHint: [0, 0, 1] }), { uv: swS, capStart: true, capEnd: true, capUV: swS });
    ipts.push({ sg, a, b });
    const cf = [sg * 0.25, fus(1.05).yt - 0.02, 1.05], cr = [sg * 0.27, fus(1.6).yt - 0.02, 1.6];
    const uf = upBot(sg * 0.3, 0.15), ur = upBot(sg * 0.3, 0.68);
    const swM = () => sw('metal');
    strut(body, cf, uf, 0.045, 0.018, swM); strut(body, cr, ur, 0.045, 0.018, swM);
    if (T.detail) strut(body, cf, ur, 0.035, 0.014, swM);
  }
  if (!T.lod2) {
    const wr = T.high ? 0.005 : T.low ? 0.007 : 0.01, ws = T.high ? 6 : 4;
    const wire = (a, b) => { const prof = circle(ws, 1).map(([x, y]) => [x * wr * 1.6, y * wr * 0.6]); trim.loft(sweepRings([a, b], prof, { upHint: [0, 0, 1] }), { color: C.steel, uv: () => RM.chrome }); };
    for (const sg of [1, -1]) {
      const ip = ipts.find((p) => p.sg === sg);
      const rootLow = (f) => { const w = lowerSec(sg * 0.38); return [sg * 0.38, w.y + 0.02, w.le + f * w.c]; };
      wire(rootLow(0.25), [ip.b[0] - sg * 0.03, ip.b[1], ip.b[2] - 0.15]);
      if (T.detail) wire([rootLow(0.25)[0], rootLow(0.25)[1], rootLow(0.25)[2] + 0.05], [ip.b[0] - sg * 0.03, ip.b[1], ip.b[2] - 0.1]);
      wire(upBot(sg * 0.38, 0.3), [ip.a[0] - sg * 0.03, ip.a[1], ip.a[2] - 0.12]);
      if (T.detail) {
        wire([sg * 0.6, STAB.y + 0.02, STAB.le + 0.2], [0, 1.85, 4.85]);
        wire([sg * 0.6, STAB.y - 0.02, STAB.le + 0.2], [sg * 0.04, fus(4.6).yb + 0.02, 4.6]);
      }
    }
  }

  // ---------- tail: rounded stab with a big elevator, the Pitts rudder ----------
  const sym = naca(0, 0.4, 0.09);
  const stabSec = (x) => {
    const ax = Math.abs(x), k = clamp((ax - (STAB.half - 0.35)) / 0.35, 0, 1);
    const le = STAB.le + 0.1 * (ax / STAB.half) + 0.26 * k ** 2.2, te = STAB.te - 0.06 * k ** 2.6 - (ax < 0.12 ? 0.18 * (1 - ax / 0.12) ** 0.5 : 0);
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
    const xs = stabXs.filter((x) => x * sg >= 0.06);
    if (sg > 0) xs.unshift(0.06); else xs.push(-0.06);
    elev.loft(xs.map((x) => tailRing(x, 'h', 1, true)), { out: () => [0, 1, 0], uv: tUV, capStart: true, capEnd: true, capUV: swP });
  }
  pieces.elevator = { B: elev, a: [-1, STAB.y, STAB.hinge + 0.012], b: [1, STAB.y, STAB.hinge + 0.012] };
  const sym10 = naca(0, 0.4, 0.09);
  const finUV = (p) => uvSide(p[0] >= 0 ? REG.rudR : REG.rudL, p[2], p[1]);
  {
    const ys = [], K = T.i(8, 3);
    for (let k = 0; k <= K; k++) ys.push(lerp(1.43, 1.9, k / K));
    const R = ys.map((y) => {
      const u = (y - 1.43) / 0.47, le = lerp(4.35, 4.82, u ** 0.85), te = RUD.hinge - 0.012, c = Math.max(0.03, te - le);
      const { loop } = airfoilLoop(sym10, T.n(12, 6), 0, 1, false);
      return loop.map(([xc, yv]) => [yv * c, y, le + xc * c]);
    });
    body.loft(R, { out: () => [1, 0, 0], uv: finUV, capEnd: true, capUV: finUV });
  }
  {
    const rudTe = (y) => { const t = clamp((y - RUD.bot) / (RUD.top - RUD.bot), 0, 1); return RUD.hinge + 0.05 + 0.38 * Math.sqrt(Math.max(0, 1 - (2 * t - 0.95) ** 2)) ** 0.55; };
    const rudLe = (y) => (y > 1.9 ? RUD.hinge - 0.14 * Math.sin(Math.PI * clamp((y - 1.9) / (RUD.top - 1.9), 0, 1) ** 0.6) : RUD.hinge + 0.012);
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

  // ---------- gear: spring-steel legs into teardrop wheel spats; tailwheel ----------
  for (const sg of [1, -1]) {
    const ax = [sg * MAIN.half, MAIN.r, MAIN.s];
    strut(body, [sg * 0.2, fus(1.12).yb + 0.06, 1.12], [ax[0] - sg * 0.06, ax[1] + 0.12, ax[2]], 0.13, 0.03, swS);
    const tire = new THREE.TorusGeometry(MAIN.r - MAIN.w * 0.45, MAIN.w * 0.45, T.n(10, 4), T.n(24, 10));
    tire.scale(1, 1, 1.2);
    trim.addGeo(tire, M4(ax[0], ax[1], ax[2], 1, 1, 1, 0, Math.PI / 2, 0), RM.rubber, C.tire);
    // the spat: a teardrop around the upper wheel, open underneath
    const prof = [[-0.36, 0.0], [-0.33, 0.06], [-0.24, 0.12], [-0.08, 0.15], [0.1, 0.15], [0.3, 0.11], [0.5, 0.05], [0.6, 0.0]];
    const N = T.n(14, 6), rings = prof.map(([z, r]) => { const rr = []; for (let j = 0; j <= N; j++) { const a = lerp(-1.15, Math.PI + 1.15, j / N); rr.push([ax[0] + Math.cos(a) * r * 0.62, ax[1] + 0.05 + Math.sin(a) * r * 1.25, ax[2] + z]); } return rr; });
    body.loft(rings, { closed: false, out: (p) => [p[0] - ax[0], p[1] - ax[1] - 0.05, 0], uv: swS });
  }
  {
    const ty = TAILW.y + TAILW.r, ts = TAILW.s;
    rod(trim, [0, fus(4.55).yb + 0.01, 4.55], [0, ty + 0.05, ts - 0.03], 0.015, T.n(6, 4), RM.paint, C.dark);
    const tw = new THREE.TorusGeometry(TAILW.r * 0.62, TAILW.r * 0.38, T.n(8, 4), T.n(16, 8));
    trim.addGeo(tw, M4(0, ty, ts, 1, 1, 1.3, 0, Math.PI / 2, 0), RM.rubber, C.tire);
    trim.addGeo(new THREE.CylinderGeometry(TAILW.r * 0.32, TAILW.r * 0.32, 0.04, T.n(10, 6)), M4(0, ty, ts, 1, 1, 1, 0, 0, Math.PI / 2), RM.steel, C.steel);
  }

  // ---------- lights ----------
  const lightPts = [];
  for (const [sg, col] of [[-1, C.lensR], [1, C.lensG]]) {
    const w = upperSec(sg * (UPPER.half - 0.04));
    const p = [sg * (UPPER.half - 0.03), w.y, w.le + 0.05];
    lights.addGeo(new THREE.SphereGeometry(0.025, T.n(8, 4), T.n(6, 3)), M4(...p, 0.8, 0.8, 1.3), [0, 0], col);
    lightPts.push({ p, col: sg < 0 ? [1, 0.08, 0.06] : [0.1, 1, 0.3], kind: 'nav' });
  }
  { const p = [0, 1.5, 5.42]; lights.addGeo(new THREE.SphereGeometry(0.02, T.n(8, 4), T.n(6, 3)), M4(...p), [0, 0], C.lensW); lightPts.push({ p, col: [1, 1, 0.92], kind: 'nav' }); }

  // ---------- spinner (secondary; static, a body of revolution) + a two-blade metal prop ----------
  {
    const prof = [[-0.26, 0.0], [-0.24, 0.05], [-0.19, 0.09], [-0.11, 0.12], [-0.02, 0.135], [0.06, 0.14]];
    const rings = latheRings(prof.map(([z, r]) => [z + 0.04, r]), T.n(20, 8), 0, THRUST_Y);
    body.loft(rings, { out: (p) => [p[0], p[1] - THRUST_Y, 0], uv: swS, capEnd: true, capUV: swS });
  }
  const prop = new Builder();
  {
    const PR = 0.965;
    prop.addGeo(new THREE.CylinderGeometry(0.07, 0.07, 0.1, T.n(14, 8)), M4(0, 0, 0.02, 1, 1, 1, Math.PI / 2, 0, 0), RM.steel, C.aluDark);
    const rs = [], K = T.i(14, 5);
    for (let k = 0; k <= K; k++) rs.push(lerp(0.13, PR, k / K));
    rs.splice(rs.length - 1, 0, PR - 0.02, PR - 0.008);
    for (const rot of [0, Math.PI]) {
      const R = [];
      for (const r of rs) {
        const u = (r - 0.13) / (PR - 0.13);
        let c = 0.13 + 0.03 * Math.sin(Math.PI * Math.min(1, u * 1.2)) - 0.04 * u * u;
        if (r > PR - 0.05) c *= Math.sqrt(Math.max(0.15, 1 - ((r - (PR - 0.05)) / 0.052) ** 2));
        const t = lerp(0.22, 0.07, Math.min(1, u * 1.3)), phi = Math.atan(1.7 / (2 * Math.PI * Math.max(0.15, r)));
        const { loop } = airfoilLoop(naca(0.03, 0.4, t), T.n(10, 4), 0, 1, false);
        const cp = Math.cos(phi), sp = Math.sin(phi);
        R.push(loop.map(([xc, yv]) => {
          const a = (xc - 0.35) * c, b = yv * c, x = -cp * a - sp * b, z = sp * a - cp * b + 0.02;
          return [x * Math.cos(rot) - r * Math.sin(rot), x * Math.sin(rot) + r * Math.cos(rot), z];
        }));
      }
      // metal blades, black backs, red-white-red tips
      prop.loft(R, {
        out: () => [0, 0, -1], capEnd: true, capStart: true,
        color: (p) => { const r = Math.hypot(p[0], p[1]); if (r > PR - 0.035) return srgb('#c0262b'); if (r > PR - 0.07) return srgb('#f2f2ee'); if (r > PR - 0.105) return srgb('#c0262b'); return p[2] > 0.02 ? C.black : C.alu; },
        uv: (p) => (Math.hypot(p[0], p[1]) > PR - 0.105 ? RM.paint : p[2] > 0.02 ? RM.black : RM.steel),
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
  propGroup.position.set(0, THRUST_Y, 0.0);
  const propMesh = new THREE.Mesh(prop.build(), mats.prop);
  propMesh.name = 'prop'; propMesh.castShadow = true;
  propGroup.add(propMesh);
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.965, T.n(48, 16)), mats.disc);
  disc.position.z = 0.0; disc.renderOrder = 3; disc.name = 'propDisc';
  propGroup.add(disc);
  group.add(propGroup);
  return { group, meshes, hinges, propGroup, propMesh, disc, lightPts };
}

// ---------- cockpit: rear panel under the coaming, a G-meter, smoke switch, stick, wall throttle, rudder bar ----------
const PS = 2.2;
export const THROTTLE = { x: -0.25, y: 1.36, s: 2.42, len: 0.12 };
export const throttleKnob = (th) => { const a = (0.5 - th) * 0.95; return [THROTTLE.x + 0.025, THROTTLE.y + Math.cos(a) * THROTTLE.len, THROTTLE.s + Math.sin(a) * THROTTLE.len]; };
function pittsCockpit(quality, mats, ctx) {
  const y0 = 1.32, sec = fus(PS), outline = [];
  for (let k = 0; k <= 4; k++) { const y = lerp(y0, sec.yw, k / 4); outline.push([fusHalfWidth(PS, y) - 0.02, y]); }
  for (let k = 1; k < 16; k++) { const p = fusPt(sec, PS, Math.PI / 2 - (Math.PI * k) / 16, 0.025); outline.push([p[0], p[1]]); }
  for (let k = 4; k >= 0; k--) { const y = lerp(y0, sec.yw, k / 4); outline.push([-(fusHalfWidth(PS, y) - 0.02), y]); }
  const gauges = { asi: [-0.16, 1.58, 0.078], alt: [0.0, 1.61, 0.078], tach: [0.16, 1.58, 0.078], vsi: [0.17, 1.45, 0.062] };
  return buildPanelCockpit(quality, mats, ctx, {
    name: 'pitts', PS, outline, box: { x0: -0.34, x1: 0.34, y0, y1: sec.yt }, gauges, bezel: 'black', screws: '#777',
    paint(g, txt, h) {
      g.fillStyle = '#2b2d31'; g.fillRect(-0.4, y0, 0.8, 0.6);
      h.noise(3000, 0.08, true);
      for (const [k, l] of [['asi', 'KNOTS'], ['alt', 'ALT'], ['tach', 'RPM'], ['vsi', 'CLIMB']]) txt(l, gauges[k][0], gauges[k][1] - gauges[k][2] / 2 - 0.018, 0.0095, '#e8e8e8', '700', 'Helvetica, Arial, sans-serif');
      // the accelerometer: a G-meter stuck at "LOTS"
      paintDial(g, 'g', -0.17, 1.45, 0.062);
      txt('G', -0.17, 1.4, 0.009, '#e8e8e8', '700', 'Helvetica, Arial, sans-serif');
      g.fillStyle = '#c0262b'; g.beginPath(); g.roundRect(-0.07, 1.39, 0.14, 0.05, 0.006); g.fill();
      txt('SMOKE', 0, 1.425, 0.012, '#fff', '800', 'Helvetica, Arial, sans-serif'); txt('ON · MORE · YES', 0, 1.403, 0.0075, '#fff', '700', 'Helvetica, Arial, sans-serif');
      g.fillStyle = '#d8ccab'; g.beginPath(); g.roundRect(-0.12, 1.335, 0.24, 0.04, 0.004); g.fill();
      txt('BY ROYAL WARRANT', 0, 1.362, 0.0095, '#2a2418'); txt('INVERTED IS ALSO FINE', 0, 1.346, 0.0075, '#2a2418', '600');
    },
    extras(B, n, high) {
      B.addGeo(new THREE.BoxGeometry(0.03, 0.05, 0.2), M4(THROTTLE.x - 0.01, THROTTLE.y + 0.07, THROTTLE.s), RM.black, CK.black);
      B.addGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.04, n(8)), M4(0, 1.42, PS + 0.02, 1, 1, 1, Math.PI / 2 - 0.3, 0, 0), RM.chrome, CK.chrome);
      // inverted fuel/oil placard bar and a ratchet harness buckle on the floor
      if (high) B.addGeo(new THREE.BoxGeometry(0.08, 0.02, 0.06), M4(0, FLOOR + 0.3, 2.5), RM.chrome, CK.chrome);
    },
    stick: (sb, n, high) => stickGeom(sb, n, high, { len: 0.48 }),
    throttle: {
      pos: [THROTTLE.x + 0.025, THROTTLE.y, THROTTLE.s], len: THROTTLE.len,
      build(tb) { tb.addGeo(new THREE.BoxGeometry(0.01, THROTTLE.len, 0.016), M4(0, THROTTLE.len / 2, 0), RM.steel, CK.steel); tb.addGeo(new THREE.SphereGeometry(0.019, 10, 8), M4(0, THROTTLE.len, 0, 1, 0.8, 1.2), RM.plastic, srgb('#111')); },
      anim(gr, th) { gr.rotation.x = (0.5 - th) * 0.95; },
    },
    rudder: { pos: [0, FLOOR + 0.05, 1.98], w: 0.38 },
    openDials: true,
  });
}

const D2R = Math.PI / 180;
const MAX = { aileron: 22 * D2R, elevUp: 28 * D2R, elevDown: 24 * D2R, rudder: 28 * D2R };
export const PITTS_DIMS = { length: 5.4, span: 6.1, height: 1.94, gearHeight: CG.y, groundPitch: GROUND_PITCH };

export function createPitts(opts = {}) {
  const def = {
    id: 'pitts', cg: CG, eye: EYE, eyeCenter: { x: 0, y: EYE.y + 0.05, s: EYE.s + 0.06, pitch: -0.1 },
    portrait: { center: [0, 0.07, 0.16], cockpit: [0, 0.06, 0.14], fov: 90, pitch: -0.1 },
    dims: { ...PITTS_DIMS, restHeight: CG.y * Math.cos(GROUND_PITCH) - (CG.s - MAIN.s) * Math.sin(GROUND_PITCH) },
    lod: [220, 130], rpm: { idle: 700, max: 2000 },
    pilotWithoutCockpit: true,
    createLivery: (q) => createPittsLivery(q),
    createMaterials: (q, l) => createPittsMaterials(q, l),
    buildExterior: (q, mats) => buildPittsExterior(q, mats),
    buildCockpit: (q, mats, ctx) => pittsCockpit(q, mats, ctx),
    stick: { pos: [0, FLOOR, 2.38], move(stick, cur) { stick.rotation.set(cur.elevator * 0.28, 0, -cur.aileron * 0.28); } },
    createPilot: (q, cfg) => createAviator({
      quality: q, cfg, seat: SEAT, outfit: 'flyer', gripLocal: [0, 0.46, 0],
      leftHand: (cur) => throttleKnob(cur.throttle), elbowOut: 0.25,
    }),
    animate(ext, cur) {
      const h = ext.hinges, a = cur.aileron * MAX.aileron;
      h.uR.rotation.x = h.lR.rotation.x = -a;
      h.uL.rotation.x = h.lL.rotation.x = a;
      h.elevator.rotation.x = -(cur.elevator > 0 ? cur.elevator * MAX.elevUp : cur.elevator * MAX.elevDown);
      h.rudder.rotation.x = cur.rudder * MAX.rudder;
    },
  };
  return assembleRig(def, opts);
}
