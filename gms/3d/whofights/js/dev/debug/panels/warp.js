// One click to stand anywhere in the level. The list comes from the documents — hotspots,
// character places, camera shots, every object — so a waypoint exists before its geometry does.

import { waypoints, groupsOf, nearestTo } from '../waypoints.js';
import { handles, warpTo, where } from '../game.js';
import { h, section, button, clear, num } from '../ui.js';

export const panel = {
  id: 'warp',
  label: 'Warp',

  mount(el, ctx) {
    const list = h('div', 'dbg-tree');
    const head = h('div', 'row');
    const manual = h('div', 'row');
    const filter = h('input');
    filter.type = 'text';
    filter.placeholder = 'filter…';

    const inputs = {};
    for (const k of ['x', 'z', 'yaw']) {
      const i = h('input');
      i.type = 'number';
      i.step = k === 'yaw' ? '0.1' : '1';
      i.style.width = '86px';
      i.value = '0';
      inputs[k] = i;
      manual.append(h('span', 'dim', k), i);
    }
    manual.append(
      button('Warp there', 'primary', () => go(ctx, {
        x: +inputs.x.value, z: +inputs.z.value, yaw: +inputs.yaw.value, id: 'manual',
      })),
      button('Read current', '', () => {
        const p = where(ctx);
        if (!p) return ctx.toast('no player', 'warn');
        inputs.x.value = p.x;
        inputs.z.value = p.z;
        inputs.yaw.value = p.yaw;
      }),
      button('Copy as JSON', '', async () => {
        const p = where(ctx);
        if (!p) return ctx.toast('no player', 'warn');
        const json = JSON.stringify({ x: p.x, z: p.z, yaw: p.yaw });
        try { await navigator.clipboard.writeText(json); ctx.toast(`copied ${json}`, 'good'); }
        catch { ctx.toast(json); }
      }),
    );

    el.append(
      section('Where you are', head, manual,
        h('p', 'dbg-note', 'A warp aborts any door script first, drops the player onto the terrain at '
          + 'that point and snaps the camera. It does not touch the save beyond marking it dirty.')),
      section('Waypoints', (() => { const r = h('div', 'row'); r.append(filter); return r; })(), list),
    );

    const paint = () => {
      const g = handles(ctx);
      const doc = g.level;
      const wps = doc ? waypoints(doc, g.characters?.cast || {}, id => g.characters?.at?.(id) || null) : [];
      const p = where(ctx);
      clear(head).append(h('span', p ? '' : 'dim', p
        ? `x ${p.x}  y ${p.y}  z ${p.z}  ·  yaw ${p.yaw}`
        : 'no player — open this while the game is running'));
      if (p) {
        const n = nearestTo(wps, p.x, p.z);
        if (n) head.append(h('span', 'dim', `  ·  nearest: ${n.w.label} (${num(Math.sqrt(n.d), 1)} m)`));
      }
      const q = filter.value.trim().toLowerCase();
      clear(list);
      for (const group of groupsOf(wps)) {
        const rows = wps.filter(w => w.group === group
          && (!q || `${w.label} ${w.id} ${w.note}`.toLowerCase().includes(q)));
        if (!rows.length) continue;
        list.append(h('div', 'dbg-grouphead', group));
        for (const w of rows) {
          const row = h('div', 'dbg-row');
          row.append(h('span', null, w.label),
            h('span', 'dim', ` ${w.x}, ${w.z}`),
            h('span', 'dbg-t', w.note));
          row.onclick = () => go(ctx, w);
          list.append(row);
        }
      }
      if (!list.children.length) list.append(h('div', 'empty', doc ? 'nothing matches' : 'no level document'));
    };

    paint();
    filter.oninput = paint;
    this._t = setInterval(paint, 1200);
  },

  unmount() { clearInterval(this._t); },
};

function go(ctx, w) {
  const r = warpTo(ctx, w);
  ctx.toast(r.ok ? `warped to ${w.label || w.id} — close the hub to see it` : r.error, r.ok ? 'good' : 'warn');
}
