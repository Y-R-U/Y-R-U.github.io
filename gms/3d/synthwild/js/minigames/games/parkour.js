// Parkour Dash: a seeded spiral of floating platforms around a glowing spire. Checkpoints, a timer, and a ghost of your best run.
import { fill, put, top, rng } from '../arena.js';
import { disposeObject } from '../../core/dispose.js';
import { countdown } from '../index.js';
import { fmtTime } from '../hud.js';

const LENGTHS = { short: 18, medium: 30, long: 46 };
const GHOST_KEY = 'synthwild.mg.ghost.';
const PAD = ['neon_cyan', 'neon_magenta', 'neon_lime', 'neon_amber', 'neon_violet', 'neon_coral'];

function layout(variant) {
  const n = LENGTHS[variant] || LENGTHS.medium;
  const R = rng('parkour-' + variant);
  const steps = [];
  let ang = 0, y = 0, r = 9;
  for (let i = 0; i < n; i++) {
    const size = i === 0 ? 3 : i === n - 1 ? 3 : i % 8 === 0 ? 2 : R() < 0.25 ? 1 : 2;
    const prevSize = steps.length ? steps[steps.length - 1].size : 3;
    // gap (empty cells between edges): 1–2 on the level, 1 when climbing, up to 3 when dropping
    const dy = i < 2 ? 0 : R() < 0.45 ? 1 : R() < 0.15 ? -1 : 0;
    const gap = dy > 0 ? 1 : dy < 0 ? 2 + (R() < 0.4 ? 1 : 0) : 1 + (R() < 0.55 ? 1 : 0);
    const dist = gap + (size + prevSize) / 2;
    r = Math.max(7, Math.min(15, r + (R() - 0.5) * 2));
    ang += dist / r;
    y += i ? dy : 0;
    steps.push({ x: Math.round(Math.cos(ang) * r), z: Math.round(Math.sin(ang) * r), y, size, cp: i > 0 && i % 8 === 0 && i < n - 2 });
  }
  return steps;
}

function cellsOf(s) {
  const lo = -Math.floor((s.size - 1) / 2);
  return { x0: s.x + lo, x1: s.x + lo + s.size - 1, z0: s.z + lo, z1: s.z + lo + s.size - 1 };
}

