#!/usr/bin/env node
// Answer-giveaway scanner over every pack. Three passes:
//  1. item media: an image/audio URL whose file name spells the item's name. Our own files (media/…) count as leaks;
//     remote ones are reported apart: players can't see them since every in-game picture blocks long-press/context menus.
//  2. pack questions: the answer in the prompt or the question's own media URL
//  3. generated questions (every format × pack × normal/easy/kids, several seeds): the answer in the prompt, hint,
//     clues or picture URL. Formats that show every name by design (match/sort/order/connect/hilo/blitz/chain/lookalike)
//     are skipped in pass 3; their pictures are covered by pass 1. tf prompts and picture-choice prompts ("Which of these
//     is X?") name things by design. A word only counts when few other answers share it and no wrong option has it.
// Usage: node tools/leak_scan.mjs [--seeds N] [--list] [--json out.json]   exit 1 when anything leaks.
import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SEEDS = +arg('--seeds', 4), LIST = args.includes('--list'), JSON_OUT = arg('--json', null);

const STOP = new Set(('the and of a an de la le el du von van der den des di da in on or to for with from this that these which what who ' +
  'is are was were it its his her their one two three four five common great little big small new old true false yes no ' +
  'spider snake shark bird bee dog cat tree flower mushroom fish frog lizard turtle tortoise whale dolphin ant beetle ' +
  'butterfly moth fly wasp fungus plant animal sea jellyfish song film movie book story tale part day night man woman ' +
  'king queen lady lord house world life time love light black white red green blue yellow brown grey gray golden ' +
  'north south east west northern southern eastern western american european african asian australian indian ' +
  'jpg jpeg png svg gif webp file wikipedia commons thumb upload org com photo photos image images medium large small ' +
  'original square px wiki inaturalist static amazonaws open data name first world lake building ocean trophy start').split(' '));
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
const flat = s => norm(s).replace(/[^a-z0-9]+/g, '');
const urlText = u => { let s = String(u || ''); try { s = decodeURIComponent(s); } catch (e) {} return s.replace(/^.*\/(?=[^/]*$)/, '').replace(/[_+.-]/g, ' '); };

// Tokens that would give the answer away: the whole answer, or any word of it that few other names in the pack share.
function makeLeakTest(names) {
  const freq = new Map();
  for (const n of new Set(names)) for (const w of new Set(words(n))) freq.set(w, (freq.get(w) || 0) + 1);
  const has = (t, phrase) => { const p = words(phrase).join(' '); return p.length >= 3 && (t.includes(' ' + p + ' ') || t.includes(' ' + p + 's ')); };
  return (answer, text, extraStop = [], others = []) => {
    const t = ' ' + words(text).join(' ') + ' ';
    if (!flat(answer) || t.length < 3) return null;
    // a prompt that lists the choices ("a bee, a wasp, a hornet or a fly?") gives nothing away
    if (others.filter(o => has(t, o)).length >= 1) return null;
    if (others.filter(o => words(o).some(w => w.length >= 4 && !STOP.has(w) && t.includes(' ' + w))).length >= 2) return null;
    // nor does one that asks for the word: "Which vitamin…", "How dangerous…"
    const tw = words(text), asked = new Set(tw.filter((x, i) => (i && /^(which|what|how)$/.test(tw[i - 1])) || (i > 1 && /^(which|what)$/.test(tw[i - 2]))));
    if (flat(answer).length >= 4 && has(t, answer) && !asked.has(words(answer)[0])) return answer;
    const ex = new Set([...extraStop, ...others].flatMap(words));
    for (const w of words(answer)) {
      if (w.length < 4 || STOP.has(w) || ex.has(w) || asked.has(w) || /^\d+$/.test(w) || (freq.get(w) || 0) > 2) continue;
      if (t.includes(' ' + w + ' ') || t.includes(' ' + w + 's ')) return w;
    }
    return null;
  };
}

const index = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
const loadPack = id => JSON.parse(readFileSync(join(ROOT, 'data', index.packs[id].path), 'utf8'));
const realIds = Object.keys(index.packs).filter(id => !index.packs[id].virtual);
const found = { media: [], remoteMedia: [], questions: [], generated: [] };
// Our own picture files are shown in <img>; data/music/notes/*.json is only fetched by the piano synth, never shown.
const isLocal = u => !/^https?:/.test(u) && !/^data\/music\//.test(u);
const mediaUrls = m => [...(m?.img || []), ...(m?.audio || [])].map(x => x.src).filter(Boolean);

