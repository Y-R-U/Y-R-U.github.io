// SKYPUTT audio — generative ambient music. One player per theme: `sky` (launch), `spooky`
// (Spooky Hollow), `frost` (Frost Fair), `candy` (Candy Land, a 3/4 waltz), `volcano` (Volcano Forge,
// slow drums and anvils), `reef` (Sunken Reef, calm and watery) and `star` (Star Station, spacey synth pads + arpeggio)
// and `jungle` (Jungle Temple, marimba + kalimba over soft hand drums, bird calls). Themes differ in harmony, pad type, plucked/struck
// voices and occasional "extras" (theremin, owl, sleigh bells, fire crackle).
// Nothing loops verbatim: chords walk a Markov graph, the key drifts between three centres,
// arpeggio phrases (up / down / wander / sparse / bells / rest) are picked by a slowly
// wandering density, and every note's timing and velocity is humanised.
//
// Voices: warm detuned-saw pads through one shared, slowly breathing lowpass; Karplus-Strong
// harp plucks (pre-rendered per few semitones, repitched by playbackRate); soft FM bells; a
// quiet airy noise bed. Arps feed a ping-pong delay; everything feeds the shared reverb.
import { clamp, rnd, pick, mtof, shared, noiseBuffer, holdParam } from './core.js';

const SKY = {
  id: 'sky', bpm: 66,
  keys: [0, 0, 0, -5, -2],                         // D major home, A major and C major excursions
  start: 'I',
  chords: {
    I:     { pad: [50, 57, 64, 66], root: 38, arp: [62, 64, 66, 69, 73, 74, 76, 78, 81], next: ['IV', 'vi', 'ii', 'Vsus', 'IVlyd', 'iii'] },
    IV:    { pad: [55, 59, 62, 66], root: 43, arp: [67, 69, 71, 74, 78, 79, 83], next: ['I', 'vi', 'Vsus', 'iii', 'ii'] },
    vi:    { pad: [57, 61, 62, 66], root: 47, arp: [66, 69, 71, 73, 74, 78, 81], next: ['IV', 'ii', 'I', 'IVlyd'] },
    ii:    { pad: [55, 59, 62, 66], root: 40, arp: [64, 66, 67, 71, 74, 76, 79], next: ['Vsus', 'I', 'IV', 'vi'] },
    Vsus:  { pad: [57, 59, 62, 64], root: 45, arp: [64, 69, 71, 74, 76, 81, 83], next: ['I', 'vi', 'IV'] },
    iii:   { pad: [57, 61, 64, 66], root: 42, arp: [66, 69, 73, 76, 78, 81], next: ['vi', 'IV', 'ii'] },
    IVlyd: { pad: [55, 59, 61, 66], root: 43, arp: [67, 71, 73, 74, 78, 79, 85], next: ['I', 'vi', 'iii'] },
  },
  level: { pad: 0.03, root: 0.036, air: 0.014 },
  pad: { type: 'saw', cut: 900, lfo: 320, att: 3.2, rel: 4.5 },
  air: { f: 1500, q: 0.5, lfo: 700 },
  voices: {
    harp: { kind: 'ks', gain: 0.1 },
    bell: { kind: 'fm', ratio: 3, index: 0.9, dur: 2.6, oct: 12, gain: 0.032 },
  },
  mains: ['harp'], bellVoice: 'bell', extras: [],
};

// Playful-eerie: E minor with a Phrygian bII and a raised-leading-tone V7, music box and
// pizzicato over a soft organ; now and then a theremin glide or a distant owl.
const SPOOKY = {
  id: 'spooky', bpm: 76,
  keys: [0, 0, 0, -2, 3],                          // E minor home, D minor and G minor excursions
  start: 'i',
  chords: {
    i:    { pad: [52, 59, 64, 66], root: 40, arp: [64, 67, 71, 72, 74, 76, 79], next: ['iv', 'VI', 'bII', 'iiø', 'V7'] },
    iv:   { pad: [57, 60, 64, 66], root: 45, arp: [64, 69, 72, 76, 78, 81], next: ['i', 'V7', 'iiø', 'VI'] },
    VI:   { pad: [55, 59, 60, 64], root: 48, arp: [67, 71, 72, 76, 79], next: ['iiø', 'iv', 'V7', 'i'] },
    V7:   { pad: [54, 57, 59, 63], root: 47, arp: [63, 66, 69, 71, 75, 78], next: ['i', 'VI', 'iv'] },
    'iiø': { pad: [54, 57, 60, 64], root: 42, arp: [66, 69, 72, 76, 78], next: ['V7', 'i', 'bII'] },
    bII:  { pad: [53, 57, 60, 64], root: 41, arp: [65, 69, 72, 76, 77], next: ['i', 'V7', 'iv'] },
  },
  level: { pad: 0.034, root: 0.03, air: 0.011 },
  pad: { type: 'organ', cut: 1300, lfo: 250, att: 2.6, rel: 4 },
  air: { f: 520, q: 0.7, lfo: 260 },
  voices: {
    musicbox: { kind: 'fm', ratio: 4, index: 0.55, dur: 1.5, oct: 12, gain: 0.05 },
    pizz: { kind: 'ks', short: true, gain: 0.16, oct: -12 },
    bell: { kind: 'fm', ratio: 3.5, index: 1.1, dur: 2.2, oct: 12, gain: 0.026 },
  },
  mains: ['musicbox', 'pizz', 'pizz'], bellVoice: 'bell',
  extras: [['theremin', 0.3], ['owl', 0.16]],
};

