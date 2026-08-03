// Public-domain compositions encoded as note data. The works below are all long out of
// copyright; only recordings of them are protected, and nothing here is a recording.
// b = beat offset, d = duration in beats.

const n = (b, note, d, vel) => ({ b, note, d, vel });

const TRIAD = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], dom7: [0, 4, 7, 10], min7: [0, 3, 7, 10] };
export const chordTones = c => TRIAD[c.q] || TRIAD.maj;

// ── Pachelbel ───────────────────────────────────────────────
const CANON_GROUND = ['D2', 'A2', 'B2', 'F#2', 'G2', 'D2', 'G2', 'A2'];
const CANON_Q = ['maj', 'maj', 'min', 'min', 'maj', 'maj', 'maj', 'maj'];
const CANON_ARP = [
  ['D4', 'F#4', 'A4', 'F#4'], ['C#4', 'E4', 'A4', 'E4'],
  ['B3', 'D4', 'F#4', 'D4'], ['A3', 'C#4', 'F#4', 'C#4'],
  ['G3', 'B3', 'D4', 'B3'], ['F#3', 'A3', 'D4', 'A3'],
  ['G3', 'B3', 'D4', 'B3'], ['A3', 'C#4', 'E4', 'C#4'],
];

function canon() {
  const chords = [], bass = [], arp = [];
  for (let cyc = 0; cyc < 2; cyc++) {
    for (let i = 0; i < 8; i++) {
      const b = cyc * 16 + i * 2;
      chords.push({ b, d: 2, root: CANON_GROUND[i], q: CANON_Q[i] });
      bass.push(n(b, CANON_GROUND[i], 1.85));
      CANON_ARP[i].forEach((p, k) => arp.push(n(b + k * 0.5, p, 0.48)));
    }
  }
  const varA = ['F#5', 'E5', 'D5', 'C#5', 'B4', 'A4', 'B4', 'C#5'];
  const varB = ['D5', 'F#5', 'A5', 'G5', 'F#5', 'D5', 'F#5', 'E5',
    'D5', 'B4', 'D5', 'A4', 'G4', 'B4', 'A4', 'G4'];
  const melody = varA.map((p, i) => n(i * 2, p, 1.9))
    .concat(varB.map((p, i) => n(16 + i, p, 0.95)));
  return { chords, bass, arp, melody };
}

// ── Bach, Prelude No. 1 in C ────────────────────────────────
// each bar is [low, tenor, a, b, c] played as low tenor a b c a b c, twice
const P846 = [
  ['C3', 'E3', 'G3', 'C4', 'E4'],
  ['C3', 'D3', 'A3', 'D4', 'F4'],
  ['B2', 'D3', 'G3', 'D4', 'F4'],
  ['C3', 'E3', 'G3', 'C4', 'E4'],
  ['C3', 'E3', 'A3', 'E4', 'A4'],
  ['C3', 'D3', 'F#3', 'A3', 'D4'],
  ['B2', 'D3', 'G3', 'D4', 'G4'],
  ['B2', 'C3', 'E3', 'G3', 'C4'],
];
const P846_Q = ['maj', 'dom7', 'dom7', 'maj', 'min', 'dom7', 'dom7', 'dom7'];
const P846_ROOT = ['C2', 'D2', 'G2', 'C2', 'A2', 'D2', 'G2', 'C2'];

function prelude() {
  const chords = [], bass = [], arp = [], melody = [];
  P846.forEach((bar, i) => {
    const b0 = i * 4;
    chords.push({ b: b0, d: 4, root: P846_ROOT[i], q: P846_Q[i] });
    bass.push(n(b0, P846_ROOT[i], 3.8));
    for (let h = 0; h < 2; h++) {
      const seq = [bar[0], bar[1], bar[2], bar[3], bar[4], bar[2], bar[3], bar[4]];
      seq.forEach((p, k) => arp.push(n(b0 + h * 2 + k * 0.25, p, 0.24)));
    }
    melody.push(n(b0, bar[4], 3.8, 0.8));
  });
  return { chords, bass, arp, melody };
}

