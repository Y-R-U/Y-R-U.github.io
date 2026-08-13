// The SFX bench: play a sound, tune it, say what you think of it, and drop it in a bucket.
// The music player and the instrument rack were removed after the first listening session —
// the tonal voices were the ones that did not survive it.

import { createEngine } from './core.js';
import { SFX, SFX_IDS } from './sfx.js';
import { el, paramPanel, toast } from './ui.js';
import { BUCKETS, BUCKET_LABEL, load, save, reset, report, reportAll, changed } from './triage.js';

const AC = window.AudioContext || window.webkitAudioContext;
const ctx = new AC({ latencyHint: 'interactive' });
const eng = createEngine(ctx);

const store = {};
for (const id in SFX) {
  store[id] = {};
  for (const k in SFX[id].params) store[id][k] = SFX[id].params[k].def;
}
const state = load();

const gate = document.getElementById('gate');
document.getElementById('gbtn').addEventListener('click', async () => {
  try { await ctx.resume(); } catch {}
  // a silent tick unlocks iOS even when resume() alone does not
  const s = ctx.createBufferSource();
  s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  s.connect(ctx.destination); s.start();
  gate.classList.add('gone');
  toast('Audio running at ' + Math.round(ctx.sampleRate / 100) / 10 + ' kHz');
});

async function ensure() {
  if (ctx.state !== 'running') { try { await ctx.resume(); } catch {} }
}

function play(id) {
  ensure().then(() => SFX[id].play(eng, Object.assign({}, store[id], { t: ctx.currentTime + 0.02 })));
}

const bench = document.getElementById('bench');
const tally = document.getElementById('tally');

function card(id) {
  const s = SFX[id], st = state[id];
  const c = el('div', 'sfx');

  const head = el('div', 'sfxhead');
  const title = el('h3', null, s.name);
  if (st.as) title.append(el('em', 'renamed', '→ ' + st.as));
  head.append(title, el('span', 'grp', s.group));
  c.append(head);

  const go = el('button', 'go', '▶  Play');
  go.addEventListener('click', () => play(id));
  c.append(go);

  const verdict = el('div', 'verdict');
  for (const b of BUCKETS) {
    const btn = el('button', 'v v-' + b + (st.bucket === b ? ' on' : ''), BUCKET_LABEL[b]);
    btn.addEventListener('click', () => {
      st.bucket = b;
      save(state);
      build();
      toast(`${s.name} → ${BUCKET_LABEL[b]}`);
    });
    verdict.append(btn);
  }
  c.append(verdict);

  const more = el('button', 'more', 'notes & settings');
  more.addEventListener('click', () => c.classList.toggle('open'));
  c.append(more);

  const body = el('div', 'params');

  const nameRow = el('label', 'field');
  nameRow.append(el('span', null, 'Call it instead'));
  const nameIn = el('input');
  nameIn.type = 'text';
  nameIn.placeholder = s.name;
  nameIn.value = st.as || '';
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

  body.append(nameRow, noteRow);
  body.append(paramPanel(s.params, store[id], (k, v) => { store[id][k] = v; mark(c, id); }));

  const back = el('button', 'mini', 'settings back to default');
  back.addEventListener('click', () => {
    for (const k in s.params) store[id][k] = s.params[k].def;
    build();
  });
  body.append(back);

  c.append(body);
  mark(c, id);
  return c;
}

// A card whose knobs have been moved is worth spotting: those settings travel in the report.
function mark(c, id) {
  c.classList.toggle('tweaked', Object.keys(changed(id, store[id])).length > 0);
}

function build() {
  const open = new Set([...bench.querySelectorAll('.bucket:not(.shut)')].map(s => s.dataset.b));
  bench.innerHTML = '';
  for (const b of BUCKETS) {
    const ids = SFX_IDS.filter(id => state[id].bucket === b);
    const sec = el('section', 'bucket b-' + b);
    sec.dataset.b = b;
    // Rejected starts shut: it is the pile you asked to stop looking at.
    if (bench.dataset.built ? !open.has(b) : b === 'bad') sec.classList.add('shut');

    const h = el('button', 'buckethdr');
    h.append(el('b', null, BUCKET_LABEL[b]), el('i', null, String(ids.length)));
    h.addEventListener('click', () => sec.classList.toggle('shut'));
    sec.append(h);

    const grid = el('div', 'sfxgrid');
    if (!ids.length) grid.append(el('p', 'empty', 'nothing here'));
    for (const id of ids) grid.append(card(id));
    sec.append(grid);
    bench.append(sec);
  }
  bench.dataset.built = '1';
  tally.textContent = BUCKETS.map(b =>
    `${SFX_IDS.filter(i => state[i].bucket === b).length} ${BUCKET_LABEL[b].toLowerCase()}`).join(' · ');
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied — paste it back to Claude`);
    return;
  } catch {}
  // the clipboard API is blocked on insecure origins and inside some in-app browsers
  const ta = el('textarea', 'dump');
  ta.value = text;
  document.body.append(ta);
  ta.select();
  try { document.execCommand('copy'); toast(`${what} copied`); }
  catch { toast('Could not copy — select the text and copy it by hand'); return; }
  ta.remove();
}

document.getElementById('copykeep').addEventListener('click', () => copy(report(state, store, 'keep'), 'Keepers'));
document.getElementById('copyall').addEventListener('click', () => copy(reportAll(state, store), 'Everything'));

// Nothing here uses confirm(); a second press inside three seconds is the ask.
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
  vEl.textContent = `${eng.activeAt(ctx.currentTime)} voices · ${ctx.state}`;
  eng.reap();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__lab = { ctx, eng, SFX, SFX_IDS, store, state, report: () => report(state, store, 'keep'), ready: true };