// Warm and cosy: F major with carol-style ii-V and a minor iv, celesta / glockenspiel / harp
// over soft strings; subtle sleigh bells now and then and a faint fireside crackle.
const FROST = {
  id: 'frost', bpm: 72,
  keys: [0, 0, 0, 2, -3],                          // F major home, G major and D major excursions
  start: 'I',
  chords: {
    I:   { pad: [53, 60, 64, 67], root: 41, arp: [65, 67, 69, 72, 76, 77, 79, 81], next: ['IV', 'vi', 'ii', 'V', 'iii'] },
    IV:  { pad: [58, 62, 65, 69], root: 46, arp: [70, 72, 74, 77, 81, 82], next: ['I', 'ivm', 'V', 'ii'] },
    V:   { pad: [55, 60, 64, 70], root: 48, arp: [67, 70, 72, 76, 79, 84], next: ['I', 'vi', 'IV'] },
    vi:  { pad: [57, 60, 62, 65], root: 50, arp: [69, 72, 74, 77, 81], next: ['ii', 'IV', 'V'] },
    ii:  { pad: [55, 58, 62, 65], root: 43, arp: [67, 70, 74, 77, 79], next: ['V', 'IV', 'I'] },
    iii: { pad: [57, 60, 64, 67], root: 45, arp: [69, 72, 76, 79, 81], next: ['vi', 'IV'] },
    ivm: { pad: [58, 61, 65, 67], root: 46, arp: [70, 73, 77, 79, 82], next: ['I'] },
  },
  level: { pad: 0.028, root: 0.034, air: 0.008 },
  pad: { type: 'strings', cut: 1150, lfo: 280, att: 3.0, rel: 4.5 },
  air: { f: 450, q: 0.7, lfo: 200 },
  voices: {
    celesta: { kind: 'fm', ratio: 4, index: 0.45, dur: 1.8, oct: 0, gain: 0.07 },
    glock: { kind: 'fm', ratio: 2.76, index: 0.4, dur: 1.4, oct: 12, gain: 0.035 },
    harp: { kind: 'ks', gain: 0.09 },
    bell: { kind: 'fm', ratio: 3.5, index: 0.8, dur: 2.4, oct: 12, gain: 0.03 },
  },
  mains: ['celesta', 'harp', 'glock'], bellVoice: 'glock',
  extras: [['sleigh', 0.28]], crackle: 0.12,
};
// "Sugar Rush Waltz": a bouncy 3/4 in F major. An oom-pah-pah pulse (soft tuba on the downbeat,
// pizzicato chord tones on beats 2 and 3) under a celesta lead that moves on the beat, glockenspiel
// sparkles on the off-beats and light strings. Extras: a slide-whistle fill, sugar tinkles and a
// faint bubbling chocolate river. Kept light: one oscillator per "oom", cached KS buffers for "pah".
const CANDY = {
  id: 'candy', bpm: 150, meter: 3, chordBars: [2, 2, 4, 4],
  keys: [0, 0, 0, -5, 2],                          // F major home, C major and G major excursions
  start: 'I',
  chords: {
    I:   { pad: [53, 57, 60, 64], root: 41, arp: [65, 67, 69, 72, 76, 77, 81, 84], next: ['IV', 'V7', 'vi', 'ii', 'II7'] },
    IV:  { pad: [58, 62, 65, 69], root: 46, arp: [65, 69, 70, 72, 74, 77, 81, 82], next: ['I', 'V7', 'ii', 'vi'] },
    V7:  { pad: [55, 58, 60, 64], root: 48, arp: [67, 70, 72, 76, 79, 82, 84], next: ['I', 'vi', 'IV'] },
    ii:  { pad: [55, 58, 62, 65], root: 43, arp: [67, 70, 74, 77, 79, 82], next: ['V7', 'IV', 'I'] },
    vi:  { pad: [57, 60, 62, 65], root: 50, arp: [69, 72, 74, 77, 81, 86], next: ['ii', 'IV', 'II7', 'V7'] },
    II7: { pad: [55, 59, 62, 65], root: 43, arp: [67, 71, 74, 77, 79, 83], next: ['V7', 'ii'] },
  },
  level: { pad: 0.026, root: 0.012, air: 0.006 },
  pad: { type: 'strings', cut: 1500, lfo: 300, att: 0.5, rel: 1.6 },
  air: { f: 600, q: 0.7, lfo: 250 },
  delaySend: 0.16,
  voices: {
    celesta: { kind: 'fm', ratio: 4, index: 0.45, dur: 1.1, oct: 0, gain: 0.11 },
    glock: { kind: 'fm', ratio: 2.76, index: 0.4, dur: 0.9, oct: 12, gain: 0.05 },
  },
  mains: ['celesta', 'celesta', 'glock'], bellVoice: 'glock', leadStep: 2,
  waltz: { tuba: 0.13, pah: 0.15, sparkle: 0.07 },
  extras: [['whistle', 0.16], ['tinkle', 0.22], ['bubble', 0.2]],
};
// "Forge of the Deep" (Volcano Forge): slow and heavy in D minor with a Phrygian bII. Low brass drones
// (detuned saws under a dark lowpass), a taiko-style drum on beat 1 with a lighter push before beat 4,
// anvil clangs on 2 and 4 (sometimes a smith's double tap), a low dulcimer and an inharmonic forge bell
// on top. Extras: a swelling brass horn, bellows breaths and a distant volcanic rumble. CPU: one sine +
// one short noise burst per drum, two FM oscillators per anvil hit.
const VOLCANO = {
  id: 'volcano', bpm: 64, meter: 4, chordBars: [2, 2, 4],
  keys: [0, 0, 0, -2, 3],                          // D minor home, C minor and F minor excursions
  start: 'i',
  chords: {
    i:    { pad: [38, 45, 50, 53], root: 38, arp: [62, 65, 69, 70, 74, 77], next: ['bVI', 'iv', 'bII', 'bVII', 'v'] },
    bVI:  { pad: [46, 50, 53, 58], root: 46, arp: [62, 65, 70, 74, 77], next: ['bVII', 'iv', 'i'] },
    bVII: { pad: [48, 52, 55, 60], root: 48, arp: [64, 67, 72, 76, 79], next: ['i', 'bVI'] },
    iv:   { pad: [43, 50, 55, 58], root: 43, arp: [62, 67, 70, 74, 79], next: ['v', 'i', 'bII'] },
    v:    { pad: [45, 52, 57, 60], root: 45, arp: [64, 69, 72, 76], next: ['i', 'bVI'] },
    bII:  { pad: [39, 46, 51, 55], root: 39, arp: [63, 67, 70, 75], next: ['i', 'v'] },
  },
  level: { pad: 0.028, root: 0.032, air: 0.009 },
  pad: { type: 'brass', cut: 720, lfo: 260, att: 2.2, rel: 3.5 },
  air: { f: 280, q: 0.6, lfo: 120 },
  delaySend: 0.18,
  voices: {
    dulcimer: { kind: 'ks', gain: 0.085, oct: -12 },
    bell: { kind: 'fm', ratio: 2.71, index: 1.3, dur: 3.2, oct: 0, gain: 0.028 },
  },
  mains: ['dulcimer', 'dulcimer', 'bell'], bellVoice: 'bell', leadStep: 2,
  forge: { drum: 0.16, anvil: 0.03 },
  extras: [['horn', 0.3], ['bellows', 0.18], ['rumble', 0.2]],
};
// "Tides of the Reef" (Sunken Reef): calm and watery, Eb major with a Lydian #4 and soft maj7 / add9
// colours. Muffled strings under a slow, deep filter swell (the pad seems to breathe like water), a
// harp and a soft vibraphone (low-index FM) drifting through a long ping-pong delay, glassy bells.
// Extras: bubbles rising, water-drop plips and, rarely, a distant whale call. CPU: two sines per drop,
// three short sines per bubble run, one glide for the whale.
const REEF = {
  id: 'reef', bpm: 68, meter: 4, chordBars: [2, 3, 4],
  keys: [0, 0, 0, 2, -3],                          // Eb major home, F major and C major excursions
  start: 'I',
  chords: {
    I:     { pad: [51, 55, 58, 62], root: 39, arp: [63, 65, 67, 70, 74, 75, 77, 79, 82], next: ['IVlyd', 'vi', 'ii', 'Vsus', 'iii'] },
    IVlyd: { pad: [56, 60, 62, 67], root: 44, arp: [63, 67, 68, 70, 72, 74, 79, 80], next: ['I', 'vi', 'ii'] },
    vi:    { pad: [48, 55, 58, 62], root: 48, arp: [60, 63, 67, 70, 72, 74, 79], next: ['IVlyd', 'ii', 'I'] },
    ii:    { pad: [53, 56, 60, 63], root: 41, arp: [65, 68, 70, 72, 75, 77, 80], next: ['Vsus', 'IVlyd', 'I'] },
    Vsus:  { pad: [53, 56, 58, 63], root: 46, arp: [65, 68, 70, 72, 75, 77, 82], next: ['I', 'vi'] },
    iii:   { pad: [55, 58, 62, 65], root: 43, arp: [62, 65, 67, 70, 74, 79], next: ['vi', 'IVlyd'] },
  },
  level: { pad: 0.03, root: 0.03, air: 0.012 },
  pad: { type: 'strings', cut: 760, lfo: 420, att: 3.6, rel: 5 },
  air: { f: 380, q: 0.6, lfo: 220 },
  delaySend: 0.36,
  voices: {
    harp: { kind: 'ks', gain: 0.085 },
    vibes: { kind: 'fm', ratio: 4, index: 0.28, dur: 2.6, oct: 0, gain: 0.06 },
    bell: { kind: 'fm', ratio: 3.5, index: 0.7, dur: 3.0, oct: 12, gain: 0.024 },
  },
  mains: ['harp', 'vibes', 'vibes'], bellVoice: 'bell', leadStep: 2,
  extras: [['bubble', 0.35], ['drip', 0.3], ['whale', 0.1]],
};
// "Orbit Drift" (Star Station): calm and spacey, E Lydian with sus and maj9 colours. Wide detuned-saw pads
// under a slow, deep filter sweep; a soft analog-style arpeggio (one filtered square per eighth note, an
// up-and-down figure over the chord, its level and brightness drifting in and out over minutes); a glassy
// FM lead and a harp through a long ping-pong delay. Extras: a filtered-noise sweep (a ship passing), a
// sonar ping and faint radio "comms" blips. CPU: one oscillator + one filter per arpeggio note.
const STAR = {
  id: 'star', bpm: 72, meter: 4, chordBars: [2, 4, 4],
  keys: [0, 0, 0, 2, -3],                          // E major (Lydian) home, F# and C# excursions
  start: 'I',
  chords: {
    I:    { pad: [52, 59, 63, 66], root: 40, arp: [64, 66, 68, 71, 75, 76, 78, 80, 83], next: ['II', 'vi', 'IV', 'Vsus', 'iii'] },
    II:   { pad: [54, 58, 61, 66], root: 42, arp: [66, 68, 70, 73, 75, 78, 80, 82], next: ['I', 'vi', 'iii'] },
    vi:   { pad: [49, 56, 59, 63], root: 37, arp: [61, 63, 64, 68, 71, 73, 76, 80], next: ['IV', 'II', 'I'] },
    IV:   { pad: [57, 61, 64, 68], root: 45, arp: [64, 66, 68, 69, 71, 73, 76, 81], next: ['I', 'Vsus', 'II', 'vi'] },
    Vsus: { pad: [54, 59, 64, 66], root: 47, arp: [64, 66, 71, 73, 76, 78, 83], next: ['I', 'vi', 'IV'] },
    iii:  { pad: [56, 59, 63, 66], root: 44, arp: [63, 66, 68, 71, 75, 78, 80], next: ['vi', 'IV', 'II'] },
  },
  level: { pad: 0.028, root: 0.03, air: 0.01 },
  pad: { type: 'saw', cut: 1050, lfo: 520, att: 4.0, rel: 6 },
  air: { f: 900, q: 0.6, lfo: 500 },
  delaySend: 0.4,
  voices: {
    glass: { kind: 'fm', ratio: 2, index: 0.35, dur: 3.2, oct: 0, gain: 0.05 },
    harp: { kind: 'ks', gain: 0.07 },
    bell: { kind: 'fm', ratio: 3.01, index: 0.6, dur: 3.4, oct: 12, gain: 0.022 },
  },
  mains: ['glass', 'glass', 'harp'], bellVoice: 'bell', leadStep: 2,
  seq: { gain: 0.02, cut: 1400 },
  extras: [['sweep', 0.22], ['ping', 0.3], ['comms', 0.18]],
};
// "Temple Canopy" (Jungle Temple): calm and warm, G major pentatonic with 6/9, maj9 and a Mixolydian bVII.
// Soft strings low under the canopy, a wooden marimba (FM, ratio 4, fast-falling index) and a kalimba
// (inharmonic FM ratio) trading the arpeggio through a ping-pong delay, over a quiet hand-drum groove (a
// low "dum" on 1, finger "teks", bars that rest now and then). Extras: bird calls (chirp runs), a turaco's
// soft coo and a rainstick shower. CPU: one sine + one short noise burst per drum hit.
const JUNGLE = {
  id: 'jungle', bpm: 70, meter: 4, chordBars: [2, 2, 4],
  keys: [0, 0, 0, 2, -2],                          // G major home, A major and F major excursions
  start: 'I',
  chords: {
    I:    { pad: [55, 59, 62, 64], root: 43, arp: [67, 69, 71, 74, 76, 79, 81, 83], next: ['IV', 'vi', 'ii', 'Vsus', 'bVII'] },
    IV:   { pad: [52, 55, 60, 62], root: 48, arp: [64, 67, 69, 71, 74, 76, 79], next: ['I', 'vi', 'Vsus', 'ii'] },
    vi:   { pad: [52, 55, 59, 62], root: 40, arp: [64, 66, 67, 71, 74, 76, 79, 83], next: ['IV', 'ii', 'I'] },
    ii:   { pad: [57, 60, 64, 67], root: 45, arp: [64, 67, 69, 72, 74, 76, 79, 81], next: ['Vsus', 'IV', 'vi'] },
    Vsus: { pad: [55, 57, 60, 62], root: 38, arp: [62, 64, 67, 69, 72, 74, 79], next: ['I', 'vi', 'bVII'] },
    bVII: { pad: [53, 57, 60, 67], root: 41, arp: [65, 67, 69, 72, 74, 77, 79], next: ['I', 'IV'] },
  },
  level: { pad: 0.027, root: 0.032, air: 0.009 },
  pad: { type: 'strings', cut: 680, lfo: 280, att: 3.4, rel: 5 },
  air: { f: 2600, q: 0.7, lfo: 900 },               // a faint high hiss: distant insects
  delaySend: 0.3,
  voices: {
    marimba: { kind: 'fm', ratio: 4, index: 0.55, dur: 1.1, oct: -12, gain: 0.09 },
    kalimba: { kind: 'fm', ratio: 5.4, index: 0.4, dur: 1.6, oct: 0, gain: 0.055 },
    kbell: { kind: 'fm', ratio: 5.4, index: 0.3, dur: 2.2, oct: 12, gain: 0.02 },
  },
  mains: ['marimba', 'marimba', 'kalimba'], bellVoice: 'kbell', leadStep: 2,
  hands: { dum: 0.08, tek: 0.018 },
  extras: [['birdcall', 0.45], ['coo', 0.2], ['rainstick', 0.14]],
};
export const THEMES = { sky: SKY, spooky: SPOOKY, frost: FROST, candy: CANDY, volcano: VOLCANO, reef: REEF, star: STAR, jungle: JUNGLE };

