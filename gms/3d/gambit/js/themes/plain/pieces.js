// Plain 2D pieces: each piece is ONE flat quad lying on its square, textured from a single
// canvas atlas of the art in art.js (12 icons). All 12 kinds share one unlit material, so a
// full army is 12 instanced draw calls of 2 triangles each, one 1920×640 texture, no lights,
// no shadows. Icons are turned to face the viewer by the board (pieces.facing.view).
import { drawPiece } from './art.js';

const TYPES = ['p', 'n', 'b', 'r', 'q', 'k'], CELL = 320, PAD = 0;
export const SIZE = 1.0;      // icon quad size in squares (the art leaves its own margin)
export const Y = 0.012;       // just above the board overlays (y ≈ 0.004–0.006)

let atlas = null, material = null;
function getMaterial(THREE, kit) {
  if (material) return material;
  atlas = kit.canvasTexture(CELL * 6, CELL * 2, (c) => {
    c.clearRect(0, 0, CELL * 6, CELL * 2);
    TYPES.forEach((t, i) => ['w', 'b'].forEach((col, j) => drawPiece(c, t, col, i * CELL + PAD, j * CELL + PAD, CELL - PAD * 2)));
  });
  atlas.anisotropy = 4;
  material = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, alphaTest: 0.02, toneMapped: false });   // depth write on: overlays (renderOrder ≥ 1) then stay under the icons
  material.name = 'plain-piece';
  material.userData.kitCached = true;   // shared across rebuilds; never disposed by the board
  return material;
}

function icon(THREE, kit, type, color) {
  const g = new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2);   // art top -> -z (screen up for white)
  const i = TYPES.indexOf(type), j = color === 'b' ? 1 : 0;
  const u0 = i / 6, u1 = (i + 1) / 6, v1 = 1 - j / 2, v0 = 1 - (j + 1) / 2;   // canvas y down, flipY on upload
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
  g.translate(0, Y, 0);
  const mesh = new THREE.Mesh(g, getMaterial(THREE, kit));
  mesh.castShadow = false; mesh.receiveShadow = false;
  const grp = new THREE.Group(); grp.add(mesh);
  return grp;
}

const make = type => (THREE, kit, { color }) => icon(THREE, kit, type, color);
export default {
  p: make('p'), n: make('n'), b: make('b'), r: make('r'), q: make('q'), k: make('k'),
  facing: { view: true },   // board hook: yaw follows the board orientation so icons stay upright
  contact: false,           // board hook: no contact-shadow blob under the pieces
};