// ── Petzold, Minuet in G ────────────────────────────────────
const MINUET = [
  [['D5', 1], ['G4', .5], ['A4', .5], ['B4', .5], ['C5', .5]],
  [['D5', 1], ['G4', 1], ['G4', 1]],
  [['E5', 1], ['C5', .5], ['D5', .5], ['E5', .5], ['F#5', .5]],
  [['G5', 1], ['G4', 1], ['G4', 1]],
  [['C5', 1], ['D5', .5], ['C5', .5], ['B4', .5], ['A4', .5]],
  [['B4', 1], ['C5', .5], ['B4', .5], ['A4', .5], ['G4', .5]],
  [['A4', 1], ['B4', .5], ['A4', .5], ['G4', .5], ['F#4', .5]],
  [['G4', 3]],
];
const MINUET_CH = [['G2', 'maj'], ['G2', 'maj'], ['C2', 'maj'], ['G2', 'maj'],
  ['C2', 'maj'], ['G2', 'maj'], ['D2', 'maj'], ['G2', 'maj']];

function minuet() {
  const melody = [], chords = [], bass = [], arp = [];
  MINUET.forEach((bar, i) => {
    let b = i * 3;
    for (const [p, d] of bar) { melody.push(n(b, p, d * 0.94)); b += d; }
    const [root, q] = MINUET_CH[i];
    chords.push({ b: i * 3, d: 3, root, q });
    bass.push(n(i * 3, root, 0.9), n(i * 3 + 1, root, 0.9), n(i * 3 + 2, root, 0.9));
    const oct = root.replace(/\d/, '3');
    for (let k = 0; k < 3; k++) arp.push(n(i * 3 + k, oct, 0.9, 0.7));
  });
  return { melody, chords, bass, arp };
}

// ── Beethoven, Ode to Joy ───────────────────────────────────
const ODE = [
  [['F#5', 1], ['F#5', 1], ['G5', 1], ['A5', 1]],
  [['A5', 1], ['G5', 1], ['F#5', 1], ['E5', 1]],
  [['D5', 1], ['D5', 1], ['E5', 1], ['F#5', 1]],
  [['F#5', 1.5], ['E5', .5], ['E5', 2]],
  [['F#5', 1], ['F#5', 1], ['G5', 1], ['A5', 1]],
  [['A5', 1], ['G5', 1], ['F#5', 1], ['E5', 1]],
  [['D5', 1], ['D5', 1], ['E5', 1], ['F#5', 1]],
  [['E5', 1.5], ['D5', .5], ['D5', 2]],
];
const ODE_CH = [['D2', 'maj'], ['D2', 'maj'], ['A2', 'dom7'], ['D2', 'maj'],
  ['D2', 'maj'], ['D2', 'maj'], ['D2', 'maj'], ['A2', 'dom7'],
  ['D2', 'maj'], ['D2', 'maj'], ['A2', 'dom7'], ['D2', 'maj'],
  ['D2', 'maj'], ['D2', 'maj'], ['A2', 'dom7'], ['D2', 'maj']];

function ode() {
  const melody = [], chords = [], bass = [], arp = [];
  ODE.forEach((bar, i) => {
    let b = i * 4;
    for (const [p, d] of bar) { melody.push(n(b, p, d * 0.95)); b += d; }
  });
  ODE_CH.forEach(([root, q], i) => {
    const b = i * 2;
    chords.push({ b, d: 2, root, q });
    bass.push(n(b, root, 0.9), n(b + 1, root, 0.9));
    const up = root.replace(/\d/, '3');
    arp.push(n(b, up, 0.45), n(b + 0.5, up, 0.45), n(b + 1, up, 0.45), n(b + 1.5, up, 0.45));
  });
  return { melody, chords, bass, arp };
}

// ── Beethoven, Symphony No. 5 opening ───────────────────────
function fifth() {
  const melody = [], bass = [], chords = [], arp = [];
  const cell = (b0, three, held, oct) => {
    for (let i = 0; i < 3; i++) melody.push(n(b0 + 0.5 + i * 0.5, three, 0.45, 1));
    melody.push(n(b0 + 2, held, 2.6, 1));
    for (let i = 0; i < 3; i++) bass.push(n(b0 + 0.5 + i * 0.5, three.replace(/\d/, oct), 0.45, 1));
    bass.push(n(b0 + 2, held.replace(/\d/, oct), 2.6, 1));
  };
  cell(0, 'G4', 'Eb4', '2');
  cell(5, 'F4', 'D4', '2');
  cell(10, 'G5', 'Eb5', '3');
  cell(15, 'F5', 'D5', '3');
  for (let i = 0; i < 4; i++) {
    const b = i * 5;
    const [root, q] = i % 2 ? ['Bb2', 'maj'] : ['C2', 'min'];
    chords.push({ b: b + 2, d: 2.6, root, q });
    arp.push(n(b + 2, root.replace(/\d/, '3'), 2.4, 0.7));
  }
  return { melody, bass, chords, arp };
}