// Karplus-Strong pluck, rendered once per base note (multiples of 3 semitones) and repitched.
// short = pizzicato: darker excitation, fast decay.
export function harpBuffer(ctx, base, short = false) {
  const s = shared(ctx), key = (short ? 'pizz_' : 'harp_') + base;
  if (s[key]) return s[key];
  const sr = ctx.sampleRate, f = mtof(base), dur = short ? 0.7 : clamp(3.0 - (base - 55) * 0.05, 1.3, 3.0);
  const n = Math.floor(sr * dur), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  const P = sr / f - 0.5, start = Math.ceil(P) + 2;
  let lp = 0;
  const ex = short ? 0.22 : 0.45;
  for (let i = 0; i < start; i++) { lp += ex * ((Math.random() * 2 - 1) - lp); d[i] = lp; }
  const loss = Math.pow(10, -3 / (dur * (short ? 0.4 : 0.7) * f));
  const at = x => { const i = Math.floor(x), fr = x - i; return d[i] * (1 - fr) + d[i + 1] * fr; };
  for (let i = start; i < n; i++) d[i] = loss * 0.5 * (at(i - P) + at(i - P - 1));
  let dc = 0, pk = 0;
  for (let i = 0; i < n; i++) dc += d[i];
  dc /= n;
  const fin = Math.floor(sr * 0.002), fout = Math.floor(sr * 0.08);
  for (let i = 0; i < n; i++) {
    d[i] -= dc;
    if (i < fin) d[i] *= i / fin;
    if (i > n - fout) d[i] *= (n - i) / fout;
    pk = Math.max(pk, Math.abs(d[i]));
  }
  for (let i = 0; i < n; i++) d[i] *= 0.8 / (pk || 1);
  return (s[key] = b);
}

