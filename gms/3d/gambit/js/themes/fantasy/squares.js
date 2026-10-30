// Fantasy board (polish pass; refs/ref_fantasy_island_board.jpg + ref_gold_black_marble.jpg):
// polished marble squares with fine GOLD INLAY lines between them (real metal via a metalness/
// roughness mask on the same canvas, so the lines catch the light) and tiny gold studs at the
// crossings, framed by a deep blue-black marble border with raised gold mouldings, gold filigree
// scrolls at each corner round a glowing blue RUNE MEDALLION, and gold lozenges mid-edge.
// Square colours come from kit.boardLooks.marble (D28: the one place contrast is tuned), so the
// dark squares are exactly Classic's. 4 draw calls (squares, frame, gold, runes), like Classic.

const { PI, sin, cos } = Math;
const TAU = PI * 2;
let M = null;

/** Blue rune disc (also used for the island deck medallions in board.js). */
export function runeTexture(kit) {
  return kit.canvasTexture(256, 256, (c, w) => {
    const m = w / 2;
    const bg = c.createRadialGradient(m, m, 0, m, m, m);
    bg.addColorStop(0, 'rgba(20,50,120,0.95)'); bg.addColorStop(0.9, 'rgba(10,30,80,0.95)'); bg.addColorStop(1, 'rgba(10,30,80,0)');
    c.fillStyle = bg; c.fillRect(0, 0, w, w);
    c.shadowColor = '#2f8cff'; c.shadowBlur = 14; c.strokeStyle = '#7cc4ff'; c.lineCap = 'round';
    for (const [r, lw] of [[0.42, 5], [0.33, 3], [0.14, 4]]) { c.lineWidth = lw; c.beginPath(); c.arc(m, m, r * w, 0, TAU); c.stroke(); }
    c.lineWidth = 3;
    for (let k = 0; k < 12; k++) {                                                  // rune glyphs in the band
      const a = k * TAU / 12, x = m + sin(a) * 0.375 * w, y = m - cos(a) * 0.375 * w;
      c.save(); c.translate(x, y); c.rotate(a); c.beginPath();
      const g = k % 3;
      if (g === 0) { c.moveTo(0, -9); c.lineTo(0, 9); c.moveTo(-6, -3); c.lineTo(6, 3); }
      else if (g === 1) { c.moveTo(-6, 8); c.lineTo(0, -9); c.lineTo(6, 8); c.moveTo(-3, 2); c.lineTo(3, 2); }
      else { c.moveTo(-6, -8); c.lineTo(6, -8); c.lineTo(-6, 8); c.lineTo(6, 8); }
      c.stroke(); c.restore();
    }
    c.lineWidth = 4; c.beginPath();                                                   // an eight-point star
    for (let k = 0; k < 16; k++) { const a = k * TAU / 16, r = (k % 2 ? 0.1 : 0.3) * w; c.lineTo(m + sin(a) * r, m - cos(a) * r); }
    c.closePath(); c.stroke();
  });
}

