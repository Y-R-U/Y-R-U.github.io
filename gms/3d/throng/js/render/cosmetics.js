import * as THREE from 'three';
import { shaderCommon, fogUniforms } from './shared.js';
import { builder, addBody, SKIN, HAIR, PANTS } from './people.js';

// ---------- ids accepted by setCrowds ----------
export const HAT_IDS = ['cap', 'tophat', 'beanie', 'crown', 'party', 'cowboy', 'hardhat', 'headband', 'chef', 'wizard', 'halo'];
export const LEADER_IDS = ['caped', 'king', 'robot', 'mascot'];
const LEADER_ALIAS = { knight: 'caped', hero: 'caped', astronaut: 'robot' };
export const EMBLEM_IDS = ['star', 'heart', 'bolt', 'crown', 'moon', 'diamond', 'skull', 'paw', 'flame', 'sun'];
export const TRAIL_IDS = ['sparkle', 'petals', 'dust', 'lightning', 'confetti', 'hearts', 'smoke'];
export const RING_IDS = ['solid', 'dashed', 'double', 'flame', 'pulse'];

const hexOf = (v) => (typeof v === 'number' ? v : typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v) ? parseInt(v.replace('#', ''), 16) : null);

// Normalises one crowd's cosmetic fields; anything unknown or missing falls back to today's look.
export function parseCosmetics(m) {
  const hat = HAT_IDS.indexOf(m.hat) + 1;
  let leader = m.leader ? LEADER_ALIAS[m.leader] || m.leader : null;
  leader = LEADER_IDS.indexOf(leader) + 1;
  let flag = null;
  if (m.flag) {
    const f = typeof m.flag === 'object' ? m.flag : { emblem: m.flag === true ? 'star' : m.flag };
    let emblem = f.emblem ?? 'star', color = hexOf(f.color);
    if (typeof emblem === 'string' && emblem.startsWith('banner:')) { color = color ?? cssColor(emblem.slice(7)); emblem = 'star'; }
    emblem = typeof emblem !== 'string' ? 'star' : EMBLEM_IDS.includes(emblem) ? emblem : [...emblem].slice(0, 3).join('');
    flag = { emblem, color };
  }
  const palette = Array.isArray(m.palette) ? m.palette.map(hexOf).filter((v) => v != null).slice(0, 3) : null;
  return {
    hat,
    hatShare: hat ? Math.min(1, Math.max(0, m.hatShare ?? 0.5)) : 0,
    hatLeaderOnly: !!m.hatLeaderOnly,
    leader,
    flag,
    trail: TRAIL_IDS.indexOf(m.trail) + 1,
    ring: Math.max(0, RING_IDS.indexOf(m.ring)),
    palette: palette && palette.length ? palette : null,
  };
}

function cssColor(name) {
  const c = new THREE.Color();
  try { c.setStyle(name); } catch { return null; }
  return c.getHex();
}

