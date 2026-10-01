// Treasure Hunt: five Caches hidden around a floating island. One riddle at a time, plus a hot/cold pulse. Beat the clock.
import { fill, put, top, rng } from '../arena.js';
import { countdown } from '../index.js';
import { h } from '../../ui/dom.js';

const R = 17, TIME = 240;

// Each spot: where the Cache sits (arena cells) and the riddle that points to it.
const SPOTS = [
  { id: 'tree', at: [9, 0, -4], riddle: 'Look under the big tree whose leaves drink the sunshine.' },
  { id: 'rocks', at: [-12, 0, -9], riddle: 'Rocks keep secrets. Peek behind the grey rock pile.' },
  { id: 'pool', at: [-6, -2, 8], riddle: 'Something sparkles at the bottom of the still blue pool.' },
  { id: 'hut', at: [10, 0, 9], riddle: 'Knock knock! Who’s home in the little brick hut?' },
  { id: 'tower', at: [-2, 9, -15], riddle: 'Climb up high, where the light never goes out.' },
];

function buildIsland(A) {
  fill(A, -R - 3, -9, -R - 3, R + 3, 14, R + 3, 'air');
  for (let y = -7; y <= 0; y++) {
    const rr = y === 0 ? R : Math.floor(R * Math.pow(1 - -y / 8, 0.55));
    for (let z = -rr; z <= rr; z++) {
      const w = Math.floor(Math.sqrt(rr * rr - z * z));
      if (w < 0) continue;
      const key = y === 0 ? 'photomoss' : y > -3 ? 'loam_mesh' : 'basalt_matrix';
      fill(A, -w, y - 1, z, w, y - 1, z, key);
      if (y === 0 && w > 2) { fill(A, -w, -1, z, -w + 1, -1, z, 'mirror_sand'); fill(A, w - 1, -1, z, w, -1, z, 'mirror_sand'); }
    }
  }
  // a gentle hill in the middle
  fill(A, -6, 0, -2, 0, 0, 4, 'photomoss'); fill(A, -5, 1, -1, -1, 1, 3, 'photomoss'); fill(A, -4, 2, 0, -2, 2, 2, 'photomoss');
  put(A, -3, 3, 1, 'lumen_bloom');
  // big tree
  fill(A, 8, 0, -5, 8, 5, -5, 'carbon_log');
  fill(A, 5, 5, -8, 11, 6, -2, 'solar_leaves'); fill(A, 6, 7, -7, 10, 7, -3, 'solar_leaves');
  put(A, 8, 4, -6, 'data_vine'); put(A, 7, 4, -5, 'data_vine');
  // rock pile
  fill(A, -12, 0, -7, -9, 1, -6, 'basalt_matrix'); fill(A, -11, 2, -7, -10, 2, -6, 'fractured_matrix'); put(A, -13, 0, -7, 'basalt_matrix');
  // pool (2 deep) with glowcaps around it
  fill(A, -8, -3, 6, -4, -1, 10, 'water');
  for (const [x, z] of [[-9, 6], [-3, 10], [-9, 10], [-3, 6]]) put(A, x, 0, z, 'glowcap');
  // hut with a doorway facing the middle
  fill(A, 8, 0, 7, 12, 3, 11, 'polymer_brick', 'hollow');
  fill(A, 9, -1, 8, 11, -1, 10, 'lattice_planks');
  fill(A, 10, 0, 7, 10, 1, 7, 'air');
  put(A, 10, 2, 9, 'glowbulb');
  // light tower with a climbing rail
  fill(A, -2, 0, -14, -1, 7, -13, 'chrome_shingle');
  fill(A, -2, 0, -12, -2, 8, -12, 'climb_rail');
  fill(A, -3, 8, -16, 0, 8, -13, 'lattice_planks');
  put(A, 0, 9, -16, 'light_panel');
  // a few flowers and lamps so it feels lived-in
  const r = rng('treasure-decor');
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = 4 + r() * (R - 6);
    const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
    if (Math.abs(x - 10) < 4 && Math.abs(z - 9) < 4) continue;
    put(A, x, 0, z, r() < 0.5 ? 'prism_flower' : 'lumen_bloom');
  }
  for (const s of SPOTS) put(A, s.at[0], s.at[1], s.at[2], 'cache');
}

const HEAT = [[3, 'Burning hot!', '#ff4a5e'], [7, 'Hot!', '#ff8a5a'], [13, 'Warm', '#ffd25e'], [22, 'Cool', '#7cc6ff'], [1e9, 'Cold', '#9fb4ff']];

