// Floor Fall (spleef): three stacked glass floors. Every tile someone stands on cracks and vanishes 0.6 s later.
// Keep moving, drop through holes to the next floor, and be the last one standing.
import { fill, put, top, mat } from '../arena.js';
import { countdown } from '../index.js';

const HALF = 8, GAP = 7, FLOORS = 3, CRACK = 0.6, MAX_TIME = 180;
const FLOOR_KEY = ['clearglass', 'clearglass', 'clearglass'];
const RIM = ['neon_cyan', 'neon_magenta', 'neon_amber'];
const BOT_TEAMS = ['red', 'gold', 'green', 'red'];
const BOT_NAMES = ['Zip', 'Nova', 'Bolt', 'Pixel'];

// Bot stand-in until js/minigames/bots/ is present: wanders on the floor grid with simple gravity.
class StubBot {
  constructor(name, x, y, z, solid) { Object.assign(this, { name, x, y, z, solid }); this.vy = 0; this.goal = null; this.hidden = false; this.p = { speed: 3.4 }; }
  goTo(x, y, z) { this.goal = [x, y, z]; }
  arrived(n = 0.6) { return !this.goal || Math.hypot(this.goal[0] + 0.5 - this.x, this.goal[2] + 0.5 - this.z) < n; }
  update(dt) {
    const fx = Math.floor(this.x), fz = Math.floor(this.z);
    if (!this.solid(fx, Math.floor(this.y - 0.05), fz)) {
      this.vy -= 22 * dt; const ny = this.y + this.vy * dt;
      if (this.solid(fx, Math.floor(ny), fz)) { this.y = Math.floor(ny) + 1; this.vy = 0; } else this.y = ny;
      return;
    }
    if (!this.goal || this.arrived()) return;
    const dx = this.goal[0] + 0.5 - this.x, dz = this.goal[2] + 0.5 - this.z, d = Math.hypot(dx, dz);
    this.x += (dx / d) * this.p.speed * dt; this.z += (dz / d) * this.p.speed * dt;
  }
  stop() { this.goal = null; }
  teleport(x, y, z) { this.x = x; this.y = y; this.z = z; this.vy = 0; }
}

