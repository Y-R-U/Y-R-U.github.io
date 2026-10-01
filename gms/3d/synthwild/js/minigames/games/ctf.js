// Capture the Flag: you + 2 Blue bots vs 3 Red bots. Grab the red flag, bring it home while your flag is safe.
// Tap a rival to tag it (it's zapped back to base). First to 3 captures, or the most in 6 minutes.
import { BotSquad } from '../bots/index.js';
import { pad, fill, put, W } from '../bots/arena.js';

const HX = 22, HZ = 12, BASE = 18, WIN = 3, TIME = 360;
const TEAM = { blue: { sign: -1, color: 0x3fa9ff, css: '#7cc6ff' }, red: { sign: 1, color: 0xff4a5e, css: '#ff8a96' } };
const other = (t) => (t === 'blue' ? 'red' : 'blue');

function buildArena(A) {
  pad(A, HX, HZ, { floor: 'mirror_tile', wallH: 3 });
  fill(A, 0, -1, -HZ, 0, -1, HZ, 'neon_white');                         // centre line
  for (const s of [-1, 1]) {
    const nb = s < 0 ? 'neon_cobalt' : 'neon_coral';
    fill(A, s * (BASE - 3), 0, -3, s * (BASE + 3), 0, 3, 'polymer_brick');   // base platform (1 high)
    put(A, s * BASE, 0, 0, nb);                                          // flag pad
    fill(A, s * (BASE + 3), -1, -HZ, s * HX, -1, HZ, nb);                // home stripe
    fill(A, s * 8, 0, -8, s * 8, 1, -4, 'polymer_brick');               // cover walls
    fill(A, s * 8, 0, 4, s * 8, 1, 8, 'polymer_brick');
    fill(A, s * 12, 0, -1, s * 12, 1, 1, 'polymer_brick');
    fill(A, s * 4, -1, -HZ, s * 5, -1, -HZ + 3, 'air');                  // shallow trenches to hop
    fill(A, s * 4, -1, HZ - 3, s * 5, -1, HZ, 'air');
    for (const [x, z] of [[14, -7], [14, 7], [6, 0], [10, -10], [10, 10]]) put(A, s * x, 0, z, 'lattice_planks');
  }
  fill(A, -2, 0, -2, 2, 1, 2, 'polymer_brick');                          // centre tower + steps
  for (const [x, z] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) put(A, x, 0, z, 'lattice_planks');
  put(A, 0, 2, 0, 'glowbulb');
}

function flagMesh(T, color) {
  const g = new T.Group();
  const pole = new T.Mesh(new T.BoxGeometry(0.06, 1.6, 0.06), new T.MeshBasicMaterial({ color: 0xdfe8f0 }));
  pole.position.y = 0.8;
  const banner = new T.Mesh(new T.BoxGeometry(0.04, 0.5, 0.75), new T.MeshBasicMaterial({ color, toneMapped: false }));
  banner.position.set(0, 1.3, 0.38);
  const glow = new T.Mesh(new T.SphereGeometry(0.5, 12, 8), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }));
  glow.position.y = 1.2;
  g.add(pole, banner, glow);
  g.userData.banner = banner;
  return g;
}

