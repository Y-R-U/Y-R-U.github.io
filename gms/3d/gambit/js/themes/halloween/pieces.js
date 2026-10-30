// Halloween pieces — "Harvest" (white: bone + pumpkin orange, amber candle glow) vs
// "Midnight" (black: violet-black + ghost-green glow). Cute-spooky, not gory.
// Two materials per piece: a matte body (vertex coloured, fresnel rim) and an emissive
// glow (lantern faces, crypt windows). Unbuilt types fall back to Classic (see index.js).
//
// Overhead read: pawn = small ribbed pumpkin ball with a stem and a leaf collar;
// rook = ring of crooked battlements around a dark well.

/** Per-side palette. Everything is vertex colour on a white material. */
export const SIDES = {
  w: {
    cap: '#f6eedc', stone: '#eadfc4', stoneDark: '#b4a587', mortar: '#7d6f57', moss: '#7f8c3a', well: '#140c06',
    cloak: '#efe4c8', cloakShade: '#c9b894', trim: '#ee7a16',
    pumpkin: '#f47a10', crease: '#a3400a', pumpkinTop: '#ffa040',
    stem: '#6b7d2c', stemTop: '#3f4a18', leaf: '#5d9a2c', wood: '#5a3418',
    glow: '#ffb02a', outline: '#3a1604',
    // knight + bishop (round 2)
    bone: '#efe5ca', boneTop: '#fbf4e2', boneShade: '#a8967a', socket: '#2a1306',
    flame: ['#d4440a', '#f47a10', '#ffc24a'],
    hat: '#f07812', hatShade: '#a8460a', hatEdge: '#ffad55', band: '#3a1a0a',
    skin: '#f2d6b8', cheek: '#f0907a', hair: '#7a2e12', straw: '#e0b04e', strawDark: '#9a6a1e', stick: '#4a2810',
    // queen + king (round 3)
    gown: '#e8700f', gownShade: '#9a3c08', cape: '#ece1c8', capeShade: '#ad9c7c', lining: '#f27812', pale: '#f8ebe0', lips: '#c2363e', vampHair: '#7e2c10',
    crown: '#f4c868', crownShade: '#a8782a', crownTip: '#fff2c0',
    royal: '#a8420e', royalShade: '#5e2206', ermine: '#fbf4e2', ermineSpot: '#2a1406', bat: '#4a2208',
    rim: { mode: 'darken', color: '#2a1406', strength: 0.5, power: 2.3 },
  },
  b: {
    cap: '#9a86bc', stone: '#5a4a72', stoneDark: '#3a2f4c', mortar: '#1d1626', moss: '#34503c', well: '#07040a',
    cloak: '#2c2338', cloakShade: '#1a1422', trim: '#57d65a',
    pumpkin: '#7446b4', crease: '#2c1450', pumpkinTop: '#9a6ad6',
    stem: '#2f5a3a', stemTop: '#18301e', leaf: '#3aa04e', wood: '#1e1626',
    glow: '#8cff52', outline: '#0c0614',
    bone: '#7e6ba2', boneTop: '#b4a2d6', boneShade: '#3a2f4c', socket: '#0a0510',
    flame: ['#1d7a36', '#4fd256', '#c8ff96'],
    hat: '#6e42ae', hatShade: '#38205e', hatEdge: '#a07ad8', band: '#4fd256',
    skin: '#a6d898', cheek: '#d08ab0', hair: '#231a30', straw: '#a8b860', strawDark: '#5a6a2a', stick: '#140e1c',
    gown: '#2c2338', gownShade: '#1a1422', cape: '#6e42ae', capeShade: '#38205e', lining: '#4cc45c', pale: '#dccdf2', lips: '#8a2a8e', vampHair: '#3a2850',
    crown: '#9fe89a', crownShade: '#3c8a4a', crownTip: '#e6ffdc',
    royal: '#5a3496', royalShade: '#26143e', ermine: '#cdbdea', ermineSpot: '#1a1222', bat: '#3a2260',
    rim: { mode: 'glow', color: '#7dff86', strength: 0.16, power: 2.8 },
  },
};

const mats = (kit, color) => {
  const s = SIDES[color];
  return {
    body: kit.material({ color: '#ffffff', roughness: 0.62, metalness: 0, rim: s.rim, envMapIntensity: 0.7 }),
    glow: kit.material({ color: s.glow, emissive: s.glow, emissiveIntensity: 1.5, roughness: 0.9,
      flicker: color === 'w' ? { mode: 'candle', amount: 0.28 } : { mode: 'pulse', amount: 0.3, speed: 0.7 } }),   // board-2: shared idle flicker
  };
};

// ------------------------------------------------------------------ small utils
let THREE_;
const col = hex => { const c = new THREE_.Color(hex); return [c.r, c.g, c.b]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const sat = t => Math.min(1, Math.max(0, t));
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash(...n) { let h = 2166136261; for (const v of n) { h ^= Math.floor(v * 1000) | 0; h = Math.imul(h, 16777619); } return ((h >>> 0) % 10007) / 10007; }
/** cheap smooth-ish 3D value noise in [0,1] */
function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi, f = t => t * t * (3 - 2 * t);
  let s = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    const w = (a ? f(xf) : 1 - f(xf)) * (b ? f(yf) : 1 - f(yf)) * (c ? f(zf) : 1 - f(zf));
    s += w * hash(xi + a, yi + b, zi + c);
  }
  return s;
}
/** Set vertex colours absolutely: fn(x,y,z) -> [r,g,b] | null (keep). */
function colorize(kit, g, fn) {
  kit.ensureColor(g);
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    if (v) c.setXYZ(i, v[0], v[1], v[2]);
  }
  return g;
}
/** Move vertices: fn(x,y,z) -> [x,y,z]. Recomputes normals. */
function deform(g, fn) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, v[0], v[1], v[2]); }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
/**
 * Wrap a thin extruded 2D shape (local u right, v up, extrude depth d along z, front cap +z)
 * onto a surface of revolution r = R(theta, y), centred at angle `theta` (lathe convention:
 * x = r sin, z = r cos). `lift` = how proud the front face sits; the back is buried.
 */
function wrap(kit, g, { theta, y0 = 0, R, lift = 0.003, d }) {
  return deform(g, (u, v, zl) => {
    const y = y0 + v;
    let a = theta + u / R(theta, y);
    a = theta + u / R(a, y);
    const r = R(a, y) + lift - (d / 2 - zl) * 1.2;
    return [r * Math.sin(a), y, r * Math.cos(a)];
  });
}
const shape = (pts) => { const s = new THREE_.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); return s; };
/** Pointed (gothic) arch shape, base at v=0. */
function archShape(w, h, spring = 0.55) {
  const s = new THREE_.Shape(), hw = w / 2, hs = h * spring;
  s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, hs);
  s.quadraticCurveTo(hw, h * 0.88, 0, h);
  s.quadraticCurveTo(-hw, h * 0.88, -hw, hs);
  s.lineTo(-hw, 0);
  return s;
}

// ------------------------------------------------------------------------ PAWN
/**
 * Jack-o'-lantern imp: a little hooded bone (or midnight) cloak with a scalloped hem, a
 * leafy collar and a ribbed pumpkin head with a curly stem. The carved face glows and
 * looks toward -z (the board turns it to face the player's left, like the knight).
 */
