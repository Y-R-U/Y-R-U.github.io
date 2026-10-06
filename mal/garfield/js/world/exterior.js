import * as THREE from '../../vendor/three/three.module.js';
import { Builder, frameAt } from './houseBuild.js';
import { W, D, T, UF, CEIL2 } from './house.js';
import { dressHero, dressNeighbour, makeGlows, scatter } from './exteriorDress.js';

export const GROUND_Y = -0.3;
export const SUN_DIR = new THREE.Vector3(0.45, 0.075, 0.89).normalize();
export const BULB = new THREE.Vector3(4.6, GROUND_Y, -19);
const BULB_R = 10;

function groundAO(p) {
  const h = p.y - GROUND_Y;
  return h < 0.02 ? 1 : 1 - 0.35 * Math.exp(-h / 0.5);
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x2e2a6e) }, mid: { value: new THREE.Color(0xa45c98) },
      horizon: { value: new THREE.Color(0xff9a52) }, sunCol: { value: new THREE.Color(0xffe2a0) },
      sunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 zenith, mid, horizon, sunCol, sunDir; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        // orange only around the sun; the rest of the horizon is dusky rose like the ref
        vec3 hz = mix(vec3(0.74, 0.42, 0.56), horizon, smoothstep(0.82, 0.995, s));
        vec3 c = mix(hz, mid, smoothstep(0.0, 0.12 + 0.1 * s * s, h));
        c = mix(c, zenith, smoothstep(0.2, 0.7, h));
        c += sunCol * (pow(s, 20.0) * 0.45 + smoothstep(0.99955, 0.9998, s) * 1.6);
        // soft painterly cloud streaks
        float az = atan(vDir.x, vDir.z);
        float band = smoothstep(0.03, 0.12, h) * (1.0 - smoothstep(0.22, 0.45, h));
        float n = sin(az * 7.0 + sin(az * 3.0) * 2.0) * 0.5 + sin(az * 17.0 + h * 40.0) * 0.3 + sin(az * 31.0 - h * 25.0) * 0.2;
        float cl = smoothstep(0.25, 0.75, n * 0.5 + 0.5) * band;
        vec3 cloudCol = mix(vec3(0.42, 0.26, 0.42), vec3(1.0, 0.62, 0.45), pow(s, 3.0) + smoothstep(0.25, 0.05, h) * 0.4);
        c = mix(c, cloudCol, cl * 0.75);
        c = mix(c, hz * 0.85, smoothstep(0.0, -0.15, h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function buildExterior({ quality = 'high' } = {}) {
  const near = new Builder(groundAO), far = new Builder(groundAO);
  near.cast = false; far.cast = quality === 'high';
  const lampPositions = [], glows = [];

  // ---------- sky + ground ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMaterial());
  sky.name = 'sky';
  sky.renderOrder = -10;
  sky.frustumCulled = false;

  // ground: coarse grid with low-frequency colour variation so the lawn doesn't read as one tiled sheet
  {
    const hash = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
    const vn = (x, z) => {
      const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
      const sx = xf * xf * (3 - 2 * xf), sz = zf * zf * (3 - 2 * zf);
      const a = hash(xi, zi), b2 = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
      return a + (b2 - a) * sx + (c - a) * sz + (a - b2 - c + d) * sx * sz;
    };
    near.grid('grass', -150, 160, -170, 140, [], (u, v) => new THREE.Vector3(u, GROUND_Y, v), new THREE.Vector3(0, 1, 0), 0xa7c27a,
      { step: 5, receive: true, ao: false, selfAO: (p) => 0.7 + 0.28 * vn(p.x / 18, p.z / 18) + 0.1 * vn(p.x / 5, p.z / 5) - Math.min(0.35, Math.max(0, (Math.hypot(p.x - 4.6, p.z + 10) - 70) / 200)) });
  }

  // ---------- hero house shell bits (porch, roof, foundation) ----------
  const H = far;
  H.layer = 'hero';
  // foundation band
  H.box('concrete', -T - 0.03, GROUND_Y, -T - 0.03, W + T + 0.03, 0.02, D + T + 0.03, 0xd8cfc0, { cast: false });
  // corner boards
  for (const [x, z] of [[-T, -T], [W + T, -T], [-T, D + T], [W + T, D + T]]) H.box('paint', x - 0.07, 0, z - 0.07, x + 0.07, CEIL2 + T, z + 0.07, 0xfbf3e2, { cast: false });
  // floor band between storeys
  H.box('paint', -T - 0.04, UF - 0.12, -T - 0.04, W + T + 0.04, UF + 0.02, D + T + 0.04, 0xfbf3e2, { cast: false });
  // gable roof, ridge along x
  {
    const eaveY = CEIL2 + T, oh = 0.5, z0 = -T - oh, z1 = D + T + oh, zr = D / 2, rise = 3.0;
    const ridgeY = eaveY + rise + 0.02;
    const run = zr - z0, slope = Math.atan2(rise, zr - (-T));
    const len = Math.hypot(run, rise * run / (zr + T));
    for (const s of [-1, 1]) {
      const zc = zr + s * run / 2;
      const yc = eaveY + rise / 2 - rise * (oh / (zr + T)) / 2;
      const m = new THREE.Matrix4().makeTranslation(4.6, yc, zc).multiply(new THREE.Matrix4().makeRotationX(s * slope));
      H.box('shingles', -T - oh - 4.6, -0.08, -len / 2, W + T + oh - 4.6, 0.08, len / 2, 0x5a6890, { matrix: m, cast: true });
      H.box('paint', -T - oh - 4.6, -0.2, -len / 2, W + T + oh - 4.6, -0.08, len / 2, 0xfbf3e2, { matrix: m, cast: false });
    }
    H.box('shingles', -T - oh, ridgeY - 0.06, zr - 0.15, W + T + oh, ridgeY + 0.1, zr + 0.15, 0x4a5678, { r: 0.05 });
    // gable triangles
    for (const [x, sgn] of [[-T, -1], [W + T, 1]]) {
      const shape = new THREE.Shape([new THREE.Vector2(-T, 0), new THREE.Vector2(D + T, 0), new THREE.Vector2(zr, rise)]);
      const g = new THREE.ShapeGeometry(shape);
      const m = new THREE.Matrix4().makeTranslation(x, eaveY, 0).multiply(new THREE.Matrix4().makeRotationY(sgn < 0 ? -Math.PI / 2 : Math.PI / 2));
      if (sgn < 0) m.multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
      // ShapeGeometry lies in XY; map shape-x → world z
      const mm = new THREE.Matrix4().set(0, 0, 0, x, 0, 1, 0, eaveY, 1, 0, 0, 0, 0, 0, 0, 1);
      const gg = g.clone(); gg.applyMatrix4(mm);
      const nrm = gg.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, sgn, 0, 0);
      if (sgn > 0) { const ix = gg.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } }
      H.geom('siding', gg, null, 0xf2e2bc, { cast: false });
      // round attic vent
      H.cyl('paint', null, x + sgn * 0.02, eaveY + 1.3, zr, 0.35, 0.35, 0.05, 0xfbf3e2, { rot: [0, 0, Math.PI / 2], radial: 20, cast: false });
      H.cyl('glowWindow', null, x + sgn * 0.04, eaveY + 1.3, zr, 0.26, 0.26, 0.04, 0xffffff, { rot: [0, 0, Math.PI / 2], radial: 20, cast: false });
    }
    // chimney
    H.box('concrete', 1.2, eaveY, 6.2, 2.0, ridgeY + 1.0, 7.0, 0xb8664a, { cast: true });
    H.box('concrete', 1.12, ridgeY + 1.0, 6.12, 2.08, ridgeY + 1.12, 7.08, 0x9a5a44, { cast: false });
  }
  // single-storey brick wing on the +x side
  {
    const x0 = W + T, x1 = W + T + 3.4, z0 = 2.4, z1 = 9.4, h = 3.0;
    H.box('brick', x0, GROUND_Y, z0, x1, h, z1, 0xffffff, { cast: true });
    const rise = 1.5, half = (z1 - z0) / 2 + 0.35, slope = Math.atan2(rise, (z1 - z0) / 2), len = Math.hypot(half, rise * half / ((z1 - z0) / 2));
    for (const sg of [-1, 1]) {
      const m = new THREE.Matrix4().makeTranslation((x0 + x1) / 2 + 0.2, h + rise / 2 - 0.12, (z0 + z1) / 2 + sg * half / 2).multiply(new THREE.Matrix4().makeRotationX(sg * slope));
      H.box('shingles', -(x1 - x0) / 2 - 0.3, -0.07, -len / 2, (x1 - x0) / 2 + 0.2, 0.07, len / 2, 0x5a6890, { matrix: m });
    }
    const shape = new THREE.Shape([new THREE.Vector2(-(z1 - z0) / 2, 0), new THREE.Vector2((z1 - z0) / 2, 0), new THREE.Vector2(0, rise)]);
    const g = new THREE.ShapeGeometry(shape);
    H.geom('siding', g, new THREE.Matrix4().makeTranslation(x1, h, (z0 + z1) / 2).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)), 0xf2e2bc, { cast: false });
    // big lit window facing the street + side window
    H.box('paint', x0 + 0.8, 0.8, z0 - 0.06, x1 - 0.8, 2.3, z0, 0xfbf3e2, { cast: false });
    H.box('glowWindow', x0 + 0.9, 0.9, z0 - 0.07, x1 - 0.9, 2.2, z0 - 0.05, 0xffffff, { cast: false });
    H.box('paint', (x0 + x1) / 2 - 0.03, 0.9, z0 - 0.08, (x0 + x1) / 2 + 0.03, 2.2, z0 - 0.06, 0xfbf3e2, { cast: false });
    H.box('paint', x1, 1.0, 5.2, x1 + 0.06, 2.2, 6.6, 0xfbf3e2, { cast: false });
    H.box('glowWindow', x1 + 0.05, 1.1, 5.3, x1 + 0.07, 2.1, 6.5, 0xffffff, { cast: false });
    H.box('wood', x0 + 0.7, 0.55, z0 - 0.3, x1 - 0.7, 0.75, z0 - 0.06, 0x8a5a36, { cast: false });
    for (let k = 0; k < 9; k++) H.sphere('leaf', null, x0 + 0.8 + k * (x1 - x0 - 1.6) / 8, 0.8, z0 - 0.18, 0.08, [0xe0543c, 0xf2b234, 0xf08aa0][k % 3], { ws: 8, hs: 6, cast: false });
  }
  // exterior window trim + shutters + flower boxes on the front
  const shutterCol = 0x4f5f86;
  for (const [x0, x1, y0, y1] of [[2.4, 3.6, 0.9, 2.1], [0.7, 1.5, 1.0, 2.1], [2.4, 3.6, UF + 0.9, UF + 2.0], [6.9, 7.8, UF + 0.9, UF + 2.0]]) {
    const z = -T;
    H.box('paint', x0 - 0.1, y0 - 0.08, z - 0.05, x1 + 0.1, y0, z, 0xfbf3e2, { cast: false });
    H.box('paint', x0 - 0.1, y1, z - 0.04, x1 + 0.1, y1 + 0.12, z, 0xfbf3e2, { cast: false });
    H.box('paint', x0 - 0.1, y0, z - 0.03, x0, y1, z, 0xfbf3e2, { cast: false });
    H.box('paint', x1, y0, z - 0.03, x1 + 0.1, y1, z, 0xfbf3e2, { cast: false });
    const sw = (x1 - x0) * 0.45;
    for (const sx of [x0 - 0.12 - sw, x1 + 0.12]) {
      H.box('paint', sx, y0, z - 0.05, sx + sw, y1, z - 0.01, shutterCol, { cast: false });
      for (let k = 1; k < 8; k++) H.box('paint', sx + 0.03, y0 + (y1 - y0) * k / 8 - 0.008, z - 0.06, sx + sw - 0.03, y0 + (y1 - y0) * k / 8 + 0.008, z - 0.05, 0x355e5a, { cast: false });
    }
    // flower box
    H.box('wood', x0 - 0.05, y0 - 0.3, z - 0.28, x1 + 0.05, y0 - 0.1, z - 0.05, 0x8a5a36, { cast: false });
    for (let k = 0; k < 8; k++) H.sphere('leaf', null, x0 + (x1 - x0) * (k + 0.5) / 8, y0 - 0.07, z - 0.17, 0.08, [0xe0543c, 0xf2b234, 0xf08aa0, 0x6aa852][k % 4], { ws: 8, hs: 6, cast: false });
  }
  // glass for the exterior side of the living window (the props sash sits inside)
  H.box('glass', 2.4, 0.9, -0.12, 3.6, 2.1, -0.11, 0xffffff, { cast: false });

  // porch (near group so it shows through the front windows)
  {
    const P = near;
    P.layer = 'yard';
    const x0 = 5.4, x1 = 8.8, z0 = -2.3, z1 = -T;
    P.box('wood', x0, GROUND_Y, z0, x1, 0, z1, 0xb98256, { cast: false });
    for (let i = 0; i < 2; i++) P.box('wood', 6.5 - 0.1, GROUND_Y, z0 - 0.32 * (i + 1), 7.7 + 0.1, GROUND_Y + 0.15 * (2 - i) - 0.15, z0 - 0.32 * i, 0xa97246, { cast: false });
    for (const x of [x0 + 0.1, x1 - 0.1]) {
      P.box('paint', x - 0.08, 0, z0 + 0.02, x + 0.08, 2.65, z0 + 0.18, 0xfbf3e2, { r: 0.02 });
    }
    // porch roof
    const m = new THREE.Matrix4().makeTranslation((x0 + x1) / 2, 2.85, (z0 + z1) / 2).multiply(new THREE.Matrix4().makeRotationX(-0.22));
    P.box('shingles', -(x1 - x0) / 2 - 0.2, -0.06, -(z1 - z0) / 2 - 0.4, (x1 - x0) / 2 + 0.2, 0.06, (z1 - z0) / 2 + 0.05, 0x5a6890, { matrix: m });
    P.box('paint', x0 - 0.1, 2.6, z0 - 0.1, x1 + 0.1, 2.72, z0 + 0.15, 0xfbf3e2);
    // railings
    for (const [a, b2] of [[x0 + 0.1, 6.45], [7.75, x1 - 0.1]]) {
      P.box('paint', a, 0.82, z0 + 0.06, b2, 0.88, z0 + 0.14, 0xfbf3e2);
      for (let x = a + 0.1; x < b2; x += 0.14) P.box('paint', x - 0.02, 0, z0 + 0.08, x + 0.02, 0.82, z0 + 0.12, 0xfbf3e2, { cast: false });
    }
    // porch lamp
    P.box('metal', 7.75, 1.7, -0.3, 7.9, 1.95, -0.2, 0x333333);
    P.box('glowWarm', 7.77, 1.72, -0.34, 7.88, 1.9, -0.3, 0xffffff, { cast: false });
    // welcome step planter + bench
    P.box('wood', 5.6, 0, -1.2, 6.3, 0.42, -0.6, 0x8a5a36, { r: 0.03 });
    // path to the sidewalk
    P.box('concrete', 6.55, GROUND_Y, -9.0, 7.65, GROUND_Y + 0.02, z0 - 0.64, 0xe2d8c8, { cast: false });
    // driveway on the left
    P.box('concrete', -3.6, GROUND_Y, -9.0, -0.6, GROUND_Y + 0.015, 9.0, 0xd8d0c2, { cast: false });
    // mailbox
    P.box('wood', 8.05, GROUND_Y, -8.5, 8.15, 0.9, -8.4, 0x8a5a36);
    P.box('gloss', 7.95, 0.9, -8.65, 8.25, 1.12, -8.25, 0x3f6e9a, { r: 0.08 });
    P.box('gloss', 8.25, 1.0, -8.4, 8.27, 1.25, -8.35, 0xd2513e);
  }
  // hero yard fence + trees + bushes (near)
  near.layer = 'yard';
  picketFence(near, [[-5, -6.6], [-5, 14], [14.5, 14], [14.5, -6.6]], [[-3.7, -0.5], [6.5, 7.7]]);
  tree(near, 12.2, -5.5, 1.1);
  tree(near, -3.5, 12.0, 1.3);
  tree(near, 12.8, 9.5, 0.9);
  for (const [x, z, s] of [[1.0, -0.7, 0.55], [2.0, -0.75, 0.5], [4.2, -0.7, 0.6], [9.0, -0.75, 0.5], [-0.75, 4, 0.6]]) bush(near, x, z, s);

  // ---------- cul-de-sac ----------
  far.layer = 'street';
  {
    const ring = new THREE.RingGeometry(BULB_R, BULB_R + 2.2, 48, 1);
    ring.rotateX(-Math.PI / 2);
    const disc = new THREE.CircleGeometry(BULB_R, 48);
    disc.rotateX(-Math.PI / 2);
    far.geom('asphalt', disc, new THREE.Matrix4().makeTranslation(BULB.x, GROUND_Y + 0.01, BULB.z), 0x6b6b72, { cast: false });
    far.geom('concrete', ring, new THREE.Matrix4().makeTranslation(BULB.x, GROUND_Y + 0.025, BULB.z), 0xd8d0c2, { cast: false });
    // stem road toward -z
    far.box('asphalt', BULB.x - 4, GROUND_Y, BULB.z - 120, BULB.x + 4, GROUND_Y + 0.01, BULB.z - BULB_R + 1, 0x6b6b72, { cast: false });
    for (const s of [-1, 1]) far.box('concrete', BULB.x + s * 4 + (s < 0 ? -2.2 : 0), GROUND_Y, BULB.z - 120, BULB.x + s * 4 + (s > 0 ? 2.2 : 0), GROUND_Y + 0.025, BULB.z - BULB_R + 0.5, 0xd8d0c2, { cast: false });
    for (let z = BULB.z - 12; z > BULB.z - 118; z -= 4) far.box('paint', BULB.x - 0.08, GROUND_Y + 0.012, z - 1.4, BULB.x + 0.08, GROUND_Y + 0.016, z, 0xf2d66a, { cast: false });
    // central island with a tree
    const isl = new THREE.CircleGeometry(3, 32); isl.rotateX(-Math.PI / 2);
    far.geom('grass', isl, new THREE.Matrix4().makeTranslation(BULB.x, GROUND_Y + 0.06, BULB.z), 0x9ab86e, { cast: false });
    const curb = new THREE.TorusGeometry(3, 0.12, 6, 32); curb.rotateX(Math.PI / 2);
    far.geom('concrete', curb, new THREE.Matrix4().makeTranslation(BULB.x, GROUND_Y + 0.03, BULB.z), 0xe0d8c8, { cast: false });
    tree(far, BULB.x, BULB.z, 1.4);
  }
  // neighbour houses around the bulb + along the street
  const palette = [0xb9d3e4, 0xcfe0b8, 0xf3e0a0, 0xf2c4c0, 0xd6c8e8, 0xf0d2a8];
  const lots = [];
  for (const a of [32, -12, 148, 192]) {
    const r = a * Math.PI / 180, d = 21;
    lots.push([BULB.x + Math.cos(r) * d, BULB.z + Math.sin(r) * d + 4]);
  }
  lots.push([BULB.x + 17, BULB.z - 32], [BULB.x - 17, BULB.z - 34], [BULB.x + 17, BULB.z - 52], [BULB.x - 17, BULB.z - 55]);
  lots.forEach(([x, z], i) => {
    const rot = Math.atan2(BULB.x - x, BULB.z - z) + (i >= 4 ? 0 : 0);
    const face = i >= 4 ? (x > BULB.x ? -Math.PI / 2 : Math.PI / 2) : rot;
    neighbour(far, x, z, face, palette[i % palette.length], i, glows);
  });
  // street lamps
  for (const a of [70, 110, 250, 290, -30, 210]) {
    const r = a * Math.PI / 180;
    const x = BULB.x + Math.cos(r) * (BULB_R + 1.2), z = BULB.z + Math.sin(r) * (BULB_R + 1.2);
    streetLamp(far, x, z);
    lampPositions.push(new THREE.Vector3(x, GROUND_Y + 4.1, z));
    glows.push([x, GROUND_Y + 4.15, z, 1]);
  }
  for (let z = BULB.z - 22; z > BULB.z - 110; z -= 22) for (const s of [-1, 1]) { streetLamp(far, BULB.x + s * 5.2, z); lampPositions.push(new THREE.Vector3(BULB.x + s * 5.2, GROUND_Y + 4.1, z)); glows.push([BULB.x + s * 5.2, GROUND_Y + 4.15, z, 1]); }
  // tree belt behind everything for depth
  for (let i = 0; i < 46; i++) {
    const a = i / 46 * Math.PI * 2, r = 48 + (i * 37 % 11) * 2.2;
    const x = BULB.x + Math.cos(a) * r, z = BULB.z + 10 + Math.sin(a) * r;
    if (z < BULB.z - 25 && Math.abs(x - BULB.x) < 12) continue;
    tree(far, x, z, 1.4 + (i * 13 % 7) * 0.12, true);
  }
  for (let z = BULB.z - 30; z > BULB.z - 115; z -= 9) for (const s of [-1, 1]) tree(far, BULB.x + s * (28 + (z * 7 % 5)), z, 1.3, true);
  // backyard trees + a shed behind the hero house
  for (const [x, z, s] of [[-2, 20, 1.2], [3, 23, 1.0], [9, 21, 1.3], [14, 18, 1.1], [-9, 16, 1.2], [20, 12, 1.0], [-14, 6, 1.1], [24, 0, 1.2], [-17, -4, 1.0]]) tree(far, x, z, s);
  far.box('wood', 10.5, GROUND_Y, 15.5, 13, 2.0, 17.5, 0xb85a42);
  far.box('shingles', 10.3, 2.0, 15.3, 13.2, 2.2, 17.7, 0x5a4a44);
  picketFence(far, [[-5, 14], [-5, 26], [14.5, 26], [14.5, 14]], []);
  // a second ring of distant houses among the trees
  for (let i = 0; i < 12; i++) {
    const a = -0.5 + i / 12 * Math.PI * 2, r = 40 + (i % 3) * 6;
    const x = BULB.x + Math.cos(a) * r, z = BULB.z + 12 + Math.sin(a) * r;
    if (z < BULB.z - 20 && Math.abs(x - BULB.x) < 25) continue;
    neighbour(far, x, z, Math.atan2(BULB.x - x, BULB.z + 12 - z), palette[(i + 3) % palette.length], i + 7);
  }

  const backdrop = makeBackdrop();
  const horizon = makeHorizon();
  const nearGroup = near.build('yard');
  far.layer = 'street';
  dressHero(far, glows);
  scatter(far, BULB, lots);
  const farGroup = far.build('street');
  farGroup.add(makeGlows(glows));
  return { sky, nearGroup, farGroup, lampPositions, backdrop, horizon };
}

