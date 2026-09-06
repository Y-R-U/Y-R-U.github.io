// The fight, tied together. js/game/foe.js decides what the elemental does, js/game/vitals.js says
// whether a blow landed, js/game/ground.js says what the floor is made of, and js/world/elemental.js
// draws the result. This is the only place any of them meet the player, and it is the only place
// that knows the proving is a quest rather than a brawl.
//
// It is installed for any level that has a `foes` list and does nothing at all for one that has
// not, so the Society pays nothing for the feature.

import { Elemental } from '../world/elemental.js';
import { spawn, step, wound, isDead } from './foe.js';
import { make, hurt, mend, inSwing, fraction } from './vitals.js';
import { WARD } from './spells.js';
import { isHealing, plotsOf } from './ground.js';
import { describe } from './bestiary.js';
// Re-exported, not redefined: js/game/bestiary.test.mjs has to reach the knife without reaching
// three, and two copies of a balance number is one copy too many.
import { KNIFE, PLAYER_HP } from './weapons.js';

export { KNIFE, PLAYER_HP };

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
    // How long a ward is still standing. One number rather than a list: two wards at once is a
    // longer ward, which is what a player casting two defensive abilities expects anyway.
    this.warded = 0;
    // True while the mission still has a wave to send. Without it a `survive` contract whose first
    // group goes down before the second arrives is won on an empty floor at eleven seconds.
    this.expecting = false;
    this.ended = null;
    this.load(level);
  }

  get active() { return this.foes.some(f => !isDead(f)); }

  load(level) {
    this.clear();
    this.level = level;
    this.plots = plotsOf(level);
    this.spec = level?.foes || [];
    // Resolved once at load, not per frame: a kind and a variant multiply out to a tuning, a name,
    // two colours and a surface it mends from, and none of that changes while the fight runs.
    this.book = this.spec.map(s => describe(s));
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
    this.expecting = false;
  }

  // Called when the level says the fight starts — a hotspot's `proving.begin` event, not level
  // load, so a player who walks in and stands at the gate is not jumped the instant it streams in.
  begin() {
    if (this.foes.length || !this.spec.length) return false;
    this.vitals = make(PLAYER_HP);
    this.warded = 0;
    this.stand(this.spec, this.book);
    this.session?.bus?.dispatchEvent(new CustomEvent('combat.begin', { detail: { foes: this.foes.length } }));
    return true;
  }

  // A wave, arriving after the gate. Appended rather than replacing: the indices js/game/casting.js
  // banks a spell hit against have to stay pointing at the same body for the third of a second the
  // bolt is in the air, so nothing already standing may move slot.
  reinforce(specs) {
    if (!specs?.length || this.ended) return 0;
    const book = specs.map(s => describe(s));
    this.spec = [...this.spec, ...specs];
    this.book = [...this.book, ...book];
    this.stand(specs, book);
    this.session?.bus?.dispatchEvent(new CustomEvent('combat.wave', { detail: { foes: specs.length } }));
    return specs.length;
  }

  stand(specs, book) {
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i], b = book[i];
      const f = spawn({ x: s.x, z: s.z, yaw: s.yaw || 0 }, b.tuning);
      const body = new Elemental(s.zone || 'neutral', b.scale, { rock: b.rock, seam: b.seam });
      this.app.scene.add(body.object3D);
      this.foes.push(f);
      this.bodies.push(body);
    }
  }

  groundY(x, z) { return this.player.groundY(x, z); }

  // What the bar over its head says it is. The name is the kind and what has been done to it —
  // "Greater Ember Elemental" — unless the level document wrote one out itself.
  nameOf(i) { return this.book[i]?.name || 'Something'; }

  // What killing everything in the room is worth. Summed off the bestiary rather than authored on
  // the contract, so a mission that swaps in a bigger monster pays more without anyone saying so.
  get worth() { return this.book.reduce((a, b) => a + b.xp, 0); }

  update(dt) {
    if (!this.foes.length) return;
    const P = this.player;
    const me = { x: P.pos.x, z: P.pos.z, alive: !this.vitals.dead };

    // The swing is banked and resolved a moment later, so the blade is out where the player can
    // see it when it decides. `castEdge` is the player's own one-frame flag; clearing it here is
    // what stops a held button being a hit every frame.
    this.cool = Math.max(0, this.cool - dt);
    this.warded = Math.max(0, this.warded - dt);
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
      const b = this.book[i];
      const f = step(before, dt, { player: me, onDirt: (x, z) => isHealing(this.plots, x, z, b.heals) }, b.tuning);
      this.foes[i] = f;
      // It swings on the frame it enters `strike`, and whether that connects is decided here
      // because the foe module has no idea how wide the player is.
      if (f.struck && !this.vitals.dead) {
        const hitMe = inSwing({
          from: { x: f.x, z: f.z }, yaw: f.yaw, to: { x: P.pos.x, z: P.pos.z },
          reach: b.tuning.reach, arc: b.tuning.arc, radius: P.walkRadius,
        });
        if (hitMe) this.takeHit(b.tuning.damage);
      }
      this.bodies[i].sync(f, this.groundY(f.x, f.z), dt);
    }

    if (!this.ended && !this.active && !this.expecting) this.finish('won');
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
        reach: KNIFE.reach, arc: KNIFE.arc, radius: this.book[i].tuning.radius,
      });
      if (!hit) continue;
      this.foes[i] = wound(f, KNIFE.damage, sw.id);
      landed = true;
    }
    if (landed) this.session?.bus?.dispatchEvent(new CustomEvent('combat.hit', { detail: { id: sw.id } }));
    return landed;
  }

  // ── what a spell does when it arrives ────────────────────────────────────
  // js/game/casting.js resolves the flight and hands the result here, so the rules about who is
  // hurt and by how much stay in the one module that owns the fight.

  spellHit(h) {
    if (!this.foes.length) return false;
    let landed = false;
    const id = ++this.swingId;
    // An index for a thrown bolt, a circle for anything that arrived where the player did.
    const idx = h.index != null ? [h.index]
      : this.foes.map((f, i) => i).filter(i => Math.hypot(this.foes[i].x - h.at.x, this.foes[i].z - h.at.z) <= (h.radius || 2.5) + this.book[i].tuning.radius);
    for (const i of idx) {
      const f = this.foes[i];
      if (!f || isDead(f)) continue;
      this.foes[i] = wound(f, h.damage, id);
      landed = true;
    }
    if (landed) this.session?.bus?.dispatchEvent(new CustomEvent('combat.hit', { detail: { id, spell: true } }));
    return landed;
  }

  mend(amount) {
    if (this.vitals.dead) return false;
    this.vitals = mend(this.vitals, amount);
    return true;
  }

  guard(seconds) { this.warded = Math.max(this.warded, seconds); return true; }

  takeHit(amount) {
    // A ward does not stop a blade. It takes the weight out of it, which is what every defensive
    // ability in data/essences.json says it does in one way or another.
    const taken = this.warded > 0 ? amount * (1 - WARD) : amount;
    this.vitals = hurt(this.vitals, taken);
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
