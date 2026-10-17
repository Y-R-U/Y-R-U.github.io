// Builds data/packs/<pack>.json from tools/mv_prompts*.json + the webp files that exist (approved scenes only), and
// data/candidates/<pack>.json from the `cand: true` scenes of titles not live yet (review.html only; never in data/index.json),
// and data/candidates/<pack>-more.json from candidates of titles that already have a live picture (offered as extras,
// each item carrying `live`: the pictures already in the pack, shown small beside the candidate).
// Usage: node tools/mv_build.mjs [movie-moments|book-moments|song-pictures|all] [--candidates]
import fs from 'fs';
import path from 'path';
import { PACKS, sceneRel, refFor, hasLive } from './mv_paths.mjs';
import { directorLevels, DIRECTOR_PICTURE } from './c2_directors.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CREDIT = 'Clued (AI-generated illustration)';
const PAGE = 'https://y-r-u.github.io/gms/2d/clued/docs/notes/MV.md';

const DEFS = {
  'movie-moments': {
    head: {
      title: 'Movie Moments', theme: 'screen', icon: '🎬',
      notice: 'Original illustrations of famous film scenes, not real stills.',
      nameImgPrompt: 'What movie is this?', imgPrompt: 'Which picture shows {name}?',
      factsMeta: {
        year: { type: 'year', label: 'Released', askHigh: 'Which of these films came out most recently?', askLow: 'Which of these films came out first?', askNumber: 'In what year did {name} come out?' },
        decade: { type: 'cat', label: 'Decade', ask: 'In which decade did {name} come out?', askReverse: 'Which of these films came out in the {value}?', stmt: '{name} came out in the {value}.' },
        director: { type: 'cat', label: 'Directed by', noun: 'director', ask: 'Who directed {name}?', askReverse: 'Which of these films was directed by {value}?', stmt: '{name} was directed by {value}.', ...DIRECTOR_PICTURE },
        kids: { type: 'bool', label: 'Family film', yes: 'Family film', no: 'Not a family film', askBool: 'Which of these is a family film?', stmt: '{name} is a family film.' },
      },
    },
    facts: f => ({ year: f.year, decade: `${Math.floor(f.year / 10) * 10}s`, ...(f.director ? { director: f.director } : {}), kids: !!f.kids }),
  },
  'book-moments': {
    head: {
      title: 'Book Moments', theme: 'books', icon: '📖',
      notice: 'Original illustrations of scenes from famous books.',
      nameImgPrompt: 'What book is this?', imgPrompt: 'Which picture shows {name}?',
      factsMeta: {
        author: { type: 'cat', label: 'Author', ask: 'Who wrote {name}?', askReverse: 'Which of these books is by {value}?', stmt: '{name} was written by {value}.' },
        year: { type: 'year', label: 'Published', askHigh: 'Which of these books came out most recently?', askLow: 'Which of these books came out first?', askNumber: 'In what year was {name} first published?' },
        century: { type: 'cat', label: 'Century', ask: 'In which century was {name} first published?', stmt: '{name} was first published in the {value}.', askReverse: 'Which of these books was first published in the {value}?' },
        kids: { type: 'bool', label: "Children's book", yes: "Children's book", no: 'Not a children\'s book', askBool: "Which of these is a children's book?", stmt: "{name} is a children's book." },
      },
    },
    facts: f => ({ author: f.author, year: f.year, century: century(f.year), kids: !!f.kids }),
  },
  'tv-moments': {
    head: {
      title: 'TV Moments', theme: 'screen', icon: '📺',
      notice: 'Original illustrations of famous TV series, not real stills.',
      nameImgPrompt: 'What TV show is this?', imgPrompt: 'Which picture shows {name}?',
      factsMeta: {
        year: { type: 'year', label: 'First shown', askHigh: 'Which of these shows started most recently?', askLow: 'Which of these shows started first?', askNumber: 'In what year was {name} first shown?' },
        decade: { type: 'cat', label: 'Decade', ask: 'In which decade did {name} start?', askReverse: 'Which of these TV shows started in the {value}?', stmt: '{name} started in the {value}.' },
        country: { type: 'cat', label: 'Country of origin', ask: 'Which country does {name} come from?', askReverse: 'Which of these TV shows comes from {value}?', stmt: 'Country of origin of {name}: {value}.' },
        network: { type: 'cat', label: 'First shown on', noun: 'channel', ask: 'Which channel first showed {name}?', askReverse: 'Which of these shows was first shown on {value}?', stmt: '{name} was first shown on {value}.' },
        kids: { type: 'bool', label: "Children's show", yes: "Children's show", no: 'Not a children’s show', askBool: "Which of these is a children's show?", stmt: "{name} is a children's show." },
      },
    },
    facts: f => ({ year: f.year, decade: `${Math.floor(f.year / 10) * 10}s`, country: f.country, ...(f.network ? { network: f.network } : {}), kids: !!f.kids }),
  },
  'song-pictures': {
    head: {
      title: 'Song Pictures', theme: 'music', icon: '🎨',
      notice: 'Song titles drawn literally.',
      nameImgPrompt: 'Which song title is drawn here?', imgPrompt: 'Which picture shows "{name}"?',
      factsMeta: {
        artist: { type: 'cat', label: 'Artist', ask: 'Who recorded {name}?', askReverse: 'Which of these songs is by {value}?', stmt: '{name} is by {value}.' },
        year: { type: 'year', label: 'Released', askHigh: 'Which of these songs came out most recently?', askLow: 'Which of these songs came out first?', askNumber: 'In what year did {name} come out?' },
        decade: { type: 'cat', label: 'Decade', ask: 'In which decade did {name} come out?', askReverse: 'Which of these songs came out in the {value}?', stmt: '{name} came out in the {value}.' },
        kids: { type: 'bool', label: 'Family friendly', yes: 'Family friendly', no: 'Grown-up pick', askBool: 'Which of these is family friendly?', stmt: '{name} is family friendly.' },
      },
    },
    facts: f => ({ artist: f.artist, year: f.year, decade: `${Math.floor(f.year / 10) * 10}s`, kids: !!f.kids }),
  },
};

