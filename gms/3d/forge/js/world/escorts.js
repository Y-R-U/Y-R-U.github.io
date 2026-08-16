// Bodies for the things quests ask you to walk home: Fen on the crowd rig, a hen on the fowl rig,
// and a cart of its own. The rules are in js/game/escort.js; this only shows, hides and moves.

import * as THREE from 'three';
import { Batch, T } from './details.js';
import { escortActorOf, carriedGait, SPEED } from '../game/escort.js';
import { ZONE_IDS } from './zones.js';
import { zoneAt, heightAt } from './terrain.js';
import { groundAt, collidersReady } from './colliders.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const at = (m, x, y, z, ry = 0, rx = 0, rz = 0) => m.clone().multiply(T(x, y, z, ry, rx, rz));

// A two-wheeled cart with the shafts forward along +z, loaded and roped. Built at the origin and
// carried by its own Group, which is the whole reason it is not one of props.js's merged kits.
function cartGeometry(zoneId) {
  const b = new Batch(zoneId);
  const m = T();
  b.add('wood', box(1.86, 0.16, 3.0), at(m, 0, 0.94, 0));
  for (const sx of [-1, 1]) b.add('wood', box(0.10, 0.52, 3.0), at(m, sx * 0.88, 1.28, 0));
  for (const sz of [-1, 1]) b.add('wood', box(1.86, 0.52, 0.10), at(m, 0, 1.28, sz * 1.45));
  for (const sx of [-1, 1]) {
    b.add('wood', box(0.13, 0.13, 2.3), at(m, sx * 0.52, 1.00, 2.55));
    b.add('crest', new THREE.CylinderGeometry(0.60, 0.60, 0.13, 10),
      at(m, sx * 1.02, 0.62, -0.34, 0, 0, Math.PI / 2));
    for (let i = 0; i < 4; i++) {
      b.add('wood', box(0.09, 1.06, 0.09), at(m, sx * 1.02, 0.62, -0.34, 0, 0, i * Math.PI / 4));
    }
  }
  b.add('wood', box(1.3, 0.11, 0.11), at(m, 0, 1.00, 3.6));
  b.add('crest', box(2.3, 0.10, 0.10), at(m, 0, 0.62, -0.34));
  // Sacking. Three lumps over the bed, because an empty cart reads as a gate lying on its side.
  for (const [x, z, s] of [[-0.4, 0.5, 0.62], [0.42, -0.1, 0.7], [-0.1, -0.9, 0.56]]) {
    const g = new THREE.IcosahedronGeometry(s, 0);
    g.scale(1.1, 0.62, 1.0);
    b.add('wood', g, at(m, x, 1.16, z, x + z));
  }
  return b.build();
}

export class Escorts {
  constructor(terrain, entries = [], { cast = null, chickens = null } = {}) {
    this.terrain = terrain;
    this.cast = cast;
    this.chickens = chickens;
    this.object3D = new THREE.Group();
    this.object3D.name = 'escorts';
    this.bodies = new Map();
    for (const e of entries) this.build(e);
  }

  groundY(x, z) {
    const fall = this.terrain ? this.terrain.surfaceY(x, z) : heightAt(x, z);
    return collidersReady() ? groundAt(x, z, fall) : fall;
  }

  build(e) {
    const home = { x: e.x, z: e.z, ry: e.ry || 0 };
    if (e.body === 'wagon') {
      const g = cartGeometry(e.town || ZONE_IDS[zoneAt(e.x, e.z)]);
      g.name = `escort:${e.id}`;
      g.visible = false;
      this.object3D.add(g);
      this.bodies.set(e.id, { id: e.id, body: e.body, home, group: g });
    } else if (e.body === 'fowl') {
      // The bird joins the flock only while a quest is walking it home. Standing one in the world
      // at boot cost the gate a draw call: it pins a seat, and the flock the knob then draws is a
      // different twenty-four with a different bounding sphere.
      this.bodies.set(e.id, { id: e.id, body: e.body, home, agent: null });
    } else {
      console.warn(`escorts: ${e.id} wants unknown body ${e.body}`);
      return;
    }
    this.park(e.id);
  }

  // Fen is not authored here: `data/cast_at.json` already stands him at Millbridge, and two
  // records of one position is how a quest-giver ends up teleporting when a quest starts.
  entry(npc) {
    const b = this.bodies.get(npc);
    if (b) return b;
    const a = this.cast?.at(npc);
    if (!a) return null;
    const made = { id: npc, body: 'person', home: { x: a.x, z: a.z, ry: a.heading }, agent: a };
    this.bodies.set(npc, made);
    return made;
  }

  has(npc) { return !!this.entry(npc); }

  speed(npc) { return SPEED[this.entry(npc)?.body] ?? SPEED.fowl; }

  at(npc) {
    const b = this.entry(npc);
    if (!b) return null;
    if (b.agent) return { x: b.agent.x, z: b.agent.z };
    if (b.group) return { x: b.group.position.x, z: b.group.position.z };
    return { x: b.home.x, z: b.home.z };
  }

  // A cast body is always there — hiding Fen would take a quest-giver out of the world — so only
  // the bodies this owns outright answer to it.
  show(npc, on) {
    const b = this.entry(npc);
    if (!b || b.body === 'person') return false;
    if (b.group) { b.group.visible = on; return true; }
    if (on === !!b.agent) return true;
    if (on) b.agent = this.chickens?.add({ x: b.home.x, z: b.home.z, heading: b.home.ry }) || null;
    else { this.chickens?.remove(b.agent); b.agent = null; }
    return true;
  }

  move(npc, x, z, heading) {
    const b = this.entry(npc);
    if (!b) return false;
    if (b.agent) {
      b.agent.x = x;
      b.agent.z = z;
      if (heading !== null && heading !== undefined) b.agent.heading = heading;
      // A crowd figure drifts its own heading when idle; an escorted one is being led.
      if (b.body === 'person') b.agent.turn = 0;
      b.agent.speed = carriedGait(b.body, heading);
      return true;
    }
    if (!b.group) return false;
    b.group.position.set(x, this.groundY(x, z), z);
    if (heading !== null && heading !== undefined) b.group.rotation.y = heading;
    return true;
  }

  // §9.4's `arm`: put it back where the step found it. The corpus asks for this by prop id —
  // `arm lac.henhouse.hen` — so the last segment is what names the actor.
  arm(id) {
    const npc = escortActorOf(id);
    if (!this.bodies.has(npc) && !this.cast?.at(npc)) return false;
    this.park(npc);
    return true;
  }

  park(npc) {
    const b = this.entry(npc);
    if (!b) return false;
    this.move(npc, b.home.x, b.home.z, b.home.ry);
    if (b.agent) b.agent.speed = 0;
    return true;
  }

  cost() {
    let tris = 0, drawn = 0;
    for (const b of this.bodies.values()) {
      if (!b.group?.visible) continue;
      for (const mesh of b.group.children) { drawn++; tris += mesh.geometry.attributes.position.count / 3; }
    }
    return { tris, drawn };
  }
}
