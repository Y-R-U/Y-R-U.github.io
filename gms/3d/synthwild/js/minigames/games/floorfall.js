// Floor Fall (spleef): three stacked glass floors. Every tile someone stands on cracks and vanishes a moment later.
// Keep moving, drop through holes to the next floor, and be the last one standing.
import { fill, put, top, mat } from '../arena.js';
import { countdown } from '../index.js';
import { BotSquad } from '../bots/index.js';

const HALF = 12, GAP = 7, FLOORS = 3, MAX_TIME = 180;
const CRACK = { easy: 0.9, normal: 0.7, hard: 0.55 };
const CALM = 40;   // bots play it safe for the first CALM seconds, then get bolder
const CRUMBLE = 100; // after this the floors crumble on their own, so a round never stalls
const FLOOR_KEY = ['clearglass', 'clearglass', 'clearglass'];
const RIM = ['neon_cyan', 'neon_magenta', 'neon_amber'];
const BOT_TEAMS = ['red', 'gold', 'green', 'red'];
const BOT_NAMES = ['Zip', 'Nova', 'Bolt', 'Pixel'];

const floorfall = {
  id: 'floorfall', name: 'Floor Fall', icon: 'layers', minutes: 1.5,
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

  start(mg) {
    const { ctx, A } = { ctx: mg.ctx, A: this.A };
    this.mg = mg; this.ctx = ctx;
    this.cracks = new Map();   // "x,y,z" -> seconds left
    this.crackTime = CRACK[mg.level] || CRACK.normal;
    this.out = []; this.t = 0; this.over = false; this.playerOut = false; this.place = 0; this.crumbling = false; this.crumbleT = 0;
    this.count = countdown(mg, 3.5);
    ctx.sky?.setTime?.(0.3);
    const ps = top(A, 0, -1, 0);
    ctx.player.teleport(ps.x, ps.y + 0.02, ps.z);
    ctx.player.yaw = 0; ctx.player.pitch = -0.35;
    if (ctx.input) ctx.input.enabled = false;
    mg.hud.objective('Last one standing wins');
    mg.hud.hint('Don’t stand still: the glass cracks under your feet!');

    const spots = [[-7, -7], [7, -7], [-7, 7], [7, 7]];
    this.bots = [];
    const squad = this.squad = new BotSquad(ctx, { level: mg.level });
    squad.grid.avoid = (x, y, z) => this.cracks.has(x + ',' + y + ',' + z);
    spots.forEach(([x, z], i) => {
      const p = top(A, x, -1, z);
      const b = squad.add({ name: BOT_NAMES[i], team: BOT_TEAMS[i], x: p.x, y: p.y, z: p.z, taggable: false });
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
    this.cracks.set(k, this.crackTime);
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
    if (counting) { this.squad.update(0); return; }
    this.t += dt;
    mg.hud.timer(Math.max(0, MAX_TIME - this.t));

    if (this.t > CRUMBLE) {
      if (!this.crumbling) { this.crumbling = true; mg.hud.toast('Sudden death: the floors are crumbling!'); }
      this.crumbleT = (this.crumbleT || 0) - dt;
      if (this.crumbleT <= 0) {
        this.crumbleT = 0.25;
        const n = 2 + Math.floor((this.t - CRUMBLE) / 10);
        for (let f = 0; f < FLOORS; f++) for (let i = 0; i < n; i++) {
          this.crackAt(A.origin.x + Math.floor((Math.random() * 2 - 1) * (HALF + 0.99)), A.origin.y - 1 - f * GAP, A.origin.z + Math.floor((Math.random() * 2 - 1) * (HALF + 0.99)));
        }
      }
    }

    // cracked tiles fall
    for (const [k, left] of this.cracks) {
      const l = left - dt;
      if (l > 0) { this.cracks.set(k, l); continue; }
      this.cracks.delete(k);
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
      if (b.y < bottom) { this.eliminate(b); continue; }
      const grounded = !b.falling && b.vy === 0;
      if (grounded) this.stepOn(b);
      b.mem.think -= dt;
      if (!grounded || b.seg) continue;
      // Retarget the moment the goal tile cracks, is gone, or is on a floor we fell from, and step off a cracking tile after the bot's reaction time.
      const fy = Math.floor(b.y - 0.05);
      const left = this.cracks.get(Math.floor(b.x) + ',' + fy + ',' + Math.floor(b.z));
      const goalBad = b.goal && (b.goal[1] !== fy + 1 || !this.safe(b.goal[0], fy, b.goal[2]));
      const idle = !b.goal || b.arrived(0.6);
      const react = left != null && this.crackTime - left >= (b.p?.reaction ?? 0.4) * 0.5;
      if ((goalBad || (idle && react) || (idle && b.mem.think <= -1)) && b.mem.think <= 0) {
        b.mem.think = 0.15;
        this.think(b);
      }
    }
    this.squad.update(dt);

    if (!this.playerOut && this.alive().length === 0) return this.end2(true);
    if (this.playerOut && this.alive().length <= 1) return this.end2(false);
    if (this.t >= MAX_TIME) return this.end2(!this.playerOut);
  },

  safe(x, y, z) { return !!this.ctx.world.isSolidSub(x * 4 + 2, y * 4 + 2, z * 4 + 2) && !this.cracks.has(x + ',' + y + ',' + z); },

  // Bots step to a nearby whole tile, preferring ones with whole neighbours, away from holes and the edge.
  // Early on they take short careful steps (few cracks); later they roam further and take more risks.
  think(b) {
    const fy = Math.floor(b.y - 0.05);
    const ox = this.A.origin.x, oz = this.A.origin.z;
    const calm = Math.max(0, 1 - this.t / CALM);
    const R = calm > 0.4 ? 2 : 2 + Math.round((1 - calm) * 2);
    const bx = Math.floor(b.x), bz = Math.floor(b.z);
    let best = null, bestS = -1e9;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      if (!dx && !dz) continue;
      const x = bx + dx, z = bz + dz;
      if (Math.abs(x - ox) > HALF || Math.abs(z - oz) > HALF || !this.safe(x, fy, z)) continue;
      let s = -Math.hypot(x - ox, z - oz) * 0.15 - Math.hypot(dx, dz) * 0.4 * calm + Math.random() * (0.6 + 2.4 * (1 - calm));
      for (const [ex, ez] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!this.ctx.world.isSolidSub((x + ex) * 4 + 2, fy * 4 + 2, (z + ez) * 4 + 2)) s -= 1.5;
        else if (this.cracks.has((x + ex) + ',' + fy + ',' + (z + ez))) s -= 0.6;
      }
      if (s > bestS) { bestS = s; best = [x, fy + 1, z]; }
    }
    b.stop();
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
      this.squad.remove(who);
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