export function pawn(THREE, kit, { color }) {
  THREE_ = THREE;
  const s = SIDES[color], M = mats(kit, color);
  const parts = [];

  // body: rounded foot + flared cloak to the neck
  const p = kit.profile()
    .pt(0, 0).pt(0.245, 0).arc(0.245, 0.022, 0.022, -90, 0, 3).pt(0.267, 0.034)
    .arc(0.25, 0.034, 0.017, 0, 90, 3).pt(0.215, 0.054)
    .pt(0.205, 0.062).bez(0.212, 0.09, 0.2, 0.115, 3)     // cloak hem flare
    .bez(0.13, 0.2, 0.105, 0.30, 6)
    .bez(0.098, 0.335, 0.075, 0.36, 3).pt(0, 0.37);
  const body = kit.lathe(p.points(), { segments: 36 });
  // scalloped hem + soft vertical folds
  deform(body, (x, y, z) => {
    const r = Math.hypot(x, z); if (r < 1e-4) return [x, y, z];
    const a = Math.atan2(x, z);
    const hem = smooth(0.13, 0.07, y) * smooth(0.05, 0.07, y);
    const fold = smooth(0.06, 0.12, y) * smooth(0.34, 0.2, y);
    const k = 1 + hem * 0.07 * Math.abs(Math.sin(a * 4.5)) + fold * 0.045 * Math.sin(a * 7);
    return [x * k, y, z * k];
  });
  const cl = col(s.cloak), cs = col(s.cloakShade), tr = col(s.trim), st = col(s.stoneDark);
  colorize(kit, body, (x, y, z) => {
    const a = Math.atan2(x, z);
    if (y < 0.058) return mix(st, mul(st, 0.6), smooth(0.03, 0.0, y));     // base plinth
    const fold = 0.5 + 0.5 * Math.sin(a * 7);
    let c = mix(cl, cs, 0.15 + 0.5 * (1 - fold) * smooth(0.06, 0.2, y) + 0.35 * smooth(0.14, 0.06, y));
    if (y > 0.062 && y < 0.1) c = mix(c, tr, 0.85);                          // hem trim
    return c;
  });
  parts.push({ geom: body, mat: M.body });

  // leafy collar: five pointed leaves that peek out around the head from above
  const leafShape = shape([[0, 0], [0.03, 0.03], [0.034, 0.075], [0.016, 0.105], [0, 0.125], [-0.016, 0.105], [-0.034, 0.075], [-0.03, 0.03]].map(([u, v]) => [u * 1.1, v * 1.2]));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const leaf = kit.extrude(leafShape, { depth: 0.012, bevel: 0.004, bevelSegments: 1, curveSegments: 1 });
    // curl the tip down a little, then lay it outward and drooping
    deform(leaf, (x, y, z) => [x * (1 - y * 1.5), y, z + y * y * 3.0]);     // narrow + curl the tip down
    kit.place(leaf, { rx: 1.62 });                                            // lay it out (+z), drooping
    kit.place(leaf, { ry: a, x: Math.sin(a) * 0.05, z: Math.cos(a) * 0.05, y: 0.36 });
    const lf = col(s.leaf);
    colorize(kit, leaf, (x, y, z) => mix(mul(lf, 0.62), lf, smooth(0.07, 0.17, Math.hypot(x, z))));
    parts.push({ geom: leaf, mat: M.body });
  }

  // stubby sleeved arms with little dark mitts, held slightly forward (-z)
  for (const sx of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.03, 0.075, 3, 8);
    colorize(kit, arm, (x, y) => mix(cl, cs, smooth(0.04, -0.06, y)));
    const mitt = kit.place(kit.sphere(0.03, 8, 6), { y: -0.07 });
    colorize(kit, mitt, () => col(s.outline));
    const g = kit.merge([arm, mitt]); arm.dispose(); mitt.dispose();
    parts.push({ geom: kit.place(g, { rz: sx * 0.75, rx: 0.45, x: sx * 0.115, y: 0.27, z: -0.03 }), mat: M.body });
  }

  // pumpkin head
  const cy = 0.46, A = 0.158, B = 0.122;
  const lobe = a => 0.9 + 0.1 * Math.pow(Math.abs(Math.cos(4 * a)), 0.55);
  const ell = y => A * Math.sqrt(Math.max(0, 1 - ((y - cy) / B) ** 2));
  const R = (a, y) => ell(y) * lobe(a);
  const hp = kit.profile().pt(0, cy - B + 0.022);
  for (let i = 0; i <= 14; i++) { const f = (-82 + (164 * i) / 14) * Math.PI / 180; hp.pt(A * Math.cos(f), cy + B * Math.sin(f)); }
  hp.pt(0.012, cy + B - 0.02).pt(0, cy + B - 0.028);
  const head = kit.lathe(hp.points(), { segments: 48 });
  deform(head, (x, y, z) => { const k = lobe(Math.atan2(x, z)); return [x * k, y, z * k]; });
  const pk = col(s.pumpkin), cr = col(s.crease), pt = col(s.pumpkinTop);
  colorize(kit, head, (x, y, z) => {
    const a = Math.atan2(x, z), crease = Math.pow(1 - Math.abs(Math.cos(4 * a)), 2.2);
    const t = (y - cy) / B;
    let c = mix(pk, pt, smooth(0.1, 0.8, t) * 0.55 * (1 - crease));
    c = mix(c, cr, Math.min(0.85, crease * 0.9 + smooth(0.75, 1.0, t) * 0.35));
    return mul(c, 0.78 + 0.22 * smooth(-1, 0.1, t));                          // under-chin shade
  });
  parts.push({ geom: head, mat: M.body });

  // carved face (glow) with a dark burnt rim, wrapped onto the front lobe (-z)
  const eye = [[-0.031, 0], [0.031, 0], [0.005, 0.055]];
  const face = [
    { pts: eye.map(([u, v]) => [u - 0.056, v + 0.008]) },
    { pts: eye.map(([u, v]) => [-u + 0.056, v + 0.008]) },
    { pts: [[-0.011, -0.012], [0.011, -0.012], [0, 0.006]] },
    { pts: [[-0.085, -0.03], [-0.05, -0.044], [-0.035, -0.032], [-0.022, -0.046], [0.022, -0.046], [0.035, -0.032], [0.05, -0.044], [0.085, -0.03],
            [0.06, -0.07], [0.02, -0.084], [0.012, -0.066], [-0.012, -0.066], [-0.02, -0.084], [-0.06, -0.07]] },
  ];
  for (const f of face) {
    for (const [scale, lift, mat, tintc] of [[1.0, 0.0035, M.glow, null], [1.32, 0.0015, M.body, s.outline]]) {
      const cx = f.pts.reduce((m, q) => m + q[0], 0) / f.pts.length, cyy = f.pts.reduce((m, q) => m + q[1], 0) / f.pts.length;
      const g = kit.extrude(shape(f.pts.map(([u, v]) => [cx + (u - cx) * scale, cyy + (v - cyy) * scale])), { depth: 0.02, bevel: 0, curveSegments: 1 });
      // front lobe is centred on theta = PI (-z); refine so long triangles hug the curve
      const w = wrap(kit, refine(g, 0.022), { theta: Math.PI, y0: cy, R, lift, d: 0.02 });
      if (tintc) colorize(kit, w, () => col(tintc));
      parts.push({ geom: w, mat });
    }
  }

  // curly stem + a little tendril
  const stem = kit.cylinder(0.013, 0.024, 0.085, 9);
  stem.translate(0, 0.0425, 0);
  deform(stem, (x, y, z) => [x + 3.2 * y * y, y, z]);
  const sg = col(s.stem), stt = col(s.stemTop);
  colorize(kit, stem, (x, y) => mix(sg, stt, smooth(0.02, 0.085, y)));
  parts.push({ geom: kit.place(stem, { y: cy + B - 0.03, ry: 0.6 }), mat: M.body });
  const curl = kit.tint(new THREE.TorusGeometry(0.026, 0.0055, 5, 14, Math.PI * 1.5), s.stem);
  parts.push({ geom: kit.place(curl, { rx: Math.PI / 2 - 0.35, x: -0.03, y: cy + B - 0.012, z: 0.02 }), mat: M.body });

  return kit.piece(parts);
}

