// Procedural low-poly mob models. Geometry is merged boxes with baked face shading in vertex colours,
// cached per kind and shared by every mob of that kind. Each mob gets its own small material (tint + flash
// uniforms; all mobs share one shader program).

let T = null;
const geoCache = new Map();
const glowMats = new Map();

const SHADE = { px: 0.82, nx: 0.74, py: 1.0, ny: 0.5, pz: 0.92, nz: 0.66 };

// sRGB hex -> linear working space (the renderer outputs sRGB).
function hex(c) { const k = new T.Color(c); return [k.r, k.g, k.b]; }

// parts: [{ s:[w,h,d], p:[x,y,z], c:'#hex', r:[rx,ry,rz], shade:false }]
function merge(parts) {
  const pos = [], col = [];
  const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), n = new T.Vector3();
  const nm = new T.Matrix3();
  for (const pt of parts) {
    const g = new T.BoxGeometry(...pt.s).toNonIndexed();
    e.set(...(pt.r || [0, 0, 0]));
    q.setFromEuler(e);
    m.compose(new T.Vector3(...pt.p), q, new T.Vector3(1, 1, 1));
    nm.getNormalMatrix(m);
    const P = g.attributes.position, N = g.attributes.normal;
    const c = hex(pt.c);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      let k = 1;
      if (pt.shade !== false) {
        n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        k = n.y > 0.5 ? SHADE.py : n.y < -0.5 ? SHADE.ny : Math.abs(n.x) > Math.abs(n.z) ? (n.x > 0 ? SHADE.px : SHADE.nx) : (n.z > 0 ? SHADE.pz : SHADE.nz);
      }
      col.push(c[0] * k, c[1] * k, c[2] * k);
    }
    g.dispose();
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

export function geo(key, parts) {
  if (!geoCache.has(key)) geoCache.set(key, merge(parts));
  return geoCache.get(key);
}

export function bodyMaterial() {
  const mat = new T.MeshBasicMaterial({ vertexColors: true });
  const u = { uTint: { value: new T.Color(1, 1, 1) }, uFlash: { value: new T.Vector4(1, 1, 1, 0) } };
  mat.userData.u = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform vec4 uFlash;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight * uTint, uFlash.rgb, uFlash.a);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'synthwild-mob';
  return mat;
}

export function glowMaterial(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!glowMats.has(key)) {
    glowMats.set(key, new T.MeshBasicMaterial({ color: new T.Color(color), toneMapped: false, fog: false, ...opts }));
  }
  return glowMats.get(key);
}

let glowTex = null;
export function glowSprite(color, size) {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    glowTex = new T.CanvasTexture(c);
  }
  const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: new T.Color(color), transparent: true,
    blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  s.scale.setScalar(size);
  return s;
}

export function mesh(g, mat, parent, pos = [0, 0, 0]) {
  const m = new T.Mesh(g, mat);
  m.position.set(...pos);
  m.matrixAutoUpdate = true;
  parent.add(m);
  return m;
}

export function pivot(parent, pos) {
  const p = new T.Group();
  p.position.set(...pos);
  parent.add(p);
  return p;
}

