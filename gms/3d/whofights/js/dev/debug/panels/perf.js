// Draw calls, triangles, texture memory, the frame-time graph, and the quality knobs that move
// them. Every number comes from js/engine/stats.js and js/engine/budget.js — nothing here
// measures anything twice.

import { BUDGETS } from '../../../engine/stats.js';
import { state } from '../core.js';
import { handles } from '../game.js';
import { h, section, table, button, slider, fmt, num, clear } from '../ui.js';
import * as hud from '../hud.js';

const grade = (v, b) => (v > b ? 'bad' : v > b * 0.8 ? 'warnc' : 'good');

export const panel = {
  id: 'perf',
  label: 'Perf',

  mount(el, ctx) {
    const readout = h('div');
    const canvas = h('canvas', 'dbg-graph');
    const knobs = h('div');
    const tex = h('div', 'dbg-scroll');

    const presetRow = h('div', 'row');
    const rebuild = () => {
      clear(presetRow).append(...presets(ctx, rebuild).childNodes);
      clear(knobs).append(knobPanel(ctx));
    };

    el.append(
      section('Frame', banner(ctx), readout,
        h('p', 'dbg-note', 'The hub stops the game loop, so these freeze while you are reading them. '
          + 'The graph replays what the loop sampled; turn on the mini-HUD to watch it live while you play.'),
        canvas),
      h('div', 'dbg-cols',
        section('Quality knobs', presetRow, knobs),
        section('Texture memory', tex)),
    );

    const paint = () => {
      const g = handles(ctx);
      const s = g.stats?.read?.();
      clear(readout).append(s ? statsTable(s) : h('div', 'empty', 'no engine'));
      graph(canvas);
      clear(tex).append(texTable(g));
    };
    rebuild();
    paint();
    this._t = setInterval(paint, 700);
  },

  unmount() { clearInterval(this._t); },
};

function banner(ctx) {
  const row = h('div', 'row');
  row.append(
    button('Mini-HUD', hud.visible() ? 'primary' : '', e => {
      hud.show(ctx, !hud.visible());
      e.target.className = hud.visible() ? 'primary' : '';
    }),
    button('Reset stats', '', () => handles(ctx).stats?.reset?.()),
    h('span', 'dim', `budget: ${BUDGETS.calls} calls · ${fmt(BUDGETS.tris)} tris · ${BUDGETS.gpu} ms gpu · ${BUDGETS.texMB} MB`),
  );
  return row;
}

function statsTable(s) {
  const cell = (v, budget) => ({ html: v, cls: budget ? grade(parseFloat(v), budget) : '' });
  return table(null, [
    ['fps (median)', cell(s.fps.toFixed(1))],
    ['frame p95', cell(`${num(s.frameP95, 1)} ms`, 16.7)],
    ['worst frame', cell(`${num(s.hitchMs, 0)} ms`, 50)],
    ['cpu p95', cell(`${num(s.cpuP95, 2)} ms`, BUDGETS.cpu)],
    ['gpu p95', s.gpuSupported ? cell(`${num(s.gpuP95, 2)} ms`, BUDGETS.gpu) : { html: '— <span class="dim">no timer extension</span>' }],
    ['draw calls', cell(`${s.calls} <span class="dim">(${s.mainCalls} main, ${s.shadowCalls} shadow)</span>`, BUDGETS.calls)],
    ['triangles', cell(`${fmt(s.tris)} <span class="dim">(${fmt(s.mainTris)} main, ${fmt(s.shadowTris)} shadow)</span>`, BUDGETS.tris)],
    ['texture memory', cell(`${num(s.texMB, 1)} MB`, BUDGETS.texMB)],
    ['textures / geometries', `${s.textures} / ${s.geometries}`],
    ['shader programs', String(s.programs)],
    ['pixel ratio', num(s.dpr, 2)],
    ['verdict', { html: s.verdict, cls: s.load > 1 ? 'bad' : s.load > 0.8 ? 'warnc' : 'good' }],
    ['blocks', s.blocks ? `${s.blocks.detail} detail · ${s.blocks.proxy} proxy · ${s.blocks.culled} culled of ${s.blocks.blocks}` : '—'],
  ]);
}

