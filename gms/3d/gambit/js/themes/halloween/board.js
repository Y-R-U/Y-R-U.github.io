// Halloween board: graveyard flagstones (pale limestone with lichen vs violet-grey slate with
// moss creeping in from the joints, a faint glowing-moss line in the grout), a stone kerb with a
// low spiked iron railing, and a little tombstone + candle cluster on every corner.
// 3 draw calls: surface (one canvas texture + a small emissive grout map), stone/iron props
// (vertex coloured), candle flames (glow).
// The environment (moonlit hill, crooked trees, scattered tombstones and pumpkins, a big moon)
// is only shown when the camera tilts, so the overhead view pays nothing for it.

/**
 * Square colours. D28: the dark square sits clearly between the black pieces (violet-black /
 * purple) and the light squares in value, so black pieces read on it from overhead.
 * Tuned in ONE place: kit.boardLooks.graveyard (board-2). This copy is only the fallback.
 */
export let LOOK = {
  light: '#d8d1bf', lightShade: '#bdb39c', lichen: ['#cfc77e', '#d9a95c', '#b9c08a'], lightLabel: '#4d465c',
  dark: '#6a7182', darkShade: '#565b6c', moss: ['#4f6a3a', '#5f7c40', '#3e5a34'], darkLabel: '#ece3c9',
  grout: '#2b3226', glow: '#7dff6a',
};

let rng = 1;
const rand = () => { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; };
const R = (a, b) => a + (b - a) * rand();

