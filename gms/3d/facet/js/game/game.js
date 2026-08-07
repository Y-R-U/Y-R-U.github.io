// Wires the playable layer onto the diorama. Owns the tap raycast, the frame order, and the URL
// switches the test harness drives everything with.

import * as THREE from 'three';
import { Game } from './state.js';
import * as ui from './ui.js';
import * as control from './control.js';
import * as combat from './combat.js';
import * as props from './props.js';

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

export function startGame(app, world) {
  const params = new URLSearchParams(location.search);
  Game.world = world;
  Game.app = app;

  const parts = {
    ui: ui.mount?.(Game, app) || null,
    control: control.create?.(Game, app, world) || null,
    combat: combat.create?.(Game, app, world) || null,
  };
  Game.control = parts.control;
  Game.combat = parts.combat;
  props.populate?.(Game, app, world);

  for (const g of (params.get('give') || '').split(',').filter(Boolean)) Game.inv.add(g, 1);

  bindTap(app);

  const sys = {
    update(dt) {
      parts.control?.update?.(dt);
      parts.combat?.update?.(dt);
      props.update?.(dt, Game);
      parts.ui?.update?.(dt);
      regen(dt);
    },
  };
  app.systems.push(sys);

  if (params.has('play')) parts.control?.takeControl?.();
  window.__facet.game = Game;
  return Game;
}

function regen(dt) {
  const p = Game.player;
  if (!p.alive) return;
  p.inCombat = Math.max(0, p.inCombat - dt);
  if (p.inCombat > 0) return;
  p.hp = Math.min(p.hpMax, p.hp + dt * 1.6);
  p.mp = Math.min(p.mpMax, p.mp + dt * 1.1);
}

// A tap is a tap, not a drag: anything that travels more than a few pixels was the camera being
// orbited and must not also walk the character across the map.
function bindTap(app) {
  const el = app.renderer.domElement;
  let start = null;
  el.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  el.addEventListener('pointerup', e => {
    if (!start) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    const held = performance.now() - start.t;
    start = null;
    if (moved > 12 || held > 700) return;
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    handleTap();
  });
}

function handleTap() {
  if (!Game.controlled) return;
  ray.setFromCamera(ndc, Game.app.camera);

  // Interactables win over the ground, and the nearest to the tap ray wins among themselves.
  let best = null, bestD = Infinity;
  const line = new THREE.Line3(ray.ray.origin, ray.ray.at(600, new THREE.Vector3()));
  const p = new THREE.Vector3();
  for (const o of Game.interactables.values()) {
    line.closestPointToPoint(o.pos, true, p);
    const d = p.distanceTo(o.pos);
    if (d < (o.radius || 1) && d < bestD) { best = o; bestD = d; }
  }
  if (best) { Game.control?.goTo?.(best.pos, best); return; }

  const hit = groundHit();
  if (hit) Game.control?.goTo?.(hit, null);
}

function groundHit() {
  const meshes = [];
  Game.world.batch?.object3D.traverse(o => { if (o.isMesh && o.name === 'solid') meshes.push(o); });
  const hits = ray.intersectObjects(meshes, false);
  return hits.length ? hits[0].point : null;
}
