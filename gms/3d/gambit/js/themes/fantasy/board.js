// Fantasy board environment (refs/ref_fantasy_island_board.jpg): the board (squares.js: marble
// squares with gold inlay + an ornate frame) sits on a floating stone island — a tiled deck with a
// gold-trimmed edge, glowing blue rune medallions at the corners, braziers with fire, heraldic
// banners (blue on white's side, red on black's), oaks and pines, waterfalls spilling off the rim
// and hanging crags underneath — high above a sea of clouds, with distant floating islands and a
// great castle under a sky dome.
// Only shown when the camera tilts past minPhi (0.24 rad): Top and Tilt pay nothing for it.
// Alive (polish pass) through the board's env.update(dt, t) hook, which only runs while the env is
// visible and ambient animation is on: flames lick and flicker, waterfalls stream, the cloud sea
// drifts, distant islands bob, banners sway, rune medallions pulse. All of it is a time uniform in
// the vertex/fragment shaders + a texture offset + one rotation: no per-vertex CPU work per frame.
// ~10 draw calls, nothing casts shadows.
import { runeTexture } from './squares.js';

const { sin, cos, atan2, hypot, abs, max, min, floor, PI } = Math;
const TAU = PI * 2;

let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = (a, b) => a + (b - a) * rnd();
const hash2 = (x, y) => { const s = sin(x * 127.1 + y * 311.7) * 43758.5453; return s - floor(s); };
const vnoise = (x, y) => {
  const xi = floor(x), yi = floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const vnoise3 = (x, y, z) => (vnoise(x + z * 0.71, y) + vnoise(y + 3.1, z - x * 0.53)) * 0.5;
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** superellipse radius factor: a rounded square when applied to a circle (n = 6) */
const squircle = (th, n = 6) => 1 / Math.pow(Math.pow(abs(cos(th)), n) + Math.pow(abs(sin(th)), n), 1 / n);

const DECK = 5.75, DECK_Y = -0.34;

export function environment(THREE, kit) {
  seed = 7;
  const clock = { value: 0 };
  const col = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
  const paintAll = (g, fn) => {
    kit.ensureColor(g);
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); c.setXYZ(i, v[0], v[1], v[2]); }
    return g;
  };
  /** constant per-vertex animation data in the uv channel (meshes with no map) */
  const setUV = (g, u, v) => { const a = new Float32Array(g.attributes.position.count * 2); for (let i = 0; i < a.length; i += 2) { a[i] = u; a[i + 1] = v; } g.setAttribute('uv', new THREE.BufferAttribute(a, 2)); return g; };
  /** jitter a geometry's vertices with smooth 3D noise (same position -> same offset: no cracks) */
  const lumpy = (g, amp, freq, sd = 0) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + amp * (vnoise3(x * freq + sd, y * freq, z * freq) - 0.5) * 2;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    g.computeVertexNormals();
    return g;
  };
  /** time-animated material: vertex (and optional fragment) GLSL with uT = seconds */
  const animate = (mat, name, vert, frag = null, fragAt = '#include <map_fragment>') => {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uT = clock;
      sh.vertexShader = 'uniform float uT;\nvarying float vAnim;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAnim = 1.0;\n' + vert);
      sh.fragmentShader = 'uniform float uT;\nvarying float vAnim;\n' + sh.fragmentShader.replace(fragAt, fragAt + '\n' + (frag || ''));
    };
    mat.customProgramCacheKey = () => 'fantasyEnv_' + name;
    return mat;
  };
  const root = new THREE.Group(); root.name = 'fantasy-env';
  const land = [], far = [], gold = [], runes = [], flames = [], clouds = [], falls = [], cloths = [];
  let deckGeom = null;

  // ---------------------------------------------------------------- palette
  const stone = col('#b8ad98'), stoneD = col('#8f8574'), rock = col('#7c7266'), rockD = col('#4f4840'), rockL = col('#a39784'),
    earth = col('#6b5640'), grass = col('#5f8a3c'), grassL = col('#86ad4f'), moss = col('#4f7434'),
    bark = col('#5a4030'), barkD = col('#3a2a20'), leafD = col('#2c4f22'), leaf = col('#4d7d34'), leafL = col('#8fb357'),
    pineD = col('#1f3d26'), pineL = col('#4f7a3e');

  // ---------------------------------------------------------------- vegetation
  /** pine: four drooping, ragged tiers on a short trunk */
  const pine = (list, x, y, z, s) => {
    const tr = kit.cylinder(0.035 * s, 0.06 * s, 0.4 * s, 5);
    paintAll(tr, () => barkD);
    list.push(kit.place(tr, { x, y: y + 0.2 * s, z }));
    const tint = R(-0.08, 0.08);
    for (let k = 0; k < 4; k++) {
      const h = (0.55 - 0.06 * k) * s, r = (0.46 - 0.095 * k) * s;
      const c = new THREE.CylinderGeometry(0, r, h, 9, 1);
      const p = c.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), a = atan2(px, pz);
        if (py < -h / 2 + 1e-4) { const j = 1 + 0.2 * sin(a * 5 + k * 1.7); p.setXYZ(i, px * j, py - 0.07 * s * (0.5 + 0.5 * sin(a * 9 + k)), pz * j); }
      }
      c.computeVertexNormals();
      paintAll(c, (px, py) => lerp3(pineD, pineL, Math.min(1, max(0, 0.15 + tint + 0.55 * ((py + h / 2) / h) + 0.12 * k))));
      list.push(kit.place(c, { x, y: y + (0.42 + 0.27 * k) * s, z, ry: R(0, TAU) }));
    }
  };
  /** oak: a leaning trunk with two limbs and a lumpy, shaded canopy of five clumps */
  const oak = (list, x, y, z, s) => {
    const lean = R(-0.12, 0.12), ry = R(0, TAU);
    const tr = kit.cylinder(0.05 * s, 0.09 * s, 0.75 * s, 6);
    paintAll(tr, (px, py) => lerp3(barkD, bark, 0.5 + py / (0.75 * s)));
    list.push(kit.place(tr, { x, y: y + 0.36 * s, z, rz: lean }));
    for (const a of [0.9, -1.1]) {
      const b = kit.cylinder(0.025 * s, 0.04 * s, 0.4 * s, 5);
      paintAll(b, () => bark);
      list.push(kit.place(b, { x: x + sin(a + ry) * 0.12 * s, y: y + 0.7 * s, z: z + cos(a + ry) * 0.12 * s, rz: a * 0.6, ry }));
    }
    const top = [x - lean * 0.7 * s, y + 0.95 * s, z];
    const clumps = [[0, 0.12, 0, 0.42], [0.3, -0.05, 0.1, 0.32], [-0.28, -0.02, -0.12, 0.33], [0.05, -0.06, 0.32, 0.3], [-0.06, 0.0, -0.3, 0.3]];
    const tint = R(-0.06, 0.06);
    for (const [dx, dy, dz, r] of clumps) {
      const g = lumpy(new THREE.IcosahedronGeometry(r * s, 1), 0.22, 3.2 / s, x + z);
      paintAll(g, (px, py, pz) => {
        const up = py / (r * s);                                                  // -1 bottom … 1 top
        const ao = 0.35 + 0.65 * (0.5 + 0.5 * up) + tint;
        const c = lerp3(leafD, leaf, min(1, max(0, ao)));
        return up > 0.55 && vnoise3(px * 9, py * 9, pz * 9) > 0.55 ? lerp3(c, leafL, 0.6) : c;
      });
      list.push(kit.place(g, { x: top[0] + dx * s, y: top[1] + (dy + 0.1) * s, z: top[2] + dz * s, sy: 0.82 }));
    }
  };
  const bush = (list, x, y, z, s, flowers = 0) => {
    for (let k = 0; k < 2; k++) {
      const r = (0.3 - k * 0.08) * s;
      const g = lumpy(new THREE.IcosahedronGeometry(r, 1), 0.25, 4 / s, x * 3 + k);
      paintAll(g, (px, py) => lerp3(moss, grassL, min(1, max(0, 0.35 + 0.6 * (py / r * 0.5 + 0.5)))));
      list.push(kit.place(g, { x: x + k * 0.22 * s, y: y + r * 0.6, z: z - k * 0.15 * s, sy: 0.75 }));
    }
    for (let i = 0; i < flowers; i++) {
      const a = R(0, TAU), r = R(0.1, 0.28) * s, f = new THREE.IcosahedronGeometry(0.035 * s, 0);
      paintAll(f, () => col(i % 3 === 0 ? '#f2e27a' : i % 3 === 1 ? '#e98fb6' : '#f6f2ea'));
      list.push(kit.place(f, { x: x + sin(a) * r, y: y + 0.26 * s + R(-0.04, 0.04) * s, z: z + cos(a) * r }));
    }
  };
  /** hanging crag: a ragged inverted spike of rock under an island */
  const crag = (list, x, y, z, r, len, sd) => {
    const g = new THREE.CylinderGeometry(r, r * 0.08, len, 7, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), a = atan2(px, pz);
      const k = 1 + 0.7 * (vnoise(a * 1.6 + sd, py * 2.2 / len + sd) - 0.5) + 0.25 * (vnoise(a * 5 + sd, py * 6 / len) - 0.5);
      const bend = (0.5 - py / len) ** 2 * len * 0.18;                              // the tip curls off-axis
      p.setXYZ(i, px * k + bend * sin(sd * 3.7), py, pz * k * (0.7 + 0.3 * sin(sd)) + bend * cos(sd * 3.7));
    }
    g.computeVertexNormals();
    paintAll(g, (px, py) => lerp3(rockD, lerp3(rock, earth, 0.3), 0.3 + 0.7 * ((py + len / 2) / len)));
    list.push(kit.place(g, { x, y: y - len / 2, z, rx: R(-0.12, 0.12), rz: R(-0.12, 0.12) }));
  };

  // ---------------------------------------------------------------- the island under the board
  {
    // profile: deck top, short edge, block wall, then a craggy underside narrowing to a point
    const prof = [[DECK - 0.1, DECK_Y], [DECK, DECK_Y], [DECK + 0.02, DECK_Y - 0.08], [DECK, DECK_Y - 0.12], [DECK - 0.04, -0.62], [DECK - 0.06, -1.05]];
    for (let i = 1; i <= 14; i++) { const t = i / 14; prof.push([(DECK - 0.1) * (1 - t) ** 1.25 + 0.05, -1.05 - 8.2 * t ** 1.15]); }
    const g = kit.lathe(prof.map(([r, y]) => new THREE.Vector2(r, y)), { segments: 84 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = atan2(x, z);
      let k = squircle(th);
      if (y < -1.0) k *= 1 + 0.2 * (vnoise(th * 3.2 + 7, y * 0.9) - 0.5) + 0.1 * (vnoise(th * 9, y * 2.6) - 0.5) + 0.05 * (vnoise(th * 22, y * 5) - 0.5);   // crags
      p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    paintAll(g, (x, y, z) => {
      if (y > -1.06) return lerp3(stoneD, stone, 0.5 + 0.5 * vnoise(atan2(x, z) * 14, y * 9));
      const th = atan2(x, z), n = vnoise(th * 6, y * 1.4);
      if (y > -1.6) return lerp3(moss, grassL, n);                                   // grassy lip under the wall
      if (y > -2.6 && n > 0.62) return moss;                                          // hanging greenery
      const band = 0.5 + 0.5 * sin(y * 3.1 + n * 4);                                 // strata
      return lerp3(lerp3(rockD, lerp3(rock, earth, n), min(1, (y + 9.3) / 5)), rockL, 0.22 * band * (y > -5 ? 1 : 0.4));
    });
    land.push(g);
    // hanging crags round the underside (a less "spinning top" silhouette)
    for (let i = 0; i < 9; i++) {
      const th = i / 9 * TAU + R(-0.3, 0.3), r = R(2.4, 4.0), y = -1.5 - (5.75 - r) * 1.3;
      crag(land, r * squircle(th) * sin(th), y, r * squircle(th) * cos(th), R(0.7, 1.15), R(1.6, 3.0), i * 1.7);
    }
    // vertex rows are few on the deck: the tile grid needs a denser top -> a separate fine deck plate
    const deck = new THREE.PlaneGeometry(DECK * 2, DECK * 2, 46, 46).rotateX(-PI / 2);
    const dp = deck.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const x = dp.getX(i), z = dp.getZ(i), th = atan2(x, z), r = hypot(x, z), lim = DECK * squircle(th) - 0.06;
      const s = r > lim ? lim / r : 1;
      dp.setXYZ(i, x * s, DECK_Y + 0.004, z * s);
    }
    deckGeom = deck;
    // gold trim round the deck edge (a thin rounded-square ring)
    const trim = kit.lathe([[DECK + 0.035, DECK_Y - 0.1], [DECK + 0.05, DECK_Y - 0.04], [DECK + 0.03, DECK_Y + 0.02], [DECK - 0.05, DECK_Y + 0.02]].map(([r, y]) => new THREE.Vector2(r, y)), { segments: 72 });
    const tp = trim.attributes.position;
    for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i), k = squircle(atan2(x, z)); tp.setX(i, x * k); tp.setZ(i, z * k); }
    trim.computeVertexNormals();
    gold.push(trim);
  }

  // ---------------------------------------------------------------- corner rune medallions
  const C4 = 5.02;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * C4, z = sz * C4;
    const disc = kit.lathe(kit.profile().pt(0, 0).pt(0.5, 0).pt(0.52, 0.03).pt(0.46, 0.05).pt(0.4, 0.045).pt(0.38, 0.03).pt(0, 0.03).points(), { segments: 32 });
    gold.push(kit.place(disc, { x, z, y: DECK_Y }));
    runes.push(kit.place(new THREE.PlaneGeometry(0.8, 0.8).rotateX(-PI / 2), { x, z, y: DECK_Y + 0.038, ry: sx * sz * 0.4 }));
  }

  // ---------------------------------------------------------------- braziers (stone pedestal, gold bowl, fire)
  const flameAt = (x, y, z, s) => {
    for (const ry of [0, PI / 3, -PI / 3]) flames.push(kit.place(new THREE.PlaneGeometry(0.7 * s, 1.15 * s, 1, 4), { x, y: y + 0.5 * s, z, ry }));
  };
  for (const [x, z] of [[-5.2, -2.3], [5.2, -2.3], [-5.2, 2.3], [5.2, 2.3]]) {
    const ped = kit.lathe(kit.profile().pt(0, 0).pt(0.34, 0).pt(0.34, 0.1).pt(0.24, 0.16).pt(0.18, 0.5).pt(0.26, 0.58).pt(0.26, 0.66).pt(0, 0.66).points(), { segments: 8 });
    paintAll(ped, (px, py) => lerp3(stoneD, stone, 0.4 + 0.6 * (py / 0.66)));
    land.push(kit.place(ped, { x, z, y: DECK_Y }));
    const bowl = kit.lathe(kit.profile().pt(0, 0.66).pt(0.07, 0.66).pt(0.09, 0.71).bez(0.27, 0.72, 0.31, 0.86, 3).pt(0.28, 0.87).bez(0.22, 0.77, 0.0, 0.8, 3).points(), { segments: 16 });
    gold.push(kit.place(bowl, { x, z, y: DECK_Y }));
    flameAt(x, DECK_Y + 0.78, z, 1);
  }

  // ---------------------------------------------------------------- banners on gold poles (cloth + embroidered crest sway together)
  const banner = (x, z, cloth, facing, phase) => {
    const H = 2.9, W = 0.74, L = 1.55;
    gold.push(kit.place(kit.cylinder(0.035, 0.045, H, 8), { x, z, y: DECK_Y + H / 2 }));
    gold.push(kit.place(kit.sphere(0.08, 10, 8), { x, z, y: DECK_Y + H + 0.05 }));
    gold.push(kit.place(kit.cylinder(0.026, 0.026, W + 0.2, 6), { x, z, y: DECK_Y + H - 0.12, rz: PI / 2, ry: facing }));
    gold.push(kit.place(kit.cylinder(0.035, 0.045, 0.3, 8), { x, z, y: DECK_Y + 0.15 }));
    // cloth: a subdivided sheet (so the gold border is one narrow column of vertex colour),
    // swallow-tailed, hanging from the crossbar; uv = (hang 0 at the bar … 1 at the tail, phase)
    const top = DECK_Y + H - 0.14;
    const g = new THREE.PlaneGeometry(W, L, 14, 12);
    const gp = g.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const px = gp.getX(i), v = (gp.getY(i) + L / 2) / L;                        // 1 at the top
      let y = -L * (1 - v);
      if (v < 1e-3) y += 0.28 * (1 - abs(px) / (W / 2));                           // the swallowtail notch
      gp.setXYZ(i, px, y, 0.06 * sin(y * 3.4 + px * 2));
    }
    g.computeVertexNormals();
    const c0 = col(cloth), c1 = lerp3(col(cloth), [0, 0, 0], 0.5), border = col('#e9bb62');
    paintAll(g, (px, py) => (abs(px) > W / 2 - 0.03 || py > -0.07 ? border : lerp3(c0, c1, min(1, -py / L))));
    const hang = q => { const qp = q.attributes.position, a = new Float32Array(qp.count * 2); for (let i = 0; i < qp.count; i++) { a[i * 2] = min(1, max(0, -qp.getY(i) / L)); a[i * 2 + 1] = phase; } q.setAttribute('uv', new THREE.BufferAttribute(a, 2)); return q; };
    cloths.push(kit.place(kit.place(hang(g), { y: top }), { x, z, ry: facing }));
    // embroidered crest: a crowned shield in gold thread on both faces
    const crest = [[-0.17, -0.42], [0.17, -0.42], [0.17, -0.7], [0, -0.86], [-0.17, -0.7]];
    for (const off of [0.014, -0.014]) {
      const e = kit.extrude(crest, { depth: 0.008, bevel: 0.003, bevelSegments: 1 });
      const crown = kit.extrude([[-0.13, -0.38], [0.13, -0.38], [0.15, -0.26], [0.07, -0.32], [0, -0.22], [-0.07, -0.32], [-0.15, -0.26]], { depth: 0.008, bevel: 0.003, bevelSegments: 1 });
      for (const q of [e, crown]) {
        const qp = q.attributes.position;
        for (let i = 0; i < qp.count; i++) qp.setZ(i, qp.getZ(i) - 0.004 + off + 0.06 * sin(qp.getY(i) * 3.4 + qp.getX(i) * 2));
        q.computeVertexNormals();
        paintAll(q, () => col('#f0c56a'));
        cloths.push(kit.place(kit.place(hang(q), { y: top }), { x, z, ry: facing }));
      }
    }
  };
  banner(-5.3, 3.9, '#2a5fd2', 0, 0.0); banner(5.3, 3.9, '#2a5fd2', 0, 2.1);       // white's side (+z)
  banner(-5.3, -3.9, '#a3121c', 0, 4.2); banner(5.3, -3.9, '#a3121c', 0, 1.3);     // black's side

  // ---------------------------------------------------------------- greenery on the deck corners
  for (const [x, z] of [[-5.45, -5.0], [5.45, -5.0], [-5.0, -5.45], [5.0, -5.45], [-5.5, 5.1], [5.1, 5.5]]) bush(land, x, DECK_Y, z, R(0.8, 1.1), 3);
  oak(land, -5.35, DECK_Y, -4.45, 1.05); pine(land, 5.4, DECK_Y, -4.45, 1.25); oak(land, -5.4, DECK_Y, 4.6, 0.8); pine(land, 5.42, DECK_Y, 4.55, 1.0);
  pine(land, 5.5, DECK_Y, -1.2, 0.75); oak(land, -5.5, DECK_Y, 1.1, 0.6);

  // ---------------------------------------------------------------- waterfalls off the rim
  const fall = (th, w, len) => {
    const r = DECK * squircle(th) + 0.06, x = r * sin(th), z = r * cos(th);
    const g = new THREE.PlaneGeometry(w, len, 1, 8);
    const gp = g.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const v = (gp.getY(i) + len / 2) / len;                                       // 1 at the top
      gp.setZ(i, 0.6 * (1 - v) ** 0.5);                                              // arcs out, then drops
      gp.setX(i, gp.getX(i) * (1 + 0.8 * (1 - v)));
    }
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 3);   // streaks keep their scale
    falls.push(kit.place(g, { x, z, y: DECK_Y - 0.05 - len / 2, ry: th }));
  };
  fall(-PI / 2 + 0.25, 0.9, 11); fall(PI / 2 - 0.45, 0.7, 9.5); fall(PI - 0.3, 0.8, 10);

  // ---------------------------------------------------------------- distant floating islands + castles (they bob: uv = phase, amplitude)
  const castle = (list, cx, by, cz, s, grand) => {
    const wall = col('#ece3d2'), wallD = col('#b9ad98'), roof = col('#3d63b8'), roofD = col('#243f80'), spire = col('#e6c06a');
    const at = (g, x, y, z, o = {}) => list.push(kit.place(g, { x: cx + x * s, y: by + y * s, z: cz + z * s, ...o }));
    const shade = (g, h) => paintAll(g, (px, py) => lerp3(wallD, wall, min(1, 0.45 + (py / (h * s) + 0.5) * 0.6)));
    const tower = (x, z, r, h, rf = 2.6) => {
      at(shade(kit.cylinder(r * s, r * 1.06 * s, h * s, 10), h), x, h / 2, z);
      at(paintAll(kit.cylinder(r * 1.18 * s, r * 1.12 * s, 0.05 * s, 10), () => wall), x, h + 0.02, z);
      at(paintAll(kit.cylinder(0, r * 1.3 * s, r * rf * s, 10), (px, py) => lerp3(roofD, roof, 0.5 + py / (r * rf * s))), x, h + 0.04 + r * rf / 2, z);
      at(paintAll(kit.cylinder(0, 0.008 * s, 0.12 * s, 4), () => spire), x, h + 0.04 + r * rf + 0.05, z);
    };
    const wallSeg = (x0, z0, x1, z1, h, t = 0.05) => {
      const L = hypot(x1 - x0, z1 - z0), a = atan2(x1 - x0, z1 - z0);
      at(shade(kit.bevelBox(t * s, h * s, L * s, 0.004 * s, 1), h), (x0 + x1) / 2, h / 2, (z0 + z1) / 2, { ry: a });
      const n = floor(L / 0.07);
      for (let i = 0; i < n; i += 2) {                                              // crenellations
        const f = (i + 0.5) / n;
        at(paintAll(kit.bevelBox(t * 1.1 * s, 0.04 * s, 0.035 * s, 0, 1), () => wall), x0 + (x1 - x0) * f, h + 0.02, z0 + (z1 - z0) * f, { ry: a });
      }
    };
    if (!grand) {
      at(shade(kit.bevelBox(0.5 * s, 0.55 * s, 0.4 * s, 0.02 * s, 1), 0.55), 0, 0.275, 0);
      tower(0, 0, 0.12, 1.0);
      for (const [x, z, h] of [[-0.32, 0.2, 0.6], [0.32, 0.2, 0.7], [-0.3, -0.25, 0.75], [0.3, -0.24, 0.55]]) tower(x, z, 0.075, h);
      return;
    }
    // the great castle: a curtain wall with corner towers, a gatehouse, a keep with four turrets
    // and a tall central tower, plus slender spires (the ref's skyline)
    const Q = 0.46, WH = 0.26;
    const corners = [[-Q, -Q], [Q, -Q], [Q, Q], [-Q, Q]];
    for (let i = 0; i < 4; i++) { const [x0, z0] = corners[i], [x1, z1] = corners[(i + 1) % 4]; wallSeg(x0, z0, x1, z1, WH); }
    for (const [x, z] of corners) tower(x, z, 0.075, 0.48);
    tower(-0.1, Q, 0.055, 0.38); tower(0.1, Q, 0.055, 0.38);                        // gatehouse (front, +z)
    at(shade(kit.bevelBox(0.42 * s, 0.6 * s, 0.34 * s, 0.01 * s, 1), 0.6), 0, 0.3, -0.05);
    const keepRoof = paintAll(kit.cylinder(0, 0.32 * s, 0.26 * s, 4), (px, py) => lerp3(roofD, roof, 0.5 + py / (0.26 * s)));
    at(keepRoof, 0, 0.73, -0.05, { ry: PI / 4, sx: 1.0, sz: 0.8 });
    for (const [x, z, h] of [[-0.2, -0.2, 0.8], [0.2, -0.2, 0.86], [-0.2, 0.12, 0.74], [0.2, 0.12, 0.7]]) tower(x, z, 0.05, h, 3.4);
    tower(0, -0.05, 0.085, 1.15, 3.2);
    tower(-0.32, -0.05, 0.04, 0.66, 3.6); tower(0.33, 0.0, 0.042, 0.62, 3.6);
  };
  const island = (cx, cy, cz, s, { trees = 4, castle: cs = false, grand = false, falls: wf = false } = {}) => {
    const list = [];
    const prof = [[0, 0.14], [0.85, 0.14], [1.02, 0.08], [1.0, -0.05], [0.97, -0.45], [0.9, -0.62]];
    for (let i = 1; i <= 8; i++) { const t = i / 8; prof.push([0.88 * (1 - t) ** 1.6 + 0.02, -0.62 - 2.2 * t ** 1.05]); }
    const g = kit.lathe(prof.map(([r, y]) => new THREE.Vector2(r * s, y * s)), { segments: 28 });
    const p = g.attributes.position, sd = cx * 0.37 + cz * 0.11;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = atan2(x, z);
      const k = 1 + 0.26 * (vnoise(th * 2.5 + sd, y / s * 1.5) - 0.5) + (y < 0 ? 0.2 * (vnoise(th * 7 + sd, y / s * 4) - 0.5) : 0);
      p.setXYZ(i, x * k * (1 + 0.25 * sin(th * 2 + sd)), y, z * k);
    }
    g.computeVertexNormals();
    paintAll(g, (x, y, z) => {
      const n = vnoise(atan2(x, z) * 5 + sd, y / s * 2);
      if (y > 0.05 * s) return lerp3(grass, grassL, n);
      if (y > -0.12 * s) return lerp3(moss, grass, n);
      if (y > -0.5 * s && n > 0.66) return moss;                                    // greenery spilling over the cliff
      const band = 0.5 + 0.5 * sin(y / s * 14 + n * 3);                             // rock strata
      return lerp3(lerp3(rockD, rock, n), rockL, 0.4 * band * (y > -0.7 * s ? 1 : 0.4));
    });
    list.push(g);
    for (let i = 0; i < 3; i++) {                                                   // hanging crags
      const a = R(0, TAU), r = R(0.2, 0.48) * s;
      crag(list, r * sin(a), -0.45 * s, r * cos(a), R(0.26, 0.4) * s, R(0.6, 1.1) * s, sd + i * 2.3);
    }
    for (let i = 0; i < trees; i++) {
      const a = R(0, TAU), r = R(0.15, 0.72) * s, ts = R(0.9, 1.5) * s / 3;
      (rnd() < 0.65 ? pine : oak)(list, r * sin(a), 0.12 * s, r * cos(a), ts);
    }
    if (cs) castle(list, 0, 0.12 * s, grand ? -0.1 * s : 0, s, grand);
    const phase = R(0, TAU), amp = min(0.6, 0.06 * s);
    for (const q of list) far.push(setUV(kit.place(q, { x: cx, y: cy, z: cz }), phase, amp));
    if (wf) {
      const fg = new THREE.PlaneGeometry(0.22 * s, 4 * s, 1, 4);
      const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 4 * s / 3);
      falls.push(kit.place(fg, { x: cx + 0.2 * s, y: cy - 1.9 * s, z: cz + 1.0 * s }));
    }
  };
  // the board's island is the highest: the archipelago and the great castles float below it, where
  // the 3D view actually looks (measured: at the 3D preset only y < -18 shows at 40 units out);
  // two high islands remain as silhouettes for low free-orbit views
  island(4, -22, -34, 6.5, { trees: 7, castle: true, grand: true, falls: true });     // great castle behind black (seen by white)
  island(-6, -23, 35, 6.0, { trees: 6, castle: true, grand: true, falls: true });     // and behind white (seen by black)
  island(20, -12, -26, 3.4, { trees: 6 });
  island(31, -9, -7, 4.2, { trees: 7, falls: true });
  island(-32, -11, -8, 4.6, { trees: 8, falls: true });
  island(-17, -8, -21, 2.0, { trees: 3 });
  island(14, -7, -16, 1.4, { trees: 2 });
  island(26, -7, 26, 4.0, { trees: 6, castle: true });
  island(-26, -10, 22, 3.6, { trees: 5 });
  island(-30, 3, -48, 5.0, { trees: 5, castle: true });
  island(42, 5, -30, 3.8, { trees: 5 });

  // ---------------------------------------------------------------- cloud sea + far banks (the whole lot drifts round slowly)
  for (let i = 0; i < 46; i++) {
    const a = R(0, TAU), r = R(6, 80), s = R(14, 28);
    clouds.push(kit.place(new THREE.PlaneGeometry(s, s * 0.6).rotateX(-PI / 2), { x: r * sin(a), y: R(-31, -25), z: r * cos(a), ry: R(0, TAU) }));
  }
  for (let i = 0; i < 16; i++) {
    const a = R(0, TAU), r = R(48, 85), s = R(14, 26);
    clouds.push(kit.place(new THREE.PlaneGeometry(s, s * 0.4), { x: r * sin(a), y: R(-24, -10), z: r * cos(a), ry: a }));
  }

  // ---------------------------------------------------------------- meshes
  const mesh = (geoms, mat, name) => {
    const m = new THREE.Mesh(kit.merge(geoms), mat); geoms.forEach(g => g.dispose());
    m.name = name; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix();
    root.add(m); return m;
  };
  mesh(land, kit.material({ color: '#ffffff', roughness: 0.86, metalness: 0, envMapIntensity: 0.5 }), 'island');
  // distant islands bob gently, each on its own phase (uv.x) and amplitude (uv.y)
  mesh(far, animate(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, envMapIntensity: 0.5 }), 'far',
    'transformed.y += sin(uT * 0.33 + uv.x) * uv.y;'), 'far-islands');
  // the deck: irregular flagstones on one repeating canvas texture (warm grey, mossy joints)
  const deckTex = kit.canvasTexture(512, 512, (c, w) => {
    seed = 31;
    c.fillStyle = '#5e574c'; c.fillRect(0, 0, w, w);
    const rowsN = 4, hgt = w / rowsN;
    for (let r = 0; r < rowsN; r++) {
      let x = -R(0, hgt * 0.8);
      while (x < w) {
        const tw = hgt * R(0.8, 1.5), l = 52 + R(-8, 8), hue = 34 + R(-6, 6);
        c.fillStyle = `hsl(${hue}, ${R(8, 16)}%, ${l}%)`;
        const pad = 3;
        for (const dx of [0, w, -w]) {                                          // wrap horizontally
          c.beginPath(); c.roundRect(x + pad + dx, r * hgt + pad, tw - 2 * pad, hgt - 2 * pad, 6); c.fill();
        }
        for (let k = 0; k < 6; k++) {                                           // speckle + wear
          c.fillStyle = `rgba(${rnd() < 0.5 ? '255,250,235' : '60,50,40'},${R(0.04, 0.1)})`;
          const sx = x + R(0, tw), sy = r * hgt + R(0, hgt);
          for (const dx of [0, w, -w]) { c.beginPath(); c.arc(sx + dx, sy, R(4, 16), 0, TAU); c.fill(); }
        }
        x += tw;
      }
    }
    c.fillStyle = 'rgba(80,110,50,0.35)';                                         // a little moss in the joints
    for (let k = 0; k < 40; k++) { c.beginPath(); c.arc(R(0, w), Math.round(R(0, rowsN)) * hgt, R(2, 6), 0, TAU); c.fill(); }
  }, { repeat: true });
  deckTex.repeat.set(3.2, 3.2);
  mesh([deckGeom], new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.82, metalness: 0, envMapIntensity: 0.45 }), 'deck');
  // banners: sway from the crossbar, more toward the tail, each on its own phase
  mesh(cloths, animate(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.5 }), 'banner',
    'float h = uv.x, ph = uv.y; transformed.z += (sin(uT * 1.7 + ph + h * 2.6) * 0.09 + sin(uT * 2.9 + ph * 1.3 + h * 4.0) * 0.025) * h; transformed.x += sin(uT * 1.1 + ph) * 0.035 * h * h;'), 'banners');
  mesh(gold, kit.material({ color: '#e9bb62', metalness: 1, roughness: 0.28, vertexColors: false }), 'gold');
  const runeMat = new THREE.MeshBasicMaterial({ map: runeTexture(kit), transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) });
  mesh(runes, runeMat, 'runes');
  const flameTex = kit.canvasTexture(64, 128, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    for (const [s, col0] of [[1, 'rgba(255,90,20,0.9)'], [0.7, 'rgba(255,170,50,0.95)'], [0.4, 'rgba(255,240,170,1)']]) {
      const g = c.createRadialGradient(w / 2, h * 0.78, 0, w / 2, h * 0.7, w * 0.5 * s);
      g.addColorStop(0, col0); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath();
      c.moveTo(w / 2, h * (1 - 0.95 * s)); c.bezierCurveTo(w * (0.5 + 0.45 * s), h * 0.55, w * (0.5 + 0.4 * s), h * 0.95, w / 2, h * 0.97);
      c.bezierCurveTo(w * (0.5 - 0.4 * s), h * 0.95, w * (0.5 - 0.45 * s), h * 0.55, w / 2, h * (1 - 0.95 * s)); c.fill();
    }
  });
  // flames lick (the tip sways and stretches) and flicker in brightness, per brazier
  mesh(flames, animate(new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), 'flame',
    'float fh = uv.y * uv.y, fp = position.x * 1.7 + position.z * 2.3; transformed.x += sin(uT * 9.0 + fp + uv.y * 4.0) * 0.07 * fh; transformed.z += cos(uT * 7.3 + fp) * 0.05 * fh; transformed.y += sin(uT * 12.0 + fp * 1.3) * 0.12 * fh; vAnim = 0.82 + 0.18 * sin(uT * 17.0 + fp * 3.1) * sin(uT * 5.3 + fp);',
    'diffuseColor.rgb *= vAnim;'), 'flames');
  const cloudTex = kit.canvasTexture(256, 128, (c, w, h) => {
    seed = 99;
    for (let i = 0; i < 16; i++) {
      const x = w * R(0.18, 0.82), y = h * R(0.35, 0.68), r = h * R(0.18, 0.36);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(250,250,255,0.25)'); g.addColorStop(1, 'rgba(240,244,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
  });
  const cloudMesh = mesh(clouds, new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color('#f4f1ec'), fog: true }), 'clouds');
  // waterfalls: a tileable streak texture scrolled down; the top/bottom/edge fades live in the shader
  const fallTex = kit.canvasTexture(64, 256, (c, w, h) => {
    seed = 5;
    c.fillStyle = 'rgba(225,238,255,0.72)'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 34; i++) {
      const x = R(0, w), bw = R(1, 3.5), y0 = R(0, h), len = R(h * 0.3, h * 0.9), a = R(0.25, 0.6);
      for (const dy of [0, -h, h]) {                                             // wrap vertically (tileable)
        c.fillStyle = rnd() < 0.55 ? `rgba(255,255,255,${a})` : `rgba(120,150,190,${a * 0.5})`;
        c.fillRect(x, y0 + dy, bw, len);
      }
    }
  }, { repeat: true });
  const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color('#eaf3ff') });
  fallMat.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec2 vFall;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFall = uv;');
    sh.fragmentShader = 'varying vec2 vFall;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\ndiffuseColor.a *= smoothstep(0.0, 0.22, vFall.x) * smoothstep(1.0, 0.78, vFall.x) * smoothstep(0.0, 0.7, vFall.y);');
  };
  fallMat.customProgramCacheKey = () => 'fantasyEnv_fall';
  mesh(falls, fallMat, 'waterfalls');
  // sky dome: deep blue zenith, warm haze at the horizon, pale cloud-sea below
  const dome = new THREE.SphereGeometry(150, 32, 16);
  const zen = col('#3f6fc4'), mid = col('#8fb6e6'), hor = col('#f3dcb8'), low = col('#c9d3e4');
  paintAll(dome, (x, y) => {
    const t = y / 150;
    return t > 0.35 ? lerp3(mid, zen, min(1, (t - 0.35) / 0.65)) : t > 0.02 ? lerp3(hor, mid, (t - 0.02) / 0.33) : lerp3(hor, low, min(1, -t / 0.25));
  });
  mesh([dome], new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }), 'sky').renderOrder = -1;

  /** env.update(dt ms, t s): called by the board only while the island is visible + ambient anim is on. */
  const update = (dt, t) => {
    clock.value = t % 3600;
    fallTex.offset.y = (fallTex.offset.y + dt * 0.00055) % 1;                      // water streams down
    cloudMesh.rotation.y = (t * 0.004) % TAU; cloudMesh.updateMatrix();             // the cloud sea drifts round
    runeMat.color.setScalar(1.1 + 0.28 * sin(t * 1.6));                            // medallions breathe
  };

  return {
    // minPhi 0.24 rad (> the Tilt preset's 13°): Tilt only ever showed a sliver of deck, and an env
    // with update() makes the board re-render at the ambient rate while it is visible. Top + Tilt
    // pay nothing; 3D / Free get the living island.
    object: root, minPhi: 0.24, update,
    background: new THREE.Color('#1c2a46'),            // Top view (env hidden): a deep dusk blue round the board
    fog: new THREE.Fog('#d9e2ef', 40, 150),
    envScene: kit.studioEnvironment(),
  };
}
