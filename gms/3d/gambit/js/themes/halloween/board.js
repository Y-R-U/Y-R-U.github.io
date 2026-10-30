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
 * (Request to board: adopt this as kit.boardLooks.graveyard so contrast is tuned in one place.)
 */
export const LOOK = {
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
  const flameMesh = new THREE.Mesh(kit.merge(flames), kit.material({ color: '#ffd27a', emissive: '#ffb02a', emissiveIntensity: 2.2, roughness: 1 }));
  flames.forEach(q => q.dispose());
  flameMesh.name = 'flames';
  g.add(flameMesh);
  return g;
}

// ------------------------------------------------------------------ environment
/** Moonlit hill around the board (tilted views only), indigo night, moon, cool + warm lights. */
export function environment(THREE, kit) {
  const root = new THREE.Group(); root.name = 'halloween-env';
  rng = 101;
  // rolling ground: flat under the board, rising into a low hill behind it
  const ground = new THREE.PlaneGeometry(60, 60, 56, 56).rotateX(-Math.PI / 2);
  const gp = ground.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i), r = Math.hypot(x, z);
    const rise = Math.max(0, r - 6.5);
    let y = -0.42 + rise * rise * 0.035 * (1 + 0.6 * Math.sin(Math.atan2(x, z) * 2 + 1)) + 0.25 * noise2(x * 0.3, z * 0.3) * Math.min(1, rise);
    if (z < -6) y += (z + 6) * (z + 6) * 0.03;                      // the hill behind the board
    gp.setY(i, y);
  }
  ground.computeVertexNormals();
  const g0 = C(THREE, '#1c2a24'), g1 = C(THREE, '#2c3d2e'), dirt = C(THREE, '#2e2620');
  colorAll(kit, ground, (x, y, z) => {
    const n = noise2(x * 0.7, z * 0.7), r = Math.hypot(x, z);
    const t = Math.min(1, Math.max(0, n));
    const c = [g0[0] + (g1[0] - g0[0]) * t, g0[1] + (g1[1] - g0[1]) * t, g0[2] + (g1[2] - g0[2]) * t];
    const d = r < 5.6 ? 1 : r < 7 ? (7 - r) / 1.4 : 0;               // trodden earth around the plot
    return [c[0] + (dirt[0] - c[0]) * d, c[1] + (dirt[1] - c[1]) * d, c[2] + (dirt[2] - c[2]) * d];
  });
  const env = [ground];
  // scattered headstones and pumpkins around the plot
  const spots = [];
  for (let i = 0; i < 26; i++) {
    const a = R(0, Math.PI * 2), r = R(5.8, 13);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (Math.abs(x) < 6.2 && Math.abs(z) < 6.2) continue;
    spots.push([x, z, a]);
  }
  const groundY = (x, z) => { const r = Math.hypot(x, z), rise = Math.max(0, r - 6.5); let y = -0.42 + rise * rise * 0.035 * (1 + 0.6 * Math.sin(Math.atan2(x, z) * 2 + 1)) + 0.25 * noise2(x * 0.3, z * 0.3) * Math.min(1, rise); if (z < -6) y += (z + 6) * (z + 6) * 0.03; return y; };
  spots.forEach(([x, z], i) => {
    if (i % 3 === 2) { const p = pumpkin(THREE, kit, R(0.16, 0.3), { seg: 14 }); p.rotateY(R(0, 6)); p.translate(x, groundY(x, z) - 0.03, z); env.push(p); }
    else {
      const s = R(1.6, 2.6);
      const t = tombstone(THREE, kit, 0.24 * s, 0.34 * s, 0.07 * s, { cross: i % 5 === 0, tint: i % 2 ? '#8a857c' : '#77736d' });
      t.rotateX(R(-0.18, 0.12)); t.rotateZ(R(-0.12, 0.12)); t.rotateY(Math.atan2(-x, -z) + R(-0.4, 0.4));
      t.translate(x, groundY(x, z) - 0.05, z); env.push(t);
    }
  });
  // crooked bare trees
  const bark = C(THREE, '#241c1c');
  const branch = (out, p, dir, len, r, depth) => {
    const seg = kit.cylinder(r * 0.65, r, len, 5);
    seg.translate(0, len / 2, 0);
    seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    seg.translate(p.x, p.y, p.z); out.push(seg);
    const end = p.clone().addScaledVector(dir, len);
    if (depth <= 0) return;
    const kids = depth > 2 ? 2 : 2 + (rand() < 0.5 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const d = dir.clone().add(new THREE.Vector3(R(-0.9, 0.9), R(-0.1, 0.5), R(-0.9, 0.9))).normalize();
      branch(out, end, d, len * R(0.55, 0.8), r * 0.62, depth - 1);
    }
  };
  for (const [x, z, h] of [[-8.5, -9, 3.2], [9.5, -7.5, 2.6], [-11, 4, 2.4], [7, -12.5, 3.6]]) {
    const segs = []; rng = Math.floor(x * 100 + z);
    branch(segs, new THREE.Vector3(x, groundY(x, z) - 0.1, z), new THREE.Vector3(R(-0.2, 0.2), 1, R(-0.2, 0.2)).normalize(), h * 0.45, 0.16, 4);
    const t = kit.merge(segs); segs.forEach(q => q.dispose());
    colorAll(kit, t, () => bark); env.push(t);
  }
  const mesh = new THREE.Mesh(kit.merge(env), kit.material({ color: '#ffffff', roughness: 0.9, metalness: 0, envMapIntensity: 0.4 }));
  env.forEach(q => q.dispose());
  mesh.receiveShadow = false; mesh.castShadow = false; mesh.name = 'graveyard';
  root.add(mesh);
  // low fog cards drifting over the hill (soft alpha sprites, one material)
  const fogTex = kit.canvasTexture(128, 64, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(200,205,235,0.55)'); gr.addColorStop(1, 'rgba(200,205,235,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  const fogMat = new THREE.SpriteMaterial({ map: fogTex, transparent: true, depthWrite: false, opacity: 0.5, fog: false });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R(-0.2, 0.2), r = R(7.5, 12);
    const s = new THREE.Sprite(fogMat); s.scale.set(R(7, 11), R(1.3, 2), 1);
    s.position.set(Math.sin(a) * r, groundY(Math.sin(a) * r, Math.cos(a) * r) + 0.4, Math.cos(a) * r);
    root.add(s);
  }
  // the moon
  const moonTex = kit.canvasTexture(256, 256, (c, w) => {
    const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,250,225,1)'); gr.addColorStop(0.32, 'rgba(250,244,215,1)'); gr.addColorStop(0.36, 'rgba(220,225,255,0.35)'); gr.addColorStop(1, 'rgba(160,170,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, w);
    c.fillStyle = 'rgba(190,180,160,0.35)';
    for (const [x, y, r] of [[0.44, 0.42, 0.05], [0.56, 0.55, 0.035], [0.47, 0.6, 0.025], [0.58, 0.4, 0.02]]) { c.beginPath(); c.arc(x * w, y * w, r * w, 0, Math.PI * 2); c.fill(); }
  });
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false }));
  moon.scale.set(9, 9, 1); moon.position.set(-14, 13, -30);
  root.add(moon);

  // lights: warm key (keeps the pieces' colours true), cool moon rim, indigo sky fill
  const lights = new THREE.Group(); lights.name = 'lights';
  const hemi = new THREE.HemisphereLight('#d9d6ff', '#2a2230', 0.6);
  const key = new THREE.DirectionalLight('#fff0dc', 2.1); key.position.set(-3.2, 11, 4.5); key.castShadow = true;
  const moonL = new THREE.DirectionalLight('#9fb2ff', 0.55); moonL.position.set(-8, 7, -12);
  lights.add(hemi, key, key.target, moonL);

  return {
    object: root, minPhi: 0.12, lights,
    background: new THREE.Color('#120f20'),
    fog: new THREE.Fog('#161227', 22, 60),
    envScene: kit.studioEnvironment({ top: '#1a1726', horizon: '#3c3448', floor: '#0c0a10', warm: '#ffdcae', cool: '#c4ccff' }),
  };
}

export const overlayStyle = { lastMove: '#ff9a2a', select: '#ffc24a', hint: '#8cff52', hover: '#ffffff', dot: '#1d2a18' };
