// KITEHAWK SFX bench. Play a sound, tune it, say what you think of it, drop it in a bucket, and
// copy the result back. The defaults Aaron lands on here are the ones that ship (SFX.md).
//
// Two kinds of card:
//   one-shot   ▶ Play        fires and ends
//   sustained  ● Hold        starts and keeps running; the sliders drive the live source, which is
//                            the only way to tell whether a rotary engine is any good

import { createAudioEngine, SFX, SFX_IDS, SRC, SRC_IDS, defaults } from '../../../js/audio/registry.js';
import { el, paramPanel, toast } from './ui.js';
import { BUCKETS, BUCKET_LABEL, load, save, reset, changed } from './triage.js';

const AC = window.AudioContext || window.webkitAudioContext;
const ctx = new AC({ latencyHint: 'interactive' });
const eng = createAudioEngine(ctx);
eng.sources.setListener(0, 0, 300);

const store = {};
for (const id in SFX) store[id] = defaults(SFX[id]);
for (const id in SRC) store[id] = defaults(SRC[id]);
const state = load();
const held = {};        // id -> live handle

const gate = document.getElementById('gate');
document.getElementById('gbtn').addEventListener('click', async () => {
  try { await ctx.resume(); } catch {}
  const s = ctx.createBufferSource();
  s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  s.connect(ctx.destination); s.start();
  gate.classList.add('gone');
  toast('Audio running at ' + Math.round(ctx.sampleRate / 100) / 10 + ' kHz');
});

async function ensure() { if (ctx.state !== 'running') { try { await ctx.resume(); } catch {} } }

function play(id) {
  ensure().then(() => SFX[id].play(eng, Object.assign({}, store[id], { t: ctx.currentTime + 0.02, vel: 1 })));
}

function toggleHold(id, btn) {
  if (held[id]) {
    held[id].stop(0.35);
    delete held[id];
    btn.classList.remove('on');
    btn.textContent = '●  Hold';
    return;
  }
  ensure().then(() => {
    const h = eng.source(id, Object.assign({}, store[id], { x: 0, y: 0 }));
    if (!h.real) { toast('Pool is full — release something'); return; }
    held[id] = h;
    btn.classList.add('on');
    btn.textContent = '■  Running';
  });
}