const treasure = {
  id: 'treasure', name: 'Treasure Hunt', icon: 'gem', minutes: 4,
  blurb: 'Solve the riddles and find five hidden Caches on a floating island before time runs out.',
  arenaY: 82, arenaRadius: 2,

  build(A) { this.A = A; buildIsland(A); },

  start(mg) {
    const { ctx } = mg;
    this.mg = mg; this.ctx = ctx;
    this.count = countdown(mg, 3.5);
    this.time = TIME; this.over = false; this.found = 0; this.pulseT = 0;
    const r = rng('order-' + Date.now());
    this.order = SPOTS.slice().sort(() => r() - 0.5);
    ctx.sky?.setTime?.(0.28);
    const p = top(this.A, -3, 2, 1);
    ctx.player.teleport(p.x, p.y + 0.02, p.z);
    ctx.player.yaw = 0; ctx.player.pitch = -0.1;
    if (ctx.input) ctx.input.enabled = false;
    this.heatEl = mg.hud.add(h('div.mg-heat', {}, h('i'), h('span')));
    mg.hud.objective('Find the Caches');
    this.next();
  },

  next() {
    const s = this.order[this.found];
    this.cur = s;
    this.mg.hud.score(`${this.found} / ${SPOTS.length}`);
    if (s) this.mg.hud.hint('Riddle: ' + s.riddle);
  },

  update(dt) {
    if (this.over) return;
    const { ctx, mg, A } = this;
    if (this.count(dt)) return;
    if (ctx.input && !ctx.input.enabled && !ctx.ui?.blocking) { ctx.input.enabled = true; ctx.input.requestPointer?.(); }
    this.time -= dt;
    mg.hud.timer(this.time);
    const P = ctx.player.pos, s = this.cur;
    const c = { x: A.origin.x + s.at[0] + 0.5, y: A.origin.y + s.at[1] + 0.5, z: A.origin.z + s.at[2] + 0.5 };
    const d = Math.hypot(P.x - c.x, P.y + 0.9 - c.y, P.z - c.z);
    const [, word, col] = HEAT.find(([lim]) => d < lim);
    this.heatEl.style.setProperty('--c', col);
    this.heatEl.lastChild.textContent = word;
    this.pulseT -= dt;
    if (this.pulseT <= 0) {
      this.pulseT = Math.max(0.25, Math.min(2.2, d / 9));
      const i = this.heatEl.firstChild;
      i.classList.remove('beat'); void i.offsetWidth; i.classList.add('beat');
      if (d < 7) ctx.audio?.sfx('tick', { vol: 0.6 });
    }
    if (d < 1.9) {
      ctx.world.setBox([c.x - 0.5, c.y - 0.5, c.z - 0.5].map((v) => Math.floor(v) * 4), [c.x + 0.5, c.y + 0.5, c.z + 0.5].map((v) => Math.floor(v) * 4), 0, 'fill', { flow: false, support: false });
      ctx.fx?.spark?.([c.x, c.y, c.z], 0xffc23d, 40);
      ctx.audio?.sfx('cache');
      this.found++;
      mg.hud.big(this.found < SPOTS.length ? `Found ${this.found}!` : 'All found!', 1.3);
      if (this.found >= SPOTS.length) return this.finish();
      this.next();
    }
    if (P.y < A.origin.y - 14) { const p = top(A, -3, 2, 1); ctx.player.teleport(p.x, p.y + 0.02, p.z); mg.hud.toast('Splash-free landing back on the island!'); }
    if (this.time <= 0) this.finish();
  },

  finish() {
    this.over = true;
    const all = this.found >= SPOTS.length, left = Math.max(0, this.time);
    const stars = all ? (left > 120 ? 3 : left > 45 ? 2 : 1) : this.found >= 3 ? 1 : 0;
    const used = TIME - left;
    this.mg.finish({
      won: all, stars,
      title: all ? 'Treasure found!' : 'Out of time',
      text: all ? `All five Caches in ${Math.floor(used / 60)}:${String(Math.floor(used % 60)).padStart(2, '0')}.` : `You found ${this.found} of ${SPOTS.length}.`,
      best: all ? { value: Math.round(used), label: `${Math.floor(used / 60)}:${String(Math.floor(used % 60)).padStart(2, '0')}`, lower: true } : undefined,
    });
  },

  end() { this.heatEl?.remove(); if (this.ctx?.input) this.ctx.input.enabled = true; },
};

export default treasure;
