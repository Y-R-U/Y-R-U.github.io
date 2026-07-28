// game.js — a single broadcast: sector, player rig, rivals, defences, and the
// viewership economy that decides how big you are allowed to get.

import * as THREE from 'three';
import { HOLE, VIEW, CAM, ECON, TIER_R, TIER_NAMES, TIER_VALUE, BOON_STEPS, HAZARD, RIVAL } from './config.js';
import { Sector, domeY } from './world.js';
import { Hole, runCapture, updateSinking, radiusForMass, tierForRadius } from './hole.js';
import { spawnRivals } from './rivals.js';
import { Hazards } from './hazards.js';
import { permMods, defaultMods, drawBoons, BOON_BY_ID } from './upgrades.js';
import { S } from './save.js';
import { skin } from './palettes.js';
import { clamp, damp, lerp, makeRng, fmt, TAU } from './utils.js';
import * as A from './audio.js';

const RESULT = { WIN: 'win', LOSE: 'lose', ABANDON: 'abandon' };
export { RESULT };

export class Run {
  constructor(ctx, spec, opts) {
    this.ctx = ctx;
    this.spec = spec;
    this.opts = opts || {};
    this.listener = this.opts.on || (() => {});
    this.auto = !!this.opts.auto;
    this.demo = !!this.opts.demo;
    this.rng = makeRng((spec.seed ^ 0x1234567) >>> 0);
    this.pm = permMods();
    this.mods = defaultMods(this.pm);
    if (spec.ev) this._applyEventMods(spec.ev);
    this.taken = {};
    this.boons = [];
    this.paused = false;
    this.over = false;
    this.t = 0;

    const quality = this.opts.quality || {};
    this.sector = new Sector(ctx.scene, spec, {
      shadows: quality.shadows, glow: quality.glow !== false,
      lowTex: !!quality.lowTex, maxProps: quality.maxProps, variants: quality.variants || 3,
    });

    // ── player rig ──
    const sk = skin(S().skin);
    const startMass = this.demo ? 26 : this.pm.startMass;
    const a = this.rng() * TAU;
    const d = this.sector.R * 0.82;
    this.player = new Hole(ctx.scene, {
      isPlayer: true, x: Math.cos(a) * d, z: Math.sin(a) * d,
      mass: startMass, colA: sk.a, colB: sk.b,
    });
    this.player.pullMul = this.mods.pullMul;
    this.player.speedMul = this.mods.speedMul;

    // ── opposition ──
    this.rivals = spawnRivals(ctx.scene, this.sector, spec.rivals | 0,
      (spec.seed ^ 0xa5a5) >>> 0, (spec.rivalGrowth || 1) * (1 + spec.act * 0.05), startMass * 0.8);
    this.hazards = new Hazards(ctx.scene, this.sector, spec, { shadows: quality.shadows });

    // ── viewership ──
    this.mass = startMass;
    this.hype = this.demo ? 1.2 : this.pm.startHype;
    if (spec.ev && spec.ev.noHype) this.hype = 0;
    this.viewers = 0;
    this.peakViewers = 0;
    this.combo = 0;
    this.comboT = 0;
    this.bestCombo = 0;
    this.idleT = 0;
    this.eatenCount = 0;
    this.landmarksTaken = 0;
    this.revives = this.pm.revives;
    this.boonIndex = 0;
    this.pendingBoon = null;
    this.hazardHits = 0;

    this.timeLimit = spec.time ? spec.time + (spec.kind === 'story' ? this.pm.extraTime : 0) : 0;
    this.timeLeft = this.timeLimit;
    this.elapsed = 0;

    // hook state
    this.adT = 0; this.novaT = 0; this.frenzy = 0;

    this._camPos = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._initCamera();
    this._recalc();
    this.emit('start', { spec });
  }

