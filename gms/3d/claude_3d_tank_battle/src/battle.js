// Match orchestration: spawn tanks, run AI, update leaderboard, win conditions.

import { CFG } from './config.js';
import { Tank } from './tank.js';
import { aiBrain } from './ai.js';
import { pickRandomNames, pickRandomColors, pickPersonalities, TANK_COLORS } from './names.js';
import { arenaState } from './world.js';

export class Battle {
  constructor({ scene, bulletSystem, particles, nameTags, camera, ui, audio, totalTanks }) {
    this.scene = scene;
    this.bulletSystem = bulletSystem;
    this.particles = particles;
    this.nameTags = nameTags;
    this.camera = camera;
    this.ui = ui;
    this.audio = audio;
    this.totalTanks = totalTanks ?? CFG.match.totalTanks;
    this.tanks = [];
    this.player = null;
    this.matchActive = false;
    this.deathOrder = [];   // tanks in order of death (first death = last place)
    this.playerSettled = false;
    this.matchTime = 0;
    this.spectatorTarget = null;  // tank the camera/UI follows after player death
  }

  start(playerName) {
    this.cleanup();

    const aiCount = this.totalTanks - 1;
    const aiNames = pickRandomNames(aiCount);
    // Player gets a brighter color reserved
    const playerColor = TANK_COLORS[6]; // mustard
    const aiColors = pickRandomColors(aiCount).map((c, i) =>
      // make sure no AI shares the player color
      c.hull === playerColor.hull ? TANK_COLORS[(i + 1) % TANK_COLORS.length] : c
    );
    const personalities = pickPersonalities(aiCount);

    // Spawn all tanks around a ring; player gets one of the slots, randomised.
    const totalSlots = this.totalTanks;
    const playerSlot = Math.floor(Math.random() * totalSlots);
    const r = CFG.match.spawnRing;
    let aiIdx = 0;
    for (let i = 0; i < totalSlots; i++) {
      const angle = (i / totalSlots) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const rr = r + (Math.random() - 0.5) * CFG.match.spawnJitter;
      const x = Math.cos(angle) * rr;
      const z = Math.sin(angle) * rr;
      let t;
      if (i === playerSlot) {
        t = new Tank({ name: playerName, color: playerColor, isPlayer: true });
        this.player = t;
      } else {
        t = new Tank({
          name: aiNames[aiIdx] || `Bot${aiIdx}`,
          color: aiColors[aiIdx],
          isPlayer: false,
          brain: aiBrain,
          personality: personalities[aiIdx],
        });
        aiIdx++;
      }
      t.setPosition(x, z);
      t.root.rotation.y = Math.atan2(-x, -z); // face centre
      t.targetBodyYaw = t.root.rotation.y;
      this.scene.add(t.root);
      this.nameTags.attach(t);
      this.tanks.push(t);
    }

    this.deathOrder = [];
    this.playerSettled = false;
    this.matchTime = 0;
    this.prepLastDigit = null;
    this.spectatorTarget = null;
    arenaState.radius = CFG.world.arenaRadius;
    this.matchActive = true;
    this.ui.onMatchStart(this);
  }

  cleanup() {
    for (const t of this.tanks) {
      this.scene.remove(t.root);
    }
    this.tanks.length = 0;
    this.nameTags.detachAll();
    this.bulletSystem.clear();
    this.particles.clear();
    this.player = null;
    this.matchActive = false;
  }

  update(dt) {
    if (!this.matchActive) return;
    this.matchTime += dt;
    this._updateSafeZone(dt);
    this._updatePrepCountdown();

    const inPrep = this.matchTime < CFG.match.prepTime;

    const ctx = {
      tanks: this.tanks,
      bulletSystem: this.bulletSystem,
      camera: this.camera,
      particles: this.particles,
      onFire: (firer) => this.audio?.sfxShoot(firer.isPlayer ? 1 : 0.4),
    };

    // Run AI brains for non-player alive tanks.
    for (const t of this.tanks) {
      if (!t.alive || t.isPlayer || !t.brain) continue;
      t.brain(t, ctx, dt);
    }
    // During the prep window, no tank may fire — but they can still drive/aim.
    if (inPrep) {
      for (const t of this.tanks) t.wantsFire = false;
    }
    // Tanks update (player has had its inputs filled in by the player controller already).
    for (const t of this.tanks) {
      const wasAlive = t.alive;
      t.update(dt, ctx);
      if (wasAlive && !t.alive) this._onDeath(t);
    }

    this._enforceTankSeparation(dt);
    this._wreckSmoke(dt);
    this._applyOutOfBoundsDamage(dt);

    // If our spectator target died, pick another so the camera doesn't stall.
    if (this.spectatorTarget && !this.spectatorTarget.alive) {
      this.spectatorTarget = this._pickSpectatorTarget();
    }
  }

  _updateSafeZone(dt) {
    const m = CFG.match;
    // Shrink timer doesn't start until after the prep countdown.
    const fightTime = Math.max(0, this.matchTime - m.prepTime);
    const t = Math.max(0, fightTime - m.shrinkStartSec);
    const k = Math.min(1, t / m.shrinkDurationSec);
    // Smoothstep for a gentler feel at the start/end.
    const eased = k * k * (3 - 2 * k);
    arenaState.radius = CFG.world.arenaRadius +
      (m.endRadius - CFG.world.arenaRadius) * eased;
  }

