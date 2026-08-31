// One fight: builds the fighters, resolves hits, runs hazards, owns the camera and score.
// Also runs itself with no player attached, which is what the menu demo matches are.

import { Fighter, STRIKES } from './fighter.js';
import { Brain, movesForTier } from './ai.js';
import { Projectile } from './projectile.js';
import { FX } from './fx.js';
import { repel, P, NPTS } from './ragdoll.js';
import { HAZARD_CLASS } from './hazards.js';
import {
  SHEET_W, SHEET_H, GROUND_Y, WALL_PAD, GRAVITY, RANKS, LEVELS,
  playerRankAt, derive, moveStats, MOVES,
} from './config.js';
import { sfx } from './audio.js';

/**
 * Half the width of a standing fighter's body, in world units.
 *
 * This is capped by attack reach, not by how the figures look. A jab puts the hand about
 * 55u in front of the pelvis, and separation is (BODY_R * scaleA + BODY_R * scaleB) — so at
 * 26 the 1.3x-scale final boss sat 60u away and the player's basic attack could not reach
 * him at all. Keep BODY_R * 2.3 comfortably under 55.
 */
const BODY_R = 19;

export class Match {
  /**
   * @param opts {level, save, demo, bully, onEnd}
   */
  constructor(opts) {
    this.level = opts.level;
    this.save = opts.save;
    this.demo = !!opts.demo;
    this.autoplay = !!opts.autoplay;   // real fight, but the player is AI-driven (soak tests)
    this.bully = !!opts.bully;
    this.onEnd = opts.onEnd || (() => {});

    this.world = {
      gravity: GRAVITY, groundY: GROUND_Y,
      minX: WALL_PAD, maxX: SHEET_W - WALL_PAD, ceilY: -700,
      pit: null, pitFloor: GROUND_Y + 250,
    };
    this.fx = new FX(SHEET_W, SHEET_H);
    this.projectiles = [];
    this.hazards = [];
    this.time = 0;
    this.over = false;
    this.result = null;
    this.endT = 0;
    this.slowmo = 0;
    this.score = 0;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.kos = 0;
    this.bestCombo = 0;
    this.biggestLaunch = 0;
    this.hazardT = 5 + Math.random() * 4;
    this.announce = null;
    this.announceT = 0;
    this.introT = this.demo ? 0 : 2.6;   // name tags over each fighter at the start
    this.onSeen = opts.onSeen || (() => {});
    this.coach = null;                   // first-run prompt: the tap-to-punch discovery gap

    this.build();
  }

  build() {
    const L = this.level;
    const pRank = RANKS[this.bully ? RANKS.length - 1 : playerRankAt(L.idx)];
    const stats = derive(this.save);

    this.player = new Fighter({
      isPlayer: !this.demo,
      name: this.demo ? 'BLUE' : 'YOU',
      rank: pRank,
      hp: stats.maxHp * (1 + stats.heal),
      dmg: 8 * stats.atkMul,
      speed: stats.speed,
      jump: stats.jump,
      scale: 1,
      x: 380,
      facing: 1,
      stats,
    });
    this.player.place(560, GROUND_Y);

    this.enemies = [];
    this.brains = [];
    const n = L.enemies.length;
    L.enemies.forEach((e, i) => {
      const f = new Fighter({
        name: e.name,
        rank: RANKS[e.tier],
        hp: e.hp, dmg: e.dmg, speed: e.speed, scale: e.scale, mass: e.mass,
        skill: e.skill, moves: e.moves, boss: e.boss,
        facing: -1,
      });
      f.place(SHEET_W - 560 - i * 130 * (n > 1 ? 1 : 0), GROUND_Y);
      this.enemies.push(f);
      this.brains.push(new Brain(f, e.skill, movesForTier(e.tier, e.moves, e.boss)));
    });

    if (this.autoplay) {
      // Soak/sim player: fights with exactly the moves the save has actually bought.
      const owned = MOVES.filter((m) => (this.save.moves || {})[m.id]?.owned).map((m) => m.id);
      this.playerBrain = new Brain(this.player, 0.62, owned, this.save);
    } else if (this.demo) {
      this.playerBrain = new Brain(this.player, 0.55 + Math.random() * 0.3,
        movesForTier(Math.min(8, L.tier + 1), 3, false));
    }
    this.all = [this.player, ...this.enemies];
    this.camX = SHEET_W / 2;
    this.camY = GROUND_Y - 200;
    this.camZ = 1;
  }

  get aliveEnemies() { return this.enemies.filter((f) => !f.dead); }

  say(text, secs = 1.7) { this.announce = text; this.announceT = secs; }