function stone(c, x, y, S, dark, seed) {
  rng = seed * 7919 + 13;
  const g = 3 + S * 0.012, j = S * 0.03;
  // slightly irregular, chipped outline
  const pts = [[g, g], [S / 2, g], [S - g, g], [S - g, S / 2], [S - g, S - g], [S / 2, S - g], [g, S - g], [g, S / 2]]
    .map(([px, py], i) => [x + px + (i % 2 ? R(-j, j) * 0.4 : R(0, j)) * (px < S / 2 ? 1 : -1), y + py + (i % 2 ? R(-j, j) * 0.4 : R(0, j)) * (py < S / 2 ? 1 : -1)]);
  c.save();
  c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath();
  const base = dark ? LOOK.dark : LOOK.light, shade = dark ? LOOK.darkShade : LOOK.lightShade;
  const gr = c.createLinearGradient(x, y, x + S, y + S);
  gr.addColorStop(0, base); gr.addColorStop(1, shade);
  c.fillStyle = gr; c.fill();
  c.clip();
  // mottling
  for (let i = 0; i < 7; i++) {
    const cx = x + R(0, S), cy = y + R(0, S), r = R(S * 0.15, S * 0.45);
    const m = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    const v = rand() < 0.5 ? '255,250,235' : (dark ? '30,28,46' : '90,80,60');
    m.addColorStop(0, `rgba(${v},${R(0.05, 0.13)})`); m.addColorStop(1, `rgba(${v},0)`);
    c.fillStyle = m; c.fillRect(x, y, S, S);
  }
  // grain speckle
  for (let i = 0; i < 260; i++) {
    c.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${R(0.05, 0.16)})` : `rgba(255,255,245,${R(0.05, 0.14)})`;
    c.fillRect(x + R(0, S), y + R(0, S), R(0.8, 1.8), R(0.8, 1.8));
  }
  // a hairline crack now and then
  if (rand() < 0.45) {
    c.strokeStyle = dark ? 'rgba(20,18,30,0.5)' : 'rgba(70,60,45,0.45)'; c.lineWidth = 1.1;
    let px = x + R(0, S), py = y + (rand() < 0.5 ? g : S - g), a = py > y + S / 2 ? -Math.PI / 2 : Math.PI / 2;
    c.beginPath(); c.moveTo(px, py);
    for (let k = 0; k < 6; k++) { a += R(-0.7, 0.7); px += Math.cos(a) * S * 0.08; py += Math.sin(a) * S * 0.08; c.lineTo(px, py); }
    c.stroke();
  }
  if (!dark) {
    // lichen rosettes (pale yellow-green / rust)
    const n = 2 + Math.floor(R(0, 4));
    for (let i = 0; i < n; i++) {
      const cx = x + R(S * 0.1, S * 0.9), cy = y + R(S * 0.1, S * 0.9), col = LOOK.lichen[Math.floor(R(0, 3))];
      for (let k = 0; k < 14; k++) {
        c.globalAlpha = R(0.25, 0.55); c.fillStyle = col;
        c.beginPath(); c.arc(cx + R(-1, 1) * S * 0.06, cy + R(-1, 1) * S * 0.06, R(1.2, S * 0.025), 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
    }
  }
  // edge shading (a bevel feel) + moss creeping in from the joints
  c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.18)';
  c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath(); c.stroke();
  const mossN = dark ? 26 : 8;
  for (let i = 0; i < mossN; i++) {
    const side = Math.floor(R(0, 4)), t = R(0.05, 0.95);
    const mx = x + (side === 0 ? g : side === 1 ? S - g : t * S), my = y + (side === 2 ? g : side === 3 ? S - g : t * S);
    c.globalAlpha = R(0.35, dark ? 0.75 : 0.5); c.fillStyle = LOOK.moss[Math.floor(R(0, 3))];
    c.beginPath(); c.arc(mx, my, R(1.5, S * 0.03), 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
  c.restore();
}

function label(c, S, f, r, text, corner, flip) {
  const dark = (f + r) % 2 === 0, x0 = f * S, y0 = (7 - r) * S, pad = S * 0.08;
  c.save();
  c.fillStyle = dark ? LOOK.darkLabel : LOOK.lightLabel;
  c.translate(x0 + S / 2, y0 + S / 2);
  if (flip) c.rotate(Math.PI);
  c.textBaseline = corner === 'tl' ? 'top' : 'bottom';
  c.textAlign = corner === 'tl' ? 'left' : 'right';
  const hx = S / 2 - pad;
  c.fillText(text, corner === 'tl' ? -hx : hx, corner === 'tl' ? -hx : hx);
  c.restore();
}

// ------------------------------------------------------------------ props
const C = (THREE, hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
function colorAll(kit, g, fn) {
  kit.ensureColor(g);
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); c.setXYZ(i, v[0], v[1], v[2]); }
  return g;
}
function noise2(x, z) { return 0.5 + 0.25 * Math.sin(x * 3.1 + z * 1.7) * Math.sin(z * 2.3 - x * 0.9) + 0.25 * Math.sin(x * 7.3 - z * 5.1); }

/** A little rounded-top headstone, centred on x, base at y = 0, facing +z. */
function tombstone(THREE, kit, w, h, d, { cross = false, tint = '#9d978c' } = {}) {
  let g;
  if (cross) {
    const a = kit.bevelBox(w * 0.32, h, d, 0.008, 1); a.translate(0, h / 2, 0);
    const b = kit.bevelBox(w, w * 0.3, d, 0.008, 1); b.translate(0, h * 0.68, 0);
    g = kit.merge([a, b]); a.dispose(); b.dispose();
  } else {
    const s = new THREE.Shape(); const r = w / 2;
    s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0);
    g = kit.extrude(s, { depth: d, bevel: 0.008, bevelSegments: 1, curveSegments: 6 });
  }
  const base = C(THREE, tint), moss = C(THREE, '#4f6a3a');
  return colorAll(kit, g, (x, y, z) => {
    const n = noise2(x * 20 + z * 7, y * 20);
    const k = 0.78 + 0.3 * n;
    const m = Math.max(0, 0.6 - y / h) * (n > 0.55 ? 0.7 : 0.15);
    return [base[0] * k * (1 - m) + moss[0] * m, base[1] * k * (1 - m) + moss[1] * m, base[2] * k * (1 - m) + moss[2] * m];
  });
}
function candle(THREE, kit, r, h, wax) {
  const p = kit.profile().pt(0, 0).pt(r, 0).pt(r * 0.98, h * 0.7).pt(r * 1.08, h * 0.78).pt(r, h * 0.86).pt(r * 0.95, h).pt(r * 0.4, h * 1.02).pt(0, h * 0.98);
  const g = kit.lathe(p.points(), { segments: 8 });
  const wc = C(THREE, wax);
  colorAll(kit, g, (x, y) => { const k = 0.8 + 0.2 * (y / h); return [wc[0] * k, wc[1] * k, wc[2] * k]; });
  const wick = kit.cylinder(0.003, 0.003, 0.02, 4); wick.translate(0, h + 0.008, 0);
  colorAll(kit, wick, () => [0.05, 0.04, 0.03]);
  const m = kit.merge([g, wick]); g.dispose(); wick.dispose();
  return m;
}
function flame(kit, r, h) {
  const g = kit.sphere(r, 6, 5); g.scale(1, 1.9, 1); g.translate(0, h + 0.02 + r * 1.6, 0);
  return g;
}
function pumpkin(THREE, kit, r, { seg = 16 } = {}) {
  const p = kit.profile();
  for (let i = 0; i <= 8; i++) { const f = (-90 + 180 * i / 8) * Math.PI / 180; p.pt(r * Math.cos(f), r * 0.78 * (1 + Math.sin(f))); }
  const g = kit.lathe(p.points(), { segments: seg });
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), k = 0.9 + 0.1 * Math.pow(Math.abs(Math.cos(4 * Math.atan2(x, z))), 0.6); pos.setXYZ(i, x * k, pos.getY(i), z * k); }
  g.computeVertexNormals();
  const o = C(THREE, '#e86f12'), d = C(THREE, '#9a3c08');
  colorAll(kit, g, (x, y, z) => { const c = Math.pow(1 - Math.abs(Math.cos(4 * Math.atan2(x, z))), 2); return [o[0] + (d[0] - o[0]) * c, o[1] + (d[1] - o[1]) * c, o[2] + (d[2] - o[2]) * c]; });
  const stem = kit.cylinder(r * 0.1, r * 0.16, r * 0.4, 5); stem.translate(0, r * 1.62, 0);
  colorAll(kit, stem, () => C(THREE, '#4a5a20'));
  const m = kit.merge([g, stem]); g.dispose(); stem.dispose();
  return m;
}

// ------------------------------------------------------------------ board
export function build(THREE, kit, { orientation = 'w', coordinates = true } = {}) {
  if (kit.boardLooks?.graveyard) LOOK = kit.boardLooks.graveyard;
  const g = new THREE.Group(); g.name = 'halloween-board';
  const S = 128, N = S * 8;
  const tex = kit.canvasTexture(N, N, (c) => {
    c.fillStyle = LOOK.grout; c.fillRect(0, 0, N, N);
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) stone(c, f * S, (7 - r) * S, S, (f + r) % 2 === 0, f * 31 + r * 17 + 5);
    if (!coordinates) return;
    c.font = `700 ${Math.round(S * 0.2)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    const flip = orientation === 'b';
    for (let i = 0; i < 8; i++) {
      label(c, S, flip ? 7 : 0, i, String(i + 1), 'tl', flip);
      label(c, S, i, flip ? 7 : 0, 'abcdefgh'[i], 'br', flip);
    }
  });
  // faint glowing moss along the joints (emissive only, so it shows mostly in shade)
  const glowTex = kit.canvasTexture(512, 512, (c, w) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, w);
    const s = w / 8; rng = 77;
    c.strokeStyle = LOOK.glow; c.lineWidth = 1.4;
    for (let i = 1; i < 8; i++) for (let k = 0; k < 8; k++) {
      for (const [x0, y0, x1, y1] of [[i * s, k * s, i * s, (k + 1) * s], [k * s, i * s, (k + 1) * s, i * s]]) {
        if (rand() < 0.45) continue;                                  // broken, patchy line
        c.globalAlpha = R(0.25, 0.7);
        const t0 = R(0, 0.3), t1 = R(0.6, 1);
        c.beginPath(); c.moveTo(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0); c.lineTo(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1); c.stroke();
      }
    }
    c.globalAlpha = 1;
  });
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0, envMapIntensity: 0.5,
      emissive: new THREE.Color('#ffffff'), emissiveMap: glowTex, emissiveIntensity: 0.35 }));
  surf.receiveShadow = true; surf.name = 'surface';
  g.add(surf);

  // --- stone kerb (blocks), corner pillars, iron railing: one vertex-coloured mesh
  const props = [], flames = [];
  const kStone = C(THREE, '#8e887e'), kDark = C(THREE, '#6b6560'), moss = C(THREE, '#4c6438');
  const depth = 0.4, top = 0.045, inner = 4.0, outer = 4.5;
  rng = 3;
  for (let side = 0; side < 4; side++) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const len = (2 * inner) / n, hj = R(-0.008, 0.01);
      const b = kit.bevelBox(len - 0.012, depth + hj, outer - inner - 0.01, 0.018, 1);
      const t = rand();
      colorAll(kit, b, (x, y, z) => {
        const k = 0.86 + 0.22 * noise2(x * 9 + i * 3 + side, z * 9 + y * 4) - 0.12 * t;
        const m = y < -0.05 ? 0 : (noise2(x * 13 + side * 5, z * 11 + i) > 0.62 ? 0.55 : 0);
        return [(kStone[0] * (1 - t) + kDark[0] * t) * k * (1 - m) + moss[0] * m, (kStone[1] * (1 - t) + kDark[1] * t) * k * (1 - m) + moss[1] * m, (kStone[2] * (1 - t) + kDark[2] * t) * k * (1 - m) + moss[2] * m];
      });
      b.translate(-inner + len * (i + 0.5), top - (depth + hj) / 2, (inner + outer) / 2);
      b.rotateY(side * Math.PI / 2);
      props.push(b);
    }
  }
  // corner pillars with a tombstone and a candle cluster each, plus two tiny pumpkins
  const wax = ['#efe6cc', '#e8dcc0', '#d9cfb4'];
  for (let ci = 0; ci < 4; ci++) {
    const sx = ci & 1 ? 1 : -1, sz = ci & 2 ? 1 : -1, cx = sx * (inner + outer) / 2, cz = sz * (inner + outer) / 2;
    const p = kit.bevelBox(outer - inner + 0.04, depth + 0.06, outer - inner + 0.04, 0.025, 1);
    colorAll(kit, p, (x, y, z) => { const k = 0.82 + 0.22 * noise2(x * 9 + ci, z * 9 + y * 5); return [kDark[0] * k, kDark[1] * k, kDark[2] * k]; });
    p.translate(cx, top + 0.06 - (depth + 0.06) / 2, cz); props.push(p);
    const ptop = top + 0.06;
    // tombstone toward the outer corner, facing the board centre, leaning a little
    const ts = tombstone(THREE, kit, 0.24, 0.36, 0.06, { cross: ci === 1, tint: ci % 2 ? '#a39d92' : '#958f86' });
    const yaw = Math.atan2(-cx, -cz);
    ts.rotateX(-0.08 + ci * 0.04); ts.rotateY(yaw); ts.translate(cx + sx * 0.09, ptop, cz + sz * 0.09);
    props.push(ts);
    // candles toward the board, staggered heights
    const cs = [[-0.12, 0.07, 0.036, 0.19], [0.07, -0.11, 0.032, 0.14], [-0.03, -0.05, 0.028, 0.09]];
    cs.forEach(([dx, dz, r, h], k) => {
      const x = cx - sx * 0.08 + dx * sx, z = cz - sz * 0.08 + dz * sz;
      const cd = candle(THREE, kit, r, h, wax[k]); cd.translate(x, ptop, z); props.push(cd);
      const fl = flame(kit, r * 0.55, h); fl.translate(x, ptop, z); flames.push(fl);
    });
    if (ci === 0 || ci === 3) { const pk = pumpkin(THREE, kit, 0.075); pk.translate(cx + sx * 0.15, ptop, cz - sz * 0.14); props.push(pk); }
  }
  // spiked iron railing along the outer edge of the kerb (low, so it never hides rank 1)
  const iron = C(THREE, '#1c1a22'), ironHi = C(THREE, '#3a3646');
  const rail = (len) => { const b = kit.bevelBox(len, 0.014, 0.014, 0.004, 1); return b; };
  const fenceR = outer - 0.06;
  for (let side = 0; side < 4; side++) {
    const parts = [];
    const span = 2 * inner - 0.1;
    for (const y of [0.045, 0.15]) { const r = rail(span); r.translate(0, top + y, 0); parts.push(r); }
    const n = 17;
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (span * (i + 0.5)) / n;
      const post = kit.cylinder(0.009, 0.009, 0.19, 5); post.translate(x, top + 0.095, 0);
      const tip = kit.cylinder(0, 0.022, 0.05, 4); tip.translate(x, top + 0.215, 0);
      const coll = kit.cylinder(0.016, 0.016, 0.012, 5); coll.translate(x, top + 0.185, 0);
      parts.push(post, tip, coll);
    }
    const m = kit.merge(parts); parts.forEach(q => q.dispose());
    colorAll(kit, m, (x, y) => (y > top + 0.17 ? ironHi : iron));
    m.translate(0, 0, fenceR); m.rotateY(side * Math.PI / 2);
    props.push(m);
  }
  const propMat = kit.material({ color: '#ffffff', roughness: 0.78, metalness: 0.05, envMapIntensity: 0.6 });
  const propMesh = new THREE.Mesh(kit.merge(props), propMat);
  props.forEach(q => q.dispose());
  propMesh.castShadow = true; propMesh.receiveShadow = true; propMesh.name = 'kerb';
  g.add(propMesh);
  const flameMesh = new THREE.Mesh(kit.merge(flames), kit.material({ color: '#ffd27a', emissive: '#ffb02a', emissiveIntensity: 2.2, roughness: 1,
    flicker: { mode: 'candle', amount: 0.42, speed: 1.1, spread: 1 } }));
  flames.forEach(q => q.dispose());
  flameMesh.name = 'flames';
  g.add(flameMesh);
  return g;
}

