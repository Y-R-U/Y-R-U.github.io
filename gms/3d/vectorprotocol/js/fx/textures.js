import * as THREE from 'three';

// Procedural canvas textures for the arena. All deterministic (seeded) so screenshots compare across runs.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { srgb = true, repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Floor: dark slate-metal panels (map), a hex lattice + circuit traces (emissive), seams/scuffs (roughness).
// The canvas covers the floor rect: u = x across [-W/2, W/2], v = z from far (top) to near (bottom).
// hexR = lattice hex circumradius (world m), hexOrigin = world (x, z) of a lattice centre, zFar = world z of v = 0.
function floorTexturesRaw({ W = 16, L = 20, px = 64, seed = 7, hexR = 1.5, hexOrigin = [0, 0], zFar = -14, traces: nTr = 1 } = {}) {
  const w = Math.round(W * px), h = Math.round(L * px);
  const r = rng(seed);
  const [cm, m] = canvas(w, h);
  const [ce, e] = canvas(w, h);
  const [cr, rr] = canvas(w, h);
  const X = (x) => (x + W / 2) * px, Z = (z) => (z - zFar) * px;
  // battle-3: light blue-grey metal (ref_02): every lattice hex is one panel (tone varies a little), seams are dark
  // grooves with a lit bevel, a crisp thin emissive hex grid on top. No brick plates (too busy).
  m.fillStyle = '#34466a'; m.fillRect(0, 0, w, h);
  e.fillStyle = '#000'; e.fillRect(0, 0, w, h);
  rr.fillStyle = '#5a5a5a'; rr.fillRect(0, 0, w, h);
  const [ch, hh] = canvas(w, h); // height field -> normal map
  hh.fillStyle = '#808080'; hh.fillRect(0, 0, w, h);
  const hexPath = (c, cx, cz, R, rot = 0) => {
    c.beginPath();
    for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3 + rot; const x = X(cx + Math.cos(a) * R), y = Z(cz + Math.sin(a) * R); k ? c.lineTo(x, y) : c.moveTo(x, y); }
  };
  const sx = 1.5 * hexR, sz = Math.sqrt(3) * hexR;
  const cells = [];
  for (let i = -Math.ceil(W / sx) - 1; i <= Math.ceil(W / sx) + 1; i++) {
    for (let j = -Math.ceil(L / sz) - 2; j <= Math.ceil(L / sz) + 2; j++) {
      const cx = hexOrigin[0] + i * sx, cz = hexOrigin[1] + j * sz + (Math.abs(i) % 2 ? sz / 2 : 0);
      if (Math.abs(cx) > W / 2 + hexR || cz > zFar + L + hexR || cz < zFar - hexR) continue;
      cells.push([cx, cz]);
    }
  }
  for (const [cx, cz] of cells) {
    const k = r() - 0.5;
    m.fillStyle = `rgb(${70 + k * 14 | 0},${84 + k * 14 | 0},${110 + k * 16 | 0})`;
    hexPath(m, cx, cz, hexR); m.fill();
    const rk = 70 + r() * 50 | 0;
    rr.fillStyle = `rgb(${rk},${rk},${rk})`; hexPath(rr, cx, cz, hexR); rr.fill();
    const det = r();
    if (det < 0.35) { // inset sub-panel
      hexPath(m, cx, cz, hexR * 0.55); m.fillStyle = 'rgba(20,30,54,0.22)'; m.fill();
      hexPath(m, cx, cz, hexR * 0.55); m.strokeStyle = 'rgba(150,180,230,0.12)'; m.lineWidth = px * 0.02; m.stroke();
      hexPath(hh, cx, cz, hexR * 0.55); hh.fillStyle = '#727272'; hh.fill();
    } else if (det < 0.6) { // split seam across the panel
      const a = (r() * 3 | 0) * Math.PI / 3;
      m.strokeStyle = 'rgba(10,16,32,0.55)'; m.lineWidth = px * 0.025;
      m.beginPath(); m.moveTo(X(cx - Math.cos(a) * hexR * 0.86), Z(cz - Math.sin(a) * hexR * 0.86)); m.lineTo(X(cx + Math.cos(a) * hexR * 0.86), Z(cz + Math.sin(a) * hexR * 0.86)); m.stroke();
    }
  }
  // soft tonal variation + grime
  for (let i = 0; i < 160; i++) {
    const x = r() * w, y = r() * h, s = px * (0.4 + r() * 2.2);
    const g = m.createRadialGradient(x, y, 0, x, y, s);
    const lt = r() < 0.5;
    g.addColorStop(0, lt ? 'rgba(150,170,215,0.06)' : 'rgba(6,10,22,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = g; m.fillRect(x - s, y - s, s * 2, s * 2);
    const g2 = rr.createRadialGradient(x, y, 0, x, y, s);
    g2.addColorStop(0, 'rgba(200,200,200,0.2)'); g2.addColorStop(1, 'rgba(200,200,200,0)');
    rr.fillStyle = g2; rr.fillRect(x - s, y - s, s * 2, s * 2);
  }
  for (let i = 0; i < w * h / 90; i++) { // grit
    m.fillStyle = r() < 0.5 ? 'rgba(170,190,230,0.07)' : 'rgba(0,0,0,0.12)';
    m.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  for (const [cx, cz] of cells) {
    hexPath(m, cx, cz, hexR * 0.985); m.strokeStyle = 'rgba(8,12,26,0.9)'; m.lineWidth = px * 0.06; m.stroke();
    hexPath(m, cx, cz, hexR * 0.93); m.strokeStyle = 'rgba(160,190,240,0.16)'; m.lineWidth = px * 0.025; m.stroke();
    hexPath(hh, cx, cz, hexR * 0.985); hh.strokeStyle = '#303030'; hh.lineWidth = px * 0.07; hh.stroke();
    hexPath(rr, cx, cz, hexR * 0.985); rr.strokeStyle = '#c8c8c8'; rr.lineWidth = px * 0.06; rr.stroke();
    const lit = r();
    hexPath(e, cx, cz, hexR * 0.985);
    e.strokeStyle = lit < 0.1 ? 'rgba(110,200,255,0.95)' : `rgba(50,130,245,${0.34 + lit * 0.12})`;
    e.lineWidth = lit < 0.1 ? px * 0.03 : px * 0.02; e.stroke();
  }
  // circuit traces: random 60-degree walks with pads, avoiding the centre strip
  const cx0 = X(0);
  const traces = (n, color, width, glow) => {
    e.lineCap = 'round'; e.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      let x = r() * w, y = r() * h;
      if (Math.abs(x - cx0) < px * 0.6) x += (x < cx0 ? -1 : 1) * px;
      const pts = [[x, y]];
      let dir = (r() * 6 | 0) * Math.PI / 3;
      const segs = 2 + r() * 3 | 0;
      for (let s = 0; s < segs; s++) {
        const len = px * (0.3 + r() * 1.2);
        x += Math.cos(dir) * len; y += Math.sin(dir) * len;
        pts.push([x, y]);
        dir += (r() < 0.5 ? -1 : 1) * Math.PI / 3;
      }
      e.shadowColor = color; e.shadowBlur = glow;
      e.strokeStyle = color; e.lineWidth = width;
      e.beginPath(); e.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) e.lineTo(p[0], p[1]);
      e.stroke();
      e.fillStyle = color;
      for (const p of [pts[0], pts[pts.length - 1]]) { e.beginPath(); e.arc(p[0], p[1], width * 1.6, 0, 7); e.fill(); }
    }
  };
  traces(Math.round(46 * nTr), 'rgba(60,150,255,0.45)', px * 0.025, 6);
  traces(Math.round(14 * nTr), 'rgba(110,210,255,0.85)', px * 0.03, 10);
  traces(Math.round(6 * nTr), 'rgba(170,100,255,0.6)', px * 0.03, 8);
  e.shadowBlur = 0;
  return {
    map: tex(cm, { aniso: 8 }),
    emissive: tex(ce, { aniso: 8 }),
    rough: tex(cr, { srgb: false, aniso: 8 }),
    normal: tex(normalFromHeight(ch, 2.2), { srgb: false, aniso: 8 }),
  };
}