  /**
   * Punching is a bare tap with nothing on screen to suggest it, so without this the only
   * way to find it is the help panel. Each prompt clears the first time you do the thing.
   */
  updateCoach() {
    if (this.demo || this.bully || this.over) { this.coach = null; return; }
    const seen = this.save.seen || (this.save.seen = {});
    if (!seen.punch) this.coach = { text: 'TAP THIS SIDE TO PUNCH', sub: 'tap again to combo' };
    else if (!seen.power) this.coach = { text: 'DRAW  /  FOR A POWER HIT', sub: 'low to high, like a slash' };
    else this.coach = null;
  }

  markSeen(key) {
    const seen = this.save.seen || (this.save.seen = {});
    if (seen[key]) return;
    seen[key] = true;
    this.onSeen();
  }

  // ── player input ─────────────────────────────────────────────────────────
  playerStrike() {
    if (this.over || this.demo) return;
    const k = this.player.strike();
    if (k) { sfx.whoosh(); this.markSeen('punch'); }
  }

  playerSpecial(id) {
    if (this.over || this.demo) return false;
    const m = moveStats(this.save, id);
    if (!m) return false;
    if (this.player.cooldown(id) > 0) {
      this.fx.text(this.player.x, this.player.y - 150, 'NOT READY', { col: '#9aa0ad', size: 24 });
      return false;
    }
    const ok = this.player.special(m);
    if (ok && id === 'power') this.markSeen('power');
    if (ok) {
      sfx.whoosh();
      this.fx.text(this.player.x, this.player.y - 165, m.name, { col: '#2f6ad0', size: 26 });
    }
    return ok;
  }

  // ── hit resolution ───────────────────────────────────────────────────────
  resolveHit = (attacker, A) => {
    const def = A.def;
    if (def.projectile) {
      const [hx, hy] = attacker.strikePoint(def);
      this.projectiles.push(new Projectile({
        type: def.projectile === 'bomb' ? 'bomb' : 'band',
        x: hx, y: hy,
        vx: attacker.facing * (def.projectile === 'bomb' ? 620 : 780),
        vy: -420,
        owner: attacker, dmg: def.dmg, kb: def.kb,
      }));
      sfx.twang();
      return;
    }

    const targets = attacker === this.player ? this.enemies : [this.player, ...this.enemies.filter((e) => e !== attacker)];
    const [hx, hy] = attacker.strikePoint(def);
    const reach = (def.reach || 30) * attacker.scale;

    if (def.aoe) {
      let any = false;
      for (const t of targets) {
        if (t.dead || A.hitSet.has(t.id)) continue;
        if (Math.abs(t.x - attacker.x) < def.aoe && Math.abs(t.y - attacker.y) < 220) {
          A.hitSet.add(t.id);
          this.land(attacker, t, def, [attacker.x, GROUND_Y - 10]);
          any = true;
        }
      }
      this.fx.burst(attacker.x, GROUND_Y - 10, 46);
      this.fx.shakeBy(16);
      this.fx.spawn(attacker.x, GROUND_Y, 0, -220, 'dust', 12, { spread: 220, size: 7 });
      this.fx.mark(attacker.x, GROUND_Y - 4, 16, (Math.random() * 1e6) | 0, '#20242c', 0.4);
      sfx.boom();
      if (!any) sfx.thud();
      return;
    }

    let hitAny = false;
    for (const t of targets) {
      if (t.dead || A.hitSet.has(t.id)) continue;
      let close = false;
      for (let i = 0; i < NPTS; i++) {
        if (Math.hypot(t.rag.x[i] - hx, t.rag.y[i] - hy) < reach + 12) { close = true; break; }
      }
      if (!close) continue;
      A.hitSet.add(t.id);
      this.land(attacker, t, def, [hx, hy]);
      hitAny = true;
    }
    if (!hitAny && !def.multi) sfx.whoosh();
  };