class Player {
  constructor(E, theme) {
    this.E = E; this.th = theme; this.ctx = E.ctx;
    const ctx = this.ctx, G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    this.srcs = new Set();
    this.out = G(0);                              // fade in/out of this whole theme
    this.outWet = G(0);
    this.out.connect(E.music.dry); this.outWet.connect(E.music.wet);
    // pad bus: shared lowpass breathing on a slow LFO
    this.padF = ctx.createBiquadFilter(); this.padF.type = 'lowpass'; this.padF.frequency.value = theme.pad.cut; this.padF.Q.value = 0.5;
    const plfo = ctx.createOscillator(), plg = G(theme.pad.lfo); plfo.frequency.value = 0.045;
    if (theme.pad.type === 'organ') {
      // soft drawbar organ: 8' + 4' + a touch of 2 2/3' and 2'
      const re = new Float32Array([0, 1, 0.45, 0.12, 0.1, 0, 0.03]), im = new Float32Array(re.length);
      this.organ = ctx.createPeriodicWave(re, im);
    }
    plfo.connect(plg); plg.connect(this.padF.frequency);
    const padOut = G(1), padWet = G(0.55);
    this.padF.connect(padOut); this.padF.connect(padWet); padOut.connect(this.out); padWet.connect(this.outWet);
    // arp bus: gentle lowpass, reverb send, ping-pong delay
    this.arp = ctx.createBiquadFilter(); this.arp.type = 'lowpass'; this.arp.frequency.value = 4200; this.arp.Q.value = 0.5;
    const arpWet = G(0.4), dSend = G(theme.delaySend ?? 0.28);
    this.arp.connect(this.out); this.arp.connect(arpWet); arpWet.connect(this.outWet); this.arp.connect(dSend);
    const beat = 60 / theme.bpm;
    const dl = ctx.createDelay(2), dr = ctx.createDelay(2), fl = G(0.38), fr = G(0.38), dlp = ctx.createBiquadFilter();
    dl.delayTime.value = beat * 0.75; dr.delayTime.value = beat * 1.5;
    dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    dSend.connect(dlp); dlp.connect(dl); dl.connect(fl); fl.connect(dr); dr.connect(fr); fr.connect(dl);
    if (ctx.createStereoPanner) {
      const pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner(); pl.pan.value = -0.6; pr.pan.value = 0.6;
      dl.connect(pl); dr.connect(pr); pl.connect(this.out); pr.connect(this.out); pl.connect(this.outWet); pr.connect(this.outWet);
    } else { dl.connect(this.out); dr.connect(this.out); }
    // air bed: pink noise, wandering bandpass, slow pan drift
    const air = ctx.createBufferSource(); air.buffer = noiseBuffer(ctx, 'pink'); air.loop = true;
    const af = ctx.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = theme.air.f; af.Q.value = theme.air.q;
    const alfo = ctx.createOscillator(), alg = G(theme.air.lfo); alfo.frequency.value = 0.031;
    alfo.connect(alg); alg.connect(af.frequency);
    const ag = G(theme.level.air);
    air.connect(af); af.connect(ag); ag.connect(this.out); ag.connect(this.outWet);
    this.bgSrcs = [plfo, alfo, air];
    for (const s of this.bgSrcs) s.start(ctx.currentTime);
    this.nodes = [this.out, this.outWet, this.padF, plg, padOut, padWet, this.arp, arpWet, dSend, dl, dr, fl, fr, dlp, af, alg, ag];
    // scheduler state
    this.beat = beat; this.step = beat / 2;
    this.chord = theme.start; this.prev = ''; this.key = 0; this.chordCount = 0;
    this.chordList = [];                         // [{t, name, key}]
    this.nextChordT = 0; this.nextStepT = 0; this.stepN = 0;
    this.density = 0.45; this.phrase = null; this.idx = 3;
  }

  begin(t, fade = 2.5) {
    this.nextChordT = t + 0.05;
    // a metered theme (waltz) starts its eighth-note steps on a downbeat, so step n % 6 === 0 is beat 1
    this.nextStepT = this.th.meter ? t + 0.05 + this.beat * this.th.meter : t + this.beat * 2;
    holdParam(this.out.gain, t); this.out.gain.linearRampToValueAtTime(1, t + fade);
    holdParam(this.outWet.gain, t); this.outWet.gain.linearRampToValueAtTime(1, t + fade);
  }

  end(t, fade = 1.5) {
    for (const g of [this.out.gain, this.outWet.gain]) { holdParam(g, t); g.setTargetAtTime(0, t, fade / 4); }
    const stopAt = t + fade + 0.2;
    for (const s of [...this.srcs, ...this.bgSrcs]) { try { s.stop(stopAt); } catch { /* */ } }
    this.dead = true;
    return stopAt;
  }

  dispose() { for (const n of this.nodes) { try { n.disconnect(); } catch { /* */ } } }

  keep(src) { this.srcs.add(src); src.onended = () => { this.srcs.delete(src); try { src.disconnect(); } catch { /* */ } }; }

  chordAt(t) {
    let c = this.chordList[0];
    for (const x of this.chordList) if (x.t <= t) c = x;
    return c;
  }

  // schedule everything up to `horizon` seconds (context time)
  tick(horizon) {
    if (this.dead) return;
    while (this.nextChordT < horizon) this.scheduleChord();
    while (this.nextStepT < horizon) this.scheduleStep();
    const old = this.nextStepT - 30;
    while (this.chordList.length > 2 && this.chordList[1].t < old) this.chordList.shift();
  }