// Hazy far tree-line ring that hides where the ground plane meets the sky (exterior only).
function makeHorizon() {
  const w = 2048, h = 256, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  let seed = 3; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#9a6a8a'); g.addColorStop(1, '#6a5070');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.55 - Math.sin(x * 0.006) * 18 - Math.sin(x * 0.031) * 10 - r() * 6);
  ctx.lineTo(w, h); ctx.fill();
  for (let i = 0; i < 160; i++) {
    const x = r() * w, y = h * 0.5 - r() * 30, rr = 10 + r() * 22;
    ctx.beginPath(); ctx.arc(x, y + rr * 0.6, rr, 0, 7); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = 3;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(135, 135, 30, 64, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, fog: false, depthWrite: false }));
  m.position.set(4.6, GROUND_Y + 15 - 30 * 0.45, -10);
  m.name = 'horizon';
  m.renderOrder = -6;
  return m;
}

// Painted 360° ring of neighbour roofs + trees, shown instead of the real street during levels (1 draw call).
function makeBackdrop() {
  const w = 4096, h = 512, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.clearRect(0, 0, w, h);
  const base = h * 0.78;
  // far tree line
  ctx.fillStyle = '#5a6a62';
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 16) ctx.lineTo(x, base - 120 - Math.sin(x * 0.01) * 20 - r() * 30);
  ctx.lineTo(w, h); ctx.fill();
  // houses
  for (let i = 0; i < 14; i++) {
    const x = (i + r() * 0.4) * w / 14, bw = 190 + r() * 90, bh = 120 + r() * 70, top = base - bh;
    const cols = ['#c9a8a0', '#a8b4c4', '#c8c09a', '#b8a0b0', '#c4b08e'];
    ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(x, top, bw, bh + 40);
    ctx.fillStyle = ['#6a4440', '#4a5260', '#5a4636'][i % 3];
    ctx.beginPath(); ctx.moveTo(x - 16, top + 2); ctx.lineTo(x + bw / 2, top - 70 - r() * 30); ctx.lineTo(x + bw + 16, top + 2); ctx.fill();
    for (let k = 0; k < 3; k++) {
      const lit = r() < 0.6;
      ctx.fillStyle = lit ? '#ffd890' : '#4a5068';
      ctx.fillRect(x + 24 + k * (bw - 40) / 3, top + 26 + (k % 2) * 50, 30, 36);
    }
  }
  // near trees
  for (let i = 0; i < 34; i++) {
    const x = r() * w, y = base - 30 - r() * 90, rr = 36 + r() * 40;
    ctx.fillStyle = ['#4f6a46', '#5d7a4e', '#46603e'][i % 3];
    ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + rr * 0.6, y + 10, rr * 0.8, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#6c8a52'; ctx.fillRect(0, base, w, h - base);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
  const g = new THREE.CylinderGeometry(42, 42, 16, 48, 1, true);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, fog: false, depthWrite: false, color: 0xd8c8c0 }));
  m.position.set(4.6, GROUND_Y + 16 * 0.5 - 16 * 0.22, 5.5);
  m.name = 'backdrop';
  m.renderOrder = -5;
  return m;
}

