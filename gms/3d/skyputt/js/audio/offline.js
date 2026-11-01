// SKYPUTT audio — offline renders for testing / the preview page. Each render runs the real master
// chain in an OfflineAudioContext with 4 output channels: 0-1 = final output, 2-3 = the mix
// before the limiter (shows how much headroom the recipe itself leaves).
import { buildGraph } from './graph.js';
import { SFX } from './sfx.js';
import { Roll } from './roll.js';
import { createMusic } from './music.js';

const SR = 48000;
const OAC = () => (typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext)) || null;

function setup(seconds) {
  const C = OAC();
  if (!C) throw new Error('no OfflineAudioContext');
  const oc = new C(4, Math.ceil(seconds * SR), SR);
  oc.destination.channelInterpretation = 'discrete';
  const E = buildGraph(oc, null);
  const merge = oc.createChannelMerger(4), sPost = oc.createChannelSplitter(2), sPre = oc.createChannelSplitter(2);
  E.out.connect(sPost); E.master.connect(sPre);
  sPost.connect(merge, 0, 0); sPost.connect(merge, 1, 1); sPre.connect(merge, 0, 2); sPre.connect(merge, 1, 3);
  merge.connect(oc.destination);
  return { oc, E };
}

export function measure(buf) {
  const res = {};
  for (const [key, chs] of [['post', [0, 1]], ['pre', [2, 3]]]) {
    let pk = 0, sum = 0, n = 0, first = -1, lastI = 0;
    const L = buf.length;
    for (const c of chs) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < L; i++) {
        const a = Math.abs(d[i]);
        if (a > pk) pk = a;
        if (a > 0.001) { if (first < 0 || i < first) first = i; if (i > lastI) lastI = i; }
      }
    }
    // RMS over the active span (first..last sample above -60 dBFS)
    if (first >= 0) for (const c of chs) { const d = buf.getChannelData(c); for (let i = first; i <= lastI; i++) { sum += d[i] * d[i]; n++; } }
    const rms = n ? Math.sqrt(sum / n) : 0;
    const db = x => (x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -Infinity);
    res[key] = { peak: Math.round(pk * 1e4) / 1e4, peakDb: db(pk), rmsDb: db(rms), active: first >= 0 ? Math.round((lastI - first) / SR * 100) / 100 : 0 };
  }
  return res;
}

export async function renderSfx(name, params = {}, seconds = 4.6) {
  const { oc, E } = setup(seconds);
  SFX[name](E, 0.05, params);
  const buf = await oc.startRendering();
  return { name, buf, ...measure(buf) };
}

// a ball rolling at `speed` that decelerates to rest, on one surface
export async function renderRoll(surface, speed = 4, seconds = 3) {
  const { oc, E } = setup(seconds + 0.6);
  const r = new Roll(E), fps = 60;
  for (let i = 0; i <= seconds * fps; i++) {
    const t = i / fps, k = 1 - t / seconds;
    r.update(speed * Math.max(0, k), surface, 0.02 + t);
  }
  r.fadeOut(0.02 + seconds + 0.02);
  const buf = await oc.startRendering();
  return { name: 'roll:' + surface, buf, ...measure(buf) };
}

export async function renderMusic(theme = 'sky', seconds = 40) {
  const { oc, E } = setup(seconds);
  E.music.dry.gain.value = E.music.wet.gain.value = 0.6;
  const m = createMusic(E, { live: false });
  m.start(theme, 0);
  m.tick(seconds);
  const buf = await oc.startRendering();
  return { name: 'music:' + theme, buf, ...measure(buf) };
}
