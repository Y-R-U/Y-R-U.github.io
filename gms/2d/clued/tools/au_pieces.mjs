#!/usr/bin/env node
// Build piano note files + the piano packs.
//   node tools/au_pieces.mjs            → data/music/notes/*.json, data/music/{classical-piano,pd-melodies,nursery-rhymes}.json
// Mutopia MIDI + piece pages are cached in ~/.cache/clued-au/midi/. Hand transcriptions live in tools/au_melodies.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseMidi, toPiece } from './au_midi2json.mjs';
import { MELODIES, compile } from './au_melodies.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIDI = process.env.AU_MIDI || path.join(os.homedir(), '.cache/clued-au/midi');
const NOTES = path.join(ROOT, 'data/music/notes');
const MUT = 'https://www.mutopiaproject.org';

// mutopia piece id, optional file inside a -mids.zip, seconds to keep, start beat, tracks to drop
export const MUTOPIA = [
  { id: 'fur-elise', title: 'Für Elise', composer: 'Ludwig van Beethoven', year: 1810, mutopia: 931, secs: 32, d: 1 },
  { id: 'moonlight-sonata', title: 'Moonlight Sonata (1st movement)', alt: ['Moonlight Sonata', 'Piano Sonata No. 14'], composer: 'Ludwig van Beethoven', year: 1801, mutopia: 276, file: 'moonlight1.mid', secs: 40, d: 1 },
  { id: 'beethoven-5', title: 'Symphony No. 5 (opening)', alt: ['Symphony No. 5', 'Fifth Symphony'], composer: 'Ludwig van Beethoven', year: 1808, mutopia: 497, secs: 25, d: 1 },
  { id: 'prelude-in-c', title: 'Prelude in C major (The Well-Tempered Clavier)', alt: ['Prelude in C', 'Prelude in C major'], composer: 'Johann Sebastian Bach', year: 1722, mutopia: 5, secs: 35, d: 2 },
  { id: 'minuet-in-g', title: 'Minuet in G major', alt: ['Minuet in G'], composer: 'Christian Petzold (long credited to J. S. Bach)', composerShort: 'Christian Petzold', year: 1725, mutopia: 75, secs: 30, d: 2,
    blurb: 'From the Notebook for Anna Magdalena Bach; long credited to Bach, now attributed to Christian Petzold.' },
  { id: 'toccata-and-fugue', title: 'Toccata and Fugue in D minor', composer: 'Johann Sebastian Bach', year: 1704, yearNote: 'c.', mutopia: 1780, secs: 25, d: 1 },
  { id: 'air-on-g', title: 'Air (Orchestral Suite No. 3)', alt: ['Air on the G String', 'Air'], composer: 'Johann Sebastian Bach', year: 1730, yearNote: 'c.', mutopia: 242, file: 'bach-air-score.mid', secs: 35, d: 2 },
  { id: 'gymnopedie-1', title: 'Gymnopédie No. 1', alt: ['Gymnopedie No. 1', 'Gymnopedie'], composer: 'Erik Satie', year: 1888, mutopia: 37, secs: 40, d: 2 },
  { id: 'gnossienne-1', title: 'Gnossienne No. 1', alt: ['Gnossienne'], composer: 'Erik Satie', year: 1890, mutopia: 2035, secs: 35, d: 3 },
  { id: 'rondo-alla-turca', title: 'Rondo alla Turca (Turkish March)', alt: ['Turkish March', 'Rondo alla Turca'], composer: 'Wolfgang Amadeus Mozart', year: 1783, mutopia: 108, secs: 30, d: 1 },
  { id: 'sonata-facile', title: 'Piano Sonata No. 16 "Sonata facile" (1st movement)', alt: ['Sonata facile', 'Sonata in C K. 545'], composer: 'Wolfgang Amadeus Mozart', year: 1788, mutopia: 998, secs: 30, d: 2 },
  { id: 'nocturne-op9-2', title: 'Nocturne in E-flat major, Op. 9 No. 2', alt: ['Nocturne Op. 9 No. 2', 'Nocturne'], composer: 'Frédéric Chopin', year: 1832, mutopia: 1590, secs: 35, d: 2 },
  { id: 'minute-waltz', title: 'Minute Waltz (Waltz in D-flat, Op. 64 No. 1)', alt: ['Minute Waltz'], composer: 'Frédéric Chopin', year: 1847, mutopia: 483, secs: 25, d: 2 },
  { id: 'prelude-op28-4', title: 'Prelude in E minor, Op. 28 No. 4', alt: ['Prelude Op. 28 No. 4'], composer: 'Frédéric Chopin', year: 1839, mutopia: 468, secs: 35, d: 3 },
  { id: 'prelude-op28-7', title: 'Prelude in A major, Op. 28 No. 7', alt: ['Prelude Op. 28 No. 7'], composer: 'Frédéric Chopin', year: 1839, mutopia: 470, secs: 40, d: 3 },
  { id: 'the-entertainer', title: 'The Entertainer', composer: 'Scott Joplin', year: 1902, mutopia: 263, secs: 30, d: 1 },
  { id: 'maple-leaf-rag', title: 'Maple Leaf Rag', composer: 'Scott Joplin', year: 1899, mutopia: 23, secs: 30, d: 2 },
  { id: 'arabesque-1', title: 'Arabesque No. 1', alt: ['Première Arabesque', 'Arabesque'], composer: 'Claude Debussy', year: 1891, mutopia: 1777, secs: 30, d: 3 },
  { id: 'clair-de-lune', title: 'Clair de lune', composer: 'Claude Debussy', year: 1905, mutopia: 1778, secs: 40, d: 1 },
  { id: 'mountain-king', title: 'In the Hall of the Mountain King', composer: 'Edvard Grieg', year: 1875, mutopia: 1888, secs: 35, d: 1 },
  { id: 'wedding-day-troldhaugen', title: 'Wedding Day at Troldhaugen', composer: 'Edvard Grieg', year: 1896, mutopia: 781, secs: 30, d: 3 },
  { id: 'ave-maria-schubert', title: 'Ave Maria (Ellens dritter Gesang)', alt: ['Ave Maria'], composer: 'Franz Schubert', year: 1825, mutopia: 1054, secs: 35, d: 2 },
  { id: 'wedding-march', title: 'Wedding March (A Midsummer Night\'s Dream)', alt: ['Wedding March'], composer: 'Felix Mendelssohn', year: 1842, mutopia: 2198, secs: 25, d: 1 },
  { id: 'spring-vivaldi', title: 'Spring (The Four Seasons)', alt: ['Spring', 'La primavera', 'The Four Seasons'], composer: 'Antonio Vivaldi', year: 1725, mutopia: 301, file: 'spring-score-1.mid', secs: 25, d: 1 },
  { id: 'brahms-lullaby', title: 'Lullaby (Wiegenlied, Op. 49 No. 4)', alt: ["Brahms' Lullaby", 'Wiegenlied', 'Lullaby'], composer: 'Johannes Brahms', year: 1868, mutopia: 1037, file: 'Wiegenlied.mid', secs: 30, d: 1 },
  { id: 'blue-danube', title: 'The Blue Danube', alt: ['Blue Danube'], composer: 'Johann Strauss II', year: 1866, mutopia: 519, secs: 35, d: 1 },
  { id: 'carmen-prelude', title: 'Carmen: Prelude', alt: ['Carmen'], composer: 'Georges Bizet', year: 1875, mutopia: 635, secs: 25, d: 2 },
  { id: 'wooden-soldiers', title: 'March of the Wooden Soldiers', composer: 'Pyotr Ilyich Tchaikovsky', year: 1878, mutopia: 1806, secs: 25, d: 3 },
  { id: 'liszt-consolation-3', title: 'Consolation No. 3', alt: ['Consolation'], composer: 'Franz Liszt', year: 1850, mutopia: 1647, secs: 35, d: 3 },
];

