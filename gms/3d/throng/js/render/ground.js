import * as THREE from 'three';
import { shaderCommon, fogUniforms } from './shared.js';

const EXT = 150;

function canvas(n) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(n, n) : Object.assign(document.createElement('canvas'), { width: n, height: n });
  const ctx = c.getContext('2d', { willReadFrequently: false });
  ctx.setTransform(n / (2 * EXT), 0, 0, n / (2 * EXT), n / 2, n / 2);
  return { c, ctx, n };
}

function rectPath(ctx, x0, z0, x1, z1) { ctx.beginPath(); ctx.rect(x0, z0, x1 - x0, z1 - z0); }

function paintColour(map, n, sunXZ) {
  const { c, ctx } = canvas(n);
  const H = map.size / 2, E = map.edge;
  ctx.fillStyle = '#343238'; ctx.fillRect(-EXT, -EXT, EXT * 2, EXT * 2);
  // outer streets beyond the perimeter
  ctx.fillStyle = '#6a645e';
  for (const b of map.buildings) if (b.outer) { rectPath(ctx, b.x - b.w / 2 - 3, b.z - b.d / 2 - 3, b.x + b.w / 2 + 3, b.z + b.d / 2 + 3); ctx.fill(); }
  ctx.fillStyle = '#44464f'; ctx.fillRect(-H + E, -H + E, (H - E) * 2, (H - E) * 2);
  // lane markings
  for (const [roads, axis] of [[map.roadsX, 'x'], [map.roadsZ, 'z']]) {
    roads.forEach((r, idx) => {
      const boulevard = r.w > 19.5;
      ctx.strokeStyle = 'rgba(232,190,90,0.75)'; ctx.lineWidth = 0.18;
      ctx.setLineDash(boulevard ? [] : [2.4, 2.2]);
      const offs = boulevard ? [-0.25, 0.25] : [0];
      for (const o of offs) {
        ctx.beginPath();
        if (axis === 'x') { ctx.moveTo(r.c + o, -H + E); ctx.lineTo(r.c + o, H - E); } else { ctx.moveTo(-H + E, r.c + o); ctx.lineTo(H - E, r.c + o); }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(230,226,215,0.35)'; ctx.lineWidth = 0.14;
      for (const o of [-r.w / 2 + 1.2, r.w / 2 - 1.2]) {
        ctx.beginPath();
        if (axis === 'x') { ctx.moveTo(r.c + o, -H + E); ctx.lineTo(r.c + o, H - E); } else { ctx.moveTo(-H + E, r.c + o); ctx.lineTo(H - E, r.c + o); }
        ctx.stroke();
      }
      void idx;
    });
  }
  // intersections: clear markings
  ctx.fillStyle = '#44464f';
  for (const rx of map.roadsX) for (const rz of map.roadsZ) ctx.fillRect(rx.a, rz.a, rx.w, rz.w);
  // crossings
  ctx.fillStyle = 'rgba(236,232,222,0.85)';
  for (const cr of map.crossings) {
    if (cr.dir === 'x') { for (let z = cr.z - cr.d / 2; z < cr.z + cr.d / 2 - 0.3; z += 1.1) ctx.fillRect(cr.x - cr.w / 2, z, cr.w, 0.6); }
    else { for (let x = cr.x - cr.w / 2; x < cr.x + cr.w / 2 - 0.3; x += 1.1) ctx.fillRect(x, cr.z - cr.d / 2, 0.6, cr.d); }
  }
  // central plaza
  const bx = map.blocksX, bz = map.blocksZ;
  const c0x = bx[1].a, c1x = bx[2].b, c0z = bz[1].a, c1z = bz[2].b;
  const cx = (c0x + c1x) / 2, cz = (c0z + c1z) / 2, cr = Math.min(c1x - c0x, c1z - c0z) / 2;
  ctx.fillStyle = '#8d8273'; ctx.fillRect(c0x, c0z, c1x - c0x, c1z - c0z);
  ctx.strokeStyle = '#8f816c'; ctx.lineWidth = 1.2; ctx.strokeRect(c0x + 2.5, c0z + 2.5, c1x - c0x - 5, c1z - c0z - 5);
  for (let r = cr - 4, k = 0; r > 8; r -= 2.6, k++) {
    ctx.strokeStyle = k % 2 ? '#9b8f7c' : '#7a6f60';
    ctx.lineWidth = k % 3 === 0 ? 0.9 : 0.35;
    ctx.beginPath(); ctx.arc(cx, cz, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(120,106,88,0.7)'; ctx.lineWidth = 0.3;
  for (let k = 0; k < 32; k++) {
    const a = k * Math.PI / 16;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 8.5, cz + Math.sin(a) * 8.5); ctx.lineTo(cx + Math.cos(a) * (cr - 4), cz + Math.sin(a) * (cr - 4)); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(163,150,127,0.45)';
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 9, cz + Math.sin(a) * 9);
    ctx.lineTo(cx + Math.cos(a + 0.12) * 20, cz + Math.sin(a + 0.12) * 20);
    ctx.lineTo(cx + Math.cos(a) * 30, cz + Math.sin(a) * 30);
    ctx.lineTo(cx + Math.cos(a - 0.12) * 20, cz + Math.sin(a - 0.12) * 20);
    ctx.closePath(); ctx.fill();
  }
  // blocks
  for (const b of map.blocks) {
    if (b.kind === 'central') continue;
    const x0 = b.x - b.w / 2, z0 = b.z - b.d / 2;
    if (b.kind === 'park') {
      ctx.fillStyle = '#736c66'; ctx.fillRect(x0, z0, b.w, b.d);
      ctx.fillStyle = '#4c6a30'; ctx.fillRect(x0 + 3, z0 + 3, b.w - 6, b.d - 6);
      for (let k = 0; k < 60; k++) {
        ctx.fillStyle = `rgba(${70 + (k * 37) % 40},${100 + (k * 53) % 40},${40 + (k * 17) % 20},0.35)`;
        ctx.beginPath(); ctx.arc(x0 + 3 + ((k * 97) % 100) / 100 * (b.w - 6), z0 + 3 + ((k * 61) % 100) / 100 * (b.d - 6), 1.5 + (k % 4), 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = '#a3967f'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(b.x, b.z, Math.min(b.w, b.d) * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0 + 3, z0 + 3); ctx.lineTo(x0 + b.w - 3, z0 + b.d - 3); ctx.moveTo(x0 + b.w - 3, z0 + 3); ctx.lineTo(x0 + 3, z0 + b.d - 3); ctx.stroke();
      ctx.fillStyle = '#a3967f'; ctx.beginPath(); ctx.arc(b.x, b.z, 6, 0, Math.PI * 2); ctx.fill();
    } else if (b.kind === 'plaza' || b.kind === 'square') {
      ctx.fillStyle = '#887d6d'; ctx.fillRect(x0, z0, b.w, b.d);
      ctx.strokeStyle = '#8a7d68'; ctx.lineWidth = 0.8; ctx.strokeRect(x0 + 2.2, z0 + 2.2, b.w - 4.4, b.d - 4.4);
      const r0 = Math.min(b.w, b.d) / 2 - 3;
      for (let r = r0, k = 0; r > 5; r -= 1.8, k++) {
        ctx.strokeStyle = k % 2 ? '#988c79' : '#776c5d'; ctx.lineWidth = 0.3;
        ctx.beginPath(); ctx.arc(b.x, b.z, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#9d9080';
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2;
        ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * r0 * 0.7, b.z + Math.sin(a) * r0 * 0.7, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.fillStyle = '#736c66'; ctx.fillRect(x0, z0, b.w, b.d);
      ctx.fillStyle = '#2b2826'; ctx.fillRect(x0 + map.sidewalk, z0 + map.sidewalk, b.w - map.sidewalk * 2, b.d - map.sidewalk * 2);
    }
  }
  // perimeter terrace sidewalk
  ctx.fillStyle = '#736c66';
  ctx.fillRect(-H, -H, H * 2, E); ctx.fillRect(-H, H - E, H * 2, E); ctx.fillRect(-H, -H, E, H * 2); ctx.fillRect(H - E, -H, E, H * 2);
  // contact darkening around building bases
  ctx.lineJoin = 'round';
  for (const b of map.buildings) {
    for (const [lw, a] of [[2.4, 0.12], [1.2, 0.18], [0.5, 0.25]]) {
      ctx.strokeStyle = `rgba(20,14,18,${a})`; ctx.lineWidth = lw;
      ctx.strokeRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
    }
  }
  for (const f of map.fountains) {
    ctx.fillStyle = 'rgba(30,22,26,0.25)'; ctx.beginPath(); ctx.arc(f.x, f.z, f.r + (f.kind === 'grand' ? 2.2 : 1), 0, Math.PI * 2); ctx.fill();
  }
  void sunXZ;
  return c;
}

function blur(px, n, ch, rad) {
  const tmp = new Float32Array(n * n);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < n; y++) {
      let acc = 0;
      const row = y * n;
      for (let x = -rad; x <= rad; x++) acc += px[(row + Math.min(n - 1, Math.max(0, x))) * 4 + ch];
      for (let x = 0; x < n; x++) {
        tmp[row + x] = acc / (2 * rad + 1);
        acc += px[(row + Math.min(n - 1, x + rad + 1)) * 4 + ch] - px[(row + Math.max(0, x - rad)) * 4 + ch];
      }
    }
    for (let x = 0; x < n; x++) {
      let acc = 0;
      for (let y = -rad; y <= rad; y++) acc += tmp[Math.min(n - 1, Math.max(0, y)) * n + x];
      for (let y = 0; y < n; y++) {
        px[(y * n + x) * 4 + ch] = acc / (2 * rad + 1);
        acc += tmp[Math.min(n - 1, y + rad + 1) * n + x] - tmp[Math.max(0, y - rad) * n + x];
      }
    }
  }
}

function paintInfo(map, n, sunDir) {
  const H = map.size / 2;
  const L = Math.hypot(sunDir.x, sunDir.z) / sunDir.y;
  const sx = -sunDir.x / Math.hypot(sunDir.x, sunDir.z), sz = -sunDir.z / Math.hypot(sunDir.x, sunDir.z);
  // R: sun visibility
  const sh = canvas(n);
  let ctx = sh.ctx;
  ctx.fillStyle = '#fff'; ctx.fillRect(-EXT, -EXT, EXT * 2, EXT * 2);
  ctx.fillStyle = '#000';
  const shadowBox = (x0, z0, x1, z1, h) => {
    const ox = sx * h * L, oz = sz * h * L;
    const p = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    ctx.beginPath(); ctx.rect(x0, z0, x1 - x0, z1 - z0); ctx.fill();
    for (let k = 0; k < 4; k++) {
      const a = p[k], b = p[(k + 1) % 4];
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(b[0] + ox, b[1] + oz); ctx.lineTo(a[0] + ox, a[1] + oz); ctx.closePath(); ctx.fill();
    }
  };
  for (const b of map.buildings) {
    const extra = b.roof === 'mansard' || b.roof === 'dome' ? 3.2 : b.roof === 'pitched' ? Math.min(b.w, b.d) * 0.3 : 0.5;
    shadowBox(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2, b.h + extra * 0.7);
  }
  for (const t of map.trees) {
    ctx.globalAlpha = 0.38;
    ctx.beginPath(); ctx.ellipse(t.x + sx * 3.4 * t.s * L, t.z + sz * 3.4 * t.s * L, 1.9 * t.s, 1.9 * t.s, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 0.45;
  for (const s of map.statues) {
    const hh = s.kind === 'obelisk' ? 13 : 6;
    ctx.lineWidth = 1.4; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(s.x, s.z); ctx.lineTo(s.x + sx * hh * L, s.z + sz * hh * L); ctx.stroke();
  }
  for (const f of map.fountains) if (f.kind === 'grand') { ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(f.x, f.z); ctx.lineTo(f.x + sx * 8 * L, f.z + sz * 8 * L); ctx.stroke(); }
  ctx.globalAlpha = 1;
  // G: surface kind
  const kd = canvas(n);
  ctx = kd.ctx;
  ctx.fillStyle = '#000'; ctx.fillRect(-EXT, -EXT, EXT * 2, EXT * 2);
  const bx = map.blocksX, bz = map.blocksZ;
  ctx.fillStyle = 'rgb(170,170,170)'; ctx.fillRect(bx[1].a, bz[1].a, bx[2].b - bx[1].a, bz[2].b - bz[1].a);
  for (const b of map.blocks) {
    if (b.kind === 'central') continue;
    const x0 = b.x - b.w / 2, z0 = b.z - b.d / 2;
    ctx.fillStyle = b.kind === 'build' ? 'rgb(85,85,85)' : 'rgb(170,170,170)';
    ctx.fillRect(x0, z0, b.w, b.d);
    if (b.kind === 'park') {
      ctx.fillStyle = '#fff'; ctx.fillRect(x0 + 3, z0 + 3, b.w - 6, b.d - 6);
      ctx.strokeStyle = 'rgb(170,170,170)'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(b.x, b.z, Math.min(b.w, b.d) * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0 + 3, z0 + 3); ctx.lineTo(x0 + b.w - 3, z0 + b.d - 3); ctx.moveTo(x0 + b.w - 3, z0 + 3); ctx.lineTo(x0 + 3, z0 + b.d - 3); ctx.stroke();
      ctx.fillStyle = 'rgb(170,170,170)'; ctx.beginPath(); ctx.arc(b.x, b.z, 6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = 'rgb(85,85,85)';
  ctx.fillRect(-H, -H, H * 2, map.edge); ctx.fillRect(-H, H - map.edge, H * 2, map.edge); ctx.fillRect(-H, -H, map.edge, H * 2); ctx.fillRect(H - map.edge, -H, map.edge, H * 2);
  // B: warm lamp + shop light
  const lp = canvas(n);
  ctx = lp.ctx;
  ctx.fillStyle = '#000'; ctx.fillRect(-EXT, -EXT, EXT * 2, EXT * 2);
  ctx.globalCompositeOperation = 'lighter';
  for (const l of map.lamps) {
    const r = l.grand ? 11 : 12;
    const g = ctx.createRadialGradient(l.x, l.z, 0, l.x, l.z, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.3, 'rgba(255,255,255,0.4)'); g.addColorStop(0.65, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.x, l.z, r, 0, Math.PI * 2); ctx.fill();
  }
  for (const b of map.buildings) {
    if (b.outer) continue;
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    const strip = (ax0, az0, ax1, az1, gx0, gz0, gx1, gz1) => {
      const g = ctx.createLinearGradient(gx0, gz0, gx1, gz1);
      g.addColorStop(0, 'rgba(255,255,255,0.42)'); g.addColorStop(0.4, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(ax0, az0, ax1 - ax0, az1 - az0);
    };
    const S = 8;
    if (b.ext.s) strip(x0, z1, x1, z1 + S, 0, z1, 0, z1 + S);
    if (b.ext.n) strip(x0, z0 - S, x1, z0, 0, z0, 0, z0 - S);
    if (b.ext.e) strip(x1, z0, x1 + S, z1, x1, 0, x1 + S, 0);
    if (b.ext.w) strip(x0 - S, z0, x0, z1, x0, 0, x0 - S, 0);
  }
  for (const f of map.fountains) {
    const r = f.r * 1.9;
    const g = ctx.createRadialGradient(f.x, f.z, f.r * 0.8, f.x, f.z, r);
    g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.z, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // A: 0 inside solid building blocks (rings dim there)
  const fm = canvas(n);
  ctx = fm.ctx;
  ctx.fillStyle = '#fff'; ctx.fillRect(-EXT, -EXT, EXT * 2, EXT * 2);
  ctx.fillStyle = '#000';
  for (const o of map.obstacles) if (o.type === 'rect') ctx.fillRect(o.x - o.w / 2 + 0.4, o.z - o.d / 2 + 0.4, o.w - 0.8, o.d - 0.8);
  ctx.fillRect(-EXT, -EXT, EXT * 2, EXT - H); ctx.fillRect(-EXT, H, EXT * 2, EXT - H); ctx.fillRect(-EXT, -EXT, EXT - H, EXT * 2); ctx.fillRect(H, -EXT, EXT - H, EXT * 2);
  const get = (cv) => cv.ctx.getImageData(0, 0, n, n).data;
  const R = get(sh), Gk = get(kd), B = get(lp), Fm = get(fm);
  const out = new Uint8Array(n * n * 4);
  const fr = new Float32Array(n * n * 4);
  for (let i = 0; i < n * n; i++) fr[i * 4] = R[i * 4];
  blur(fr, n, 0, Math.max(1, Math.round(n / 1024)));
  for (let i = 0; i < n * n; i++) {
    out[i * 4] = Math.round(70 + fr[i * 4] * (185 / 255));
    out[i * 4 + 1] = Gk[i * 4];
    out[i * 4 + 2] = Math.min(255, B[i * 4]);
    out[i * 4 + 3] = Fm[i * 4];
  }
  return out;
}

export function buildGround(map, shared, quality) {
  const cn = quality === 'lite' ? 1024 : 2048;
  const col = paintColour(map, cn);
  const tex = new THREE.CanvasTexture(col);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const n = 1024;
  const info = paintInfo(map, n, shared.uSunDir.value);
  const itex = new THREE.DataTexture(info, n, n, THREE.RGBAFormat);
  itex.magFilter = itex.minFilter = THREE.LinearFilter;
  itex.flipY = false;
  itex.needsUpdate = true;
  shared.uInfo.value = itex;
  shared.uInfoXf.value.set(-EXT, -EXT, 1 / (2 * EXT), 1 / (2 * EXT));
  const mat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, fog: true,
    transparent: true, depthWrite: true,
    uniforms: {
      ...fogUniforms(), ...shared,
      uMap: { value: tex },
      uMapXf: { value: new THREE.Vector4(-EXT, -EXT, 1 / (2 * EXT), 1 / (2 * EXT)) },
      uRefl: { value: 1 },
      uHalf: { value: map.size / 2 },
      uSkyRefl: { value: new THREE.Color(0.55, 0.42, 0.45) },
      uOuter: { value: new THREE.Color(0x3a3638).convertSRGBToLinear() },
    },
  });
  const geo = new THREE.PlaneGeometry(1600, 1600);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return {
    mesh, colorTex: tex, infoTex: itex,
    setReflect(on) { mat.uniforms.uRefl.value = on ? 1 : 0; mat.transparent = !!on; mat.needsUpdate = true; },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); itex.dispose(); },
  };
}

const GROUND_VERT = /* glsl */`
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const GROUND_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec4 uMapXf;
uniform float uRefl;
uniform float uHalf;
uniform float uTime;
uniform vec3 uSkyRefl;
uniform vec3 uOuter;
varying vec3 vW;
${shaderCommon.lightPars}
#include <fog_pars_fragment>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float tiles(vec2 p, vec2 size, float bond, float fw, out float h) {
  vec2 q = p / size;
  q.x += bond * mod(floor(q.y), 2.0) * 0.5;
  vec2 cell = floor(q);
  vec2 f = fract(q);
  vec2 e = min(f, 1.0 - f) * size;
  float ed = min(e.x, e.y);
  h = hash(cell);
  float g = 1.0 - smoothstep(0.035, 0.035 + fw * 1.2, ed);
  return g * (1.0 - smoothstep(0.05, 0.2, fw / min(size.x, size.y)));
}

void main() {
  vec2 p = vW.xz;
  vec2 uv = (p - uMapXf.xy) * uMapXf.zw;
  bool inside = uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0;
  vec3 base = inside ? texture2D(uMap, uv).rgb : uOuter;
  vec3 info = sampleInfo(p);
  float kind = info.g;
  float fw = length(fwidth(p));
  float inMap = step(max(abs(p.x), abs(p.y)), uHalf);
  float h = 0.5, g = 0.0;
  float big = vnoise(p * 0.11 + 3.0);
  if (kind < 0.17) {
    float grain = vnoise(p * 3.1) * 0.5 + vnoise(p * 9.7) * 0.3 + vnoise(p * 0.7) * 0.2;
    h = mix(0.5, grain, 1.0 - smoothstep(0.03, 0.14, fw));
    base *= 0.9 + 0.2 * h;
    base *= 1.0 - 0.07 * smoothstep(0.58, 0.62, vnoise(p * 0.07 + 11.0));
  } else {
    vec2 sz = kind < 0.5 ? vec2(0.9, 0.9) : kind < 0.83 ? vec2(1.2, 0.6) : vec2(1.0);
    if (kind < 0.83) {
      g = tiles(p, sz, kind < 0.5 ? 0.0 : 1.0, fw, h);
      float cf = 1.0 - smoothstep(0.08, 0.3, fw / min(sz.x, sz.y));
      base *= 1.0 + (h - 0.5) * 0.16 * cf;
      base *= 1.0 - g * 0.32;
      base *= 1.0 - 0.06 * (1.0 - cf);
    } else { h = vnoise(p * 1.7); base *= 0.9 + 0.2 * h; }
  }
  base *= 0.96 + 0.08 * big * inMap;

  float n1 = vnoise(p * 0.16) * 0.55 + vnoise(p * 0.47) * 0.3 + vnoise(p * 1.3) * 0.15;
  float road0 = 1.0 - smoothstep(0.1, 0.25, kind);
  float puddle = mix(smoothstep(0.6, 0.68, n1) * 0.7, smoothstep(0.57, 0.66, n1), road0) * (kind > 0.83 ? 0.0 : 1.0) * inMap;
  float road = 1.0 - smoothstep(0.1, 0.25, kind);
  float wet = (kind > 0.83 ? 0.15 : 0.6 + 0.3 * road) + 0.4 * puddle;
  base *= mix(1.0, mix(0.9, 0.8, road0), puddle);

  vec3 N = vec3(0.0, 1.0, 0.0);
  vec3 V = normalize(cameraPosition - vW);
  vec3 infoG = vec3(info.r, info.g, info.b * 0.72);
  vec3 col = base * lightAt(N, infoG);
  float nj = (1.0 - puddle) * (1.0 - smoothstep(0.05, 0.2, fw));
  vec3 Nj = normalize(vec3((h - 0.5) * 0.16 * nj, 1.0, (vnoise(p * 2.3 + 5.0) - 0.5) * 0.16 * nj));
  vec3 R = reflect(-V, Nj);
  float spec = pow(max(dot(R, uSunDir), 0.0), 60.0) * wet * info.r;
  col += uSunCol * spec * 0.9;
  float glint = 0.55 + 0.6 * h * (1.0 - puddle) + 1.1 * puddle;
  col += uLampCol * vec3(1.0, 0.85, 0.7) * info.b * info.b * wet * glint * (0.35 + 0.5 * road);
  col += uLampCol * vec3(1.0, 0.8, 0.6) * road * wet * 0.03;
  float fres = pow(max(1.0 - max(V.y, 0.0), 0.0), 4.0);
  float refl = clamp(mix(0.08 + 0.06 * road, 0.5, puddle) * (kind > 0.83 ? 0.2 : 1.0) + fres * 0.14, 0.0, 0.6);
  float a = 1.0;
  if (uRefl > 0.5) a = 1.0 - refl;
  else col += uSkyRefl * (refl - 0.3 * puddle * road) * 0.3;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #ifdef USE_FOG
  #ifndef FOG_EXP2
  gl_FragColor.a = mix(gl_FragColor.a, 1.0, smoothstep(fogNear, fogFar, vFogDepth));
  #endif
  #endif
}
`;