// A source only proves itself moving. 700 wu/s is 105 m/s — a real closing pass.
function flyby(id) {
  ensure().then(() => {
    const h = eng.source(id, Object.assign({}, store[id], { x: 0, y: -2200, vy: 700, priority: 9 }));
    if (!h.real) { toast('Pool is full'); return; }
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      if (t > 6.3 || !h.alive) { h.stop(0.3); return; }
      h.at(0, -2200 + 700 * t, 0, 700);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

const bench = document.getElementById('bench');
const tally = document.getElementById('tally');

function noteFields(c, id, spec) {
  const st = state[id];
  const nameRow = el('label', 'field');
  nameRow.append(el('span', null, 'Call it instead'));
  const nameIn = el('input');
  nameIn.type = 'text'; nameIn.placeholder = spec.name; nameIn.value = st.as || '';
  nameIn.addEventListener('input', () => { st.as = nameIn.value.trim(); save(state); });
  nameRow.append(nameIn);

  const noteRow = el('label', 'field');
  noteRow.append(el('span', null, 'Notes'));
  const note = el('textarea');
  note.rows = 3;
  note.placeholder = 'what it actually sounds like, what it could be used for…';
  note.value = st.note || '';
  note.addEventListener('input', () => { st.note = note.value; save(state); });
  noteRow.append(note);
  return [nameRow, noteRow];
}

function mark(c, id, spec) {
  c.classList.toggle('tweaked', Object.keys(changed(spec, store[id])).length > 0);
}

function card(id, spec, sustained) {
  const st = state[id];
  const c = el('div', 'sfx' + (sustained ? ' src' : ''));

  const head = el('div', 'sfxhead');
  const title = el('h3', null, spec.name);
  if (st && st.as) title.append(el('em', 'renamed', '→ ' + st.as));
  head.append(title, el('span', 'grp', spec.group));
  c.append(head);
  if (spec.about) c.append(el('p', 'about', spec.about));

  if (sustained) {
    const row = el('div', 'srcbtns');
    const hold = el('button', 'hold', '●  Hold');
    hold.addEventListener('click', () => toggleHold(id, hold));
    const fly = el('button', 'fly', '↗  Flyby');
    fly.addEventListener('click', () => flyby(id));
    row.append(hold, fly);
    c.append(row);
  } else {
    const go = el('button', 'go', '▶  Play');
    go.addEventListener('click', () => play(id));
    c.append(go);
  }

  if (st) {
    const verdict = el('div', 'verdict');
    for (const b of BUCKETS) {
      const btn = el('button', 'v v-' + b + (st.bucket === b ? ' on' : ''), BUCKET_LABEL[b]);
      btn.addEventListener('click', () => { st.bucket = b; save(state); build(); toast(`${spec.name} → ${BUCKET_LABEL[b]}`); });
      verdict.append(btn);
    }
    c.append(verdict);
  }

  const more = el('button', 'more', 'notes & settings');
  more.addEventListener('click', () => c.classList.toggle('open'));
  c.append(more);

  const body = el('div', 'params');
  if (st) body.append(...noteFields(c, id, spec));
  body.append(paramPanel(spec.params, store[id], (k, v) => {
    store[id][k] = v;
    if (held[id]) held[id].set({ [k]: v });   // live, which is the entire point for a rotary
    mark(c, id, spec);
  }));
  const back = el('button', 'mini', 'settings back to default');
  back.addEventListener('click', () => {
    Object.assign(store[id], defaults(spec));
    if (held[id]) held[id].set(store[id]);
    build();
  });
  body.append(back);
  c.append(body);
  mark(c, id, spec);
  return c;
}

function build() {
  const open = new Set([...bench.querySelectorAll('.bucket:not(.shut)')].map(s => s.dataset.b));
  const wasBuilt = bench.dataset.built;
  bench.innerHTML = '';

  const sec = el('section', 'bucket b-src');
  sec.dataset.b = 'src';
  if (wasBuilt && !open.has('src')) sec.classList.add('shut');
  const sh = el('button', 'buckethdr');
  sh.append(el('b', null, 'Continuous — hold and drive'), el('i', null, String(SRC_IDS.length)));
  sh.addEventListener('click', () => sec.classList.toggle('shut'));
  sec.append(sh);
  const sgrid = el('div', 'sfxgrid');
  for (const id of SRC_IDS) sgrid.append(card(id, SRC[id], true));
  sec.append(sgrid);
  bench.append(sec);

  for (const b of BUCKETS) {
    const ids = SFX_IDS.filter(id => state[id].bucket === b);
    const s = el('section', 'bucket b-' + b);
    s.dataset.b = b;
    if (wasBuilt ? !open.has(b) : b === 'bad') s.classList.add('shut');
    const h = el('button', 'buckethdr');
    h.append(el('b', null, BUCKET_LABEL[b]), el('i', null, String(ids.length)));
    h.addEventListener('click', () => s.classList.toggle('shut'));
    s.append(h);
    const grid = el('div', 'sfxgrid');
    if (!ids.length) grid.append(el('p', 'empty', 'nothing here'));
    for (const id of ids) grid.append(card(id, SFX[id], false));
    s.append(grid);
    bench.append(s);
  }
  bench.dataset.built = '1';
  tally.textContent = SRC_IDS.length + ' continuous · ' + BUCKETS.map(b =>
    `${SFX_IDS.filter(i => state[i].bucket === b).length} ${BUCKET_LABEL[b].toLowerCase()}`).join(' · ');
}

// The report is meant to be pasted straight back. The prose half is for reading; the DEFAULTS
// block at the end is machine-applicable, so tuning does not get lost in translation.
function block(id, spec, st) {
  const lines = [`${spec.name}${st && st.as ? `   → rename: ${st.as}` : ''}`, `  id: ${id}   group: ${spec.group}`];
  const tweaks = changed(spec, store[id]);
  const keys = Object.keys(tweaks);
  if (keys.length) lines.push('  settings: ' + keys.map(k => `${k}=${tweaks[k]}`).join(', '));
  if (st && st.note) lines.push('  notes: ' + st.note);
  return lines.join('\n');
}

function report(only = 'keep') {
  const parts = [];
  const tweaked = {};

  if (only === 'keep' || only === 'all') {
    parts.push('CONTINUOUS SOURCES (' + SRC_IDS.length + ')', '─'.repeat(28), '');
    for (const id of SRC_IDS) {
      parts.push(block(id, SRC[id], state[id]), '');
      const t = changed(SRC[id], store[id]);
      if (Object.keys(t).length) tweaked[id] = t;
    }
  }
  const buckets = only === 'all' ? BUCKETS : [only];
  for (const b of buckets) {
    const ids = SFX_IDS.filter(id => state[id].bucket === b);
    parts.push(`ONE-SHOTS — ${BUCKET_LABEL[b].toLowerCase()} (${ids.length} of ${SFX_IDS.length})`, '─'.repeat(28), '');
    for (const id of ids) {
      parts.push(block(id, SFX[id], state[id]), '');
      const t = changed(SFX[id], store[id]);
      if (Object.keys(t).length) tweaked[id] = t;
    }
  }
  parts.push('');
  parts.push('// paste this into an agent: these are the defaults to ship');
  parts.push('DEFAULTS = ' + JSON.stringify(tweaked, null, 2));
  parts.push('');
  parts.push(BUCKETS.map(b => `${BUCKET_LABEL[b]}: ${SFX_IDS.filter(i => state[i].bucket === b).length}`).join('   '));
  return parts.join('\n');
}

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`${what} copied — paste it back to Claude`); return; } catch {}
  const ta = el('textarea', 'dump');
  ta.value = text;
  document.body.append(ta); ta.select();
  try { document.execCommand('copy'); toast(`${what} copied`); }
  catch { toast('Could not copy — select the text and copy it by hand'); return; }
  ta.remove();
}

