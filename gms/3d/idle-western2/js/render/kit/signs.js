// Painted sign boards: one shared canvas atlas (2048×1024, 64 px rows, more pages on demand) and batches of quads.
// A batch is one draw call: const sb = kit.signs.batch(); sb.board(text, x, y, z, w, h, { ry, parent, style, back });
// sb.finish() → Mesh | null. The painted cell IS the board face (background, edge, grain, letters), so put it on
// top of (0.01 m in front of) a thin wood slab for thickness. ry = 0 faces +z.
// Styles: you · pomfrey · civic · none · forsale · reserved · poster · brass · chalk
import * as THREE from 'three';
import { WORLD_LIGHT_HEAD, WORLD_LIGHT_FRAG, WORLD_POS_VERT, RIM_FRAG } from './materials.js?v=20261004b';

const AW = 2048, AH = 1024, ROW = 64;
const FONT = "Georgia, 'Times New Roman', 'Noto Serif', serif";
export const SIGN_STYLES = {
  you: { bg: '#2f6f6c', bg2: '#3f8f8a', edge: '#c9a24a', ink: '#f6dc8e', shadow: '#173b39', orn: 'star' },
  pomfrey: { bg: '#4f2c66', bg2: '#6b3f86', edge: '#e2b33c', ink: '#f2c64a', shadow: '#26132f', orn: 'hat' },
  civic: { bg: '#ead9b8', bg2: '#f3e7cf', edge: '#7a5236', ink: '#5a2e1e', shadow: '#c9b08a', orn: null },
  none: { bg: '#d9c49a', bg2: '#e4d2aa', edge: '#7a5236', ink: '#4a2e1e', shadow: '#b8a07a', orn: null },
  forsale: { bg: '#f1e6cf', bg2: '#f7efdc', edge: '#8e5c3c', ink: '#b5483a', shadow: '#d8c8a8', orn: null, rough: true },
  reserved: { bg: '#4f2c66', bg2: '#5d3577', edge: '#e2b33c', ink: '#f2c64a', shadow: '#26132f', orn: 'hat', rough: true },
  poster: { bg: '#efe0bc', bg2: '#f6ead0', edge: '#c8b088', ink: '#3a2618', shadow: '#d8c49c', orn: null, poster: true },
  brass: { bg: '#c9a24a', bg2: '#e2bf6a', edge: '#7a5a22', ink: '#3a2a10', shadow: '#a8822c', orn: null },
  chalk: { bg: '#3a3a36', bg2: '#46463f', edge: '#8e5c3c', ink: '#f1ece0', shadow: '#22221f', orn: null },
};