  land(attacker, target, def, from) {
    const isPlayer = attacker === this.player && !this.demo;
    // Enemies clobbering each other is half the comedy of a gauntlet, but at full damage
    // they finish the fight for you. Keep the ragdoll, drop the damage.
    const friendly = attacker !== this.player && target !== this.player;
    const stats = attacker.stats;
    let dmg = def.dmg ?? 8;
    if (!isPlayer && attacker !== this.player) dmg = def.dmg ?? attacker.baseDmg;
    if (attacker === this.player && !def.id) dmg = (def.dmg / 8) * attacker.baseDmg;

    if (friendly) dmg *= 0.25;
    let crit = false;
    if (stats && Math.random() < stats.crit) { dmg *= 2; crit = true; }
    if (stats && attacker.combo > 0) dmg *= 1 + Math.min(6, attacker.combo) * stats.combo * 0.25;

    const before = target.hp;
    const dealt = target.hurt(dmg, {
      from, kb: def.kb, stagger: def.stagger, launch: def.launch,
    });
    if (dealt <= 0) return;

    attacker.landedHit();
    if (target.brokeGuard) {
      this.fx.text(target.x, target.y - 175, 'GUARD BREAK!', { col: '#c0392b', size: 26 });
      this.fx.shakeBy(10);
      target.brokeGuard = false;
    }
    if (stats && stats.drain) attacker.heal(dealt * stats.drain);

    const power = def.p || 0.5;
    this.fx.burst(from[0], from[1], 20 + power * 26);
    this.fx.shakeBy(4 + power * 9);
    this.fx.stop(0.018 + power * 0.05);
    this.fx.spawn(from[0], from[1], 0, 0, 'ink', 3 + (power * 4) | 0, { spread: 130 * power, size: 3.4, col: '#20242c' });
    this.fx.spawn(from[0], from[1], 0, -40, 'scrap', 2 + (power * 3) | 0, { spread: 150 * power, size: 5 });
    if (power > 0.9) this.fx.spawn(from[0], from[1], 0, 0, 'star', 3, { spread: 90, size: 9, col: '#20242c' });
    sfx[def.sfx === 'boom' ? 'boom' : def.sfx === 'heavy' ? 'heavy' : 'hit'](power);

    if (isPlayer) {
      this.damageDealt += dealt;
      this.score += Math.round(dealt * 2);
      this.bestCombo = Math.max(this.bestCombo, attacker.combo);
      if (crit) this.fx.text(from[0], from[1] - 30, 'CRIT!', { col: '#c0392b', size: 30 });
      if (attacker.combo >= 3) {
        this.fx.text(from[0], from[1] - 58, `${attacker.combo} HIT`, { col: '#2f6ad0', size: 22 + Math.min(14, attacker.combo) });
        this.score += attacker.combo * 8;
      }
    } else if (target === this.player) {
      this.damageTaken += dealt;
    }
    if (target.mode === 'down' || target.dead) target.launchFrom = target.rag.centre()[0];
  }