const floorfall = {
  id: 'floorfall', name: 'Floor Fall', icon: 'layers', minutes: 2,
  blurb: 'Every tile you step on cracks and drops away. Keep moving and be the last one standing!',
  arenaY: 84, arenaRadius: 2,

  build(A) {
    this.A = A;
    fill(A, -HALF - 3, -GAP * FLOORS - 6, -HALF - 3, HALF + 7, 8, HALF + 3, 'air');
    // spectator ledge for when you're out
    fill(A, HALF + 3, 1, -2, HALF + 6, 1, 2, 'mirror_tile');
    fill(A, HALF + 3, 2, -2, HALF + 3, 2, 2, 'clearglass');
    put(A, HALF + 6, 2, 0, 'glowbulb');
    for (let f = 0; f < FLOORS; f++) {
      const y = -1 - f * GAP;
      fill(A, -HALF, y, -HALF, HALF, y, HALF, FLOOR_KEY[f]);
      // glowing rim posts at the corners so each floor reads at a glance
      for (const [x, z] of [[-HALF - 1, -HALF - 1], [HALF + 1, -HALF - 1], [-HALF - 1, HALF + 1], [HALF + 1, HALF + 1]]) put(A, x, y, z, RIM[f]);
    }
    // a light under each floor so the lower ones aren't dark
    for (let f = 0; f < FLOORS; f++) put(A, 0, -1 - f * GAP - 4, 0, 'light_panel');
  },

  async start(mg) {
    const { ctx, A } = { ctx: mg.ctx, A: this.A };
    this.mg = mg; this.ctx = ctx;
    this.cracks = new Map();   // "x,y,z" -> seconds left
    this.out = []; this.t = 0; this.over = false;
    this.count = countdown(mg, 3.5);
    ctx.sky?.setTime?.(0.3);
    const ps = top(A, 0, -1, 0);
    ctx.player.teleport(ps.x, ps.y + 0.02, ps.z);
    ctx.player.yaw = 0; ctx.player.pitch = -0.35;
    if (ctx.input) ctx.input.enabled = false;
    mg.hud.objective('Last one standing wins');
    mg.hud.hint('Don’t stand still: the glass cracks under your feet!');

    const solid = (x, y, z) => !!ctx.world?.isSolidSub(x * 4 + 2, y * 4 + 2, z * 4 + 2);
    const spots = [[-5, -5], [5, -5], [-5, 5], [5, 5]];
    this.bots = [];
    let squad = null;
    try {
      const m = await import('../bots/index.js');
      squad = new m.BotSquad(ctx, { level: mg.level });
    } catch { squad = null; }
    this.squad = squad;
    if (squad) squad.grid.avoid = (x, y, z) => this.cracks.has(x + ',' + y + ',' + z);
    spots.forEach(([x, z], i) => {
      const p = top(A, x, -1, z);
      const b = squad
        ? squad.add({ name: BOT_NAMES[i], team: BOT_TEAMS[i], x: p.x, y: p.y, z: p.z, taggable: false })
        : new StubBot(BOT_NAMES[i], p.x, p.y, p.z, solid);
      b.mem = b.mem || {};
      b.mem.think = Math.random();
      this.bots.push(b);
    });
    this.drawScore();
  },

  alive() { return this.bots.filter((b) => !b.out); },
  drawScore() { this.mg.hud.score(`${this.alive().length + (this.playerOut ? 0 : 1)} left`); },

  crackAt(x, y, z) {
    const k = x + ',' + y + ',' + z;
    if (this.cracks.has(k)) return;
    const w = this.ctx.world;
    const m = w.getCell?.(x, y, z);
    if (!m || m < 0 || !w.isSolidSub(x * 4 + 2, y * 4 + 2, z * 4 + 2)) return;
    this.cracks.set(k, CRACK);
    w.setBox([x * 4, y * 4, z * 4], [x * 4 + 4, y * 4 + 4, z * 4 + 4], mat('glass_crack'), 'fill', { flow: false, support: false });
  },

  stepOn(e) {
    const fx = Math.floor(e.x), fz = Math.floor(e.z), fy = Math.floor(e.y - 0.05);
    for (const [dx, dz] of [[0, 0], [0.28, 0], [-0.28, 0], [0, 0.28], [0, -0.28]]) this.crackAt(Math.floor(e.x + dx), fy, Math.floor(e.z + dz));
    return [fx, fy, fz];
  },

  update(dt) {
    if (this.over || !this.bots) return;
    const { ctx, mg, A } = this;
    const counting = this.count(dt);
    if (!counting && ctx.input && !ctx.input.enabled && !this.playerOut && !ctx.ui?.blocking) { ctx.input.enabled = true; ctx.input.requestPointer?.(); mg.hud.hint(''); }
    if (counting) { this.squad?.update?.(0); return; }
    this.t += dt;
    mg.hud.timer(Math.max(0, MAX_TIME - this.t));

    // cracked tiles fall
    for (const [k, left] of this.cracks) {
      const l = left - dt;
      if (l > 0) { this.cracks.set(k, l); continue; }
      this.cracks.set(k, -999);
      const [x, y, z] = k.split(',').map(Number);
      ctx.world.setBox([x * 4, y * 4, z * 4], [x * 4 + 4, y * 4 + 4, z * 4 + 4], 0, 'fill', { flow: false, support: false });
      if (Math.random() < 0.35) ctx.fx?.spark?.([x + 0.5, y + 0.5, z + 0.5], 0xbff6ff, 4);
    }

    const P = ctx.player.pos;
    const bottom = A.origin.y - 1 - (FLOORS - 1) * GAP - 4;
    if (!this.playerOut) {
      if (ctx.player.onGround) this.stepOn(P);
      if (P.y < bottom) this.eliminate('player');
    }

    for (const b of this.alive()) {
      if (b.hidden) continue;
      if (b.y < bottom) { this.eliminate(b); continue; }
      if (!b.falling && b.vy === 0) this.stepOn(b);
      if ((b.mem.think -= dt) <= 0) { b.mem.think = 0.35 + Math.random() * 0.5; this.think(b); }
    }
    if (this.squad) this.squad.update(dt); else for (const b of this.bots) if (!b.out) b.update(dt);

    if (!this.playerOut && this.alive().length === 0) return this.end2(true);
    if (this.playerOut && this.alive().length <= 1) return this.end2(false);
    if (this.t >= MAX_TIME) return this.end2(!this.playerOut);
  },

  // Bots hop to a nearby tile that's still solid on their floor, preferring ones away from cracks and the edge.
  think(b) {
    const fy = Math.floor(b.y - 0.05);
    const ox = this.A.origin.x, oz = this.A.origin.z;
    let best = null, bestS = -1e9;
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(b.x + (Math.random() - 0.5) * 7), z = Math.floor(b.z + (Math.random() - 0.5) * 7);
      if (Math.abs(x - ox) > HALF || Math.abs(z - oz) > HALF) continue;
      if (!this.ctx.world.isSolidSub(x * 4 + 2, fy * 4 + 2, z * 4 + 2) || this.cracks.has(x + ',' + fy + ',' + z)) continue;
      let s = -Math.hypot(x - ox, z - oz) * 0.3 + Math.random() * 2;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!this.ctx.world.isSolidSub((x + dx) * 4 + 2, fy * 4 + 2, (z + dz) * 4 + 2)) s -= 1.5;
      if (s > bestS) { bestS = s; best = [x, fy + 1, z]; }
    }
    if (best) b.goTo(best[0], best[1], best[2], 0.3);
  },

  eliminate(who) {
    const { mg, ctx } = this;
    if (who === 'player') {
      this.playerOut = true;
      this.place = this.alive().length + 1;
      mg.hud.big('OUT!', 1.4);
      mg.hud.toast(`You were out in place ${this.place}. Watch the bots finish…`);
      if (ctx.input) { ctx.input.enabled = false; ctx.input.releaseAll?.(); }
      const p = top(this.A, HALF + 5, 1, 0);
      ctx.player.teleport(p.x, p.y + 0.02, p.z);
      ctx.player.yaw = Math.PI / 2; ctx.player.pitch = -0.45;
    } else {
      who.out = true; who.stop?.();
      if (this.squad) this.squad.remove(who); else who.hidden = true;
      mg.hud.toast(`${who.name} fell out!`);
      ctx.audio?.sfx('whiff');
    }
    this.drawScore();
  },

  end2(won) {
    if (this.over) return;
    this.over = true;
    const place = won ? 1 : this.place || this.alive().length + 1;
    const stars = place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0;
    for (const b of this.bots) b.stop?.();
    this.mg.finish({
      won, stars,
      title: won ? 'Last one standing!' : `You came ${['1st', '2nd', '3rd', '4th', '5th'][place - 1]}`,
      text: won ? `You outlasted all four bots in ${Math.round(this.t)} s.` : 'Keep moving, and drop down before your tile cracks.',
      best: { value: 6 - place, label: ['', '5th', '4th', '3rd', '2nd', '1st'][6 - place] },
    });
  },

  end() {
    this.squad?.clear?.();
    this.bots = null;
    if (this.ctx?.input) this.ctx.input.enabled = true;
  },
};

export default floorfall;
