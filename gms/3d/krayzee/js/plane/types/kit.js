import * as THREE from 'three';
import { Builder } from '../geom.js';

// Tessellation for 'high' | 'low' | 'lod' | 'lod2'. n() keeps loop counts even (loops get split in halves).
export function tess(quality) {
  const q = ['high', 'low', 'lod', 'lod2'].includes(quality) ? quality : 'high';
  const k = { high: 1, low: 0.55, lod: 0.34, lod2: 0.22 }[q];
  return {
    q, k, high: q === 'high', low: q === 'low', far: q === 'lod' || q === 'lod2', lod2: q === 'lod2',
    detail: q === 'high' || q === 'low', fine: q === 'high',
    n: (h, min = 4) => Math.max(min, 2 * Math.round((h * k) / 2)),
    i: (h, min = 2) => Math.max(min, Math.round(h * k)),
    step: (h) => h / k,
  };
}

// Vertex-coloured PBR material whose roughness/metalness come per vertex from the uv attribute ([rough, metal]),
// so one draw call can hold gold, chrome, rubber and leather.
export function pbrMaterial(name, { clearcoat = 0, envMapIntensity = 1 } = {}) {
  const m = clearcoat
    ? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, metalness: 1, clearcoat, clearcoatRoughness: 0.12, envMapIntensity })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, envMapIntensity });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
  };
  m.customProgramCacheKey = () => 'krayzee-pbrv-' + name + (clearcoat ? '-cc' : '');
  return m;
}

// [roughness, metalness] presets for pbr builders
export const RM = {
  gold: [0.22, 1], goldSatin: [0.38, 1], brass: [0.3, 1], chrome: [0.12, 1], steel: [0.42, 0.9], darkMetal: [0.5, 0.7],
  rubber: [0.88, 0], leather: [0.55, 0], leatherWorn: [0.68, 0], wood: [0.42, 0], varnish: [0.22, 0], paint: [0.4, 0],
  enamel: [0.08, 0], cloth: [0.92, 0], plastic: [0.4, 0], glass: [0.05, 0], foam: [0.95, 0], water: [0.04, 0], black: [0.6, 0],
};

export function mkMesh(name, B, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(B.build(), mat);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Hinged surface: geometry re-expressed around the hinge line a→b, local +X along the hinge.
export function hinge(group, name, B, mat, a, b) {
  const pivot = new THREE.Object3D();
  pivot.position.set(...a);
  const dir = new THREE.Vector3(...b).sub(pivot.position).normalize();
  pivot.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  pivot.updateMatrix();
  const geo = B.build();
  geo.applyMatrix4(pivot.matrix.clone().invert());
  const m = new THREE.Mesh(geo, mat);
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  pivot.add(m);
  group.add(pivot);
  return m;
}

export const M4 = (x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, order = 'XYZ') =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)), new THREE.Vector3(sx, sy, sz));

// Matrix placing a +Y-aligned primitive (cylinder/cone) between points a and b.
export function between(a, b, sx = 1, sz = sx) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  return new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(sx, len, sz));
}
// unit cylinder (height 1) for use with between()
export function rod(B, a, b, r, sides, rm, col, r1 = r) {
  B.addGeo(new THREE.CylinderGeometry(r1, r, 1, sides, 1, false), between(a, b), rm, col);
}