// background music: gentle pieces, kept up to ~150 s, written to data/music/bgm/ with an index.json playlist
export const BGM = [
  { id: 'gymnopedie-1', title: 'Gymnopédie No. 1', composer: 'Erik Satie', mutopia: 37 },
  { id: 'gymnopedie-2', title: 'Gymnopédie No. 2', composer: 'Erik Satie', mutopia: 38 },
  { id: 'gymnopedie-3', title: 'Gymnopédie No. 3', composer: 'Erik Satie', mutopia: 39 },
  { id: 'gnossienne-1', title: 'Gnossienne No. 1', composer: 'Erik Satie', mutopia: 2035 },
  { id: 'gnossienne-3', title: 'Gnossienne No. 3', composer: 'Erik Satie', mutopia: 2131 },
  { id: 'clair-de-lune', title: 'Clair de lune', composer: 'Claude Debussy', mutopia: 1778 },
  { id: 'prelude-in-c', title: 'Prelude in C major, BWV 846', composer: 'Johann Sebastian Bach', mutopia: 5 },
  { id: 'traumerei', title: 'Träumerei (Kinderszenen)', composer: 'Robert Schumann', mutopia: 504 },
  { id: 'von-fremden-landern', title: 'Of Foreign Lands and Peoples (Kinderszenen)', composer: 'Robert Schumann', mutopia: 354 },
  { id: 'nocturne-op9-2', title: 'Nocturne Op. 9 No. 2', composer: 'Frédéric Chopin', mutopia: 1590 },
  { id: 'nocturne-e-minor', title: 'Nocturne in E minor, Op. 72 No. 1', composer: 'Frédéric Chopin', mutopia: 509 },
  { id: 'prelude-op28-4', title: 'Prelude Op. 28 No. 4', composer: 'Frédéric Chopin', mutopia: 468 },
  { id: 'prelude-op28-15', title: 'Prelude Op. 28 No. 15 "Raindrop"', composer: 'Frédéric Chopin', mutopia: 471 },
  { id: 'consolation-3', title: 'Consolation No. 3', composer: 'Franz Liszt', mutopia: 1647 },
  { id: 'consolation-1', title: 'Consolation No. 1', composer: 'Franz Liszt', mutopia: 1654 },
  { id: 'field-nocturne-5', title: 'Nocturne No. 5', composer: 'John Field', mutopia: 2137 },
  { id: 'gondellied', title: 'Venetian Boat Song, Op. 30 No. 6', composer: 'Felix Mendelssohn', mutopia: 1741 },
  { id: 'morning-prayer', title: 'Morning Prayer, Op. 39 No. 1', composer: 'Pyotr Ilyich Tchaikovsky', mutopia: 2032 },
  { id: 'old-french-song', title: 'Old French Song, Op. 39 No. 16', composer: 'Pyotr Ilyich Tchaikovsky', mutopia: 2080 },
  { id: 'albumblatt', title: 'Albumblatt, Op. 12 No. 3', composer: 'Edvard Grieg', mutopia: 2194 },
];