// ---- Bin-droid ibis: a little white waste-bin body, wing-lid flaps, black neck, long curved bill ----
function buildIbis(mat) {
  const root = new T.Group();
  const body = pivot(root, [0, 0.5, 0]);
  mesh(geo('ibis.body', [
    { s: [0.42, 0.34, 0.58], p: [0, 0.06, 0], c: '#e9eef3' },
    { s: [0.44, 0.06, 0.6], p: [0, 0.25, 0], c: '#2ec4d6' },          // bin lid rim
    { s: [0.24, 0.02, 0.3], p: [0, 0.285, -0.04], c: '#1a2a33' },     // lid slot
    { s: [0.36, 0.05, 0.5], p: [0, -0.13, 0], c: '#5b6b7c' },
    { s: [0.3, 0.12, 0.2], p: [0, 0.12, -0.36], c: '#2b2f38', r: [0.5, 0, 0] }, // tail
    { s: [0.06, 0.12, 0.3], p: [0.22, 0.03, 0], c: '#2ec4d6' },        // side status strips
    { s: [0.06, 0.12, 0.3], p: [-0.22, 0.03, 0], c: '#2ec4d6' },
  ]), mat, body);
  const wingL = pivot(body, [0.23, 0.2, 0.05]);
  const wingR = pivot(body, [-0.23, 0.2, 0.05]);
  mesh(geo('ibis.wing', [{ s: [0.05, 0.22, 0.46], p: [0, -0.09, -0.04], c: '#d2dbe4' }, { s: [0.052, 0.06, 0.4], p: [0, -0.18, -0.06], c: '#2b2f38' }]), mat, wingL);
  mesh(geo('ibis.wing', null), mat, wingR);
  const neck = pivot(body, [0, 0.16, 0.24]);
  mesh(geo('ibis.neck', [
    { s: [0.09, 0.42, 0.09], p: [0, 0.2, 0.05], c: '#20242c', r: [0.3, 0, 0] },
  ]), mat, neck);
  const head = pivot(neck, [0, 0.42, 0.13]);
  mesh(geo('ibis.head', [
    { s: [0.15, 0.14, 0.17], p: [0, 0, 0], c: '#262b34' },
    { s: [0.05, 0.05, 0.14], p: [0, -0.01, 0.14], c: '#d9b45f', r: [0.15, 0, 0] },
    { s: [0.045, 0.045, 0.14], p: [0, -0.05, 0.26], c: '#c9a24c', r: [0.5, 0, 0] },
    { s: [0.04, 0.04, 0.13], p: [0, -0.12, 0.35], c: '#b48d3c', r: [0.95, 0, 0] },
    { s: [0.035, 0.035, 0.1], p: [0, -0.21, 0.39], c: '#a07c35', r: [1.35, 0, 0] },
  ]), mat, head);
  mesh(geo('ibis.eyes', [{ s: [0.16, 0.04, 0.04], p: [0, 0.03, 0.05], c: '#ffb347', shade: false }]),
    glowMaterial('#ffb347'), head);
  const legs = [];
  for (const x of [0.1, -0.1]) {
    const leg = pivot(root, [x, 0.36, 0]);
    mesh(geo('ibis.leg', [
      { s: [0.035, 0.36, 0.035], p: [0, -0.18, 0], c: '#d9b45f' },
      { s: [0.12, 0.02, 0.15], p: [0, -0.355, 0.03], c: '#a07c35' },
    ]), mat, leg);
    legs.push(leg);
  }
  return { root, body, head, neck, wingL, wingR, legs };
}

