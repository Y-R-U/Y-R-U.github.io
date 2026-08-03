import { createEngine, mtof, midiOf } from './core.js';
import { INSTRUMENTS, defaultsOf } from './instruments.js';
import { SFX } from './sfx.js';
import { PIECES, ARRANGEMENTS, GROOVES } from './pieces.js';
import { createSequencer } from './sequencer.js';
import { el, paramPanel, paramRow, chipGroup, toast, keyboard } from './ui.js';

const AC = window.AudioContext || window.webkitAudioContext;
const ctx = new AC({ latencyHint: 'interactive' });
const eng = createEngine(ctx);

const store = { inst: {}, sfx: {} };
for (const id in INSTRUMENTS) store.inst[id] = defaultsOf(INSTRUMENTS[id]);
for (const id in SFX) {
  store.sfx[id] = {};
  for (const k in SFX[id].params) store.sfx[id][k] = SFX[id].params[k].def;
}

const seq = createSequencer(eng, id => store.inst[id]);
seq.setPiece(PIECES[0]);
seq.setArrangement(ARRANGEMENTS.modern);

const state = { inst: 'violin', octave: 3, noteLen: 0.9, vel: 0.9, arr: 'modern' };

// ── gate ─────────────────────────────────────────────────────
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

// ── tabs ─────────────────────────────────────────────────────
document.querySelectorAll('#tabs button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
  });
});

// ── player tab ───────────────────────────────────────────────
const playerTab = document.getElementById('tab-player');