// ------------------------------------------------------------------ environment
// Moonlit graveyard (board-2). The 3D views look steeply down (only a 2-5 degree strip shows above the
// board), so the sky is a skybox-style backdrop pass: drawn after the opaque scene at the far plane
// (only uncovered pixels shade), with its painted horizon pinned to the projected far rim of a small
// ground plot. Moon, spire, manor and hills scale with however much sky is visible, so every view
// gets the same composition. Bats, fireflies and mist are GPU-only (kit.ambient clock): no per-frame JS.
const RIM = 7.0;                         // ground plot radius (the painted horizon sits on its far edge)
const GROUND_Y = -0.36;
const SKY = { top: '#090a22', mid: '#1b1546', low: '#43295f', haze: '#6b5a8e', ground: '#0e0c1b' };

/** Tileable skyline strip: far hills, manor with lit windows, church spire, dead trees, near ridge. */
function skylineTexture(kit) {
  const W = 4096, H = 192;                // spans SKY_W band units across, SKY_H band units tall
  return kit.canvasTexture(W, H, (c) => {
    const X = u => (u / SKY_W + 0.5) * W, Y = v => H - (v / SKY_H) * H;     // band units -> px
    const ridge = (u, k) => k.reduce((s, [a, p, ph]) => s + a * Math.sin((u / SKY_W) * Math.PI * 2 * p + ph), 0);
    const fillRidge = (base, k, color) => {
      c.fillStyle = color; c.beginPath(); c.moveTo(0, H);
      for (let px = 0; px <= W; px += 8) { const u = (px / W - 0.5) * SKY_W; c.lineTo(px, Y(base + ridge(u, k))); }
      c.lineTo(W, H); c.closePath(); c.fill();
    };
    // far hills (hazy violet), with the manor on a rise right of centre
    fillRidge(0.17, [[0.05, 3, 0.4], [0.035, 7, 1.9], [0.02, 13, 0.3], [0.06, 1, 2.6]], '#2a2050');
    const manor = (u0, v0, s) => {
      const x = X(u0), y = Y(v0), k = (H / SKY_H) * s;
      c.fillStyle = '#1a1536';
      c.fillRect(x - 0.42 * k, y - 0.16 * k, 0.84 * k, 0.17 * k);            // main block
      c.fillRect(x - 0.16 * k, y - 0.27 * k, 0.32 * k, 0.12 * k);            // centre hall
      c.beginPath(); c.moveTo(x - 0.2 * k, y - 0.27 * k); c.lineTo(x, y - 0.38 * k); c.lineTo(x + 0.2 * k, y - 0.27 * k); c.fill();
      for (const [dx, h] of [[-0.42, 0.36], [0.42, 0.3]]) {                 // corner towers + cones
        c.fillRect(x + (dx - 0.06) * k, y - h * k, 0.12 * k, h * k);
        c.beginPath(); c.moveTo(x + (dx - 0.08) * k, y - h * k); c.lineTo(x + dx * k, y - (h + 0.14) * k); c.lineTo(x + (dx + 0.08) * k, y - h * k); c.fill();
      }
      c.fillRect(x + 0.22 * k, y - 0.24 * k, 0.03 * k, 0.1 * k);            // chimney
      c.fillStyle = '#ffb347';                                              // a few lit windows
      for (const [dx, dy] of [[-0.3, 0.1], [-0.12, 0.1], [0.18, 0.1], [0.05, 0.21], [-0.42, 0.26]]) c.fillRect(x + dx * k - 0.012 * k, y - dy * k - 0.022 * k, 0.024 * k, 0.034 * k);
    };
    manor(2.1, 0.2, 0.62);
    // church with a tall spire, left of centre (it stands in front of the moon's halo)
    const church = (u0, v0, s) => {
      const x = X(u0), y = Y(v0), k = (H / SKY_H) * s;
      c.fillStyle = '#151230';
      c.fillRect(x - 0.05 * k, y - 0.42 * k, 0.1 * k, 0.43 * k);             // tower
      c.beginPath(); c.moveTo(x - 0.065 * k, y - 0.42 * k); c.lineTo(x, y - 0.78 * k); c.lineTo(x + 0.065 * k, y - 0.42 * k); c.fill();
      c.fillRect(x - 0.004 * k, y - 0.88 * k, 0.008 * k, 0.11 * k);          // cross
      c.fillRect(x - 0.025 * k, y - 0.85 * k, 0.05 * k, 0.008 * k);
      c.fillRect(x + 0.04 * k, y - 0.16 * k, 0.3 * k, 0.17 * k);             // nave + roof
      c.beginPath(); c.moveTo(x + 0.04 * k, y - 0.16 * k); c.lineTo(x + 0.19 * k, y - 0.25 * k); c.lineTo(x + 0.34 * k, y - 0.16 * k); c.fill();
      c.fillStyle = '#ffc860'; c.fillRect(x - 0.012 * k, y - 0.3 * k, 0.024 * k, 0.05 * k);
    };
    church(-1.3, 0.15, 1);
    // nearer ridge in the ground colour (it meets the plot's rim), with bare trees and grave markers
    fillRidge(0.075, [[0.025, 5, 1.1], [0.015, 11, 0.2], [0.03, 2, 0.7]], SKY.ground);
    const tree = (u0, s, seed) => {
      let r = seed * 9301 + 49297; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
      const x = X(u0), y = Y(0.07), k = (H / SKY_H) * s;
      c.strokeStyle = SKY.ground; c.lineCap = 'round';
      const br = (px, py, a, len, w, d) => {
        const ex = px + Math.sin(a) * len, ey = py - Math.cos(a) * len;
        c.lineWidth = w; c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px + Math.sin(a + 0.3) * len * 0.5, py - Math.cos(a + 0.3) * len * 0.5, ex, ey); c.stroke();
        if (d > 0) for (let i = 0; i < 2 + (rnd() < 0.4); i++) br(ex, ey, a + (rnd() - 0.5) * 1.6, len * (0.55 + rnd() * 0.25), w * 0.62, d - 1);
      };
      br(x, y, (rnd() - 0.5) * 0.3, 0.16 * k, 0.03 * k, 4);
    };
    tree(-3.3, 1.1, 3); tree(0.55, 0.8, 7); tree(3.6, 1.25, 11); tree(-6.5, 0.9, 5); tree(6.8, 1.0, 13); tree(-9.5, 1.2, 17); tree(9.8, 0.9, 19);
    c.fillStyle = SKY.ground;
    for (const u of [-2.4, -2.2, -0.2, 1.1, 1.3, 4.6, -5.0, 5.4, 8.2, -8.0]) {      // tiny crosses and stones on the ridge
      const x = X(u), y = Y(0.07), k = H / SKY_H;
      if (Math.abs(u * 7) % 2 < 1) { c.fillRect(x - 0.006 * k, y - 0.07 * k, 0.012 * k, 0.07 * k); c.fillRect(x - 0.02 * k, y - 0.055 * k, 0.04 * k, 0.01 * k); }
      else { c.beginPath(); c.arc(x, y - 0.03 * k, 0.018 * k, Math.PI, 0); c.fill(); c.fillRect(x - 0.018 * k, y - 0.03 * k, 0.036 * k, 0.03 * k); }
    }
  }, { repeat: true });
}
const SKY_W = 24, SKY_H = 1.0;          // skyline strip size in band units