// ---------- hats: one lathe template, profiles per hat in a float texture ----------
// ring = [radius, y, z offset, colour mode]; modes: 0 team, 1 team dark, 2 white, 3 black, 4 gold (glows),
// 5 safety yellow, 6 leather, 7 dark band, 8 red, 9 hidden band, 10 dark gold
const K = 7;
const H9 = (r, y) => [r, y, 0, 9];
const HAT_PROFILES = {
  cap: [[[0.148, 1.6, 0, 0], [0.153, 1.68, 0, 0], [0.12, 1.755, 0, 0], [0, 1.775, 0, 0], [0, 1.635, 0.12, 9], [0.165, 1.635, 0.12, 1], [0.165, 1.635, 0.12, 9]], [0, 9, 9, 1]],
  tophat: [[[0.235, 1.62, 0, 3], [0.138, 1.635, 0, 3], [0.138, 1.69, 0, 0], [0.134, 1.93, 0, 3], [0, 1.93, 0, 3], H9(0, 1.93), H9(0, 1.93)], [0, 9, 9, 1]],
  beanie: [[[0.15, 1.58, 0, 1], [0.157, 1.665, 0, 1], [0.143, 1.765, 0, 0], [0.07, 1.825, 0, 0], [0.062, 1.86, 0, 2], [0.056, 1.915, 0, 2], [0, 1.935, 0, 2]], [0, 9, 9, 1]],
  crown: [[[0.136, 1.665, 0, 4], [0.142, 1.7, 0, 4], [0.154, 1.83, 0, 4], [0.13, 1.815, 0, 4], [0.124, 1.7, 0, 10], H9(0.124, 1.7), H9(0.124, 1.7)], [0.075, 2, 3, 1]],
  party: [[[0.13, 1.655, 0, 0], [0.105, 1.75, 0, 2], [0.08, 1.84, 0.01, 0], [0.055, 1.93, 0.02, 2], [0.028, 2.02, 0.03, 0], [0, 2.07, 0.04, 5], H9(0, 2.07)], [0, 9, 9, 1]],
  cowboy: [[[0.265, 1.67, 0, 6], [0.2, 1.635, 0, 6], [0.143, 1.65, 0, 6], [0.143, 1.7, 0, 7], [0.133, 1.8, 0, 6], [0.09, 1.845, 0, 6], [0, 1.815, 0, 6]], [0, 9, 9, 1.18]],
  hardhat: [[[0.205, 1.635, 0.025, 5], [0.153, 1.645, 0, 5], [0.157, 1.71, 0, 5], [0.13, 1.79, 0, 5], [0.075, 1.835, 0, 5], [0, 1.85, 0, 5], H9(0, 1.85)], [0, 9, 9, 1.08]],
  headband: [[[0.147, 1.595, 0, 0], [0.151, 1.665, 0, 0], H9(0.15, 1.665), H9(0.15, 1.665), H9(0.15, 1.665), H9(0.15, 1.665), H9(0.15, 1.665)], [0, 9, 9, 1]],
  chef: [[[0.147, 1.62, 0, 2], [0.151, 1.72, 0, 2], [0.19, 1.8, 0, 2], [0.215, 1.885, 0, 2], [0.19, 1.96, 0, 2], [0.1, 1.995, 0, 2], [0, 1.995, 0, 2]], [0, 9, 9, 1]],
  wizard: [[[0.245, 1.625, 0, 1], [0.136, 1.64, 0, 1], [0.11, 1.78, 0, 0], [0.08, 1.92, -0.01, 0], [0.045, 2.05, -0.04, 0], [0.015, 2.15, -0.09, 4], [0, 2.18, -0.12, 4]], [0, 9, 9, 1]],
  halo: [[[0.13, 1.93, 0, 4], [0.165, 1.955, 0, 4], [0.2, 1.93, 0, 4], [0.165, 1.905, 0, 4], [0.13, 1.93, 0, 4], H9(0.13, 1.93), H9(0.13, 1.93)], [0, 9, 9, 1]],
};