// Sobel normal map from a grey height canvas (tangent space, +y up in the texture = toward far/-z on the floor).
export function normalFromHeight(src, strength = 2) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, x] = canvas(w, h);
  const out = x.createImageData(w, h), o = out.data;
  const H = (i, j) => d[((Math.min(h - 1, Math.max(0, j)) * w) + Math.min(w - 1, Math.max(0, i))) * 4] / 255;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (H(i + 1, j) - H(i - 1, j)) * strength, dy = (H(i, j + 1) - H(i, j - 1)) * strength;
    const L = Math.hypot(dx, dy, 1);
    const k = (j * w + i) * 4;
    o[k] = (-dx / L * 0.5 + 0.5) * 255; o[k + 1] = (dy / L * 0.5 + 0.5) * 255; o[k + 2] = (1 / L * 0.5 + 0.5) * 255; o[k + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  return c;
}

// The league logo: a stylised double-V chevron + wordmark.
export function drawLogo(c, x, y, s, { color = '#7fd8ff', glow = '#2aa8ff', text = true } = {}) {
  c.save();
  c.translate(x, y);
  c.shadowColor = glow; c.shadowBlur = s * 0.18;
  const g = c.createLinearGradient(0, -s * 0.5, 0, s * 0.5);
  g.addColorStop(0, '#e8fbff'); g.addColorStop(0.5, color); g.addColorStop(1, '#2a7cff');
  c.fillStyle = g;
  const V = (ox, w2, h2, t) => {
    c.beginPath();
    c.moveTo(ox - w2, -h2); c.lineTo(ox - w2 + t, -h2); c.lineTo(ox, h2 - t * 1.6); c.lineTo(ox + w2 - t, -h2); c.lineTo(ox + w2, -h2); c.lineTo(ox, h2);
    c.closePath(); c.fill();
  };
  V(0, s * 0.5, s * 0.36, s * 0.16);
  c.globalAlpha = 0.75; V(0, s * 0.3, s * 0.2, s * 0.1); c.globalAlpha = 1;
  if (text) {
    c.font = `700 ${s * 0.24}px "Orbitron","Rajdhani","Segoe UI",sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#d8f4ff';
    c.fillText('VECTOR', 0, s * 0.62);
    c.fillText('PROTOCOL', 0, s * 0.9);
  }
  c.restore();
}

function screenFrame(c, w, h, tint) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a2a66'); g.addColorStop(0.6, '#081a44'); g.addColorStop(1, '#0d3a88');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // scanlines + hex dots
  c.fillStyle = 'rgba(120,200,255,0.06)';
  for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1);
  c.strokeStyle = tint; c.lineWidth = Math.max(3, w * 0.012); c.shadowColor = tint; c.shadowBlur = 14;
  c.strokeRect(w * 0.03, h * 0.03, w * 0.94, h * 0.94);
  c.shadowBlur = 0;
}

// Big centre holo screen: logo on a blue field.
export function logoScreen(w = 512, h = 512) {
  const [cv, c] = canvas(w, h);
  screenFrame(c, w, h, '#58c8ff');
  drawLogo(c, w / 2, h * 0.3, Math.min(w, h * 1.15) * 0.48);
  return tex(cv);
}

// Slogan screens ("STRONGER / SMARTER / TOGETHER").
export function sloganScreen(lines, w = 512, h = 320) {
  const [cv, c] = canvas(w, h);
  screenFrame(c, w, h, '#4aa8ff');
  c.font = `700 ${h * 0.2}px "Orbitron","Rajdhani","Segoe UI",sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#bfe6ff'; c.shadowColor = '#39f'; c.shadowBlur = 12;
  lines.forEach((l, i) => c.fillText(l, w / 2, h * (0.5 + (i - (lines.length - 1) / 2) * 0.24)));
  return tex(cv);
}

// Tall pink/purple banner with a diamond emblem.
function bannerTexRaw(w = 128, h = 384, hue = '#ff4fd8') {
  const [cv, c] = canvas(w, h);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3a0a5a'); g.addColorStop(0.5, '#6a1a9a'); g.addColorStop(1, '#2a0a4a');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = hue; c.lineWidth = 6; c.shadowColor = hue; c.shadowBlur = 16;
  c.strokeRect(6, 6, w - 12, h - 12);
  c.beginPath(); c.moveTo(w / 2, h * 0.32); c.lineTo(w * 0.8, h * 0.5); c.lineTo(w / 2, h * 0.68); c.lineTo(w * 0.2, h * 0.5); c.closePath(); c.stroke();
  c.fillStyle = '#ffd0ff'; c.beginPath(); c.moveTo(w / 2, h * 0.42); c.lineTo(w * 0.62, h * 0.5); c.lineTo(w / 2, h * 0.58); c.lineTo(w * 0.38, h * 0.5); c.closePath(); c.fill();
  return tex(cv);
}

// Small floating data panel: graphs + rows of text-like bars.
export function dataPanelTex(seed = 3, w = 256, h = 160, tint = '#5cd0ff') {
  const r = rng(seed);
  const [cv, c] = canvas(w, h);
  c.fillStyle = 'rgba(10,40,90,0.55)'; c.fillRect(0, 0, w, h);
  c.strokeStyle = tint; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4);
  c.fillStyle = tint;
  for (let i = 0; i < 6; i++) c.fillRect(12, 16 + i * 14, 30 + r() * 90, 5);
  c.beginPath(); c.moveTo(w * 0.55, h * 0.8);
  for (let i = 0; i <= 10; i++) c.lineTo(w * (0.55 + i * 0.04), h * (0.8 - r() * 0.55));
  c.stroke();
  for (let i = 0; i < 8; i++) c.fillRect(w * 0.55 + i * 12, h - 12 - r() * 30, 8, 30);
  return tex(cv);
}

