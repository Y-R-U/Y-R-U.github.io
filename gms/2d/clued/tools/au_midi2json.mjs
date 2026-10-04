#!/usr/bin/env node
// Standard MIDI file -> Clued note JSON  { bpm, notes: [[beat, midi, beats, vel], ...] }
//   node tools/au_midi2json.mjs in.mid out.json [--from BEATS] [--beats N] [--transpose N] [--skip-tracks 1,2] [--title T]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function parseMidi(buf) {
  const u8 = new Uint8Array(buf);
  let p = 0;
  const str = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8[p++]); return s; };
  const u32 = () => (u8[p++] << 24 | u8[p++] << 16 | u8[p++] << 8 | u8[p++]) >>> 0;
  const u16 = () => (u8[p++] << 8) | u8[p++];
  const vlq = () => { let v = 0, b; do { b = u8[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  if (str(4) !== 'MThd') throw new Error('not a MIDI file');
  const hlen = u32(); const format = u16(), ntrk = u16(), division = u16(); p += hlen - 6;
  if (division & 0x8000) throw new Error('SMPTE time division unsupported');
  const tracks = [], tempos = [];
  let timeSig = null;
  for (let t = 0; t < ntrk && p < u8.length; t++) {
    const id = str(4), len = u32(), end = p + len;
    if (id !== 'MTrk') { p = end; continue; }
    let tick = 0, status = 0, name = '';
    const on = new Map(), notes = [];
    while (p < end) {
      tick += vlq();
      let b = u8[p];
      if (b & 0x80) { status = b; p++; } else if (!status) { p++; continue; }
      const type = status & 0xf0, ch = status & 0x0f;
      if (status === 0xff) {
        const mt = u8[p++], ml = vlq(), d = u8.slice(p, p + ml); p += ml;
        if (mt === 0x51) tempos.push({ tick, uspq: (d[0] << 16) | (d[1] << 8) | d[2] });
        else if (mt === 0x03) name = String.fromCharCode(...d);
        else if (mt === 0x58 && !timeSig) timeSig = [d[0], 1 << d[1]];
        status = 0;
      } else if (status === 0xf0 || status === 0xf7) { p += vlq(); status = 0; }
      else if (type === 0x90 || type === 0x80) {
        const n = u8[p++], v = u8[p++], k = ch * 128 + n;
        if (type === 0x90 && v > 0) { if (!on.has(k)) on.set(k, []); on.get(k).push([tick, v]); }
        else { const st = on.get(k); if (st && st.length) { const [t0, v0] = st.shift(); notes.push({ t0, t1: tick, n, v: v0, ch }); } }
      } else if (type === 0xc0 || type === 0xd0) p += 1;
      else p += 2;
    }
    p = end;
    tracks.push({ name, notes });
  }
  tempos.sort((a, b) => a.tick - b.tick);
  return { format, division, tracks, tempos, timeSig };
}

// convert to beats at the first tempo, folding any later tempo changes into time
export function toPiece(midi, { from = 0, beats = Infinity, transpose = 0, skipTracks = [], minVel = 1, quant = 48 } = {}) {
  const ppq = midi.division;
  const tempos = midi.tempos.length ? midi.tempos : [{ tick: 0, uspq: 500000 }];
  const base = tempos[0].uspq;
  const secAt = (tick) => {
    let s = 0, last = 0, us = tempos[0].tick <= 0 ? tempos[0].uspq : 500000;
    for (const tp of tempos) { if (tp.tick >= tick) break; s += ((tp.tick - last) / ppq) * us; last = tp.tick; us = tp.uspq; }
    return (s + ((tick - last) / ppq) * us) / 1e6;
  };
  const beatAt = (tick) => secAt(tick) / (base / 1e6);
  const notes = [];
  midi.tracks.forEach((tr, i) => {
    if (skipTracks.includes(i)) return;
    for (const nt of tr.notes) {
      if (nt.ch === 9 || nt.v < minVel) continue;
      const b0 = beatAt(nt.t0), b1 = beatAt(nt.t1);
      if (b0 < from - 1e-6 || b0 >= from + beats - 1e-6) continue;
      const q = (x) => Math.round(x * quant) / quant;
      notes.push([q(b0 - from), nt.n + transpose, Math.max(1 / quant, q(b1 - b0)), nt.v]);
    }
  });
  notes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { bpm: Math.round((60e6 / base) * 100) / 100, ts: midi.timeSig || undefined, notes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [inp, out, ...rest] = process.argv.slice(2);
  const opt = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
  const piece = toPiece(parseMidi(fs.readFileSync(inp)), {
    from: +opt('from', 0), beats: +opt('beats', Infinity), transpose: +opt('transpose', 0),
    skipTracks: (opt('skip-tracks', '') || '').split(',').filter(Boolean).map(Number),
  });
  if (opt('title')) piece.title = opt('title');
  fs.writeFileSync(out, JSON.stringify(piece));
  console.log(`${piece.notes.length} notes, bpm ${piece.bpm}`);
}
