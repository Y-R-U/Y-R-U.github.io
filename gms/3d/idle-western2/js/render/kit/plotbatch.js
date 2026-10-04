// R5 draw trim: per-plot sign boards and contact shadows are drawn in the hero as ONE merged mesh per material.
// The originals move to the card layer (a card still draws its own plot's pieces); the merged copy lives on the town
// layer and is rebuilt whenever the set of visible pieces changes (tier ups, construction), never per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CROWD_LAYER } from './crowd.js?v=20261004h';

export function createPlotBatch() {
  const root = new THREE.Group();
  root.name = 'town:plotBatch';
  root.matrixAutoUpdate = false;
  const items = [];
  let sig = '', dirty = true;

  const shown = (o, stop) => {
    if (!o.parent) return false;
    for (let p = o; p && p !== stop; p = p.parent) if (!p.visible) return false;
    return true;
  };
  function add(obj, stop = null) {
    obj.traverse((o) => { if (o.isMesh) { o.layers.set(CROWD_LAYER.card); items.push({ o, stop }); } });
    dirty = true;
  }
  function remove(obj) {
    const gone = new Set();
    obj.traverse((o) => gone.add(o));
    for (let i = items.length - 1; i >= 0; i--) if (gone.has(items[i].o)) items.splice(i, 1);
    dirty = true;
  }
  function rebuild() {
    for (const m of [...root.children]) { root.remove(m); m.geometry.dispose(); }
    const byMat = new Map();
    for (const { o, stop } of items) {
      if (!shown(o, stop)) continue;
      o.updateWorldMatrix(true, false);
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (!byMat.has(o.material)) byMat.set(o.material, { list: [], src: o });
      byMat.get(o.material).list.push(g);
    }
    for (const [mat, { list, src }] of byMat) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) list.forEach((x) => x.dispose());
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.name = 'town:plotBatch:' + (src.name || 'mesh');
      m.layers.set(CROWD_LAYER.town);
      m.renderOrder = src.renderOrder;
      m.receiveShadow = src.receiveShadow;
      m.castShadow = false;
      m.matrixAutoUpdate = false;
      m.raycast = () => {};
      root.add(m);
    }
  }
  return {
    root, add, remove,
    mark() { dirty = true; },
    // Hero prepare: cheap visibility signature (a few dozen pieces), rebuild only on change.
    update() {
      let s = '';
      for (const { o, stop } of items) s += shown(o, stop) ? '1' : '0';
      if (!dirty && s === sig) return;
      sig = s; dirty = false;
      rebuild();
    },
  };
}
