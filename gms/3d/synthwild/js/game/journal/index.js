// Growth Journal: a kid-friendly chain of goals (replaces advancements). Progress is in game.save().journal.
import { BLOCKS } from '../../data/blocks.js';
import { SURVIVAL_GOALS, BUILD_GOALS } from './goals.js';
import { lightAt } from '../env.js';

const EVENTS = [...new Set([...SURVIVAL_GOALS, ...BUILD_GOALS].flatMap((g) => Object.keys(g.on || {})))];

export class Journal {
  constructor(ctx, game) {
    this.ctx = ctx;
    this.game = game;
    this.done = {};
    this.pollT = 0;
    this.ui = null;
    this.hurtT = 0;
    const bus = ctx.bus;
    for (const ev of EVENTS) bus?.on?.(ev, (d) => this.onEvent(ev, d));
    bus?.on?.('player:damage', () => { this.hurtT = 6; });
    this.J = this.helpers();
  }

  get goals() { return this.game.creative ? BUILD_GOALS : SURVIVAL_GOALS; }
  get enabled() { return this.ctx.settings?.get?.('guide') !== false; }
  current() { return this.goals.find((g) => !this.done[g.id]) || null; }
  progress() { const g = this.goals; return { done: g.filter((x) => this.done[x.id]).length, total: g.length }; }

  helpers() {
    const { game, ctx } = this;
    const id = (k) => game.items.id(k);
    const box = (e) => e.maxSub.map((v, i) => v - e.minSub[i]);
    const J = {
      game, ctx,
      has: (k) => id(k) != null && game.inv.count(id(k)) > 0,
      hasAny: (ks) => ks.some((k) => J.has(k)),
      removedHas: (e, k) => !!e?.removed?.some((r) => BLOCKS[r.mat]?.key === k),
      placedIs: (e, k) => BLOCKS[e?.mat]?.key === k,
      night: () => !!ctx.sky?.isNight && !ctx.settings?.get?.('alwaysDay'),
      dusk: () => !ctx.settings?.get?.('alwaysDay') && (!!ctx.sky?.isNight || (ctx.sky?.time01 ?? 0) > 0.62),
      boxSubs: (e) => (e?.minSub ? box(e).reduce((a, b) => a * b, 1) : 0),
      boxCells: (e) => (e?.minSub ? box(e).reduce((a, b) => a * b, 1) / 64 : 0),
      boxMin: (e) => (e?.minSub ? Math.min(...box(e)) : 0),
      ppos: () => ctx.player?.pos || null,
      nearStructure: (kinds, r) => {
        const p = J.ppos(), w = ctx.world;
        if (!p || !w?.structuresNear) return false;
        return w.structuresNear(p.x, p.z, r).some((s) => (kinds.includes(s.kind) || (s.starter && kinds.includes('starter'))) && Math.abs((s.pos?.[1] ?? p.y) - p.y) < 24);
      },
      // Out of direct sky (a leaky kid hut still counts), lit by your own lamps, near the surface (not just a cave).
      inShelter: () => {
        const p = J.ppos(), w = ctx.world;
        if (!p || !w) return false;
        const L = lightAt(w, p.x, p.y + 1.62, p.z);
        const top = w.surfaceY?.(p.x, p.z) ?? p.y;
        return L.sky <= 10 && L.block >= 8 && top - p.y < 8;
      },
    };
    return J;
  }

  onEvent(name, data) {
    for (const g of this.goals) {
      if (this.done[g.id] || !g.on?.[name]) continue;
      let ok = false;
      try { ok = g.on[name](data || {}, this.J); } catch (e) { console.warn('[journal]', g.id, e); }
      if (ok) this.complete(g);
    }
  }

  complete(g) {
    if (this.done[g.id]) return;
    this.done[g.id] = Date.now();
    const p = this.progress();
    this.ctx.bus?.emit?.('goal:done', { id: g.id, title: g.title, ...p });
    if (!this.enabled) return;
    this.ctx.audio?.sfx?.('goal');
    this.ui?.celebrate(g, p);
  }

  update(dt) {
    this.hurtT = Math.max(0, this.hurtT - dt);
    if ((this.pollT -= dt) <= 0) {
      this.pollT = 1;
      for (const g of this.goals) {
        if (this.done[g.id] || !g.poll) continue;
        let ok = false;
        try { ok = g.poll(this.J); } catch (e) { console.warn('[journal]', g.id, e); }
        if (ok) this.complete(g);
      }
    }
    if (!this.ui && typeof document !== 'undefined' && document.body) this.mountUi();
    this.ui?.update(dt);
  }

  // Hide the chip during fights, while panels are open, and when the guide is off.
  get hidden() {
    const g = this.game;
    if (!this.enabled || g.survival?.dead || g.stations?.isOpen || this.ctx.ui?.panel || this.ctx.session?.paused) return true;
    if (this.hurtT > 0) return true;
    const p = this.ctx.player?.pos;
    if (p && g.mobs?.list.some((m) => m.def.hostile && !m.dying && (m.seen > 0 || m.provoked > 0 || m.fusing) && m.pos.distanceTo(p) < 14)) return true;
    return false;
  }

  async mountUi() {
    this.ui = { update() {}, celebrate() {} };
    try { this.ui = (await import('./ui.js')).createGoalChip(this.ctx, this); } catch (e) { console.warn('[journal] ui', e); }
  }

  serialize() { return { done: { ...this.done } }; }
  load(d) { this.done = { ...(d?.done || {}) }; this.ui?.refresh?.(); }
  reset() { this.done = {}; this.ui?.refresh?.(); }
}