function buildPlayer() {
  playerTab.innerHTML = '';

  const cPiece = el('div', 'card');
  cPiece.append(el('h2', null, 'Public-domain pieces'));
  const pieceBtns = [];
  for (const p of PIECES) {
    const b = el('button', 'piece' + (p === seq.piece ? ' on' : ''));
    b.append(el('b', null, p.title), el('s', null, `${p.composer} · ${p.year} · ${p.bpm} bpm`));
    b.addEventListener('click', () => {
      const wasPlaying = seq.playing;
      seq.stop();
      seq.setPiece(p);
      pieceBtns.forEach(x => x.classList.toggle('on', x === b));
      tempo.querySelector('input').value = p.bpm;
      tempo.querySelector('em').textContent = p.bpm + ' bpm';
      grooveSel.value = p.groove;
      drawBars();
      if (wasPlaying) start();
    });
    pieceBtns.push(b);
    cPiece.append(b);
  }
  cPiece.append(el('div', 'hint',
    'These compositions are out of copyright. Only recordings are protected, and none are used here — every note is synthesized from encoded note data.'));
  playerTab.append(cPiece);

  const cArr = el('div', 'card');
  cArr.append(el('h2', null, 'Arrangement'));
  const arrSel = el('select');
  for (const k in ARRANGEMENTS) {
    const o = el('option', null, ARRANGEMENTS[k].name); o.value = k; arrSel.append(o);
  }
  arrSel.value = state.arr;
  arrSel.addEventListener('change', () => {
    state.arr = arrSel.value;
    seq.setArrangement(ARRANGEMENTS[state.arr]);
    buildParts();
  });
  const arrRow = el('div', 'row');
  arrRow.append(el('label', null, 'ensemble'), arrSel);
  cArr.append(arrRow);

  const grid = el('div', 'grid2');
  const tempo = paramRow('tempo', { min: 40, max: 200, step: 1, unit: 'bpm', label: 'tempo' },
    seq.bpm, (k, v) => seq.setBpm(v));
  const trans = paramRow('transpose', { min: -12, max: 12, step: 1, unit: 'st', label: 'transpose' },
    0, (k, v) => { seq.transpose = v; });
  const wet = paramRow('wet', { min: 0, max: 1.6, step: 0.02, label: 'reverb return' },
    0.9, (k, v) => eng.setWet(v));
  const vol = paramRow('master', { min: 0, max: 1.3, step: 0.02, label: 'master' },
    eng.master.gain.value, (k, v) => { eng.master.gain.value = v; });
  grid.append(tempo, trans, wet, vol);
  cArr.append(grid);

  const grooveSel = el('select');
  for (const k in GROOVES) { const o = el('option', null, k); o.value = k; grooveSel.append(o); }
  grooveSel.value = seq.piece.groove;
  grooveSel.addEventListener('change', () => {
    seq.piece.groove = grooveSel.value;
    const wasPlaying = seq.playing;
    seq.stop(); seq.setPiece(seq.piece);
    if (wasPlaying) start();
  });
  const gRow = el('div', 'row');
  gRow.append(el('label', null, 'drum groove'), grooveSel);
  cArr.append(gRow);
  playerTab.append(cArr);

  const cParts = el('div', 'card');
  cParts.append(el('h2', null, 'Parts'));
  const partHost = el('div');
  cParts.append(partHost);
  playerTab.append(cParts);

  function buildParts() {
    partHost.innerHTML = '';
    for (const p of ['melody', 'harmony', 'arp', 'bass', 'drums']) {
      const row = el('div', 'part');
      const mute = el('button', 'mute' + (seq.mutes[p] ? ' off' : ''), p);
      mute.addEventListener('click', () => {
        seq.mutes[p] = !seq.mutes[p];
        mute.classList.toggle('off', seq.mutes[p]);
      });
      const sel = el('select');
      if (p === 'drums') {
        const o = el('option', null, 'kick / snare / hat'); o.value = 'kit'; sel.append(o);
        sel.disabled = true;
      } else {
        const none = el('option', null, '— none —'); none.value = ''; sel.append(none);
        for (const id in INSTRUMENTS) {
          const o = el('option', null, INSTRUMENTS[id].name); o.value = id; sel.append(o);
        }
        sel.value = seq.insts[p] || '';
        sel.addEventListener('change', () => { seq.insts[p] = sel.value || null; });
      }
      const g = el('input'); g.type = 'range'; g.min = 0; g.max = 1.4; g.step = 0.02;
      g.value = seq.gains[p];
      g.addEventListener('input', () => { seq.gains[p] = +g.value; });
      row.append(mute, sel, g);
      partHost.append(row);
    }
  }
  buildParts();

  const cT = el('div', 'card');
  cT.append(el('h2', null, 'Transport'));
  const t = el('div', 'btnrow'); t.id = 'transport';
  const play = el('button', 'btn primary', '▶  Play'); play.id = 'play';
  const barsEl = el('div'); barsEl.id = 'bars';
  const pos = el('div'); pos.id = 'pos'; pos.textContent = 'bar 1';
  play.addEventListener('click', async () => {
    await ensure();
    if (seq.playing) { seq.stop(); play.textContent = '▶  Play'; }
    else { start(); play.textContent = '■  Stop'; }
  });
  t.append(play, barsEl, pos);
  cT.append(t);
  playerTab.append(cT);

  function start() { seq.start(); play.textContent = '■  Stop'; }
  function drawBars() {
    barsEl.innerHTML = '';
    for (let i = 0; i < seq.piece.bars; i++) barsEl.append(el('i'));
  }
  drawBars();

  playerTab._tickUI = () => {
    if (!seq.playing) return;
    const { beat, bar } = seq.position();
    pos.textContent = `bar ${bar + 1} · beat ${(beat % seq.piece.beatsPerBar + 1).toFixed(0)}`;
    barsEl.querySelectorAll('i').forEach((x, i) => x.classList.toggle('on', i === bar));
  };
}
buildPlayer();

// ── instruments tab ──────────────────────────────────────────
const instTab = document.getElementById('tab-inst');
const GROUP_ORDER = ['Bowed', 'Plucked', 'Wind', 'Keys', 'Bass', 'Drums'];