  explode(p) {
    const R = 190;
    this.fx.burst(p.x, p.y, 70, '#7a4048');
    this.fx.shakeBy(26);
    this.fx.stop(0.07);
    this.fx.spawn(p.x, p.y, 0, -180, 'crumb', 24, { spread: 380, size: 6 });
    this.fx.spawn(p.x, p.y, 0, -120, 'dust', 18, { spread: 320, size: 9 });
    sfx.boom();
    for (const t of this.all) {
      if (t.dead || t === p.owner) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d > R) continue;
      const f = 1 - d / R;
      this.land(p.owner, t, { dmg: p.dmg * f, kb: p.kb * (0.6 + f), stagger: 1, p: 1.4, sfx: 'boom' }, [p.x, p.y]);
    }
  }

  // ── loop ─────────────────────────────────────────────────────────────────
  update(dt, input) {
    if (this.fx.hitstop > 0) {
      this.fx.update(dt, GROUND_Y);
      return;
    }
    let scale = 1;
    if (this.slowmo > 0) { this.slowmo -= dt; scale = 0.28; }
    const d = dt * scale;
    this.time += d;
    if (this.announceT > 0) this.announceT -= dt;
    if (this.introT > 0) this.introT -= dt;
    this.updateCoach();

    if (!this.over) {
      if (this.demo || this.autoplay) {
        this.playerBrain.update(d, { targets: this.enemies, projectiles: this.projectiles, hazards: this.hazards });
      } else if (input) {
        this.player.move(input.moveX, d);
        this.player.setBlock(input.block);
        if (input.jump) this.player.jump();
      }
      this.brains.forEach((b, i) => b.update(d, {
        targets: [this.player, ...this.enemies.filter((e) => e !== b.f)],
        projectiles: this.projectiles, hazards: this.hazards,
      }));
    }

    // Winner's lap: freeze the controls and let the player pose while the page celebrates.
    if (this.over && this.result === 'win' && !this.player.dead && this.player.mode === 'live') {
      this.player.vx *= 0.82;
      this.player.attack = null;
      this.player.blocking = false;
      this.player.poseLock = true;
      this.player.setAnim('victory');
      if (this.level.kind === 'final' && Math.random() < d * 26) {
        this.fx.spawn(this.camX + (Math.random() * 2 - 1) * 520, this.camY - 30, 0, 90, 'scrap', 1,
          { spread: 120, size: 7, life: 3.2 });
      }
    }

    for (const f of this.all) f.update(d, this.world, this.resolveHit);

    this.faceOpponents();
    this.separate();

    for (let i = 0; i < this.all.length; i++) {
      for (let j = i + 1; j < this.all.length; j++) {
        const a = this.all[i], b = this.all[j];
        // Limb-level shove is only for bowling a floored body around; upright fighters are
        // kept apart by separate(), and running both on the same pair makes them jitter.
        const floored = a.mode === 'down' || a.mode === 'dead' || b.mode === 'down' || b.mode === 'dead';
        if (floored && Math.abs(a.x - b.x) < 110) repel(a.rag, b.rag, 17);
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(d, this.world);
      let hit = false;
      for (const t of this.all) {
        if (t.dead || t === p.owner) continue;
        for (let k = 0; k < NPTS; k += 2) {
          if (Math.hypot(t.rag.x[k] - p.x, t.rag.y[k] - p.y) < 26) { hit = true; break; }
        }
        if (hit) {
          if (p.type === 'bomb') { this.explode(p); }
          else {
            this.land(p.owner, t, { dmg: p.dmg, kb: p.kb, stagger: 0.7, p: 0.7, sfx: 'hit' }, [p.x, p.y]);
            t.stunT = Math.max(t.stunT, 0.45);
            this.fx.text(t.x, t.y - 150, 'STUN', { col: '#c8683f', size: 22 });
          }
          p.dead = true;
          break;
        }
      }
      if (p.dead) {
        if (p.type === 'bomb' && !hit) this.explode(p);
        this.projectiles.splice(i, 1);
      }
    }

    this.world.pit = null;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.update(d, this.all, this.fx);
      if (h.dead) this.hazards.splice(i, 1);
    }

    if (!this.over && this.level.event) {
      this.hazardT -= d;
      if (this.hazardT <= 0) {
        this.spawnHazard(this.level.event);
        this.hazardT = this.level.event === 'pencil' ? 4.5 + Math.random() * 3
          : this.level.event === 'coffee' ? 7 + Math.random() * 4
          : 11 + Math.random() * 6;
      }
    }

    for (const f of this.all) {
      if ((f.mode === 'down' || f.mode === 'dead') && f.launchFrom != null) {
        const dist = Math.abs(f.rag.centre()[0] - f.launchFrom);
        if (f !== this.player && dist > this.biggestLaunch) this.biggestLaunch = dist;
      }
      if (f.mode === 'down' && f.rag.speed() > 9 && Math.random() < 0.3) {
        this.fx.scuff(f.rag.centre()[0], GROUND_Y - 2, 26, (Math.random() * 1e6) | 0);
      }
    }

    this.fx.update(d, GROUND_Y);
    this.checkEnd(dt);
    this.camera(dt);
  }

  /**
   * Always turn to face the nearest opponent. Facing used to follow the movement stick, so
   * crossing someone left you swinging at empty page with your back to them.
   */
  faceOpponents() {
    for (const f of this.all) {
      if (f.dead || f.attack || f.mode === 'down' || f.mode === 'dead') continue;
      let best = null, bd = Infinity;
      for (const o of this.all) {
        if (o === f || o.dead) continue;
        if (f !== this.player && o !== this.player) continue;   // enemies square up to the player
        const d = Math.abs(o.x - f.x);
        if (d < bd) { bd = d; best = o; }
      }
      if (!best || bd < 4) continue;
      f.facing = best.x > f.x ? 1 : -1;
    }
  }

  /**
   * Standing fighters are solid. You cross to the other side of someone by JUMPING over
   * them, never by walking through them — walking through was the thing that made it
   * impossible to keep track of which figure was yours.
   *
   * Deliberately does not apply when: either body is airborne (that is the crossing move),
   * either is floored (you step over a downed fighter), or the mover is mid-dash/flip,
   * which are supposed to travel through people.
   */
  separate() {
    const solid = (f) =>
      !f.dead && f.onGround &&
      (f.mode === 'live' || f.mode === 'stagger' || f.mode === 'getup') &&
      !(f.attack && f.attack.def.lockMove);

    for (let i = 0; i < this.all.length; i++) {
      const a = this.all[i];
      if (!solid(a)) continue;
      for (let j = i + 1; j < this.all.length; j++) {
        const b = this.all[j];
        if (!solid(b)) continue;
        const min = (BODY_R * a.scale) + (BODY_R * b.scale);
        let dx = b.x - a.x;
        if (dx === 0) dx = (a.id < b.id ? -0.01 : 0.01);
        const d = Math.abs(dx);
        if (d >= min) continue;
        const s = Math.sign(dx);
        const overlap = min - d;
        // Resolve on whoever is walking INTO the other. Splitting it evenly lets an
        // advancing AI bulldoze a standing player backwards across the page, which reads as
        // "I can never get a hit in" and pushed champion win rates down by a third.
        const intoA = Math.max(0, -b.vx * s);   // b moving toward a
        const intoB = Math.max(0, a.vx * s);    // a moving toward b
        const drive = intoA + intoB;
        let wa, wb;
        if (drive > 1) { wa = intoB / drive; wb = intoA / drive; }
        else { const ma = 1 / a.mass, mb = 1 / b.mass, sum = ma + mb; wa = ma / sum; wb = mb / sum; }
        a.x -= s * overlap * wa;
        b.x += s * overlap * wb;
        a.x = Math.max(this.world.minX + 24, Math.min(this.world.maxX - 24, a.x));
        b.x = Math.max(this.world.minX + 24, Math.min(this.world.maxX - 24, b.x));
        // Kill the closing velocity so they rest against each other instead of buzzing.
        // Stop dead against each other rather than buzzing.
        if (a.vx * s > 0) a.vx = 0;
        if (b.vx * s < 0) b.vx = 0;
      }
    }
  }

  spawnHazard(kind) {
    const C = HAZARD_CLASS[kind];
    if (!C) return;
    let h;
    if (kind === 'pencil') {
      const t = this.all[(Math.random() * this.all.length) | 0];
      h = new C(this, Math.max(200, Math.min(SHEET_W - 200, t.x + (Math.random() * 2 - 1) * 60)));
    } else if (kind === 'eraser') h = new C(this, Math.random() < 0.5 ? 1 : -1);
    else if (kind === 'coffee' || kind === 'tear') h = new C(this, 300 + Math.random() * (SHEET_W - 600));
    else h = new C(this);
    h.world = this.world;
    this.hazards.push(h);
    this.say(({ pencil: 'THE PENCIL!', eraser: 'ERASER INCOMING!', coffee: 'COFFEE SPILL!',
      wind: 'DRAUGHT!', tear: 'THE PAGE IS TEARING!', rain: 'ERASER RAIN!',
      scribble: 'SCRIBBLE STORM!' })[kind], 1.6);
    sfx.crumple();
  }

  checkEnd(dt) {
    if (this.over) { this.endT += dt; return; }
    const enemiesDown = this.aliveEnemies.length === 0;
    if (enemiesDown) {
      this.over = true;
      this.result = 'win';
      this.endT = 0;
      this.slowmo = this.level.kind === 'final' ? 2.6 : 1.4;
      this.kos = this.enemies.length;
      this.koAt = this.time;
      sfx.ko();
      const [kx] = this.enemies[this.enemies.length - 1].rag.centre();
      this.fx.text(kx, GROUND_Y - 190, 'K.O.', { col: '#c0392b', size: 64, life: 2.2, vy: -30 });
      this.fx.shakeBy(20);
      if (!this.demo) {
        this.score += 250 * this.enemies.length;
        if (this.damageTaken === 0) { this.score += 500; this.say('FLAWLESS!', 2.4); }
        this.score += Math.round(this.biggestLaunch * 0.4);
      }
      setTimeout(() => this.onEnd('win', this), this.demo ? 1400 : this.level.kind === 'final' ? 4200 : 2300);
    } else if (this.player.dead) {
      this.over = true;
      this.result = 'lose';
      this.endT = 0;
      this.slowmo = 1.4;
      sfx.fail();
      setTimeout(() => this.onEnd('lose', this), this.demo ? 1400 : 2100);
    }
  }

  camera(dt) {
    const live = this.all.filter((f) => !f.dead);
    const pts = (live.length ? live : this.all).map((f) => f.rag.centre());
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const spanX = maxX - minX;
    const wantH = Math.max(430, Math.min(720, spanX * 0.55 + 300));
    const tx = (minX + maxX) / 2;
    // Ground sits ~78% down the view; pan up only far enough to keep a launched body in
    // frame, never so far that the floor leaves the screen.
    const base = GROUND_Y - wantH * 0.78;
    const ty = Math.max(GROUND_Y - wantH * 0.98, Math.min(base, minY - wantH * 0.14));
    const k = Math.min(1, dt * 4.5);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.camH = (this.camH || wantH) + (wantH - (this.camH || wantH)) * Math.min(1, dt * 3);
  }
}