const parkour = {
  id: 'parkour', name: 'Parkour Dash', icon: 'run', minutes: 2,
  blurb: 'Leap up a spiral of floating platforms. Beat your ghost to the top!',
  variants: [{ id: 'short', label: 'Short' }, { id: 'medium', label: 'Medium', default: true }, { id: 'long', label: 'Long' }],
  arenaY: 78, arenaRadius: 2,

  build(A) {
    this.A = A;
    this.steps = layout(A.variant || 'medium');
    const yMax = this.steps.reduce((m, s) => Math.max(m, s.y), 0);
    fill(A, -18, -2, -18, 18, yMax + 6, 18, 'air');
    fill(A, -1, -12, -1, 1, yMax + 4, 1, 'polymer_brick');                // the central spire
    put(A, 0, yMax + 5, 0, 'light_panel');
    for (let y = -10; y < yMax + 4; y += 4) fill(A, -1, y, -1, 1, y, 1, 'neon_cyan');
    this.steps.forEach((s, i) => {
      const c = cellsOf(s);
      const last = i === this.steps.length - 1;
      const key = i === 0 ? 'neon_white' : last ? 'neon_amber' : s.cp ? 'neon_lime' : i % 2 ? 'mirror_tile' : 'chrome_shingle';
      fill(A, c.x0, s.y - 1, c.z0, c.x1, s.y - 1, c.z1, key);
      if (!s.cp && !last && i) put(A, s.x, s.y - 2, s.z, PAD[i % PAD.length]);
      if (last) put(A, s.x, s.y, s.z, 'glowbulb');
    });
  },

  start(mg) {
    const { ctx } = mg;
    this.mg = mg; this.ctx = ctx;
    this.cp = 0; this.reached = 0; this.t = 0; this.falls = 0; this.over = false;
    this.count = countdown(mg, 3.5);
    this.rec = []; this.recT = 0;
    ctx.sky?.setTime?.(0.32);
    this.respawn(0);
    if (ctx.input) ctx.input.enabled = false;
    const g = this.loadGhost();
    this.ghost = g && g.pts?.length ? { ...g, mesh: this.ghostMesh() } : null;
    mg.hud.objective(`Reach the gold platform (${this.steps.length} jumps)`);
    mg.hud.score(this.bestLine());
    mg.hud.timer(0, true);
    mg.hud.hint(this.ghost ? 'The glowing ghost is your best run. Race it!' : 'Tip: jump right at the edge of a platform.');
  },

  bestLine() { const b = this.mg.best; return b?.label ? `Best ${b.label}` : ''; },

  respawn(i) {
    const s = this.steps[i];
    const p = top(this.A, s.x, s.y - 1, s.z);
    this.ctx.player.teleport(p.x, p.y + 0.02, p.z);
    const n = this.steps[i + 1] || s;
    this.ctx.player.yaw = Math.atan2(-(n.x - s.x), -(n.z - s.z));
    this.ctx.player.pitch = -0.25;
    if (this.ctx.player.vel) this.ctx.player.vel.set(0, 0, 0);
  },

  update(dt) {
    if (this.over) return;
    const { ctx, mg, A } = this;
    if (this.count(dt)) { this.moveGhost(0); return; }
    if (ctx.input && !ctx.input.enabled && !ctx.ui?.blocking) { ctx.input.enabled = true; ctx.input.requestPointer?.(); mg.hud.hint(''); }
    this.t += dt;
    mg.hud.timer(this.t, true);
    const P = ctx.player.pos;
    if ((this.recT -= dt) <= 0) { this.recT = 0.1; this.rec.push([+(P.x - A.origin.x).toFixed(2), +(P.y - A.origin.y).toFixed(2), +(P.z - A.origin.z).toFixed(2)]); }
    this.moveGhost(this.t);

    // which platform are we standing on?
    if (ctx.player.onGround) {
      const rx = Math.floor(P.x) - A.origin.x, rz = Math.floor(P.z) - A.origin.z, ry = Math.round(P.y - A.origin.y);
      for (let i = this.reached; i < Math.min(this.steps.length, this.reached + 4); i++) {
        const s = this.steps[i], c = cellsOf(s);
        if (ry === s.y && rx >= c.x0 && rx <= c.x1 && rz >= c.z0 && rz <= c.z1) {
          if (i > this.reached) { this.reached = i; ctx.audio?.sfx('select'); }
          if (s.cp && i > this.cp) { this.cp = i; mg.hud.toast('Checkpoint!'); ctx.audio?.sfx('cache'); ctx.fx?.spark?.([P.x, P.y + 0.5, P.z], 0x7bdc2a, 24); }
          if (i === this.steps.length - 1) return this.win();
          break;
        }
      }
    }
    mg.hud.objective(`Platform ${this.reached + 1} / ${this.steps.length}`);
    const floorY = A.origin.y + this.steps[this.cp].y - 9;
    if (P.y < floorY) {
      this.falls++;
      ctx.audio?.sfx('whiff');
      mg.hud.toast(this.cp ? 'Back to the checkpoint!' : 'Whoops! Try again.');
      this.respawn(this.cp);
      this.reached = this.cp;
    }
  },

  win() {
    this.over = true;
    const t = this.t, n = this.steps.length;
    const par = n * 1.15;
    const stars = t <= par ? 3 : t <= par * 1.5 ? 2 : 1;
    const prev = this.mg.best?.value;
    if (prev == null || t < prev) this.saveGhost();
    this.ctx.fx?.spark?.([this.ctx.player.pos.x, this.ctx.player.pos.y + 1, this.ctx.player.pos.z], 0xffc23d, 60);
    this.mg.finish({
      won: true, stars, title: 'You made it!',
      text: `${fmtTime(t)} · ${this.falls ? this.falls + (this.falls === 1 ? ' fall' : ' falls') : 'no falls!'} · 3 stars under ${fmtTime(par)}`,
      best: { value: +t.toFixed(2), label: fmtTime(t), lower: true },
    });
  },

  ghostKey() { return GHOST_KEY + (this.A.variant || 'medium'); },
  loadGhost() { try { return JSON.parse(localStorage.getItem(this.ghostKey()) || 'null'); } catch { return null; } },
  saveGhost() { try { localStorage.setItem(this.ghostKey(), JSON.stringify({ t: this.t, pts: this.rec })); } catch {} },

  ghostMesh() {
    const T = this.ctx.THREE;
    if (!T || !this.ctx.scene) return null;
    const mat = new T.MeshBasicMaterial({ color: 0x9ffcff, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
    const g = new T.Group();
    const body = new T.Mesh(new T.CapsuleGeometry(0.3, 1.1, 4, 10), mat);
    body.position.y = 0.85;
    const head = new T.Mesh(new T.SphereGeometry(0.26, 12, 8), mat);
    head.position.y = 1.65;
    g.add(body, head);
    this.ctx.scene.add(g);
    return g;
  },
  moveGhost(t) {
    const G = this.ghost;
    if (!G?.mesh) return;
    const f = Math.min(G.pts.length - 1, t / 0.1), i = Math.floor(f), k = f - i;
    const a = G.pts[i], b = G.pts[Math.min(i + 1, G.pts.length - 1)];
    const o = this.A.origin;
    G.mesh.position.set(o.x + a[0] + (b[0] - a[0]) * k, o.y + a[1] + (b[1] - a[1]) * k, o.z + a[2] + (b[2] - a[2]) * k);
    G.mesh.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]);
    G.mesh.visible = t < G.pts.length * 0.1 + 1;
  },

  end() {
    if (this.ghost?.mesh) disposeObject(this.ghost.mesh);
    this.ghost = null;
    if (this.ctx.input) this.ctx.input.enabled = true;
  },
};

export default parkour;
