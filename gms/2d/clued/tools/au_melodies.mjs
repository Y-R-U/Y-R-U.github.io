// Hand transcriptions of public-domain melodies (traditional, or published before 1931), compiled to note JSON.
// Notation: space-separated tokens; '|' = bar line (bars are checked against ts). Pitch C4 = middle C, '#'/'b'
// accidentals are written on every note (no key signature). Chord tokens join pitches with '+'. 'r' = rest.
// Duration suffix: w h q e s (4, 2, 1, ½, ¼ beats), '.' dotted, 't' triplet; omitted = previous duration.
// `chords` (optional) is one bar per '|', chords in a bar split it evenly; it becomes a light left-hand part.
// `pickup` = beats in the opening partial bar.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DUR = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };

export function pitch(s) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
  if (!m) throw new Error('bad pitch ' + s);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export function parseVoice(str, id) {
  const bars = [[]];
  let dur = 1;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') { bars.push([]); continue; }
    const m = /^(r|[A-G][#b]?-?\d(?:\+[A-G][#b]?-?\d)*)([whqes])?(\.)?(t)?(~)?$/.exec(tok);
    if (!m) throw new Error(`${id}: bad token "${tok}"`);
    if (m[2]) dur = DUR[m[2]] * (m[3] ? 1.5 : 1) * (m[4] ? 2 / 3 : 1);
    else if (m[3] || m[4]) throw new Error(`${id}: modifier without length in "${tok}"`);
    bars[bars.length - 1].push({ p: m[1] === 'r' ? null : m[1].split('+').map(pitch), d: dur, tie: !!m[5] });
  }
  return bars.filter((b, i) => b.length || i < bars.length - 1);
}

export function checkBars(bars, barLen, pickup, id) {
  const errs = [];
  bars.forEach((b, i) => {
    const sum = Math.round(b.reduce((s, n) => s + n.d, 0) * 1000) / 1000;
    const want = i === 0 && pickup ? pickup : barLen;
    const last = i === bars.length - 1;
    if (last ? sum > barLen + 1e-6 || sum <= 0 : Math.abs(sum - want) > 1e-3) errs.push(`${id}: bar ${i + 1} has ${sum} beats, expected ${last ? '≤ ' + barLen : want}`);
  });
  return errs;
}

const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6], aug: [0, 4, 8], sus4: [0, 5, 7], 6: [0, 4, 7, 9] };
function chordTones(sym) {
  const m = /^([A-G])(#|b)?(m7|maj7|m|7|dim|aug|sus4|6)?$/.exec(sym);
  if (!m) throw new Error('bad chord ' + sym);
  const root = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return { root: ((root % 12) + 12) % 12, ivs: QUAL[m[3] || ''] };
}

// root in octave 2, chord tones closed inside octave 3 so they stay under the tune
function accompany(chords, barLen, pickup, ts) {
  const out = [];
  let t = pickup || 0;
  for (const bar of chords.split('|').map((s) => s.trim())) {
    const syms = bar ? bar.split(/\s+/) : [];
    const seg = barLen / Math.max(1, syms.length);
    syms.forEach((sym, k) => {
      const t0 = t + k * seg;
      if (sym === 'N' || sym === '-') return;
      const { root, ivs } = chordTones(sym);
      const bass = 36 + root;
      const tones = ivs.map((iv) => 48 + ((root + iv) % 12)).sort((a, b) => a - b);
      const beat = ts[1] === 8 ? 1.5 : 1;
      out.push([t0, bass, Math.min(seg, beat * 2) * 0.95, 64]);
      for (let b = beat; b < seg - 1e-6; b += beat) for (const n of tones) out.push([t0 + b, n, beat * 0.8, 46]);
      if (seg <= beat + 1e-6) for (const n of tones) out.push([t0, n, seg * 0.9, 42]);
    });
    t += barLen;
  }
  return out;
}

export function compile(m) {
  const ts = m.ts || [4, 4];
  const barLen = (ts[0] * 4) / ts[1];
  const bars = parseVoice(m.rh, m.id);
  const errs = checkBars(bars, barLen, m.pickup, m.id);
  if (errs.length) throw new Error(errs.join('\n'));
  const notes = [];
  let t = 0, prev = null;
  bars.forEach((bar, bi) => bar.forEach((n) => {
    if (n.p) {
      const accent = Math.abs(t - Math.round(t / barLen) * barLen) < 1e-6 ? 8 : 0;
      if (prev && prev.tie && prev.p && n.p.join() === prev.p.join()) {
        notes.filter((x) => x._open).forEach((x) => { x[2] += n.d; });
      } else {
        notes.forEach((x) => delete x._open);
        for (const p of n.p) { const x = [t, p, n.d, 86 + accent]; x._open = true; notes.push(x); }
      }
    }
    prev = n; t += n.d;
  }));
  notes.forEach((x) => delete x._open);
  if (m.lh) {
    const lb = parseVoice(m.lh, m.id + ':lh');
    const e2 = checkBars(lb, barLen, m.pickup, m.id + ':lh');
    if (e2.length) throw new Error(e2.join('\n'));
    let tl = 0;
    lb.flat().forEach((n) => { if (n.p) n.p.forEach((p) => notes.push([tl, p, n.d * 0.95, 58])); tl += n.d; });
  }
  if (m.chords) notes.push(...accompany(m.chords, barLen, m.pickup, ts));
  notes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const r = (x) => Math.round(x * 1000) / 1000;
  return {
    v: 1, id: m.id, title: m.title, composer: m.composer, year: m.year, bpm: m.bpm, ts, pedal: !!m.pedal,
    notes: notes.map(([a, b, c, d]) => [r(a), b, r(c), d]),
    source: { name: 'Clued transcription', license: 'PD', page: m.page || undefined },
  };
}

const TRAD = 'Traditional';

export const MELODIES = [
  // ---- nursery rhymes (kids pack) ----
  { pack: 'nursery', id: 'twinkle-twinkle', title: 'Twinkle, Twinkle, Little Star', composer: TRAD, d: 1, bpm: 100,
    blurb: 'The tune is the French song "Ah! vous dirai-je, maman" (1761); the words are from a poem by Jane Taylor (1806).',
    rh: 'C4q C4 G4 G4 | A4 A4 G4h | F4q F4 E4 E4 | D4 D4 C4h | G4q G4 F4 F4 | E4 E4 D4h | G4q G4 F4 F4 | E4 E4 D4h | C4q C4 G4 G4 | A4 A4 G4h | F4q F4 E4 E4 | D4 D4 C4h',
    chords: 'C | F C | F C | G C | C F | C G | C F | C G | C | F C | F C | G C',
    lyrics: ['Twinkle, twinkle, little star', 'How I wonder what you are', 'Up above the world so high', 'Like a diamond in the sky'] },
  { pack: 'nursery', id: 'mary-had-a-little-lamb', title: 'Mary Had a Little Lamb', composer: TRAD, d: 1, bpm: 112,
    blurb: 'Words by Sarah Josepha Hale (1830), sung to a traditional American tune.',
    rh: 'E4q D4 C4 D4 | E4 E4 E4h | D4q D4 D4h | E4q G4 G4h | E4q D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4w',
    chords: 'C | C | G | C | C | C | G | C',
    lyrics: ['Mary had a little lamb', 'Little lamb, little lamb', 'Mary had a little lamb', 'Its fleece was white as snow'] },
  { pack: 'nursery', id: 'row-your-boat', title: 'Row, Row, Row Your Boat', composer: TRAD, d: 1, bpm: 96, ts: [6, 8],
    blurb: 'A traditional round, first printed in 1852.',
    rh: 'C4q. C4q. | C4q D4e E4q. | E4q D4e E4q F4e | G4h. | C5e C5 C5 G4 G4 G4 | E4 E4 E4 C4 C4 C4 | G4q F4e E4q D4e | C4h.',
    chords: 'C | C | C | C | C | C | G | C',
    lyrics: ['Row, row, row your boat', 'Gently down the stream', 'Merrily, merrily, merrily, merrily', 'Life is but a dream'] },
  { pack: 'nursery', id: 'frere-jacques', title: 'Frère Jacques', alt: ['Are You Sleeping', 'Brother John'], composer: TRAD, d: 1, bpm: 112,
    blurb: 'A French round from the 1700s, sung in English as "Are You Sleeping?".',
    rh: 'C4q D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4h | E4q F4 G4h | G4e A4 G4 F4 E4q C4 | G4e A4 G4 F4 E4q C4 | C4q G3 C4h | C4q G3 C4h',
    chords: 'C | C | C | C | C | C | C G | C',
    lyrics: ['Are you sleeping, are you sleeping', 'Brother John, Brother John?', 'Morning bells are ringing, morning bells are ringing', 'Ding, dang, dong. Ding, dang, dong.'] },
  { pack: 'nursery', id: 'london-bridge', title: 'London Bridge Is Falling Down', alt: ['London Bridge'], composer: TRAD, d: 1, bpm: 112,
    rh: 'G4q. A4e G4q F4 | E4 F4 G4h | D4q E4 F4h | E4q F4 G4h | G4q. A4e G4q F4 | E4 F4 G4h | D4h G4h | E4q C4h.',
    chords: 'C | C | G | C | C | C | G | C',
    lyrics: ['London Bridge is falling down', 'Falling down, falling down', 'London Bridge is falling down', 'My fair lady'] },
  { pack: 'nursery', id: 'old-macdonald', title: 'Old MacDonald Had a Farm', alt: ['Old MacDonald'], composer: TRAD, d: 1, bpm: 120,
    rh: 'G4q G4 G4 D4 | E4 E4 D4h | B4q B4 A4 A4 | G4h. D4q | G4 G4 G4 D4 | E4 E4 D4h | B4q B4 A4 A4 | G4w',
    chords: 'G | C G | G D | G | G | C G | G D | G',
    lyrics: ['Old MacDonald had a farm', 'E-I-E-I-O', 'And on that farm he had a cow', 'E-I-E-I-O'] },
  { pack: 'nursery', id: 'hot-cross-buns', title: 'Hot Cross Buns', composer: TRAD, d: 1, bpm: 108,
    rh: 'E4h D4h | C4w | E4h D4h | C4w | C4e C4 C4 C4 D4 D4 D4 D4 | E4h D4h | C4w',
    chords: 'C | C | C | C | C G | C G | C',
    lyrics: ['Hot cross buns!', 'Hot cross buns!', 'One a penny, two a penny', 'Hot cross buns!'] },
  { pack: 'nursery', id: 'happy-birthday', title: 'Happy Birthday to You', alt: ['Happy Birthday'], composer: 'Patty Hill and Mildred J. Hill', year: 1893, d: 1, bpm: 96, ts: [3, 4], pickup: 1,
    blurb: 'The melody comes from "Good Morning to All" (1893) by sisters Patty and Mildred Hill; a US court found in 2015 that the song had no valid copyright.',
    rh: 'G4e. G4s | A4q G4 C5 | B4h G4e. G4s | A4q G4 D5 | C5h G4e. G4s | G5q E5 C5 | B4 A4 F5e. F5s | E5q C5 D5 | C5h',
    chords: 'C | G | G | C | C | F | C G | C' },
  { pack: 'nursery', id: 'yankee-doodle', title: 'Yankee Doodle', composer: TRAD, d: 1, bpm: 132,
    blurb: 'A song from the time of the American Revolution (1770s).',
    rh: 'C4q C4 D4 E4 | C4 E4 D4 G3 | C4 C4 D4 E4 | C4h B3h | C4q C4 D4 E4 | F4 E4 D4 C4 | B3 G3 A3 B3 | C4h C4h',
    chords: 'C | C G | C | C G | C | F G | G | C',
    lyrics: ['Yankee Doodle went to town', 'A-riding on a pony', 'Stuck a feather in his cap', 'And called it macaroni'] },
  { pack: 'nursery', id: 'ode-to-joy-kids', title: 'Ode to Joy', composer: 'Ludwig van Beethoven', year: 1824, d: 1, bpm: 112, sameAs: 'ode-to-joy' },

  // ---- carols & old songs (pd-melodies) ----
  { pack: 'pd', id: 'jingle-bells', title: 'Jingle Bells', composer: 'James Lord Pierpont', year: 1857, d: 1, bpm: 132, origin: 'Christmas',
    rh: 'B4q B4 B4h | B4q B4 B4h | B4q D5 G4q. A4e | B4w | C5q C5 C5q. C5e | C5q B4 B4 B4e B4 | B4q A4 A4 B4 | A4h D5h | B4q B4 B4h | B4q B4 B4h | B4q D5 G4q. A4e | B4w | C5q C5 C5 C5 | C5 B4 B4 B4e B4 | D5q D5 C5 A4 | G4w',
    chords: 'G | G | G | G | C | G | A7 | D7 | G | G | G | G | C | G | D7 | G',
    lyrics: ['Jingle bells, jingle bells', 'Jingle all the way', 'Oh, what fun it is to ride', 'In a one-horse open sleigh'] },
  { pack: 'pd', id: 'silent-night', title: 'Silent Night', composer: 'Franz Xaver Gruber', year: 1818, d: 1, bpm: 84, ts: [6, 8], origin: 'Christmas', pedal: true,
    rh: 'G4q. A4e G4q | E4h. | G4q. A4e G4q | E4h. | D5h D5q | B4h. | C5h C5q | G4h. | A4h A4q | C5q. B4e A4q | G4q. A4e G4q | E4h. | A4h A4q | C5q. B4e A4q | G4q. A4e G4q | E4h. | D5h D5q | F5q. D5e B4q | C5h. | E5h. | C5q. G4e E4q | G4q. F4e D4q | C4h. | C4h.',
    chords: 'C | C | C | C | G | G | C | C | F | F | C | C | F | F | C | C | G | G | C | C | C | G | C | C',
    lyrics: ['Silent night, holy night', 'All is calm, all is bright', 'Round yon virgin mother and child', 'Holy infant so tender and mild'] },
  { pack: 'pd', id: 'deck-the-halls', title: 'Deck the Halls', composer: TRAD, d: 1, bpm: 120, origin: 'Christmas',
    blurb: 'A Welsh melody from the 1700s with English words from 1862.',
    rh: 'G4q. F4e E4q D4 | C4 D4 E4 C4 | D4e E4 F4 D4 E4q. D4e | C4q B3 C4h | G4q. F4e E4q D4 | C4 D4 E4 C4 | D4e E4 F4 D4 E4q. D4e | C4q B3 C4h | D4q. E4e F4q D4 | E4q. F4e G4q D4 | E4e F#4 G4q A4e B4 C5q | B4 A4 G4h | G4q. F4e E4q D4 | C4 D4 E4 C4 | A4e A4 A4 A4 G4q. F4e | E4q D4 C4h',
    chords: 'C | C | G C | G C | C | C | G C | G C | G | C G | C D | G | C | C | F | G C',
    lyrics: ['Deck the halls with boughs of holly', 'Fa la la la la, la la la la', "'Tis the season to be jolly", 'Fa la la la la, la la la la'] },
  { pack: 'pd', id: 'we-wish-you', title: 'We Wish You a Merry Christmas', composer: TRAD, d: 1, bpm: 132, ts: [3, 4], pickup: 1, origin: 'Christmas',
    rh: 'D4q | G4q G4e A4 G4 F#4 | E4q C4 E4 | A4q A4e B4 A4 G4 | F#4q D4 F#4 | B4q B4e C5 B4 A4 | G4q E4 D4e D4 | E4q A4 F#4 | G4h',
    chords: 'G | C | D | D | Em | C | C D | G',
    lyrics: ['We wish you a Merry Christmas', 'We wish you a Merry Christmas', 'We wish you a Merry Christmas', 'And a Happy New Year'] },
  { pack: 'pd', id: 'joy-to-the-world', title: 'Joy to the World', composer: 'Lowell Mason (tune "Antioch"), words by Isaac Watts', composerShort: 'Lowell Mason', year: 1839, d: 2, bpm: 88, ts: [2, 4], origin: 'Christmas',
    rh: 'C5q B4e. A4s | G4q. F4e | E4q D4 | C4q. G4e | A4q. A4e | B4q. B4e | C5h',
    chords: 'C | C | C G | C | F | G | C',
    lyrics: ['Joy to the world, the Lord is come', 'Let earth receive her King'] },
  { pack: 'pd', id: 'greensleeves', title: 'Greensleeves', composer: TRAD, d: 2, bpm: 132, ts: [3, 4], pickup: 1, origin: 'Folk', pedal: true,
    blurb: 'An English folk tune from the 1500s, later used for the carol "What Child Is This?".',
    rh: 'A4q | C5h D5q | E5q. F5e E5q | D5h B4q | G4q. A4e B4q | C5h A4q | A4q. G#4e A4q | B4h G#4q | E4h A4q | C5h D5q | E5q. F5e E5q | D5h B4q | G4q. A4e B4q | C5q. B4e A4q | G#4q. F#4e G#4q | A4h.',
    chords: 'Am | C | G | Em | Am | E | E | Am | Am | C | G | Em | Am | E | Am',
    lyrics: ['Alas, my love, you do me wrong', 'To cast me off discourteously'] },
  { pack: 'pd', id: 'amazing-grace', title: 'Amazing Grace', composer: 'Traditional American tune "New Britain"; words by John Newton', composerShort: TRAD, year: 1835, d: 1, bpm: 84, ts: [3, 4], pickup: 1, origin: 'Hymn', pedal: true,
    blurb: 'Words by John Newton (1779), sung to the American tune "New Britain" (1835).',
    rh: 'D4q | G4h B4e G4 | B4h A4q | G4h E4q | D4h D4q | G4h B4e G4 | B4h A4q | D5h B4q | D5h B4e G4 | B4h A4q | G4h E4q | D4h D4q | G4h B4e G4 | B4h A4q | G4h.',
    chords: 'G | G | C | G | G | D | G | G | G | C | G | G | D | G',
    lyrics: ['Amazing grace, how sweet the sound', 'That saved a wretch like me', 'I once was lost, but now am found', 'Was blind, but now I see'] },
  { pack: 'pd', id: 'oh-susanna', title: 'Oh! Susanna', composer: 'Stephen Foster', year: 1848, d: 2, bpm: 120, pickup: 1, origin: 'American song',
    rh: 'C4e D4 | E4q G4 G4q. A4e | G4q E4 C4q. D4e | E4q E4 D4 C4 | D4h. C4e D4 | E4q G4 G4q. A4e | G4q E4 C4q. D4e | E4q E4 D4 D4 | C4h.',
    chords: 'C | C | C | G | C | C | G | C',
    lyrics: ['I come from Alabama with my banjo on my knee', "I'm going to Louisiana, my true love for to see"] },
  { pack: 'pd', id: 'daisy-bell', title: 'Daisy Bell (Bicycle Built for Two)', alt: ['Daisy Bell', 'Bicycle Built for Two', 'Daisy, Daisy'], composer: 'Harry Dacre', year: 1892, d: 2, bpm: 160, ts: [3, 4], origin: 'Music hall',
    rh: 'D5h. | B4h. | G4h. | D4h. | E4q F#4 G4 | E4h G4q | D4h. | D4h. | A4h. | D5h. | B4h. | G4h. | E4q F#4 G4 | A4h B4q | A4h. | A4h.',
    lyrics: ['Daisy, Daisy, give me your answer, do', "I'm half crazy all for the love of you"] },
  { pack: 'pd', id: 'take-me-out', title: 'Take Me Out to the Ball Game', composer: 'Albert Von Tilzer', year: 1908, d: 2, bpm: 168, ts: [3, 4], origin: 'American song',
    rh: 'C4h C5q | A4q G4 E4 | G4h. | D4h. | C4h C5q | A4q G4 E4 | G4h. | G4h. | A4q G#4 A4 | E4 F4 G4 | A4h F4q | D4h. | A4h A4q | A4q B4 C5 | D5q B4 A4 | G4q E4 D4',
    lyrics: ['Take me out to the ball game', 'Take me out with the crowd', 'Buy me some peanuts and Cracker Jack', "I don't care if I never get back"] },

  // ---- classical themes not on Mutopia as piano MIDI ----
  { pack: 'classical', id: 'ode-to-joy', title: 'Ode to Joy (Symphony No. 9)', alt: ['Ode to Joy', 'Symphony No. 9'], composer: 'Ludwig van Beethoven', year: 1824, d: 1, bpm: 112,
    rh: 'E4q E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4q. D4e D4h | E4q E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4q. C4e C4h | D4q D4 E4 C4 | D4 E4e F4 E4q C4 | D4 E4e F4 E4q D4 | C4 D4 G3h | E4q E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4q. C4e C4h',
    chords: 'C | G | C | G | C | G | C | G C | G C | G C | G | C G | C | G | C | G C' },
  { pack: 'classical', id: 'canon-in-d', title: 'Canon in D', alt: ["Pachelbel's Canon"], composer: 'Johann Pachelbel', year: 1690, yearNote: 'c.', d: 1, bpm: 62, pedal: true,
    rh: 'rw | rw | F#5q E5 D5 C#5 | B4 A4 B4 C#5 | D5 C#5 B4 A4 | G4 F#4 G4 E4 | D4e F#4 A4 G4 F#4 D4 F#4 E4 | D4 B3 D4 A4 G4 B4 A4 G4',
    lh: 'D3q A2 B2 F#2 | G2 D2 G2 A2 | D3q A2 B2 F#2 | G2 D2 G2 A2 | D3q A2 B2 F#2 | G2 D2 G2 A2 | D3q A2 B2 F#2 | G2 D2 G2 A2' },
  { pack: 'classical', id: 'eine-kleine-nachtmusik', title: 'Eine kleine Nachtmusik', alt: ['A Little Night Music', 'Serenade No. 13'], composer: 'Wolfgang Amadeus Mozart', year: 1787, d: 1, bpm: 132,
    rh: 'G4q r8 D4e G4q r8 D4e | G4e D4 G4 B4 D5q r | C5q r8 A4e C5q r8 A4e | C5e A4 F#4 A4 D4q r',
    lh: 'G2+G3q r G2+G3 r | G2+G3e r r r G2+G3q r | D3+F#3q r D3+F#3 r | D3+F#3e r r r D3q r' },
];

// 'r8' is accepted as an eighth rest for readability
for (const m of MELODIES) if (m.rh) m.rh = m.rh.replace(/\br8\b/g, 're'), m.lh && (m.lh = m.lh.replace(/\br8\b/g, 're'));
