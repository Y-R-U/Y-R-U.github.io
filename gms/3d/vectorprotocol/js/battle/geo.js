import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function box(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
export function plane(w, h, x = 0, y = 0, z = 0, ry = 0, rx = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
export function merge(list) {
  const clean = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of clean) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const m = mergeGeometries(clean, false);
  for (const g of list) g.dispose();
  return m;
}
export function onLayers(obj, ...layers) {
  obj.traverse((o) => { for (const l of layers) o.layers.enable(l); });
  return obj;
}
// Backdrop objects live only on this layer; the battle draws them with a near-level backdrop camera first,
// then clears depth and draws the board with the elevated board camera (two-perspective cheat, like the refs).
export const BACKDROP_LAYER = 3;
export function toLayer(obj, layer) {
  obj.traverse((o) => o.layers.set(layer));
  return obj;
}