export function build(THREE, kit, { orientation = 'w', coordinates = true } = {}) {
  M = kit.boardLooks.marble;
  const g = new THREE.Group(); g.name = 'fantasy-board';
  const S = 128, N = S * 8, LINE = 3.2, GOLD = '#d6a94e';
  // ---- squares: marble + gold inlay (albedo), and a mask: G = roughness, B = metalness
  const tex = kit.canvasTexture(N, N, (c) => {
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const dark = (f + r) % 2 === 0, x = f * S, y = (7 - r) * S;
      if (dark) kit.drawMarble(c, x, y, S, S, { base: M.dark, cloud: M.darkCloud, vein: M.darkVein, vein2: M.darkVein2, seed: f * 31 + r * 17 + 3, veins: 3 });
      else kit.drawMarble(c, x, y, S, S, { base: M.light, cloud: M.lightCloud, vein: M.lightVein, vein2: M.lightVein2, seed: f * 29 + r * 13 + 7, veins: 4 });
    }
    inlay(c, N, S, LINE, GOLD, 'rgba(70,45,10,0.55)');
    if (!coordinates) return;
    c.font = `700 ${Math.round(S * 0.2)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    const flip = orientation === 'b';
    for (let i = 0; i < 8; i++) {
      label(c, S, flip ? 7 : 0, i, String(i + 1), 'tl', flip);
      label(c, S, i, flip ? 7 : 0, 'abcdefgh'[i], 'br', flip);
    }
  });
  const mask = kit.canvasTexture(N, N, (c) => {
    c.fillStyle = 'rgb(0,40,0)'; c.fillRect(0, 0, N, N);                       // marble: roughness ~0.16, no metal
    inlay(c, N, S, LINE, 'rgb(0,72,190)', null);                                // gold: roughness ~0.28, metal 0.75
  }, { srgb: false });
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-PI / 2),
    new THREE.MeshStandardMaterial({ map: tex, roughnessMap: mask, metalnessMap: mask, roughness: 1, metalness: 1, envMapIntensity: 0.6 }));
  surf.receiveShadow = true; surf.name = 'surface';
  g.add(surf);

  // ---- frame: deep blue-black marble, rounded outside, square hole
  const b = 0.03, outer = 4.5, depth = 0.36;
  const fshape = kit.roundedRect((outer - b) * 2, (outer - b) * 2, 0.16);
  const hole = new THREE.Path(), h = 4 + b;
  hole.moveTo(-h, -h); hole.lineTo(h, -h); hole.lineTo(h, h); hole.lineTo(-h, h); hole.lineTo(-h, -h);
  fshape.holes.push(hole);
  const fg = new THREE.ExtrudeGeometry(fshape, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
  fg.rotateX(-PI / 2); fg.translate(0, -(depth + b) + 0.03, 0);
  const ftex = kit.canvasTexture(512, 512, (c, w) => kit.drawMarble(c, 0, 0, w, w, { base: '#161b27', cloud: 'rgba(60,80,130,0.22)', vein: 'rgba(150,165,200,0.16)', vein2: 'rgba(214,169,78,0.38)', seed: 23, veins: 7 }), { repeat: true });
  ftex.repeat.set(0.2, 0.2);
  const frame = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.18, metalness: 0, envMapIntensity: 0.85 }));
  frame.receiveShadow = true; frame.name = 'frame';
  g.add(frame);

  // ---- gold: mouldings, corner filigree + medallion bezels, mid-edge lozenges (1 draw call)
  const gold = kit.material({ color: '#e9bb62', metalness: 1, roughness: 0.25, vertexColors: true });
  const sq = r => { const p = new THREE.Path(); p.moveTo(-r, -r); p.lineTo(r, -r); p.lineTo(r, r); p.lineTo(-r, r); p.lineTo(-r, -r); return p; };
  const band = (ro, ri, d = 0.014) => { const s = new THREE.Shape(sq(ro).getPoints()); s.holes.push(sq(ri)); return kit.extrude(s, { depth: d, bevel: 0.005, bevelSegments: 1, curveSegments: 1 }); };
  const flat = (geo, y = 0.036) => kit.place(geo, { rx: -PI / 2, y });
  const parts = [flat(band(4.1, 4.035, 0.02)), flat(band(4.16, 4.145)), flat(band(4.41, 4.37, 0.018))];
  const C4 = 4.27;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // medallion bezel (a stepped gold ring) — the rune disc sits inside it
    const bez = kit.lathe(kit.profile().pt(0.13, 0).pt(0.19, 0).pt(0.2, 0.02).pt(0.18, 0.04).pt(0.155, 0.042).pt(0.14, 0.03).pt(0.13, 0.03).points(), { segments: 20 });
    parts.push(kit.place(bez, { x: sx * C4, z: sz * C4, y: 0.03 }));
    // filigree: two mirrored scroll runs from the medallion along each edge
    for (const axis of [0, 1]) parts.push(...filigree(THREE, kit, sx, sz, axis, C4));
  }
  // lozenges at the middle of each side
  for (const [x, z, ry] of [[0, C4, 0], [0, -C4, 0], [C4, 0, PI / 2], [-C4, 0, PI / 2]]) {
    const loz = kit.extrude([[-0.16, 0], [0, 0.07], [0.16, 0], [0, -0.07]], { depth: 0.016, bevel: 0.006, bevelSegments: 1 });
    parts.push(kit.place(kit.place(loz, { rx: -PI / 2 }), { x, z, y: 0.036, ry }));
    const ring = kit.place(kit.torus(0.032, 0.008, 3, 12), { rx: PI / 2 });
    parts.push(kit.place(ring, { x, z, y: 0.06 }));
  }
  const goldMesh = kit.piece(parts.map(geom => ({ geom, mat: gold })));
  goldMesh.name = 'gold';
  g.add(goldMesh);

  // ---- rune discs in the medallions (+ blue gems in the lozenges): unlit glow, 1 draw call
  const rt = runeTexture(kit), runes = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) runes.push(kit.place(new THREE.CircleGeometry(0.15, 24).rotateX(-PI / 2), { x: sx * C4, z: sz * C4, y: 0.062, ry: sx * sz * 0.4 }));
  for (const [x, z] of [[0, C4], [0, -C4], [C4, 0], [-C4, 0]]) runes.push(kit.place(new THREE.CircleGeometry(0.03, 12).rotateX(-PI / 2), { x, z, y: 0.071 }));
  const rm = new THREE.Mesh(kit.merge(runes), new THREE.MeshBasicMaterial({ map: rt, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.2, 1.2, 1.25), polygonOffset: true, polygonOffsetFactor: -2 }));
  rm.name = 'runes';
  g.add(rm);
  return g;
}

/** Gold inlay: thin lines on every square edge, a double border line, little diamond studs. */
function inlay(c, N, S, w, col, shadow) {
  const draw = (fill) => {
    c.fillStyle = fill;
    for (let i = 0; i <= 8; i++) {
      const p = Math.min(N - w / 2, Math.max(w / 2, i * S));
      c.fillRect(p - w / 2, 0, w, N); c.fillRect(0, p - w / 2, N, w);
    }
    for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) {                  // diamond studs at the crossings
      c.beginPath(); const x = i * S, y = j * S, r = w * 2.1;
      c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fill();
    }
  };
  if (shadow) { c.save(); c.translate(0.9, 1.2); draw(shadow); c.restore(); }     // a hairline groove under the gold
  draw(col);
  if (!shadow) return;
  c.fillStyle = 'rgba(255,240,200,0.55)';                                           // a bright core on each line
  for (let i = 1; i < 8; i++) { c.fillRect(i * S - 0.5, 0, 1, N); c.fillRect(0, i * S - 0.5, N, 1); }
}

/** One run of gold scrollwork from a corner medallion along an edge (axis 0: along x, 1: along z). */
function filigree(THREE, kit, sx, sz, axis, C4) {
  const out = [];
  const curl = (cx, cy, R, w, a0, a1, endBall = true) => {
    const s = new THREE.Shape();
    s.absarc(cx, cy, R + w / 2, a0, a1, a1 < a0);
    s.absarc(cx, cy, R - w / 2, a1, a0, a1 >= a0);
    const g = [kit.extrude(s, { depth: 0.014, bevel: 0, curveSegments: 4 })];
    if (endBall) { const e = new THREE.Shape(); e.absarc(cx + cos(a1) * R, cy + sin(a1) * R, w * 0.9, 0, TAU, false); g.push(kit.extrude(e, { depth: 0.02, bevel: 0, curveSegments: 3 })); }
    return g;
  };
  // in a local frame: u runs from the medallion along the edge, v across the frame (0 = frame centre line)
  const shapes = [
    ...curl(0.36, 0.045, 0.1, 0.022, PI * 1.05, PI * 2.1),
    ...curl(0.6, -0.04, 0.085, 0.02, PI * 0.0, PI * 1.05),
    ...curl(0.8, 0.03, 0.06, 0.018, PI * 1.1, PI * 2.0),
    ...curl(0.25, -0.06, 0.05, 0.016, PI * 0.3, PI * 1.3),
  ];
  // leaf tip at the end of the run
  const leaf = kit.extrude([[0.86, 0.0], [0.95, 0.03], [1.04, 0.0], [0.95, -0.03]], { depth: 0.014, bevel: 0 });
  shapes.push(leaf);
  for (const geo of shapes) {
    kit.place(geo, { rx: -PI / 2 });                                  // shape (u, v) -> world (u, -v) on the frame top
    // orient: u toward the board centre line of this edge
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getZ(i), y = p.getY(i) + 0.036;
      const x = axis === 0 ? sx * (C4 - u) : sx * C4 + v * sx;
      const z = axis === 0 ? sz * C4 + v * sz : sz * (C4 - u);
      p.setXYZ(i, x, y, z);
    }
    // the corner/axis mapping is a reflection for half the runs: re-wind those so they face up
    if ((axis === 0 ? -sx * sz : sx * sz) < 0) {
      if (geo.index) { const ix = geo.index; for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t); } }
      else for (let i = 0; i < p.count; i += 3) { const t = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)]; p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, ...t); }
    }
    geo.computeVertexNormals();
    out.push(geo);
  }
  return out;
}

function label(c, S, f, r, text, corner, flip) {
  const dark = (f + r) % 2 === 0;
  const x0 = f * S, y0 = (7 - r) * S, pad = S * 0.09;
  c.save();
  c.fillStyle = dark ? M.darkLabel : M.lightLabel;
  c.translate(x0 + S / 2, y0 + S / 2);
  if (flip) c.rotate(PI);
  c.textBaseline = corner === 'tl' ? 'top' : 'bottom';
  c.textAlign = corner === 'tl' ? 'left' : 'right';
  const hx = S / 2 - pad;
  c.fillText(text, corner === 'tl' ? -hx : hx, corner === 'tl' ? -hx : hx);
  c.restore();
}