function picketFence(b, pts, gaps) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 0.16);
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const u = alongX ? x : z;
      if (i === 0 && gaps.some(([a, c]) => !alongX && false)) continue;
      if (gaps.some(([a, c]) => (alongX && z0 < -6 && u > a && u < c))) continue;
      const f = frameAt(x, GROUND_Y, z, alongX ? 0 : Math.PI / 2);
      b.lbox('paint', f, 0, 0.5, 0, 0.08, 0.95, 0.025, 0xfbf6ea, { cast: false });
      b.lbox('paint', f, 0, 1.0, 0, 0.056, 0.056, 0.025, 0xfbf6ea, { rot: [0, 0, Math.PI / 4], cast: false });
    }
    for (const y of [0.3, 0.75]) {
      const segs = alongX && z0 < -6 ? splitGaps(Math.min(x0, x1), Math.max(x0, x1), gaps) : [[Math.min(alongX ? x0 : z0, alongX ? x1 : z1), Math.max(alongX ? x0 : z0, alongX ? x1 : z1)]];
      for (const [a, c] of segs) {
        if (alongX) b.box('paint', a, GROUND_Y + y, z0 + 0.012, c, GROUND_Y + y + 0.07, z0 + 0.04, 0xf0e8d8, { cast: false });
        else b.box('paint', x0 + 0.012, GROUND_Y + y, a, x0 + 0.04, GROUND_Y + y + 0.07, c, 0xf0e8d8, { cast: false });
      }
    }
  }
}
function splitGaps(a, c, gaps) {
  let segs = [[a, c]];
  for (const [g0, g1] of gaps) segs = segs.flatMap(([p, q]) => (g1 <= p || g0 >= q) ? [[p, q]] : [[p, g0], [g1, q]].filter(([x, y]) => y - x > 0.05));
  return segs;
}