async function buildBgm() {
  const dir = path.join(ROOT, 'data/music/bgm');
  fs.mkdirSync(dir, { recursive: true });
  const list = [];
  for (const m of BGM) {
    try {
      const piece = await buildMutopia({ ...m, id: 'bgm-' + m.id, secs: 150, d: 1 });
      // soften: cap velocities so nothing jumps out of the background
      piece.notes = piece.notes.map(([b, n, d, v]) => [b, n, d, Math.min(v, 72)]);
      piece.id = m.id;
      fs.writeFileSync(path.join(dir, m.id + '.json'), JSON.stringify(piece));
      list.push({ id: m.id, title: m.title, composer: m.composer, src: `data/music/bgm/${m.id}.json`, license: piece.source.license, page: piece.source.page, credit: `${m.composer}; MIDI from the Mutopia Project${piece.source.by ? ', maintained by ' + piece.source.by : ''}` });
      console.log(`bgm ${m.id} ${Math.round(durationOf(piece))}s ${piece.source.license}`);
    } catch (e) { console.log(`bgm FAIL ${m.id}: ${e.message}`); }
  }
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ pieces: list, piano: 'Salamander Grand Piano V3 by Alexander Holm (CC BY 3.0)' }, null, 1));
}

async function download(url, file) {
  if (fs.existsSync(file)) return;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

async function mutopiaInfo(id) {
  const f = path.join(MIDI, `info-${id}.html`);
  await download(`${MUT}/cgibin/piece-info.cgi?id=${id}`, f);
  const html = fs.readFileSync(f, 'utf8');
  const mid = html.match(/href="([^"]+\.mid)"/)?.[1];
  const zip = html.match(/href="([^"]+-mids\.zip)"/)?.[1];
  const lic = html.match(/legal\.html#[^"]*">([^<]+)</)?.[1]?.trim();
  const cell = (label) => html.match(new RegExp(`<th>${label}</th>\\s*<td>([^<]*)`, 'i'))?.[1]?.trim();
  return { mid, zip, license: lic, typesetter: html.match(/Maintainer:<\/b>\s*([^<]+)</)?.[1]?.trim(), arranger: cell('Arranger'), page: `${MUT}/cgibin/piece-info.cgi?id=${id}` };
}