  scheduleChord() {
    const th = this.th, t = this.nextChordT, bar = this.beat * (th.meter || 4);
    if (this.chordCount > 0) {
      // key excursion: only from the home chord, after a while
      if (this.chord === th.start && this.chordCount % 6 === 0 && Math.random() < 0.45) {
        const opts = th.keys.filter(k => k !== this.key);
        this.key = pick(opts);
      }
      const opts = th.chords[this.chord].next.filter(n => n !== this.prev);
      // earlier entries are more likely
      const w = opts.map((_, i) => 1 / (1 + i * 0.6)), sum = w.reduce((a, b) => a + b, 0);
      let r = Math.random() * sum, k = 0;
      while (r > w[k] && k < opts.length - 1) r -= w[k++];
      this.prev = this.chord; this.chord = opts[k];
    }
    this.chordCount++;
    const dur = pick(th.chordBars || [2, 3, 3, 4]) * bar;
    this.chordList.push({ t, name: this.chord, key: this.key });
    this.pad(t, dur, th.chords[this.chord], this.key);
    for (const [name, prob] of th.extras) if (Math.random() < prob) this[name](t + rnd(1, Math.max(1.5, dur - 3)), th.chords[this.chord], this.key);
    this.nextChordT = t + dur;
  }

  pad(t, dur, ch, key) {
    const ctx = this.ctx, L = this.th.level, PT = this.th.pad, att = PT.att, rel = PT.rel;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + att);
    g.gain.setValueAtTime(1, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + rel);
    g.connect(this.padF);
    const end = t + dur + rel + 0.1;
    // occasionally lift one voice an octave for colour
    const lift = Math.random() < 0.3 ? (Math.random() * ch.pad.length) | 0 : -1;
    ch.pad.forEach((m, i) => {
      const f = mtof(m + key + (i === lift ? 12 : 0));
      const spread = PT.type === 'organ' ? 4 : PT.type === 'strings' ? 11 : PT.type === 'brass' ? 6 : 8;
      for (const dt of [-spread, spread]) {
        const o = ctx.createOscillator(); o.frequency.value = f; o.detune.value = dt + rnd(-3, 3);
        if (this.organ) o.setPeriodicWave(this.organ); else o.type = 'sawtooth';
        const og = ctx.createGain(); og.gain.value = L.pad;
        o.connect(og); og.connect(g); o.start(t); o.stop(end); this.keep(o);
      }
    });
    const r = ctx.createOscillator(); r.frequency.value = mtof(ch.root + key);
    const rg = ctx.createGain(); rg.gain.value = L.root;
    r.connect(rg); rg.connect(g); r.start(t); r.stop(end); this.keep(r);
    // let the pad gain node go when its sources end
    setTimeoutSafe(ctx, () => { try { g.disconnect(); } catch { /* */ } }, end);
  }

  newPhrase() {
    this.density = clamp(this.density + rnd(-0.18, 0.18), 0.15, 0.85);
    const d = this.density;
    const types = [['rest', 1.1 * (1 - d)], ['sparse', 1], ['up', 1.2 * d], ['down', 1.0 * d], ['wander', 1.1 * d], ['bells', 0.45]];
    const sum = types.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * sum, k = 0;
    while (r > types[k][1] && k < types.length - 1) r -= types[k++][1];
    this.phrase = { type: types[k][0], left: pick([8, 8, 16]), first: true, inst: pick(this.th.mains) };
  }

  scheduleStep() {
    const t0 = this.nextStepT, n = this.stepN++;
    this.nextStepT += this.step;
    if (!this.phrase || this.phrase.left <= 0) this.newPhrase();
    const ph = this.phrase; ph.left--;
    const c = this.chordAt(t0);
    if (!c) return;
    const th = this.th, pool = th.chords[c.name].arp;
    if (th.crackle && Math.random() < th.crackle) this.crackle(t0 + rnd(0, this.step));
    if (th.waltz) this.waltzStep(t0 + rnd(-0.004, 0.006), n, c);
    if (th.forge) this.forgeStep(t0 + rnd(-0.004, 0.006), n);
    if (th.seq) this.seqStep(t0 + rnd(-0.003, 0.004), n, c);
    if (th.hands) this.handStep(t0 + rnd(-0.006, 0.008), n);
    const t = t0 + (n % 2 ? this.step * 0.08 : 0) + rnd(-0.008, 0.012);
    let play = false, inst = ph.inst, oct = 0;
    switch (ph.type) {
      case 'rest': break;
      case 'sparse': play = Math.random() < 0.22; this.idx = (Math.random() * pool.length) | 0; break;
      case 'up': play = Math.random() < 0.85; if (ph.first) this.idx = (Math.random() * 3) | 0; else this.idx += Math.random() < 0.8 ? 1 : 2; break;
      case 'down': play = Math.random() < 0.85; if (ph.first) this.idx = pool.length - 1 - ((Math.random() * 2) | 0); else this.idx -= Math.random() < 0.8 ? 1 : 2; break;
      case 'wander': play = Math.random() < 0.6; this.idx += pick([-2, -1, -1, 1, 1, 2]); break;
      case 'bells': play = Math.random() < 0.28; inst = th.bellVoice; this.idx = (Math.random() * pool.length) | 0; break;
    }
    ph.first = false;
    // leadStep 2: the lead moves on the beat, with an occasional eighth-note pickup
    if (th.leadStep && n % th.leadStep && Math.random() > 0.2) play = false;
    // wrap the walk inside the pool, shifting octave instead of clamping
    if (this.idx >= pool.length) this.idx %= pool.length;
    if (this.idx < 0) this.idx = pool.length + (this.idx % pool.length);
    this.idx = clamp(this.idx, 0, pool.length - 1) | 0;
    if (!play) return;
    const m = pool[this.idx] + c.key + oct, vel = rnd(0.55, 1) * (n % 8 === 0 ? 1.1 : 1);
    this.note(t, m, inst, vel);
  }

  note(t, m, name, vel) {
    const v = this.th.voices[name];
    if (!v) return;
    m += v.oct || 0;
    if (v.kind === 'ks') this.pluck(t, m, v.gain * vel, !!v.short);
    else this.fm(t, m, v.gain * vel, v);
  }

  pluck(t, m, gain, short) {
    const ctx = this.ctx, base = Math.round(m / 3) * 3, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = harpBuffer(ctx, base, short); src.playbackRate.value = Math.pow(2, (m - base) / 12);
    g.gain.value = gain;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp((m - 74) / 18, -0.7, 0.7);
      src.connect(g); g.connect(p); p.connect(this.arp);
    } else { src.connect(g); g.connect(this.arp); }
    src.start(t); this.keep(src);
  }

  // two-operator FM: celesta / music box / glockenspiel / bell, depending on ratio and index
  fm(t, m, gain, { ratio = 3, index = 0.9, dur = 2.6 } = {}) {
    const ctx = this.ctx, f = mtof(m), c = ctx.createOscillator(), md = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.value = f; md.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.05), t + dur * 0.58);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    md.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(this.arp);
    c.start(t); md.start(t); c.stop(t + dur + 0.05); md.stop(t + dur + 0.05);
    this.keep(c); this.keep(md);
  }

  // oom-pah-pah: tuba on beat 1 (root, alternating with the fifth below every other bar),
  // pizzicato chord tones on beats 2 and 3, now and then a glockenspiel sparkle on an off-beat
  waltzStep(t, n, c) {
    const W = this.th.waltz, ch = this.th.chords[c.name], pos = n % 6, k = c.key;
    if (pos === 0) this.tuba(t, ch.root + k + ((n / 6) % 2 ? -5 : 0), W.tuba * rnd(0.85, 1));
    else if (pos === 2 || pos === 4) {
      const lo = pos === 2 ? 1 : 2, v = W.pah * rnd(0.75, 1) * (pos === 2 ? 1 : 0.8);
      this.pluck(t, ch.pad[lo] + k, v, true);
      this.pluck(t + 0.006, ch.pad[lo + 1] + k, v * 0.8, true);
    } else if (Math.random() < W.sparkle) this.note(t, pick(ch.arp) + k, 'glock', rnd(0.5, 0.9));
  }

  // forge groove (4/4, eighth-note steps, n % 8 === 0 is beat 1): a heavy drum on 1, a lighter push on
  // the "and" of 3 and sometimes on 4 of every other bar, anvil clangs on 2 and 4 (now and then a double tap)
  forgeStep(t, n) {
    const F = this.th.forge, pos = n % 8, bar = Math.floor(n / 8);
    if (pos === 0) this.drum(t, F.drum * rnd(0.9, 1), 1);
    else if (pos === 5 && Math.random() < 0.6) this.drum(t, F.drum * 0.5, 0.82);
    else if (pos === 6 && bar % 2 === 1 && Math.random() < 0.5) this.drum(t, F.drum * 0.42, 0.9);
    if ((pos === 2 || pos === 6) && Math.random() < 0.6) {
      this.anvil(t, F.anvil * rnd(0.7, 1));
      if (pos === 6 && Math.random() < 0.3) this.anvil(t + this.step * 0.5, F.anvil * 0.55);
    }
  }

  // taiko-style drum: a sine dropping in pitch plus a short low noise thump
  drum(t, gain, k = 1) {
    const ctx = this.ctx, dest = this.bus('near');
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(105 * k, t); o.frequency.exponentialRampToValueAtTime(44 * k, t + 0.22);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.9); this.keep(o);
    const nz = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain();
    nz.buffer = noiseBuffer(ctx, 'white'); f.type = 'lowpass'; f.frequency.value = 320;
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(gain * 0.6, t + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    nz.connect(f); f.connect(ng); ng.connect(dest); nz.start(t, Math.random()); nz.stop(t + 0.16); this.keep(nz);
  }

  // anvil clang: a bright inharmonic FM ping with a fast-falling index and a short upper partial
  anvil(t, gain) {
    const ctx = this.ctx, dest = this.panned(this.bus('near'), rnd(-0.45, 0.45));
    const f = mtof(pick([86, 88, 89, 91]));
    const c = ctx.createOscillator(), md = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.value = f; md.frequency.value = f * 2.756;
    mg.gain.setValueAtTime(f * 2.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.09);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    md.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(dest);
    const p = ctx.createOscillator(), pg = ctx.createGain();
    p.frequency.value = f * 2.41;
    pg.gain.setValueAtTime(0, t); pg.gain.linearRampToValueAtTime(gain * 0.45, t + 0.002);
    pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    p.connect(pg); pg.connect(dest);
    for (const o of [c, md]) { o.start(t); o.stop(t + 1.15); this.keep(o); }
    p.start(t); p.stop(t + 0.4); this.keep(p);
  }

  // a low brass horn swelling on the root and fifth, far away
  horn(t, ch, key) {
    const ctx = this.ctx, dest = this.panned(this.bus('far'), rnd(-0.3, 0.3)), d = rnd(3.5, 5);
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(260, t); f.frequency.linearRampToValueAtTime(1100, t + d * 0.45); f.frequency.linearRampToValueAtTime(300, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.022, t + d * 0.4); g.gain.linearRampToValueAtTime(0, t + d);
    f.connect(g); g.connect(dest);
    for (const m of [ch.root + key, ch.root + key + 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = rnd(-6, 6);
      o.connect(f); o.start(t); o.stop(t + d + 0.05); this.keep(o);
    }
  }

  // bellows: two slow breaths of band-passed noise
  bellows(t) {
    const ctx = this.ctx, dest = this.panned(this.bus('far'), pick([-0.5, 0.5]));
    for (const dt of [0, 2.4]) {
      const tt = t + dt, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = noiseBuffer(ctx, 'pink'); n.loop = true; f.type = 'bandpass'; f.frequency.value = rnd(300, 420); f.Q.value = 1.2;
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.03, tt + 1.0); g.gain.linearRampToValueAtTime(0, tt + 2.0);
      n.connect(f); f.connect(g); g.connect(dest); n.start(tt, Math.random()); n.stop(tt + 2.05); this.keep(n);
    }
  }

  // a distant volcanic rumble: low-passed noise swelling and fading
  rumble(t) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), d = rnd(3, 4.5);
    n.buffer = noiseBuffer(ctx, 'pink'); n.loop = true; f.type = 'lowpass'; f.frequency.value = 95; f.Q.value = 0.8;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + d * 0.35); g.gain.linearRampToValueAtTime(0, t + d);
    n.connect(f); f.connect(g); g.connect(this.bus('far')); n.start(t, Math.random()); n.stop(t + d + 0.05); this.keep(n);
  }

  // a soft tuba-ish "oom": one triangle through a closing lowpass
  tuba(t, m, gain) {
    const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), d = this.beat * 0.85;
    o.type = 'triangle'; o.frequency.value = mtof(m);
    f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(260, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(f); f.connect(g); g.connect(this.bus('near'));
    o.start(t); o.stop(t + d + 0.05); this.keep(o);
  }

  // slide-whistle fill: a sine swooping up an octave and back down, with a little vibrato
  whistle(t, ch, key) {
    const ctx = this.ctx, f0 = mtof(pick(ch.arp) + key), up = Math.random() < 0.5, d = rnd(0.7, 1.1);
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * (up ? 2 : 0.5), t + d * 0.55);
    o.frequency.exponentialRampToValueAtTime(f0 * (up ? 1.5 : 0.75), t + d);
    lfo.frequency.value = 6.5; lg.gain.value = 18; lfo.connect(lg); lg.connect(o.detune);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.016, t + 0.06);
    g.gain.setValueAtTime(0.016, t + d * 0.8); g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(g); g.connect(this.panned(this.bus('near'), rnd(-0.5, 0.5)));
    o.start(t); o.stop(t + d + 0.05); lfo.start(t); lfo.stop(t + d + 0.05); this.keep(o); this.keep(lfo);
  }

  // sugar tinkle: a quick descending run of three or four glockenspiel notes
  tinkle(t, ch, key) {
    const top = [...ch.arp].sort((a, b) => b - a).slice(0, 4), n = pick([3, 4]);
    for (let i = 0; i < n; i++) this.note(t + i * this.step * 0.5, top[i % top.length] + key, 'glock', 0.7 - i * 0.12);
  }

  // a faint bubbling chocolate river: a few rising sine blips, far away
  bubble(t) {
    const ctx = this.ctx, dest = this.panned(this.bus('far'), pick([-0.6, 0.6])), n = 3 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const tt = t + i * rnd(0.08, 0.22), o = ctx.createOscillator(), g = ctx.createGain(), f = rnd(260, 520), d = rnd(0.04, 0.07);
      o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 1.7, tt + d);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.014, tt + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + d);
      o.connect(g); g.connect(dest); o.start(tt); o.stop(tt + d + 0.02); this.keep(o);
    }
  }

  // a water-drop "plip": a sine that bends sharply up in pitch, then a softer echo
  drip(t) {
    const ctx = this.ctx, dest = this.panned(this.bus('far'), rnd(-0.7, 0.7)), n = 1 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const tt = t + i * rnd(0.3, 0.9), f = rnd(700, 1300), o = ctx.createOscillator(), g = ctx.createGain(), d = 0.09;
      o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 2.4, tt + d * 0.6);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.012 * (i ? 0.5 : 1), tt + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + d);
      o.connect(g); g.connect(dest); o.start(tt); o.stop(tt + d + 0.02); this.keep(o);
    }
  }

  // a distant whale call: a low sine gliding up and back down, heavily reverbed
  whale(t, ch, key) {
    const ctx = this.ctx, dest = this.panned(this.bus('far'), pick([-0.6, 0.6])), d = rnd(3.2, 4.6);
    const f0 = mtof(ch.root + key + 12), o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + d * 0.4);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.02, t + d * 0.3); g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(lp); lp.connect(g); g.connect(dest); o.start(t); o.stop(t + d + 0.05); this.keep(o);
  }

  // star arpeggio: an up-and-down eighth-note figure over the lowest chord tones, a soft filtered square;
  // its level and brightness drift slowly (a "density" of its own), so it comes and goes
  seqStep(t, n, c) {
    const Q = this.th.seq, ch = this.th.chords[c.name];
    if (n % 16 === 0) this.seqLvl = clamp((this.seqLvl ?? 0.5) + rnd(-0.25, 0.25), 0, 1);
    const lvl = this.seqLvl ?? 0.5;
    if (lvl < 0.15) return;
    const pool = ch.arp.slice(0, 5), pat = [0, 1, 2, 3, 4, 3, 2, 1], m = pool[pat[n % 8]] + c.key - (n % 16 < 8 ? 0 : 12);
    const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), d = this.step * 1.6;
    o.type = 'square'; o.frequency.value = mtof(m); o.detune.value = rnd(-4, 4);
    f.type = 'lowpass'; f.Q.value = 3;
    const cut = Q.cut * (0.5 + lvl * 0.8);
    f.frequency.setValueAtTime(cut * 2.2, t); f.frequency.exponentialRampToValueAtTime(Math.max(200, cut * 0.4), t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(Q.gain * lvl * (n % 4 === 0 ? 1.15 : 0.85), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(f); f.connect(g); g.connect(this.panned(this.arp, n % 2 ? 0.35 : -0.35));
    o.start(t); o.stop(t + d + 0.05); this.keep(o);
  }

  // a ship passing: band-passed noise sweeping up and back down, far away
  sweep(t) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), d = rnd(4, 6);
    n.buffer = noiseBuffer(ctx, 'pink'); n.loop = true; f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(rnd(1800, 2600), t + d * 0.55); f.frequency.exponentialRampToValueAtTime(400, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + d * 0.5); g.gain.linearRampToValueAtTime(0, t + d);
    n.connect(f); f.connect(g); g.connect(this.panned(this.bus('far'), pick([-0.6, 0.6]))); n.start(t, Math.random()); n.stop(t + d + 0.05); this.keep(n);
  }

  // a sonar ping: a pure sine on a chord tone with a soft attack and a long, reverbed tail (and an echo)
  ping(t, ch, key) {
    const ctx = this.ctx, dest = this.panned(this.bus('far'), rnd(-0.6, 0.6)), m = pick(ch.arp) + key + 12;
    for (const [dt, a] of [[0, 1], [this.beat * 1.5, 0.35]]) {
      const tt = t + dt, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = mtof(m);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.022 * a, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 2.2);
      o.connect(g); g.connect(dest); o.start(tt); o.stop(tt + 2.25); this.keep(o);
    }
  }

  // faint radio comms: a few short high beeps, like distant telemetry
  comms(t) {
    const ctx = this.ctx, dest = this.panned(this.bus('far'), pick([-0.7, 0.7])), n = 3 + ((Math.random() * 4) | 0), f = rnd(1400, 2200);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = Math.random() < 0.4 ? 0.12 : 0.05, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * (Math.random() < 0.3 ? 1.5 : 1);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.006, tt + 0.004);
      g.gain.setValueAtTime(0.006, tt + d); g.gain.linearRampToValueAtTime(0, tt + d + 0.01);
      o.connect(g); g.connect(dest); o.start(tt); o.stop(tt + d + 0.02); this.keep(o);
      tt += d + rnd(0.05, 0.12);
    }
  }

  // jungle hand drums (4/4, eighth-note steps): a soft low "dum" on 1 (and sometimes on 3), finger "teks"
  // on the off-beats, a ghost tek now and then; some bars rest so the groove breathes
  handStep(t, n) {
    const H = this.th.hands, pos = n % 8;
    if (pos === 0) this.handRest = Math.random() < 0.22;
    if (this.handRest) return;
    if (pos === 0) this.hand(t, H.dum * rnd(0.85, 1), 'dum');
    else if (pos === 4 && Math.random() < 0.45) this.hand(t, H.dum * 0.6, 'dum');
    else if ((pos === 3 || pos === 6) && Math.random() < 0.8) this.hand(t, H.tek * rnd(0.7, 1), 'tek');
    else if (Math.random() < 0.12) this.hand(t, H.tek * 0.45, 'tek');
  }

  hand(t, gain, kind) {
    const ctx = this.ctx, dest = this.panned(this.bus('near'), kind === 'dum' ? -0.15 : 0.25);
    if (kind === 'dum') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(72, t + 0.12);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.45); this.keep(o);
    }
    const nz = ctx.createBufferSource(), f = ctx.createBiquadFilter(), ng = ctx.createGain(), d = kind === 'dum' ? 0.06 : 0.045;
    nz.buffer = noiseBuffer(ctx, 'white'); f.type = 'bandpass'; f.frequency.value = kind === 'dum' ? 700 : 2800; f.Q.value = 1.2;
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(kind === 'dum' ? gain * 0.35 : gain, t + 0.002);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + d);
    nz.connect(f); f.connect(ng); ng.connect(dest); nz.start(t, Math.random()); nz.stop(t + d + 0.02); this.keep(nz);
  }

  // a bird call: a run of 2-5 quick rising chirps high above a chord tone, far away
  birdcall(t, ch, key) {
    const ctx = this.ctx, dest = this.panned(this.bus('far'), rnd(-0.8, 0.8)), n = 2 + ((Math.random() * 4) | 0);
    const f0 = mtof(pick(ch.arp) + key + 24), up = Math.random() < 0.7;
    let tt = t;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), d = rnd(0.06, 0.11), f = f0 * (1 + (i % 2) * 0.12);
      o.frequency.setValueAtTime(up ? f * 0.82 : f * 1.15, tt); o.frequency.exponentialRampToValueAtTime(up ? f * 1.12 : f * 0.86, tt + d);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.01, tt + 0.01); g.gain.linearRampToValueAtTime(0, tt + d);
      o.connect(g); g.connect(dest); o.start(tt); o.stop(tt + d + 0.02); this.keep(o);
      tt += d + rnd(0.04, 0.1);
    }
  }

  // a turaco's soft coo: "hoo HOO hoo", a low filtered triangle
  coo(t) {
    const ctx = this.ctx, dest = this.panned(this.bus('far'), pick([-0.7, 0.7]) * rnd(0.5, 1)), f0 = rnd(420, 520);
    for (const [dt, len, k] of [[0, 0.22, 1], [0.32, 0.34, 1.12], [0.78, 0.26, 0.96]]) {
      const tt = t + dt, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(f0 * k, tt); o.frequency.linearRampToValueAtTime(f0 * k * 0.94, tt + len);
      lp.type = 'lowpass'; lp.frequency.value = 900;
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.016, tt + 0.05); g.gain.linearRampToValueAtTime(0, tt + len);
      o.connect(lp); lp.connect(g); g.connect(dest); o.start(tt); o.stop(tt + len + 0.03); this.keep(o);
    }
  }

  // a rainstick: one high band-passed noise shower that thins out over ~2 s
  rainstick(t) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), d = rnd(1.6, 2.4);
    n.buffer = noiseBuffer(ctx, 'white'); n.loop = true; f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(2600, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(f); f.connect(g); g.connect(this.panned(this.bus('far'), rnd(-0.5, 0.5))); n.start(t, Math.random()); n.stop(t + d + 0.05); this.keep(n);
  }

  // ---- extras --------------------------------------------------------------------------------
  // `far` = mostly reverb (distant), `near` = mostly dry. Created on first use.
  bus(kind) {
    if (this[kind]) return this[kind];
    const ctx = this.ctx, g = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
    dry.gain.value = kind === 'far' ? 0.3 : 1; wet.gain.value = kind === 'far' ? 1.1 : 0.35;
    g.connect(dry); g.connect(wet); dry.connect(this.out); wet.connect(this.outWet);
    this.nodes.push(g, dry, wet);
    return (this[kind] = g);
  }

  panned(dest, pan) {
    const ctx = this.ctx;
    if (!ctx.createStereoPanner) return dest;
    const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(dest);
    return p;
  }

  // a sine glide between three chord tones with growing vibrato
  theremin(t, ch, key) {
    const ctx = this.ctx, notes = [pick(ch.arp), pick(ch.arp), pick(ch.arp)].map(m => mtof(m + key));
    const dest = this.panned(this.bus('far'), rnd(-0.5, 0.5)), g = ctx.createGain(), end = t + 5;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.026, t + 0.8);
    g.gain.setValueAtTime(0.026, t + 3.4); g.gain.setTargetAtTime(0, t + 3.4, 0.35);
    g.connect(dest);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(28, t + 1.4);
    lfo.connect(lg);
    for (const [mul, a] of [[1, 1], [2, 0.12]]) {
      const o = ctx.createOscillator(), og = ctx.createGain(); og.gain.value = a;
      o.frequency.setValueAtTime(notes[0] * mul, t);
      o.frequency.setTargetAtTime(notes[1] * mul, t + 1.3, 0.18);
      o.frequency.setTargetAtTime(notes[2] * mul, t + 2.5, 0.25);
      lg.connect(o.detune); o.connect(og); og.connect(g); o.start(t); o.stop(end); this.keep(o);
    }
    lfo.start(t); lfo.stop(end); this.keep(lfo);
  }

  // a distant owl: "hoo ... hoo-hoo"
  owl(t) {
    const ctx = this.ctx, f0 = rnd(330, 400), dest = this.panned(this.bus('far'), pick([-0.7, 0.7]) * rnd(0.6, 1));
    for (const [dt, len] of [[0, 0.42], [0.72, 0.16], [0.95, 0.5]]) {
      const tt = t + dt, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(f0 * 1.04, tt); o.frequency.exponentialRampToValueAtTime(f0 * 0.9, tt + len);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.03, tt + 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + len + 0.08);
      o.connect(g); g.connect(dest); o.start(tt); o.stop(tt + len + 0.1); this.keep(o);
    }
  }

  // subtle sleigh bells shaken on the beat for one or two bars
  sleigh(t) {
    const ctx = this.ctx, dest = this.panned(this.bus('near'), rnd(-0.4, 0.4)), steps = pick([8, 16]);
    for (let i = 0; i < steps; i++) {
      if (i % 2 && Math.random() < 0.5) continue;
      const tt = t + i * this.step + rnd(-0.006, 0.006), acc = (i % 4 === 0 ? 1 : 0.6) * (1 - 0.4 * i / steps);
      for (let k = 0; k < 3; k++) {
        const o = ctx.createOscillator(), g = ctx.createGain(), tk = tt + rnd(0, 0.018), d = rnd(0.08, 0.15);
        o.frequency.value = rnd(4800, 7600);
        g.gain.setValueAtTime(0, tk); g.gain.linearRampToValueAtTime(0.007 * acc, tk + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, tk + d);
        o.connect(g); g.connect(dest); o.start(tk); o.stop(tk + d + 0.02); this.keep(o);
      }
      const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = noiseBuffer(ctx, 'white'); f.type = 'bandpass'; f.frequency.value = 7000; f.Q.value = 1.5;
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.03 * acc, tt + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.06);
      n.connect(f); f.connect(g); g.connect(dest); n.start(tt, Math.random()); n.stop(tt + 0.07); this.keep(n);
    }
  }

  // a faint fireside crackle (one tiny click)
  crackle(t) {
    const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), d = rnd(0.003, 0.009);
    n.buffer = noiseBuffer(ctx, 'white'); f.type = 'bandpass'; f.frequency.value = rnd(1200, 3800); f.Q.value = 0.8;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(rnd(0.006, 0.02), t + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(f); f.connect(g); g.connect(this.bus('near')); n.start(t, Math.random()); n.stop(t + d + 0.01); this.keep(n);
  }
}