  _applyEventMods(ev) {
    const m = this.mods;
    if (ev.massMul) m.massMul *= ev.massMul;
    if (ev.hypeGainMul) m.hypeGainMul *= ev.hypeGainMul;
    if (ev.hypeDecayMul) m.hypeDecayMul *= ev.hypeDecayMul;
    if (ev.moverHypeMul) m.moverHypeMul *= ev.moverHypeMul;
    if (ev.tierEase) m.tierSkip += ev.tierEase;
    this.eventSubsMul = ev.subsMul || 1;
    this.idleAfter = ev.idleAfter || VIEW.IDLE_AFTER;
    this.noHype = !!ev.noHype;
  }

  emit(type, data) { try { this.listener(type, data || {}); } catch (e) { /* UI errors must not kill the run */ } }

  // ── economy ───────────────────────────────────────────────────────────────

  get hypeMax() { return this.mods.hypeMax || VIEW.HYPE_MAX; }

  _recalc() {
    const eff = this.mass * (1 + this.hype * VIEW.HYPE_MASS);
    this.player.mass = this.mass;
    this.player.setHypeBonus(eff - this.mass);
    this.player.radiusMul = this.mods.radiusMul;
    this.player.recalc();
    // Overdraft lets the aperture bite one tier above its true size
    if (this.mods.tierSkip > 0) {
      const boosted = Math.min(8, this.player.tier + this.mods.tierSkip);
      this.player.radius = Math.max(this.player.radius, TIER_R[boosted]);
      this.player.tier = boosted;
    }
    this.viewers = eff * VIEW.PER_MASS;
    if (this.viewers > this.peakViewers) this.peakViewers = this.viewers;
  }

  addHype(v) {
    if (this.noHype) return;
    this.hype = clamp(this.hype + v * this.mods.hypeGainMul, this.mods.hypeFloor, this.hypeMax);
  }

  // ── swallow handling ──────────────────────────────────────────────────────

  _onCapture(p, h) {
    if (h !== this.player) return;
    const fx = this.ctx.fx;
    if (fx) {
      const col = p.tier >= 6 ? 0xffd08a : this.player.colA.getHex();
      fx.burst(p.x, p.y + p.h * 0.3, p.z, col, 3 + p.tier * 2, 2 + p.tier);
    }
  }

  _onSwallow(p, h) {
    if (h !== this.player) {
      // a rival ate it — Scavenger Feed pays us a cut
      if (this.mods.scavenge > 0) {
        this.mass += p.value * this.mods.scavenge * this.mods.massMul;
        this._recalc();
      }
      if (h.owner) h.owner.gain(p);
      return;
    }
    const big = p.tier >= 7 ? this.mods.bigMul : 1;
    const gain = p.value * this.mods.massMul * big;
    this.mass += gain;
    this.eatenCount++;

    // combo
    this.comboT = VIEW.COMBO_WINDOW * this.mods.comboWindow;
    this.combo = Math.min(VIEW.COMBO_MAX, this.combo + 1);
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.idleT = 0;

    // hype
    let hy = (VIEW.GAIN_SWALLOW + p.tier * VIEW.GAIN_TIER) * big;
    if (p.mover) hy += VIEW.GAIN_MOVER * this.mods.moverHypeMul;
    hy += Math.min(0.35, this.combo * VIEW.COMBO_HYPE);
    if (p.tier === 8) { hy += VIEW.GAIN_LANDMARK; this.landmarksTaken++; }
    this.addHype(hy);

    const oldTier = this.player.tier;
    this._recalc();
    if (this.player.tier > oldTier) this._tierUp(this.player.tier);

    // feedback
    const fx = this.ctx.fx;
    if (fx) {
      if (p.tier >= 5) {
        fx.ring(this.player.x, domeY(this.player.x, this.player.z), this.player.z,
          this.player.colB.getHex(), this.player.radius, this.player.radius * (1.8 + p.tier * 0.2), 0.5);
        fx.shake(0.1 + p.tier * 0.06);
        fx.burst(p.x, p.y + p.h * 0.4, p.z, 0xffd08a, 12 + p.tier * 3, 5 + p.tier);
      }
      if (p.tier >= 4 || this.combo % 5 === 0) {
        const label = p.tier >= 7 ? '+' + fmt(gain * VIEW.PER_MASS) + ' VIEWERS' : (this.combo > 1 ? '×' + this.combo : '+' + fmt(gain * VIEW.PER_MASS));
        fx.pop(label, p.x, p.y + p.h * 0.6, p.z, p.tier >= 7 ? 'big' : this.combo > 6 ? 'hot' : '');
      }
    }
    if (p.tier >= 6) A.sfxBigSwallow(p.tier); else A.sfxSwallow(p.tier, this.combo);
    if (p.tier >= 7) this.emit('chat', { kind: 'big', tier: p.tier });
    if (p.tier === 8) this.emit('chat', { kind: 'landmark' });
    if (this.combo === 8 || this.combo === 16 || this.combo === 28) this.emit('chat', { kind: 'combo', n: this.combo });

    // Chain Reaction
    if (this.taken.chain && p.tier >= 3) this._chainPulse(p.x, p.z, 10 + p.tier * 4);

    this._checkBoon();
  }

