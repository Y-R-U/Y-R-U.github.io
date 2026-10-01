// Glitch Siege: defend the Grower Core through 5 waves of reboots, glitchfuses and archers.
// Between waves you get a few seconds and a stack of bricks to build walls. Monsters smash through bricks in time.
import { pad, fill, put, W, mat } from '../bots/arena.js';
import { disposeObject } from '../../core/dispose.js';

const H = 13, WAVES = 5, CORE_HP = 60;
const GATES = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const WAVE_MIX = [
  { reboot: 3 },
  { reboot: 4, glitchfuse: 1 },
  { reboot: 4, glitchfuse: 2, archer: 1 },
  { reboot: 5, glitchfuse: 2, archer: 2 },
  { reboot: 6, glitchfuse: 3, archer: 3 },
];
const LEVEL_SCALE = { easy: 0.65, normal: 1, hard: 1.35 };

function buildArena(A) {
  pad(A, H, H, { floor: 'mirror_tile', wallH: 4 });
  fill(A, -2, -1, -2, 2, -1, 2, 'neon_cyan');
  for (const [gx, gz] of GATES) {
    // Gate: a 3-wide opening in the wall, into a walled spawn bay outside. a = distance out, p = across.
    const box = (a0, a1, y0, y1, p0, p1, key) => (gx
      ? fill(A, gx * a0, y0, p0, gx * a1, y1, p1, key)
      : fill(A, p0, y0, gz * a0, p1, y1, gz * a1, key));
    box(H + 1, H + 1, 0, 2, -1, 1, 'air');
    box(H + 2, H + 4, -3, -1, -2, 2, 'coreplate');
    box(H + 2, H + 5, -1, 3, -3, -3, 'coreplate');
    box(H + 2, H + 5, -1, 3, 3, 3, 'coreplate');
    box(H + 5, H + 5, -1, 3, -3, 3, 'coreplate');
    box(H + 2, H + 4, 0, 4, -2, 2, 'air');
    box(H + 4, H + 4, 3, 3, 0, 0, 'light_panel');
  }
  fill(A, -1, 0, -1, 0, 1, 0, 'light_panel');           // the core (2x2x2)
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) fill(A, x, 0, z, x, 1, z, 'polymer_brick');
}