/**
 * Longest-edge bisection until every edge is shorter than L, so a flat extruded decal can
 * be wrapped onto a curved surface without its middle sinking in. Returns a new
 * position-only, non-indexed geometry (normals come from wrap()).
 */
function refine(g, L) {
  const src = (g.index ? g.toNonIndexed() : g).attributes.position, out = [];
  const V = i => [src.getX(i), src.getY(i), src.getZ(i)];
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const split = (a, b, c, depth) => {
    const ab = d2(a, b), bc = d2(b, c), ca = d2(c, a), m = Math.max(ab, bc, ca);
    if (m < L * L || depth > 8) { out.push(...a, ...b, ...c); return; }
    if (m === ab) { const p = mid(a, b); split(a, p, c, depth + 1); split(p, b, c, depth + 1); }
    else if (m === bc) { const p = mid(b, c); split(a, b, p, depth + 1); split(a, p, c, depth + 1); }
    else { const p = mid(c, a); split(a, b, p, depth + 1); split(p, b, c, depth + 1); }
  };
  for (let i = 0; i < src.count; i += 3) split(V(i), V(i + 1), V(i + 2), 0);
  g.dispose();
  const r = new THREE_.BufferGeometry();
  r.setAttribute('position', new THREE_.Float32BufferAttribute(out, 3));
  return r;
}

// ------------------------------------------------------------------------ ROOK
/**
 * Haunted crypt tower: coursed stone with mossy footings, crooked battlements around a
 * dark well, a studded crypt door and pointed windows lit from inside.
 */