// setTimeout keyed to context time; a no-op for offline contexts (which are thrown away).
function setTimeoutSafe(ctx, fn, atCtxTime) {
  if (typeof ctx.startRendering === 'function') return;
  setTimeout(fn, Math.max(0, (atCtxTime - ctx.currentTime) * 1000 + 200));
}

// Live music controller. tick() is driven by a 250 ms interval with 1.5 s lookahead.
export function createMusic(E, { live = true } = {}) {
  let player = null, timer = 0;
  const LOOK = 1.5;
  const tick = () => { if (player) player.tick(E.ctx.currentTime + LOOK); };
  const api = {
    get playing() { return !!player; },
    get theme() { return player ? player.th.id : null; },
    start(id = 'sky', at = E.ctx.currentTime) {
      const th = THEMES[id] || SKY;
      if (player && player.th === th) return;
      if (player) api.stop(at, 1.5);
      player = new Player(E, th);
      player.begin(at);
      player.tick(at + LOOK);
      if (live && !timer) timer = setInterval(tick, 250);
    },
    stop(at = E.ctx.currentTime, fade = 1.5) {
      if (!player) return;
      const p = player; player = null;
      const stopAt = p.end(at, fade);
      setTimeoutSafe(E.ctx, () => p.dispose(), stopAt);
      if (timer) { clearInterval(timer); timer = 0; }
    },
    tick(horizon) { if (player) player.tick(horizon); },
    _player: () => player,
  };
  return api;
}
