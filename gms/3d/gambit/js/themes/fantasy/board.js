// Fantasy board environment (refs/ref_fantasy_island_board.jpg): the board (Classic's marble
// squares + lacquer frame, so D28 square contrast is untouched) sits on a floating stone island —
// a tiled deck with a gold-trimmed edge, glowing blue rune medallions at the corners, braziers
// with fire, heraldic banners (blue on white's side, red on black's), waterfalls spilling off the
// rim — high above a sea of clouds, with distant floating islands and a castle under a sky dome.
// Only shown when the camera tilts (minPhi): the Top view pays nothing for it.
// 8 draw calls, ~25k triangles; nothing casts shadows; static (no per-frame work).

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
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** superellipse radius factor: a rounded square when applied to a circle (n = 6) */
const squircle = (th, n = 6) => 1 / Math.pow(Math.pow(abs(cos(th)), n) + Math.pow(abs(sin(th)), n), 1 / n);

const DECK = 5.75, DECK_Y = -0.34;

export function environment(THREE, kit) {
  seed = 7;
  const col = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
  const paintAll = (g, fn) => {
    kit.ensureColor(g);
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); c.setXYZ(i, v[0], v[1], v[2]); }
    return g;
  };
  const root = new THREE.Group(); root.name = 'fantasy-env';
  const land = [], gold = [], runes = [], flames = [], clouds = [], falls = [];
  let deckGeom = null;
  const cloths = [];

  // ---------------------------------------------------------------- the island under the board
  const stone = col('#b8ad98'), stoneD = col('#8f8574'), joint = col('#6d6457'), rock = col('#7c7266'), rockD = col('#4f4840'),
    earth = col('#6b5640'), grass = col('#5f8a3c'), grassL = col('#86ad4f'), moss = col('#4f7434');
  {
    // profile: deck top, short edge, block wall, then a craggy underside narrowing to a point
    const prof = [[DECK - 0.1, DECK_Y], [DECK, DECK_Y], [DECK + 0.02, DECK_Y - 0.08], [DECK, DECK_Y - 0.12], [DECK - 0.04, -0.62], [DECK - 0.06, -1.05]];
    for (let i = 1; i <= 14; i++) { const t = i / 14; prof.push([(DECK - 0.1) * (1 - t) ** 1.25 + 0.05, -1.05 - 8.2 * t ** 1.15]); }
    const g = kit.lathe(prof.map(([r, y]) => new THREE.Vector2(r, y)), { segments: 72 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = atan2(x, z);
      let k = squircle(th);
      if (y < -1.0) k *= 1 + 0.16 * (vnoise(th * 3.2 + 7, y * 0.9) - 0.5) + 0.07 * (vnoise(th * 9, y * 2.6) - 0.5);   // crags
      p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    paintAll(g, (x, y, z) => {
      if (y > DECK_Y - 0.001) {
        // deck tiles: a 0.6 grid with darker joints, worn colour per tile
        const tx = (x + 30) / 0.62, tz = (z + 30) / 0.62, j = min(abs(tx - Math.round(tx)), abs(tz - Math.round(tz)));
        const c = lerp3(stoneD, stone, 0.55 + 0.45 * hash2(floor(tx), floor(tz)));
        return j < 0.06 ? joint : c;
      }
      if (y > -1.06) return lerp3(stoneD, stone, 0.5 + 0.5 * vnoise(atan2(x, z) * 14, y * 9));
      const th = atan2(x, z), n = vnoise(th * 6, y * 1.4);
      if (y > -1.6) return lerp3(moss, grassL, n);                                   // grassy lip under the wall
      if (y > -2.6 && n > 0.62) return moss;                                          // hanging greenery
      return lerp3(rockD, lerp3(rock, earth, n), min(1, (y + 9.3) / 5));
    });
    land.push(g);
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
    for (const ry of [0, PI / 3, -PI / 3]) flames.push(kit.place(new THREE.PlaneGeometry(0.7 * s, 1.15 * s), { x, y: y + 0.5 * s, z, ry }));
  };
  for (const [x, z] of [[-5.2, -2.3], [5.2, -2.3], [-5.2, 2.3], [5.2, 2.3]]) {
    const ped = kit.lathe(kit.profile().pt(0, 0).pt(0.34, 0).pt(0.34, 0.1).pt(0.24, 0.16).pt(0.18, 0.5).pt(0.26, 0.58).pt(0.26, 0.66).pt(0, 0.66).points(), { segments: 8 });
    paintAll(ped, (px, py) => lerp3(stoneD, stone, 0.4 + 0.6 * (py / 0.66)));
    land.push(kit.place(ped, { x, z, y: DECK_Y }));
    const bowl = kit.lathe(kit.profile().pt(0, 0.66).pt(0.07, 0.66).pt(0.09, 0.71).bez(0.27, 0.72, 0.31, 0.86, 3).pt(0.28, 0.87).bez(0.22, 0.77, 0.0, 0.8, 3).points(), { segments: 16 });
    gold.push(kit.place(bowl, { x, z, y: DECK_Y }));
    flameAt(x, DECK_Y + 0.78, z, 1);
  }

  // ---------------------------------------------------------------- banners on gold poles
  const banner = (x, z, cloth, facing) => {
    const H = 2.9, W = 0.74, L = 1.55;
    gold.push(kit.place(kit.cylinder(0.035, 0.045, H, 8), { x, z, y: DECK_Y + H / 2 }));
    gold.push(kit.place(kit.sphere(0.08, 10, 8), { x, z, y: DECK_Y + H + 0.05 }));
    gold.push(kit.place(kit.cylinder(0.026, 0.026, W + 0.2, 6), { x, z, y: DECK_Y + H - 0.12, rz: PI / 2, ry: facing }));
    gold.push(kit.place(kit.cylinder(0.035, 0.045, 0.3, 8), { x, z, y: DECK_Y + 0.15 }));
    // cloth: a subdivided sheet (so the gold border is one narrow column of vertex colour),
    // swallow-tailed, hanging from the crossbar with a slight wave; double-sided material
    const top = DECK_Y + H - 0.14;
    const g = new THREE.PlaneGeometry(W, L, 14, 12);
    const gp = g.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), v = (gp.getY(i) + L / 2) / L;                          // 1 at the top
      let y = -L * (1 - v);
      if (v < 1e-3) y += 0.28 * (1 - abs(x) / (W / 2));                             // the swallowtail notch
      gp.setXYZ(i, x, y, 0.06 * sin(y * 3.4 + x * 2));
    }
    g.computeVertexNormals();
    const c0 = col(cloth), c1 = lerp3(col(cloth), [0, 0, 0], 0.5), border = col('#e9bb62');
    paintAll(g, (px, py) => (abs(px) > W / 2 - 0.03 || py > -0.07 ? border : lerp3(c0, c1, min(1, -py / L))));
    cloths.push(kit.place(kit.place(g, { y: top }), { x, z, ry: facing }));
    // gold emblem: a small crowned shield on the cloth (both faces)
    const crest = [[-0.17, -0.42], [0.17, -0.42], [0.17, -0.7], [0, -0.86], [-0.17, -0.7]];
    for (const off of [0.022, -0.022]) {
      const e = kit.extrude(crest, { depth: 0.012, bevel: 0.004, bevelSegments: 1 });
      const crown = kit.extrude([[-0.13, -0.38], [0.13, -0.38], [0.15, -0.26], [0.07, -0.32], [0, -0.22], [-0.07, -0.32], [-0.15, -0.26]], { depth: 0.012, bevel: 0.003, bevelSegments: 1 });
      for (const q of [e, crown]) {
        const qp = q.attributes.position;
        for (let i = 0; i < qp.count; i++) qp.setZ(i, qp.getZ(i) + off + 0.06 * sin(qp.getY(i) * 3.4 + qp.getX(i) * 2));
        q.computeVertexNormals();
        gold.push(kit.place(kit.place(q, { y: top }), { x, z, ry: facing }));
      }
    }
  };
  banner(-5.3, 3.9, '#2a5fd2', 0); banner(5.3, 3.9, '#2a5fd2', 0);           // white's side (+z)
  banner(-5.3, -3.9, '#a3121c', 0); banner(5.3, -3.9, '#a3121c', 0);         // black's side

  // ---------------------------------------------------------------- shrubs + little trees at the deck corners
  const tree = (x, y, z, s) => {
    const trunk = kit.cylinder(0.05 * s, 0.07 * s, 0.4 * s, 5);
    paintAll(trunk, () => col('#5a4030'));
    land.push(kit.place(trunk, { x, y: y + 0.2 * s, z }));
    for (let k = 0; k < 3; k++) {
      const c = kit.cylinder(0, (0.42 - k * 0.1) * s, 0.55 * s, 7);
      paintAll(c, (px, py) => lerp3(col('#2f5a2a'), col('#5c8a3a'), 0.3 + k * 0.25));
      land.push(kit.place(c, { x, y: y + (0.55 + k * 0.32) * s, z }));
    }
  };
  const bush = (x, y, z, s) => {
    const b = new THREE.IcosahedronGeometry(0.32 * s, 0);
    paintAll(b, (px, py) => lerp3(moss, grassL, 0.4 + 0.6 * (py / (0.32 * s) * 0.5 + 0.5)));
    land.push(kit.place(b, { x, y: y + 0.18 * s, z, sy: 0.75 }));
  };
  for (const [x, z] of [[-5.45, -5.0], [5.45, -5.0], [-5.0, -5.45], [5.0, -5.45]]) bush(x, DECK_Y, z, R(0.8, 1.1));
  tree(-5.35, DECK_Y, -4.4, 1.2); tree(5.4, DECK_Y, -4.45, 1.1); tree(-5.4, DECK_Y, 4.6, 0.8); tree(5.42, DECK_Y, 4.55, 0.85);

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
    falls.push(kit.place(g, { x, z, y: DECK_Y - 0.05 - len / 2, ry: th }));
  };
  fall(-PI / 2 + 0.25, 0.9, 11); fall(PI / 2 - 0.45, 0.7, 9.5); fall(PI - 0.3, 0.8, 10);

  // ---------------------------------------------------------------- distant floating islands + a castle
  const island = (cx, cy, cz, s, { trees = 4, castle = false, falls: wf = false } = {}) => {
    const prof = [[0, 0.14], [0.85, 0.14], [1.02, 0.08], [1.0, -0.05], [0.97, -0.45], [0.9, -0.62]];
    for (let i = 1; i <= 7; i++) { const t = i / 7; prof.push([0.88 * (1 - t) ** 1.5 + 0.02, -0.62 - 2.0 * t ** 1.05]); }
    const g = kit.lathe(prof.map(([r, y]) => new THREE.Vector2(r * s, y * s)), { segments: 22 });
    const p = g.attributes.position, sd = cx * 0.37 + cz * 0.11;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = atan2(x, z);
      const k = 1 + 0.22 * (vnoise(th * 2.5 + sd, y / s * 1.5) - 0.5) + (y < 0 ? 0.12 * (vnoise(th * 7 + sd, y / s * 4) - 0.5) : 0);
      p.setXYZ(i, x * k * (1 + 0.25 * sin(th * 2 + sd)), y, z * k);
    }
    g.computeVertexNormals();
    paintAll(g, (x, y, z) => {
      const n = vnoise(atan2(x, z) * 5 + sd, y / s * 2);
      if (y > 0.05 * s) return lerp3(grass, grassL, n);
      if (y > -0.12 * s) return lerp3(moss, grass, n);
      const band = 0.5 + 0.5 * sin(y / s * 14 + n * 3);                             // rock strata
      return lerp3(lerp3(rockD, rock, n), col('#9a8f80'), 0.35 * band * (y > -0.7 * s ? 1 : 0.4));
    });
    land.push(kit.place(g, { x: cx, y: cy, z: cz }));
    for (let i = 0; i < trees; i++) {
      const a = R(0, TAU), r = R(0.15, 0.7) * s;
      tree(cx + r * sin(a), cy + 0.12 * s, cz + r * cos(a), R(0.9, 1.6) * s / 3);
    }
    if (castle) {
      const wall = col('#e9e0cf'), roof = col('#3a5fb0');
      const tower = (x, z, r, h) => {
        const t = kit.cylinder(r, r * 1.05, h, 10);
        paintAll(t, () => wall);
        land.push(kit.place(t, { x: cx + x * s, y: cy + 0.12 * s + h / 2, z: cz + z * s }));
        const c = kit.cylinder(0, r * 1.35, r * 2.6, 10);
        paintAll(c, () => roof);
        land.push(kit.place(c, { x: cx + x * s, y: cy + 0.12 * s + h + r * 1.3, z: cz + z * s }));
      };
      const keep = kit.bevelBox(0.5 * s, 0.55 * s, 0.4 * s, 0.02 * s, 1);
      paintAll(keep, () => wall);
      land.push(kit.place(keep, { x: cx, y: cy + 0.12 * s + 0.275 * s, z: cz }));
      tower(0, 0, 0.12 * s, 1.0 * s);
      for (const [x, z, h] of [[-0.32, 0.2, 0.6], [0.32, 0.2, 0.7], [-0.3, -0.25, 0.75], [0.3, -0.24, 0.55], [0.0, 0.32, 0.45]]) tower(x, z, 0.075 * s, h * s);
    }
    if (wf) fallsAt(cx, cy, cz, s);
  };
  const fallsAt = (cx, cy, cz, s) => {
    const g = new THREE.PlaneGeometry(0.22 * s, 4 * s, 1, 4);
    falls.push(kit.place(g, { x: cx + 0.2 * s, y: cy - 1.9 * s, z: cz + 1.0 * s }));
  };
  island(-24, 1.5, -34, 5.5, { trees: 3, castle: true, falls: true });
  island(21, -1.5, -29, 3.4, { trees: 5 });
  island(36, 3, -6, 4.2, { trees: 6, falls: true });
  island(-37, -0.5, -4, 4.6, { trees: 7 });
  island(6, 7, -60, 8.5, { trees: 4, castle: true, falls: true });
  island(-13, -5.5, -21, 1.8, { trees: 2 });
  island(13, -6.5, -16, 1.4, { trees: 1 });
  island(26, 0.5, 31, 4.2, { trees: 5 });
  island(-28, 2.5, 27, 3.6, { trees: 4, castle: true });
  island(-8, -7, 24, 2.2, { trees: 2 });

  // ---------------------------------------------------------------- cloud sea + drifting puffs
  for (let i = 0; i < 46; i++) {
    const a = R(0, TAU), r = R(9, 80), s = R(14, 28);
    clouds.push(kit.place(new THREE.PlaneGeometry(s, s * 0.6).rotateX(-PI / 2), { x: r * sin(a), y: R(-13, -9), z: r * cos(a), ry: R(0, TAU) }));
  }
  for (let i = 0; i < 16; i++) {
    const a = R(0, TAU), r = R(48, 85), s = R(14, 26);
    const q = new THREE.PlaneGeometry(s, s * 0.4);
    clouds.push(kit.place(q, { x: r * sin(a), y: R(-8, -1), z: r * cos(a), ry: a }));
  }

  // ---------------------------------------------------------------- meshes
  const mesh = (geoms, mat, name) => {
    const m = new THREE.Mesh(kit.merge(geoms), mat); geoms.forEach(g => g.dispose());
    m.name = name; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix();
    root.add(m); return m;
  };
  mesh(land, kit.material({ color: '#ffffff', roughness: 0.86, metalness: 0, envMapIntensity: 0.5 }), 'island');
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
  const dm = mesh([deckGeom], new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.82, metalness: 0, envMapIntensity: 0.45 }), 'deck');
  void dm;
  mesh(cloths, kit.material({ color: '#ffffff', roughness: 0.75, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.5 }), 'banners');
  mesh(gold, kit.material({ color: '#e9bb62', metalness: 1, roughness: 0.28, vertexColors: false }), 'gold');
  const runeTex = kit.canvasTexture(256, 256, (c, w) => {
    const m = w / 2;
    const bg = c.createRadialGradient(m, m, 0, m, m, m);                          // a deep blue enamel disc
    bg.addColorStop(0, 'rgba(20,50,120,0.95)'); bg.addColorStop(0.9, 'rgba(10,30,80,0.95)'); bg.addColorStop(1, 'rgba(10,30,80,0)');
    c.fillStyle = bg; c.fillRect(0, 0, w, w);
    c.shadowColor = '#2f8cff'; c.shadowBlur = 14; c.strokeStyle = '#7cc4ff'; c.lineCap = 'round';
    for (const [r, lw] of [[0.42, 5], [0.33, 3], [0.14, 4]]) { c.lineWidth = lw; c.beginPath(); c.arc(m, m, r * w, 0, TAU); c.stroke(); }
    c.lineWidth = 3;
    for (let k = 0; k < 12; k++) {                                                  // rune glyphs in the band
      const a = k * TAU / 12, x = m + Math.sin(a) * 0.375 * w, y = m - Math.cos(a) * 0.375 * w;
      c.save(); c.translate(x, y); c.rotate(a); c.beginPath();
      const g = k % 3;
      if (g === 0) { c.moveTo(0, -9); c.lineTo(0, 9); c.moveTo(-6, -3); c.lineTo(6, 3); }
      else if (g === 1) { c.moveTo(-6, 8); c.lineTo(0, -9); c.lineTo(6, 8); c.moveTo(-3, 2); c.lineTo(3, 2); }
      else { c.moveTo(-6, -8); c.lineTo(6, -8); c.lineTo(-6, 8); c.lineTo(6, 8); }
      c.stroke(); c.restore();
    }
    c.lineWidth = 4; c.beginPath();                                                   // an eight-point star
    for (let k = 0; k < 16; k++) { const a = k * TAU / 16, r = (k % 2 ? 0.1 : 0.3) * w; c.lineTo(m + Math.sin(a) * r, m - Math.cos(a) * r); }
    c.closePath(); c.stroke();
  });
  mesh(runes, new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) }), 'runes');
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
  mesh(flames, new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), 'flames');
  const cloudTex = kit.canvasTexture(256, 128, (c, w, h) => {
    seed = 99;
    for (let i = 0; i < 16; i++) {
      const x = w * R(0.18, 0.82), y = h * R(0.35, 0.68), r = h * R(0.18, 0.36);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(250,250,255,0.25)'); g.addColorStop(1, 'rgba(240,244,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
  });
  mesh(clouds, new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color('#f4f1ec'), fog: true }), 'clouds');
  const fallTex = kit.canvasTexture(64, 256, (c, w, h) => {
    seed = 5;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(235,245,255,0.95)'); g.addColorStop(0.7, 'rgba(210,230,255,0.6)'); g.addColorStop(1, 'rgba(230,240,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(0,0,0,${R(0.2, 0.6)})`; c.fillRect(R(0, w), 0, R(1, 3), h); }
    c.globalCompositeOperation = 'destination-in';
    const e = c.createLinearGradient(0, 0, w, 0);
    e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(0.2, 'rgba(0,0,0,1)'); e.addColorStop(0.8, 'rgba(0,0,0,1)'); e.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = e; c.fillRect(0, 0, w, h);
  });
  mesh(falls, new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color('#eaf3ff') }), 'waterfalls');
  // sky dome: deep blue zenith, warm haze at the horizon, pale cloud-sea below
  const dome = new THREE.SphereGeometry(150, 32, 16);
  const zen = col('#3f6fc4'), mid = col('#8fb6e6'), hor = col('#f3dcb8'), low = col('#c9d3e4');
  paintAll(dome, (x, y) => {
    const t = y / 150;
    return t > 0.35 ? lerp3(mid, zen, min(1, (t - 0.35) / 0.65)) : t > 0.02 ? lerp3(hor, mid, (t - 0.02) / 0.33) : lerp3(hor, low, min(1, -t / 0.25));
  });
  mesh([dome], new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }), 'sky').renderOrder = -1;

  return {
    object: root, minPhi: 0.12,
    background: new THREE.Color('#1c2a46'),            // Top view (env hidden): a deep dusk blue round the board
    fog: new THREE.Fog('#d9e2ef', 40, 150),
    envScene: kit.studioEnvironment(),
  };
}
