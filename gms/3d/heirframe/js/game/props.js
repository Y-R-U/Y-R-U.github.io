import * as THREE from 'three';
import { RARITY_COLOR } from './fx.js';
import { enableReflect } from '../engine/player.js';

// Mission props: destructible nests, parcels/cases to carry, drop-off beacons, and loot beams.
export function createProps(ctx) {
  const { world, fx, audio } = ctx;
  const scene = world.scene;
  const destructibles = [], carries = [], loot = [], breakables = [];
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.45, ...o });
  const M = {
    junk: std(0x5a4a3a, { roughness: 0.8 }), rust: std(0x8a4a22, { roughness: 0.7 }), eye: new THREE.MeshBasicMaterial({ color: 0xff5a2a, toneMapped: false }),
    parcel: std(0xd9c9a8, { metalness: 0.1, roughness: 0.7 }), tape: std(0x2f7fd8, { metalness: 0.2 }), glow: new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false }),
    case: std(0x2a2d33, { metalness: 0.9, roughness: 0.25 }), gold: std(0xe8b95a, { metalness: 1, roughness: 0.2 }), bomb: new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }),
    steel: std(0x6b7280, { metalness: 0.9, roughness: 0.35 }), panel: std(0x1c2230, { metalness: 0.7, roughness: 0.3 }), amber: new THREE.MeshBasicMaterial({ color: 0xffb040, toneMapped: false }),
    crate: std(0xb08a5a, { metalness: 0.05, roughness: 0.75 }), glass: std(0x9fd8ff, { metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.55 }),
  };
  const G = {
    mBase: new THREE.BoxGeometry(1.3, 0.25, 1.1), mBody: new THREE.BoxGeometry(1.0, 1.25, 0.85), mCore: new THREE.CylinderGeometry(0.18, 0.18, 0.9, 10),
    mFin: new THREE.BoxGeometry(0.08, 0.9, 0.7), crate: new THREE.BoxGeometry(0.8, 0.7, 0.8), pane: new THREE.BoxGeometry(1.4, 1.1, 0.08),
  };

  // sabotage / defend objects: a humming machine with a glowing core (generator, relay, pump, ...)
  function machine(x, z, hp = 120, kind = 'generator', { hostile = true } = {}) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(G.mBase, M.panel); base.position.y = 0.12; g.add(base);
    const body = new THREE.Mesh(G.mBody, M.steel); body.position.y = 0.87; g.add(body);
    const core = new THREE.Mesh(G.mCore, hostile ? M.amber : M.glow); core.position.set(0, 0.9, 0.44); core.rotation.x = Math.PI / 2; core.scale.set(1, 0.12, 1); g.add(core);
    for (const k of [-1, 1]) { const f = new THREE.Mesh(G.mFin, M.panel); f.position.set(k * 0.56, 0.9, 0); g.add(f); }
    const top = new THREE.Mesh(G.mCore, hostile ? M.amber : M.glow); top.position.y = 1.55; top.scale.set(0.6, 0.25, 0.6); g.add(top);
    enableReflect(g);
    g.position.set(x, world.groundAt(x, z), z);
    g.rotation.y = Math.random() * Math.PI * 2;
    scene.add(g);
    const d = { prop: true, kind, pos: g.position, radius: 0.9, hp, max: hp, mesh: g, destroyed: false, core, t: Math.random() * 6 };
    if (hostile) destructibles.push(d);
    return d;
  }

  // collateral: market crates and glass stands near objectives; only area hits break them
  function breakable(x, z, value = 60) {
    const g = new THREE.Group();
    const glass = Math.random() < 0.4;
    if (glass) { const p = new THREE.Mesh(G.pane, M.glass); p.position.y = 0.75; g.add(p); const b = new THREE.Mesh(G.mBase, M.gold); b.scale.set(1.1, 0.4, 0.2); b.position.y = 0.05; g.add(b); }
    else for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(G.crate, M.crate); c.position.set((i - 1) * 0.3, 0.35 + (i === 1 ? 0.7 : 0), (i % 2) * 0.2); c.rotation.y = i * 0.4; c.scale.setScalar(i === 1 ? 0.8 : 1); g.add(c); }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(x, world.groundAt(x, z), z);
    g.rotation.y = Math.random() * Math.PI;
    scene.add(g);
    const b = { pos: g.position, mesh: g, value: glass ? value * 2 : value, hp: glass ? 8 : 20, glass };
    breakables.push(b);
    return b;
  }
  // area damage from the player: breaks collateral within r of (x,z)
  function splash(x, z, r, dmg) {
    for (let i = breakables.length - 1; i >= 0; i--) {
      const b = breakables[i];
      if (Math.hypot(b.pos.x - x, b.pos.z - z) > r + 0.5) continue;
      b.hp -= dmg;
      if (b.hp > 0) continue;
      breakables.splice(i, 1);
      scene.remove(b.mesh);
      const p = new THREE.Vector3(b.pos.x, b.pos.y + 0.6, b.pos.z);
      fx.sparks(p, b.glass ? 0xbfe6ff : 0xd8b080, 14, 6);
      fx.flash(p, 0.6, 0xfff0d0, 0.1);
      audio.sfx(b.glass ? 'shield_break' : 'explosion_small', { x: b.pos.x, z: b.pos.z, vol: 0.6 });
      ctx.onCollateral && ctx.onCollateral(b.value, b);
    }
  }

  function nest(x, z, hp = 60) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(i % 3 ? new THREE.BoxGeometry(0.5 + Math.random() * 0.5, 0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.4) : new THREE.CylinderGeometry(0.25, 0.3, 0.6, 8), i % 2 ? M.junk : M.rust);
      const a = i * 0.7, r = i === 0 ? 0 : 0.4 + (i % 3) * 0.25;
      b.position.set(Math.sin(a) * r, 0.2 + (i % 4) * 0.12, Math.cos(a) * r); b.rotation.set(Math.random(), Math.random() * 3, Math.random() * 0.5);
      g.add(b);
    }
    for (let i = 0; i < 4; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), M.eye); e.position.set(Math.sin(i * 1.7) * 0.45, 0.35 + (i % 2) * 0.2, Math.cos(i * 1.7) * 0.45); g.add(e); }
    enableReflect(g);
    g.position.set(x, world.groundAt(x, z), z);
    scene.add(g);
    const d = { prop: true, kind: 'nest', pos: g.position, radius: 1.0, hp, max: hp, mesh: g, destroyed: false };
    destructibles.push(d);
    return d;
  }

  function damage(d, amount) {
    if (d.destroyed) return;
    d.hp -= amount;
    const s = ctx.project(new THREE.Vector3(d.pos.x, d.pos.y + 0.8, d.pos.z));
    if (s.on) ctx.ui.damage(s.x, s.y, amount, 'normal');
    fx.sparks(new THREE.Vector3(d.pos.x, d.pos.y + 0.5, d.pos.z), 0xffb060, 8, 4);
    audio.sfx('melee_hit', { x: d.pos.x, z: d.pos.z, vol: 0.7 });
    d.mesh.scale.setScalar(0.92 + 0.08 * Math.max(0, d.hp / d.max));
    if (d.hp <= 0) {
      d.destroyed = true;
      fx.flash(new THREE.Vector3(d.pos.x, d.pos.y + 0.6, d.pos.z), 1.4, 0xffa040, 0.3);
      fx.sparks(new THREE.Vector3(d.pos.x, d.pos.y + 0.6, d.pos.z), 0xffa040, 26, 9);
      fx.ring(d.pos, 4, 0xffa040, 0.5);
      audio.sfx('explosion', { x: d.pos.x, z: d.pos.z });
      ctx.rig.shake = 0.25;
      scene.remove(d.mesh);
      destructibles.splice(destructibles.indexOf(d), 1);
      ctx.onPropDestroyed && ctx.onPropDestroyed(d);
    }
  }

  // an item waiting at a site (parcel / case / bomb), with a pulsing beacon
  function carry(x, z, kind = 'parcel') {
    const g = new THREE.Group();
    const body = new THREE.Mesh(kind === 'case' ? new THREE.BoxGeometry(0.7, 0.28, 0.45) : new THREE.BoxGeometry(0.5, 0.4, 0.5), kind === 'case' ? M.case : kind === 'bomb' ? M.junk : M.parcel);
    body.position.y = 0.9; g.add(body);
    const band = new THREE.Mesh(new THREE.BoxGeometry(kind === 'case' ? 0.72 : 0.52, 0.06, kind === 'case' ? 0.47 : 0.52), kind === 'case' ? M.gold : kind === 'bomb' ? M.bomb : M.tape);
    band.position.y = 0.9; g.add(band);
    const beam = new THREE.Mesh(fx.geo.beam, fx.add(0x8fe8ff, 0.35)); beam.scale.set(1.3, 3.2, 1.3); g.add(beam);
    const ring = world.ctx.makePadRing(1.1, [0.5, 0.9, 1.0], true); ring.position.y = 0.03; g.add(ring);
    enableReflect(body);
    g.position.set(x, world.groundAt(x, z), z);
    scene.add(g);
    const c = { kind, mesh: g, body, pos: g.position, t: Math.random() * 6 };
    carries.push(c);
    return c;
  }
  function removeCarry(c) { if (!c) return; scene.remove(c.mesh); const i = carries.indexOf(c); if (i >= 0) carries.splice(i, 1); }

  // drop-off / objective beacon
  function beacon(x, z, color = [1, 0.8, 0.4]) {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(fx.geo.beam, fx.add(new THREE.Color(...color).getHex(), 0.3)); beam.scale.set(2.2, 6, 2.2); g.add(beam);
    const ring = world.ctx.makePadRing(2.2, color, true); ring.position.y = 0.04; g.add(ring);
    g.position.set(x, world.groundAt(x, z), z);
    scene.add(g);
    return { mesh: g, pos: g.position, remove() { scene.remove(g); } };
  }

  // a glowing loot drop (the item is already in the stash; picking it up is the reveal)
  function dropLoot(entry, x, z) {
    const col = entry.credits ? 0xffc850 : RARITY_COLOR[entry.item?.rarity] || 0xffffff;
    const g = new THREE.Group();
    const gem = new THREE.Mesh(fx.geo.gem, fx.add(col, 0.95)); gem.position.y = 0.5; g.add(gem);
    const core = new THREE.Mesh(fx.geo.gem, new THREE.MeshStandardMaterial({ color: col, metalness: 1, roughness: 0.15, emissive: col, emissiveIntensity: 0.6 })); core.scale.setScalar(0.6); gem.add(core);
    const tall = entry.credits ? 1.2 : 2 + (['custom', 'prototype', 'relic', 'heirloom'].indexOf(entry.item?.rarity) + 1) * 1.2;
    const beam = new THREE.Mesh(fx.geo.beam, fx.add(col, 0.45)); beam.scale.set(0.8, tall, 0.8); g.add(beam);
    g.position.set(x, world.groundAt(x, z), z);
    scene.add(g);
    const o = { ...entry, mesh: g, gem, pos: g.position, t: 0, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3), y: 0.5 };
    loot.push(o);
    return o;
  }

  function update(dt, playerPos, onCollect) {
    for (const d of destructibles) if (d.core) { d.t += dt; d.core.scale.y = 0.12 + 0.03 * Math.sin(d.t * 9); }
    for (const c of carries) { c.t += dt; c.body.position.y = 0.9 + Math.sin(c.t * 2.5) * 0.08; c.body.rotation.y += dt * 0.8; }
    for (let i = loot.length - 1; i >= 0; i--) {
      const o = loot[i];
      o.t += dt;
      if (o.t < 0.6) { o.pos.x += o.vel.x * dt; o.pos.z += o.vel.z * dt; o.vel.y -= 14 * dt; o.y = Math.max(0.5, o.y + o.vel.y * dt); }
      o.pos.y = world.groundAt(o.pos.x, o.pos.z);
      o.gem.position.y = o.y + Math.sin(o.t * 3) * 0.08; o.gem.rotation.y += dt * 2;
      const d = Math.hypot(o.pos.x - playerPos.x, o.pos.z - playerPos.z);
      if (o.t > 0.7 && d < 4.5) { const k = Math.min(1, dt * (10 / Math.max(d, 0.5))); o.pos.x += (playerPos.x - o.pos.x) * k; o.pos.z += (playerPos.z - o.pos.z) * k; }
      if ((o.t > 0.7 && d < 0.9) || o.t > 30) { scene.remove(o.mesh); loot.splice(i, 1); onCollect && onCollect(o); }
    }
  }

  function collectAll(onCollect) { for (const o of loot.splice(0)) { scene.remove(o.mesh); onCollect && onCollect(o); } }
  function clearMission() {
    for (const d of destructibles.splice(0)) scene.remove(d.mesh);
    for (const c of carries.splice(0)) scene.remove(c.mesh);
    for (const b of breakables.splice(0)) scene.remove(b.mesh);
  }

  return { nest, machine, breakable, splash, breakables, damage, carry, removeCarry, beacon, dropLoot, update, collectAll, clearMission, targets: () => destructibles.filter((d) => !d.destroyed), loot, destructibles };
}
