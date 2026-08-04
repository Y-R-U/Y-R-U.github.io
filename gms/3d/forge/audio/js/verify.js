// Renders every voice and effect through the real master chain in an OfflineAudioContext
// and measures it. A broken envelope is silent and looks fine in source; this catches it.

import { createEngine } from './core.js';
import { SFX } from './sfx.js';

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

export async function runAll() { return { sfx: await verifySfx() }; }
