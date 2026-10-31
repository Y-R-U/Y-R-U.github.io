// Plain 2D board: flat green / cream squares like a chess site, coordinates inside the edge
// squares, no frame, no scenery, no shadows. One unlit quad + one canvas texture = 1 draw call.

export const LIGHT = '#ebecd0', DARK = '#739552';
const LIGHT_LABEL = '#739552', DARK_LABEL = '#ebecd0';

export function build(THREE, kit, { orientation = 'w', coordinates = true } = {}) {
  const g = new THREE.Group(); g.name = 'plain-board';
  const S = 160, N = S * 8;
  const tex = kit.canvasTexture(N, N, (c) => {
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      c.fillStyle = (f + r) % 2 === 0 ? DARK : LIGHT;    // a1 dark
      c.fillRect(f * S, (7 - r) * S, S, S);
    }
    if (!coordinates) return;
    c.font = `600 ${Math.round(S * 0.22)}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    const flip = orientation === 'b';
    for (let i = 0; i < 8; i++) {
      label(c, S, flip ? 7 : 0, i, String(i + 1), 'tl', flip);   // ranks down the player's left file
      label(c, S, i, flip ? 7 : 0, 'abcdefgh'[i], 'br', flip);   // files along the player's bottom rank
    }
  });
  tex.anisotropy = 4;
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  surf.name = 'surface';
  g.add(surf);
  return g;
}

function label(c, S, f, r, text, corner, flip) {
  const dark = (f + r) % 2 === 0;
  const x0 = f * S, y0 = (7 - r) * S, pad = S * 0.06;
  c.save();
  c.fillStyle = dark ? DARK_LABEL : LIGHT_LABEL;
  c.translate(x0 + S / 2, y0 + S / 2);
  if (flip) c.rotate(Math.PI);          // readable from black's side
  c.textBaseline = corner === 'tl' ? 'top' : 'bottom';
  c.textAlign = corner === 'tl' ? 'left' : 'right';
  const hx = S / 2 - pad;
  c.fillText(text, corner === 'tl' ? -hx : hx, corner === 'tl' ? -hx + S * 0.01 : hx);
  c.restore();
}

/** No sun, no shadows: one ambient light (the FX flash pulses it; the board itself is unlit). */
export function lightRig(THREE) {
  const g = new THREE.Group(); g.name = 'lights';
  g.add(new THREE.AmbientLight('#ffffff', 1.2));
  return g;
}

// chess-site style highlights: yellow last move / selection, dark translucent move dots
export const overlayStyle = { lastMove: '#f5f17a', select: '#f5f17a', hint: '#4fb3ff', hover: '#ffffff', dot: '#000000' };