function hatTexture() {
  const W = K + 1, Hn = HAT_IDS.length + 1;
  const d = new Float32Array(W * Hn * 4);
  HAT_IDS.forEach((id, i) => {
    const [rings, ex] = HAT_PROFILES[id];
    const row = (i + 1) * W * 4;
    rings.forEach((q, k) => d.set(q, row + k * 4));
    d.set(ex, row + K * 4);
  });
  const t = new THREE.DataTexture(d, W, Hn, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

const BODY_POSE = /* glsl */`
vec3 rotX(vec3 p, float py, float pz, float a) {
  float c = cos(a), s = sin(a);
  float y = p.y - py, z = p.z - pz;
  return vec3(p.x, py + y * c - z * s, pz + y * s + z * c);
}
vec3 rotXn(vec3 n, float a) {
  float c = cos(a), s = sin(a);
  return vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
}
`;

const HAT_VERT = /* glsl */`
attribute vec3 aH;
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
uniform float uTime;
uniform float uFigScale;
uniform float uSeg;
uniform float uAccScale;
uniform sampler2D uHatTex;
varying vec3 vCol;
${shaderCommon.lightPars}
#include <fog_pars_vertex>
${BODY_POSE}
void main() {
  int hat = int(floor(iB.z));
  float hz = step(1.5, iB.y);
  float look = fract(iB.z), g = clamp(iB.y - 2.0 * hz, 0.0, 1.0), ph = iB.x * (1.0 - 0.35 * hz);
  int j = int(aH.x);
  vec4 q0 = texelFetch(uHatTex, ivec2(j, hat), 0);
  vec4 q1 = texelFetch(uHatTex, ivec2(j + 1, hat), 0);
  vec4 ex = texelFetch(uHatTex, ivec2(${K}, hat), 0);
  vec4 q = aH.y > 0.5 ? q1 : q0;
  float mode = q1.w;
  float a = aH.z / uSeg * 6.2831853;
  float ri = aH.x + aH.y;
  float y = q.y;
  if (ri >= ex.y && ri <= ex.z) y += ex.x * (mod(aH.z, 2.0) < 0.5 ? 1.0 : -0.3);
  vec3 dir = vec3(sin(a), 0.0, cos(a));
  vec3 p = vec3(dir.x * q.x, y, dir.z * q.x * 0.92 * ex.w + q.z);
  vec3 n = dir * (q1.y - q0.y) - vec3(0.0, q1.x - q0.x, 0.0);
  n = dot(n, n) < 1e-8 ? vec3(0.0, 1.0, 0.0) : normalize(n);
  if (mode > 8.5 && mode < 9.5) p = vec3(0.0, 1.7, 0.0);
  // hats grow with camera distance (on top of the figure scale) so their shapes still read when zoomed out
  vec3 piv = vec3(0.0, 1.6, 0.0);
  p = piv + (p - piv) * vec3(uAccScale, 1.0 + (uAccScale - 1.0) * 1.15, uAccScale);
  float idle = 1.0 - g;
  float breath = sin(uTime * 2.1 + look * 37.0);
  float lean = 0.16 * g + hz * (0.32 + 0.08 * sin(ph * 0.5 + look * 9.0));
  p = rotX(p, 0.78, 0.0, lean); n = rotXn(n, lean);
  p.y += idle * breath * 0.008 + abs(cos(ph)) * 0.07 * g;
  p.x += hz * sin(ph * 0.5 + look * 20.0) * 0.06;
  float s = iC.w * 1.28 * uFigScale;
  float cy = cos(iA.w), sy = sin(iA.w);
  p *= s;
  vec3 w = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy) + iA.xyz;
  vec3 nw = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
  vec3 team = iC.rgb;
  vec3 base = team; float em = 0.0;
  if (mode > 0.5 && mode < 1.5) base = team * 0.5;
  else if (mode < 2.5 && mode > 1.5) base = vec3(0.86);
  else if (mode < 3.5 && mode > 2.5) base = vec3(0.04);
  else if (mode < 4.5 && mode > 3.5) { base = vec3(1.0, 0.62, 0.12); em = 0.55; }
  else if (mode < 5.5 && mode > 4.5) base = vec3(1.0, 0.7, 0.04);
  else if (mode < 6.5 && mode > 5.5) base = vec3(0.36, 0.2, 0.09);
  else if (mode < 7.5 && mode > 6.5) base = vec3(0.07, 0.045, 0.035);
  else if (mode < 8.5 && mode > 7.5) base = vec3(0.75, 0.05, 0.05);
  else if (mode > 9.5) { base = vec3(0.55, 0.3, 0.05); em = 0.2; }
  vec3 info = sampleInfo(iA.xz);
  vec3 col = base * lightAt(nw, info) * 0.72 + base * em;
  if (mode < 1.5) col += team * (mode < 0.5 ? 0.22 : 0.08) * (1.0 + 0.6 * max(nw.y, 0.0));
  col += iB.w * vec3(1.0, 0.95, 0.85) * 1.6;
  vCol = col;
  vec4 mvPosition = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const FLAT_FRAG = /* glsl */`
varying vec3 vCol;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(vCol, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function createHats(people, shared, detail = 1) {
  const S = detail ? 10 : 5;
  const pos = [], ah = [], idx = [];
  let v = 0;
  for (let j = 0; j < K - 1; j++) for (let k = 0; k < S; k++) {
    for (const [t, kk] of [[0, k], [0, k + 1], [1, k + 1], [1, k]]) { pos.push(0, 0, 0); ah.push(j, t, kk); }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(ah, 3));
  g.setIndex(idx);
  g.setAttribute('iA', people.attrs.ia); g.setAttribute('iB', people.attrs.ib); g.setAttribute('iC', people.attrs.ic);
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: HAT_VERT, fragmentShader: FLAT_FRAG, fog: true, side: THREE.DoubleSide,
    uniforms: { ...fogUniforms(), ...shared, uSeg: { value: S }, uHatTex: { value: hatTexture() } },
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return {
    mesh,
    setCount(n) { g.instanceCount = n; mesh.visible = n > 0; },
    tris: (K - 1) * S * 2,
  };
}

// ---------- emblem atlas: 4x4 slots of 128 px, one per crowd index ----------
function drawEmblem(x, id) {
  x.save();
  x.translate(64, 64);
  x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineJoin = 'round'; x.lineCap = 'round';
  const star = (n, r0, r1, rot = -Math.PI / 2) => {
    x.beginPath();
    for (let k = 0; k < n * 2; k++) { const a = rot + (k * Math.PI) / n, r = k % 2 ? r1 : r0; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    x.closePath(); x.fill();
  };
  switch (id) {
    case 'star': star(5, 46, 19); break;
    case 'heart':
      x.beginPath(); x.moveTo(0, 40); x.bezierCurveTo(-60, 0, -36, -48, 0, -18); x.bezierCurveTo(36, -48, 60, 0, 0, 40); x.fill(); break;
    case 'bolt':
      x.beginPath(); x.moveTo(10, -50); x.lineTo(-26, 6); x.lineTo(-2, 6); x.lineTo(-12, 50); x.lineTo(28, -10); x.lineTo(4, -10); x.closePath(); x.fill(); break;
    case 'crown':
      x.beginPath(); x.moveTo(-42, 30); x.lineTo(-46, -26); x.lineTo(-22, 0); x.lineTo(0, -36); x.lineTo(22, 0); x.lineTo(46, -26); x.lineTo(42, 30); x.closePath(); x.fill(); break;
    case 'moon':
      x.beginPath(); x.arc(0, 0, 44, 0, Math.PI * 2); x.fill();
      x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(20, -12, 38, 0, Math.PI * 2); x.fill(); break;
    case 'diamond':
      x.beginPath(); x.moveTo(0, -48); x.lineTo(36, 0); x.lineTo(0, 48); x.lineTo(-36, 0); x.closePath(); x.fill(); break;
    case 'skull':
      x.beginPath(); x.arc(0, -8, 38, 0, Math.PI * 2); x.fill(); x.fillRect(-22, 14, 44, 26);
      x.globalCompositeOperation = 'destination-out';
      x.beginPath(); x.arc(-15, -6, 11, 0, Math.PI * 2); x.arc(15, -6, 11, 0, Math.PI * 2); x.fill();
      x.fillRect(-12, 28, 6, 14); x.fillRect(-2, 28, 6, 14); x.fillRect(8, 28, 6, 14); break;
    case 'paw':
      x.beginPath(); x.ellipse(0, 18, 26, 22, 0, 0, Math.PI * 2); x.fill();
      for (const [px, py] of [[-32, -10], [-12, -32], [12, -32], [32, -10]]) { x.beginPath(); x.ellipse(px, py, 11, 14, 0, 0, Math.PI * 2); x.fill(); }
      break;
    case 'flame':
      x.beginPath(); x.moveTo(0, -52); x.bezierCurveTo(30, -20, 44, 10, 26, 34); x.bezierCurveTo(14, 50, -14, 50, -26, 34); x.bezierCurveTo(-40, 14, -26, -6, -12, -14); x.bezierCurveTo(-10, -2, -2, 4, 4, 0); x.bezierCurveTo(10, -16, 4, -36, 0, -52); x.fill(); break;
    case 'sun':
      x.beginPath(); x.arc(0, 0, 24, 0, Math.PI * 2); x.fill(); x.lineWidth = 8;
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; x.beginPath(); x.moveTo(Math.cos(a) * 32, Math.sin(a) * 32); x.lineTo(Math.cos(a) * 50, Math.sin(a) * 50); x.stroke(); }
      break;
    default:
      x.font = 'bold 80px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(String(id), 0, 4);
  }
  x.restore();
}

function emblemAtlas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const x = cv.getContext('2d');
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return {
    tex: t,
    set(list) {
      x.clearRect(0, 0, 512, 512);
      list.forEach((em, slot) => {
        if (!em) return;
        x.save();
        x.translate((slot % 4) * 128, ((slot >> 2) % 4) * 128);
        x.beginPath(); x.rect(0, 0, 128, 128); x.clip();
        drawEmblem(x, em);
        x.restore();
      });
      t.needsUpdate = true;
    },
  };
}

// ---------- heroes: leader variants + carried flag, one draw for every crowd ----------
// variant: 0 none (flag only), 1 caped, 2 king, 3 robot, 4 mascot. aMask bit v = part shows for variant v.
// parts: 0..5 body as people.js, 6 cape, 7 pole, 8 flag cloth. regions beyond people.js:
// 5 cape, 6 gold, 7 white, 8 black, 9 metal, 10 team glow, 11 flag cloth, 12 pole, 13 mascot fur
const BODY = 0b11110, HUMAN_HEAD = 0b00110, ALL = 0b11111;
function heroGeometry() {
  const g = builder();
  g.mask = BODY;
  addBody(g, 2, HUMAN_HEAD);
  const SH = 1.3;
  // cape (caped + king), hung from the shoulders
  g.mask = 0b00110;
  const capeRow = (y, z, hw) => [[-hw, y, z], [hw, y, z]];
  const rows = [capeRow(SH + 0.02, -0.17, 0.27), capeRow(0.85, -0.27, 0.36), capeRow(0.28, -0.34, 0.44)];
  for (let r = 0; r < rows.length - 1; r++) {
    const [a0, a1] = rows[r], [b0, b1] = rows[r + 1];
    g.quad(a1, a0, b0, b1, 6, 5);
  }
  // caped: gold chest emblem
  g.mask = 0b00010;
  g.tbox(0, 0.165, SH - 0.2, SH - 0.02, 0.2, 0.02, 0.2, 0.02, 0, 6);
  // king: ermine collar, crown, gold belt
  g.mask = 0b00100;
  g.tbox(0, -0.02, SH - 0.02, SH + 0.1, 0.66, 0.38, 0.5, 0.34, 0, 7);
  g.ring(SH + 0.36, SH + 0.46, 0.135, 0.145, 10, 5, () => 6);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, a0 = a - 0.32, a1 = a + 0.32;
    const p = (an, y, r) => [Math.sin(an) * r, y, Math.cos(an) * r];
    const f = [p(a0, SH + 0.46, 0.146), p(a1, SH + 0.46, 0.146), p(a, SH + 0.62, 0.15)];
    g.face(f, g.nrm(f[0], f[1], f[2]), 5, 6);
    const b = [p(a1, SH + 0.46, 0.14), p(a0, SH + 0.46, 0.14), p(a, SH + 0.62, 0.145)];
    g.face(b, g.nrm(b[0], b[1], b[2]), 5, 6);
  }
  g.tbox(0, 0, 0.86, 0.94, 0.43, 0.27, 0.43, 0.27, 0, 6);
  // robot: box head, visor, antenna
  g.mask = 0b01000;
  g.tbox(0, 0, SH + 0.04, SH + 0.1, 0.12, 0.12, 0.12, 0.12, 5, 9);
  g.tbox(0, 0, SH + 0.1, SH + 0.46, 0.36, 0.32, 0.34, 0.3, 5, 9);
  g.tbox(0, 0.16, SH + 0.22, SH + 0.32, 0.28, 0.02, 0.28, 0.02, 5, 10);
  g.tbox(0, 0, SH + 0.46, SH + 0.62, 0.025, 0.025, 0.025, 0.025, 5, 9);
  g.tbox(0, 0, SH + 0.62, SH + 0.7, 0.07, 0.07, 0.07, 0.07, 5, 10);
  for (const s of [1, -1]) g.tbox(0.19 * s, 0, SH + 0.22, SH + 0.34, 0.03, 0.1, 0.03, 0.1, 5, 10);
  // mascot: big round head with ears and eyes
  g.mask = 0b10000;
  const HC = SH + 0.4, HR = 0.36, n = 10;
  for (let j = 0; j < 6; j++) {
    const t0 = -Math.PI / 2 + (j / 6) * Math.PI, t1 = -Math.PI / 2 + ((j + 1) / 6) * Math.PI;
    g.ring(HC + Math.sin(t0) * HR, HC + Math.sin(t1) * HR, Math.cos(t0) * HR * 1.08, Math.cos(t1) * HR * 1.08, n, 5, () => 13);
  }
  for (const s of [1, -1]) {
    const ex = 0.24 * s, ey = HC + 0.3;
    g.tbox(ex, 0, ey - 0.06, ey + 0.14, 0.2, 0.08, 0.14, 0.06, 5, 13);
    g.tbox(0.13 * s, HR * 0.9, HC + 0.04, HC + 0.2, 0.14, 0.05, 0.12, 0.05, 5, 7);
    g.tbox(0.13 * s, HR * 0.9 + 0.03, HC + 0.07, HC + 0.15, 0.06, 0.04, 0.06, 0.04, 5, 8);
  }
  g.tbox(0, HR * 0.95, HC - 0.16, HC - 0.1, 0.16, 0.04, 0.2, 0.04, 5, 8);
  // flag (every variant, gated by flagOn): pole in local units 0..1, cloth hangs back from the top (-z)
  g.mask = ALL;
  g.tbox(0, 0, 0, 1.0, 0.03, 0.03, 0.022, 0.022, 7, 12);
  g.tbox(0, 0, 1.0, 1.05, 0.06, 0.06, 0.06, 0.06, 7, 6);
  const CU = 8, CV = 3, L = 0.72, top = 0.98, bot = 0.56;
  for (let i = 0; i < CU; i++) for (let j = 0; j < CV; j++) {
    const u0 = i / CU, u1 = (i + 1) / CU, v0 = j / CV, v1 = (j + 1) / CV;
    const P = (u, v) => [0, bot + (top - bot) * v, -0.02 - L * u];
    g.uv = (p) => [(-p[2] - 0.02) / L, (p[1] - bot) / (top - bot)];
    g.quad(P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), 8, 11);
    g.uv = null;
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.N, 3));
  geo.setAttribute('aPR', new THREE.Float32BufferAttribute(g.A, 2));
  geo.setAttribute('aMask', new THREE.Float32BufferAttribute(g.M, 1));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.U, 2));
  geo.setIndex(g.I);
  return geo;
}