export function rook(THREE, kit, { color }) {
  THREE_ = THREE;
  const s = SIDES[color], M = mats(kit, color);
  const parts = [];
  const Y0 = 0.105, Y1 = 0.545, rT = y => 0.272 - (y - Y0) * 0.055;   // gently tapering tower
  const p = kit.profile()
    .pt(0, 0).pt(0.335, 0).arc(0.335, 0.02, 0.02, -90, 0, 3).pt(0.355, 0.045)
    .arc(0.34, 0.045, 0.015, 0, 90, 3).pt(0.305, 0.064).pt(0.305, 0.088).pt(0.29, 0.096).pt(0.278, Y0 - 0.002);
  const courses = 8, ch = (Y1 - Y0) / courses, inset = 0.009;
  p.pt(rT(Y0) - inset, Y0).pt(rT(Y1) - inset, Y1);                          // mortar core behind the blocks
  const rP = 0.305, rW = 0.212, top = 0.655;
  p.pt(rT(Y1) - 0.004, Y1 + 0.004)
    .bez(rP - 0.01, Y1 + 0.01, rP, Y1 + 0.05, 4)                           // corbelled flare
    .pt(rP, top - 0.012).arc(rP - 0.01, top - 0.012, 0.01, 0, 90, 2)
    .pt(rW + 0.008, top).pt(rW, top - 0.01)
    .pt(rW, 0.5).pt(0.12, 0.47).pt(0, 0.465);                              // the dark well
  const tower = kit.lathe(p.points(), { segments: 28 });
  const stn = col(s.stone), sd = col(s.stoneDark), mo = col(s.mortar), ms = col(s.moss), wl = col(s.well);
  const moss = (x, y, z) => smooth(0.3, 0.1, y) * smooth(0.45, 0.75, noise(x * 9 + 3, y * 7, z * 9) + 0.25 * Math.cos(Math.atan2(x, z) - 0.8));
  colorize(kit, tower, (x, y, z) => {
    const r = Math.hypot(x, z);
    if (r < rW + 0.002 && y > 0.45) return mix(wl, mul(sd, 0.45), smooth(0.56, top, y) * 0.6);   // well
    if (y < Y0 - 0.001) return mix(mix(mul(sd, 0.7), sd, smooth(0.0, 0.06, y)), ms, moss(x, y, z) * 0.6); // plinth
    if (y < Y1 + 0.001) return mo;                                                                    // mortar
    if (y > top - 0.013 && r < rP - 0.004) return mul(sd, 0.5);                                      // crenel floor: dark gaps
    if (y > top - 0.006) return mix(col(s.cap), stn, 0.35);                                       // parapet top
    return mix(stn, sd, 0.25 + 0.3 * noise(x * 12, y * 12, z * 12) + 0.25 * smooth(0.62, 0.56, y));
  });
  parts.push({ geom: tower, mat: M.body });

  // coursed stone blocks (real geometry, so joints read at an angle), staggered per course
  const nb = 8, bspan = (Math.PI * 2) / nb, g = 0.0045, bv = 0.006;
  for (let k = 0; k < courses; k++) {
    const y0 = Y0 + k * ch + g, y1 = Y0 + (k + 1) * ch - g, ri = rT(y0) - inset - 0.004;
    for (let j = 0; j < nb; j++) {
      const ro = rT((y0 + y1) / 2) - 0.0035 * hash(k, j, 3);
      const sec = [[ri, y0], [ro - bv, y0], [ro, y0 + bv], [ro, y1 - bv], [ro - bv, y1], [ri, y1]].map(([r, y]) => new THREE.Vector2(r, y));
      const r0 = (ro - 0.003), ga = g * 2 / r0;
      const ph = j * bspan + (k % 2) * bspan * 0.5 + ga / 2 + (hash(k, j, 9) - 0.5) * 0.05;
      const blk = kit.latheSegment(sec, ph, bspan - ga, 2);
      const base = mix(stn, sd, 0.08 + 0.42 * hash(k, j));
      colorize(kit, blk, (x, y, z) => {
        const r = Math.hypot(x, z);
        let c = mix(base, sd, 0.3 * noise(x * 18, y * 18, z * 18));
        if (r < ro - bv * 0.5) c = mul(c, 0.7);                                 // joint faces darker
        c = mix(c, ms, moss(x, y, z) * 0.85);
        return mul(c, 0.85 + 0.15 * smooth(0.12, 0.3, y));                      // ground AO
      });
      parts.push({ geom: blk, mat: M.body });
    }
  }

  // crooked battlements: six merlons, uneven heights, each leaning a touch outward
  const n = 6, span = (Math.PI * 2) / n;
  const hts = [0.108, 0.088, 0.115, 0.095, 0.112, 0.082], lean = [0.08, -0.05, 0.12, 0.03, -0.07, 0.1];
  for (let i = 0; i < n; i++) {
    const h = hts[i];
    const sec = [[rW, top - 0.01], [rP, top - 0.01], [rP, top + h - 0.012], [rP - 0.012, top + h], [rW + 0.012, top + h], [rW, top + h - 0.012]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const ph = i * span + span * 0.18, pl = span * 0.64;
    const m = kit.latheSegment(sec, ph, pl, 5);
    const c = ph + pl / 2, axis = new THREE.Vector3(Math.cos(c), 0, -Math.sin(c));
    const piv = new THREE.Vector3(Math.sin(c) * 0.26, top, Math.cos(c) * 0.26);
    m.translate(-piv.x, -piv.y, -piv.z);
    m.applyMatrix4(new THREE.Matrix4().makeRotationAxis(axis, lean[i] * 0.6));
    m.applyMatrix4(new THREE.Matrix4().makeRotationY(lean[i] * 0.12));
    m.translate(piv.x, piv.y, piv.z);
    colorize(kit, m, (x, y, z) => {
      const rr = Math.hypot(x, z);
      let cc = mix(stn, sd, 0.15 + 0.35 * hash(i, 7) + 0.25 * noise(x * 16, y * 16, z * 16));
      if (rr < rW + 0.01) cc = mul(cc, 0.62);                                   // inner faces darker -> ring reads
      else if (y > top + h - 0.004) cc = mix(cc, col(s.cap), 0.8);              // light caps: the ring reads on dark squares
      return cc;
    });
    parts.push({ geom: m, mat: M.body });
  }

  // openings: door at the front (-z), windows to the sides and over the door
  const Rw = (a, y) => rT(Math.min(Math.max(y, Y0), Y1));
  const wood = col(s.wood), frame = mul(sd, 0.7);
  const opening = (theta, y0, w, h, kind) => {
    const d = 0.02;
    // stone surround (darker), then the opening itself
    let sur = kit.extrude(archShape(w + 0.03, h + 0.024), { depth: d, bevel: 0, curveSegments: 5 });
    sur.translate(0, -0.012, 0);
    wrap(kit, sur = refine(sur, 0.05), { theta, y0, R: Rw, lift: 0.004, d });
    colorize(kit, sur, (x, y, z) => mix(frame, mo, 0.3 * noise(x * 30, y * 30, z * 30)));
    parts.push({ geom: sur, mat: M.body });
    const o = refine(kit.extrude(archShape(w, h), { depth: d, bevel: 0, curveSegments: 5 }), 0.05);
    wrap(kit, o, { theta, y0, R: Rw, lift: 0.0075, d });
    if (kind === 'door') {
      colorize(kit, o, (x, y, z) => mul(wood, 0.7 + 0.45 * noise(x * 40, y * 6, z * 40)));
      parts.push({ geom: o, mat: M.body });
      // a small barred grille in the door, lit from inside
      const gr = kit.extrude(archShape(0.034, 0.042, 0.4), { depth: d, bevel: 0, curveSegments: 4 });
      wrap(kit, gr, { theta, y0: y0 + 0.07, R: Rw, lift: 0.011, d });
      parts.push({ geom: gr, mat: M.glow });
      // iron ring handle
      const ring = kit.tint(new THREE.TorusGeometry(0.011, 0.0028, 4, 10), s.outline);
      const ra = theta + 0.05, rr = Rw(0, y0 + 0.05) + 0.014;
      parts.push({ geom: kit.place(ring, { x: Math.sin(ra) * rr, y: y0 + 0.05, z: Math.cos(ra) * rr, ry: ra }), mat: M.body });
    } else {
      parts.push({ geom: o, mat: M.glow });
      // mullion + transom bars (dark)
      for (const [bw, bh, by] of [[0.009, h * 0.86, 0], [w, 0.008, h * 0.45]]) {
        const bar = kit.extrude(shape([[-bw / 2, 0], [bw / 2, 0], [bw / 2, bh], [-bw / 2, bh]]), { depth: d, bevel: 0, curveSegments: 1 });
        wrap(kit, bar, { theta, y0: y0 + by, R: Rw, lift: 0.0105, d });
        colorize(kit, bar, () => col(s.outline));
        parts.push({ geom: bar, mat: M.body });
      }
    }
  };
  opening(Math.PI, Y0 + 0.002, 0.1, 0.165, 'door');
  opening(Math.PI, 0.36, 0.058, 0.115, 'win');
  opening(Math.PI + 2.15, 0.25, 0.07, 0.14, 'win');
  opening(Math.PI - 2.15, 0.3, 0.07, 0.14, 'win');
  opening(0.0, 0.38, 0.055, 0.1, 'win');

  return kit.piece(parts);
}

// ------------------------------------------------------------- round 2 helpers
/** Smooth (monotone-ish Hermite) curve through knots [[u, v], ...]. */
const knots = pts => u => {
  const n = pts.length; let i = 1;
  while (i < n - 1 && u > pts[i][0]) i++;
  const p0 = pts[Math.max(0, i - 2)], p1 = pts[i - 1], p2 = pts[i], p3 = pts[Math.min(n - 1, i + 1)];
  const h = p2[0] - p1[0], t = sat((u - p1[0]) / h);
  const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0] || 1) * h, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0] || 1) * h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
};
const qbez = (a, c, b) => t => [0, 1].map(k => (1 - t) * (1 - t) * a[k] + 2 * (1 - t) * t * c[k] + t * t * b[k]);
/**
 * Loft an elliptical tube along a spine in the y-z plane (mirror-symmetric in x).
 * spine(u) -> [y, z] for u in 0..1; sec(u, phi) -> [a, b]: half-width along x and half-height
 * along the in-plane normal (phi = 0 is +x, PI/2 is the "top" side). Ends get a fan cap.
 * The spine should run toward -z so the normal points up. color(u, phi) -> [r,g,b].
 */
