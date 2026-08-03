// Lookahead scheduler: a 25ms timer pushes note events onto the AudioContext clock
// ~150ms ahead, so nothing is ever triggered by the wall clock.

import { midiOf, mtof } from './core.js';
import { INSTRUMENTS, defaultsOf } from './instruments.js';
import { GROOVES, chordTones } from './pieces.js';

const LOOKAHEAD = 0.15;
const TICK_MS = 25;
const PARTS = ['melody', 'harmony', 'arp', 'bass', 'drums'];
export const PART_MIX = { melody: 0.72, harmony: 0.36, arp: 0.44, bass: 0.66, drums: 0.72 };

function voiceChord(chord) {
  let base = midiOf(chord.root);
  while (base < 50) base += 12;
  while (base >= 62) base -= 12;
  return chordTones(chord).map(i => base + i);
}

export function compile(piece) {
  const ev = [];
  const push = (b, part, midi, d, vel, inst) => ev.push({ b, part, midi, d, vel: vel ?? 1, inst });

  for (const e of piece.melody || []) push(e.b, 'melody', midiOf(e.note), e.d, e.vel);
  for (const e of piece.bass || []) push(e.b, 'bass', midiOf(e.note), e.d, e.vel);
  for (const e of piece.arp || []) push(e.b, 'arp', midiOf(e.note), e.d, e.vel);
  for (const c of piece.chords || []) for (const m of voiceChord(c)) push(c.b, 'harmony', m, c.d * 0.95, 0.7);

  const groove = GROOVES[piece.groove] || GROOVES.none;
  const barBeats = piece.beatsPerBar;
  if (groove.hits.length) {
    for (let bar = 0; bar < piece.bars; bar++) {
      for (const h of groove.hits) {
        const b = bar * barBeats + (h.s / 16) * 4;
        if (b >= piece.bars * barBeats) continue;
        push(b, 'drums', null, 0.2, h.v, h.inst);
      }
    }
  }
  ev.sort((a, b) => a.b - b.b);
  return { events: ev, totalBeats: piece.bars * barBeats };
}

export function createSequencer(eng, getParams) {
  const s = {
    piece: null, arrangement: null, bpm: 100, transpose: 0,
    mutes: {}, insts: {}, gains: {},
    playing: false, loop: true,
  };
  let events = [], totalBeats = 4, idx = 0, cycle = 0, startTime = 0, timer = null;

  for (const p of PARTS) { s.mutes[p] = false; s.gains[p] = PART_MIX[p]; }

  const spb = () => 60 / s.bpm;

  s.setPiece = piece => {
    s.piece = piece;
    const c = compile(piece);
    events = c.events; totalBeats = c.totalBeats;
    s.bpm = piece.bpm;
    idx = 0; cycle = 0;
    if (s.playing) startTime = eng.ctx.currentTime + 0.05;
  };

  s.setArrangement = a => {
    s.arrangement = a;
    for (const p of PARTS) {
      if (p === 'drums') s.insts[p] = a.parts.drums ? 'kit' : null;
      else s.insts[p] = a.parts[p];
    }
  };

  s.setBpm = v => {
    if (s.playing) {
      const beat = (eng.ctx.currentTime - startTime) / spb();
      s.bpm = v;
      startTime = eng.ctx.currentTime - beat * spb();
    } else s.bpm = v;
  };

  s.position = () => {
    if (!s.playing) return { beat: 0, bar: 0 };
    const beat = Math.max(0, (eng.ctx.currentTime - startTime) / spb());
    const b = beat % totalBeats;
    return { beat: b, bar: Math.floor(b / (s.piece?.beatsPerBar || 4)), total: totalBeats };
  };

  function fire(ev, t) {
    if (s.mutes[ev.part]) return;
    const vel = ev.vel * s.gains[ev.part];
    if (vel <= 0.001) return;

    if (ev.part === 'drums') {
      if (!s.arrangement?.parts.drums) return;
      const id = ev.inst;
      if (!INSTRUMENTS[id]) return;
      const o = Object.assign(defaultsOf(INSTRUMENTS[id]), getParams(id), { t, vel, dur: 0.2 });
      o.freq = mtof(midiOf(INSTRUMENTS[id].note || 'C2'));
      INSTRUMENTS[id].play(eng, o);
      return;
    }
    const id = s.insts[ev.part];
    if (!id || !INSTRUMENTS[id]) return;
    const inst = INSTRUMENTS[id];
    const o = Object.assign(defaultsOf(inst), getParams(id), {
      t, vel, dur: Math.max(0.06, ev.d * spb()),
      freq: mtof(ev.midi + s.transpose),
    });
    inst.play(eng, o);
  }

  function tick() {
    if (!events.length) return;
    const ahead = eng.ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (guard++ < 400) {
      const ev = events[idx];
      const t = startTime + (ev.b + cycle * totalBeats) * spb();
      if (t > ahead) break;
      if (t >= eng.ctx.currentTime - 0.05) fire(ev, t);
      idx++;
      if (idx >= events.length) {
        idx = 0; cycle++;
        if (!s.loop) { s.stop(); return; }
      }
    }
    eng.reap();
  }

  s.start = () => {
    if (s.playing) return;
    s.playing = true; idx = 0; cycle = 0;
    startTime = eng.ctx.currentTime + 0.08;
    tick();
    timer = setInterval(tick, TICK_MS);
  };

  s.stop = () => {
    s.playing = false;
    clearInterval(timer); timer = null;
  };

  s.toggle = () => (s.playing ? s.stop() : s.start());

  return s;
}