function century(y) {
  const c = Math.floor((y - 1) / 100) + 1, n = c % 100;
  return `${c}${n >= 11 && n <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][c % 10] || 'th'} century`;
}

function webpSize(file) {
  const b = fs.readFileSync(file);
  const tag = b.toString('ascii', 12, 16);
  if (tag === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (tag === 'VP8L') { const n = b.readUInt32LE(21); return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1]; }
  if (tag === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  throw new Error('not a webp: ' + file);
}

function build(id, cands = false) {
  const def = DEFS[id];
  const src = path.join(ROOT, PACKS[id].prompts);
  if (!fs.existsSync(src)) return console.log(id, ': no prompts file, skipped');
  const cfg = JSON.parse(fs.readFileSync(src, 'utf8'));
  const items = [], more = [];
  const exists = rel => fs.existsSync(path.join(ROOT, rel));
  for (const f of cfg.films) {
    const live = cands && hasLive(exists, id, f);
    const img = [];
    f.scenes.forEach((sc, i) => {
      const key = `${f.id}-${i + 1}`, file = sceneRel(id, key, sc);
      if (sc.drop || !sc.cand !== !cands || !fs.existsSync(path.join(ROOT, file))) return;
      const [w, h] = webpSize(path.join(ROOT, file));
      img.push({ src: file, w, h, credit: CREDIT, license: 'CC0', page: PAGE, difficulty: sc.d, caption: sc.cap, ...(cands ? { key, ref: refFor(id, key, live) } : {}) });
    });
    if (!img.length) continue;
    img.sort((a, b) => a.difficulty - b.difficulty);
    // new titles: at most two candidates on review.html (easiest first = shown first), Aaron keeps one or both
    if (cands && !live) img.splice(2);
    const item = {
      id: f.id, name: f.name, alt: f.alt || [], facts: def.facts(f), blurb: f.blurb,
      media: { img }, difficulty: f.difficulty || img[0].difficulty,
    };
    if (live) {
      item.live = f.scenes.map((sc, i) => (!sc.cand && !sc.drop ? sceneRel(id, `${f.id}-${i + 1}`, sc) : null)).filter(r => r && exists(r))
        .map(src => { const [w, h] = webpSize(path.join(ROOT, src)); return { src, w, h }; });
      more.push(item);
    } else items.push(item);
  }
  const pack = { id, ...def.head, kids: false, version: 1, items, sources: [{ name: 'Generated locally with FLUX.2 [klein] (Clued house style)', url: PAGE }] };
  if (cands) {
    writeCandidates(id, pack, 'new');
    return writeCandidates(id, { ...pack, items: more }, 'more');
  }
  if (!items.length) return console.log(id, ': no approved pictures, no pack written');
  // lane DIRECTORS: "Who directed this film?" levels (tools/c2_directors.mjs)
  if (id === 'movie-moments') directorLevels(items);
  fs.writeFileSync(path.join(ROOT, 'data/packs', id + '.json'), JSON.stringify(pack, null, 1) + '\n');
  const n = items.reduce((s, i) => s + i.media.img.length, 0);
  const d1 = items.filter(i => i.difficulty === 1).length, kd1 = items.filter(i => i.difficulty === 1 && i.facts.kids).length;
  console.log(`${id}: ${items.length} items, ${n} images, ${d1} difficulty-1 items (${kd1} kids)`);
}

// data/candidates/index.json lists the files review.html shows next to the live packs
const CAND_TITLES = { 'movie-moments': 'Movie moments', 'book-moments': 'Book moments', 'tv-moments': 'TV moments', 'song-pictures': 'Song pictures' };
const KIND = { new: { suffix: '', title: 'new' }, more: { suffix: '-more', title: 'second pictures' } };
function writeCandidates(id, pack, kind) {
  const dir = path.join(ROOT, 'data/candidates');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, id + KIND[kind].suffix + '.json'), idxFile = path.join(dir, 'index.json');
  const title = `${CAND_TITLES[id]}: ${KIND[kind].title}`;
  const idx = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, 'utf8')) : { candidates: [] };
  idx.candidates = idx.candidates.filter(c => c.pack !== id || (c.kind || 'new') !== kind);
  const n = pack.items.reduce((s, i) => s + i.media.img.length, 0);
  if (n) {
    fs.writeFileSync(file, JSON.stringify({ ...pack, id: `${id}-candidates${KIND[kind].suffix}`, title, candidate: true }, null, 1) + '\n');
    idx.candidates.push({ pack: id, kind, title, path: `candidates/${path.basename(file)}`, pictures: n, titles: pack.items.length });
  } else if (fs.existsSync(file)) fs.unlinkSync(file);
  const rank = c => (k => (k < 0 ? 99 : k))(Object.keys(DEFS).indexOf(c.pack)) * 2 + ((c.kind || 'new') === 'new' ? 0 : 1);
  idx.candidates.sort((a, b) => rank(a) - rank(b) || a.pack.localeCompare(b.pack));
  fs.writeFileSync(idxFile, JSON.stringify(idx, null, 1) + '\n');
  console.log(`${id} candidates (${kind}): ${pack.items.length} titles, ${n} pictures -> data/candidates/${path.basename(file)}`);
}

const which = process.argv.slice(2).find(a => !a.startsWith('--')) || 'movie-moments';
const cands = process.argv.includes('--candidates');
for (const id of which === 'all' ? Object.keys(DEFS) : [which]) build(id, cands);
