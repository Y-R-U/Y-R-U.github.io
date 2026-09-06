// Casting: the one place the well (js/game/spells.js), the particles (js/world/spellfx.js) and
// the fight (js/game/combat.js) meet.
//
// It is installed on every level, not only ones with something to fight. Vail tells you to try it
// somewhere the ceiling is not hers, and a game that answers that with nothing would be lying —
// a spell thrown down an empty hall still has to leave a mark on the floor.
//
// The fight is resolved on this module's own clock rather than by the particle that lands: the
// visual and the damage agree on a flight time up front (`SpellFX.flightTime`) and then run
// independently, so a dropped frame or a cleared cloud cannot eat a hit the player paid mana for.

import * as THREE from 'three';
import { SpellFX } from '../world/spellfx.js';
import { makeWell, well, refuse, plan, fraction, cooling, tuning, MANA } from './spells.js';
import { isDead } from './foe.js';

// How wide of straight ahead a thrown spell will find a target on its own. Generous: the player is
// aiming with a third-person camera on a phone, and a bolt that misses because the stick was two
// degrees off is a bug as far as anyone playing is concerned.
export const AIM_ARC = 0.9;
export const AIM_RANGE = 26;

const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

export class Casting {
  constructor({ app, player, session, combat }) {
    this.app = app;
    this.player = player;
    this.session = session;
    this.combat = combat;
    this.well = makeWell(MANA);
    this.fx = new SpellFX(player);
    this.pending = [];
    this.slots = [];
    app.scene.add(this.fx.object3D);
  }

  // The four the save has awakened, in a fixed order, so the number keys mean the same thing every
  // time the game is opened.
  setSlots(list) { this.slots = list.slice(0, 4); }

  slot(n) { return this.slots[n] || null; }

  get mana() { return fraction(this.well); }

  // What the ability sheet shows against each row: ready, cooling, or too dear.
  state(a) {
    const why = refuse(this.well, a);
    return { ready: !why, why, cooling: cooling(this.well, a), cost: tuning(a).cost };
  }

  // The live elemental nearest to where the player is looking, or null. Distance breaks ties
  // rather than angle: two foes in the same direction means the near one is the one in the way.
  aimAt() {
    const foes = this.combat?.foes || [];
    const P = this.player;
    let best = null, bestD = Infinity;
    for (let i = 0; i < foes.length; i++) {
      const f = foes[i];
      if (isDead(f)) continue;
      const dx = f.x - P.pos.x, dz = f.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > AIM_RANGE) continue;
      if (Math.abs(wrapPi(Math.atan2(dx, dz) - P.camYaw)) > AIM_ARC) continue;
      if (d < bestD) { best = i; bestD = d; }
    }
    return best === null ? null : { index: best, foe: foes[best], dist: bestD };
  }

  // How far a bolt gets down the aim line before it meets a wall. The player's own collider set
  // answers it, which means indoors it is the room and outdoors it is the world.
  reach(range) {
    const P = this.player;
    const dir = new THREE.Vector3(Math.sin(P.camYaw), 0, Math.cos(P.camYaw));
    const eye = new THREE.Vector3(P.pos.x, P.pos.y + 1.35, P.pos.z);
    const c = P.colliders;
    const d = c ? Math.min(range, c.hit(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, range, 0.14)) : range;
    return { dir, eye, dist: Math.max(1.2, d) };
  }

  // The one entry point. Answers a reason rather than a boolean so the caller can say it out loud.
  cast(ability) {
    const doc = this.session?.essences?.doc;
    const picked = this.session?.doc?.essences?.picked || [];
    const p = plan(doc, this.well, ability, picked);
    if (!p.ok) return p;

    const c = p.cast;
    this.well = { ...this.well, mana: this.well.mana - c.cost, cool: { ...this.well.cool, [ability.id]: c.cooldown } };

    if (c.aim === 'self') return this.self(c);
    if (c.aim === 'dash') return this.dash(c);
    return this.throwAt(c);
  }

  throwAt(c) {
    const P = this.player;
    const hit = this.aimAt();
    const ray = this.reach(Math.min(c.shape.range, AIM_RANGE));
    // A foe further away than the wall the ray found is behind that wall.
    const onTarget = hit && hit.dist <= ray.dist + 1.2;
    const to = onTarget
      ? new THREE.Vector3(hit.foe.x, this.groundY(hit.foe.x, hit.foe.z) + 1.0, hit.foe.z)
      : ray.eye.clone().addScaledVector(ray.dir, ray.dist);
    const from = this.fx.hand(new THREE.Vector3());
    this.fx.cast({ look: c.look, to });
    if (onTarget && c.damage > 0) {
      this.pending.push({
        t: SpellFX.flightTime(c.look, from.distanceTo(to)),
        // The index, not the record: `foes` is replaced element-by-element every frame and never
        // spliced, so the slot is what stays true for the third of a second the bolt is in the air.
        index: hit.index, damage: c.damage, stagger: c.stagger || 0,
      });
    }
    return { ok: true, why: null, cast: c, target: onTarget ? hit.index : null };
  }

  // A ward or a mend blooms where you stand. Same particles, no flight, and the burst is what
  // tells the player the mana went somewhere.
  self(c) {
    const P = this.player;
    const at = new THREE.Vector3(P.pos.x, P.pos.y + 1.1, P.pos.z);
    this.fx.cast({ look: c.look, to: at.clone().add(new THREE.Vector3(0, 0.35, 0)), at });
    this.apply(c);
    return { ok: true, why: null, cast: c, target: null };
  }

  // A movement ability arrives somewhere, and arrives hot. It carries you as far as the wall in
  // front of you allows and blooms where you land, which is the same burst everything else uses.
  dash(c) {
    const P = this.player;
    const ray = this.reach(c.dash || 5);
    const gap = Math.max(0, ray.dist - this.player.walkRadius - 0.2);
    P.pos.x += ray.dir.x * gap;
    P.pos.z += ray.dir.z * gap;
    P.pos.y = this.groundY(P.pos.x, P.pos.z);
    P.vy = 0;
    P.airborne = false;
    const at = new THREE.Vector3(P.pos.x, P.pos.y + 1.1, P.pos.z);
    this.fx.cast({ look: c.look, to: at.clone().add(new THREE.Vector3(0, 0.3, 0)), at });
    // What it landed on: everything close enough to be inside the arrival, not a thrown bolt.
    if (c.damage > 0) this.pending.push({ t: 0.05, at: { x: P.pos.x, z: P.pos.z }, radius: 2.6, damage: c.damage, stagger: c.stagger || 0 });
    this.apply(c);
    return { ok: true, why: null, cast: c, target: null };
  }

  apply(c) {
    if (c.mend) this.combat?.mend?.(c.mend);
    if (c.ward) this.combat?.guard?.(c.ward);
  }

  groundY(x, z) { return this.player.groundY ? this.player.groundY(x, z) : 0; }

  update(dt) {
    this.well = well(this.well, dt);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const h = this.pending[i];
      h.t -= dt;
      if (h.t > 0) continue;
      this.pending.splice(i, 1);
      this.combat?.spellHit?.(h);
    }
    this.fx.update(dt, this.app);
  }

  // A level swap disposes the world the particles were drawn against, so nothing survives it.
  reset() {
    this.pending.length = 0;
    this.fx.clear();
  }

  dispose() {
    this.app.scene.remove(this.fx.object3D);
    this.fx.dispose();
  }

  report() {
    return {
      mana: +this.well.mana.toFixed(1), cool: this.well.cool,
      slots: this.slots.map(a => a?.id || null), pending: this.pending.length, ...this.fx.report(),
    };
  }
}
