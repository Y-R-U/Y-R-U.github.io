// Builds data/packs/<pack>.json from tools/mv_prompts*.json + the webp files that exist.
// Usage: node tools/mv_build.mjs [movie-moments|book-moments|song-pictures|all]
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CREDIT = 'Clued (AI-generated illustration)';
const PAGE = 'https://y-r-u.github.io/gms/2d/clued/docs/notes/MV.md';

const DEFS = {
  'movie-moments': {
    prompts: 'tools/mv_prompts.json', media: 'media/moments',
    head: {
      title: 'Movie Moments', theme: 'screen', icon: '🎬',
      notice: 'Original illustrations of famous film scenes, not real stills.',
      nameImgPrompt: 'Which movie is this scene from?', imgPrompt: 'Which scene is from {name}?',
      factsMeta: {
        year: { type: 'year', label: 'Released', askHigh: 'Which of these films came out most recently?', askLow: 'Which of these films came out first?', askNumber: 'In what year did {name} come out?' },
        decade: { type: 'cat', label: 'Decade', ask: 'In which decade did {name} come out?', askReverse: 'Which of these films came out in the {value}?', stmt: '{name} came out in the {value}.' },
        director: { type: 'cat', label: 'Directed by', noun: 'director', ask: 'Who directed {name}?', askReverse: 'Which of these films was directed by {value}?', stmt: '{name} was directed by {value}.' },
        kids: { type: 'bool', label: 'Family film', yes: 'Family film', no: 'Not a family film', askBool: 'Which of these is a family film?', stmt: '{name} is a family film.' },
      },
    },
    facts: f => ({ year: f.year, decade: `${Math.floor(f.year / 10) * 10}s`, ...(f.director ? { director: f.director } : {}), kids: !!f.kids }),
  },
  'book-moments': {
    prompts: 'tools/mv_prompts_books.json', media: 'media/book-moments',
    head: {
      title: 'Book Moments', theme: 'books', icon: '📖',
      notice: 'Original illustrations of scenes from famous books.',
      nameImgPrompt: 'Which book is this scene from?', imgPrompt: 'Which scene is from {name}?',
      factsMeta: {
        author: { type: 'cat', label: 'Author', ask: 'Who wrote {name}?', askReverse: 'Which of these books is by {value}?', stmt: '{name} was written by {value}.' },
        year: { type: 'year', label: 'Published', askHigh: 'Which of these books came out most recently?', askLow: 'Which of these books came out first?', askNumber: 'In what year was {name} first published?' },
        kids: { type: 'bool', label: "Children's book", yes: "Children's book", no: 'Not a children\'s book', askBool: "Which of these is a children's book?", stmt: "{name} is a children's book." },
      },
    },
    facts: f => ({ author: f.author, year: f.year, kids: !!f.kids }),
  },
  'song-pictures': {
    prompts: 'tools/mv_prompts_songs.json', media: 'media/song-pictures',
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

function webpSize(file) {
  const b = fs.readFileSync(file);
  const tag = b.toString('ascii', 12, 16);
  if (tag === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (tag === 'VP8L') { const n = b.readUInt32LE(21); return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1]; }
  if (tag === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  throw new Error('not a webp: ' + file);
}

function build(id) {
  const def = DEFS[id];
  const src = path.join(ROOT, def.prompts);
  if (!fs.existsSync(src)) return console.log(id, ': no prompts file, skipped');
  const cfg = JSON.parse(fs.readFileSync(src, 'utf8'));
  const items = [];
  for (const f of cfg.films) {
    const img = [];
    f.scenes.forEach((sc, i) => {
      const file = `${def.media}/${f.id}-${i + 1}.webp`;
      if (sc.drop || !fs.existsSync(path.join(ROOT, file))) return;
      const [w, h] = webpSize(path.join(ROOT, file));
      img.push({ src: file, w, h, credit: CREDIT, license: 'CC0', page: PAGE, difficulty: sc.d, caption: sc.cap });
    });
    if (!img.length) continue;
    img.sort((a, b) => a.difficulty - b.difficulty);
    items.push({
      id: f.id, name: f.name, alt: f.alt || [], facts: def.facts(f), blurb: f.blurb,
      media: { img }, difficulty: f.difficulty || img[0].difficulty,
    });
  }
  const pack = { id, ...def.head, kids: false, version: 1, items, sources: [{ name: 'Generated locally with FLUX.2 [klein] (Clued house style)', url: PAGE }] };
  fs.writeFileSync(path.join(ROOT, 'data/packs', id + '.json'), JSON.stringify(pack, null, 1) + '\n');
  const n = items.reduce((s, i) => s + i.media.img.length, 0);
  const d1 = items.filter(i => i.difficulty === 1).length, kd1 = items.filter(i => i.difficulty === 1 && i.facts.kids).length;
  console.log(`${id}: ${items.length} items, ${n} images, ${d1} difficulty-1 items (${kd1} kids)`);
}

const which = process.argv[2] || 'movie-moments';
for (const id of which === 'all' ? Object.keys(DEFS) : [which]) build(id);