// ---------- canvas atlas helpers (regions in canvas fractions, content laid out in metres) ----------
export function atlas(S) {
  const side = (r) => {
    const kx = (S * (r.x1 - r.x0)) / (r.s1 - r.s0), ky = (S * (r.y1 - r.y0)) / (r.h1 - r.h0);
    return r.flip
      ? { a: -kx, d: -ky, e: S * r.x0 + r.s1 * kx, f: S * r.y0 + r.h1 * ky, kx, ky, flip: true }
      : { a: kx, d: -ky, e: S * r.x0 - r.s0 * kx, f: S * r.y0 + r.h1 * ky, kx, ky, flip: false };
  };
  const plan = (r) => {
    const kx = (S * (r.x1 - r.x0)) / (r.a1 - r.a0), ky = (S * (r.y1 - r.y0)) / (r.s1 - r.s0);
    return r.flip
      ? { a: -kx, d: ky, e: S * r.x0 + r.a1 * kx, f: S * r.y0 - r.s0 * ky, kx, ky, flip: true }
      : { a: kx, d: ky, e: S * r.x0 - r.a0 * kx, f: S * r.y0 - r.s0 * ky, kx, ky, flip: false };
  };
  const region = (c, r, T, fn) => {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath();
    c.rect(Math.floor(r.x0 * S), Math.floor(r.y0 * S), Math.ceil((r.x1 - r.x0) * S), Math.ceil((r.y1 - r.y0) * S));
    c.clip();
    c.setTransform(T.a, 0, 0, T.d, T.e, T.f);
    fn(c, T);
    c.restore();
  };
  // text in metres, never mirrored; rot rotates the text box (radians) for plan regions
  function text(c, T, str, cx, cy, w, h, { font = 'italic 800', fill = '#fff', stroke = null, strokeW = 9, slope = 0, plan: isPlan = false, lines = 1, family = null, rot = 0 } = {}) {
    if (!str) return;
    const fam = family || "'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif";
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.font = `${font} 100px ${fam}`;
    let rows = [str];
    if (lines > 1 && str.includes(' ') && str.length > 7) {
      let best = null;
      const words = str.split(' ');
      for (let k = 1; k < words.length; k++) {
        const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
        const m = Math.max(c.measureText(a).width, c.measureText(b).width);
        if (!best || m < best.m) best = { m, rows: [a, b] };
      }
      const single = c.measureText(str).width;
      const emSingle = Math.min(h / 0.74, w / (single / 100));
      const emDouble = Math.min(h / (0.74 * 2 + 0.3), w / (best.m / 100));
      if (emDouble > emSingle * 1.15) rows = best.rows;
    }
    const widest = Math.max(...rows.map((r) => c.measureText(r).width));
    const cap = 0.72;
    const em = Math.min(h / (cap * rows.length + 0.3 * (rows.length - 1)), w / (widest / 100));
    c.translate(T.a * cx + T.e, T.d * cy + T.f);
    c.scale(T.kx, T.ky);
    if (rot) c.rotate(rot);
    if (slope) c.rotate(isPlan ? slope : (T.flip ? slope : -slope));
    c.scale(em / 100, em / 100);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    const lh = (cap + 0.3) * 100;
    rows.forEach((r, i) => {
      const y = cap * 50 + (i - (rows.length - 1) / 2) * lh;
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = strokeW; c.strokeText(r, 0, y); }
      c.fillStyle = fill;
      c.fillText(r, 0, y);
    });
    c.restore();
  }
  return { side, plan, region, text };
}

const lum = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
export const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
export function pick(bg, prefs, min = 3) {
  for (const p of prefs) if (contrast(p, bg) >= min) return p;
  return contrast('#ffffff', bg) > contrast('#14171c', bg) ? '#ffffff' : '#14171c';
}
export const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
export const mix = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

