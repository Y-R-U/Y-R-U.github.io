// The detached mini-HUD: a small always-on-top panel that lives outside #wf-dev and therefore
// stays up while the game runs and the hub is closed.
//
// This is the answer to the paused-loop problem. The hub is a full-screen opaque overlay and it
// stops the game loop, so a perf graph, a live trace and an input readout are all useless inside
// it — they are exactly the things you need while playing. They live out here instead.

import { state, traceLine } from './core.js';
import { ensureCSS, h } from './ui.js';
import { handles } from './game.js';

const KEY = 'wf.dev.debug.hud';
export const LANES = [
  { id: 'perf', label: 'Perf' },
  { id: 'pos', label: 'Position' },
  { id: 'trace', label: 'Trace' },
  { id: 'log', label: 'Console' },
  { id: 'input', label: 'Input' },
];

let el = null, raf = 0, ctxRef = null, conf = null;

function load() {
  try { return { lanes: ['perf', 'trace'], x: null, y: null, min: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { lanes: ['perf', 'trace'], x: null, y: null, min: false }; }
}
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(conf)); } catch { /* private mode */ } };

export const config = () => (conf ||= load());
export const visible = () => !!el;

export function show(ctx, on = true) {
  ctxRef = ctx || ctxRef;
  if (!on) return hide();
  if (el) return el;
  ensureCSS();
  conf = config();
  el = h('div', '');
  el.id = 'wf-dbg-hud';
  el.innerHTML = `<header><b>WF DEBUG</b><button data-a="min" title="Collapse">–</button>
    <button data-a="hub" title="Open the Debug tab">⛶</button>
    <button data-a="x" title="Hide">✕</button></header><div class="wfdbg-body"></div>`;
  el.style.left = `${conf.x ?? Math.max(8, innerWidth - 262)}px`;
  el.style.top = `${conf.y ?? 8}px`;
  el.classList.toggle('wfdbg-min', !!conf.min);
  document.body.append(el);
  el.querySelector('[data-a=x]').onclick = () => hide();
  el.querySelector('[data-a=min]').onclick = () => {
    conf.min = !conf.min;
    el.classList.toggle('wfdbg-min', conf.min);
    store();
  };
  el.querySelector('[data-a=hub]').onclick = () => window.__wfDev?.open?.();
  drag(el.querySelector('header'));
  tick();
  return el;
}

export function hide() {
  cancelAnimationFrame(raf);
  raf = 0;
  el?.remove();
  el = null;
}

export function lane(id, on) {
  conf = config();
  const set = new Set(conf.lanes);
  if (on === undefined) on = !set.has(id);
  if (on) set.add(id); else set.delete(id);
  conf.lanes = LANES.filter(l => set.has(l.id)).map(l => l.id);
  store();
  return conf.lanes.includes(id);
}

export const laneOn = id => config().lanes.includes(id);

function drag(bar) {
  bar.onpointerdown = e => {
    if (e.target.tagName === 'BUTTON') return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = ev => {
      conf.x = Math.max(0, Math.min(innerWidth - 40, ev.clientX - dx));
      conf.y = Math.max(0, Math.min(innerHeight - 24, ev.clientY - dy));
      el.style.left = `${conf.x}px`;
      el.style.top = `${conf.y}px`;
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); store(); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    e.preventDefault();
  };
}

// Its own rAF, deliberately: it has to keep repainting while the game loop is stopped so the
// numbers on screen are the last real ones and not a frozen half-paint.
function tick() {
  raf = requestAnimationFrame(tick);
  if (!el || conf.min) return;
  const body = el.querySelector('.wfdbg-body');
  const g = handles(ctxRef);
  const parts = [];
  for (const id of conf.lanes) parts.push(LANE[id]?.(g) || '');
  const html = parts.filter(Boolean).join('');
  if (body.__last !== html) { body.innerHTML = html; body.__last = html; }
}

const grade = (v, budget) => (v > budget ? 'wfdbg-bad' : v > budget * 0.8 ? 'wfdbg-warn' : 'wfdbg-good');
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const LANE = {
  perf(g) {
    const s = g.stats?.read?.();
    if (!s) return lanel('Perf', '<span class="wfdbg-line">no engine</span>');
    return lanel('Perf', `<div class="wfdbg-line"><span class="${grade(1000 / Math.max(1, s.fps), 16.7)}">${s.fps.toFixed(0)} fps</span>
      · ${s.verdict} · dpr ${s.dpr.toFixed(2)}</div>
      <div class="wfdbg-line"><span class="${grade(s.calls, 150)}">${s.calls} calls</span>
      · <span class="${grade(s.tris, 350e3)}">${(s.tris / 1000).toFixed(0)}k tris</span>
      · ${s.texMB ? s.texMB.toFixed(0) : '—'}MB</div>
      <div class="wfdbg-line">cpu ${s.cpuP95.toFixed(1)} · gpu ${s.gpuSupported ? s.gpuP95.toFixed(1) : '—'} ms p95</div>`);
  },
  pos(g) {
    const p = g.player?.pos;
    if (!p) return lanel('Position', '<span class="wfdbg-line">no player</span>');
    return lanel('Position', `<div class="wfdbg-line">x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}</div>
      <div class="wfdbg-line">yaw ${(g.player.yaw ?? 0).toFixed(2)} · indoor ${(g.player.indoor ?? 0).toFixed(2)}</div>`);
  },
  trace() {
    const rows = state.trace.tail(6).reverse();
    if (!rows.length) return lanel('Trace', '<span class="wfdbg-line">nothing yet</span>');
    return lanel(`Trace ·${state.trace.size}`, rows.map(e => {
      const l = traceLine(e, state.installedAt);
      return `<div class="wfdbg-line">${l.time} <b>${esc(l.kind)}</b> ${esc(l.id)} ${esc(l.text)}</div>`;
    }).join(''));
  },
  log() {
    const rows = state.log.tail(5).reverse();
    if (!rows.length) return lanel('Console', '<span class="wfdbg-line">quiet</span>');
    return lanel(`Console ·${state.counts.error}e ${state.counts.warn}w`, rows.map(e =>
      `<div class="wfdbg-line ${e.level === 'error' ? 'wfdbg-bad' : e.level === 'warn' ? 'wfdbg-warn' : ''}">${esc(e.text).slice(0, 90)}</div>`).join(''));
  },
  input() {
    const i = state.lastInput;
    if (!i) return lanel('Input', '<span class="wfdbg-line">no reads yet</span>');
    return lanel('Input', `<div class="wfdbg-line">move ${i.mx.toFixed(2)},${i.my.toFixed(2)} look ${i.lx.toFixed(0)},${i.ly.toFixed(0)}</div>
      <div class="wfdbg-line">${i.stick ? 'stick ' : ''}${i.look ? 'look ' : ''}${i.sprint ? 'sprint ' : ''}${i.attack ? 'ATTACK ' : ''}${i.pointers} ptr</div>
      <div class="wfdbg-line">${esc(i.keys.join(' ')) || '—'}</div>`);
  },
};

const lanel = (title, inner) => `<div class="wfdbg-lane"><b>${title}</b>${inner}</div>`;
