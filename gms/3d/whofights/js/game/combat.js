// The fight, tied together. js/game/foe.js decides what the elemental does, js/game/vitals.js says
// whether a blow landed, js/game/ground.js says what the floor is made of, and js/world/elemental.js
// draws the result. This is the only place any of them meet the player, and it is the only place
// that knows the proving is a quest rather than a brawl.
//
// It is installed for any level that has a `foes` list and does nothing at all for one that has
// not, so the Society pays nothing for the feature.

import { Elemental } from '../world/elemental.js';
import { EARTH, spawn, step, wound, isDead } from './foe.js';
import { make, hurt, inSwing, fraction } from './vitals.js';
import { isDirt, plotsOf } from './ground.js';

export const KNIFE = {
  damage: 9,
  reach: 2.6,
  arc: 1.9,
  cooldown: 0.75,
  // How long after the swing starts the blade is actually out there. Resolving on the press makes
  // a hit land before the animation has moved, which reads as the elemental flinching at nothing.
  land: 0.16,
};

export const PLAYER_HP = 100;

export class Combat {
  constructor({ app, player, level, session }) {
    this.app = app;
    this.player = player;
    this.session = session;
    this.foes = [];
    this.bodies = [];
    this.swingId = 0;
    this.cool = 0;
    this.pending = null;
    this.vitals = make(PLAYER_HP);
    this.ended = null;
    this.load(level);
  }

  get active() { return this.foes.some(f => !isDead(f)); }

  load(level) {
    this.clear();
    this.level = level;
    this.plots = plotsOf(level);
    this.spec = level?.foes || [];
    this.onDirt = (x, z) => isDirt(this.plots, x, z);
    // A level with something in it to fight is a level you are handed a knife for. The Society's
    // own floors have none, and the player walks its halls empty-handed.
    this.player.arm?.(this.spec.length > 0);
  }

  clear() {
    for (const b of this.bodies) { this.app.scene.remove(b.object3D); b.dispose(); }
    this.bodies.length = 0;
    this.foes.length = 0;
    this.ended = null;
    this.pending = null;
  }

  // Called when the level says the fight starts — a hotspot's `proving.begin` event, not level
  // load, so a player who walks in and stands at the gate is not jumped the instant it streams in.
  begin() {
    if (this.foes.length || !this.spec.length) return false;
    this.vitals = make(PLAYER_HP);
    for (const s of this.spec) {
      const f = spawn({ x: s.x, z: s.z, yaw: s.yaw || 0 }, EARTH);
      const body = new Elemental(s.zone || 'neutral', s.scale || 1);
      this.app.scene.add(body.object3D);
      this.foes.push(f);
      this.bodies.push(body);
    }
    this.session?.bus?.dispatchEvent(new CustomEvent('combat.begin', { detail: { foes: this.foes.length } }));
    return true;
  }

  groundY(x, z) { return this.player.groundY(x, z); }

  update(dt) {
    if (!this.foes.length) return;
    const P = this.player;
    const me = { x: P.pos.x, z: P.pos.z, alive: !this.vitals.dead };

    // The swing is banked and resolved a moment later, so the blade is out where the player can
    // see it when it decides. `castEdge` is the player's own one-frame flag; clearing it here is
    // what stops a held button being a hit every frame.
    this.cool = Math.max(0, this.cool - dt);
    if (P.castEdge) {
      P.castEdge = false;
      if (this.cool <= 0 && !this.vitals.dead) {
        this.cool = KNIFE.cooldown;
        this.pending = { t: KNIFE.land, yaw: P.yaw, id: ++this.swingId };
      }
    }
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) { this.resolveSwing(this.pending); this.pending = null; }
    }

    for (let i = 0; i < this.foes.length; i++) {
      const before = this.foes[i];
      const f = step(before, dt, { player: me, onDirt: this.onDirt }, EARTH);
      this.foes[i] = f;
      // It swings on the frame it enters `strike`, and whether that connects is decided here
      // because the foe module has no idea how wide the player is.
      if (f.struck && !this.vitals.dead) {
        const hitMe = inSwing({
          from: { x: f.x, z: f.z }, yaw: f.yaw, to: { x: P.pos.x, z: P.pos.z },
          reach: EARTH.reach, arc: EARTH.arc, radius: P.walkRadius,
        });
        if (hitMe) this.takeHit(EARTH.damage);
      }
      this.bodies[i].sync(f, this.groundY(f.x, f.z), dt);
    }

    if (!this.ended && !this.active) this.finish('won');
    if (!this.ended && this.vitals.dead) this.finish('lost');
  }

  resolveSwing(sw) {
    const P = this.player;
    let landed = false;
    for (let i = 0; i < this.foes.length; i++) {
      const f = this.foes[i];
      if (isDead(f)) continue;
      const hit = inSwing({
        from: { x: P.pos.x, z: P.pos.z }, yaw: sw.yaw, to: { x: f.x, z: f.z },
        reach: KNIFE.reach, arc: KNIFE.arc, radius: EARTH.radius,
      });
      if (!hit) continue;
      this.foes[i] = wound(f, KNIFE.damage, sw.id);
      landed = true;
    }
    if (landed) this.session?.bus?.dispatchEvent(new CustomEvent('combat.hit', { detail: { id: sw.id } }));
    return landed;
  }

  takeHit(amount) {
    this.vitals = hurt(this.vitals, amount);
    this.session?.bus?.dispatchEvent(new CustomEvent('combat.hurt', {
      detail: { hp: this.vitals.hp, fraction: fraction(this.vitals) },
    }));
  }

  // The fight is over. What that means is the level's business, not this module's — `outcome` is
  // reported and the session decides whether it was a proving or a brawl.
  finish(outcome) {
    this.ended = outcome;
    this.session?.bus?.dispatchEvent(new CustomEvent('combat.end', { detail: { outcome } }));
  }

  // What the HUD shows: the player's health, and the worst-off thing still standing. Null means
  // there is no fight, which is what every level but the proving answers.
  bars() {
    if (!this.foes.length || this.ended === 'won') return [null, null];
    const live = this.foes.filter(f => !isDead(f));
    return [fraction(this.vitals), live.length ? Math.min(...live.map(f => f.hp / f.max)) : null];
  }

  report() {
    return {
      hp: this.vitals.hp, ended: this.ended,
      foes: this.foes.map(f => ({ state: f.state, hp: +f.hp.toFixed(1), onDirt: f.onDirt })),
    };
  }
}