// Crowd strip atlas: 4 rows of silhouette strips (heads + shoulders), alpha in .a; tinted by vertex/instance colour.
// Crowd atlas, 4 rows of spectators. r = silhouette mask, g = light sticks / phone lights (tips), b = clothing value.
// Varied silhouettes: broad / slim / kids, hats and hoods, one or two raised arms, flags and boards on poles.
function crowdTexRaw(w = 1024, h = 256, seed = 11) {
  const r = rng(seed);
  const [cv, c] = canvas(w, h);
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  const rows = 4, rh = h / rows;
  const col = (m, g, b) => `rgb(${m},${g},${b})`;
  for (let row = 0; row < rows; row++) {
    const by = row * rh + rh;
    // back layer (taller people / standing) drawn first, a touch dimmer clothing; then the front layer offset by half a person
    for (const layer of [0, 1]) {
      let x = layer ? 2 + r() * 6 : 8 + r() * 6;
      while (x < w - 12) {
        const kid = r() < 0.12, broad = r() < 0.3;
        const s = rh * (kid ? 0.26 : 0.32 + r() * 0.1) * (layer ? 0.95 : 1.05);
        const sw = s * (broad ? 0.78 : 0.6 + r() * 0.1);
        const base = by - (layer ? 0 : rh * 0.08);
        const cloth = 40 + r() * 215 | 0;
        c.fillStyle = col(255, 0, cloth);
        // torso: rounded shoulders
        c.beginPath();
        c.moveTo(x - sw, base); c.lineTo(x - sw, base - s * 0.75);
        c.quadraticCurveTo(x - sw, base - s * 1.05, x - sw * 0.45, base - s * 1.08);
        c.lineTo(x + sw * 0.45, base - s * 1.08);
        c.quadraticCurveTo(x + sw, base - s * 1.05, x + sw, base - s * 0.75);
        c.lineTo(x + sw, base); c.fill();
        // head (+ hat / hood / hair bun)
        const hr = s * (0.24 + r() * 0.05), hy = base - s * 1.08 - hr * 0.9;
        c.fillStyle = col(255, 0, 30 + r() * 40 | 0);
        c.beginPath(); c.ellipse(x + (r() - 0.5) * s * 0.1, hy, hr * 0.9, hr, 0, 0, 7); c.fill();
        const hat = r();
        if (hat < 0.14) { c.fillRect(x - hr * 1.3, hy - hr * 0.55, hr * 2.6, hr * 0.28); c.fillRect(x - hr * 0.8, hy - hr * 1.2, hr * 1.6, hr * 0.7); }
        else if (hat < 0.26) { c.beginPath(); c.ellipse(x, hy - hr * 0.2, hr * 1.15, hr * 1.2, 0, Math.PI, 0); c.fill(); }
        else if (hat < 0.32) { c.beginPath(); c.arc(x + hr * 0.6, hy - hr * 0.8, hr * 0.45, 0, 7); c.fill(); }
        // arms: none / one / both raised, sometimes holding a light stick or phone; a few flags and boards
        const arms = r();
        const raise = (side) => {
          const ax = x + side * sw * 0.8, ay = base - s * 0.95;
          const tx = ax + side * s * (0.1 + r() * 0.25), ty = ay - s * (0.75 + r() * 0.35);
          c.strokeStyle = col(255, 0, cloth); c.lineWidth = Math.max(2, s * 0.2); c.lineCap = 'round';
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(tx, ty); c.stroke();
          const it = r();
          if (it < 0.45) { // light stick
            c.strokeStyle = col(255, 255, 255); c.lineWidth = Math.max(3, s * 0.2);
            c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + side * s * 0.08, ty - s * 0.42); c.stroke();
          } else if (it < 0.75) { // phone light
            c.fillStyle = col(255, 255, 255); c.fillRect(tx - 3, ty - 5, 6, 6);
          } else if (it < 0.83) { // flag / board on a pole
            c.strokeStyle = col(255, 0, 60); c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx, ty - s * 0.9); c.stroke();
            c.fillStyle = col(255, 90, 230); c.fillRect(tx, ty - s * 0.9, s * (0.6 + r() * 0.4), s * 0.42);
          }
        };
        if (arms < 0.4) raise(r() < 0.5 ? -1 : 1);
        else if (arms < 0.55) { raise(-1); raise(1); }
        x += sw * 2 * (0.85 + r() * 0.35) + (layer ? 0 : s * 0.5);
      }
    }
  }
  return tex(cv, { srgb: false });
}