function buildInst() {
  instTab.innerHTML = '';

  const cPick = el('div', 'card');
  cPick.append(el('h2', null, 'Instrument'));
  const items = Object.keys(INSTRUMENTS)
    .map(id => ({ id, name: INSTRUMENTS[id].name, group: INSTRUMENTS[id].group }))
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  const chips = chipGroup(items, state.inst, id => { state.inst = id; refresh(); });
  cPick.append(chips);
  instTab.append(cPick);

  const cPlay = el('div', 'card');
  cPlay.append(el('h2', null, 'Audition'));
  const opts = el('div', 'grid2');
  opts.append(
    paramRow('len', { min: 0.08, max: 4, step: 0.02, unit: 's', label: 'note length' },
      state.noteLen, (k, v) => { state.noteLen = v; }),
    paramRow('vel', { min: 0.1, max: 1.2, step: 0.02, label: 'velocity' },
      state.vel, (k, v) => { state.vel = v; }),
  );
  cPlay.append(opts);

  const octRow = el('div', 'btnrow');
  const octLabel = el('button', 'btn', 'octave ' + state.octave);
  const down = el('button', 'btn', '−');
  const up = el('button', 'btn', '+');
  down.addEventListener('click', () => { state.octave = Math.max(0, state.octave - 1); octLabel.textContent = 'octave ' + state.octave; makeKeys(); });
  up.addEventListener('click', () => { state.octave = Math.min(7, state.octave + 1); octLabel.textContent = 'octave ' + state.octave; makeKeys(); });
  octRow.append(down, octLabel, up);
  cPlay.append(octRow);

  const keyHost = el('div'); keyHost.id = 'keys';
  cPlay.append(keyHost);

  const acts = el('div', 'btnrow');
  acts.style.marginTop = '10px';
  const mk = (label, fn) => { const b = el('button', 'btn', label); b.addEventListener('click', async () => { await ensure(); fn(); }); acts.append(b); };
  mk('Single note', () => hit(midiBase() + 12));
  mk('Major scale', () => seqNotes([0, 2, 4, 5, 7, 9, 11, 12], 0.28));
  mk('Chord', () => { const b = midiBase() + 12; [0, 4, 7, 12].forEach(i => hit(b + i, 0)); });
  mk('Arpeggio', () => seqNotes([0, 4, 7, 12, 7, 4], 0.16));
  mk('Fast run', () => seqNotes([0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0], 0.09));
  cPlay.append(acts);
  instTab.append(cPlay);

  const cParams = el('div', 'card');
  cParams.append(el('h2', null, 'Parameters'));
  const pHost = el('div');
  cParams.append(pHost);
  const reset = el('button', 'btn', 'Reset to defaults');
  reset.addEventListener('click', () => { store.inst[state.inst] = defaultsOf(INSTRUMENTS[state.inst]); refresh(); });
  cParams.append(el('div', 'hint', 'These values are also used by the player, so tweaks here carry over.'));
  cParams.append(reset);
  instTab.append(cParams);

  let kb = null;
  function midiBase() { return (state.octave + 1) * 12; }
  function makeKeys() { kb = keyboard(keyHost, 2, midiBase(), m => { ensure().then(() => hit(m)); }); }

  function hit(midi, delay = 0) {
    const inst = INSTRUMENTS[state.inst];
    const o = Object.assign({}, store.inst[state.inst], {
      t: ctx.currentTime + 0.02 + delay,
      freq: inst.pitched === false ? mtof(midiOf(inst.note)) : mtof(midi),
      dur: state.noteLen, vel: state.vel,
    });
    inst.play(eng, o);
    if (kb) kb.flash(midi);
  }
  function seqNotes(steps, gap) {
    const b = midiBase() + 12;
    steps.forEach((s, i) => hit(b + s, i * gap));
  }

  function refresh() {
    pHost.innerHTML = '';
    pHost.append(paramPanel(INSTRUMENTS[state.inst].params, store.inst[state.inst],
      (k, v) => { store.inst[state.inst][k] = v; }));
    chips.select(state.inst);
  }
  makeKeys();
  refresh();
}
buildInst();

// ── sfx tab ──────────────────────────────────────────────────
const sfxTab = document.getElementById('tab-sfx');

function buildSfx() {
  sfxTab.innerHTML = '';
  const groups = {};
  for (const id in SFX) (groups[SFX[id].group] ||= []).push(id);

  for (const g in groups) {
    sfxTab.append(el('div', 'grouphdr', g));
    const grid = el('div', 'sfxgrid');
    for (const id of groups[g]) {
      const s = SFX[id];
      const card = el('div', 'sfx');
      card.append(el('h3', null, s.name));
      const go = el('button', 'go', '▶  Play');
      go.addEventListener('click', async () => {
        await ensure();
        s.play(eng, Object.assign({}, store.sfx[id], { t: ctx.currentTime + 0.02 }));
      });
      card.append(go);
      const more = el('button', 'more', 'parameters');
      const params = el('div', 'params');
      params.append(paramPanel(s.params, store.sfx[id], (k, v) => { store.sfx[id][k] = v; }));
      more.addEventListener('click', () => card.classList.toggle('open'));
      card.append(more, params);
      grid.append(card);
    }
    sfxTab.append(grid);
  }
}
buildSfx();

// ── meter ────────────────────────────────────────────────────
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

  playerTab._tickUI?.();
  eng.reap();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__audiolab = { ctx, eng, seq, store, INSTRUMENTS, SFX, PIECES, ARRANGEMENTS, ready: true };
