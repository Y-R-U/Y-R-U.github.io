// Level builder: turns a level DOCUMENT (authored in the editor, stored in
// SQLite, fetched via data.js) into a live scene — placed models + colliders,
// the sealed perimeter (visible barricade ring outdoors / low walls indoors,
// backed by the hard position clamp), floating pickups, hotspot markers and
// zombie spawn zones. Returns a bundle main.js can run and later dispose()
// completely for the next level swap.
//
// Persistent-state contract: a `once` hotspot that has fired sets flag
// `hs_<level>_<uid>`; a collected pickup sets `pk_<level>_<uid>` — both live in
// the save's flag set, so loot stays looted across level swaps and reloads.

import * as THREE from 'three';
import { model as loadModel } from './assets.js';
import { makeHotspotMarker } from './hotspots.js';

export const firedFlag = (lvl, uid) => `hs_${lvl}_${uid}`;
export const takenFlag = (lvl, uid) => `pk_${lvl}_${uid}`;

export const PICKUP_COLOR = { weapon: 0xffd24a, ammo: 0x6fd0ff, medkit: 0x7aff8a };

// shared pickup visual: floating, spinning item over a coloured ground ring
export function makePickupVisual(kind, id) {
  const color = PICKUP_COLOR[kind] || 0xffe9a6;
  const holder = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.5, 22).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.material.userData.noWire = true; ring.position.y = 0.04; holder.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.16, 1.0, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.material.userData.noWire = true; beam.position.y = 0.5; holder.add(beam);
  const itemNode = new THREE.Group(); itemNode.position.y = 0.95; holder.add(itemNode);
  const mdl = kind === 'weapon' ? id : (kind === 'medkit' ? 'medkit' : 'ammo_box');
  loadModel(mdl).then(m => { m.scale.setScalar(kind === 'weapon' ? 1.25 : 1.0); itemNode.add(m); });
  return { holder, itemNode, ring, beam };
}

export function tickPickup(pk, t) {
  if (pk.taken || !pk.itemNode) return;
  pk.itemNode.rotation.y = t * 1.7;
  pk.itemNode.position.y = 0.95 + Math.sin(t * 2.4 + (pk.pos.x + pk.pos.z)) * 0.09;
  if (pk.ring) pk.ring.material.opacity = 0.45 + (Math.sin(t * 3) * 0.5 + 0.5) * 0.35;
}