const SKY_VERT = `
uniform mat4 uInvVP;
varying vec3 vDir;
void main() {
  vec4 p = uInvVP * vec4(position.xy, 1.0, 1.0);
  vDir = p.xyz / p.w - cameraPosition;
  gl_Position = vec4(position.xy, 1.0, 1.0);          // far plane: only pixels nothing else covered
}`;
const SKY_FRAG = `
uniform float uAmbT; uniform vec4 uView;   // x = camera yaw, y = rim elevation, z = band unit (rad)
uniform sampler2D uSkyline;
uniform vec3 cTop, cMid, cLow, cHaze, cGround;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.x, d.z) - uView.x - 3.14159265;
  az = atan(sin(az), cos(az));
  vec2 p = vec2(az, el - uView.y) / uView.z;          // painting coords in band units, horizon at y = 0
  // sky gradient: violet glow at the horizon up to deep indigo
  vec3 col = mix(cLow, cMid, smoothstep(0.0, 0.9, p.y));
  col = mix(col, cTop, smoothstep(0.8, 2.6, p.y));
  // stars (twinkle on the ambient clock)
  vec2 g = floor(p * 9.0); float h = hash(g);
  if (h > 0.965 && p.y > 0.35) {
    vec2 f = fract(p * 9.0) - 0.5 - (vec2(hash(g + 3.1), hash(g + 7.7)) - 0.5) * 0.6;
    float tw = 0.65 + 0.35 * sin(uAmbT * (1.5 + h * 3.0) + h * 40.0);
    col += vec3(0.85, 0.85, 1.0) * smoothstep(0.09, 0.0, length(f)) * tw * smoothstep(0.35, 1.0, p.y) * (h - 0.965) * 22.0;
  }
  // the moon: big soft disc, faint craters, wide lavender halo
  vec2 mc = vec2(-1.55, 0.62); float mr = 0.3;
  float md = length(p - mc);
  col += vec3(0.55, 0.5, 0.85) * 0.5 * exp(-max(md - mr, 0.0) * 2.2) + vec3(0.9, 0.85, 1.0) * 0.18 * exp(-max(md - mr, 0.0) * 9.0);
  vec2 mq = (p - mc) / mr;
  float crater = 0.08 * smoothstep(0.32, 0.18, length(mq - vec2(-0.25, 0.2))) + 0.06 * smoothstep(0.22, 0.1, length(mq - vec2(0.3, -0.15)))
               + 0.05 * smoothstep(0.18, 0.06, length(mq - vec2(0.05, -0.45)));
  vec3 moon = vec3(1.0, 0.97, 0.88) * (0.92 - crater - 0.12 * smoothstep(0.3, 1.0, length(mq - vec2(-0.3, 0.3))));
  col = mix(col, moon, smoothstep(mr + 0.012, mr - 0.012, md));
  // hazy band hugging the horizon (hides the seam with the 3D ground)
  col = mix(col, cHaze, 0.55 * exp(-abs(p.y - 0.03) * 9.0));
  // skyline silhouettes (alpha strip), then plain ground below the horizon
  vec4 s = p.y >= 0.0 && p.y <= ${SKY_H.toFixed(2)} ? texture2D(uSkyline, vec2(p.x / ${SKY_W.toFixed(1)} + 0.5, p.y / ${SKY_H.toFixed(2)})) : vec4(0.0);
  col = mix(col, s.rgb, s.a);
  col = mix(col, cGround, smoothstep(0.0, -0.03, p.y));
  col = mix(col, cHaze, 0.35 * exp(-abs(p.y) * 14.0) * step(p.y, 0.0));
  gl_FragColor = vec4(col, 1.0);
}`;