// ── Bach, Toccata and Fugue in D minor, opening ─────────────
function toccata() {
  const melody = [], bass = [], chords = [], arp = [];
  const g1 = [['A5', .5], ['G5', .25], ['A5', 1], [null, .25],
    ['G5', .25], ['F5', .25], ['E5', .25], ['D5', .25], ['C#5', .25], ['D5', .75]];
  const g2 = [['E5', .5], ['D5', .25], ['E5', 1], [null, .25],
    ['D5', .25], ['C5', .25], ['Bb4', .25], ['A4', .25], ['G4', .25], ['A4', .75]];
  let b = 0;
  for (const g of [g1, g2]) {
    for (const [p, d] of g) {
      if (p) {
        melody.push(n(b, p, d * 0.9, 1));
        bass.push(n(b, p.replace(/(\d)/, (m, x) => +x - 2), d * 0.9, 0.9));
      }
      b += d;
    }
  }
  chords.push({ b: 0, d: 4, root: 'D2', q: 'min' }, { b: 4, d: 4, root: 'D2', q: 'min' });
  for (const p of ['D3', 'F3', 'A3', 'D4']) melody.push(n(8, p, 3.6, 0.85));
  bass.push(n(8, 'D2', 3.6, 1));
  chords.push({ b: 8, d: 4, root: 'D2', q: 'min' }, { b: 12, d: 4, root: 'A2', q: 'dom7' });
  for (const p of ['C#3', 'E3', 'G3', 'A3']) melody.push(n(12, p, 3.6, 0.8));
  bass.push(n(12, 'A2', 3.6, 1));
  arp.push(n(8, 'D3', 3.6, 0.6), n(12, 'A2', 3.6, 0.6));
  return { melody, bass, chords, arp };
}

// ── Traditional, Greensleeves ───────────────────────────────
const GREEN = [
  [['C5', 1], ['D5', .5], ['E5', 1], ['F5', .5]],
  [['E5', 1], ['D5', .5], ['B4', 1], ['G4', .5]],
  [['A4', 1], ['B4', .5], ['C5', 1], ['A4', .5]],
  [['A4', 1], ['G#4', .5], ['A4', 1], ['B4', .5]],
  [['C5', 1], ['D5', .5], ['E5', 1], ['F5', .5]],
  [['E5', 1], ['D5', .5], ['B4', 1], ['G4', .5]],
  [['A4', 1], ['B4', .5], ['C5', 1], ['B4', .5]],
  [['A4', 1], ['G#4', .5], ['A4', 1.5]],
];
const GREEN_CH = [['A2', 'min'], ['G2', 'maj'], ['A2', 'min'], ['E2', 'maj'],
  ['A2', 'min'], ['G2', 'maj'], ['A2', 'min'], ['E2', 'maj']];

function greensleeves() {
  const melody = [], chords = [], bass = [], arp = [];
  GREEN.forEach((bar, i) => {
    let b = i * 3;
    for (const [p, d] of bar) { melody.push(n(b, p, d * 0.94)); b += d; }
    const [root, q] = GREEN_CH[i];
    chords.push({ b: i * 3, d: 3, root, q });
    bass.push(n(i * 3, root, 1.4), n(i * 3 + 1.5, root, 1.4));
    const up = root.replace(/\d/, '3');
    for (let k = 0; k < 6; k++) arp.push(n(i * 3 + k * 0.5, up, 0.45, 0.65));
  });
  return { melody, chords, bass, arp };
}

export const PIECES = [
  {
    id: 'canon', title: 'Canon in D', composer: 'Johann Pachelbel', year: 'c. 1680',
    bpm: 96, beatsPerBar: 4, bars: 8, groove: 'ballad', keyNote: 'D', ...canon(),
  },
  {
    id: 'prelude', title: 'Prelude No. 1 in C, BWV 846', composer: 'J. S. Bach', year: '1722',
    bpm: 76, beatsPerBar: 4, bars: 8, groove: 'halftime', keyNote: 'C', ...prelude(),
  },
  {
    id: 'minuet', title: 'Minuet in G, BWV Anh. 114', composer: 'Christian Petzold', year: 'c. 1725',
    bpm: 132, beatsPerBar: 3, bars: 8, groove: 'waltz', keyNote: 'G', ...minuet(),
  },
  {
    id: 'ode', title: 'Ode to Joy (Symphony No. 9)', composer: 'Ludwig van Beethoven', year: '1824',
    bpm: 116, beatsPerBar: 4, bars: 8, groove: 'anthem', keyNote: 'D', ...ode(),
  },
  {
    id: 'fifth', title: 'Symphony No. 5, opening', composer: 'Ludwig van Beethoven', year: '1808',
    bpm: 150, beatsPerBar: 5, bars: 4, groove: 'none', keyNote: 'C', ...fifth(),
  },
  {
    id: 'toccata', title: 'Toccata & Fugue in D minor, BWV 565', composer: 'J. S. Bach', year: 'c. 1704',
    bpm: 92, beatsPerBar: 4, bars: 4, groove: 'halftime', keyNote: 'D', ...toccata(),
  },
  {
    id: 'greensleeves', title: 'Greensleeves', composer: 'Traditional (English)', year: 'c. 1580',
    bpm: 108, beatsPerBar: 3, bars: 8, groove: 'six8', keyNote: 'A', ...greensleeves(),
  },
];

