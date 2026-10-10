// Flashcard faces: what a card's front shows for any item, without ever giving the answer away. Pure (tools/cards_test.mjs).
import { factText } from '../formats/registry.js?v=202610101826';

export const MIN_LEAK = 4;   // names shorter than this are too common as substrings to police
export const BLANK = '____';

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function answerNames(item) {
  const out = [];
  for (const n of [item.name, item.lname, ...(item.alt || [])]) {
    const s = String(n ?? '').trim();
    if (s.length >= 2 && !out.some(x => norm(x) === norm(s))) out.push(s);
  }
  return out;
}

export function leaks(text, item) {
  const t = norm(text);
  return answerNames(item).some(n => norm(n).length >= MIN_LEAK && t.includes(norm(n)));
}

// Blank out every form of the answer; null when the text still gives it away (diacritics, partial forms).
export function redact(text, item) {
  if (!text) return null;
  let s = String(text);
  for (const n of answerNames(item).sort((a, b) => b.length - a.length)) {
    const core = escRe(n).replace(/^the\s+/i, '(?:the\\s+)?');
    s = s.replace(new RegExp(n.length <= 3 ? `\\b${core}\\b` : core, 'gi'), BLANK);
  }
  return leaks(s, item) ? null : s;
}

const WEAK_CLUE = /\bletters?\b|first letter|starts with|begins with|ends with|\bwords? \(/i;
const PEOPLE = new Set(['people', 'actors', 'artists', 'explorers', 'leaders', 'quotes']);
const NOUN = { books: 'book', movies: 'film', tv: 'TV show', history: 'event', sport: 'event', words: 'word', languages: 'language',
  currencies: 'currency', capitals: 'capital city', elements: 'element', inventions: 'invention', countries: 'country',
  flags: 'country', landmarks: 'landmark', paintings: 'painting', dishes: 'dish', gems: 'gemstone', space: 'space object',
  dinosaurs: 'dinosaur', 'movie-moments': 'film' };
const IMG_ASK = { flags: "Which country's flag is this?", countries: "Which country's flag is this?", 'movie-moments': 'Which film is this scene from?',
  paintings: 'Which painting is this?', landmarks: 'Which landmark is this?', body: 'Which part of the body is this?', dishes: 'Which dish is this?' };
const AUDIO_ASK = { 'music-artists': 'Who is the artist?', 'nursery-rhymes': 'Which nursery rhyme is this?', 'screen-themes': 'Which film or show is this from?',
  'kids-film-tv': 'Which film or show is this from?', 'classical-piano': 'Name this piece', 'classical-recordings': 'Name this piece',
  'pd-melodies': 'Name this tune', anthems: "Which country's national anthem is this?", instruments: 'Which instrument is this?' };

const isPeople = (pack, item) => PEOPLE.has(pack.id) || pack.theme === 'people' || item?.group === 'athlete';
const isSongs = pack => !!(pack.factsMeta?.artist && pack.factsMeta?.year);

function askFor(pack, item, kind, kids, blanked) {
  if (kind === 'img') return IMG_ASK[pack.id] || (isPeople(pack, item) ? 'Who is this?' : kids ? 'Who is this?' : 'What is this?');
  if (kind === 'audio') {
    if (pack.listenPrompt) return pack.listenPrompt;
    if (AUDIO_ASK[pack.id]) return AUDIO_ASK[pack.id];
    if (isSongs(pack)) return 'Name this song';
    return kids ? 'Who makes this sound?' : 'Whose sound is this?';
  }
  if (pack.id === 'quotes') return 'Who said this?';
  if (blanked) return 'Fill in the blank';
  if (isPeople(pack, item)) return 'Who is it?';
  return NOUN[pack.id] ? `Which ${NOUN[pack.id]} is this?` : 'What is it?';
}

function factLine(pack, item) {
  const f = item.facts || {};
  if (isSongs(pack) && f.artist && f.year) return `A ${f.year} hit by ${f.artist}`;
  const bits = [];
  for (const [k, m] of Object.entries(pack.factsMeta || {})) {
    const v = f[k];
    if (v == null || v === '' || k === 'kids' || k === 'iso3' || m.type === 'bool') continue;
    const t = factText(m, v);
    if (t && !leaks(t, item) && !answerNames(item).some(n => norm(n) === norm(t))) bits.push(`${m.label || k}: ${t}`);
    if (bits.length >= 3) break;
  }
  return bits.length ? bits.join(' · ') : null;
}

// Redacted text clues, most useful first.
export function textClues(pack, item) {
  const out = [];
  const fl = factLine(pack, item);
  const add = s => { const r = redact(s, item); if (r && r.replace(/_+|\W/g, '').length >= 8 && !out.includes(r)) out.push(r); };
  if (fl && isSongs(pack)) add(fl);
  const clues = (item.clues || []).filter(c => !WEAK_CLUE.test(c));
  for (const c of clues.slice(-2).reverse()) add(c);
  const q = item.quote || item.quotes?.[0]?.text;
  if (q) add(`“${q.replace(/^["“]|["”]$/g, '')}”`);
  if (item.summary) add(item.summary);
  if (item.blurb) add(item.blurb);
  // a fact line that only repeats what a clue already said adds nothing
  if (fl && !(out.length && fl.split(' · ').every(b => norm(out.join(' ')).includes(norm(b.slice(b.indexOf(': ') + 2)))))) add(fl);
  return out;
}

// { kind: 'img'|'audio'|'text', ask, img?, audio?, lines?, hint? } or null when the item has no usable front.
export function cardFace(pack, item, { kids = false } = {}) {
  if (!item?.name) return null;
  const img = item.media?.img?.[0] || null;
  const audio = item.media?.audio?.[0] || null;
  const text = textClues(pack, item);
  if (img) return { kind: 'img', ask: askFor(pack, item, 'img', kids), img, audio };
  if (audio) return { kind: 'audio', ask: askFor(pack, item, 'audio', kids), audio, hint: kids ? null : text[0] || null };
  if (kids || !text.length) return null;
  const lines = pack.id === 'quotes' ? text.slice(0, 1) : text.slice(0, 2);
  return { kind: 'text', ask: askFor(pack, item, 'text', kids, lines.some(l => l.includes(BLANK))), lines };
}

// Everything a front shows as text (for leak checks).
export const faceText = f => (f ? [f.ask, ...(f.lines || []), f.hint || ''].join(' \n ') : '');

const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// n options from the same pack: a lookalike and same-group items first (not for kids), then the rest at random.
export function mcOptions(pack, item, pool, n = 4, rng = Math.random, { kids = false } = {}) {
  const seen = new Set([norm(item.name)]);
  const take = [];
  const push = it => { const k = norm(it?.name); if (it && it.name && !seen.has(k) && take.length < n - 1) { seen.add(k); take.push(it.name); } };
  const others = shuffle(pool.filter(x => x.id !== item.id), rng);
  if (!kids) {
    const look = (item.lookalikes || []).map(id => others.find(x => x.id === id)).filter(Boolean);
    if (look.length) push(look[0]);
    if (item.group) others.filter(x => x.group === item.group).slice(0, 1).forEach(push);
  }
  for (const x of others) push(x);
  if (take.length < 1) return null;
  const options = shuffle([item.name, ...take], rng);
  return { options, answer: options.indexOf(item.name) };
}