function skyBackdrop(THREE, kit) {
  const C3 = h => new THREE.Color(h);  // raw sRGB values: this shader writes straight to the canvas
  const cc = h => { const c = C3(h); c.convertLinearToSRGB?.(); return c; };
  const u = {
    uAmbT: kit.ambient.time, uView: { value: new THREE.Vector4(0, -0.5, 0.06, 0) }, uInvVP: { value: new THREE.Matrix4() },
    uSkyline: { value: skylineTexture(kit) },
    cTop: { value: C3(SKY.top) }, cMid: { value: C3(SKY.mid) }, cLow: { value: C3(SKY.low) }, cHaze: { value: C3(SKY.haze) }, cGround: { value: C3(SKY.ground) },
  };
  // THREE.Color(hex) stores linear values; the shader writes raw, so convert back to sRGB
  for (const k of ['cTop', 'cMid', 'cLow', 'cHaze', 'cGround']) u[k].value = cc(new THREE.Color(SKY[{ cTop: 'top', cMid: 'mid', cLow: 'low', cHaze: 'haze', cGround: 'ground' }[k]]));
  u.uSkyline.value.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth, fog: false });
  mat.userData.ambient = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 1e6; mesh.name = 'sky';
  const _f = new THREE.Vector3(), _top = new THREE.Vector3();
  mesh.onBeforeRender = (r, s, cam) => {
    u.uInvVP.value.multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
    const cp = cam.position, hd = Math.hypot(cp.x, cp.z) || 1e-3;
    const yaw = Math.atan2(cp.x, cp.z);
    const rimEl = Math.atan2(GROUND_Y + 0.05 - cp.y, hd + RIM);
    cam.getWorldDirection(_f);
    const topEl = Math.asin(THREE.MathUtils.clamp(_f.y, -1, 1)) + THREE.MathUtils.degToRad(cam.fov / 2);
    const band = THREE.MathUtils.clamp((topEl - rimEl) * 0.95, 0.036, 0.09);  // one band unit = the visible sky strip
    u.uView.value.set(yaw, rimEl, band, 0);
  };
  return mesh;
}