  _onNearMiss(p, h) {
    if (h !== this.player) return;
    this.addHype(VIEW.GAIN_NEARMISS);
    if (this.ctx.fx && this.rng() < 0.5) this.ctx.fx.pop('SO CLOSE', p.x, p.y + p.h * 0.5, p.z, 'near');
  }

  _tierUp(t) {
    this.addHype(VIEW.GAIN_TIERUP);
    A.sfxTierUp();
    const fx = this.ctx.fx;
    if (fx) {
      fx.ring(this.player.x, domeY(this.player.x, this.player.z), this.player.z, 0xffffff, this.player.radius, this.player.radius * 3.2, 0.8);
      fx.shake(0.35);
    }
    this.emit('tierup', { tier: t, name: TIER_NAMES[t] });
    this.emit('chat', { kind: 'tierup', tier: t });
  }

  _chainPulse(x, z, r) {
    const fx = this.ctx.fx;
    if (fx) fx.ring(x, domeY(x, z), z, this.player.colA.getHex(), 1, r, 0.4);
    this.sector.grid.query(x, z, r, (p) => {
      if (p.dead || p.state >= 2) return;
      const dx = this.player.x - p.x, dz = this.player.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > r * 2.2) return;
      p.x += (dx / d) * Math.min(7, r * 0.35);
      p.z += (dz / d) * Math.min(7, r * 0.35);
      this.sector.grid.remove(p); this.sector.grid.insert(p);
      this.sector.field.write(p);
    });
  }

  // ── hazards ───────────────────────────────────────────────────────────────

  _onHit(src, scale) {
    if (this.player.stun > 0) return;
    const k = this.mods.hazardMul * (scale || 1);
    this.player.stun = HAZARD.STUN_TIME * k;
    this.hype = Math.max(this.mods.hypeFloor, this.hype - HAZARD.HYPE_LOSS * k);
    const lost = this.mass * HAZARD.MASS_LOSS * k;
    this.mass = Math.max(0, this.mass - lost);
    this.combo = 0;
    this.hazardHits++;
    this._recalc();
    A.sfxHit();
    const fx = this.ctx.fx;
    if (fx) {
      fx.shake(0.7);
      fx.burst(this.player.x, domeY(this.player.x, this.player.z) + 1, this.player.z, 0xff5a3a, 22, 9);
      fx.pop('SIGNAL HIT', this.player.x, domeY(this.player.x, this.player.z) + 4, this.player.z, 'bad');
    }
    this.emit('hit', {});
    this.emit('chat', { kind: 'hit' });
  }

  _onHazardDown(h, silent) {
    if (silent) return;
    this.mass += TIER_VALUE[h.tier || 4] * this.mods.massMul;
    this.addHype(0.3);
    this._recalc();
    const fx = this.ctx.fx;
    if (fx) {
      fx.burst(h.x, h.y + 3, h.z, 0xffb03a, 26, 12);
      fx.ring(h.x, h.y, h.z, 0xffb03a, 1, 16, 0.6);
      fx.pop(h.kind === 'pylon' ? 'SHIELD DOWN' : 'DEFENCE SILENCED', h.x, h.y + 6, h.z, 'good');
      fx.shake(0.4);
    }
    A.sfxBigSwallow(5);
    this.emit('chat', { kind: 'hazard' });
  }

  // ── boons ─────────────────────────────────────────────────────────────────

  _checkBoon() {
    if (this.demo) return;   // the home-screen demo never interrupts itself
    while (this.boonIndex < BOON_STEPS.length && this.viewers >= BOON_STEPS[this.boonIndex]) {
      this.boonIndex++;
      const choices = drawBoons(this.rng, this.taken, this.pm.boonChoices, this.pm.rareMul);
      if (!choices.length) continue;
      // The autopilot picks for itself, so a soak test measures a run with the
      // boons a real player would have rather than a bare one.
      if (this.auto) { this.takeBoon(this.rng.pick(choices)); continue; }
      this.pendingBoon = choices;
      this.paused = true;
      A.sfxBoon();
      this.emit('boon', { choices });
      return;
    }
  }

  takeBoon(b) {
    this.pendingBoon = null;
    this.paused = false;
    if (!b) return;
    this.taken[b.id] = (this.taken[b.id] || 0) + 1;
    this.boons.push(b);
    if (b.mods) b.mods(this.mods);
    this.player.pullMul = this.mods.pullMul;
    this.player.speedMul = this.mods.speedMul;
    this._recalc();
    this.emit('chat', { kind: 'boon', name: b.name });
  }

  // ── the loop ──────────────────────────────────────────────────────────────

  update(dt) {
    if (this.over || this.paused) { this._updateCamera(dt, true); return; }
    dt = Math.min(dt, 0.05);
    this.t += dt;
    this.elapsed += dt;

    const p = this.player;

    // input / autopilot
    if (p.stun > 0) p.stun -= dt;
    let ix = 0, iz = 0;
    if (this.auto || this.demo) {
      const dir = this._pilot(dt);
      ix = dir.x; iz = dir.z;
    } else {
      const r = this.ctx.controls.read();
      ix = r.x; iz = r.z;
    }
    if (p.stun > 0) { ix *= 0.15; iz *= 0.15; }
    const sp = p.speed * (1 + this.frenzy);
    p.x += ix * sp * dt;
    p.z += iz * sp * dt;
    const R = this.sector.R - HOLE.EDGE_PAD;
    const dd = Math.hypot(p.x, p.z);
    if (dd > R) { p.x = (p.x / dd) * R; p.z = (p.z / dd) * R; }

    // combo timer
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }

    // hype decay
    this.idleT += dt;
    if (!this.noHype) {
      let decay = (VIEW.HYPE_DECAY + VIEW.HYPE_DECAY_PROP * this.hype) * this.mods.hypeDecayMul;
      const idleAfter = this.idleAfter || VIEW.IDLE_AFTER;
      if (this.idleT > idleAfter) {
        decay += VIEW.IDLE_DECAY * this.mods.hypeDecayMul;
        if (!this._boredSaid && this.idleT > idleAfter + 2.2) {
          this._boredSaid = true;
          this.emit('chat', { kind: 'bored' });
        }
      } else this._boredSaid = false;
      if (this.hype > this.mods.hypeFloor) this.hype = Math.max(this.mods.hypeFloor, this.hype - decay * dt);
    }

    // frenzy decay
    if (this.taken.frenzy) {
      this.frenzy = Math.max(0, this.frenzy - dt * 0.11);
      if (this.idleT < 0.06) this.frenzy = Math.min(0.45 * this.taken.frenzy, this.frenzy + 0.03 * this.taken.frenzy);
    }

    // periodic boon hooks
    if (this.taken.adbreak) {
      this.adT -= dt;
      if (this.adT <= 0) {
        this.adT = 16 / this.taken.adbreak;
        this.addHype(0.55);
        if (this.ctx.fx) this.ctx.fx.pop('AD BREAK', p.x, domeY(p.x, p.z) + 5, p.z, 'good');
        A.crowd(0.8, 0.7);
      }
    }
    if (this.taken.nova) {
      this.novaT -= dt;
      if (this.novaT <= 0) {
        this.novaT = 12 / this.taken.nova;
        this._chainPulse(p.x, p.z, p.radius * 3);
        if (this.ctx.fx) this.ctx.fx.shake(0.3);
        A.sfxBigSwallow(4);
      }
    }

    this._recalc();
    p.pullMul = this.mods.pullMul * (1 + this.mods.collector * 0.35);

    // physics
    runCapture(p, this.sector, dt, {
      onCapture: (pr, h) => this._onCapture(pr, h),
      onNearMiss: (pr, h) => this._onNearMiss(pr, h),
    });
    for (const r of this.rivals) {
      r.update(dt, p, this.rivals.map((x) => x.hole).filter((h) => h !== r.hole), {
        onCapture: () => {},
        onNearMiss: () => {},
      });
    }
    updateSinking(this.sector, dt, {
      onSwallow: (pr, h) => this._onSwallow(pr, h),
    });
    this.sector.updateMovers(dt, [p].concat(this.rivals.map((r) => r.hole)));
    this.hazards.update(dt, p, {
      onHit: (src, s) => this._onHit(src, s),
      onHazardDown: (h, s) => this._onHazardDown(h, s),
      onFire: () => A.sfxShot(),
    });

    this._rivalContact(dt);

    // visuals
    p.updateVisual(dt);
    this._updateCamera(dt);

    // clock + objective
    if (this.timeLimit > 0) {
      this.timeLeft = Math.max(0, this.timeLimit - this.elapsed);
      if (this.timeLeft <= 0) this._finish(this._objectiveMet() ? RESULT.WIN : RESULT.LOSE);
      else if (!this._warned && this.timeLeft < 10) { this._warned = true; this.emit('chat', { kind: 'clock' }); }
    }
    if (!this.over && this._objectiveMet() && this._canFinishEarly()) this._finish(RESULT.WIN);
    if (!this.over && this._impossible()) this._finish(RESULT.LOSE);
  }

  _rivalContact(dt) {
    const p = this.player;
    for (const r of this.rivals) {
      const h = r.hole;
      if (!h.alive) continue;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d > (h.radius + p.radius) * 0.62) continue;
      if (h.radius > p.radius * RIVAL.EAT_PLAYER_RATIO) {
        if (this._eatenCd > 0) continue;
        this._eatenCd = 3.5;
        if (this.revives > 0) {
          this.revives--;
          this.emit('toast', { text: 'BACKUP FEED ENGAGED', cls: 'good' });
          if (this.ctx.fx) this.ctx.fx.ring(p.x, domeY(p.x, p.z), p.z, 0x6fe8ff, p.radius, p.radius * 4, 0.6);
          continue;
        }
        const lost = this.mass * RIVAL.STEAL_FRACTION;
        this.mass -= lost;
        h.addMass(lost * 0.8);
        r.eatenMass += lost * 0.8;
        this.hype = Math.max(0, this.hype - 0.7);
        this.combo = 0;
        p.stun = 1.2;
        this._recalc();
        A.sfxHit();
        if (this.ctx.fx) {
          this.ctx.fx.shake(0.8);
          this.ctx.fx.pop(r.name + ' TOOK A BITE', p.x, domeY(p.x, p.z) + 5, p.z, 'bad');
        }
        this.emit('chat', { kind: 'eaten', who: r.name });
      } else if (this.mods.parasite && p.radius > h.radius * RIVAL.EAT_PLAYER_RATIO) {
        if (this._biteCd > 0) continue;
        this._biteCd = 2.0;
        const take = h.mass * 0.33;
        h.mass = Math.max(0, h.mass - take);
        h.recalc();
        this.mass += take;
        this.addHype(0.4);
        this._recalc();
        if (this.ctx.fx) this.ctx.fx.pop('DRAINED ' + r.name, p.x, domeY(p.x, p.z) + 5, p.z, 'good');
        this.emit('chat', { kind: 'drain', who: r.name });
      }
    }
    this._eatenCd = Math.max(0, (this._eatenCd || 0) - dt);
    this._biteCd = Math.max(0, (this._biteCd || 0) - dt);
  }

  // ── objectives ────────────────────────────────────────────────────────────

  /** YOUR clearance, not the sector's — a rival eating things does not count. */
  clearPct() {
    return this.sector.totalArea ? (this._myArea() / this.sector.totalArea) * 100 : 0;
  }

  /** How much of the sector is gone in total, whoever took it. */
  sectorPct() { return this.sector.clearPct() * 100; }

  _myArea() {
    return Math.max(0, this.sector.eatenArea - this.rivals.reduce((a, r) => a + r.eatenArea, 0));
  }
  _myEaten() {
    return Math.max(0, this.sector.eatenMass - this.rivals.reduce((a, r) => a + r.eatenMass, 0));
  }

  _objectiveMet() {
    const s = this.spec;
    if (s.kind === 'oneoff' || s.kind === 'event') return false;
    if (this.clearPct() < s.target) return false;
    if (s.type === 'rival') {
      const mine = this._myArea();
      for (const r of this.rivals) if (r.eatenArea >= mine) return false;
      return true;
    }
    if (s.type === 'boss') return this.landmarksTaken > 0;
    return true;
  }

  _canFinishEarly() {
    return this.spec.type !== 'boss' || this.landmarksTaken > 0;
  }

  /** True once the quota can no longer be reached even by eating what is left. */
  _impossible() {
    const s = this.spec;
    if (s.kind !== 'story' || !this.sector.totalArea) return false;
    const leftPct = ((this.sector.totalArea - this.sector.eatenArea) / this.sector.totalArea) * 100;
    if (this.clearPct() + leftPct >= s.target + 0.01) return false;
    if (s.type === 'boss' && this.landmarksTaken === 0 && this.sector.landmarks.some((l) => !l.dead)) return false;
    return true;
  }

  _finish(result) {
    if (this.over) return;
    this.over = true;
    this.timeLeft = Math.max(0, this.timeLeft);
    const pct = this.clearPct();
    const score = Math.round(
      this.peakViewers * ECON.SCORE_VIEWERS +
      (pct / 100) * ECON.SCORE_CLEAR +
      this.bestCombo * ECON.SCORE_COMBO +
      (this.timeLimit ? this.timeLeft * ECON.SCORE_TIME : 0)
    );
    const subsBase = this.peakViewers * ECON.SUBS_PER_VIEWER + (pct / 100) * ECON.CLEAR_BONUS;
    const subs = Math.round(subsBase * this.pm.subsMul * (this.eventSubsMul || 1) * (result === RESULT.WIN ? 1 : 0.45));
    this.result = {
      result, score, subs, pct,
      viewers: this.peakViewers,
      combo: this.bestCombo,
      eaten: this.eatenCount,
      mass: this.mass,
      time: this.elapsed,
      timeLeft: this.timeLeft,
      landmarks: this.landmarksTaken,
      hits: this.hazardHits,
      boons: this.boons.slice(),
      rivals: this.rivals.map((r) => ({ name: r.name, mass: r.eatenArea })),
      mine: this._myArea(),
      totalArea: this.sector.totalArea,
    };
    if (result === RESULT.WIN) A.sfxWin(); else if (result === RESULT.LOSE) A.sfxFail();
    this.emit('end', this.result);
  }

  abandon() { this._finish(RESULT.ABANDON); }

  // ── autopilot (home-screen demo and ?auto=1) ──────────────────────────────

  _pilot(dt) {
    const p = this.player;
    this._pT = (this._pT || 0) - dt;
    if (this._pT <= 0 || !this._pTarget || this._pTarget.dead) {
      this._pT = 0.35;
      let best = null, bestScore = -1;
      const props = this.sector.props;
      const stride = Math.max(1, Math.floor(props.length / 260));
      // With the crowd already warm, chase the biggest prize; with the crowd
      // draining, take whatever is closest and keep the chain alive.
      const greed = this.hype > 1.2 ? 1.0 : 1.9;
      for (let i = this.rng.int(0, stride); i < props.length; i += stride) {
        const pr = props[i];
        if (pr.dead || pr.state >= 2 || pr.shielded) continue;
        if (TIER_R[pr.tier] > p.radius) continue;
        const d = Math.hypot(pr.x - p.x, pr.z - p.z);
        const s = (pr.value + 4) / Math.pow(d + 10, greed);
        if (s > bestScore) { bestScore = s; best = pr; }
      }
      this._pTarget = best;
    }
    // dodge anything bigger
    for (const r of this.rivals) {
      const h = r.hole;
      if (h.radius < p.radius * 1.15) continue;
      const dx = p.x - h.x, dz = p.z - h.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < h.radius * 5) return { x: dx / d, z: dz / d };
    }
    const t = this._pTarget;
    if (!t) {
      const a = this.t * 0.3;
      return { x: Math.cos(a), z: Math.sin(a) };
    }
    const dx = t.x - p.x, dz = t.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d };
  }

  // ── camera ────────────────────────────────────────────────────────────────

  _initCamera() {
    const p = this.player;
    const dist = (CAM.DIST_BASE + p.radius * CAM.DIST_PER_R) * this._aspectPush();
    this._camDist = dist;
    this._place(p.x, p.z, dist, true);
  }

  _place(tx, tz, dist, snap) {
    const cam = this.ctx.camera;
    const y = domeY(tx, tz);
    const h = Math.sin(CAM.PITCH) * dist;
    const back = Math.cos(CAM.PITCH) * dist;
    const cx = tx - Math.sin(CAM.YAW) * back;
    const cz = tz - Math.cos(CAM.YAW) * back;
    this._camPos.set(cx, y + h, cz);
    this._camTarget.set(tx, y, tz);
    if (snap) {
      cam.position.copy(this._camPos);
      cam.lookAt(this._camTarget);
    }
  }

  /** Portrait screens see far less width, so push the camera back to compensate. */
  _aspectPush() {
    const a = this.ctx.camera.aspect || 1;
    return a >= 1 ? 1 : 1 + (1 - a) * CAM.PORTRAIT_PUSH;
  }

  _updateCamera(dt, frozen) {
    const cam = this.ctx.camera;
    const p = this.player;
    const want = clamp((CAM.DIST_BASE + p.radius * CAM.DIST_PER_R) * this._aspectPush(), CAM.DIST_BASE, CAM.DIST_MAX);
    this._camDist = damp(this._camDist, want, 1.6, dt);
    this._place(p.x, p.z, this._camDist, false);
    const k = frozen ? 1.2 : CAM.FOLLOW;
    cam.position.x = damp(cam.position.x, this._camPos.x, k, dt);
    cam.position.y = damp(cam.position.y, this._camPos.y, k, dt);
    cam.position.z = damp(cam.position.z, this._camPos.z, k, dt);
    cam.lookAt(this._camTarget);
    if (this.ctx.fx) this.ctx.fx.applyShake(cam);
  }

  // ── teardown ──────────────────────────────────────────────────────────────

  dispose() {
    for (const r of this.rivals) r.dispose();
    this.rivals.length = 0;
    this.hazards.dispose();
    this.player.dispose();
    this.sector.dispose();
  }
}