const HERO_VERT = /* glsl */`
attribute vec2 aPR;
attribute float aMask;
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
attribute vec4 iD;
uniform float uTime;
uniform float uFigScale;
uniform float uWind;
uniform vec3 uSkin[5];
uniform vec3 uHair[6];
uniform vec3 uPants[6];
attribute vec4 iF;
varying vec3 vCol;
varying vec3 vUvS;
varying float vSlot;
varying vec3 vFlagCol;
${shaderCommon.lightPars}
#include <fog_pars_vertex>
${BODY_POSE}
void main() {
  float part = aPR.x, reg = aPR.y;
  float ph = iB.x, g = clamp(iB.y, 0.0, 1.0), look = fract(iB.z), flash = iB.w;
  int variant = int(iD.x + 0.5);
  bool flagOn = iD.z > 0.5;
  bool isFlag = part > 6.5;
  bool show = isFlag ? flagOn : ((int(aMask + 0.5) >> variant) & 1) == 1;
  vec3 p = position, n = normal;
  float sw = sin(ph), idle = 1.0 - g, breath = sin(uTime * 2.1 + look * 37.0);
  float s = iC.w * 1.28 * uFigScale;
  vUvS = vec3(uv, 0.0);
  if (isFlag) {
    vec3 hand = vec3(0.36, 0.85, 0.28);
    if (part > 7.5) {
      float u = uv.x;
      float ws = 7.5 + 6.0 * uWind;
      float wave = sin(u * 7.0 - uTime * ws + look * 20.0) * (0.05 + 0.06 * u) * u * (1.0 + 1.4 * uWind);
      p.x += wave; p.y -= u * u * 0.04 * (1.0 - g);
      n = normalize(vec3(1.0, 0.0, -cos(u * 7.0 - uTime * 7.5) * 0.6 * u));
      vUvS = vec3(uv, 1.0);
    }
    p = hand * s + p * iD.w;
  } else {
    if (part > 0.5 && part < 2.5) {
      float a = sw * 0.72 * g * (part < 1.5 ? 1.0 : -1.0);
      p = rotX(p, 0.8, 0.0, a); n = rotXn(n, a);
      float lift = max(0.0, -cos(ph) * (part < 1.5 ? 1.0 : -1.0)) * 0.08 * g;
      if (p.y < 0.45) p.y += lift;
    } else if (part > 2.5 && part < 4.5) {
      float side = part < 3.5 ? 1.0 : -1.0;
      float a = -sw * 0.85 * g * side + idle * 0.06 * breath * side - 0.15 * g;
      if (flagOn && side > 0.0) a = -0.5;
      p = rotX(p, 1.3, 0.0, a); n = rotXn(n, a);
    } else if (part > 5.5 && part < 6.5) {
      float a = ((0.12 + 0.75 * g) + sin(uTime * 7.0 + look * 30.0 + p.y * 3.0) * 0.08 * (0.3 + g)) * (1.0 - smoothstep(0.3, 1.32, p.y));
      p = rotX(p, 1.32, -0.17, a); n = rotXn(n, a);
    }
    if (part < 0.5 || part > 4.5) {
      float lean = 0.16 * g;
      p = rotX(p, 0.78, 0.0, lean); n = rotXn(n, lean);
      p.y += idle * breath * 0.008 * step(1.0, p.y);
    }
    p.y += abs(cos(ph)) * 0.07 * g;
    p *= s;
  }
  if (!show) p = vec3(0.0);
  float cy = cos(iA.w), sy = sin(iA.w);
  vec3 w = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy) + iA.xyz;
  vec3 nw = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);

  vec3 team = iC.rgb;
  float h1 = fract(look * 7.13), h2 = fract(look * 13.7), h3 = fract(look * 3.31);
  vec3 base; float em = 0.0;
  if (reg < 0.5) base = variant == 3 ? vec3(0.62, 0.66, 0.72) : variant == 4 ? vec3(0.9) : uSkin[int(h1 * 4.99)];
  else if (reg < 1.5) base = team;
  else if (reg < 2.5) base = variant == 3 ? vec3(0.3, 0.33, 0.38) : variant == 2 ? team * 0.35 : uPants[int(h2 * 5.99)];
  else if (reg < 3.5) base = variant == 1 ? vec3(0.03) : uHair[int(h3 * 5.99)];
  else if (reg < 4.5) base = variant == 3 ? vec3(0.2, 0.22, 0.26) : vec3(0.035);
  else if (reg < 5.5) base = variant == 2 ? vec3(0.5, 0.03, 0.08) : team * 0.7;
  else if (reg < 6.5) { base = vec3(1.0, 0.64, 0.14); em = 0.35; }
  else if (reg < 7.5) base = vec3(0.92);
  else if (reg < 8.5) base = vec3(0.03);
  else if (reg < 9.5) base = vec3(0.6, 0.64, 0.7);
  else if (reg < 10.5) { base = team; em = 1.2; }
  else if (reg < 11.5) base = iF.rgb;
  else if (reg < 12.5) base = vec3(0.12, 0.09, 0.07);
  else base = mix(team, vec3(1.0), 0.18);
  vec3 info = sampleInfo(iA.xz);
  vec3 L = lightAt(nw, info);
  vec3 V = normalize(cameraPosition - w);
  float rim = pow(max(1.0 - abs(dot(nw, V)), 0.0), 3.0);
  vec3 col = base * L * 0.72 + base * em + rim * uRimCol * 0.4;
  if (reg > 0.5 && reg < 1.5 || reg > 12.5 || (reg > 4.5 && reg < 5.5 && variant != 2)) col += team * 0.22 * (1.0 + 0.6 * max(nw.y, 0.0)) + rim * team * 0.6;
  if (reg > 8.5 && reg < 9.5) col += pow(max(nw.y, 0.0), 4.0) * 0.25;
  col += flash * vec3(1.0, 0.95, 0.85) * 1.6;
  vCol = col;
  vSlot = iD.y;
  vFlagCol = iF.rgb * L * 0.6 + iF.rgb * 0.45;
  vec4 mvPosition = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const HERO_FRAG = /* glsl */`