// ---- Glitchfuse: creeper silhouette, teal chassis with glyph-screen face, four stubby legs ----
function buildGlitchfuse(mat) {
  const root = new T.Group();
  const body = pivot(root, [0, 0.4, 0]);
  mesh(geo('gf.body', [
    { s: [0.5, 0.9, 0.36], p: [0, 0.45, 0], c: '#2fae86' },
    { s: [0.52, 0.04, 0.38], p: [0, 0.3, 0], c: '#17614c' },             // panel seams
    { s: [0.52, 0.04, 0.38], p: [0, 0.62, 0], c: '#17614c' },
    { s: [0.12, 0.5, 0.06], p: [0.13, 0.42, -0.19], c: '#1b7d61' },      // back vents
    { s: [0.12, 0.5, 0.06], p: [-0.13, 0.42, -0.19], c: '#1b7d61' },
  ]), mat, body);
  const head = pivot(body, [0, 0.9, 0]);
  mesh(geo('gf.head', [
    { s: [0.56, 0.52, 0.52], p: [0, 0.26, 0], c: '#36c494' },
    { s: [0.46, 0.42, 0.04], p: [0, 0.26, 0.26], c: '#0c2420', shade: false },   // face screen
    { s: [0.58, 0.05, 0.54], p: [0, 0.53, 0], c: '#1d8064' },
  ]), mat, head);
  const face = mesh(geo('gf.face', [
    { s: [0.12, 0.12, 0.02], p: [-0.11, 0.33, 0.285], c: '#ffffff', shade: false },
    { s: [0.12, 0.12, 0.02], p: [0.11, 0.33, 0.285], c: '#ffffff', shade: false },
    { s: [0.08, 0.12, 0.02], p: [0, 0.2, 0.285], c: '#ffffff', shade: false },
    { s: [0.2, 0.08, 0.02], p: [0, 0.12, 0.285], c: '#ffffff', shade: false },
    { s: [0.05, 0.08, 0.02], p: [-0.075, 0.06, 0.285], c: '#ffffff', shade: false },
    { s: [0.05, 0.08, 0.02], p: [0.075, 0.06, 0.285], c: '#ffffff', shade: false },
  ]), glowMaterial('#5ff7ff'), head);
  const legs = [];
  for (const [x, z] of [[0.14, 0.13], [-0.14, 0.13], [0.14, -0.13], [-0.14, -0.13]]) {
    const leg = pivot(root, [x, 0.4, z]);
    mesh(geo('gf.leg', [
      { s: [0.2, 0.4, 0.2], p: [0, -0.2, 0], c: '#238e6e' },
      { s: [0.22, 0.06, 0.26], p: [0, -0.37, 0.03], c: '#15493b' },
    ]), mat, leg);
    legs.push(leg);
  }
  // Fuse telegraph: a ground ring showing the blast radius and a glyph halo around the body.
  // Normal blending so the ring still reads on bright mirror sand (additive vanishes against white).
  const ringMat = new T.MeshBasicMaterial({ color: 0x9ffcff, transparent: true, opacity: 0, side: T.DoubleSide,
    depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // The ground ring marks the blast radius and draws through terrain, like a hologram projection.
  const groundMat = ringMat.clone();
  groundMat.depthTest = false;
  const ring = new T.Mesh(ringGeo(), groundMat);
  ring.renderOrder = 3;
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  ring.visible = false;
  root.add(ring);
  const halo = new T.Mesh(glyphHaloGeo(), ringMat);
  halo.position.y = 1.1;
  halo.visible = false;
  root.add(halo);
  const glow = glowSprite('#9ffcff', 0.1);
  glow.material.depthTest = false;
  glow.renderOrder = 2;
  glow.position.y = 1.1;
  glow.visible = false;
  root.add(glow);
  return { root, body, head, face, legs, ring, halo, ringMat, groundMat, glow };
}

function ringGeo() {
  if (geoCache.has('gf.ring')) return geoCache.get('gf.ring');
  // Unit radius: an outer band plus 12 glyph ticks pointing in.
  const parts = [new T.RingGeometry(0.9, 1.0, 48)];
  for (let i = 0; i < 12; i++) {
    const g = new T.PlaneGeometry(0.06, i % 3 ? 0.12 : 0.24);
    g.translate(0, 0.86 - (i % 3 ? 0.06 : 0.12), 0);
    g.rotateZ((i / 12) * Math.PI * 2);
    parts.push(g);
  }
  const g = mergeFlat(parts);
  geoCache.set('gf.ring', g);
  return g;
}

function glyphHaloGeo() {
  if (geoCache.has('gf.halo')) return geoCache.get('gf.halo');
  // A vertical band of glyph blocks circling the body.
  const parts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const h = [0.18, 0.08, 0.26, 0.12][i % 4];
    const g = new T.PlaneGeometry(0.1, h);
    g.translate(0, (i % 2 ? 0.08 : -0.04), 0.55);
    g.rotateY(a);
    parts.push(g);
  }
  const g = mergeFlat(parts);
  geoCache.set('gf.halo', g);
  return g;
}

export function mergeFlat(geos) {
  const pos = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    g0.dispose();
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  return g;
}

// ---- Reboot: hunched gunmetal cyborg, red visor, arms forward, cable spine ----
function buildReboot(mat) {
  const root = new T.Group();
  const hips = pivot(root, [0, 0.82, 0]);
  const torso = pivot(hips, [0, 0, 0]);
  mesh(geo('rb.torso', [
    { s: [0.56, 0.62, 0.32], p: [0, 0.36, 0.02], c: '#5d6573' },
    { s: [0.4, 0.3, 0.06], p: [0, 0.42, 0.19], c: '#3b414c' },            // chest plate
    { s: [0.08, 0.66, 0.08], p: [0, 0.34, -0.17], c: '#c2386b' },         // cable spine
    { s: [0.64, 0.14, 0.36], p: [0, 0.66, 0], c: '#474e5a' },             // shoulders
    { s: [0.36, 0.16, 0.26], p: [0, 0.04, 0], c: '#30353e' },             // waist
    { s: [0.12, 0.08, 0.04], p: [0.12, 0.3, 0.2], c: '#ff3b4e', shade: false }, // chest status light
  ]), mat, torso);
  torso.rotation.x = 0.28;
  const head = pivot(torso, [0, 0.74, 0.06]);
  mesh(geo('rb.head', [
    { s: [0.38, 0.36, 0.38], p: [0, 0.18, 0], c: '#6e7684' },
    { s: [0.4, 0.06, 0.4], p: [0, 0.35, 0], c: '#444b56' },
    { s: [0.06, 0.2, 0.06], p: [0.15, 0.48, -0.08], c: '#3b414c', r: [0, 0, -0.3] }, // broken antenna
    { s: [0.36, 0.1, 0.06], p: [0, 0.2, 0.19], c: '#140608', shade: false },
  ]), mat, head);
  const visor = mesh(geo('rb.visor', [{ s: [0.34, 0.06, 0.03], p: [0, 0.2, 0.215], c: '#ffffff', shade: false }]),
    glowMaterial('#ff2a3a'), head);
  const flare = glowSprite('#ff2a3a', 0.35);
  flare.position.set(0, 0.2, 0.3);
  head.add(flare);
  const core = glowSprite('#ffffff', 0.01);
  core.position.set(0, 0.2, 0.32);
  head.add(core);
  const arms = [];
  for (const x of [0.36, -0.36]) {
    const arm = pivot(torso, [x, 0.62, 0]);
    mesh(geo('rb.arm', [
      { s: [0.16, 0.36, 0.16], p: [0, -0.16, 0], c: '#5d6573' },
      { s: [0.13, 0.36, 0.13], p: [0, -0.48, 0.02], c: '#7d8695' },
      { s: [0.17, 0.12, 0.17], p: [0, -0.7, 0.02], c: '#30353e' },
      { s: [0.17, 0.05, 0.17], p: [0, -0.33, 0], c: '#c2386b' },
    ]), mat, arm);
    arm.rotation.x = -1.25;
    arms.push(arm);
  }
  const legs = [];
  for (const x of [0.14, -0.14]) {
    const leg = pivot(root, [x, 0.82, 0]);
    mesh(geo('rb.leg', [
      { s: [0.2, 0.42, 0.2], p: [0, -0.2, 0], c: '#4b525e' },
      { s: [0.17, 0.42, 0.17], p: [0, -0.6, 0], c: '#6e7684' },
      { s: [0.22, 0.08, 0.3], p: [0, -0.78, 0.05], c: '#30353e' },
      { s: [0.21, 0.05, 0.21], p: [0, -0.4, 0], c: '#c2386b' },
    ]), mat, leg);
    legs.push(leg);
  }
  return { root, hips, torso, head, visor, flare, core, arms, legs };
}

const BUILDERS = { ibis: buildIbis, glitchfuse: buildGlitchfuse, reboot: buildReboot };
export function registerModel(kind, fn) { BUILDERS[kind] = fn; }
export const three = () => T;

export function buildModel(THREE, kind) {
  T = THREE;
  const mat = bodyMaterial();
  const parts = BUILDERS[kind](mat);
  parts.mat = mat;
  return parts;
}