export function tree(b, x, z, s = 1, cheap = false) {
  b.cyl('wood', null, x, GROUND_Y + 1.1 * s, z, 0.13 * s, 0.2 * s, 2.2 * s, 0x6e4a32, { radial: cheap ? 6 : 10 });
  const greens = [0x5d8f45, 0x6fa152, 0x4f7f3c, 0x7aa858];
  const blobs = cheap ? 3 : 6;
  for (let i = 0; i < blobs; i++) {
    const a = i * 2.4, r = (i ? 0.9 : 0) * s, y = GROUND_Y + (2.6 + (i % 3) * 0.55) * s;
    b.sphere('leaf', null, x + Math.cos(a) * r, y + (i ? 0 : 0.6 * s), z + Math.sin(a) * r, (i ? 1.05 : 1.35) * s, greens[i % greens.length], { ws: cheap ? 8 : 14, hs: cheap ? 6 : 10 });
  }
}
export function bush(b, x, z, s) {
  for (let i = 0; i < 3; i++) b.sphere('leaf', null, x + (i - 1) * 0.35 * s, GROUND_Y + 0.35 * s, z + (i % 2) * 0.1, 0.5 * s, i % 2 ? 0x5d8f45 : 0x6fa152, { scale: [1, 0.8, 1], ws: 10, hs: 8 });
}
export function streetLamp(b, x, z, k = 1) {
  b.cyl('metal', null, x, GROUND_Y + 2 * k, z, 0.06 * k, 0.09 * k, 4 * k, 0x2f3a3a, { radial: 8 });
  b.cyl('metal', null, x, GROUND_Y + 0.15 * k, z, 0.16 * k, 0.18 * k, 0.3 * k, 0x2f3a3a, { radial: 10 });
  b.lathe('metal', null, x, GROUND_Y + 4.25 * k, z, [[0.0, 0.3], [0.08, 0.28], [0.3, 0.02], [0.32, 0]].map(([a, c]) => [a * k, c * k]), 0x2f3a3a, { radial: 12 });
  b.sphere('glowWarm', null, x, GROUND_Y + 4.15 * k, z, 0.2 * k, 0xffffff, { cast: false, scale: [1, 0.7, 1] });
}