for (const id of realIds) {
  const pack = loadPack(id);
  const names = (pack.items || []).map(i => i.name);
  const leak = makeLeakTest(names);
  const ctx = [pack.title, pack.noun || ''];
  for (const it of pack.items || []) {
    for (const src of mediaUrls(it.media)) {
      if (/inaturalist|mzstatic|itunes\.apple|^data\/music\//.test(src)) continue;
      for (const n of [it.name, ...(it.alt || [])]) {
        const w = leak(n, urlText(src), ctx);
        if (w) { found[isLocal(src) ? 'media' : 'remoteMedia'].push({ pack: id, item: it.id, name: it.name, token: w, src }); break; }
      }
    }
  }
  for (const q of pack.questions || []) {
    const ans = typeof q.answer === 'string' ? q.answer : q.kind === 'mc' ? q.answer : null;
    if (!ans || typeof ans !== 'string') continue;
    const w = leak(ans, q.prompt, ctx, q.wrong || []) || mediaUrls(q.media).filter(isLocal).map(u => leak(ans, urlText(u), ctx)).find(Boolean);
    if (w) found.questions.push({ pack: id, q: q.id, answer: ans, token: w, prompt: q.prompt });
  }
}

// Pass 3: generated questions, as the game builds them.
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const s = String(u?.url || u);
  if (!s.startsWith('file:')) return realFetch(u, o);
  try { return new Response(await readFile(fileURLToPath(s.split(/[?#]/)[0])), { status: 200 }); } catch { return new Response('', { status: 404 }); }
};
const js = p => pathToFileURL(join(ROOT, 'js', p)).href;
const { MODULES } = await import(js('formats/index.js'));
for (const m of MODULES) { try { await import(new URL(m, js('formats/index.js')).href); } catch (e) {} }
const reg = await import(js('formats/registry.js'));
const { rngFrom } = await import(js('core/rng.js'));
const { kidsView } = await import(js('core/spec.js'));
const SKIP_FMT = new Set(['match', 'sort', 'order', 'connect', 'hilo', 'blitz60', 'chain', 'lookalike', 'fake']);
const seen = new Set();
const answerOf = q => q.answerText ?? (Array.isArray(q.options) && typeof q.answer === 'number' ? q.options[q.answer]?.text : q.answer);
for (const id of realIds) {
  const info = index.packs[id], pack = loadPack(id);
  const ctx = [pack.title, pack.noun || ''];
  const kv = info.kidsSafe === false ? null : kidsView(pack);
  const qs = [];
  for (const fmt of reg.listFormats()) {
    if (fmt.packless || SKIP_FMT.has(fmt.id)) continue;
    if (reg.supportsPack(fmt, { id, ...info }) !== true && reg.supportsPack(fmt, { id, ...info }, { kids: true }) !== true) continue;
    for (const [p, difficulty, kids] of [[pack, 0, false], [pack, 1, false], [kv, 1, true]]) {
      if (!p || (p.items || []).length + (p.questions || []).length === 0) continue;
      const opts = reg.defaultOpts(fmt);
      if (kids) for (const o of fmt.options || []) if (o.kidsDefault != null) opts[o.key] = o.kidsDefault;
      for (let s = 0; s < SEEDS; s++) {
        let list = [];
        try { list = fmt.generate({ rng: rngFrom(`leak:${id}:${fmt.id}:${difficulty}:${kids}:${s}`), packs: [p], count: 40, opts, difficulty, kids, avoid: new Set(), round: 0, spec: { seed: 'leak' + s } }) || []; } catch (e) {}
        for (const q of list) {
          const ans = fmt.id === 'number' ? String(q.answer) : answerOf(q);
          if (typeof ans !== 'string' || /^(true|false|yes|no)$/i.test(ans)) continue;
          const key = fmt.id + '|' + flat(q.prompt) + '|' + flat(ans);
          if (seen.has(key)) continue;
          seen.add(key);
          qs.push([fmt.id, q, ans]);
        }
      }
    }
  }
  const leak = makeLeakTest([...(pack.items || []).map(i => i.name), ...qs.map(x => x[2])]);
  const corpus = new Map();
  for (const [fid, q, ans] of qs) { const k = fid + (q.id || '').split(':').slice(0, 2).join(':'); if (!corpus.has(k)) corpus.set(k, new Set()); corpus.get(k).add(ans); }
  for (const [fid, q, ans] of qs) {
    const picks = Array.isArray(q.options) && q.options.some(o => o.img);
    const others = Array.isArray(q.options) ? q.options.map(o => o.text).filter(t => t && t !== ans)
      : fid === 'type' ? [...corpus.get(fid + (q.id || '').split(':').slice(0, 2).join(':')) || []].filter(t => t !== ans) : [];
    const texts = [];
    if (fid !== 'tf' && !picks && !/^Finish the line/.test(q.prompt || '')) texts.push(['prompt', q.prompt]);
    texts.push(['hint', q.hint], ...((q.data?.clues || []).map(c => ['clue', c])));
    for (const u of [q.data?.img?.src, ...mediaUrls(q.media)]) if (u && isLocal(u)) texts.push(['media', urlText(u)]);
    for (const [where, t] of texts) {
      if (!t) continue;
      const w = leak(ans, t, ctx, others);
      if (w) { found.generated.push({ pack: id, fmt: fid, where, answer: ans, token: w, text: String(t).slice(0, 160), id: q.id }); break; }
    }
  }
}
globalThis.fetch = realFetch;

const by = (arr, k) => arr.reduce((m, x) => ((m[x[k]] = (m[x[k]] || 0) + 1), m), {});
console.log(`leak_scan: our media files named after the answer ${found.media.length} (remote URLs naming it: ${found.remoteMedia.length}, hidden in play), pack questions ${found.questions.length}, generated questions ${found.generated.length} (of ${seen.size} distinct checked)`);
if (found.media.length) console.log('  media by pack', JSON.stringify(by(found.media, 'pack')));
if (found.generated.length) console.log('  generated by format', JSON.stringify(by(found.generated, 'fmt')), 'by pack', JSON.stringify(by(found.generated, 'pack')));
if (LIST) {
  for (const x of found.media) console.log(`  MEDIA ${x.pack}/${x.item} [${x.token}] ${x.src}`);
  for (const x of found.questions) console.log(`  Q ${x.pack}/${x.q} [${x.token}] ${x.prompt}`);
  for (const x of found.generated) console.log(`  GEN ${x.pack} ${x.fmt} ${x.where} [${x.token}] ${x.answer} :: ${x.text}`);
}
if (LIST && args.includes('--remote')) for (const x of found.remoteMedia) console.log(`  REMOTE ${x.pack}/${x.item} [${x.token}] ${x.src}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(found, null, 1));
process.exit(found.media.length + found.questions.length + found.generated.length ? 1 : 0);