function loft(spine, sec, { rings = 32, segs = 24, color } = {}) {
  const pos = [], cols = [], idx = [];
  const frame = u => {
    const [y, z] = spine(u), e = 1e-3, a = spine(Math.max(0, u - e)), b = spine(Math.min(1, u + e));
    let ty = b[0] - a[0], tz = b[1] - a[1]; const L = Math.hypot(ty, tz) || 1; ty /= L; tz /= L;
    return { y, z, ny: -tz, nz: ty };
  };
  for (let i = 0; i <= rings; i++) {
    const u = i / rings, f = frame(u);
    for (let j = 0; j < segs; j++) {
      const ph = (j / segs) * Math.PI * 2, [a, b] = sec(u, ph), o = b * Math.sin(ph);
      pos.push(a * Math.cos(ph), f.y + f.ny * o, f.z + f.nz * o);
      cols.push(...(color ? color(u, ph) : [1, 1, 1]));
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * segs + j, b = (i + 1) * segs + j, c = i * segs + (j + 1) % segs, d = (i + 1) * segs + (j + 1) % segs;
    idx.push(a, b, c, c, b, d);
  }
  for (const [ring, u, flip] of [[0, 0, false], [rings, 1, true]]) {
    const f = frame(u), ci = pos.length / 3;
    pos.push(0, f.y, f.z); cols.push(...(color ? color(u, Math.PI / 2) : [1, 1, 1]));
    for (let j = 0; j < segs; j++) {
      const a = ring * segs + j, b = ring * segs + (j + 1) % segs;
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  }
  const g = new THREE_.BufferGeometry();
  g.setAttribute('position', new THREE_.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE_.Float32BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  g.userData.frame = frame;
  return g;
}
/** Orient a +Y-authored geometry along dir (unit Vector3) and move it to p. */
function alongDir(g, dir, p) {
  const q = new THREE_.Quaternion().setFromUnitVectors(new THREE_.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q); g.translate(p.x, p.y, p.z);
  return g;
}
/**
 * A ghost-flame tongue, authored along +y from the origin with its tip curling toward -z.
 * Vertex colours run base -> mid -> tip through the side's flame ramp.
 */
function flameTongue(kit, s, { len = 0.16, rad = 0.035, curl = 0.35, flat = 0.6, wob = 0, segs = 7, rings = 9 }) {
  const p = kit.profile().pt(0, -rad * 0.4);
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    const r = t < 0.22 ? rad * Math.sin((t / 0.22) * Math.PI / 2 + 0.25) : rad * Math.pow(1 - (t - 0.22) / 0.78, 1.25);
    p.pt(Math.max(i === rings ? 0 : 0.002, r), t * len);
  }
  const g = kit.lathe(p.points(), { segments: segs });
  deform(g, (x, y, z) => {
    const t = sat(y / len);
    return [x + Math.sin(t * Math.PI * 2.2 + wob) * rad * 0.7 * t, y, z * flat - curl * len * t * t * t * 1.4 + Math.sin(t * Math.PI) * rad * 0.4];
  });
  const [f0, f1, f2] = s.flame.map(col);
  colorize(kit, g, (x, y) => { const t = sat(y / len); return t < 0.5 ? mix(f0, f1, t / 0.5) : mix(f1, f2, (t - 0.5) / 0.5); });
  return g;
}
/** Low graveyard plinth shared by the knight and bishop (matches the pawn's base). */
function plinth(kit, s, R = 0.31, top = 0.06) {
  const p = kit.profile()
    .pt(0, 0).pt(R - 0.022, 0).arc(R - 0.022, 0.022, 0.022, -90, 0, 3).pt(R, 0.034)
    .arc(R - 0.017, 0.034, 0.017, 0, 90, 3).pt(R - 0.05, 0.054).pt(R - 0.06, top).pt(0, top);
  const g = kit.lathe(p.points(), { segments: 30 });
  const st = col(s.stoneDark), tr = col(s.trim);
  colorize(kit, g, (x, y, z) => {
    const r = Math.hypot(x, z);
    if (y > 0.044 && r > R - 0.045) return mix(st, tr, 0.85);
    return mix(mul(st, 0.62), st, smooth(0.0, 0.04, y));
  });
  return g;
}

// ---------------------------------------------------------------------- KNIGHT
/**
 * Nightmare: a cute skeletal horse skull (big glowing eye sockets, buck teeth, a slightly
 * open jaw) on a chunky stack of vertebrae, with a ghost-flame mane streaming back.
 * Authored with the muzzle toward -z. From above: a long bone head pointing sideways,
 * two ears, and a flame-coloured mane (orange / green) trailing behind.
 */
export function knight(THREE, kit, { color }) {
  THREE_ = THREE;
  const s = SIDES[color], M = mats(kit, color), parts = [];
  const bone = col(s.bone), boneTop = col(s.boneTop), shade = col(s.boneShade), sock = col(s.socket);

  // plinth with a low grave-dirt mound
  parts.push({ geom: plinth(kit, s, 0.32), mat: M.body });
  const mound = kit.lathe(kit.profile().pt(0.27, 0.058).bez(0.22, 0.12, 0.08, 0.14, 4).pt(0, 0.145).points(), { segments: 24 });
  const dirt = color === 'w' ? mul(col(s.stoneDark), 0.78) : col(s.stone), mossC = col(s.moss);
  colorize(kit, mound, (x, y, z) => mix(mix(mul(dirt, 0.8), dirt, noise(x * 20, y * 20, z * 20)), mossC, (color === 'w' ? 0.15 : 0.35) * smooth(0.45, 0.7, noise(x * 9 + 5, 0, z * 9))));
  parts.push({ geom: mound, mat: M.body });

  // --- skull (upper)
  const spine = qbez([0.87, 0.115], [0.87, -0.06], [0.63, -0.32]);
  const A = knots([[0, 0.06], [0.06, 0.098], [0.16, 0.116], [0.3, 0.12], [0.46, 0.096], [0.66, 0.074], [0.84, 0.068], [0.94, 0.074], [1, 0.05]]);
  const B = knots([[0, 0.06], [0.06, 0.096], [0.18, 0.118], [0.32, 0.112], [0.5, 0.09], [0.7, 0.072], [0.88, 0.066], [0.96, 0.056], [1, 0.035]]);
  const L = 0.5;
  const ends = u => Math.sqrt(sat(u / 0.05)) * Math.sqrt(sat((1 - u) / 0.035));
  // dents: eye sockets (big, cute), nostrils; a bony brow rim around each socket
  const eyeU = 0.3, eyePh = 0.5, eyeR = 0.056;
  const dents = [
    { u: eyeU, ph: eyePh, r: eyeR, d: 0.34, rim: 0.09 }, { u: eyeU, ph: Math.PI - eyePh, r: eyeR, d: 0.34, rim: 0.09 },
    { u: 0.935, ph: Math.PI / 2 - 0.62, r: 0.02, d: 0.28, rim: 0.05 }, { u: 0.935, ph: Math.PI / 2 + 0.62, r: 0.02, d: 0.28, rim: 0.05 },
  ];
  const dentAt = (u, ph) => {
    let m = 1, dark = 0;
    const rr = (A(u) + B(u)) / 2;
    for (const t of dents) {
      let dp = Math.abs(ph - t.ph); dp = Math.min(dp, Math.PI * 2 - dp);
      const d = Math.hypot((u - t.u) * L, dp * rr) / t.r;
      if (d < 1) { const f = Math.cos(d * Math.PI / 2); m -= t.d * f; dark = Math.max(dark, f); }
      m += t.rim * Math.exp(-(((d - 1.1) / 0.28) ** 2));
    }
    return [m, dark];
  };
  const skullSec = (u, ph) => {
    const e = ends(u), sn = Math.sin(ph);
    let a = A(u) * e, b = B(u) * e;
    if (sn < 0) b *= 0.82;                                                       // flatter jaw line
    const ridge = 1 + 0.06 * Math.exp(-(((ph - Math.PI / 2) / 0.35) ** 2)) * smooth(0.4, 0.6, u) * smooth(0.98, 0.85, u);
    const cheek = 1 + 0.12 * Math.exp(-(((u - 0.36) / 0.08) ** 2)) * smooth(0.2, -0.5, sn);   // zygomatic bulge, low
    const [m] = dentAt(u, ph);
    return [a * m * cheek, b * m * ridge];
  };
  const skull = loft(spine, skullSec, {
    rings: 34, segs: 26,
    color: (u, ph) => {
      const sn = Math.sin(ph), [, dark] = dentAt(u, ph);
      let c = mix(bone, boneTop, smooth(0.2, 0.9, sn) * 0.8);
      c = mix(c, shade, smooth(0.1, -0.8, sn) * 0.55);
      c = mix(c, mul(shade, 0.8), 0.25 * Math.exp(-(((u - 0.62) / 0.12) ** 2)) * (1 - Math.abs(Math.cos(ph))) * smooth(-0.2, -0.9, sn));
      return mix(c, sock, smooth(0.15, 0.75, dark));
    },
  });
  parts.push({ geom: skull, mat: M.body });
  const frame = skull.userData.frame;
  const surf = (u, ph, k = 1) => {
    const f = frame(u), [a, b] = skullSec(u, ph), o = b * Math.sin(ph) * k;
    return new THREE.Vector3(a * Math.cos(ph) * k, f.y + f.ny * o, f.z + f.nz * o);
  };
  // glowing pupils deep in the sockets
  for (const ph of [eyePh, Math.PI - eyePh]) {
    const c = surf(eyeU, ph, 0.98), n = c.clone().sub(surf(eyeU, ph, 0.5)).normalize();
    const pupil = kit.sphere(0.026, 12, 9);
    parts.push({ geom: kit.place(pupil, { x: c.x - n.x * 0.004, y: c.y - n.y * 0.004 + 0.004, z: c.z - n.z * 0.004 - 0.004 }), mat: M.glow });
  }

  // --- lower jaw, slightly open, hanging off the skull's underside
  const jawU0 = 0.26, jawU1 = 0.93;
  const jawPt = t => {
    const u = jawU0 + (jawU1 - jawU0) * t, f = frame(u);
    const off = B(u) * ends(u) * 0.82 - 0.012 + 0.03 * smooth(0.45, 1, t) + knots([[0, 0.06], [0.4, 0.036], [1, 0.024]])(t) * 0.8;
    return [f.y - f.ny * off, f.z - f.nz * off];
  };
  const JA = knots([[0, 0.08], [0.25, 0.084], [0.6, 0.062], [1, 0.054]]), JB = knots([[0, 0.064], [0.35, 0.038], [1, 0.026]]);
  const jaw = loft(jawPt, (u, ph) => {
    const e = Math.sqrt(sat(u / 0.08)) * Math.sqrt(sat((1 - u) / 0.06));
    return [JA(u) * e, JB(u) * e * (Math.sin(ph) > 0 ? 0.7 : 1)];
  }, { rings: 16, segs: 14, color: (u, ph) => mix(mix(bone, shade, 0.25), mul(shade, 0.85), smooth(0.2, -0.9, Math.sin(ph))) });
  parts.push({ geom: jaw, mat: M.body });
  // dark mouth interior between the jaws
  const mouthPts = t => { const a = jawPt(t), u = jawU0 + (jawU1 - jawU0) * t, f = frame(u), off = B(u) * ends(u) * 0.6; const b = [f.y - f.ny * off, f.z - f.nz * off]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const mouth = loft(t => mouthPts(0.5 + 0.45 * t), (u) => { const e = Math.sqrt(sat(u / 0.15)) * Math.sqrt(sat((1 - u) / 0.1)); return [0.05 * e, 0.024 * e]; },
    { rings: 8, segs: 8, color: () => mul(sock, 1.2) });
  parts.push({ geom: mouth, mat: M.body });
  // teeth: a row along the upper jaw plus two buck teeth
  const toothC = mix(boneTop, [1, 1, 1], 0.2);
  for (const [u, ph, sc] of [[0.965, -Math.PI / 2 - 0.32, 1.3], [0.965, -Math.PI / 2 + 0.32, 1.3], [0.9, -Math.PI / 2 - 0.8, 1], [0.9, -Math.PI / 2 + 0.8, 1]]) {
    const p = surf(u, ph, 0.9), f = frame(u);
    const t = kit.place(kit.sphere(0.015 * sc, 7, 5), { sx: 0.9, sy: 1.5, sz: 0.8 });
    colorize(kit, t, () => toothC);
    parts.push({ geom: kit.place(t, { x: p.x, y: p.y - f.ny * 0.014, z: p.z - f.nz * 0.014 }), mat: M.body });
  }

  // ears: pointed bony leaves on the crown, tilted out and back
  for (const sx of [-1, 1]) {
    const ep = kit.profile().pt(0, 0);
    for (let i = 1; i <= 7; i++) { const t = i / 7; ep.pt(i === 7 ? 0 : 0.034 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)), 0.8) * (1 - t * 0.35), t * 0.12); }
    const ear = kit.lathe(ep.points(), { segments: 10 });
    deform(ear, (x, y, z) => [x * 0.5, y, z + (y / 0.12) ** 2 * 0.025 - 0.008 * Math.cos(x * 40)]);
    colorize(kit, ear, (x, y, z) => mix(mix(shade, bone, 0.4), boneTop, smooth(0.0, 0.1, y)));
    const base = surf(0.13, Math.PI / 2 + sx * 0.62, 0.92);
    kit.place(ear, { rz: -sx * 0.38, rx: 0.42, ry: sx * 0.35 });
    parts.push({ geom: kit.place(ear, { x: base.x, y: base.y, z: base.z }), mat: M.body });
  }

  // --- neck: a chunky stack of vertebrae curving up into the back of the skull
  const neck = qbez([0.12, 0.03], [0.44, 0.2], [0.77, 0.07]);
  const nv = 5;
  for (let i = 0; i < nv; i++) {
    const t = 0.1 + (i / (nv - 1)) * 0.78, [y, z] = neck(t), [y2, z2] = neck(Math.min(1, t + 0.02)), [y1, z1] = neck(t - 0.02);
    const dir = new THREE.Vector3(0, y2 - y1, z2 - z1).normalize();
    const r = 0.112 - i * 0.008, h = 0.07 - i * 0.003;
    const vp = kit.profile().pt(0, -h / 2).pt(r * 0.8, -h / 2).bez(r * 1.02, -h / 2, r, -0.008, 2)
      .pt(r * 0.9, 0).bez(r, 0.008, r * 0.8, h / 2, 2).pt(0, h / 2);
    const v = kit.lathe(vp.points(), { segments: 14 });
    colorize(kit, v, (x, yy, zz) => mix(mix(bone, shade, 0.2), mul(shade, 0.75), smooth(0.4, 1, Math.abs(yy) / (h / 2)) * 0.5 + 0.2 * smooth(0, -0.08, zz)));
    parts.push({ geom: alongDir(v, dir, new THREE.Vector3(0, y, z)), mat: M.body });
    // spinous process: a stubby fin pointing back into the mane
    const sp = kit.place(kit.cylinder(0.008, 0.022, 0.07, 6), { rx: Math.PI / 2 + 0.5, y: 0, z: r + 0.02 });
    colorize(kit, sp, () => mix(bone, shade, 0.3));
    parts.push({ geom: alongDir(sp, dir, new THREE.Vector3(0, y, z)), mat: M.body });
  }
  // spinal core so the stack reads as one neck
  const core = loft(t => neck(0.02 + t * 0.96), () => [0.065, 0.065], { rings: 10, segs: 10, color: () => mul(shade, 0.7) });
  parts.push({ geom: core, mat: M.body });

  // --- ghost-flame mane: tongues streaming back along the neck and over the crown
  const mane = [
    // [neck t | skull u, side, len, rad, tilt back, curl]
    ['n', 0.2, 0, 0.15, 0.046, 1.0, 0.3], ['n', 0.38, 0, 0.2, 0.054, 0.95, 0.38], ['n', 0.56, 0, 0.22, 0.056, 0.9, 0.42],
    ['n', 0.74, 0, 0.22, 0.056, 0.85, 0.45], ['n', 0.47, 1, 0.15, 0.04, 1.15, 0.3], ['n', 0.64, -1, 0.15, 0.04, 1.1, 0.3],
    ['s', 0.04, 0, 0.21, 0.054, 1.3, 0.4], ['s', 0.12, 1, 0.15, 0.04, 1.4, 0.3], ['s', 0.12, -1, 0.15, 0.04, 1.4, 0.3], ['s', 0.2, 0, 0.12, 0.038, 1.2, 0.25],
  ];
  mane.forEach(([k, t, side, len, rad, tilt, curl], i) => {
    const g = flameTongue(kit, s, { len, rad: rad * 1.25, curl: curl * 1.3, wob: i * 1.7, flat: 0.5 });
    kit.place(g, { rx: tilt, rz: -side * 0.35, ry: side * 0.1 });
    let p;
    if (k === 'n') { const [y, z] = neck(t); p = new THREE.Vector3(side * 0.035, y, z + 0.075); }
    else p = surf(t, Math.PI / 2 + side * 0.5, 0.8);
    parts.push({ geom: kit.place(g, { x: p.x, y: p.y, z: p.z }), mat: M.body });
  });

  return kit.piece(parts);
}