function neighbour(b, cx, cz, face, color, seed, glows) {
  const f = frameAt(cx, GROUND_Y, cz, face);
  const w = 8 + (seed % 3), d = 7.5, two = seed % 3 !== 1, h = two ? 5.4 : 3.0;
  b.lbox('siding', f, 0, h / 2, 0, w, h, d, color, { cast: true });
  b.lbox('concrete', f, 0, 0.15, 0, w + 0.1, 0.3, d + 0.1, 0xd8cfc0, { cast: false });
  // roof
  const rise = two ? 2.4 : 2.0, oh = 0.4, half = d / 2 + oh, slope = Math.atan2(rise, d / 2), len = Math.hypot(half, rise * half / (d / 2));
  const roofCol = [0x8d4a44, 0x4f5f86, 0x6b4a6a, 0x5a6470][seed % 4];
  for (const s of [-1, 1]) {
    const m = f.clone().multiply(new THREE.Matrix4().makeTranslation(0, h + rise / 2 - rise * (oh / (d / 2)) / 2, s * half / 2)).multiply(new THREE.Matrix4().makeRotationX(s * slope));
    b.box('shingles', -w / 2 - oh, -0.08, -len / 2, w / 2 + oh, 0.08, len / 2, roofCol, { matrix: m });
  }
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
    const g = new THREE.ShapeGeometry(shape);
    const m = f.clone().multiply(new THREE.Matrix4().makeTranslation(s * w / 2, h, 0)).multiply(new THREE.Matrix4().makeRotationY(s * Math.PI / 2));
    b.geom('siding', g, m, color, { cast: false });
  }
  // front (local +z) door + windows
  const fz = d / 2 + 0.01;
  b.lbox('paint', f, w * 0.15, 1.05, fz, 1.0, 2.1, 0.06, 0xfbf3e2, { cast: false });
  b.lbox('gloss', f, w * 0.15, 1.02, fz + 0.03, 0.85, 2.0, 0.04, [0xd2513e, 0x3f6e9a, 0x4c7a3a, 0x8a5a36][seed % 4], { cast: false });
  const win = (x, y, lit) => {
    b.lbox('paint', f, x, y, fz, 1.15, 1.25, 0.06, 0xfbf3e2, { cast: false });
    b.lbox(lit ? 'glowWindow' : 'gloss', f, x, y, fz + 0.035, 0.95, 1.05, 0.02, lit ? 0xffffff : 0x34405a, { cast: false });
    b.lbox('paint', f, x, y, fz + 0.05, 0.05, 1.05, 0.02, 0xfbf3e2, { cast: false });
  };
  win(-w * 0.25, 1.5, (seed * 7) % 4 !== 0);
  win(w * 0.38, 1.5, true);
  if (two) { win(-w * 0.25, 4.0, seed % 3 !== 0); win(w * 0.12, 4.0, (seed * 5) % 3 !== 2); win(w * 0.38, 4.0, seed % 2 === 0); }
  // side windows
  for (const sgn of [-1, 1]) {
    const sp = new THREE.Matrix4().makeRotationY(sgn * Math.PI / 2).setPosition(sgn * (w / 2 + 0.01), 0, 0);
    const fs = f.clone().multiply(sp);
    b.lbox('paint', fs, 0, 1.5, 0, 1.0, 1.15, 0.06, 0xfbf3e2, { cast: false });
    b.lbox((seed + sgn) % 3 ? 'glowWindow' : 'gloss', fs, 0, 1.5, 0.035, 0.82, 0.95, 0.02, (seed + sgn) % 3 ? 0xffffff : 0x34405a, { cast: false });
  }
  // porch light + steps + bushes
  b.lbox('concrete', f, w * 0.15, 0.1, fz + 0.5, 1.6, 0.2, 1.0, 0xd8cfc0, { cast: false });
  b.lbox('glowWarm', f, w * 0.15 + 0.7, 2.0, fz + 0.06, 0.12, 0.18, 0.06, 0xffffff, { cast: false });
  for (const bx of [-w * 0.4, -w * 0.1, w * 0.4]) {
    const p = new THREE.Vector3(bx, 0, fz + 0.6).applyMatrix4(f);
    bush(b, p.x, p.z, 0.7);
  }
  // front lawn fence segment + driveway
  const dp0 = new THREE.Vector3(w / 2 + 1.6, 0, fz + 5).applyMatrix4(f);
  const g = new THREE.PlaneGeometry(3, 9); g.rotateX(-Math.PI / 2);
  b.geom('concrete', g, new THREE.Matrix4().makeRotationY(face).setPosition(dp0.x, GROUND_Y + 0.02, dp0.z), 0xd8d0c2, { cast: false });
  const tp = new THREE.Vector3(-w / 2 - 2, 0, fz + 3).applyMatrix4(f);
  tree(b, tp.x, tp.z, 1.0 + (seed % 3) * 0.15);
  if (glows) dressNeighbour(b, f, w, fz, seed, glows);
}