// Building window atlas for the skyline (r = window mask, g = lit variation, b = vertical stripe accents).
function windowTexRaw(w = 256, h = 512, seed = 5) {
  const r = rng(seed);
  const [cv, c] = canvas(w, h);
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  const cw = 8, chh = 10;
  for (let y = 0; y < h; y += chh) for (let x = 0; x < w; x += cw) {
    const lit = r();
    if (lit < 0.42) continue;
    const g = lit * 255 | 0;
    c.fillStyle = `rgb(255,${g},${r() < 0.08 ? 255 : 0})`;
    c.fillRect(x + 2, y + 3, cw - 3, chh - 5);
  }
  return tex(cv, { srgb: false, repeat: true });
}

// Soft round sprite (particles, glows).
export function glowTex(size = 64) {
  const [cv, c] = canvas(size, size);
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  return tex(cv, { srgb: false });
}

// battle-10: static procedural textures are cached per module (same args -> same texture objects), so a battle's arena build after
// the first, or after prewarm, skips the canvas work. A battle's dispose() frees only the GPU copy; three re-uploads on next use.
const TEX_CACHE = new Map();
export function memoTex(name, fn) {
  return (...args) => {
    const k = name + JSON.stringify(args);
    let v = TEX_CACHE.get(k);
    if (!v) TEX_CACHE.set(k, (v = fn(...args)));
    return v;
  };
}
// run thunks one per idle period (prewarm); resolves when all ran
export function idleRun(list) {
  const ric = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 1000 }) : (f) => setTimeout(f, 30);
  return new Promise((resolve) => {
    let i = 0;
    const step = () => { if (i >= list.length) { resolve(); return; } try { list[i++](); } catch (e) { console.warn('[textures] prewarm step failed', e); } ric(step); };
    ric(step);
  });
}
export const floorTextures = memoTex('floor', floorTexturesRaw);
export const crowdTex = memoTex('crowd', crowdTexRaw);
export const windowTex = memoTex('window', windowTexRaw);
export const bannerTex = memoTex('banner', bannerTexRaw);