// The samples come from a system inside the game loop, so a flat tail means the loop is stopped,
// not that the frames got cheap.
function graph(canvas) {
  const rows = state.frames.tail(240);
  const w = canvas.clientWidth || 600, hgt = 120;
  canvas.width = w * (devicePixelRatio || 1);
  canvas.height = hgt * (devicePixelRatio || 1);
  const c = canvas.getContext('2d');
  c.setTransform(devicePixelRatio || 1, 0, 0, devicePixelRatio || 1, 0, 0);
  c.clearRect(0, 0, w, hgt);
  const top = Math.max(33.4, ...rows.map(r => r.ms)) * 1.1;
  for (const [ms, col] of [[16.7, '#5fd68a'], [33.3, '#ffc861']]) {
    const y = hgt - (ms / top) * hgt;
    c.strokeStyle = col;
    c.globalAlpha = 0.35;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = col;
    c.font = '10px ui-monospace, Menlo, monospace';
    c.fillText(`${ms} ms`, 4, y - 3);
  }
  if (!rows.length) {
    c.fillStyle = '#5d6b7d';
    c.fillText('no samples yet — play for a moment with the hub closed', 8, hgt / 2);
    return;
  }
  const bw = w / Math.max(60, rows.length);
  rows.forEach((r, i) => {
    const bh = Math.min(hgt, (r.ms / top) * hgt);
    c.fillStyle = r.ms > 33.3 ? '#ff7a7a' : r.ms > 16.7 ? '#ffc861' : '#3f7fbf';
    c.fillRect(i * bw, hgt - bh, Math.max(1, bw - 0.5), bh);
  });
}

function texTable(g) {
  const list = g.w?.texBreakdown?.() || [];
  if (!list.length) return h('div', 'dim', 'nothing tracked — js/engine/budget.js track() has not been called');
  return table(['texture', 'size', 'MB'], list.slice(0, 40).map(t => [t.label, t.size, t.mb.toFixed(2)]));
}

function presets(ctx, onChange) {
  const row = h('div', 'row');
  const q = handles(ctx).quality;
  if (!q) { row.append(h('span', 'dim', 'no quality registry')); return row; }
  row.append(h('span', 'dim', 'preset'));
  for (const name of Object.keys(q.constructor.presets || {})) {
    row.append(button(name, q.presetName === name ? 'primary' : '', () => {
      q.usePreset(name);
      ctx.toast(`preset ${name}`);
      onChange();
    }));
  }
  return row;
}

// Built straight off the registry, so a knob another agent registers appears here with no edit.
function knobPanel(ctx) {
  const q = handles(ctx).quality;
  const wrap = h('div');
  if (!q) return wrap;
  for (const [group, schemas] of q.groups()) {
    const card = h('div', 'dbg-card');
    card.append(h('h3', null, group));
    for (const s of schemas) card.append(knob(q, s));
    wrap.append(card);
  }
  return wrap;
}

function knob(q, s) {
  if (s.type === 'range') {
    return slider({
      label: s.label, min: s.min, max: s.max, step: s.step,
      get: () => q.get(s.key) ?? s.default ?? s.min,
      set: v => q.set(s.key, v),
      fmt: v => (s.step >= 1 ? String(v) : num(v, String(s.step).split('.')[1]?.length || 2)),
    });
  }
  if (s.type === 'toggle') {
    const l = h('label', 'dbg-toggle');
    const b = h('input');
    b.type = 'checkbox';
    b.checked = !!q.get(s.key);
    b.onchange = () => q.set(s.key, b.checked);
    l.append(b, h('span', null, s.label));
    const row = h('div', 'dbg-knob');
    row.append(l);
    return row;
  }
  const row = h('div', 'dbg-knob');
  const head = h('div', 'dbg-knob-head');
  head.append(h('span', null, s.label));
  row.append(head);
  const sel = h('select');
  for (const o of s.options || []) {
    const op = h('option', null, String(o));
    op.value = String(o);
    sel.append(op);
  }
  sel.value = String(q.get(s.key));
  sel.onchange = () => q.set(s.key, isNaN(+sel.value) ? sel.value : +sel.value);
  row.append(sel);
  return row;
}
