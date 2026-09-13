import { CHAPTERS, SURVIVORS, WEAPONS, getDraft } from "./content.mjs";

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const COLORS = {
  pistol: "#9cffe0",
  orbit: "#59f3d6",
  lightning: "#b3a2ff",
  flame: "#ff784f",
  shotgun: "#ffd280",
  frost: "#8fe9ff",
  drone: "#76e9ff",
  scythe: "#df9dff",
};

export class GameEngine {
  constructor({
    chapter = 0,
    unlockedChapter = chapter,
    survivor = "mara",
    relics = {},
    endless = false,
    seed = 1,
    onEvent = () => {},
  } = {}) {
    this.rngState = Number(seed) >>> 0 || 1;
    this.random = () => {
      let t = (this.rngState += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.onEvent = onEvent;
    this.config = CHAPTERS[clamp(Math.floor(chapter), 0, CHAPTERS.length - 1)];
    this.survivor = SURVIVORS.find((s) => s.id === survivor) || SURVIVORS[0];
    this.relics = { ...relics };
    this.nextId = 0;
    this.cooldowns = {};
    this.spawnTimer = 1.9;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.bossWave = 0;
    this.nextBossAt = this.config.duration;
    this.pendingLevels = 0;
    const maxHp =
      110 +
      (Number(this.relics.vitality) || 0) * 10 +
      (this.survivor.maxHpBonus || 0);
    const locations = [
      { x: 0, y: -6 },
      { x: 9, y: 3 },
      { x: -9, y: 7 },
      { x: -10, y: -9 },
    ];
    const count = this.config.objective.count;
    this.state = {
      phase: "playing",
      paused: false,
      time: 0,
      chapter: this.config.id,
      arsenalChapter: clamp(
        Math.max(this.config.id, Number(unlockedChapter) || 0),
        0,
        CHAPTERS.length - 1,
      ),
      endless: !!endless,
      player: {
        id: "player",
        x: 0,
        y: 2,
        hp: maxHp,
        maxHp,
        radius: 0.48,
        angle: Math.PI,
        invincible: 1.5,
      },
      enemies: [],
      projectiles: [],
      gems: [],
      effects: [],
      zones: [],
      objectives: Array.from({ length: count }, (_, i) => ({
        id: this.id(),
        ...locations[i % locations.length],
        radius: 2.1,
        progress: 0,
        done: false,
        type: this.config.objective.type,
      })),
      weapons: { [this.survivor.weapon || "pistol"]: 1 },
      passives: {},
      evolved: {},
      level: 1,
      xp: 0,
      xpNext: 5,
      kills: 0,
      embers: 0,
      pulseCharge: 1,
      draft: [],
      objectiveDone: 0,
      objectiveTotal: count,
      boss: null,
      result: null,
    };
  }

  id() {
    return ++this.nextId;
  }
  emit(type, text, extra = {}) {
    this.onEvent({ type, ...(text ? { text } : {}), ...extra });
  }
  setPaused(value) {
    this.state.paused = !!value;
  }
  get damageMultiplier() {
    return (
      (1 +
        (this.state.passives.might || 0) * 0.18 +
        (Number(this.relics.might) || 0) * 0.06) *
      (this.survivor.damageMultiplier || 1)
    );
  }
  get hasteMultiplier() {
    return (
      1 +
      (this.state.passives.haste || 0) * 0.12 +
      (Number(this.relics.haste) || 0) * 0.04
    );
  }
  get reachMultiplier() {
    return 1 + (this.state.passives.reach || 0) * 0.15;
  }

  update(dt, input = { x: 0, y: 0 }) {
    if (
      this.state.phase !== "playing" ||
      this.state.paused ||
      !Number.isFinite(dt) ||
      dt <= 0
    )
      return;
    let remaining = Math.min(dt, 0.25);
    while (
      remaining > 0.00001 &&
      this.state.phase === "playing" &&
      !this.state.paused
    ) {
      const step = Math.min(remaining, 1 / 30);
      this.step(step, input);
      remaining -= step;
    }
  }

  step(dt, input) {
    const s = this.state,
      p = s.player;
    s.time += dt;
    p.invincible = Math.max(0, p.invincible - dt);
    let ix = Number(input.x) || 0,
      iy = Number(input.y) || 0;
    const length = Math.hypot(ix, iy);
    if (length > 1) {
      ix /= length;
      iy /= length;
    }
    const speed = 5.6 * (this.survivor.speedMultiplier || 1);
    p.x = clamp(p.x + ix * speed * dt, -23, 23);
    p.y = clamp(p.y + iy * speed * dt, -23, 23);
    if (length > 0.08) p.angle = Math.atan2(iy, ix);
    s.pulseCharge = Math.min(1, s.pulseCharge + dt / 48);
    this.updateObjectives(dt);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnWave();
      this.spawnTimer = Math.max(
        0.29,
        1.35 -
          Math.min(s.time / this.config.duration, 1.5) * 0.71 -
          s.chapter * 0.075,
      );
    }
    if (s.time >= this.nextBossAt && !s.boss) this.spawnBoss();
    for (const id of Object.keys(s.weapons)) {
      this.cooldowns[id] = (this.cooldowns[id] || 0) - dt;
      if (this.cooldowns[id] <= 0 && s.enemies.length) this.fireWeapon(id);
    }
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateGems(dt);
    for (const effect of s.effects) effect.life -= dt;
    s.effects = s.effects.filter((e) => e.life > 0).slice(-130);
    if (p.hp <= 0) this.finish(false);
    else if (
      !s.endless &&
      this.bossDefeated &&
      s.objectiveDone >= s.objectiveTotal
    )
      this.finish(true);
  }

  spawnWave() {
    const s = this.state;
    if (s.enemies.length >= 160) return;
    const pace = s.time / this.config.duration;
    const number = Math.min(
      5,
      1 +
        Math.floor(s.chapter / 2) +
        (pace > 0.45 ? 1 : 0) +
        (pace > 0.8 ? 1 : 0),
    );
    for (let i = 0; i < number && s.enemies.length < 160; i++) {
      const roll = this.random();
      let type = "walker";
      if (s.time > 24 && roll < 0.17 + s.chapter * 0.015) type = "runner";
      else if (s.time > 43 && roll > 0.84) type = "brute";
      else if (s.time > 65 && roll > 0.69 && roll < 0.81) type = "spitter";
      this.spawnEnemy(type);
    }
  }

  spawnEnemy(type = "walker", at = null) {
    const s = this.state;
    const angle = this.random() * TAU,
      radius = 12 + this.random() * 5;
    const x =
      at?.x ?? clamp(s.player.x + Math.cos(angle) * radius, -23.8, 23.8);
    const y =
      at?.y ?? clamp(s.player.y + Math.sin(angle) * radius, -23.8, 23.8);
    const scale =
      1 +
      s.chapter * 0.2 +
      (s.endless ? Math.max(0, s.time - this.config.duration) / 230 : 0);
    const stats = {
      walker: [23, 1.2, 0.49, 9],
      runner: [19, 2.45, 0.4, 8],
      brute: [105, 0.9, 0.82, 18],
      spitter: [43, 1.07, 0.55, 11],
    }[type] || [23, 1.2, 0.49, 9];
    const enemy = {
      id: this.id(),
      x,
      y,
      type,
      hp: stats[0] * scale,
      maxHp: stats[0] * scale,
      speed: stats[1] * (1 + s.chapter * 0.045),
      radius: stats[2],
      damage: stats[3] + s.chapter * 2,
      angle: 0,
      hit: 0,
      slow: 0,
      attackTimer: 1.5 + this.random() * 2,
    };
    s.enemies.push(enemy);
    return enemy;
  }

  spawnBoss() {
    const s = this.state;
    if (this.bossSpawned && !s.endless) return;
    this.bossSpawned = true;
    this.bossWave++;
    const hp = (620 + s.chapter * 290) * (1 + (this.bossWave - 1) * 0.5);
    const boss = {
      id: this.id(),
      x: clamp(s.player.x + 5, -19, 19),
      y: clamp(s.player.y - 12, -20, 20),
      angle: 0,
      hp,
      maxHp: hp,
      radius: 1.35,
      speed: 1.27 + s.chapter * 0.065,
      damage: 25 + s.chapter * 3,
      type: "boss",
      name: this.config.boss.name,
      bossType: this.config.boss.type,
      attackTimer: 2.7,
      summonTimer: 9,
      slow: 0,
      hit: 0,
    };
    s.boss = boss;
    s.enemies.push(boss);
    this.effect(boss.x, boss.y, "portal", 4, 1.8, "#ff5573");
    this.emit("boss", boss.name);
  }

  nearest(from = this.state.player, range = Infinity, exclude = null) {
    let nearest = null,
      best = range;
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0 || exclude?.has(enemy.id)) continue;
      const d = distance(from, enemy);
      if (d < best) {
        nearest = enemy;
        best = d;
      }
    }
    return nearest;
  }

  fireWeapon(id) {
    const s = this.state,
      p = s.player,
      level = s.weapons[id],
      evolved = !!s.evolved[id];
    const target = this.nearest(p, 20);
    if (!target) {
      this.cooldowns[id] = 0.12;
      return;
    }
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    const damage = this.damageMultiplier,
      reach = this.reachMultiplier;
    const cooldowns = {
      pistol: 0.73,
      orbit: 0.32,
      lightning: 2.4,
      flame: 2.7,
      shotgun: 1.8,
      frost: 3.6,
      drone: 0.82,
      scythe: 1.6,
    };
    this.cooldowns[id] =
      ((cooldowns[id] || 1) / this.hasteMultiplier) * (1 - (level - 1) * 0.055);
    const color = COLORS[id];
    if (id === "pistol" || id === "shotgun") {
      p.angle = angle;
      const count =
        id === "pistol"
          ? 1 + Math.floor(level / 3) + (evolved ? 1 : 0)
          : 4 + level;
      const spread = id === "pistol" ? 0.09 : 0.115;
      for (let i = 0; i < count; i++)
        this.projectile(p.x, p.y, angle + (i - (count - 1) / 2) * spread, {
          type: id,
          speed: id === "pistol" ? 21 : 18,
          damage:
            (id === "pistol" ? 19 + level * 7 : 13 + level * 5) *
            damage *
            (evolved ? 1.55 : 1),
          radius: id === "pistol" ? 0.15 : 0.2,
          life: id === "pistol" ? 0.85 * reach : 0.46 * reach,
          pierce: evolved ? 3 : level >= 4 ? 1 : 0,
          explosive: evolved && id === "pistol",
          color,
        });
      this.effect(
        p.x + Math.cos(angle) * 0.7,
        p.y + Math.sin(angle) * 0.7,
        "muzzle",
        0.4,
        0.1,
        color,
      );
      this.emit("shot");
    } else if (id === "orbit") {
      const count = 2 + Math.floor(level / 2) + (evolved ? 2 : 0),
        radius = (2.0 + level * 0.1) * reach;
      for (let i = 0; i < count; i++) {
        const a = s.time * 2.3 + (i * TAU) / count;
        const at = {
          x: p.x + Math.cos(a) * radius,
          y: p.y + Math.sin(a) * radius,
        };
        this.areaDamage(
          at,
          (evolved ? 1.35 : 0.88) * reach,
          (13 + level * 5) * damage,
          { color, knockback: 0.22 },
        );
      }
    } else if (id === "lightning") {
      let current = p;
      const hit = new Set();
      for (let i = 0; i < 1 + Math.floor(level / 2) + (evolved ? 4 : 0); i++) {
        const next = this.nearest(current, i ? 8 * reach : 18, hit);
        if (!next) break;
        hit.add(next.id);
        this.effect(next.x, next.y, "lightning", 0.9, 0.28, color, {
          fromX: current.x,
          fromY: current.y,
          toX: next.x,
          toY: next.y,
        });
        this.hitEnemy(next, (38 + level * 17) * damage * (evolved ? 1.5 : 1), {
          color,
        });
        current = next;
      }
      this.emit("shot");
    } else if (id === "flame") {
      const count = evolved ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const a = angle + (i - (count - 1) / 2) * 0.65;
        this.zone(
          p.x + Math.cos(a) * 2.2,
          p.y + Math.sin(a) * 2.2,
          "flame",
          (1.8 + level * 0.15) * reach,
          2.8,
          { damage: (14 + level * 7) * damage, tick: 0, interval: 0.4, color },
        );
      }
    } else if (id === "frost") {
      const radius = (3.6 + level * 0.35) * reach;
      this.areaDamage(p, radius, (24 + level * 12) * damage, {
        color,
        slow: evolved ? 3.8 : 2.3,
        knockback: 0.6,
      });
      this.effect(p.x, p.y, "frost", radius, 0.7, color);
      if (evolved)
        this.zone(p.x, p.y, "frost", radius, 3, {
          damage: 22 * damage,
          tick: 0.5,
          interval: 0.65,
          slow: 2,
          color,
        });
      this.emit("shot");
    } else if (id === "drone") {
      for (let i = 0; i < (evolved ? 4 : 2); i++) {
        const a = s.time * 0.8 + (i * Math.PI) / (evolved ? 2 : 1),
          at = { x: p.x + Math.cos(a) * 1.4, y: p.y + Math.sin(a) * 1.4 };
        this.projectile(
          at.x,
          at.y,
          Math.atan2(target.y - at.y, target.x - at.x),
          {
            type: "drone",
            homing: true,
            speed: 16,
            damage: (12 + level * 7) * damage,
            radius: 0.2,
            life: 1.2,
            pierce: evolved ? 2 : 0,
            color,
          },
        );
      }
      this.emit("shot");
    } else if (id === "scythe") {
      const radius = (3.0 + level * 0.28) * reach;
      this.areaDamage(p, radius, (28 + level * 14) * damage, {
        color,
        knockback: 1.4,
        execute: evolved,
      });
      this.effect(p.x, p.y, "slash", radius, 0.35, color);
      if (evolved) p.hp = Math.min(p.maxHp, p.hp + 1.5);
      this.emit("shot");
    }
  }

  projectile(x, y, angle, values = {}) {
    if (this.state.projectiles.length >= 220) return;
    this.state.projectiles.push({
      id: this.id(),
      x,
      y,
      angle,
      radius: 0.18,
      speed: 18,
      damage: 20,
      life: 1,
      pierce: 0,
      hitIds: [],
      type: "pistol",
      ...values,
    });
  }
  effect(x, y, type, radius, life, color, extra = {}) {
    this.state.effects.push({
      id: this.id(),
      x,
      y,
      type,
      radius,
      life,
      maxLife: life,
      color,
      ...extra,
    });
  }
  zone(x, y, type, radius, life, extra = {}) {
    this.state.zones.push({
      id: this.id(),
      x,
      y,
      type,
      radius,
      life,
      maxLife: life,
      ...extra,
    });
  }

  hitEnemy(enemy, damage, options = {}) {
    if (enemy.hp <= 0) return;
    if (
      options.execute &&
      enemy.type !== "boss" &&
      enemy.hp < enemy.maxHp * 0.3
    )
      damage += enemy.hp;
    enemy.hp -= damage;
    enemy.hit = 0.15;
    if (options.slow) enemy.slow = Math.max(enemy.slow || 0, options.slow);
    if (options.knockback && enemy.type !== "boss") {
      const a = Math.atan2(
        enemy.y - this.state.player.y,
        enemy.x - this.state.player.x,
      );
      enemy.x = clamp(enemy.x + Math.cos(a) * options.knockback, -24, 24);
      enemy.y = clamp(enemy.y + Math.sin(a) * options.knockback, -24, 24);
    }
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  areaDamage(at, radius, damage, options = {}) {
    for (const enemy of [...this.state.enemies])
      if (enemy.hp > 0 && distance(at, enemy) < radius + enemy.radius)
        this.hitEnemy(enemy, damage, options);
  }

  killEnemy(enemy) {
    const s = this.state;
    s.kills++;
    s.embers +=
      enemy.type === "boss"
        ? 35 + s.chapter * 7
        : enemy.type === "brute"
          ? 2
          : s.kills % 3 === 0
            ? 1
            : 0;
    s.pulseCharge = Math.min(
      1,
      s.pulseCharge + (enemy.type === "brute" ? 0.025 : 0.009),
    );
    let value =
      enemy.type === "boss"
        ? 24
        : enemy.type === "brute"
          ? 4
          : enemy.type === "spitter"
            ? 2
            : 1;
    const bonus = value * (s.passives.fortune || 0) * 0.12;
    value += Math.floor(bonus) + (this.random() < bonus % 1 ? 1 : 0);
    if (s.gems.length < 150)
      s.gems.push({ id: this.id(), x: enemy.x, y: enemy.y, value, age: 0 });
    else {
      const gem = s.gems.reduce((a, b) =>
        distance(enemy, a) < distance(enemy, b) ? a : b,
      );
      gem.value += value;
    }
    this.effect(
      enemy.x,
      enemy.y,
      "death",
      enemy.radius * 1.8,
      0.38,
      enemy.type === "boss" ? "#ff5872" : "#66eec5",
    );
    s.enemies = s.enemies.filter((e) => e.id !== enemy.id);
    if (enemy.type === "boss") {
      s.boss = null;
      this.bossDefeated = true;
      if (s.endless) {
        this.nextBossAt = s.time + 75;
        this.emit("toast", "Demon banished. The next breach is stronger.");
      } else if (s.objectiveDone < s.objectiveTotal)
        this.emit("toast", "Demon banished. Finish the marked objectives.");
    }
    this.emit("kill");
  }

  updateEnemies(dt) {
    const s = this.state,
      p = s.player;
    for (const enemy of [...s.enemies]) {
      if (enemy.hp <= 0) continue;
      enemy.hit = Math.max(0, enemy.hit - dt);
      enemy.slow = Math.max(0, (enemy.slow || 0) - dt);
      const d = distance(enemy, p),
        angle = Math.atan2(p.y - enemy.y, p.x - enemy.x);
      enemy.angle = angle;
      const speed = enemy.speed * (enemy.slow > 0 ? 0.34 : 1);
      if (d > enemy.radius + 0.3 && !(enemy.type === "spitter" && d < 6)) {
        // A small deterministic strafe stops identical spawn paths from stacking perfectly.
        const offset =
          enemy.type === "boss"
            ? 0
            : Math.sin(enemy.id * 2.7 + s.time * 0.7) * 0.15;
        enemy.x += Math.cos(angle + offset) * speed * dt;
        enemy.y += Math.sin(angle + offset) * speed * dt;
      }
      if (d < enemy.radius + p.radius) this.hurtPlayer(enemy.damage, enemy);
      enemy.attackTimer -= dt;
      if (enemy.type === "spitter" && enemy.attackTimer <= 0 && d < 14) {
        enemy.attackTimer = 3.2;
        this.projectile(enemy.x, enemy.y, angle, {
          type: "acid",
          hostile: true,
          speed: 5.0,
          radius: 0.3,
          damage: enemy.damage,
          life: 3,
          color: "#ff795e",
        });
        this.effect(enemy.x, enemy.y, "muzzle", 0.5, 0.25, "#ff7e66");
      }
      if (enemy.type === "boss") {
        if (enemy.attackTimer <= 0) {
          enemy.attackTimer = enemy.hp < enemy.maxHp * 0.4 ? 2.4 : 3.5;
          this.zone(p.x, p.y, "warning", 2.1 + s.chapter * 0.12, 1.05, {
            hostile: true,
            damage: enemy.damage,
            color: "#ff4a66",
          });
          if (s.chapter >= 2 || enemy.hp < enemy.maxHp * 0.5)
            for (let i = 0; i < 5; i++)
              this.projectile(enemy.x, enemy.y, angle + (i - 2) * 0.28, {
                type: "hellfire",
                hostile: true,
                speed: 4.7,
                radius: 0.27,
                damage: 15 + s.chapter * 2,
                life: 3.3,
                color: "#ff5576",
              });
        }
        enemy.summonTimer -= dt;
        if (enemy.summonTimer <= 0) {
          enemy.summonTimer = 11;
          for (let i = 0; i < 3 + s.chapter && s.enemies.length < 160; i++)
            this.spawnEnemy("walker", {
              x: enemy.x + Math.cos(i * 2.2) * 2,
              y: enemy.y + Math.sin(i * 2.2) * 2,
            });
          this.effect(enemy.x, enemy.y, "portal", 3, 0.9, "#ff6174");
        }
      }
    }
  }

  hurtPlayer(amount, source) {
    const p = this.state.player;
    if (p.invincible > 0 || p.hp <= 0) return;
    p.hp = Math.max(0, p.hp - amount);
    p.invincible = 0.8;
    this.effect(p.x, p.y, "hurt", 1.15, 0.3, "#ff536b");
    if (source) {
      const a = Math.atan2(p.y - source.y, p.x - source.x);
      p.x = clamp(p.x + Math.cos(a) * 0.38, -23, 23);
      p.y = clamp(p.y + Math.sin(a) * 0.38, -23, 23);
    }
    this.emit("hit");
  }

  updateProjectiles(dt) {
    const s = this.state;
    for (const b of s.projectiles) {
      b.life -= dt;
      if (b.homing) {
        const target = this.nearest(b, 12, new Set(b.hitIds));
        if (target) b.angle = Math.atan2(target.y - b.y, target.x - b.x);
      }
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      if (b.hostile) {
        if (distance(b, s.player) < b.radius + s.player.radius) {
          this.hurtPlayer(b.damage, b);
          b.life = 0;
        }
        continue;
      }
      for (const e of [...s.enemies]) {
        if (
          e.hp <= 0 ||
          b.hitIds.includes(e.id) ||
          distance(b, e) > b.radius + e.radius
        )
          continue;
        b.hitIds.push(e.id);
        this.hitEnemy(e, b.damage, { color: b.color });
        if (b.explosive) {
          this.areaDamage(b, 1.6, b.damage * 0.35);
          this.effect(b.x, b.y, "explosion", 1.6, 0.22, b.color);
        }
        if (b.pierce-- <= 0) {
          b.life = 0;
          break;
        }
      }
    }
    s.projectiles = s.projectiles.filter(
      (b) => b.life > 0 && Math.abs(b.x) < 29 && Math.abs(b.y) < 29,
    );
  }

  updateZones(dt) {
    const s = this.state;
    for (const z of s.zones) {
      z.life -= dt;
      if (z.hostile) {
        if (z.life <= 0) {
          if (distance(z, s.player) < z.radius + s.player.radius)
            this.hurtPlayer(z.damage, z);
          this.effect(z.x, z.y, "explosion", z.radius, 0.5, z.color);
        }
      } else {
        z.tick -= dt;
        if (z.tick <= 0) {
          z.tick = z.interval || 0.5;
          this.areaDamage(z, z.radius, z.damage, {
            slow: z.slow,
            color: z.color,
          });
        }
      }
    }
    s.zones = s.zones.filter((z) => z.life > 0);
  }

  updateGems(dt) {
    const s = this.state,
      p = s.player;
    const pickup =
      2.1 *
        (1 +
          (s.passives.magnet || 0) * 0.4 +
          (Number(this.relics.magnet) || 0) * 0.15) +
      (this.survivor.pickupBonus || 0);
    for (const g of s.gems) {
      g.age += dt;
      const d = distance(g, p);
      if (d < pickup || g.attracted) {
        g.attracted = true;
        if (d < 0.6) {
          s.xp += g.value;
          g.collected = true;
        } else {
          const step = Math.min(
            d,
            dt * (10 + (pickup - Math.min(d, pickup)) * 3),
          );
          g.x += ((p.x - g.x) / d) * step;
          g.y += ((p.y - g.y) / d) * step;
        }
      }
    }
    s.gems = s.gems.filter((g) => !g.collected);
    if (s.xp >= s.xpNext && s.phase === "playing") this.levelUp();
  }

  levelUp() {
    const s = this.state;
    s.xp -= s.xpNext;
    s.level++;
    s.xpNext = Math.floor(5 + Math.pow(s.level, 1.18) * 2.1);
    pHeal(s.player, 5);
    s.draft = getDraft(s, this.random);
    if (s.draft.length) s.phase = "upgrade";
    this.emit("level");
  }

  chooseUpgrade(index) {
    const s = this.state;
    if (s.phase !== "upgrade" || !Number.isInteger(index) || !s.draft[index])
      return false;
    const choice = s.draft[index];
    if (choice.kind === "weapon")
      s.weapons[choice.id] = Math.min(5, (s.weapons[choice.id] || 0) + 1);
    else if (choice.kind === "passive") {
      const before = s.passives[choice.id] || 0;
      s.passives[choice.id] = Math.min(3, before + 1);
      if (choice.id === "vitality" && before < 3) {
        s.player.maxHp += 25;
        pHeal(s.player, 25);
      }
    } else if (choice.kind === "evolution") {
      // Content uses weapon IDs for evolution options; tolerate an explicit weapon field.
      const weaponId = choice.weaponId || choice.weapon || choice.id;
      const weapon = WEAPONS.find((w) => w.id === weaponId);
      if (
        !weapon ||
        s.weapons[weaponId] !== 5 ||
        (s.passives[weapon.evolution.requires] || 0) < 3
      )
        return false;
      s.evolved[weaponId] = true;
      this.effect(s.player.x, s.player.y, "pulse", 6, 1, COLORS[weaponId]);
      this.emit("evolve", choice.name);
    } else if (choice.kind === "heal") pHeal(s.player, s.player.maxHp * 0.35);
    else return false;
    s.draft = [];
    s.phase = "playing";
    s.player.invincible = Math.max(s.player.invincible, 0.8);
    if (s.xp >= s.xpNext) this.levelUp();
    return true;
  }

  updateObjectives(dt) {
    const s = this.state;
    for (const objective of s.objectives) {
      if (objective.done) continue;
      const near = distance(objective, s.player) < objective.radius;
      if (near)
        objective.progress = Math.min(
          1,
          objective.progress + dt / (s.chapter === 0 ? 3.5 : 4.5),
        );
      if (objective.progress >= 1) {
        objective.done = true;
        s.objectiveDone++;
        s.embers += 10 + s.chapter * 3;
        pHeal(s.player, 20);
        s.pulseCharge = Math.min(1, s.pulseCharge + 0.25);
        s.gems.push({
          id: this.id(),
          x: objective.x,
          y: objective.y,
          value: 5 + s.chapter * 2,
          age: 0,
          attracted: true,
        });
        this.effect(objective.x, objective.y, "objective", 4, 1.2, "#88ffda");
        this.areaDamage(objective, 5, 70 * this.damageMultiplier, {
          knockback: 2,
          slow: 2,
        });
        this.emit(
          "objective",
          `${this.config.objective.label} · ${s.objectiveDone}/${s.objectiveTotal}`,
        );
      }
    }
  }

  pulse() {
    const s = this.state;
    if (s.phase !== "playing" || s.paused || s.pulseCharge < 0.999)
      return false;
    s.pulseCharge = 0;
    s.player.invincible = Math.max(s.player.invincible, 1.25);
    const radius = 7.8 * this.reachMultiplier;
    this.areaDamage(
      s.player,
      radius,
      (110 + s.level * 9) * this.damageMultiplier,
      { knockback: 3, slow: 3 },
    );
    s.projectiles = s.projectiles.filter(
      (b) => !b.hostile || distance(b, s.player) > radius,
    );
    for (const gem of s.gems)
      if (distance(gem, s.player) < radius * 1.6) gem.attracted = true;
    this.effect(s.player.x, s.player.y, "pulse", radius, 0.8, "#a8ffe8");
    this.emit("pulse");
    return true;
  }

  finish(victory) {
    const s = this.state;
    if (s.phase === "won" || s.phase === "lost") return;
    s.phase = victory ? "won" : "lost";
    s.draft = [];
    const award = victory ? 55 + s.chapter * 20 : Math.floor(s.time / 12);
    s.embers += award;
    s.result = {
      victory,
      chapter: s.chapter,
      kills: s.kills,
      seconds: Math.floor(s.time),
      embers: s.embers,
      endless: s.endless,
    };
    this.emit(victory ? "win" : "lose");
  }
}

function pHeal(player, amount) {
  player.hp = Math.min(player.maxHp, player.hp + amount);
}