function hatGlyph(g, x, y, s, col) {
  g.fillStyle = col;
  g.beginPath();
  g.ellipse(x, y + s * 0.42, s * 0.62, s * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(x - s * 0.34, y - s * 0.5, s * 0.68, s * 0.9);
}
function starGlyph(g, x, y, s, col) {
  g.fillStyle = col;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.22 : s * 0.5;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

function paintCell(g, x, y, w, h, text, st, seed) {
  let r = seed >>> 0;
  const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const grd = g.createLinearGradient(0, y, 0, y + h);
  grd.addColorStop(0, st.bg2); grd.addColorStop(1, st.bg);
  g.fillStyle = grd;
  g.fillRect(x, y, w, h);
  g.globalAlpha = 0.08;
  for (let i = 0; i < 9; i++) {
    g.fillStyle = rnd() < 0.5 ? '#000' : '#fff';
    const yy = y + rnd() * h;
    g.fillRect(x, yy, w, 1 + rnd() * 2);
  }
  g.globalAlpha = 1;
  const e = Math.max(3, h * 0.07);
  g.strokeStyle = st.edge;
  g.lineWidth = e;
  g.strokeRect(x + e / 2, y + e / 2, w - e, h - e);
  if (!st.rough && !st.poster) {
    g.lineWidth = 1.5;
    g.strokeRect(x + e * 2, y + e * 2, w - e * 4, h - e * 4);
  }
  let pad = e * 3;
  if (st.orn && w > h * 2.4) {
    const s = h * 0.42;
    for (const k of [0, 1]) {
      const cx = k ? x + w - pad - s * 0.35 : x + pad + s * 0.35, cy = y + h / 2;
      (st.orn === 'hat' ? hatGlyph : starGlyph)(g, cx, cy, s, st.edge);
    }
    pad += s * 0.85;
  }
  if (st.poster) {
    g.fillStyle = st.ink;
    g.font = `bold ${Math.round(h * 0.16)}px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('WANTED', x + w / 2, y + h * 0.14);
    const cx = x + w / 2, cy = y + h * 0.5, fr = h * 0.2;
    g.lineWidth = 2.5; g.strokeStyle = st.ink;
    g.beginPath(); g.ellipse(cx, cy, fr * 0.8, fr, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(cx, cy - fr * 0.95, fr * 1.6, fr * 0.22, 0, 0, Math.PI * 2); g.stroke();
    g.fillRect(cx - fr * 0.6, cy - fr * 1.6, fr * 1.2, fr * 0.65);
    g.beginPath(); g.moveTo(cx - fr * 0.5, cy + fr * 0.25); g.quadraticCurveTo(cx, cy + fr * 0.05 + rnd() * 6, cx + fr * 0.5, cy + fr * 0.25); g.stroke();
    g.fillRect(cx - fr * 0.35, cy - fr * 0.25, 4, 4); g.fillRect(cx + fr * 0.3, cy - fr * 0.25, 4, 4);
    g.font = `bold ${Math.round(h * 0.13)}px ${FONT}`;
    g.fillText(text || '$500', x + w / 2, y + h * 0.86);
    g.restore();
    return;
  }
  const lines = String(text).split('\n');
  const maxW = w - pad * 2;
  let fs = Math.floor((h - e * 4) / (lines.length * 1.08));
  g.font = `bold ${fs}px ${FONT}`;
  const widest = Math.max(...lines.map((l) => g.measureText(l).width));
  if (widest > maxW) fs = Math.max(8, Math.floor(fs * maxW / widest));
  g.font = `bold ${fs}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const lh = fs * 1.04, y0 = y + h / 2 - (lh * (lines.length - 1)) / 2 + fs * 0.06;
  lines.forEach((l, i) => {
    const ty = y0 + i * lh, tx = x + w / 2;
    g.fillStyle = st.shadow;
    g.fillText(l, tx + Math.max(1, fs * 0.05), ty + Math.max(1, fs * 0.06));
    g.fillStyle = st.ink;
    if (st.rough) { g.save(); g.translate(tx, ty); g.rotate((rnd() - 0.5) * 0.04); g.fillText(l, 0, 0); g.restore(); }
    else g.fillText(l, tx, ty);
  });
  g.restore();
}

function signMaterial(shared, map) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0, envMapIntensity: 0.15 });
  m.onBeforeCompile = (sh) => {
    for (const k of ['uBounce', 'uLamps', 'uLampCol', 'uLampK']) sh.uniforms[k] = shared[k];
    sh.uniforms.uRim = shared.uRim;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <project_vertex>', WORLD_POS_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;\nuniform vec3 uRim;\n' + WORLD_LIGHT_HEAD)
      .replace('#include <opaque_fragment>', `${RIM_FRAG}\n${WORLD_LIGHT_FRAG}\n#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'iw2-sign';
  return m;
}

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _n = new THREE.Vector3();

export function createSigns(materials) {
  const pages = [];
  const cells = new Map();
  function newPage() {
    const cv = document.createElement('canvas');
    cv.width = AW; cv.height = AH;
    const g = cv.getContext('2d');
    g.fillStyle = '#8e5c3c';
    g.fillRect(0, 0, AW, AH);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const page = { cv, g, tex, mat: signMaterial(materials.shared, tex), x: 0, y: 0, rowH: 0, dirty: false };
    pages.push(page);
    return page;
  }
  // Allocate (or reuse) the painted cell for text+style at an aspect; returns { page, u0, v0, u1, v1 }.
  function cell(text, style, aspect, rows = 1) {
    const key = style + '|' + aspect.toFixed(2) + '|' + rows + '|' + text;
    let c = cells.get(key);
    if (c) return c;
    const h = ROW * rows, w = Math.max(ROW, Math.min(AW, Math.round(h * aspect)));
    let page = pages[pages.length - 1] || newPage();
    if (page.x + w > AW) { page.x = 0; page.y += page.rowH; page.rowH = 0; }
    if (page.y + h > AH) { page = newPage(); }
    const x = page.x, y = page.y;
    page.x += w + 2; page.rowH = Math.max(page.rowH, h + 2);
    paintCell(page.g, x, y, w, h, text, SIGN_STYLES[style] || SIGN_STYLES.none, key.length * 131 + w);
    page.tex.needsUpdate = true;
    const inset = 0.5;
    c = { page, u0: (x + inset) / AW, u1: (x + w - inset) / AW, v0: 1 - (y + h - inset) / AH, v1: 1 - (y + inset) / AH };
    cells.set(key, c);
    return c;
  }

  function batch() {
    const quads = new Map();
    const api = {
      // Painted board centred at (x, y, z), w×h metres, facing +z rotated by ry; `back` paints the reverse too.
      board(text, x, y, z, w, h, o = {}) {
        const st = o.style || 'none';
        const rows = o.rows || (String(text).includes('\n') ? 2 : st === 'poster' ? 3 : 1);
        const c = cell(text, st, w / h, rows);
        let list = quads.get(c.page);
        if (!list) quads.set(c.page, (list = []));
        _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
        _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.set(1, 1, 1));
        if (o.parent) _m.premultiply(o.parent);
        list.push({ m: _m.clone(), w, h, c });
        if (o.back) {
          _e.set(-(o.rx || 0), (o.ry || 0) + Math.PI, -(o.rz || 0), 'YXZ');
          _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.set(1, 1, 1));
          if (o.parent) _m.premultiply(o.parent);
          list.push({ m: _m.clone(), w, h, c });
        }
        return api;
      },
      get count() { let n = 0; for (const l of quads.values()) n += l.length; return n; },
      finish({ name = 'signs' } = {}) {
        if (!quads.size) return null;
        const out = [];
        for (const [page, list] of quads) {
          const pos = new Float32Array(list.length * 18), nor = new Float32Array(list.length * 18), uv = new Float32Array(list.length * 12);
          list.forEach(({ m, w, h, c }, i) => {
            const P = [[-w / 2, -h / 2, c.u0, c.v0], [w / 2, -h / 2, c.u1, c.v0], [w / 2, h / 2, c.u1, c.v1], [-w / 2, -h / 2, c.u0, c.v0], [w / 2, h / 2, c.u1, c.v1], [-w / 2, h / 2, c.u0, c.v1]];
            _n.set(0, 0, 1).transformDirection(m);
            P.forEach(([lx, ly, u, v], j) => {
              _v.set(lx, ly, 0.012).applyMatrix4(m);
              const o3 = (i * 6 + j) * 3;
              pos[o3] = _v.x; pos[o3 + 1] = _v.y; pos[o3 + 2] = _v.z;
              nor[o3] = _n.x; nor[o3 + 1] = _n.y; nor[o3 + 2] = _n.z;
              uv[(i * 6 + j) * 2] = u; uv[(i * 6 + j) * 2 + 1] = v;
            });
          });
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
          g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          g.computeBoundingSphere();
          const mesh = new THREE.Mesh(g, page.mat);
          mesh.name = name;
          mesh.receiveShadow = true;
          mesh.castShadow = false;
          mesh.matrixAutoUpdate = false;
          mesh.raycast = () => {};
          out.push(mesh);
        }
        if (out.length === 1) return out[0];
        const grp = new THREE.Group();
        grp.name = name;
        for (const m of out) grp.add(m);
        return grp;
      },
    };
    return api;
  }

  // One standalone board (for a sign that falls, swings or gets carried): a Mesh centred on its origin, facing +z.
  function single(text, w, h, style = 'none', o = {}) {
    const sb = batch().board(text, 0, 0, 0, w, h, { style, back: o.back !== false });
    const m = sb.finish({ name: 'sign:' + text });
    if (m) m.matrixAutoUpdate = true;
    return m;
  }

  return { batch, single, cell, pages, styles: SIGN_STYLES };
}