const siege = {
  id: 'siege', name: 'Glitch Siege', icon: 'shield', minutes: 6,
  blurb: 'Defend the Grower Core from 5 waves of monsters. Build walls between waves!',
  build(A) { this.A = A; buildArena(A); },

  start(mg) {
    const { ctx } = mg, A = (this.A ||= mg.arena), T = ctx.THREE, g = ctx.game;
    Object.assign(this, { mg, ctx, wave: 0, phase: 'build', t: 30, hp: CORE_HP, over: false, alive: [], kills: 0 });
    ctx.session.mgSurvival = true;
    ctx.session.mgBreak = true;
    ctx.sky?.setTime?.(0.28);
    g.survival.reset();
    const inv = g.inv, id = (k) => g.items.id(k);
    inv.clear();
    inv.setSlot(0, id('ferrite_blade'), 1);
    inv.setSlot(1, id('pulse_bow'), 1);
    inv.setSlot(2, id('polymer_brick'), 24);
    inv.setSlot(3, id('sun_bread'), 4);
    inv.setSlot(9, id('pulse_charge'), 48);
    inv.select(0);
    const o = A.origin;
    this.coreBox = [o.x - 1, o.y, o.z - 1, o.x + 1, o.y + 2, o.z + 1];
    this.coreTarget = { box: this.coreBox, aggro: 6, hurt: (n) => this.hurtCore(n) };
    const sp = W(A, 3, 0, 3);
    ctx.player.teleport(sp.x, sp.y + 0.02, sp.z);
    ctx.player.yaw = Math.PI * 0.25;
    g.setSpawn(sp);
    // Core crystal + HP ring.
    const crystal = new T.Mesh(new T.OctahedronGeometry(0.7), new T.MeshBasicMaterial({ color: 0x5ff7ff, toneMapped: false }));
    const hpRing = new T.Mesh(new T.RingGeometry(1.25, 1.45, 48, 1, 0, Math.PI * 2), new T.MeshBasicMaterial({ color: 0x46f0d4, side: T.DoubleSide, transparent: true, opacity: 0.9, toneMapped: false }));
    hpRing.rotation.x = -Math.PI / 2;
    this.coreFx = new T.Group();
    this.coreFx.add(crystal, hpRing);
    this.coreFx.position.set(o.x, o.y + 3.1, o.z);
    this.crystal = crystal; this.hpRing = hpRing;
    ctx.scene?.add(this.coreFx);
    this.offExplode = ctx.bus?.on?.('mob:explode', (e) => this.empBricks(e.pos));
    this.offDeath = ctx.bus?.on?.('mob:death', () => { this.kills++; });
    mg.hud.objective('Build walls to protect the Core!');
    mg.hud.big('Glitch Siege', 1.6);
    this.drawHud();
  },

  drawHud() {
    const pct = Math.max(0, Math.round((this.hp / CORE_HP) * 100));
    this.mg.hud.score(`Wave ${Math.max(1, this.wave)}/${WAVES} · Core <b style="color:${pct > 50 ? '#46f0d4' : pct > 25 ? '#ffd25e' : '#ff8a96'}">${pct}%</b>`);
  },

  hurtCore(n) {
    if (this.over) return 0;
    this.hp -= n;
    this.ctx.fx?.spark?.({ x: this.A.origin.x, y: this.A.origin.y + 2, z: this.A.origin.z }, 0xff4fd8, 10);
    this.ctx.audio?.sfx?.('coreHit');
    this.hitFlash = 0.3;
    this.drawHud();
    if (this.hp <= 0) this.finish(false);
    return n;
  },

  // EMP blasts knock out player bricks nearby (never the arena).
  empBricks(pos) {
    const w = this.ctx.world, brick = mat('polymer_brick');
    const x0 = Math.floor(pos.x), y0 = Math.floor(pos.y), z0 = Math.floor(pos.z);
    for (let x = x0 - 2; x <= x0 + 2; x++) for (let y = y0 - 1; y <= y0 + 2; y++) for (let z = z0 - 2; z <= z0 + 2; z++) {
      if (w.getCell(x, y, z) === brick && Math.hypot(x - x0, y - y0, z - z0) < 2.6) w.setBox([x * 4, y * 4, z * 4], [x * 4 + 4, y * 4 + 4, z * 4 + 4], 0, 'fill', { flow: false });
    }
  },

  spawnWave() {
    const n = this.wave, mix = WAVE_MIX[n - 1], k = LEVEL_SCALE[this.mg.level] || 1;
    const list = [];
    for (const [kind, c] of Object.entries(mix)) for (let i = 0; i < Math.max(1, Math.round(c * k)); i++) list.push(kind);
    this.queue = list.sort(() => Math.random() - 0.5);
    this.spawnT = 0;
  },

  spawnOne(kind) {
    const A = this.A, gi = Math.floor(Math.random() * 4), [gx, gz] = GATES[gi];
    const p = W(A, gx * (H + 3) + (gz ? (Math.random() - 0.5) * 2 : 0), 0, gz * (H + 3) + (gx ? (Math.random() - 0.5) * 2 : 0));
    const m = this.ctx.game.mobs.spawn(kind, p.x, p.y, p.z);
    if (!m) return;
    m.target = this.coreTarget; m.siege = { gate: p, blockedT: 0, bestD: Infinity, noProgT: 0 };
    m.seen = 99;
    this.alive.push(m);
  },

  update(dt) {
    if (this.over) return;
    const { ctx, mg } = this;
    const g = ctx.game;
    this.t -= dt;
    this.hitFlash = Math.max(0, (this.hitFlash || 0) - dt);
    this.crystal.rotation.y += dt * 1.2;
    this.crystal.material.color.setRGB(this.hitFlash > 0 ? 1 : 0.37, this.hitFlash > 0 ? 0.3 : 0.97, 1);
    this.hpRing.geometry.dispose();
    this.hpRing.geometry = new ctx.THREE.RingGeometry(1.25, 1.45, 48, 1, 0, Math.PI * 2 * Math.max(0, this.hp / CORE_HP));
    this.hpRing.material.color.setHex(this.hp / CORE_HP > 0.5 ? 0x46f0d4 : this.hp / CORE_HP > 0.25 ? 0xffd25e : 0xff5a6e);

    if (this.phase === 'build') {
      mg.hud.timer(this.t);
      if (this.t <= 0) {
        this.wave++; this.phase = 'wave'; this.spawnWave();
        mg.hud.big(`Wave ${this.wave}!`, 1.6); mg.hud.objective('Defend the Core!'); mg.hud.timer(null);
        ctx.audio?.sfx?.('waveStart');
        this.drawHud();
      }
      return;
    }
    // Wave: trickle spawns, watch for stuck monsters, wait for the last one.
    if (this.queue.length && (this.spawnT -= dt) <= 0) { this.spawnT = 1.6; this.spawnOne(this.queue.shift()); }
    this.alive = this.alive.filter((m) => !m.removed && !m.dying);
    for (const m of this.alive) this.unblock(m, dt);
    mg.hud.objective(`Monsters left: ${this.alive.length + this.queue.length}`);
    if (!this.alive.length && !this.queue.length) {
      if (this.wave >= WAVES) return this.finish(true);
      this.phase = 'build'; this.t = 20;
      const id = g.items.id('polymer_brick');
      g.inv.add(id, Math.max(0, 24 - g.inv.count(id)));
      g.survival.heal(20);
      mg.hud.big('Wave cleared!', 1.6);
      mg.hud.objective('Patch your walls! +bricks');
      ctx.audio?.sfx?.('goal');
    }
  },

  // Monsters stuck behind bricks smash them; anything stuck for long hops back to a gate.
  unblock(m, dt) {
    const s = m.siege, c = this.A.origin;
    const d = Math.hypot(m.pos.x - c.x, m.pos.z - c.z);
    if (d < s.bestD - 0.5) { s.bestD = d; s.noProgT = 0; } else s.noProgT += dt;
    if (m.blocked || (s.noProgT > 2 && d > 2.5)) s.blockedT += dt; else s.blockedT = Math.max(0, s.blockedT - dt);
    if (s.blockedT > 1.6) {
      s.blockedT = 0;
      if (m.kind === 'glitchfuse') { m.fusing = true; return; }
      const w = this.ctx.world, brick = mat('polymer_brick');
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
      for (const dy of [0.5, 1.5]) for (const r of [0.8, 1.3]) {
        const x = Math.floor(m.pos.x + fx * r), y = Math.floor(m.pos.y + dy), z = Math.floor(m.pos.z + fz * r);
        if (w.getCell(x, y, z) === brick) {
          w.setBox([x * 4, y * 4, z * 4], [x * 4 + 4, y * 4 + 4, z * 4 + 4], 0, 'fill', { flow: false });
          this.ctx.fx?.spark?.({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }, 0xffb347, 8);
          this.ctx.audio?.sfx?.('smash');
          s.noProgT = 0;
          return;
        }
      }
    }
    if (s.noProgT > 25) { m.pos.set(s.gate.x, s.gate.y, s.gate.z); s.noProgT = 0; s.bestD = Infinity; }
  },

  finish(won) {
    if (this.over) return;
    this.over = true;
    const pct = Math.max(0, this.hp / CORE_HP);
    const stars = won ? (pct >= 0.7 ? 3 : pct >= 0.35 ? 2 : 1) : this.wave >= 3 ? 1 : 0;
    this.mg.finish({ won, stars, score: this.kills, title: won ? 'Core saved!' : 'The Core fell', text: won ? `Core at ${Math.round(pct * 100)}%, ${this.kills} monsters zapped.` : `You held out to wave ${this.wave}.` });
  },

  end() {
    for (const m of this.alive || []) if (!m.removed) this.ctx.game.mobs.remove(m);
    this.ctx.game.mobs.list.filter((m) => m.target === this.coreTarget).forEach((m) => this.ctx.game.mobs.remove(m));
    disposeObject(this.coreFx);
    this.offExplode?.(); this.offDeath?.();
    this.ctx.session.mgSurvival = false;
    this.ctx.session.mgBreak = false;
  },
};

export default siege;