uniform sampler2D uEmb;
varying vec3 vCol;
varying vec3 vUvS;
varying float vSlot;
varying vec3 vFlagCol;
#include <fog_pars_fragment>
void main() {
  vec3 col = vCol;
  if (vUvS.z > 0.5) {
    vec2 uv = vUvS.xy;
    vec2 e = (uv - vec2(0.56, 0.5)) * vec2(1.6, 1.0) / 0.82 + 0.5;
    float a = 0.0;
    if (e.x > 0.0 && e.x < 1.0 && e.y > 0.0 && e.y < 1.0) {
      vec2 cell = vec2(mod(vSlot, 4.0), floor(vSlot / 4.0));
      a = texture2D(uEmb, (cell + vec2(e.x, 1.0 - e.y)) * 0.25).a;
    }
    float hoist = 1.0 - smoothstep(0.08, 0.11, uv.x);
    float edge = smoothstep(0.86, 0.9, uv.y) + 1.0 - smoothstep(0.1, 0.14, uv.y);
    col = mix(vFlagCol, vFlagCol * 0.45, max(hoist, edge * 0.6));
    col = mix(col, vec3(1.0, 0.96, 0.86) * 1.3, a);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function createHeroes(shared, max = 16) {
  const geo = heroGeometry();
  const A = new Float32Array(max * 4), B = new Float32Array(max * 4), Cc = new Float32Array(max * 4), D = new Float32Array(max * 4), F = new Float32Array(max * 4);
  const mk = (arr) => new THREE.InstancedBufferAttribute(arr, 4).setUsage(THREE.DynamicDrawUsage);
  const ia = mk(A), ib = mk(B), ic = mk(Cc), id = mk(D), iff = mk(F);
  geo.setAttribute('iA', ia); geo.setAttribute('iB', ib); geo.setAttribute('iC', ic); geo.setAttribute('iD', id); geo.setAttribute('iF', iff);
  geo.instanceCount = 0;
  const atlas = emblemAtlas();
  const mat = new THREE.ShaderMaterial({
    vertexShader: HERO_VERT, fragmentShader: HERO_FRAG, fog: true, side: THREE.DoubleSide,
    uniforms: { ...fogUniforms(), ...shared, uSkin: { value: SKIN }, uHair: { value: HAIR }, uPants: { value: PANTS }, uEmb: { value: atlas.tex } },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  let n = 0;
  const col = new THREE.Color();
  return {
    mesh,
    setEmblems(list) { atlas.set(list); },
    begin() { n = 0; },
    // f: leader figure state from crowd.js; c: crowd (cos, color); flagH: world pole height
    add(f, c, flagH) {
      if (n >= max) return;
      const o = n * 4;
      A[o] = f.x; A[o + 1] = f.y; A[o + 2] = f.z; A[o + 3] = f.yaw;
      B[o] = f.phase; B[o + 1] = f.gait; B[o + 2] = f.look; B[o + 3] = f.flash;
      Cc[o] = c.color.r; Cc[o + 1] = c.color.g; Cc[o + 2] = c.color.b; Cc[o + 3] = f.scale;
      const cos = c.cos;
      D[o] = cos.leader; D[o + 1] = c.index % 16; D[o + 2] = cos.flag ? 1 : 0; D[o + 3] = flagH;
      if (cos.flag) {
        col.copy(c.color);
        if (cos.flag.color != null) col.setHex(cos.flag.color);
        F[o] = col.r; F[o + 1] = col.g; F[o + 2] = col.b; F[o + 3] = 1;
      }
      n++;
    },
    commit() { geo.instanceCount = n; mesh.visible = n > 0; for (const a of [ia, ib, ic, id, iff]) a.needsUpdate = true; },
    get count() { return n; },
  };
}

// ---------- trail presets for the particle pool ----------
// shape: 0 glow, 1 star, 2 petal, 3 heart, 4 bolt, 5 confetti, 6 puff
const CONF = [[1, 0.25, 0.3], [1, 0.85, 0.2], [0.25, 0.7, 1], [0.3, 1, 0.45], [1, 0.4, 0.85], [0.7, 0.4, 1]];
export function trailEmit(particles, kind, x, z, vx, vz, team, rnd = Math.random) {
  const t = TRAIL_IDS[kind - 1];
  const j = () => (rnd() - 0.5);
  switch (t) {
    case 'sparkle':
      particles.emit(x, 0.6 + rnd() * 1.8, z, vx * 0.2 + j(), 0.6 + rnd(), vz * 0.2 + j(), 1.6 + team.r, 1.4 + team.g, 0.9 + team.b, 0.45 + rnd() * 0.3, 0.7 + rnd() * 0.4, -0.6, 1, rnd() * 6);
      break;
    case 'petals': {
      const k = rnd();
      particles.emit(x, 1.4 + rnd() * 1.4, z, vx * 0.25 + j() * 2, 0.4, vz * 0.25 + j() * 2, k < 0.5 ? 1.4 : 1.6, k < 0.5 ? 0.45 : 0.8, k < 0.5 ? 0.7 : 0.9, 0.42 + rnd() * 0.2, 1.6 + rnd() * 0.8, 1.2, 2, rnd() * 6);
      break;
    }
    case 'dust':
      particles.emit(x, 0.15, z, vx * 0.1 + j() * 1.5, 0.5 + rnd() * 0.6, vz * 0.1 + j() * 1.5, 0.42, 0.34, 0.28, 0.9 + rnd() * 0.7, 0.9 + rnd() * 0.5, -0.4, 6, rnd() * 6);
      break;
    case 'lightning':
      if (rnd() < 0.35) particles.emit(x, 0.6 + rnd() * 1.6, z, 0, 0, 0, 1.6 + team.r, 1.8 + team.g, 2.6 + team.b, 1.3 + rnd() * 0.6, 0.18 + rnd() * 0.12, 0, 4, rnd() * 6);
      else particles.emit(x, 0.3 + rnd(), z, j() * 3, 1 + rnd() * 2, j() * 3, 0.9, 1.4, 2.4, 0.3, 0.35, 2, 0, 0);
      break;
    case 'confetti': {
      const c = CONF[(rnd() * CONF.length) | 0];
      particles.emit(x, 2 + rnd() * 1.5, z, vx * 0.2 + j() * 3, 1.5 + rnd() * 2, vz * 0.2 + j() * 3, c[0] * 1.5, c[1] * 1.5, c[2] * 1.5, 0.32 + rnd() * 0.12, 1.4 + rnd() * 0.5, 4, 5, rnd() * 6);
      break;
    }
    case 'hearts':
      particles.emit(x, 1.2 + rnd() * 1.4, z, vx * 0.15 + j(), 0.8 + rnd() * 0.6, vz * 0.15 + j(), 2.0, 0.35, 0.6, 0.5 + rnd() * 0.25, 1.1 + rnd() * 0.4, -0.5, 3, j() * 0.6);
      break;
    case 'smoke':
      particles.emit(x, 0.4 + rnd() * 0.5, z, vx * 0.1 + j(), 0.6 + rnd() * 0.5, vz * 0.1 + j(), 0.3 + team.r * 0.25, 0.28 + team.g * 0.25, 0.36 + team.b * 0.25, 1.3 + rnd() * 0.8, 1.4 + rnd() * 0.6, -0.5, 6, rnd() * 6);
      break;
  }
}