document.getElementById('copykeep').addEventListener('click', () => copy(report('keep'), 'Keepers'));
document.getElementById('copyall').addEventListener('click', () => copy(report('all'), 'Everything'));
document.getElementById('stopall').addEventListener('click', () => {
  eng.sources.stopAll(0.2);
  for (const k in held) delete held[k];
  for (const b of document.querySelectorAll('.hold.on')) { b.classList.remove('on'); b.textContent = '●  Hold'; }
  toast('All continuous sources released');
});

let armed = 0;
document.getElementById('resetall').addEventListener('click', () => {
  const now = Date.now();
  if (now - armed > 3000) { armed = now; toast('Press again to discard your verdicts'); return; }
  armed = 0;
  reset();
  Object.assign(state, load());
  build();
  toast('Back to the seeded verdicts');
});

build();

const scope = document.getElementById('scope');
const g2d = scope.getContext('2d');
const rmsEl = document.getElementById('rms');
const pkEl = document.getElementById('pk');
const vEl = document.getElementById('voices');
const buf = new Float32Array(eng.analyser.fftSize);
let peakHold = 0;

function frame() {
  eng.analyser.getFloatTimeDomainData(buf);
  let sum = 0, peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i]; sum += v * v;
    const a = Math.abs(v); if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sum / buf.length);
  peakHold = Math.max(peak, peakHold * 0.93);

  const w = scope.width, h = scope.height;
  g2d.clearRect(0, 0, w, h);
  g2d.strokeStyle = 'rgba(255,255,255,.12)';
  g2d.beginPath(); g2d.moveTo(0, h / 2); g2d.lineTo(w, h / 2); g2d.stroke();
  g2d.strokeStyle = peakHold > 0.99 ? '#e8705a' : '#7cc98d';
  g2d.lineWidth = 1;
  g2d.beginPath();
  const stepX = buf.length / w;
  for (let x = 0; x < w; x++) {
    const v = buf[Math.floor(x * stepX)];
    const y = h / 2 - v * (h / 2 - 1);
    x ? g2d.lineTo(x, y) : g2d.moveTo(x, y);
  }
  g2d.stroke();

  rmsEl.style.width = Math.min(100, rms * 260) + '%';
  pkEl.style.left = Math.min(100, peakHold * 100) + '%';
  vEl.textContent = `${eng.activeAt(ctx.currentTime)} voices · ${eng.sources.live.length}/${eng.sources.cap} held · ${ctx.state}`;
  eng.reap();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__lab = { ctx, eng, SFX, SFX_IDS, SRC, SRC_IDS, store, state, held, report: () => report('keep'), ready: true };