const LIC = { 'Public Domain': 'PD', 'Creative Commons Attribution 3.0': 'CC BY 3.0', 'Creative Commons Attribution 4.0': 'CC BY 4.0',
  'Creative Commons Attribution-ShareAlike 2.5': 'CC BY-SA 2.5', 'Creative Commons Attribution-ShareAlike 3.0': 'CC BY-SA 3.0', 'Creative Commons Attribution-ShareAlike 4.0': 'CC BY-SA 4.0' };

function roundToBar(beats, ts) {
  const bar = ts ? (ts[0] * 4) / ts[1] : 4;
  return Math.max(bar, Math.round(beats / bar) * bar);
}

async function buildMutopia(m) {
  const info = await mutopiaInfo(m.mutopia);
  let buf;
  if (info.mid && !m.file) {
    const f = path.join(MIDI, `${m.id}.mid`);
    await download(info.mid, f);
    buf = fs.readFileSync(f);
  } else {
    const z = path.join(MIDI, `${m.id}.zip`);
    await download(info.zip || info.mid, z);
    buf = execFileSync('unzip', ['-p', z, m.file]);
  }
  const midi = parseMidi(buf);
  const full = toPiece(midi, {});
  const bpm = full.bpm;
  const beats = roundToBar((m.secs * bpm) / 60, full.ts);
  const piece = toPiece(midi, { from: m.from || 0, beats, skipTracks: m.skipTracks || [] });
  const license = LIC[info.license] || info.license;
  return {
    v: 1, id: m.id, title: m.title, composer: m.composer, year: m.year, bpm: piece.bpm, ts: piece.ts, pedal: m.pedal ?? true,
    notes: piece.notes,
    source: { name: 'Mutopia Project', page: info.page, license, by: info.typesetter || undefined },
  };
}

function itemFor(m, piece, kind) {
  const src = `data/music/notes/${m.noteId || m.id}.json`;
  const credit = piece.source.name === 'Mutopia Project'
    ? `${m.composer} (composer); MIDI from the Mutopia Project${piece.source.by ? `, maintained by ${piece.source.by}` : ''}; Salamander Grand Piano samples by Alexander Holm (CC BY 3.0)`
    : `${m.composer} (${m.composerRole || 'composer'}); transcribed by Clued from public-domain sources; Salamander Grand Piano samples by Alexander Holm (CC BY 3.0)`;
  const composer = m.composerShort || m.composer;
  const facts = { ...(/^traditional$/i.test(composer) ? {} : { composer }), ...(m.year ? { year: m.year } : {}) };
  if (m.origin) facts.origin = m.origin;
  return {
    id: m.id, name: m.title, alt: m.alt, group: kind === 'classical' ? composer : (m.group || undefined),
    facts,
    blurb: m.blurb || (kind === 'classical' ? `${m.title} by ${m.composer}${m.year ? ` (${m.yearNote || ''}${m.yearNote ? ' ' : ''}${m.year})` : ''}.` : `${m.title}${m.composer && !/traditional/i.test(m.composer) ? `, by ${m.composer}` : ''}${m.year ? ` (${m.yearNote ? m.yearNote + ' ' : ''}${m.year})` : ''}.`),
    ...(m.lyrics ? { lyrics: m.lyrics } : {}),
    media: { audio: [{ type: 'piano', src, credit, license: piece.source.license, page: piece.source.page || `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(m.title.replace(/ \(.*\)$/, ''))}`, start: 0, dur: Math.round(durationOf(piece)) }] },
    difficulty: m.d || 2,
  };
}