  _updatePrepCountdown() {
    const prep = CFG.match.prepTime;
    if (this.matchTime >= prep) {
      if (this.prepLastDigit !== 'go') {
        this.prepLastDigit = 'go';
        this.ui.showBanner?.('FIGHT');
      }
      return;
    }
    const remaining = Math.ceil(prep - this.matchTime);
    if (remaining !== this.prepLastDigit) {
      this.prepLastDigit = remaining;
      this.ui.showBanner?.(String(remaining));
    }
  }

  _applyOutOfBoundsDamage(dt) {
    const r = arenaState.radius;
    const dps = CFG.match.outOfBoundsDPS;
    if (dps <= 0) return;
    for (const t of this.tanks) {
      if (!t.alive) continue;
      const x = t.root.position.x, z = t.root.position.z;
      const d = Math.sqrt(x * x + z * z);
      if (d > r) {
        const wasAlive = t.alive;
        t.takeDamage(dps * dt, null, null);
        if (wasAlive && !t.alive) this._onDeath(t);
      }
    }
  }

  cycleSpectator(dir = 1) {
    const alive = this.aliveTanks();
    if (!alive.length) { this.spectatorTarget = null; return; }
    const cur = this.spectatorTarget;
    const idx = cur ? alive.indexOf(cur) : -1;
    const next = (idx + dir + alive.length) % alive.length;
    this.spectatorTarget = alive[next] || alive[0];
  }

  _pickSpectatorTarget() {
    const alive = this.aliveTanks();
    if (!alive.length) return null;
    // Prefer the tank with the most kills so it's an interesting watch.
    return alive.slice().sort((a, b) => b.kills - a.kills)[0];
  }

  // Periodic smoke from wrecks for atmosphere.
  _wreckSmoke(dt) {
    for (const t of this.tanks) {
      if (t.alive) continue;
      t._smokeTimer = (t._smokeTimer ?? 0) - dt;
      if (t._smokeTimer <= 0) {
        t._smokeTimer = 0.3 + Math.random() * 0.4;
        const p = t.root.position;
        this.particles.spawnSmoke(
          { x: p.x + (Math.random() - 0.5) * 0.6, y: p.y + 1.4, z: p.z + (Math.random() - 0.5) * 0.6 },
          1
        );
      }
    }
  }

  // Soft tank-vs-tank collision — push apart so they don't overlap.
  _enforceTankSeparation(dt) {
    const R = CFG.tank.bodyRadius;
    for (let i = 0; i < this.tanks.length; i++) {
      const a = this.tanks[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.tanks.length; j++) {
        const b = this.tanks[j];
        if (!b.alive) continue;
        const dx = b.root.position.x - a.root.position.x;
        const dz = b.root.position.z - a.root.position.z;
        const d2 = dx * dx + dz * dz;
        const minD = R * 2;
        if (d2 < minD * minD && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const overlap = (minD - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          a.root.position.x -= nx * overlap;
          a.root.position.z -= nz * overlap;
          b.root.position.x += nx * overlap;
          b.root.position.z += nz * overlap;
        }
      }
    }
  }

  _onDeath(tank) {
    this.deathOrder.push(tank);
    // Place = total - kills-after-this. Easier: assign placement when match ends.
    this.audio?.sfxExplode(tank.isPlayer ? 1 : 0.6);
    this.ui.onTankDeath(tank, tank.lastKilledBy, this);
    // Two tanks may die on the same frame (e.g. simultaneous out-of-bounds);
    // skip placement/onMatchEnd updates once the match has already ended.
    if (!this.matchActive) {
      return;
    }

    // Player just died?
    if (tank.isPlayer && !this.playerSettled) {
      this.playerSettled = true;
      this.player.placement = this._currentPlacement(tank);
      this.spectatorTarget = this._pickSpectatorTarget();
      this.ui.onPlayerDeath?.(this);
    }

    // Last tank standing?
    const alive = this.tanks.filter(t => t.alive);
    if (alive.length === 1) {
      const winner = alive[0];
      winner.placement = 1;
      this._assignPlacements(winner);
      this.matchActive = false;
      const playerWon = winner === this.player;
      if (playerWon) this.audio?.sfxVictory();
      else this.audio?.sfxDefeat();
      this.ui.onMatchEnd(playerWon, this);
    } else if (alive.length === 0) {
      this.matchActive = false;
      this._assignPlacements(null);
      this.audio?.sfxDefeat();
      this.ui.onMatchEnd(false, this);
    }
  }

  _currentPlacement(tank) {
    // place = (number of tanks still alive at moment of death) + 1
    // since we already added tank to deathOrder before this fn? no, we add then call.
    // Just count alive after this death + 1.
    const alive = this.tanks.filter(t => t.alive).length;
    return alive + 1;
  }

  _assignPlacements(winner) {
    // Death order: deathOrder[0] died first → worst placement (=N).
    // The winner is placement 1.
    const N = this.tanks.length;
    for (let i = 0; i < this.deathOrder.length; i++) {
      const t = this.deathOrder[i];
      t.placement = N - i;
    }
    if (winner) winner.placement = 1;
  }

  // Helpers used by UI:
  aliveTanks() { return this.tanks.filter(t => t.alive); }
  rankedTanks() {
    // Alive sorted by kills desc, then dead in death-order reverse (most recent first)
    const alive = this.aliveTanks().slice().sort((a, b) => b.kills - a.kills);
    const dead = this.deathOrder.slice().reverse();
    return [...alive, ...dead];
  }
}