export async function buildLevel(scene, doc, ctx) {
  const group = new THREE.Group();
  scene.add(group);
  const HX = doc.bounds?.hx || 40, HZ = doc.bounds?.hz || 40;
  const interior = doc.kind === 'interior';
  const circles = [], boxes = [];
  const buildings = [];           // labelled box objects → minimap
  const pickups = [];
  const hotspots = [];            // { h, marker, fired }
  const zones = [];               // spawn-zone runtime state
  const disposables = [];         // per-instance materials/textures we created
  const flickers = [];            // lamp lights
  const tvs = [];                 // television screens (static loop)
  const pending = [];             // model-load promises (await before return)

  // ── placed objects ──
  for (const o of (doc.objects || [])) {
    const holder = new THREE.Group();
    holder.position.set(o.x, o.y || 0, o.z);
    holder.rotation.y = o.rot || 0;
    group.add(holder);
    pending.push(loadModel(o.model).then(m => { m.scale.setScalar(o.scale || 1); holder.add(m); }).catch(() => {}));
    const col = o.collide || { type: 'none' };
    if (col.type === 'box') {
      boxes.push({ x: o.x, z: o.z, hx: col.hx, hz: col.hz });
      if (o.label) buildings.push({ x: o.x, z: o.z, hx: col.hx, hz: col.hz, label: o.label });
    } else if (col.type === 'circle') {
      circles.push({ x: o.x, z: o.z, r: col.r });
    }
    if (o.model === 'television') tvs.push(makeTvScreen(holder, disposables));
    if (o.model?.startsWith('lamp_') && !interior && flickers.length < 6) {
      const L = new THREE.PointLight(0xffcf88, 1.1, 16, 2);
      L.position.set(o.x, 4.2, o.z);
      group.add(L);
      flickers.push({ L, seed: o.x + o.z });
    }
  }

  // ── the sealed perimeter ──
  if (interior) {
    // roofless low walls (the close interior camera always sees in)
    pending.push(loadModel('int_wall').then(tmpl => {
      const sx = tmpl.userData.size?.x || 3;
      const wallH = doc.env?.wallH || 0.55;
      const wall = (x, z, rotY) => { const m = tmpl.clone(true); m.scale.set(1, wallH, 1); m.position.set(x, 0, z); m.rotation.y = rotY; group.add(m); };
      for (let x = -HX; x <= HX; x += sx) { wall(x, -HZ, 0); wall(x, HZ, Math.PI); }
      for (let z = -HZ; z <= HZ; z += sx) { wall(-HX, z, Math.PI / 2); wall(HX, z, -Math.PI / 2); }
    }).catch(() => {}));
  } else {
    // barricade ring just inside the clamp line, with gaps at the exits
    const ringModels = ['barrier', 'barrier_dmg', 'barricade', 'barrier', 'barrier_traf'];
    const exits = (doc.hotspots || []).filter(h => h.type === 'exit');
    const nearExit = (x, z) => exits.some(h => Math.hypot(x - h.x, z - h.z) < (h.r || 2) + 4.5);
    pending.push(Promise.all(ringModels.map(n => loadModel(n))).then(tmpls => {
      let i = 0;
      const put = (x, z, rot) => {
        if (nearExit(x, z)) return;
        const m = tmpls[i++ % tmpls.length].clone(true);
        m.position.set(x, 0, z);
        m.rotation.y = rot + (Math.random() - 0.5) * 0.16;
        group.add(m);
      };
      const bx = HX - 0.6, bz = HZ - 0.6, step = 3.0;
      for (let x = -bx + 1.5; x <= bx - 1.5; x += step) { put(x, -bz, 0); put(x, bz, 0); }
      for (let z = -bz + 1.5; z <= bz - 1.5; z += step) { put(-bx, z, Math.PI / 2); put(bx, z, Math.PI / 2); }
    }).catch(() => {}));
  }

  // ── pickups (skip already-collected) ──
  for (const p of (doc.pickups || [])) {
    if (ctx.flags.has(takenFlag(doc.id, p.uid))) continue;
    const v = makePickupVisual(p.kind, p.item);
    v.holder.position.set(p.x, 0, p.z);
    group.add(v.holder);
    disposables.push(v.ring.material, v.beam.material);
    pickups.push({ uid: p.uid, kind: p.kind, id: p.item, ammo: p.ammo, n: p.n, pos: new THREE.Vector3(p.x, 0, p.z), group: v.holder, itemNode: v.itemNode, ring: v.ring, taken: false });
  }

  // ── hotspots ──
  for (const h of (doc.hotspots || [])) {
    const fired = !!h.once && ctx.flags.has(firedFlag(doc.id, h.uid));
    const marker = makeHotspotMarker(h, fired);
    marker.group.position.y = 0;
    group.add(marker.group);
    disposables.push(...marker.mats);
    hotspots.push({ h, marker, fired });
  }

  // ── spawn zones (main.js owns the actual zombies) ──
  for (const s of (doc.spawns || [])) {
    zones.push({ def: s, alive: 0, seeded: false, timer: 2 + Math.random() * 3 });
  }

  await Promise.all(pending);

  let tvT = 0;
  return {
    id: doc.id, doc, group, interior,
    colliders: { circles, boxes },
    buildings, pickups, hotspots, zones,
    playerStart: doc.playerStart || { x: 0, z: 0, yaw: 0 },
    bounds: { hx: HX, hz: HZ },
    ambient: doc.ambient || null,
    heightAt: () => 0,
    clampPos: (pos) => {
      pos.x = THREE.MathUtils.clamp(pos.x, -HX + 0.8, HX - 0.8);
      pos.z = THREE.MathUtils.clamp(pos.z, -HZ + 0.8, HZ - 0.8);
    },
    tick(dt, t) {
      for (const pk of pickups) tickPickup(pk, t);
      for (const hs of hotspots) hs.marker.tick(t);
      for (const f of flickers) f.L.intensity = 0.9 + Math.sin(t * 13 + f.seed) * 0.25 * (Math.random() < 0.04 ? 0 : 1);
      tvT += dt;
      if (tvT > 0.07 && tvs.length) { tvT = 0; for (const tv of tvs) tv.draw(); }
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose?.();
    },
  };
}

// any placed television gets a live static screen + flickering glow — the same
// in-world payoff as the old bedroom intro, but fully data-driven.
function makeTvScreen(holder, disposables) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 64;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  mat.userData.noWire = true;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.7), mat);
  screen.position.set(0, 0.42, 0.19);   // relative to the TV holder
  holder.add(screen);
  const glow = new THREE.PointLight(0x8fb8ff, 0.8, 7, 2);
  glow.position.set(0, 0.6, 0.4);
  holder.add(glow);
  disposables.push(tex, mat, screen.geometry);
  const draw = () => {
    const img = g.createImageData(c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = (Math.random() * 255) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    tex.needsUpdate = true;
    glow.intensity = 0.55 + Math.random() * 0.5;
  };
  draw();
  return { draw };
}