// drum grooves in 16ths; len must divide the bar
export const GROOVES = {
  none: { len: 16, hits: [] },
  ballad: {
    len: 16, hits: [
      ...[0, 8].map(s => ({ s, inst: 'kick', v: 1 })),
      ...[4, 12].map(s => ({ s, inst: 'snare', v: 0.9 })),
      ...[0, 2, 4, 6, 8, 10, 12, 14].map(s => ({ s, inst: 'hat', v: s % 4 ? 0.45 : 0.75 })),
    ],
  },
  anthem: {
    len: 16, hits: [
      ...[0, 3, 8, 11].map(s => ({ s, inst: 'kick', v: 1 })),
      ...[4, 12].map(s => ({ s, inst: 'snare', v: 1 })),
      ...[0, 2, 4, 6, 8, 10, 12, 14].map(s => ({ s, inst: 'hat', v: s % 4 ? 0.4 : 0.8 })),
      { s: 14, inst: 'snare', v: 0.5 },
    ],
  },
  halftime: {
    len: 16, hits: [
      ...[0, 10].map(s => ({ s, inst: 'kick', v: 1 })),
      { s: 8, inst: 'snare', v: 1 },
      ...[0, 2, 4, 6, 8, 10, 12, 14].map(s => ({ s, inst: 'hat', v: s % 4 ? 0.35 : 0.65 })),
    ],
  },
  driving: {
    len: 16, hits: [
      ...[0, 4, 8, 12].map(s => ({ s, inst: 'kick', v: 1 })),
      ...[4, 12].map(s => ({ s, inst: 'snare', v: 0.95 })),
      ...Array.from({ length: 16 }, (_, s) => ({ s, inst: 'hat', v: s % 2 ? 0.3 : 0.6 })),
    ],
  },
  waltz: {
    len: 12, hits: [
      { s: 0, inst: 'kick', v: 1 },
      { s: 4, inst: 'snare', v: 0.6 }, { s: 8, inst: 'snare', v: 0.6 },
      ...[0, 2, 4, 6, 8, 10].map(s => ({ s, inst: 'hat', v: s ? 0.35 : 0.7 })),
    ],
  },
  six8: {
    len: 12, hits: [
      { s: 0, inst: 'kick', v: 1 }, { s: 6, inst: 'kick', v: 0.8 },
      { s: 6, inst: 'snare', v: 0.85 },
      ...[0, 2, 4, 6, 8, 10].map(s => ({ s, inst: 'hat', v: s % 6 ? 0.35 : 0.7 })),
    ],
  },
};

export const ARRANGEMENTS = {
  strings: {
    name: 'Strings only',
    parts: { melody: 'violin', harmony: 'strings', arp: null, bass: 'cello', drums: false },
  },
  chamber: {
    name: 'Chamber (+ guitar)',
    parts: { melody: 'violin', harmony: 'strings', arp: 'guitar', bass: 'cello', drums: false },
  },
  modern: {
    name: 'Strings + rhythm section',
    parts: { melody: 'strings', harmony: 'strings', arp: 'guitar', bass: 'bassGuitar', drums: true },
  },
  bigbeat: {
    name: 'Big beat',
    parts: { melody: 'strings', harmony: 'choir', arp: 'harp', bass: 'bassSynth', drums: true },
  },
  baroque: {
    name: 'Baroque (organ + harpsichord)',
    parts: { melody: 'organ', harmony: 'organ', arp: 'harpsichord', bass: 'organ', drums: false },
  },
  guitarSolo: {
    name: 'Solo guitar',
    parts: { melody: 'guitar', harmony: null, arp: 'guitar', bass: 'guitar', drums: false },
  },
  wind: {
    name: 'Flute & harp',
    parts: { melody: 'flute', harmony: 'strings', arp: 'harp', bass: 'cello', drums: false },
  },
};