// A royal crest drawn in metres around (cx, cy), height h. Never mirrored (caller's transform handles flips).
// Side regions draw with y up already; T.flip un-mirrors.
export function crest(c, T, cx, cy, h, { field = '#1f3f8f', field2 = '#a3162a', gold = '#d8ae45' } = {}) {
  c.save();
  c.translate(cx, cy);
  c.scale((T.flip ? -1 : 1) * h, h);
  const sh = (fill, pad = 0) => {
    c.beginPath();
    c.moveTo(-0.28 - pad, 0.22 + pad);
    c.lineTo(0.28 + pad, 0.22 + pad);
    c.lineTo(0.28 + pad, -0.02);
    c.quadraticCurveTo(0.27 + pad, -0.3 - pad, 0, -0.42 - pad * 1.4);
    c.quadraticCurveTo(-0.27 - pad, -0.3 - pad, -0.28 - pad, -0.02);
    c.closePath();
    c.fillStyle = fill; c.fill();
  };
  // laurel sprays
  c.fillStyle = shade(gold, 0.82);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const t = i / 6, a = -1.3 + t * 2.0;
      const x = s * (0.36 + 0.06 * Math.sin(t * 3)), y = -0.36 + t * 0.62;
      c.save(); c.translate(x, y); c.rotate(s * (0.5 + a * 0.2));
      c.beginPath(); c.ellipse(0, 0, 0.022, 0.06, 0, 0, 7); c.fill(); c.restore();
    }
  }
  sh(gold, 0.03);
  sh(field);
  // quartered field
  c.save();
  c.beginPath(); c.moveTo(-0.28, 0.22); c.lineTo(0.28, 0.22); c.lineTo(0.28, -0.02); c.quadraticCurveTo(0.27, -0.3, 0, -0.42); c.quadraticCurveTo(-0.27, -0.3, -0.28, -0.02); c.closePath(); c.clip();
  c.fillStyle = field2; c.fillRect(0, -0.05, 0.4, 0.4); c.fillRect(-0.4, -0.5, 0.4, 0.45);
  c.strokeStyle = gold; c.lineWidth = 0.025;
  c.beginPath(); c.moveTo(0, 0.25); c.lineTo(0, -0.45); c.moveTo(-0.3, -0.05); c.lineTo(0.3, -0.05); c.stroke();
  // rampant-lion-ish beasts and fleurs reduced to bold heraldic marks
  c.fillStyle = gold;
  const fleur = (x, y, s) => {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(0, 0.12); c.quadraticCurveTo(0.05, 0.02, 0, -0.08); c.quadraticCurveTo(-0.05, 0.02, 0, 0.12); c.fill();
    for (const d of [-1, 1]) { c.beginPath(); c.moveTo(0, -0.02); c.quadraticCurveTo(d * 0.1, 0.06, d * 0.08, -0.06); c.quadraticCurveTo(d * 0.04, -0.03, 0, -0.04); c.fill(); }
    c.fillRect(-0.06, -0.06, 0.12, 0.022);
    c.restore();
  };
  fleur(-0.14, 0.09, 0.7); fleur(0.14, -0.22, 0.7);
  const lion = (x, y, s) => {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath();
    c.moveTo(-0.06, -0.1); c.lineTo(-0.02, 0.0); c.lineTo(-0.05, 0.07); c.quadraticCurveTo(0.0, 0.13, 0.05, 0.08);
    c.lineTo(0.03, 0.03); c.lineTo(0.07, 0.04); c.lineTo(0.04, -0.01); c.lineTo(0.05, -0.1); c.lineTo(0.02, -0.06); c.lineTo(-0.02, -0.1); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-0.04, -0.06); c.quadraticCurveTo(-0.12, -0.02, -0.09, 0.06); c.lineWidth = 0.02; c.strokeStyle = gold; c.stroke();
    c.restore();
  };
  lion(0.14, 0.09, 0.85); lion(-0.14, -0.2, 0.85);
  c.restore();
  // crown on top
  c.fillStyle = gold;
  c.beginPath();
  c.moveTo(-0.2, 0.25); c.lineTo(0.2, 0.25); c.lineTo(0.23, 0.36); c.lineTo(0.12, 0.31); c.lineTo(0.06, 0.42); c.lineTo(0, 0.33);
  c.lineTo(-0.06, 0.42); c.lineTo(-0.12, 0.31); c.lineTo(-0.23, 0.36); c.closePath(); c.fill();
  for (const x of [-0.23, -0.06, 0.06, 0.23]) { c.beginPath(); c.arc(x, x === -0.23 || x === 0.23 ? 0.37 : 0.43, 0.022, 0, 7); c.fill(); }
  c.beginPath(); c.arc(0, 0.47, 0.03, 0, 7); c.fill();
  c.fillStyle = field2; c.fillRect(-0.18, 0.255, 0.36, 0.03);
  c.fillStyle = '#ffffff';
  for (const x of [-0.12, 0, 0.12]) { c.beginPath(); c.arc(x, 0.27, 0.012, 0, 7); c.fill(); }
  // motto ribbon
  c.fillStyle = shade(gold, 0.9);
  c.beginPath(); c.moveTo(-0.36, -0.42); c.quadraticCurveTo(0, -0.56, 0.36, -0.42); c.lineTo(0.33, -0.5); c.quadraticCurveTo(0, -0.64, -0.33, -0.5); c.closePath(); c.fill();
  c.restore();
}

export function canvasTexture(canvas, { srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

export function noiseFill(g, x, y, w, h, n, a, dark = true, size = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = dark ? `rgba(0,0,0,${Math.random() * a})` : `rgba(255,255,255,${Math.random() * a})`;
    g.fillRect(x + Math.random() * w, y + Math.random() * h, size, size);
  }
}

export { Builder };

// Flat fan cap over a closed ring, facing `normal`.
export function fan(B, ring, normal, uv = [0, 0], color = [1, 1, 1]) {
  const c = [0, 0, 0];
  for (const p of ring) { c[0] += p[0] / ring.length; c[1] += p[1] / ring.length; c[2] += p[2] / ring.length; }
  const uvf = typeof uv === 'function' ? uv : () => uv, colf = typeof color === 'function' ? color : () => color;
  const ci = B.v(c, normal, uvf(c), colf(c)), b0 = B.count;
  for (const p of ring) B.v(p, normal, uvf(p), colf(p));
  for (let j = 0; j < ring.length; j++) {
    const a = b0 + j, b = b0 + ((j + 1) % ring.length);
    const ab = [ring[(j + 1) % ring.length][0] - ring[j][0], ring[(j + 1) % ring.length][1] - ring[j][1], ring[(j + 1) % ring.length][2] - ring[j][2]];
    const ac = [ring[j][0] - c[0], ring[j][1] - c[1], ring[j][2] - c[2]];
    const n = [ac[1] * ab[2] - ac[2] * ab[1], ac[2] * ab[0] - ac[0] * ab[2], ac[0] * ab[1] - ac[1] * ab[0]];
    if (n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2] >= 0) B.t(ci, a, b); else B.t(ci, b, a);
  }
  return B;
}