/** GPU bats: one mesh, each bat flaps and loops on its own path above the far side of the plot. */
function bats(THREE, kit, n = 7) {
  const pos = [], prm = [], wing = [];
  const shape = [[0, 0, 0.06], [-0.05, 0.0, 0.02], [0.05, 0.0, 0.02],              // body (head toward +z)
    [-0.03, 0, 0.03], [-0.2, 0.02, 0.0], [-0.04, 0, -0.04], [-0.2, 0.02, 0.0], [-0.16, 0, -0.06], [-0.04, 0, -0.04],
    [0.03, 0, 0.03], [0.04, 0, -0.04], [0.2, 0.02, 0.0], [0.2, 0.02, 0.0], [0.04, 0, -0.04], [0.16, 0, -0.06]];
  let r = 5;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const p = [rnd() * 6.28, 0.8 + rnd() * 2.2, 0.3 + rnd() * 0.3, 1.0 + rnd() * 1.1];   // phase, loop radius, speed, height
    const s = 1.1 + rnd() * 0.6;
    for (const v of shape) { pos.push(v[0] * s, v[1] * s, v[2] * s); prm.push(...p); wing.push(Math.abs(v[0]) * s); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBat', new THREE.Float32BufferAttribute(prm, 4));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uAmbT: kit.ambient.time },
    vertexShader: `uniform float uAmbT; attribute vec4 aBat; attribute float aWing;
      void main() {
        float t = uAmbT * aBat.z + aBat.x;
        // a lazy loop behind the board as seen from the camera (either side), low enough to cross the sky band
        vec2 bk = -normalize(cameraPosition.xz + vec2(1e-4, 0.0)); vec2 rt = vec2(-bk.y, bk.x);
        vec2 l = vec2(sin(t) * (2.6 + aBat.y), cos(t) * aBat.y * 0.6);
        vec2 dl = vec2(cos(t) * (2.6 + aBat.y), -sin(t) * aBat.y * 0.6);
        vec3 c = vec3(rt * l.x + bk * (5.2 + l.y), 0.0); c = vec3(c.x, aBat.w + sin(t * 2.0) * 0.25, c.y);
        vec2 vw = rt * dl.x + bk * dl.y;
        float yaw = atan(vw.x, vw.y);
        vec3 p = position;
        p.y += sin(uAmbT * 13.0 + aBat.x * 7.0) * aWing * 0.9;              // flap
        p.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * p.xz;
        gl_Position = projectionMatrix * viewMatrix * vec4(c + p, 1.0);
      }`,
    fragmentShader: 'void main() { gl_FragColor = vec4(0.045, 0.035, 0.07, 1.0); }',
    side: THREE.DoubleSide, fog: false,
  });
  mat.userData.ambient = true;
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.name = 'bats';
  return m;
}