const durationOf = (p) => p.notes.reduce((mx, [b, , d]) => Math.max(mx, b + d), 0) * 60 / p.bpm;

function pack(id, title, icon, items, extra = {}) {
  return {
    id, title, theme: 'music', icon, kids: false, version: 1,
    factsMeta: {
      composer: { type: 'cat', label: 'Composer', ask: 'Who composed {name}?', askReverse: 'Which of these pieces is by {value}?', stmt: '{name} was composed by {value}.' },
      year: { type: 'year', label: 'Written', higherLabel: 'Later', askHigh: 'Which of these was written most recently?', askLow: 'Which of these was written first?', askNumber: 'In what year was {name} written?' },
      ...(extra.factsMeta || {}),
    },
    items, questions: [],
    sources: [
      { name: 'Salamander Grand Piano V3 by Alexander Holm (CC BY 3.0)', url: 'https://archive.org/details/SalamanderGrandPianoV3' },
      ...(extra.sources || []),
    ],
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => !['factsMeta', 'sources'].includes(k))),
  };
}

async function main() {
  fs.mkdirSync(NOTES, { recursive: true });
  fs.mkdirSync(MIDI, { recursive: true });
  const classical = [], melodies = [], nursery = [];
  for (const m of MUTOPIA) {
    try {
      const piece = await buildMutopia(m);
      fs.writeFileSync(path.join(NOTES, m.id + '.json'), JSON.stringify(piece));
      classical.push(itemFor(m, piece, 'classical'));
      console.log(`ok  ${m.id}  ${piece.notes.length} notes  ${Math.round(durationOf(piece))}s  ${piece.source.license}`);
    } catch (e) { console.log(`FAIL ${m.id}: ${e.message}`); }
  }
  const compiled = {};
  for (const m of MELODIES.filter((x) => !x.sameAs)) compiled[m.id] = compile(m);
  for (const m of MELODIES) {
    const piece = compiled[m.sameAs || m.id];
    if (!m.sameAs) fs.writeFileSync(path.join(NOTES, m.id + '.json'), JSON.stringify(piece));
    const it = itemFor({ ...m, noteId: m.sameAs }, piece, m.pack);
    (m.pack === 'classical' ? classical : m.pack === 'nursery' ? nursery : melodies).push(it);
  }
  const W = (p) => fs.writeFileSync(path.join(ROOT, 'data/music', p.id + '.json'), JSON.stringify(p, null, 1));
  W(pack('classical-piano', 'Classical on piano', '🎹', classical, {
    notice: 'Played on a sampled grand piano from public-domain scores.',
    sources: [{ name: 'Mutopia Project (public-domain and Creative Commons scores/MIDI)', url: MUT }, { name: 'Clued transcriptions of public-domain themes' }],
  }));
  W(pack('pd-melodies', 'Old songs & carols', '🎼', melodies, {
    notice: 'Public-domain melodies played on a sampled piano.',
    // Joy to the World and Silent Night are carols and hymns at once: a question would have two right answers
    factsMeta: { origin: { type: 'cat', label: 'Kind of song', ask: false, stmt: false } },
    sources: [{ name: 'Clued transcriptions of public-domain melodies (published before 1931 or traditional)' }],
  }));
  W({ ...pack('nursery-rhymes', 'Nursery rhymes', '🧸', nursery, {
    factsMeta: {},
    sources: [{ name: 'Clued transcriptions of traditional nursery-rhyme melodies (public domain)' }],
  }), kids: true });
  console.log(`classical ${classical.length}, melodies ${melodies.length}, nursery ${nursery.length}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) (process.argv[2] === 'bgm' ? buildBgm() : main());
