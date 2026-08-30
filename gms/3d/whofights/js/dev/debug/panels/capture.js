// Screenshots at any size, and the phone-shaped reframe of the live game. They are one panel
// because they are one mechanism: give #stage a fixed size and let the engine's own resize path
// carry it through the aa target, the post chain and the field of view.

import { SIZES, capture, frame, unframe, framedAs, fitDpr } from '../capture.js';
import { handles } from '../game.js';
import { h, section, button, clear, table, num } from '../ui.js';

export const panel = {
  id: 'capture',
  label: 'Capture',

  mount(el, ctx) {
    const sizes = h('div', 'row');
    const custom = h('div', 'row');
    const out = h('div');
    const frames = h('div', 'row');
    const info = h('div');

    const w = h('input');
    const hh = h('input');
    const dpr = h('input');
    for (const [i, def] of [[w, 1280], [hh, 720], [dpr, 2]]) {
      i.type = 'number';
      i.value = String(def);
      i.style.width = '92px';
    }

    let chosen = SIZES[0];
    const paintInfo = () => {
      const f = fitDpr(chosen.w, chosen.h, +dpr.value || 1);
      clear(info).append(table(null, [
        ['size', `${chosen.w} × ${chosen.h} css px`],
        ['pixels', `${Math.round(chosen.w * f.dpr)} × ${Math.round(chosen.h * f.dpr)} at dpr ${f.dpr}`],
        ['clamped', { html: f.clamped ? 'yes — 16 MP ceiling, some drivers return a blank canvas above it' : 'no', cls: f.clamped ? 'warnc' : 'good' }],
      ]));
    };

    for (const s of SIZES) {
      const b = button(`${s.label} ${s.w}×${s.h}`, s === chosen ? 'primary' : '', () => {
        chosen = s;
        w.value = String(s.w);
        hh.value = String(s.h);
        for (const other of sizes.children) other.className = '';
        b.className = 'primary';
        paintInfo();
      });
      sizes.append(b);
    }

    custom.append(h('span', 'dim', 'w'), w, h('span', 'dim', 'h'), hh, h('span', 'dim', 'dpr'), dpr,
      button('Use these', '', () => {
        chosen = { id: 'custom', label: 'Custom', w: +w.value || 1280, h: +hh.value || 720 };
        for (const other of sizes.children) other.className = '';
        paintInfo();
      }),
      button('Swap w/h', '', () => {
        const t = w.value;
        w.value = hh.value;
        hh.value = t;
        chosen = { id: 'custom', label: 'Custom', w: +w.value, h: +hh.value };
        paintInfo();
      }));

    const shoot = () => {
      const g = handles(ctx);
      const r = capture(g.app, { w: chosen.w, h: chosen.h, dpr: +dpr.value || 1 });
      clear(out);
      if (!r.ok) return void out.append(h('div', 'bad', r.error));
      const img = h('img', 'dbg-shot');
      img.src = r.url;
      img.style.maxHeight = '340px';
      const bar = h('div', 'row');
      bar.append(
        h('span', 'dim', `${r.px.w} × ${r.px.h} px${r.clamped ? ' (dpr clamped)' : ''}`),
        button('Download', 'primary', () => {
          const a = h('a');
          a.href = r.url;
          a.download = `wf-${chosen.id}-${r.px.w}x${r.px.h}-${Date.now()}.png`;
          a.click();
        }),
        button('Open in a tab', '', () => { const t = window.open(); t?.document.write(`<img src="${r.url}">`); }),
      );
      out.append(bar, img);
      ctx.toast(`captured ${r.px.w} × ${r.px.h}`, 'good');
    };

    for (const s of SIZES) {
      frames.append(button(s.label, framedAs()?.id === s.id ? 'primary' : '', e => {
        const g = handles(ctx);
        frame(g.app, framedAs()?.id === s.id ? null : s);
        for (const b of frames.children) b.className = '';
        if (framedAs()) e.target.className = 'primary';
        ctx.toast(framedAs() ? `game reframed to ${s.w}×${s.h} — close the hub to look at it` : 'full window restored');
      }));
    }
    frames.append(button('Full window', '', () => {
      unframe(handles(ctx).app);
      for (const b of frames.children) b.className = '';
      ctx.toast('full window restored');
    }));

    el.append(
      section('Screenshot', sizes, custom, info,
        (() => { const r = h('div', 'row'); r.append(button('Capture', 'primary', shoot)); return r; })(),
        h('p', 'dbg-note', 'The shot is a real frame down the real render path, taken and restored '
          + 'inside one task so the oversized stage never paints. The hub overlay is not in it.'),
        out),
      section('Phone preview', frames,
        h('p', 'dbg-note', 'Reframes #stage, #touch and the game UI together, so the thumb pads land '
          + 'where they would on the device. Close the hub to see it; the setting outlives the hub.')));

    paintInfo();
  },
};