/** GPU fireflies / will-o'-wisps: soft additive points drifting over the plot. */
function fireflies(THREE, kit, n = 34) {
  const pos = [], seed = [];
  let r = 21;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = 4.9 + rnd() * 1.9;
    pos.push(Math.sin(a) * d, GROUND_Y + 0.15 + rnd() * 0.9, Math.cos(a) * d); seed.push(rnd());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const u = { uAmbT: kit.ambient.time, uScale: { value: 600 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `uniform float uAmbT; uniform float uScale; attribute float aSeed; varying float vA; varying float vG;
      void main() {
        float t = uAmbT * (0.35 + aSeed * 0.3) + aSeed * 50.0;
        vec3 p = position + vec3(sin(t) * 0.35, sin(t * 1.7) * 0.15, cos(t * 0.8) * 0.35);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = smoothstep(0.2, 1.0, sin(uAmbT * (0.9 + aSeed) + aSeed * 30.0) * 0.5 + 0.5);
        vG = step(0.6, aSeed);
        gl_PointSize = uScale * 0.06 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; varying float vG;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = (smoothstep(1.0, 0.0, d) * 0.5 + smoothstep(0.35, 0.0, d)) * vA;
        gl_FragColor = vec4(mix(vec3(1.0, 0.78, 0.3), vec3(0.62, 1.0, 0.45), vG) * a, a); }`,
  });
  mat.userData.ambient = true;
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.name = 'fireflies';
  pts.onBeforeRender = (rnd2) => { u.uScale.value = rnd2.getDrawingBufferSize(_dbs).y; };
  return pts;
}
let _dbs = null;

/** Low mist: instanced camera-facing cards (one draw call), drifting on the ambient clock. */
function mist(THREE, kit, n = 14) {
  const g = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uAmbT: kit.ambient.time, uColor: { value: new THREE.Color('#9a94c8') } },
    transparent: true, depthWrite: false, fog: false,
    vertexShader: `uniform float uAmbT; varying vec2 vUv; varying float vK;
      void main() {
        vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
        float ph = c.x * 1.3 + c.z * 0.7;
        c.x += sin(uAmbT * 0.06 + ph) * 0.7; c.z += cos(uAmbT * 0.05 + ph) * 0.4;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * vec2(sx, sy);
        vUv = uv; vK = 0.75 + 0.25 * sin(uAmbT * 0.2 + ph * 2.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; varying vec2 vUv; varying float vK;
      void main() { vec2 q = (vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - dot(q, q)), 2.0) * 0.26 * vK; gl_FragColor = vec4(uColor, a); }`,
  });
  mat.userData.ambient = true;
  const im = new THREE.InstancedMesh(g, mat, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R(-0.15, 0.15), d = R(5.4, 7.2), w = R(3.2, 5.5);
    m.makeScale(w, w * R(0.22, 0.32), 1).setPosition(Math.sin(a) * d, GROUND_Y + R(0.15, 0.45), Math.cos(a) * d);
    im.setMatrixAt(i, m);
  }
  im.frustumCulled = false; im.renderOrder = 10; im.name = 'mist';
  return im;
}

/**
 * Ground material whose far edge is a STRAIGHT line across the screen (a line on the ground at RIM
 * behind the board, perpendicular to the view), fading into the painted horizon colour, so the
 * 3D plot and the sky backdrop meet seamlessly in any view or orientation.
 */
function horizonMaterial(THREE) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 });
  const rim = new THREE.Color(SKY.ground);
  m.onBeforeCompile = sh => {
    sh.uniforms.uRimCol = { value: rim };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vEnvW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvEnvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vEnvW; uniform vec3 uRimCol;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        vec2 envBk = -normalize(cameraPosition.xz + vec2(1e-4, 0.0));
        float envD = dot(vEnvW.xz, envBk);
        if (envD > ${RIM.toFixed(2)}) discard;`)
      .replace('#include <tonemapping_fragment>', `float envF = smoothstep(${(RIM - 2.2).toFixed(2)}, ${RIM.toFixed(2)}, envD);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uRimCol, envF * envF);
        #include <tonemapping_fragment>`);
  };
  m.customProgramCacheKey = () => 'gambit-hw-horizon';
  return m;
}

