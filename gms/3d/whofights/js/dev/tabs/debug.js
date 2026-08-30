// The Debug tab — the catch-all developer pages, split into sub-tabs because ten panels on one
// scroll is not a tool, it is a wall.
//
// Two things here outlive the tab: the hooks in js/dev/debug/install.js, which record from the
// moment this tab is first opened until the page reloads, and the mini-HUD, which is how any of
// this is watched while the game is actually running. The hub pauses the loop and covers the
// screen, so the panels that only mean something in motion — perf, trace, input — all have a lane
// out there instead. `Keep the game running` is the escape hatch for the rest.

import { registerTab } from '../hub.js';
import { state } from '../debug/core.js';
import { install } from '../debug/install.js';
import { handles, warpTo, where } from '../debug/game.js';
import { waypoints } from '../debug/waypoints.js';
import { ensureCSS, h, button, clear } from '../debug/ui.js';
import * as hud from '../debug/hud.js';
import * as overlayPanel from '../debug/panels/overlay.js';

import { panel as perf } from '../debug/panels/perf.js';
import { panel as warp } from '../debug/panels/warp.js';
import { panel as trace } from '../debug/panels/trace.js';
import { panel as world } from '../debug/panels/world.js';
import { panel as save } from '../debug/panels/save.js';
import { panel as light } from '../debug/panels/light.js';
import { panel as capture } from '../debug/panels/capture.js';
import { panel as consolePanel } from '../debug/panels/console.js';
import { panel as input } from '../debug/panels/input.js';

const PANELS = [warp, world, overlayPanel.panel, trace, perf, light, save, capture, consolePanel, input];
const KEY = 'wf.dev.debug.sub';
let active = null;
let current = null;

registerTab({
  id: 'debug',

  mount(el, ctx) {
    ensureCSS();
    install(ctx);
    expose(ctx);

    const head = h('div', 'row');
    const subs = h('div', 'dbg-subs');
    const body = h('div');
    el.append(head, subs, body);

    const paintHead = () => {
      clear(head).append(
        button(hud.visible() ? '◧ Mini-HUD is up' : '◧ Mini-HUD', hud.visible() ? 'primary' : '', () => {
          hud.show(ctx, !hud.visible());
          paintHead();
          ctx.toast(hud.visible()
            ? 'the mini-HUD stays up when you close the hub — drag it by its header'
            : 'mini-HUD hidden');
        }),
        button(state.keepRunning ? '▶ Game keeps running' : '⏸ Game pauses in here', state.keepRunning ? 'primary' : '', () => {
          keepRunning(ctx, !state.keepRunning);
          paintHead();
        }),
        h('span', 'dim', state.keepRunning
          ? 'the loop runs behind this overlay — keys still reach the player'
          : `tracing since ${new Date(Date.now() - (performance.now() - state.installedAt)).toLocaleTimeString()}`),
      );
      for (const lane of hud.LANES) {
        if (!hud.visible()) break;
        const b = h('button', `dbg-chip${hud.laneOn(lane.id) ? ' on' : ''}`, lane.label);
        b.onclick = () => { hud.lane(lane.id); paintHead(); };
        head.append(b);
      }
    };

    // The badges are updated in place rather than by rebuilding the bar: a bar that redraws on a
    // timer eats the click that lands the moment it does.
    const badges = new Map();
    const paintSubs = () => {
      clear(subs);
      badges.clear();
      for (const p of PANELS) {
        const b = h('button', p === current ? 'on' : '', p.label);
        if (p.badge) {
          const tag = h('span', 'dbg-badge');
          b.append(tag);
          badges.set(p, tag);
        }
        b.onclick = () => show(p.id);
        subs.append(b);
      }
      syncBadges();
    };
    const syncBadges = () => {
      for (const [p, tag] of badges) {
        const n = p.badge();
        tag.textContent = n ? ` ${n}` : '';
      }
    };

    const show = id => {
      const p = PANELS.find(x => x.id === id) || PANELS[0];
      try { current?.unmount?.(); } catch (e) { console.warn('[debug] unmount threw', e); }
      current = p;
      active = p.id;
      localStorage.setItem(KEY, p.id);
      paintSubs();
      clear(body);
      try {
        const r = p.mount(body, ctx);
        if (r?.catch) r.catch(e => fail(body, p, e, ctx));
      } catch (e) { fail(body, p, e, ctx); }
    };

    this._badges = setInterval(syncBadges, 1500);
    paintHead();
    show(active || localStorage.getItem(KEY) || 'warp');
  },

  unmount() {
    clearInterval(this._badges);
    try { current?.unmount?.(); } catch { /* a panel timer that has already gone */ }
    current = null;
  },
});

function fail(body, p, e, ctx) {
  console.error(`[debug] panel ${p.id} failed`, e);
  clear(body).append(h('div', 'empty', `${p.label} crashed: ${e?.message || e}`));
  ctx.toast(`debug/${p.id}: ${e?.message || e}`, 'bad');
}

// The hub asks window.__wf for a pause hook before it falls back to cancelling the rAF itself, so
// installing a pair of no-ops here is all it takes to keep the loop alive behind the overlay.
// Off by default: the overlay is opaque, so most of the time a running game is just heat.
function keepRunning(ctx, on) {
  const w = window.__wf;
  const app = handles(ctx).app;
  state.keepRunning = !!on;
  if (!w) return;
  if (on) {
    w.pause = () => {};
    w.resume = () => {};
    if (app && !app.raf) app.start?.();
  } else {
    delete w.pause;
    delete w.resume;
    if (app?.raf) { cancelAnimationFrame(app.raf); app.raf = null; }
  }
}

// What other tabs and the console get. Kept small and stable: overlays are the one thing another
// tab is likely to want, and the level editor should drive this set rather than draw a second one.
function expose(ctx) {
  const w = window.__wf;
  if (!w) return;
  w.debug = {
    version: 1,
    owner: 'debug tab (js/dev/tabs/debug.js)',
    state,
    trace: {
      list: () => state.trace.list(),
      clear: () => state.trace.clear(),
      record: (kind, id, text) => state.trace.push({ t: performance.now(), wall: Date.now(), kind, id, text }),
      get armed() { return state.tracing; },
      set armed(v) { state.tracing = !!v; },
    },
    log: { list: () => state.log.list(), clear: () => state.log.clear() },
    overlays: {
      // Async because the overlay module imports three and this tab must stay loadable without it.
      async ensure() { return overlayPanel.ensure(ctx); },
      get current() { return overlayPanel.current(); },
      async show(kind, on = true) { return (await overlayPanel.ensure(ctx))?.show(kind, on); },
      async toggle(kind) { return (await overlayPanel.ensure(ctx))?.toggle(kind); },
      async refresh() { return (await overlayPanel.ensure(ctx))?.refresh(); },
      visible: kind => !!overlayPanel.current()?.visible(kind),
      get kinds() { return ['hotspots', 'colliders', 'interior', 'walk', 'probe', 'grid', 'characters']; },
    },
    warp: {
      to: t => warpTo(ctx, t),
      where: () => where(ctx),
      list: () => {
        const g = handles(ctx);
        return g.level ? waypoints(g.level, g.characters?.cast || {}, id => g.characters?.at?.(id) || null) : [];
      },
    },
    hud: {
      show: (on = true) => hud.show(ctx, on),
      hide: () => hud.hide(),
      lane: (id, on) => hud.lane(id, on),
      get visible() { return hud.visible(); },
    },
    keepRunning: on => keepRunning(ctx, on),
    select: o => { state.selected = o; },
  };
}