const ctf = {
  id: 'ctf', name: 'Capture the Flag', icon: 'flag', minutes: 6,
  blurb: 'Grab the red flag and bring it home. Tap rivals to zap them back to base!',

  build(A) { this.A = A; buildArena(A); },

  start(mg) {
    const { ctx } = mg;
    const A = this.A || mg.arena;
    this.A = A; this.mg = mg; this.ctx = ctx;
    const T = ctx.THREE;
    this.t = 0; this.time = TIME; this.over = false; this.count = 3.5;
    this.score = { blue: 0, red: 0 };
    this.playerInv = 0;
    ctx.session.mgSurvival = false;
    ctx.game.inv.clear();
    ctx.sky?.setTime?.(0.3);
    const home = (t) => W(A, TEAM[t].sign * BASE, 1, 0);
    this.flags = {};
    for (const t of ['blue', 'red']) {
      const mesh = flagMesh(T, TEAM[t].color);
      ctx.scene?.add(mesh);
      const h = home(t);
      this.flags[t] = { team: t, home: h, pos: { ...h }, carrier: null, dropT: 0, mesh };
    }
    const sq = (this.squad = new BotSquad(ctx, { level: mg.level }));
    const spawn = (t, i) => W(A, TEAM[t].sign * (BASE - 1), 1, (i - 1) * 2.5);
    this.spawnOf = spawn;
    const names = ['Zip', 'Nova', 'Bolt', 'Rex', 'Echo'];
    const roles = [['blue', 'attack'], ['blue', 'defend'], ['red', 'attack'], ['red', 'attack'], ['red', 'defend']];
    roles.forEach(([team, role], i) => {
      const s = spawn(team, team === 'blue' ? i + 1 : i - 2);
      const b = sq.add({ name: names[i], team, x: s.x, y: s.y, z: s.z, taggable: team === 'red' });
      b.role = role; b.home = spawn(team, 1); b.frozen = this.count; b.mem.tagT = 0; b.mem.baseSpeed = b.p.speed;
      if (role === 'attack' && team === 'red' && i === 3) b.mem.wait = 10;
    });
    sq.onTag = (bot) => {
      if (bot.team !== 'red' || bot.frozen > 0 || this.count > 0) return false;
      this.tagBot(bot, 'You');
      return true;
    };
    const ps = home('blue');
    ctx.player.teleport(ps.x + 2, ps.y + 0.02, ps.z + 3);
    ctx.player.yaw = -Math.PI / 2; ctx.player.pitch = -0.08;
    ctx.game.setSpawn({ x: ps.x + 2, y: ps.y, z: ps.z + 3 });
    this.invuln = 0;
    mg.hud.objective('Grab the red flag!');
    this.drawScore();
  },

  drawScore() { this.mg.hud.score(`<span style="color:#7cc6ff">Blue ${this.score.blue}</span> – <span style="color:#ff8a96">${this.score.red} Red</span>`); },

  ents() {
    const P = this.ctx.player.pos;
    return [{ kind: 'player', team: 'blue', x: P.x, y: P.y, z: P.z, ref: 'player' }, ...this.squad.list.filter((b) => !b.hidden).map((b) => ({ kind: 'bot', team: b.team, x: b.x, y: b.y, z: b.z, ref: b, frozen: b.frozen > 0 }))];
  },

  dropFlag(carrier) {
    for (const f of Object.values(this.flags)) if (f.carrier === carrier) {
      const at = carrier === 'player' ? this.ctx.player.pos : carrier;
      f.carrier = null; f.pos = { x: at.x, y: at.y, z: at.z }; f.dropT = 12;
    }
  },

  tagBot(bot, by) {
    this.dropFlag(bot);
    this.ctx.fx?.puff?.({ x: bot.x, y: bot.y + 1, z: bot.z }, TEAM[bot.team].color);
    this.ctx.audio?.sfx?.('tag');
    bot.hidden = true; bot.stop(); bot.frozen = 1.2;
    bot.mem.respawn = 1.2;
    if (by) this.mg.hud.toast(`${by} tagged ${bot.name}!`);
  },

  tagPlayer(bot) {
    if (this.invuln > 0) return;
    this.dropFlag('player');
    const s = this.spawnOf('blue', 1);
    this.ctx.fx?.puff?.(this.ctx.player.pos.clone().setY(this.ctx.player.pos.y + 1), 0xff4a5e);
    this.ctx.player.teleport(s.x - 1, s.y + 0.02, s.z);
    this.invuln = 2.5;
    this.ctx.audio?.sfx?.('tag');
    this.mg.hud.toast(`${bot.name} tagged you! Back to base.`);
  },

  update(dt) {
    if (this.over) return;
    const { ctx, mg, squad, flags } = this;
    const P = ctx.player.pos;
    if (this.count > 0) {
      const before = this.t === 0 ? -1 : Math.ceil(this.count - 0.5);
      this.count -= dt;
      const now = Math.ceil(this.count - 0.5);
      if (now !== before) mg.hud.big(now > 0 ? String(now) : 'GO!', 0.9);
      this.t += dt;
      squad.update(dt);
      this.drawFlags(dt);
      return;
    }
    this.t += dt;
    this.time -= dt;
    this.invuln -= dt;
    mg.hud.timer(this.time);

    // Bots: respawn, decide, move.
    for (const b of squad.list) {
      if (b.mem.respawn > 0 && (b.mem.respawn -= dt) <= 0) {
        const s = this.spawnOf(b.team, 1);
        b.teleport(s.x, s.y, s.z); b.hidden = false; b.frozen = 1;
        if (b.role === 'attack') b.mem.wait = 3 + Math.random() * 4 * b.p.caution;
      }
      if (b.hidden) continue;
      b.mem.wait = (b.mem.wait || 0) - dt;
      b.p.speed = b.mem.baseSpeed * (Object.values(flags).some((f) => f.carrier === b) ? 0.82 : 1);
      if ((b.mem.think = (b.mem.think || 0) - dt) <= 0) { b.mem.think = 0.3; this.think(b); }
    }
    squad.update(dt);

    // Flag pickups, returns and captures.
    const ents = this.ents();
    for (const f of Object.values(flags)) {
      if (f.carrier) continue;
      if (f.dropT > 0 && (f.dropT -= dt) <= 0) { f.pos = { ...f.home }; this.mg.hud.toast(`The ${f.team} flag went home.`); }
      for (const e of ents) {
        if (e.frozen || Math.hypot(e.x - f.pos.x, e.z - f.pos.z) > 1.3 || Math.abs(e.y - f.pos.y) > 2) continue;
        if (e.team !== f.team) { f.carrier = e.ref; f.dropT = 0; ctx.audio?.sfx?.('flag'); mg.hud.toast(e.kind === 'player' ? 'You have the red flag! Run home!' : `${e.ref.name} grabbed the ${f.team} flag!`); break; }
        if (f.dropT > 0) { f.pos = { ...f.home }; f.dropT = 0; mg.hud.toast(`${e.kind === 'player' ? 'You' : e.ref.name} returned the ${f.team} flag.`); break; }
      }
    }
    for (const f of Object.values(flags)) {
      if (!f.carrier) continue;
      const c = f.carrier === 'player' ? { x: P.x, y: P.y, z: P.z, team: 'blue' } : f.carrier;
      const mine = flags[c.team];
      const atHome = !mine.carrier && Math.hypot(mine.pos.x - mine.home.x, mine.pos.z - mine.home.z) < 0.1;
      if (atHome && Math.hypot(c.x - mine.home.x, c.z - mine.home.z) < 1.8) {
        this.score[c.team]++;
        f.carrier = null; f.pos = { ...f.home };
        ctx.audio?.sfx?.('goal');
        mg.hud.big(c.team === 'blue' ? 'BLUE SCORES!' : 'Red scores', 1.8);
        this.drawScore();
        if (this.score[c.team] >= WIN) return this.finish();
      }
    }

    // Tags by bots (only in their own half, or on whoever carries their flag).
    for (const b of squad.list) {
      if (b.hidden || b.frozen > 0) continue;
      let hit = null;
      for (const e of ents) {
        if (e.team === b.team || e.frozen || (e.ref === b)) continue;
        const inMyHalf = Math.sign(e.x - this.A.origin.x - 0.5) === TEAM[b.team].sign;
        const carrying = flags[b.team].carrier === e.ref;
        if (!inMyHalf && !carrying) continue;
        if (Math.hypot(e.x - b.x, e.z - b.z) < 1.4 && Math.abs(e.y - b.y) < 1.6) { hit = e; break; }
      }
      if (hit) {
        b.mem.tagT += dt;
        if (b.mem.tagT >= b.p.reaction) { b.mem.tagT = 0; if (hit.kind === 'player') this.tagPlayer(b); else this.tagBot(hit.ref, b.name); }
      } else b.mem.tagT = 0;
    }

    // Player objective text.
    const pc = flags.red.carrier === 'player';
    mg.hud.objective(pc ? 'Bring it home!' : flags.blue.carrier ? 'Get your flag back!' : 'Grab the red flag!');
    if (P.y < this.A.origin.y - 6) { const s = this.spawnOf('blue', 1); this.dropFlag('player'); ctx.player.teleport(s.x - 1, s.y + 0.02, s.z); }
    this.drawFlags(dt);
    if (this.time <= 0) this.finish();
  },

  think(b) {
    const { flags } = this;
    const mine = flags[b.team], theirs = flags[other(b.team)];
    const P = this.ctx.player.pos;
    const pos = (r) => (r === 'player' ? { x: P.x, y: P.y, z: P.z } : r);
    const goCell = (p, near = 0.6) => b.goTo(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z), near);
    if (theirs.carrier === b) return goCell(mine.home, 0.8);
    // Someone has our flag: defenders (and attackers nearby) chase.
    if (mine.carrier) {
      const c = pos(mine.carrier);
      if (b.role === 'defend' || b.dist2(c) < 10) return goCell(c, 0.5);
    }
    if (b.role === 'defend') {
      const intruder = this.ents().find((e) => e.team !== b.team && !e.frozen && Math.hypot(e.x - mine.home.x, e.z - mine.home.z) < 10);
      if (intruder) return goCell(intruder, 0.5);
      if (!b.goal || b.arrived(1.5)) {
        const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 1.5;
        return goCell({ x: mine.home.x + Math.cos(a) * r, y: mine.home.y, z: mine.home.z + Math.sin(a) * r });
      }
      return;
    }
    // A cautious attacker waits at midfield for a moment after (re)spawning, so raids come in waves.
    if (b.mem.wait > 0) return goCell({ x: this.A.origin.x + TEAM[b.team].sign * 5, y: mine.home.y, z: mine.home.z + (b.id % 2 ? 4 : -4) }, 1.5);
    // Attackers: go for their flag (dropped or at home). If our teammate carries it, escort.
    if (theirs.carrier) return goCell(pos(theirs.carrier), 2);
    goCell(theirs.pos, 0.4);
  },

  drawFlags(dt) {
    const P = this.ctx.player.pos;
    for (const f of Object.values(this.flags)) {
      const m = f.mesh;
      const c = f.carrier ? (f.carrier === 'player' ? { x: P.x, y: P.y, z: P.z } : f.carrier) : null;
      if (c) {
        m.position.set(c.x, c.y + 1.1, c.z);
        m.scale.setScalar(0.8);
        if ((f.trail = (f.trail || 0) - dt) <= 0) { f.trail = 0.12; this.ctx.fx?.spark?.({ x: c.x, y: c.y + 1.5, z: c.z }, TEAM[f.team].color, 3); }
      } else { m.position.set(f.pos.x, f.pos.y, f.pos.z); m.scale.setScalar(1); }
      m.userData.banner.rotation.y = Math.sin(this.t * 3) * 0.25;
    }
  },

  finish() {
    if (this.over) return;
    this.over = true;
    const { blue, red } = this.score;
    const won = blue > red;
    const stars = won ? (blue - red >= 2 ? 3 : 2) : blue === red ? 1 : blue > 0 ? 1 : 0;
    this.squad.list.forEach((b) => b.stop());
    this.mg.finish({ won, stars, score: blue, title: won ? 'Blue wins!' : blue === red ? 'A draw!' : 'Red wins', text: `Blue ${blue} – ${red} Red` });
  },

  end() {
    this.squad?.clear();
    for (const f of Object.values(this.flags || {})) this.ctx.scene?.remove(f.mesh);
  },
};

export default ctf;