/** Moonlit graveyard around the board (tilted views only). */
export function environment(THREE, kit) {
  _dbs = new THREE.Vector2();
  const root = new THREE.Group(); root.name = 'halloween-env';
  rng = 101;
  // the plot: a gently uneven disc that darkens into the horizon colour at its rim
  const ground = new THREE.CircleGeometry(RIM + 0.3, 72, 0, Math.PI * 2);
  const gr = [];
  { // ring subdivide: rebuild as a polar grid so the rim fade has vertices to work with
    const rings = 18, seg = 72, pos = [], idx = [];
    for (let i = 0; i <= rings; i++) for (let j = 0; j < seg; j++) {
      const rr = i <= 12 ? (RIM + 0.6) * Math.pow(i / 12, 0.8) : (RIM + 0.6) * Math.pow(4, (i - 12) / 6), a = (j / seg) * Math.PI * 2;
      pos.push(Math.sin(a) * rr, 0, Math.cos(a) * rr);
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + (j + 1) % seg, c = (i + 1) * seg + j, d = (i + 1) * seg + (j + 1) % seg;
      idx.push(a, c, b, b, c, d);
    }
    ground.dispose();
    gr.push(new THREE.BufferGeometry());
    gr[0].setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gr[0].setIndex(idx);
  }
  const plot = gr[0], pp = plot.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), z = pp.getZ(i), r = Math.hypot(x, z);
    pp.setY(i, GROUND_Y + (r > 4.8 ? 0.12 * kit.noise3(x * 0.6, 0, z * 0.6) * Math.min(1, (r - 4.8) / 1.2) : 0));
  }
  plot.computeVertexNormals();
  const grass = kit.rgb('#2b3340'), grass2 = kit.rgb('#36423f'), earth = kit.rgb('#2a2430'), rimC = kit.rgb('#0a0914'), lit = kit.rgb('#4a5368');
  kit.colorize(plot, (x, y, z) => {
    const r = Math.hypot(x, z), n = kit.noise3(x * 0.9, 1.7, z * 0.9);
    let c = [0, 1, 2].map(k => grass[k] + (grass2[k] - grass[k]) * n);
    const near = r < 5.0 ? 1 : r < 5.8 ? (5.8 - r) / 0.8 : 0;                          // trodden earth by the kerb
    c = c.map((v, k) => v + (earth[k] - v) * near * 0.7);
    const moon = Math.max(0, (-x * 0.6 - z * 0.8) / r) * (r > 4.6 ? 0.45 : 0);           // moonlit side (behind-left)
    c = c.map((v, k) => v + (lit[k] - v) * moon * n);
    return c;                                // the fade into the horizon is in the shader (camera-relative)
  });
  const env = [plot];
  // headstones and pumpkins in the ring between the kerb and the rim
  const spots = [];
  for (let i = 0; i < 40 && spots.length < 22; i++) {
    const a = R(0, Math.PI * 2), d = R(5.0, 6.6);
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (Math.abs(x) < 4.9 && Math.abs(z) < 4.9) continue;
    if (spots.some(([u, v]) => Math.hypot(u - x, v - z) < 0.9)) continue;
    spots.push([x, z]);
  }
  spots.forEach(([x, z], i) => {
    if (i % 4 === 3) { const p = pumpkin(THREE, kit, R(0.12, 0.2), { seg: 12 }); p.rotateY(R(0, 6)); p.translate(x, GROUND_Y - 0.02, z); env.push(p); }
    else {
      const s = R(1.1, 1.7);
      const t = tombstone(THREE, kit, 0.24 * s, 0.34 * s, 0.07 * s, { cross: i % 5 === 0, tint: i % 2 ? '#7d7d8c' : '#6c6b7a' });
      t.rotateX(R(-0.2, 0.12)); t.rotateZ(R(-0.15, 0.15)); t.rotateY(Math.atan2(-x, -z) + R(-0.4, 0.4));
      t.translate(x, GROUND_Y - 0.04, z); env.push(t);
    }
  });
  // gnarled dead trees near the rim: near-black silhouettes that rise into the sky band
  const bark = kit.rgb('#0d0b14'), barkHi = kit.rgb('#1b1826');
  const branch = (out, p, dir, len, r, depth) => {
    const seg = kit.cylinder(r * 0.62, r, len, 5);
    seg.translate(0, len / 2, 0);
    seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    seg.translate(p.x, p.y, p.z); out.push(seg);
    const end = p.clone().addScaledVector(dir, len);
    if (depth <= 0) return;
    const kids = depth > 2 ? 2 : 2 + (rand() < 0.5 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const d = dir.clone().add(new THREE.Vector3(R(-1.0, 1.0), R(-0.25, 0.35), R(-1.0, 1.0))).normalize();
      branch(out, end, d, len * R(0.55, 0.78), r * 0.6, depth - 1);
    }
  };
  // on the flanks only, so they never stand between the locked cameras (either side) and the board
  for (const [a, d, h] of [[1.45, 6.5, 3.0], [1.95, 6.4, 2.3], [1.05, 6.3, 1.8], [-1.55, 6.4, 2.7], [-2.05, 6.6, 2.0], [-1.1, 6.2, 2.2]]) {
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    const segs = []; rng = Math.floor(a * 1000 + 7);
    branch(segs, new THREE.Vector3(x, GROUND_Y - 0.05, z), new THREE.Vector3(R(-0.25, 0.25), 1, R(-0.25, 0.25)).normalize(), h * 0.42, 0.13, 4);
    const t = kit.merge(segs); segs.forEach(q => q.dispose());
    kit.colorize(t, (px, py, pz) => (((px - x) * -0.6 + (pz - z) * -0.8) > 0.05 ? barkHi : bark));
    env.push(t);
  }
  const mesh = new THREE.Mesh(kit.merge(env), horizonMaterial(THREE));
  env.forEach(q => q.dispose());
  mesh.receiveShadow = false; mesh.castShadow = false; mesh.name = 'graveyard';
  root.add(mesh, skyBackdrop(THREE, kit), mist(THREE, kit), bats(THREE, kit), fireflies(THREE, kit));

  // lights: warm key (keeps the pieces' colours true), cool moon rim from behind-left, indigo sky fill
  const lights = new THREE.Group(); lights.name = 'lights';
  const hemi = new THREE.HemisphereLight('#c9c6ff', '#241c30', 0.55);
  const key = new THREE.DirectionalLight('#fff0dc', 2.0); key.position.set(-3.2, 11, 4.5); key.castShadow = true;
  const moonL = new THREE.DirectionalLight('#a8b8ff', 0.75); moonL.position.set(-7, 6, -12);
  lights.add(hemi, key, key.target, moonL);

  return {
    object: root, minPhi: 0.12, lights,
    background: new THREE.Color('#0e0c1b'),
    envScene: kit.studioEnvironment({ top: '#1a1726', horizon: '#3c3448', floor: '#0c0a10', warm: '#ffdcae', cool: '#c4ccff' }),
  };
}

export const overlayStyle = { lastMove: '#ff9a2a', select: '#ffc24a', hint: '#8cff52', hover: '#ffffff', dot: '#1d2a18' };
