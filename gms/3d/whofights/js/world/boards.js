// Lettered boards: the road sign outside and the contract billboards in the hall. Both take their
// string from the level document, so retitling one is a data edit.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial, getEnvIntensity } from './materials.js';
import { textTexture } from './textures/text.js';

const BOARD = { face: '#e9e2d1', ink: '#23211c', rule: '#6d5a3c' };

function textMaterial(text, w, h, opts) {
  const m = new THREE.MeshStandardMaterial({
    map: textTexture(text, { w, h, bg: BOARD.face, fg: BOARD.ink, rule: BOARD.rule, ...opts }),
    roughness: 0.95, metalness: 0,
  });
  // A quarter of the world's env: at full strength the sky's grey reflection sat on top of the
  // paint and every board read as slate rather than as a painted board.
  m.envMapIntensity = getEnvIntensity() * 0.25;
  m.name = 'board:text';
  return m;
}

// Body and posts share one material, so they share one mesh. Four contract boards were eight
// draw calls of timber; merged they are four, which is most of what the hall's roof cost.
function timber(g, zoneId, parts) {
  const geos = parts.map(([box, x, y, z]) => box.translate(x, y, z));
  const mesh = new THREE.Mesh(geos.length === 1 ? geos[0] : mergeGeometries(geos, false), getMaterial(zoneId, 'wood'));
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function boardFace(g, text, w, h, y, z) {
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), textMaterial(text, w, h));
  face.position.set(0, y, z);
  face.receiveShadow = true;
  g.add(face);
}

// A post-mounted sign. Origin at the ground, lettering facing +z.
export function signPost(zoneId, { w, h, post, text }) {
  const g = new THREE.Group();
  const top = post + h;
  const legX = Math.max(0.35, w / 2 - 0.45);
  // Behind the board, not through it: at z = 0 the post's front face stood proud of the lettering
  // and cut the first and last letter off.
  timber(g, zoneId, [
    [new THREE.BoxGeometry(0.22, top - 0.1, 0.22), -legX, (top - 0.1) / 2, -0.19],
    [new THREE.BoxGeometry(0.22, top - 0.1, 0.22), legX, (top - 0.1) / 2, -0.19],
    [new THREE.BoxGeometry(w, h, 0.16), 0, post + h / 2, 0],
    [new THREE.BoxGeometry(w + 0.4, 0.18, 0.34), 0, post + h + 0.12, -0.06],
  ]);
  boardFace(g, text || 'Sign', w - 0.5, h - 0.4, post + h / 2, 0.09);
  g.userData = { kind: 'sign', zoneId, text };
  return g;
}

// A wall board. Origin at the floor, lettering facing +z, `lift` metres of clear wall beneath it.
export function boardPanel(zoneId, { w, h, lift, text }) {
  const g = new THREE.Group();
  timber(g, zoneId, [
    [new THREE.BoxGeometry(w, h, 0.22), 0, lift + h / 2, 0],
    [new THREE.BoxGeometry(0.26, lift + h, 0.26), -(w / 2 - 0.13), (lift + h) / 2, -0.2],
    [new THREE.BoxGeometry(0.26, lift + h, 0.26), (w / 2 - 0.13), (lift + h) / 2, -0.2],
    // a head rail, so a board on an eleven-metre wall has a top edge that reads
    [new THREE.BoxGeometry(w + 0.5, 0.24, 0.34), 0, lift + h + 0.12, -0.05],
    // A backing board standing proud of the wall behind the face. Nothing in an interior casts a
    // shadow here — the room is lit by ambient and sconces — so without a dark surround the
    // boards read as a HUD strip composited over the masonry rather than as timber hung on it.
    [new THREE.BoxGeometry(w + 0.34, h + 0.34, 0.12), 0, lift + h / 2, -0.15],
  ]);
  boardFace(g, text || 'Billboard', w - 0.5, h - 0.4, lift + h / 2, 0.12);
  g.userData = { kind: 'billboard', zoneId, text };
  return g;
}