// ---------------------------------------------------------------------- BISHOP
/**
 * Witch: a little robed witch under a huge crooked pointed hat, with a broomstick tucked
 * through the hat band. From above: a big round brim (orange / purple) crossed by the dark
 * broomstick (the bishop's slot line), a straw bundle at one end and the hat's tip ball.
 */
export function bishop(THREE, kit, { color }) {
  THREE_ = THREE;
  const s = SIDES[color], M = mats(kit, color), parts = [];
  const cl = col(s.cloak), cs = col(s.cloakShade), tr = col(s.trim);

  parts.push({ geom: plinth(kit, s, 0.3), mat: M.body });
  // robe: flared, ragged hem, soft folds
  const rp = kit.profile().pt(0.215, 0.056).bez(0.235, 0.09, 0.2, 0.15, 3).bez(0.14, 0.3, 0.1, 0.44, 7).bez(0.085, 0.48, 0.05, 0.5, 3).pt(0, 0.505);
  const robe = kit.lathe(rp.points(), { segments: 28 });
  deform(robe, (x, y, z) => {
    const r = Math.hypot(x, z); if (r < 1e-4) return [x, y, z];
    const a = Math.atan2(x, z);
    const hem = smooth(0.13, 0.065, y);
    const fold = smooth(0.07, 0.15, y) * smooth(0.46, 0.3, y);
    const k = 1 + hem * 0.09 * Math.abs(Math.sin(a * 5)) + fold * 0.05 * Math.sin(a * 8 + 0.7);
    return [x * k, y + hem * 0.02 * (Math.abs(Math.sin(a * 5)) - 0.5), z * k];
  });
  colorize(kit, robe, (x, y, z) => {
    const a = Math.atan2(x, z), fold = 0.5 + 0.5 * Math.sin(a * 8 + 0.7);
    let c = mix(cl, cs, 0.12 + 0.5 * (1 - fold) * smooth(0.08, 0.25, y) + 0.3 * smooth(0.14, 0.07, y));
    if (y < 0.1) c = mix(c, tr, 0.85 * smooth(0.06, 0.075, y));                // hem trim
    return c;
  });
  parts.push({ geom: robe, mat: M.body });
  // pointed cape collar (trim colour)
  const cp = kit.profile().pt(0.06, 0.505).pt(0.1, 0.49).bez(0.15, 0.46, 0.165, 0.42, 3).pt(0.15, 0.418).bez(0.13, 0.455, 0.085, 0.48, 3).pt(0.05, 0.495);
  const cape = kit.lathe(cp.points().reverse(), { segments: 28 });   // reversed: outer surface must run upward
  deform(cape, (x, y, z) => { const w = Math.abs(Math.sin(Math.atan2(x, z) * 2.5)); return [x, y < 0.45 ? y - Math.pow(w, 3) * 0.035 : y, z]; });   // five collar points
  colorize(kit, cape, (x, y) => mix(mul(tr, 0.75), tr, smooth(0.42, 0.49, y)));
  parts.push({ geom: cape, mat: M.body });

  // arms: sleeves reaching forward, little hands
  for (const sx of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.03, 0.09, 3, 8);
    colorize(kit, arm, (x, y) => mix(cl, cs, smooth(0.05, -0.06, y)));
    const hand = kit.place(kit.sphere(0.026, 8, 6), { y: -0.08 });
    colorize(kit, hand, () => col(s.skin));
    const g = kit.merge([arm, hand]); arm.dispose(); hand.dispose();
    parts.push({ geom: kit.place(g, { rz: sx * 0.55, rx: 0.75, x: sx * 0.11, y: 0.4, z: -0.035 }), mat: M.body });
  }

  // head + face (looks toward -z)
  const hy = 0.565, hr = 0.088;
  const head = kit.place(kit.sphere(hr, 16, 11), { y: hy });
  const sk = col(s.skin), ck = col(s.cheek);
  colorize(kit, head, (x, y, z) => {
    let c = mix(sk, mul(sk, 0.75), smooth(hy - 0.02, hy - hr, y) * 0.5);
    const cheek = Math.exp(-((Math.abs(x) - 0.045) ** 2 + (y - hy + 0.022) ** 2) / 0.0004) * smooth(0, -0.06, z);
    return mix(c, ck, cheek * 0.7);
  });
  parts.push({ geom: head, mat: M.body });
  for (const sx of [-1, 1]) {
    const eye = kit.place(kit.sphere(0.017, 10, 8), { x: sx * 0.033, y: hy + 0.006, z: -hr + 0.012, sy: 1.25, sz: 0.7 });
    colorize(kit, eye, () => col(s.outline));
    parts.push({ geom: eye, mat: M.body });
    const glint = kit.place(kit.sphere(0.005, 6, 4), { x: sx * 0.033 + 0.005, y: hy + 0.014, z: -hr + 0.001 });
    colorize(kit, glint, () => [1, 1, 1]);
    parts.push({ geom: glint, mat: M.body });
  }
  // crooked nose
  const nose = kit.cylinder(0.0, 0.016, 0.06, 8);
  deform(nose, (x, y, z) => [x, y - (0.5 - (y + 0.03) / 0.06) * 0, z + ((y + 0.03) / 0.06) ** 2 * 0.012]);
  colorize(kit, nose, () => mix(sk, ck, 0.25));
  parts.push({ geom: kit.place(nose, { rx: -Math.PI / 2 + 0.25, y: hy - 0.012, z: -hr - 0.018 }), mat: M.body });

  // hair: a ragged bob under the brim, open at the face (tilted with the hat, below)
  const h0 = parts.length;
  const hairSec = [[0.098, 0.645], [0.122, 0.6], [0.128, 0.5], [0.112, 0.505], [0.104, 0.6], [0.084, 0.64]].reverse().map(([r, y]) => new THREE.Vector2(r, y));
  const hair = kit.latheSegment(hairSec, Math.PI + 0.75, Math.PI * 2 - 1.5, 22);
  deform(hair, (x, y, z) => { const a = Math.atan2(x, z); return [x, y < 0.53 ? y + 0.03 * Math.abs(Math.sin(a * 7)) : y, z]; });
  colorize(kit, hair, (x, y) => mix(mul(col(s.hair), 0.7), col(s.hair), smooth(0.5, 0.62, y)));
  parts.push({ geom: hair, mat: M.body });

  // --- hat: wide wavy brim + crooked cone
  const by = 0.632, bR = 0.33;
  const bp = kit.profile().pt(0.085, by - 0.008).pt(bR - 0.02, by - 0.012).arc(bR - 0.02, by + 0.002, 0.014, -90, 90, 3)
    .pt(bR - 0.03, by + 0.012).bez(0.2, by + 0.002, 0.1, by + 0.006, 2).pt(0.085, by + 0.006);
  const brim = kit.lathe(bp.points(), { segments: 48 });
  const wave = (x, z) => { const a = Math.atan2(x, z), r = Math.hypot(x, z); return (0.016 * Math.sin(a * 3 + 0.6) + 0.008 * Math.sin(a * 5)) * smooth(0.14, bR, r) + 0.02 * smooth(0.24, bR, r) ** 2; };
  deform(brim, (x, y, z) => [x, y + wave(x, z), z]);
  const hat = col(s.hat), hs = col(s.hatShade), he = col(s.hatEdge);
  colorize(kit, brim, (x, y, z) => {
    const r = Math.hypot(x, z), up = y - wave(x, z) > by + 0.0;
    let c = up ? mix(hat, he, smooth(0.25, bR, r) * 0.8) : mix(hs, mul(hs, 0.7), smooth(0.2, 0.1, r));
    return mul(c, 0.9 + 0.1 * noise(x * 25, 0, z * 25));
  });
  parts.push({ geom: brim, mat: M.body });

  const top = 0.99;
  const conP = kit.profile().pt(0.108, by).bez(0.09, 0.72, 0.055, 0.82, 6).bez(0.03, 0.9, 0.008, top, 6).pt(0, top + 0.004);
  const cone = kit.lathe(conP.points(), { segments: 24 });
  const bend = y => { const t = sat((y - 0.7) / (top - 0.7)); return [-0.03 * t * t + 0.03 * Math.pow(t, 4) * 1.5, 0.11 * t * t]; };   // crooked: back, then a kink sideways
  deform(cone, (x, y, z) => { const [bx, bz] = bend(y), sq = 1 + 0.06 * Math.sin(y * 40) * smooth(0.68, 0.8, y) * smooth(0.95, 0.85, y); return [x * sq + bx, y, z * sq + bz]; });
  colorize(kit, cone, (x, y, z) => {
    const [bx, bz] = bend(y), a = Math.atan2(x - bx, z - bz);
    let c = mix(hat, hs, 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(y * 40)) * smooth(0.68, 0.8, y) * smooth(0.95, 0.85, y));
    c = mix(c, he, 0.3 * smooth(0.82, top, y));
    return mul(c, 0.85 + 0.15 * Math.cos(a - Math.PI * 0.8));
  });
  parts.push({ geom: cone, mat: M.body });
  // tip ball (the bishop's small ball from above)
  const [tbx, tbz] = bend(top);
  const tip = kit.place(kit.sphere(0.026, 10, 8), { x: tbx, y: top - 0.002, z: tbz });
  colorize(kit, tip, () => mix(tr, [1, 1, 1], 0.15));
  parts.push({ geom: tip, mat: M.body });
  // hat band + glowing buckle at the front
  const band = kit.lathe(kit.profile().pt(0.11, by + 0.004).pt(0.114, by + 0.01).pt(0.106, by + 0.05).pt(0.099, by + 0.056).points(), { segments: 28 });
  colorize(kit, band, (x, y) => mix(mul(col(s.band), 0.8), col(s.band), smooth(by, by + 0.04, y)));
  parts.push({ geom: band, mat: M.body });
  const bsh = new THREE.Shape(); bsh.moveTo(-0.026, -0.022); bsh.lineTo(0.026, -0.022); bsh.lineTo(0.026, 0.022); bsh.lineTo(-0.026, 0.022);
  const hole = new THREE.Path(); hole.moveTo(-0.013, -0.01); hole.lineTo(-0.013, 0.01); hole.lineTo(0.013, 0.01); hole.lineTo(0.013, -0.01); bsh.holes.push(hole);
  const buckle = kit.extrude(bsh, { depth: 0.01, bevel: 0.002, bevelSegments: 1, curveSegments: 1 });
  parts.push({ geom: kit.place(buckle, { y: by + 0.03, z: -0.111, rx: -0.12 }), mat: M.glow });

  // --- broomstick tucked through the band: the dark slot line across the brim
  const bz = 0.085, byy = by + 0.034, ang = 0.18;
  const stick = kit.cylinder(0.016, 0.016, 0.62, 8);
  colorize(kit, stick, (x, y, z) => mul(col(s.stick), 0.85 + 0.3 * noise(0, y * 30, 0)));
  const knob = kit.place(kit.sphere(0.021, 8, 6), { y: -0.31 });
  colorize(kit, knob, () => col(s.stick));
  const brm = kit.merge([stick, knob]); stick.dispose(); knob.dispose();
  kit.place(brm, { rz: -Math.PI / 2 + 0.03, x: -0.06 });                              // along x, bristles end at +x
  // straw bundle at +x, bound with a trim-coloured cord
  const bl = 0.17;
  const bunP = kit.profile().pt(0, 0).pt(0.022, 0.0).bez(0.03, 0.06, 0.058, bl - 0.01, 5).pt(0.05, bl).pt(0.0, bl - 0.012);
  const bun = kit.lathe(bunP.points(), { segments: 18 });
  deform(bun, (x, y, z) => { const a = Math.atan2(x, z); return [x, y + (y > bl - 0.03 ? 0.012 * Math.sin(a * 9) : 0), z * 0.72]; });
  const sw = col(s.straw), sdk = col(s.strawDark);
  colorize(kit, bun, (x, y, z) => mix(sdk, sw, 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(Math.atan2(x, z) * 9)) * smooth(0.0, 0.05, y)));
  const tie = kit.place(new THREE.TorusGeometry(0.026, 0.007, 5, 14), { rx: Math.PI / 2, y: 0.03 });
  colorize(kit, tie, () => tr);
  const bundle = kit.merge([bun, tie]); bun.dispose(); tie.dispose();
  kit.place(bundle, { rz: -Math.PI / 2, x: 0.21 });
  const broom = kit.merge([brm, bundle]); brm.dispose(); bundle.dispose();
  kit.place(broom, { ry: ang, y: byy, z: bz });
  parts.push({ geom: broom, mat: M.body });
  // jaunty tilt: the front of the brim lifts a little so the face peeks out at an angle
  const tilt = new THREE.Matrix4().makeTranslation(0, by, 0).multiply(new THREE.Matrix4().makeRotationX(0.13)).multiply(new THREE.Matrix4().makeTranslation(0, -by, 0));
  for (let i = h0; i < parts.length; i++) parts[i].geom.applyMatrix4(tilt);

  return kit.piece(parts);
}

export default { p: pawn, n: knight, b: bishop, r: rook };

/** Helpers shared with royals.js (queen + king). setThree() must run before col/refine/loft/shape. */
export const H = { setThree: T => { THREE_ = T; }, mats, col, mix, mul, sat, smooth, hash, noise, colorize, deform, wrap, refine, shape, archShape, knots, qbez, loft, alongDir, plinth };
