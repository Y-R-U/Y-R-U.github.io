// Sci-fi board: a station command deck.
//   Squares: frosted pearl ceramic tiles vs smoked gunmetal glass (D28: the dark square sits at
//   Classic's value, #656d7c, well above the black pieces' gunmetal), one canvas texture, plus an
//   emissive map that lights only the thin grid seams — cyan on white's half fading through
//   violet to magenta on black's half — with a brighter node at every seam crossing.
//   Frame: bevelled gunmetal with corner docking clamps; light strips along every edge (cyan on
//   white's side, magenta on black's) and running-light dots.  3 draw calls, no per-frame work.
//
// Environment (tilted views only, minPhi): the deck sits on a station platform (panelled deck
// plate, radial light rails, a railing of viewport mullions with light strips) floating in space;
// a starfield + nebula sky (a camera-centred sphere with a procedural star shader), a ringed gas giant beyond
// black's side, a moon and a ring station beyond white's side, and three small ships drifting
// across with blinking nav lights (env.update moves them; it only runs while the env is visible).
// Top view pays nothing but the background clear.

const { sin, cos, PI, floor, min, max, hypot } = Math;
const TAU = PI * 2;

let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// colours (one place to tune)
export const LOOK = {
  light: '#d3d8df', lightHi: '#e6eaef', lightLo: '#c1c7d0', lightLabel: '#4a5466',
  dark: '#656d7c', darkHi: '#76808f', darkLo: '#575e6c', darkLabel: '#e3e9f3',
  seam: '#1d222b', cyan: '#19c8ff', magenta: '#ff2a78', violet: '#9a5cff',
  frame: '#3a404b', frameTrim: '#8e98a8', clamp: '#575f6d',
};

export const overlayStyle = { lastMove: '#2fd2ff', select: '#ffffff', hint: '#ff4f95', hover: '#ffffff', dot: '#0d1a28' };

