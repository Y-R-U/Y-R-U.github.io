// Wireframes drawn into the live world. The overlay object itself is created once and kept on
// window.__wf.debug.overlays, so it survives the hub closing and other tabs can drive it.

import { handles } from '../game.js';
import { h, section, table, clear, button, num } from '../ui.js';

const LABELS = {
  hotspots: ['Hotspot shapes', 'circles and rects, coloured by trigger; an attached one follows its character'],
  colliders: ['Camera-ray boxes', 'the oriented boxes the camera arm rays against — one per level object'],
  interior: ['Interior wall slabs', 'the extra boxes a room pushes in while you are inside it'],
  walk: ['Walk blockers', 'sampled by asking walkStep() itself, in a 42 m square around the player'],
  probe: ['Ground probe', 'terrain height under the player against where his feet actually are'],
  characters: ['Character pins', 'every placed body from data/characters.json'],
  grid: ['10 m grid', 'draped over the terrain around the player'],
};

let overlays = null;

export async function ensure(ctx) {
  if (overlays) return overlays;
  const g = handles(ctx);
  if (!g.scene) return null;
  // Dynamic: this module imports three, and js/dev/selftest.html has no importmap for it.
  const { Overlays } = await import('../overlays.js');
  overlays = new Overlays(g);
  return overlays;
}

export const current = () => overlays;

export const panel = {
  id: 'overlay',
  label: 'Overlays',

  async mount(el, ctx) {
    const box = h('div');
    const readout = h('div');
    el.append(
      section('Overlays', box,
        h('p', 'dbg-note', 'These stay on when the hub closes — that is the point. Other tabs can '
          + 'drive the same set through window.__wf.debug.overlays rather than drawing a second one.')),
      section('Ground', readout));

    const o = await ensure(ctx);
    if (!o) return void box.append(h('div', 'empty', 'no scene — the overlays need a running world'));

    const row = h('div', 'row');
    for (const kind of Object.keys(LABELS)) {
      const b = button(LABELS[kind][0], o.visible(kind) ? 'primary' : '', () => {
        o.toggle(kind);
        b.className = o.visible(kind) ? 'primary' : '';
      });
      b.title = LABELS[kind][1];
      row.append(b);
    }
    box.append(row, button('Rebuild all', '', () => { o.refresh(); ctx.toast('overlays rebuilt'); }),
      table(null, Object.entries(LABELS).map(([k, [t, why]]) => [t, { html: `<span class="dim">${why}</span>`, cls: 'wide' }])));

    const paint = () => {
      const g = handles(ctx);
      const p = g.player?.pos;
      const t = g.world?.terrain;
      if (!p || !t) return void clear(readout).append(h('div', 'dim', 'no player'));
      const surf = t.surfaceY(p.x, p.z);
      clear(readout).append(table(null, [
        ['feet at y', num(p.y, 3)],
        ['terrain surface', num(surf, 3)],
        ['difference', { html: `${num(p.y - surf, 3)} m`, cls: Math.abs(p.y - surf) > 0.05 ? 'warnc' : 'good' }],
        ['indoor blend', num(g.player.indoor ?? 0, 2)],
        ['driven by door script', g.player.driven ? 'yes' : 'no'],
        ['collision on', g.player.collide ? 'yes' : 'no'],
      ]));
      o.tick();
    };
    paint();
    this._t = setInterval(paint, 500);
  },

  unmount() { clearInterval(this._t); },
};
