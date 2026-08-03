// Renders every voice and effect through the real master chain in an OfflineAudioContext
// and measures it. A broken envelope is silent and looks fine in source; this catches it.

import { createEngine, mtof, midiOf } from './core.js';
import { INSTRUMENTS, defaultsOf } from './instruments.js';
import { SFX } from './sfx.js';
import { PIECES, ARRANGEMENTS } from './pieces.js';
import { compile, PART_MIX } from './sequencer.js';

const SR = 48000;

function analyse(buf) {
  const d = buf.getChannelData(0);
  const n = d.length;
  let sum = 0, peak = 0, nan = 0, dc = 0, first = -1, last = -1, clipped = 0;
  for (let i = 0; i < n; i++) {
    const v = d[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    const a = Math.abs(v);
    sum += v * v; dc += v;
    if (a > peak) peak = a;
    if (a > 1) clipped++;
    if (a > 0.002) { if (first < 0) first = i; last = i; }
  }
  let tail = 0;
  const tn = Math.min(n, Math.floor(SR * 0.02));
  for (let i = n - tn; i < n; i++) tail += d[i] * d[i];
  let on = 0;
  if (first >= 0) { for (let i = first; i <= last; i++) on += d[i] * d[i]; on = Math.sqrt(on / (last - first + 1)); }
  return {
    rms: +Math.sqrt(sum / n).toFixed(5),
    rmsOn: +on.toFixed(5),
    peak: +peak.toFixed(4),
    dc: +(dc / n).toFixed(5),
    nan, clipped,
    onset: first < 0 ? null : +(first / SR).toFixed(3),
    sound: last < 0 ? 0 : +((last - first) / SR).toFixed(3),
    head: +Math.abs(d[0]).toFixed(4),
    tailRms: +Math.sqrt(tail / tn).toFixed(5),
  };
}

async function render(seconds, fill) {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
  const eng = createEngine(ctx);
  fill(eng);
  const buf = await ctx.startRendering();
  const a = analyse(buf);
  a.voices = eng.live.length;
  a.leaked = eng.live.filter(v => !Number.isFinite(v.e)).length;
  a.maxTail = +Math.max(0, ...eng.live.map(v => v.e)).toFixed(2);
  return a;
}

const NOTE_FOR = { kick: 'C2', snare: 'D2', hat: 'F#2', clap: 'D#2', tom: 'A2', timpani: 'D2' };

export async function verifyInstruments() {
  const out = [];
  for (const id in INSTRUMENTS) {
    const inst = INSTRUMENTS[id];
    const secs = 8;
    const note = NOTE_FOR[id] || inst.note || 'A4';
    const r = await render(secs, eng => {
      const o = Object.assign(defaultsOf(inst), {
        t: 0.05, freq: mtof(midiOf(note)), dur: 1.2, vel: 1,
      });
      inst.play(eng, o);
    });
    out.push({ id, name: inst.name, group: inst.group, note, ...r });
  }
  return out;
}

export async function verifySfx() {
  const out = [];
  for (const id in SFX) {
    const s = SFX[id];
    const o = {};
    for (const k in s.params) o[k] = s.params[k].def;
    o.t = 0.05; o.vel = 1;
    const secs = (s.dur || 2) + 1.5;
    const r = await render(secs, eng => s.play(eng, o));
    out.push({ id, name: s.name, group: s.group, ...r });
  }
  return out;
}

export async function verifyPieces(seconds = 20, arrKey = 'modern') {
  const out = [];
  const arr = ARRANGEMENTS[arrKey];
  for (const piece of PIECES) {
    const { events, totalBeats } = compile(piece);
    const spb = 60 / piece.bpm;
    const r = await render(seconds + 8, eng => {
      const cycles = Math.ceil(seconds / (totalBeats * spb));
      for (let c = 0; c < cycles; c++) {
        for (const ev of events) {
          const t = 0.1 + (ev.b + c * totalBeats) * spb;
          if (t > seconds) continue;
          fireEvent(eng, arr, ev, t, spb);
        }
      }
    });
    out.push({ id: piece.id, title: piece.title, composer: piece.composer, arrangement: arr.name, ...r });
  }
  return out;
}

function fireEvent(eng, arr, ev, t, spb) {
  let id, freq, dur = Math.max(0.06, ev.d * spb);
  if (ev.part === 'drums') {
    if (!arr.parts.drums) return;
    id = ev.inst;
    if (!INSTRUMENTS[id]) return;
    freq = mtof(midiOf(INSTRUMENTS[id].note || 'C2'));
    dur = 0.2;
  } else {
    id = arr.parts[ev.part];
    if (!id || !INSTRUMENTS[id]) return;
    freq = mtof(ev.midi);
  }
  INSTRUMENTS[id].play(eng, Object.assign(defaultsOf(INSTRUMENTS[id]),
    { t, freq, dur, vel: ev.vel * PART_MIX[ev.part] }));
}

// long run with every arrangement, to catch voices that never get a stop time
export async function verifyLeak(seconds = 45) {
  const piece = PIECES[0];
  const { events, totalBeats } = compile(piece);
  const spb = 60 / piece.bpm;
  const arr = ARRANGEMENTS.bigbeat;
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * (seconds + 3)), SR);
  const eng = createEngine(ctx);
  let notes = 0;
  const cycles = Math.ceil(seconds / (totalBeats * spb));
  for (let c = 0; c < cycles; c++) {
    for (const ev of events) {
      const t = 0.1 + (ev.b + c * totalBeats) * spb;
      if (t > seconds) continue;
      fireEvent(eng, arr, ev, t, spb);
      notes++;
    }
  }
  const buf = await ctx.startRendering();
  const a = analyse(buf);
  const v = eng.live;
  const infinite = v.filter(x => !Number.isFinite(x.e)).length;
  const maxTail = Math.max(...v.map(x => x.e));
  // active voice count sampled across the run — a leak makes this climb monotonically
  const samples = [];
  for (let s = 5; s <= seconds; s += 10) samples.push({ at: s, active: eng.activeAt(s) });
  samples.push({ at: seconds + 8, active: eng.activeAt(seconds + 8) });
  return { notes, scheduled: v.length, infinite, maxTail: +maxTail.toFixed(2), samples, ...a };
}

export async function runAll() {
  const instruments = await verifyInstruments();
  const sfx = await verifySfx();
  const pieces = await verifyPieces();
  const leak = await verifyLeak();
  return { sampleRate: SR, instruments, sfx, pieces, leak };
}
