#!/usr/bin/env node
// Builds data/packs/general.json, kids.json and sport.json from tools/c2c_src/*.mjs.
// Kids images come from tools/c2c_media.json (written by tools/c2c_media.mjs); questions whose image is missing are dropped.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { TOPICS } from './c2c_src/lib.mjs';
import GA from './c2c_src/general_a.mjs';
import GB from './c2c_src/general_b.mjs';
import KIDS from './c2c_src/kids.mjs';
import { SUMMER, WINTER, WORLD_CUP, ATHLETES, QUESTIONS as SPORT_Q } from './c2c_src/sport.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA_FILE = join(ROOT, 'tools/c2c_media.json');
const media = existsSync(MEDIA_FILE) ? JSON.parse(readFileSync(MEDIA_FILE, 'utf8')) : {};
const hash = s => createHash('sha1').update(s).digest('hex').slice(0, 6);
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function toQuestion(prefix, q, { kidsTag = false } = {}) {
  const [theme, topic] = TOPICS[q.t] || (() => { throw new Error(`unknown topic ${q.t}`); })();
  const out = {
    id: `${prefix}-${q.t}-${hash(q.p + '|' + JSON.stringify(q.a) + '|' + (q.img || ''))}`,
    kind: q.kind, prompt: q.p, answer: q.a,
  };
  if (q.kind === 'mc') out.wrong = q.w;
  if (q.kind === 'number') { out.unit = q.unit; out.tolerance = q.tol; }
  if (q.kind === 'order') out.orderLabel = q.label;
  out.explain = q.e;
  out.difficulty = q.d;
  out.tags = kidsTag && theme !== 'kids' ? ['kids', theme] : [theme];
  out.topic = topic;
  if (q.img) {
    const m = media[q.img];
    if (!m) return null;
    out.media = { img: [m] };
  }
  return out;
}

function write(id, pack) {
  writeFileSync(join(ROOT, 'data/packs', `${id}.json`), JSON.stringify(pack, null, 1) + '\n');
  const qs = pack.questions.length, its = (pack.items || []).length;
  console.log(`${id}: ${qs} questions${its ? `, ${its} items` : ''}`);
}

const general = [...GA, ...GB].map(q => toQuestion('gen', q));
write('general', {
  id: 'general', title: 'General knowledge', theme: 'general', icon: '💡', kids: false, version: 1,
  questions: general,
  sources: [{ name: 'Hand-written by lane C2c, fact-checked against Wikipedia', url: 'https://en.wikipedia.org' }],
});

const missing = [];
const kids = KIDS.map(q => { const r = toQuestion('kid', q, { kidsTag: true }); if (!r) missing.push(q.img); return r; }).filter(Boolean);
if (missing.length) console.warn(`kids: dropped ${missing.length} picture questions with no cached image: ${missing.join(', ')}`);
write('kids', {
  id: 'kids', title: 'Kids quiz', theme: 'kids', icon: '🧸', kids: true, version: 1,
  questions: kids,
  sources: [
    { name: 'Hand-written by lane C2c', url: 'https://en.wikipedia.org' },
    { name: 'Wikimedia Commons (images; credits on each question)', url: 'https://commons.wikimedia.org' },
  ],
});

const items = [];
const olyDiff = y => (y >= 2000 ? 1 : y >= 1984 ? 2 : 3);
for (const [list, season] of [[SUMMER, 'Summer'], [WINTER, 'Winter']]) {
  for (const [year, city, country] of list) {
    items.push({
      id: `${season.toLowerCase()}-${year}`, name: `${year} ${season} Olympics`, group: `olympics-${season.toLowerCase()}`,
      facts: { host: city },
      blurb: `The ${year} ${season} Olympics were held in ${city}, ${country}.${year === 2020 ? ' They were postponed to 2021 because of the COVID-19 pandemic.' : ''}`,
      difficulty: season === 'Winter' ? Math.min(3, olyDiff(year) + 1) : olyDiff(year),
    });
  }
}
const wcDiff = y => (y >= 2014 || y === 1966 ? 1 : y >= 1986 ? 2 : 3);
const westNote = (y, v) => (v === 'Germany' && y < 1991 ? 'Germany (as West Germany)' : v);
for (const [year, winner, runnerUp, host] of WORLD_CUP) {
  items.push({
    id: `world-cup-${year}`, name: `${year} FIFA World Cup`, group: 'world-cup',
    facts: { winner, runnerUp, wcHost: host },
    blurb: `${westNote(year, winner)} beat ${westNote(year, runnerUp)} to win the ${year} World Cup, hosted by ${westNote(year, host)}.${year === 1950 ? ' The 1950 title was decided by a final group, not a single final.' : ''}`,
    difficulty: wcDiff(year),
  });
}
for (const [name, sport, nation, d, blurb] of ATHLETES) {
  items.push({ id: slug(name), name, group: 'athlete', facts: { sport, nation }, blurb, difficulty: d });
}

write('sport', {
  id: 'sport', title: 'Sport', theme: 'sport', icon: '⚽', kids: false, version: 1, noun: 'sports star or event',
  factsMeta: {
    host: { type: 'cat', label: 'Host city', ask: 'Which city hosted the {name}?', stmt: 'The {name} were held in {value}.' },
    winner: { type: 'cat', label: 'Winner', ask: 'Who won the {name}?', stmt: 'The {name} was won by {value}.' },
    runnerUp: { type: 'cat', label: 'Runner-up', ask: 'Who were the runners-up at the {name}?', stmt: '{value} were the runners-up at the {name}.' },
    wcHost: { type: 'cat', label: 'Host country', ask: 'Which country hosted the {name}?', stmt: 'The {name} was hosted by {value}.' },
    sport: { type: 'cat', label: 'Sport', ask: 'Which sport is {name} famous for?', stmt: "{name}'s sport: {value}." },
    nation: { type: 'cat', label: 'Country', ask: 'Which country did {name} represent?', stmt: '{name} represented {value}.' },
  },
  items,
  questions: SPORT_Q.map(q => toQuestion('spt', q)),
  sources: [
    { name: 'Wikipedia: List of Olympic Games host cities', url: 'https://en.wikipedia.org/wiki/List_of_Olympic_Games_host_cities' },
    { name: 'Wikipedia: List of FIFA World Cup finals', url: 'https://en.wikipedia.org/wiki/List_of_FIFA_World_Cup_finals' },
  ],
});
