// Classic board: polished black/white marble squares on one canvas texture (with
// chess.com-style in-square coordinates), a black-lacquer frame with a gold inlay
// border and gold corner medallions. 4 draw calls. Mood: refs/ref_gold_black_marble.jpg.

const LIGHT = '#e2dfd8', DARK = '#262b37';
const LIGHT_LABEL = '#3a3f4c', DARK_LABEL = '#e7d3a1';

export function build(THREE, kit, { orientation = 'w', coordinates = true } = {}) {
  const g = new THREE.Group(); g.name = 'classic-board';
  const S = 128, N = S * 8;
  const tex = kit.canvasTexture(N, N, (c) => {
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const dark = (f + r) % 2 === 0, x = f * S, y = (7 - r) * S;
      if (dark) kit.drawMarble(c, x, y, S, S, { base: DARK, cloud: 'rgba(90,100,125,0.16)', vein: 'rgba(200,205,220,0.30)', vein2: 'rgba(214,176,98,0.45)', seed: f * 31 + r * 17 + 3, veins: 3 });
      else kit.drawMarble(c, x, y, S, S, { base: LIGHT, cloud: 'rgba(140,140,150,0.10)', vein: 'rgba(110,112,125,0.45)', vein2: 'rgba(190,160,100,0.35)', seed: f * 29 + r * 13 + 7, veins: 4 });
    }
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 1.2;  // fine joints between tiles
    for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(i * S, 0); c.lineTo(i * S, N); c.moveTo(0, i * S); c.lineTo(N, i * S); c.stroke(); }
    if (!coordinates) return;
    c.font = `700 ${Math.round(S * 0.2)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    const flip = orientation === 'b';
    for (let i = 0; i < 8; i++) {
      label(c, S, flip ? 7 : 0, i, String(i + 1), 'tl', flip); // ranks down the player's left file
      label(c, S, i, flip ? 7 : 0, 'abcdefgh'[i], 'br', flip);  // files along the player's bottom rank
    }
  });
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.16, metalness: 0, envMapIntensity: 0.55 }));
  surf.receiveShadow = true; surf.name = 'surface';
  g.add(surf);

  // black lacquer frame
  const b = 0.03, outer = 4.5, depth = 0.36;
  const fshape = kit.roundedRect((outer - b) * 2, (outer - b) * 2, 0.12);
  const hole = new THREE.Path(); const h = 4 + b;
  hole.moveTo(-h, -h); hole.lineTo(h, -h); hole.lineTo(h, h); hole.lineTo(-h, h); hole.lineTo(-h, -h);
  fshape.holes.push(hole);
  const fg = new THREE.ExtrudeGeometry(fshape, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
  fg.rotateX(-Math.PI / 2); fg.translate(0, -(depth + b) + 0.03, 0);
  const ftex = kit.canvasTexture(512, 512, (c, w) => kit.drawMarble(c, 0, 0, w, w, { base: '#121318', cloud: 'rgba(70,75,95,0.18)', vein: 'rgba(150,150,170,0.18)', vein2: 'rgba(200,160,80,0.30)', seed: 11, veins: 6 }), { repeat: true });
  ftex.repeat.set(0.2, 0.2);
  const frame = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.2, metalness: 0, envMapIntensity: 0.8 }));
  frame.receiveShadow = true; frame.name = 'frame';
  g.add(frame);

  // gold: inner inlay border, outer trim line and four corner medallions, merged = 1 draw call
  const gold = kit.material({ color: '#e9bb62', metalness: 1, roughness: 0.25, vertexColors: true });
  const sq = (r) => { const p = new THREE.Path(); p.moveTo(-r, -r); p.lineTo(r, -r); p.lineTo(r, r); p.lineTo(-r, r); p.lineTo(-r, -r); return p; };
  const band = (ro, ri) => { const s = new THREE.Shape(sq(ro).getPoints()); s.holes.push(sq(ri)); return kit.extrude(s, { depth: 0.012, bevel: 0.004, bevelSegments: 1, curveSegments: 1 }); };
  const parts = [band(4.1, 4.035), band(4.39, 4.36)].map(geo => kit.place(geo, { rx: -Math.PI / 2, y: 0.036 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const med = kit.lathe(kit.profile().pt(0, 0).pt(0.15, 0).pt(0.16, 0.015).pt(0.13, 0.03).pt(0.10, 0.028).pt(0.07, 0.045).pt(0.03, 0.05).pt(0, 0.05).points(), { segments: 24 });
    parts.push(kit.place(med, { x: sx * 4.25, z: sz * 4.25, y: 0.03 }));
  }
  const goldMesh = kit.piece(parts.map(geom => ({ geom, mat: gold })));
  goldMesh.name = 'gold';
  g.add(goldMesh);
  return g;
}

/**
 * Environment hook (optional for every theme): things around the board that mostly
 * show when the camera tilts. Classic: a dark table top, transparent background.
 */
export function environment(THREE, kit) {
  const table = new THREE.Mesh(new THREE.CircleGeometry(16, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: kit.canvasTexture(512, 512, (c, w) => kit.drawWood(c, 0, 0, w, w, { base: '#2a1a12', dark: 'rgba(10,5,2,0.4)', light: 'rgba(255,190,140,0.05)', lines: 50, seed: 3 }), { repeat: true }), roughness: 0.55 }));
  table.material.map.repeat.set(3, 3);
  table.position.y = -0.37; table.receiveShadow = true; table.name = 'table';
  return { object: table, minPhi: 0.12, envScene: kit.studioEnvironment() };
}

function label(c, S, f, r, text, corner, flip) {
  const dark = (f + r) % 2 === 0;
  const x0 = f * S, y0 = (7 - r) * S, pad = S * 0.07;
  c.save();
  c.fillStyle = dark ? DARK_LABEL : LIGHT_LABEL;
  c.translate(x0 + S / 2, y0 + S / 2);
  if (flip) c.rotate(Math.PI);          // readable from black's side
  c.textBaseline = corner === 'tl' ? 'top' : 'bottom';
  c.textAlign = corner === 'tl' ? 'left' : 'right';
  const hx = S / 2 - pad;
  c.fillText(text, corner === 'tl' ? -hx : hx, corner === 'tl' ? -hx : hx);
  c.restore();
}