export function build(THREE, kit, { orientation = 'w', coordinates = true } = {}) {
  const g = new THREE.Group(); g.name = 'scifi-board';
  const S = 128, N = S * 8;
  const flip = orientation === 'b';

  // ---- squares (albedo) ----
  const tex = kit.canvasTexture(N, N, (c) => {
    seed = 11;
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const dark = (f + r) % 2 === 0, x = f * S, y = (7 - r) * S;
      if (dark) glassTile(c, x, y, S); else ceramicTile(c, x, y, S);
    }
    // seams: a dark gap between tiles (the glowing core lives in the emissive map)
    c.fillStyle = LOOK.seam;
    for (let i = 0; i <= 8; i++) { c.fillRect(i * S - 2, 0, 4, N); c.fillRect(0, i * S - 2, N, 4); }
    if (!coordinates) return;
    c.font = `700 ${Math.round(S * 0.19)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    for (let i = 0; i < 8; i++) {
      label(c, S, flip ? 7 : 0, i, String(i + 1), 'tl', flip);
      label(c, S, i, flip ? 7 : 0, 'abcdefgh'[i], 'br', flip);
    }
  });
  // ---- seam glow (emissive) ----
  const emi = kit.canvasTexture(N, N, (c) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, N, N);
    const grad = c.createLinearGradient(0, N, 0, 0);       // canvas bottom = rank 1 = white's side
    grad.addColorStop(0, LOOK.cyan); grad.addColorStop(0.38, LOOK.cyan);
    grad.addColorStop(0.5, LOOK.violet);
    grad.addColorStop(0.62, LOOK.magenta); grad.addColorStop(1, LOOK.magenta);
    c.globalAlpha = 0.5; c.fillStyle = grad;
    for (let i = 1; i < 8; i++) { c.fillRect(i * S - 1, 0, 2, N); c.fillRect(0, i * S - 1, N, 2); }
    // brighter nodes at the crossings
    c.globalAlpha = 1;
    for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) c.fillRect(i * S - 3, j * S - 3, 6, 6);
  });
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-PI / 2),
    new THREE.MeshStandardMaterial({ map: tex, emissiveMap: emi, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.9,
      roughness: 0.3, metalness: 0.05, envMapIntensity: 0.5 }));
  surf.receiveShadow = true; surf.name = 'surface';
  g.add(surf);

  // ---- frame: gunmetal, bevelled, with corner clamps (one vertex-coloured material) ----
  const col = h => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
  const paint = (geo, rgb) => { kit.ensureColor(geo); const c = geo.attributes.color; for (let i = 0; i < c.count; i++) c.setXYZ(i, rgb[0], rgb[1], rgb[2]); return geo; };
  const b = 0.03, outer = 4.5, depth = 0.36;
  const fshape = kit.roundedRect((outer - b) * 2, (outer - b) * 2, 0.16);
  const h = 4 + b, hole = new THREE.Path();
  hole.moveTo(-h, -h); hole.lineTo(h, -h); hole.lineTo(h, h); hole.lineTo(-h, h); hole.lineTo(-h, -h);
  fshape.holes.push(hole);
  const fg = new THREE.ExtrudeGeometry(fshape, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
  fg.rotateX(-PI / 2); fg.translate(0, -(depth + b) + 0.03, 0);
  const frameParts = [paint(fg, col(LOOK.frame))];
  // raised trim lip around the squares and a channel ridge near the outer edge
  const sq = r => { const p = new THREE.Path(); p.moveTo(-r, -r); p.lineTo(r, -r); p.lineTo(r, r); p.lineTo(-r, r); p.lineTo(-r, -r); return p; };
  const band = (ro, ri, d) => { const s = new THREE.Shape(sq(ro).getPoints()); s.holes.push(sq(ri)); return kit.extrude(s, { depth: d, bevel: 0.004, bevelSegments: 1, curveSegments: 1 }); };
  frameParts.push(paint(kit.place(band(4.07, 4.025, 0.014), { rx: -PI / 2, y: 0.03 }), col(LOOK.frameTrim)));
  frameParts.push(paint(kit.place(band(4.41, 4.37, 0.016), { rx: -PI / 2, y: 0.03 }), col(LOOK.frameTrim)));
  // docking clamps at the corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cl = kit.bevelBox(0.42, 0.07, 0.42, 0.03);
    frameParts.push(paint(kit.place(cl, { x: sx * 4.27, y: 0.065, z: sz * 4.27, ry: PI / 4 }), col(LOOK.clamp)));
    const nub = kit.bevelBox(0.16, 0.05, 0.16, 0.015);
    frameParts.push(paint(kit.place(nub, { x: sx * 4.27, y: 0.115, z: sz * 4.27, ry: PI / 4 }), col(LOOK.frameTrim)));
  }
  const frame = new THREE.Mesh(kit.merge(frameParts), kit.material({ color: '#ffffff', roughness: 0.38, metalness: 0.65, envMapIntensity: 0.9 }));
  frame.receiveShadow = true; frame.name = 'frame';
  g.add(frame);

  // ---- glow: edge light strips + running-light dots (unlit, vertex colours) ----
  const glow = [];
  const C = col(LOOK.cyan), M = col(LOOK.magenta), V = col(LOOK.violet);
  const strip = (x, z, w, d, rgb) => glow.push(paint(kit.place(new THREE.BoxGeometry(w, 0.012, d), { x, y: 0.034, z }), rgb));
  // along white's (+z) and black's (-z) edges, between the clamps
  strip(0, 4.22, 7.0, 0.05, C); strip(0, -4.22, 7.0, 0.05, M);
  // the side edges: cyan half / magenta half with a violet join
  for (const sx of [-1, 1]) {
    strip(sx * 4.22, 1.85, 0.05, 3.3, C); strip(sx * 4.22, -1.85, 0.05, 3.3, M);
    glow.push(paint(kit.place(new THREE.BoxGeometry(0.05, 0.012, 0.2), { x: sx * 4.22, y: 0.034, z: 0 }), V));
  }
  // running lights on the clamp nubs + small dots down the frame's outer face
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    glow.push(paint(kit.place(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 10), { x: sx * 4.27, y: 0.145, z: sz * 4.27 }), sz > 0 ? C : M));
  }
  for (let i = -3; i <= 3; i++) {
    for (const sz of [-1, 1]) glow.push(paint(kit.place(new THREE.BoxGeometry(0.12, 0.03, 0.01), { x: i * 1.1, y: -0.12, z: sz * 4.505 }), sz > 0 ? C : M));
    for (const sx of [-1, 1]) glow.push(paint(kit.place(new THREE.BoxGeometry(0.01, 0.03, 0.12), { x: sx * 4.505, y: -0.12, z: i * 1.1 }), i > 0 ? C : i < 0 ? M : V));
  }
  const glowMesh = new THREE.Mesh(kit.merge(glow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  glowMesh.name = 'frame-lights';
  g.add(glowMesh);
  return g;
}

function ceramicTile(c, x, y, S) {
  const gr = c.createLinearGradient(x, y, x + S, y + S);
  gr.addColorStop(0, LOOK.lightHi); gr.addColorStop(0.5, LOOK.light); gr.addColorStop(1, LOOK.lightLo);
  c.fillStyle = gr; c.fillRect(x, y, S, S);
  // frosted speckle
  for (let i = 0; i < 260; i++) {
    c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(90,100,120,0.06)';
    c.fillRect(x + rnd() * S, y + rnd() * S, 1.5, 1.5);
  }
  // bevel: light top/left edge, darker bottom/right edge, a faint inset panel line
  c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(x + 2, y + 2, S - 4, 2); c.fillRect(x + 2, y + 2, 2, S - 4);
  c.fillStyle = 'rgba(40,50,70,0.22)'; c.fillRect(x + 2, y + S - 4, S - 4, 2); c.fillRect(x + S - 4, y + 2, 2, S - 4);
  c.strokeStyle = 'rgba(70,82,102,0.12)'; c.lineWidth = 1; c.strokeRect(x + 10.5, y + 10.5, S - 21, S - 21);
}

function glassTile(c, x, y, S) {
  const gr = c.createLinearGradient(x, y, x + S, y + S);
  gr.addColorStop(0, LOOK.darkHi); gr.addColorStop(0.45, LOOK.dark); gr.addColorStop(1, LOOK.darkLo);
  c.fillStyle = gr; c.fillRect(x, y, S, S);
  // smoked-glass sheen: one soft diagonal streak
  c.save(); c.beginPath(); c.rect(x, y, S, S); c.clip();
  c.translate(x + S / 2, y + S / 2); c.rotate(-PI / 4);
  const sh = c.createLinearGradient(-S * 0.3, 0, S * 0.3, 0);
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(220,235,255,0.07)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sh; c.fillRect(-S * 0.3 + (rnd() - 0.5) * S * 0.3, -S, S * 0.6, S * 2);
  c.restore();
  // fine circuit-like inset: a thin inner frame with a cut corner
  c.strokeStyle = 'rgba(20,26,36,0.22)'; c.lineWidth = 1.2;
  c.beginPath(); const i0 = 12, i1 = S - 12;
  c.moveTo(x + i0 + 14, y + i0); c.lineTo(x + i1, y + i0); c.lineTo(x + i1, y + i1); c.lineTo(x + i0, y + i1); c.lineTo(x + i0, y + i0 + 14); c.closePath(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(x + 2, y + 2, S - 4, 1.5); c.fillRect(x + 2, y + 2, 1.5, S - 4);
}

function label(c, S, f, r, text, corner, flip) {
  const dark = (f + r) % 2 === 0;
  const x0 = f * S, y0 = (7 - r) * S, pad = S * 0.08;
  c.save();
  c.fillStyle = dark ? LOOK.darkLabel : LOOK.lightLabel;
  c.translate(x0 + S / 2, y0 + S / 2);
  if (flip) c.rotate(PI);
  c.textBaseline = corner === 'tl' ? 'top' : 'bottom';
  c.textAlign = corner === 'tl' ? 'left' : 'right';
  const hx = S / 2 - pad;
  c.fillText(text, corner === 'tl' ? -hx : hx, corner === 'tl' ? -hx : hx);
  c.restore();
}

// =============================================================================== environment
const DECK_Y = -0.375, DECK_R = 7.0;

export function environment(THREE, kit) {
  seed = 5;
  const col = h => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
  const paint = (geo, rgb) => { kit.ensureColor(geo); const c = geo.attributes.color; for (let i = 0; i < c.count; i++) c.setXYZ(i, rgb[0], rgb[1], rgb[2]); return geo; };
  const root = new THREE.Group(); root.name = 'scifi-env';
  const metal = [], glow = [];

  // ---------------------------------------------------------------- station platform
  // octagonal deck plate with a panel texture
  const deckTex = kit.canvasTexture(512, 512, (c, w) => {
    c.fillStyle = '#262b34'; c.fillRect(0, 0, w, w);
    const P = w / 4;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = 34 + floor(rnd() * 9);
      c.fillStyle = `rgb(${v},${v + 4},${v + 12})`; c.fillRect(i * P + 3, j * P + 3, P - 6, P - 6);
      c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(i * P + 3, j * P + 3, P - 6, 2);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      for (const [a, b2] of [[8, 8], [P - 12, 8], [8, P - 12], [P - 12, P - 12]]) c.fillRect(i * P + a, j * P + b2, 4, 4);   // bolts
      if (rnd() < 0.3) { c.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 5; k++) c.fillRect(i * P + 20, j * P + 26 + k * 12, P - 40, 4); }   // vent slats
    }
  }, { repeat: true });
  deckTex.repeat.set(4, 4);
  const deckGeo = new THREE.CircleGeometry(DECK_R, 8, PI / 8).rotateX(-PI / 2);
  deckGeo.translate(0, DECK_Y, 0);
  {
    const uv = deckGeo.attributes.uv, p = deckGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / (2 * DECK_R) + 0.5, p.getZ(i) / (2 * DECK_R) + 0.5);
  }
  const deck = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.55, metalness: 0.5, envMapIntensity: 0.6 }));
  deck.receiveShadow = true; deck.name = 'deck';
  root.add(deck);
  // deck rim + hull underneath (a faceted lathe narrowing into the station spine)
  {
    const prof = [[DECK_R + 0.05, DECK_Y + 0.02], [DECK_R + 0.25, DECK_Y - 0.06], [DECK_R + 0.25, DECK_Y - 0.4], [DECK_R - 0.4, DECK_Y - 1.1],
      [DECK_R - 2.2, DECK_Y - 1.8], [4.5, DECK_Y - 3.2], [2.2, DECK_Y - 5.5], [1.6, DECK_Y - 9]];
    const hull = kit.lathe(prof.map(([r, y]) => new THREE.Vector2(r, y)), { segments: 8, phiStart: PI / 8 });
    hull.rotateY(PI / 8);
    paint(hull, col('#2e333d'));
    metal.push(hull);
  }
  // viewport mullions: a railing of slanted posts round the deck edge, with a top rail
  const NPOST = 16;
  for (let i = 0; i < NPOST; i++) {
    const a = i / NPOST * TAU + PI / 16;
    const r0 = DECK_R * cos(PI / 8) / cos(((a + PI / 8) % (PI / 4)) - PI / 8) - 0.1;
    const x = sin(a) * r0, z = cos(a) * r0;
    const post = kit.bevelBox(0.16, 1.0, 0.22, 0.04);
    post.translate(0, 0.5, 0); post.rotateX(-0.22); post.rotateY(a);
    post.translate(x, DECK_Y, z);
    metal.push(paint(post, col('#4a515e')));
    // light strip on the inner face of the post
    const ls = new THREE.BoxGeometry(0.04, 0.72, 0.02);
    ls.translate(0, 0.48, -0.12); ls.rotateX(-0.22); ls.rotateY(a); ls.translate(x, DECK_Y, z);
    glow.push(paint(ls, z > 0 ? col(LOOK.cyan) : col(LOOK.magenta)));
  }
  // top rail (octagonal ring) on the posts
  {
    const ring = new THREE.TorusGeometry(DECK_R + 0.25, 0.07, 6, 8);
    ring.rotateX(PI / 2); ring.rotateY(PI / 8); ring.translate(0, DECK_Y + 0.97, 0);
    metal.push(paint(ring, col('#5a6270')));
    const ring2 = new THREE.TorusGeometry(DECK_R - 0.15, 0.04, 4, 8);
    ring2.rotateX(PI / 2); ring2.rotateY(PI / 8); ring2.translate(0, DECK_Y + 0.12, 0);
    metal.push(paint(ring2, col('#5a6270')));
  }
  // radial light rails on the deck from the board's corners and edge midpoints
  for (let i = 0; i < 8; i += 2) {
    const a = i / 8 * TAU;
    const r0 = 4.75, r1 = DECK_R - 0.45;
    const len = r1 - r0, mid = (r0 + r1) / 2;
    const rail = new THREE.BoxGeometry(0.05, 0.01, len);
    rail.translate(0, DECK_Y + 0.006, mid); rail.rotateY(a);
    const zc = cos(a) * mid;
    glow.push(paint(rail, (zc > 0.5 ? col(LOOK.cyan) : zc < -0.5 ? col(LOOK.magenta) : col(LOOK.violet)).map(v => v * 0.6)));
  }
  // a plinth under the board (so the frame doesn't float on the deck)
  {
    const pl = kit.bevelBox(9.3, 0.08, 9.3, 0.03);
    pl.translate(0, DECK_Y + 0.02, 0);
    metal.push(paint(pl, col('#3b414c')));
  }
  // consoles beside the board (left/right of the players): angled desks with a glowing screen
  for (let i = 0; i < 4; i++) {
    const a = (i < 2 ? -1 : 1) * PI / 2 + (i % 2 ? 0.42 : -0.42), r = 5.75;
    const desk = kit.bevelBox(1.4, 0.55, 0.6, 0.06);
    desk.translate(0, 0.275, 0); desk.rotateY(a); desk.translate(sin(a) * r, DECK_Y, cos(a) * r);
    metal.push(paint(desk, col('#454c58')));
    const scr = new THREE.PlaneGeometry(1.15, 0.36);
    scr.rotateX(-PI / 2 + 0.6); scr.translate(0, 0.58, -0.05); scr.rotateY(a + PI); scr.translate(sin(a) * r, DECK_Y, cos(a) * r);
    // the screen faces the board: flip so its normal points inward
    glow.push(paint(scr, cos(a) > 0 ? col('#0e5f80') : col('#7a1440')));
  }

  const metalMesh = new THREE.Mesh(kit.merge(metal), kit.material({ color: '#ffffff', roughness: 0.42, metalness: 0.7, envMapIntensity: 0.8 }));
  metalMesh.name = 'station'; metalMesh.receiveShadow = true;
  root.add(metalMesh);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
  const glowMesh = new THREE.Mesh(kit.merge(glow), glowMat);
  glowMesh.name = 'station-lights';
  root.add(glowMesh);

  // ---------------------------------------------------------------- ringed gas giant (beyond black's side)
  {
    const ptex = kit.canvasTexture(512, 256, (c, w, h2) => {
      const bands = ['#d9b98c', '#c79a6a', '#e6cfa8', '#b88758', '#d7b083', '#9c6f4c', '#e9d6b4', '#c49567', '#a8795a'];
      let y = 0;
      while (y < h2) { const bh = 6 + rnd() * 26; c.fillStyle = bands[floor(rnd() * bands.length)]; c.fillRect(0, y, w, bh + 1); y += bh; }
      for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '255,240,220' : '90,60,40'},${0.04 + rnd() * 0.06})`; c.fillRect(rnd() * w, rnd() * h2, 20 + rnd() * 90, 1 + rnd() * 3); }
      c.fillStyle = 'rgba(170,80,50,0.55)'; c.beginPath(); c.ellipse(w * 0.62, h2 * 0.62, 22, 10, 0, 0, TAU); c.fill();   // storm
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(20, 48, 24), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.9, metalness: 0, envMapIntensity: 0.15 }));
    const rtex = kit.canvasTexture(512, 8, (c, w, h2) => {
      for (let x = 0; x < w; x++) {
        const t = x / w, a = (0.3 + 0.18 * sin(t * 23) + 0.1 * sin(t * 71 + 2)) * (t > 0.6 && t < 0.64 ? 0.15 : 1) * min(1, t * 6) * min(1, (1 - t) * 5);
        c.fillStyle = `rgba(${222 + floor(14 * sin(t * 9))},${206 + floor(12 * sin(t * 5))},${182},${max(0, a).toFixed(3)})`; c.fillRect(x, 0, 1, h2);
      }
    });
    const ringGeo = new THREE.RingGeometry(26, 42, 96, 1);
    { const p = ringGeo.attributes.position, uv = ringGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (hypot(p.getX(i), p.getY(i)) - 26) / 16, 0.5); }
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: rtex, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: new THREE.Color('#9a8f86') }));
    ring.rotation.x = -PI / 2 + 0.32;
    const sys = new THREE.Group(); sys.add(planet, ring);
    sys.rotation.z = 0.35;
    sys.position.set(-23, -36, -93);   // rises over the far railing in the 3D view (white's side)
    sys.name = 'gas-giant';
    root.add(sys);
  }

  // ---------------------------------------------------------------- moon + ring station (beyond white's side)
  {
    const mtex = kit.canvasTexture(256, 128, (c, w, h2) => {
      c.fillStyle = '#8d93a0'; c.fillRect(0, 0, w, h2);
      for (let i = 0; i < 70; i++) { const r = 2 + rnd() * 9; c.fillStyle = `rgba(${rnd() < 0.5 ? '40,44,54' : '210,214,224'},${0.15 + rnd() * 0.2})`; c.beginPath(); c.arc(rnd() * w, rnd() * h2, r, 0, TAU); c.fill(); }
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 16), new THREE.MeshStandardMaterial({ map: mtex, roughness: 1, metalness: 0, envMapIntensity: 0.1 }));
    moon.position.set(12.5, -31, 75); moon.name = 'moon';
    root.add(moon);
    // ring station: torus habitat, four spokes, hub with a long spine
    const st = [];
    const ringG = new THREE.TorusGeometry(5, 0.55, 6, 32); st.push(paint(ringG, col('#9aa3b2')));
    for (let i = 0; i < 4; i++) { const sp = new THREE.CylinderGeometry(0.18, 0.18, 9.4, 6); sp.rotateZ(i * PI / 4); st.push(paint(sp, col('#7c8594'))); }
    const hub = new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10); hub.rotateX(PI / 2); st.push(paint(hub, col('#b0b8c6')));
    const spine = new THREE.CylinderGeometry(0.35, 0.35, 12, 6); spine.rotateX(PI / 2); st.push(paint(spine, col('#6c7482')));
    const station = new THREE.Mesh(kit.merge(st), kit.material({ color: '#ffffff', roughness: 0.5, metalness: 0.6 }));
    station.position.set(-12.7, -21, 46); station.rotation.set(0.9, 0.5, 0.2); station.name = 'ring-station';
    root.add(station);
  }

  // ---------------------------------------------------------------- beacons + ships (animated)
  // ships: a slim wedge hull + engine glow; nav lights are beacons below
  const ships = [];
  const shipMat = kit.material({ color: '#ffffff', roughness: 0.45, metalness: 0.6 });
  const engMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const mkShip = (scale, hullCol, engCol) => {
    const g = new THREE.Group();
    const hull = [];
    const body = new THREE.ConeGeometry(0.5, 3, 4); body.rotateX(-PI / 2); body.rotateZ(PI / 4); body.scale(1, 0.45, 1); hull.push(paint(body, col(hullCol)));
    const wing = kit.bevelBox(2.4, 0.08, 0.9, 0.03); wing.translate(0, -0.05, 0.7); hull.push(paint(wing, col('#5d6574')));
    const tail = kit.bevelBox(0.9, 0.5, 0.6, 0.05); tail.translate(0, 0.05, 1.35); hull.push(paint(tail, col('#6d7584')));
    g.add(new THREE.Mesh(kit.merge(hull), shipMat));
    const eng = []; for (const s of [-0.25, 0.25]) { const e = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 8); e.rotateX(PI / 2); e.translate(s, 0.05, 1.67); eng.push(paint(e, col(engCol))); }
    g.add(new THREE.Mesh(kit.merge(eng), engMat));
    g.scale.setScalar(scale);
    return g;
  };
  // paths: a start point, a direction (units/s) and a wrap length; ships face along their motion
  const paths = [
    { from: new THREE.Vector3(-70, -27, -58), vel: new THREE.Vector3(2.2, 0.05, 0.2), len: 140, s: 1.0, hull: '#c9d1dc', eng: LOOK.cyan, t0: 0.15 },
    { from: new THREE.Vector3(70, -29, 58), vel: new THREE.Vector3(-1.6, 0.05, -0.15), len: 140, s: 1.3, hull: '#a7aebb', eng: LOOK.magenta, t0: 0.55 },
    { from: new THREE.Vector3(-36, -30, 70), vel: new THREE.Vector3(0.45, 0.02, -2.6), len: 150, s: 0.8, hull: '#d8dde5', eng: '#ffd27a', t0: 0.4 },
  ];
  for (const p of paths) {
    const sh = mkShip(p.s, p.hull, p.eng);
    const dir = p.vel.clone().normalize();
    sh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);   // the hull's nose is -z: face along the lane
    root.add(sh);
    ships.push({ obj: sh, ...p, speed: p.vel.length(), dir, t: p.t0 * p.len });
  }
  // blinking beacons: points on the posts' tops and the station; size-attenuated sprites
  const bpos = [], bcol = [], bph = [];
  for (let i = 0; i < NPOST; i += 2) {
    const a = i / NPOST * TAU + PI / 16, r0 = DECK_R * cos(PI / 8) / cos(((a + PI / 8) % (PI / 4)) - PI / 8) - 0.1 + 0.36;
    bpos.push(sin(a) * r0, DECK_Y + 1.08, cos(a) * r0); bcol.push(...(cos(a) > 0 ? col('#7fe6ff') : col('#ff6aa6'))); bph.push(i * 0.37);
  }
  for (const [x, y, z] of [[-12.7, -16, 46], [-7.7, -21, 46], [-17.7, -21, 46]]) { bpos.push(x, y, z); bcol.push(...col('#ff5050')); bph.push(rnd() * 6); }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
  bGeo.setAttribute('color', new THREE.Float32BufferAttribute(bcol, 3));
  bGeo.setAttribute('phase', new THREE.Float32BufferAttribute(bph, 1));
  const bMat = new THREE.ShaderMaterial({
    uniforms: { uAmbT: kit.ambient.time, uScale: { value: 420 } },
    vertexShader: `attribute float phase; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uAmbT; uniform float uScale;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float b = fract(uAmbT * 0.45 + phase * 0.159); vA = b < 0.12 ? 1.0 : 0.18;
        vC = color; gl_PointSize = clamp(uScale * (b < 0.12 ? 0.32 : 0.2) / -mv.z, 2.0, 18.0); }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float k = smoothstep(0.5, 0.0, length(d));
      gl_FragColor = vec4(vC * (0.6 + k), k * vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  bMat.userData.ambient = true;
  const beacons = new THREE.Points(bGeo, bMat); beacons.name = 'beacons'; beacons.frustumCulled = false;
  root.add(beacons);

  root.traverse(o => { if (o.isMesh) o.castShadow = false; });

  // ---------------------------------------------------------------- sky + lights
  root.add(skySphere(THREE));
  const lights = new THREE.Group(); lights.name = 'lights';
  const hemi = new THREE.HemisphereLight('#e8eeff', '#1b1f2b', 0.6);
  const sun = new THREE.DirectionalLight('#f6f4ff', 2.25);
  sun.position.set(-3.2, 11, 4.5); sun.castShadow = true;
  // low coloured fills from each side: cyan on white's side, magenta on black's (very subtle)
  const fillC = new THREE.DirectionalLight(LOOK.cyan, 0.22); fillC.position.set(3, 2, 8);
  const fillM = new THREE.DirectionalLight(LOOK.magenta, 0.18); fillM.position.set(-3, 2, -8);
  lights.add(hemi, sun, sun.target, fillC, fillM);

  return {
    object: root, minPhi: 0.12, lights,
    background: new THREE.Color('#05060c'),          // Top view (env hidden): deep space round the board
    envScene: kit.studioEnvironment({ top: '#1b2030', horizon: '#3f4656', floor: '#0b0c10', warm: '#f2f0ff', cool: '#bfe6ff' }),
    // drift the ships along their lanes (only called while the env is visible + ambient anim is on)
    update(dt) {
      const s = dt / 1000;
      for (const sh of ships) {
        sh.t = (sh.t + sh.speed * s) % sh.len;
        sh.obj.position.copy(sh.from).addScaledVector(sh.dir, sh.t);
      }
    },
  };
}

/**
 * Sky: a camera-centred sphere with a procedural starfield + nebula shader (direction-based, so
 * stars stay crisp at any zoom). Part of the env object, so the Top view never draws it.
 */
function skySphere(THREE) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vDir;
      float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { return 0.55 * vn(p) + 0.28 * vn(p * 2.03 + 7.1) + 0.17 * vn(p * 4.1 + 3.3); }
      vec3 stars(vec3 d, float K, float prob, float size) {
        vec3 q = d * K, c = floor(q);
        float r = h3(c);
        if (r > prob) return vec3(0.0);
        vec3 o = vec3(h3(c + 3.1), h3(c + 5.7), h3(c + 9.3)) * 0.6 + 0.2;
        float dist = length(q - c - o) / K;
        float b = smoothstep(size, size * 0.2, dist) + 0.25 * smoothstep(size * 2.2, 0.0, dist);
        float t = h3(c + 1.7);
        vec3 col = t < 0.2 ? vec3(0.7, 0.8, 1.0) : t < 0.3 ? vec3(1.0, 0.85, 0.72) : vec3(0.95, 0.96, 1.0);
        return col * b * (0.35 + 0.65 * h3(c + 2.9));
      }
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(vec3(0.012, 0.016, 0.035), vec3(0.025, 0.03, 0.06), 1.0 - abs(d.y));
        float n = fbm(d * 2.4 + vec3(1.3, 0.0, 4.0));
        float n2 = fbm(d * 5.0 + vec3(9.0, 2.0, 1.0));
        float band = smoothstep(0.45, 0.85, n) * (0.55 + 0.45 * n2);
        float side = smoothstep(-0.6, 0.6, d.z + 0.35 * d.x);           // +z (white's side) cyan, -z magenta
        vec3 neb = mix(vec3(0.75, 0.12, 0.55), vec3(0.08, 0.5, 0.95), side);
        col += neb * band * 0.16 + vec3(0.25, 0.2, 0.6) * smoothstep(0.55, 0.9, n2) * 0.04;
        col += stars(d, 110.0, 0.12, 0.0016) * 1.4 + stars(d, 260.0, 0.25, 0.0009) * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), mat);
  mesh.name = 'sky'; mesh.renderOrder = 1e6; mesh.frustumCulled = false;   // drawn last, at the far plane: shades only uncovered pixels
  mesh.onBeforeRender = (r, sc, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  return mesh;
}
