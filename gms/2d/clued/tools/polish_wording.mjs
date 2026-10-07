#!/usr/bin/env node
// Wording sweep: generates questions from every format × pack (normal, Easy, Hard, kids) and flags prompts that read
// like a template went wrong ("What is the from of …", "Which has the highest released?", "a apple", missing "?").
// Usage: node tools/polish_wording.mjs [--n=40] [--seeds=3] [--sample=60] [--all] [--shapes] [--format=mc,tf] [--pack=hits-1980s]
//   --strip   drops every pack's wording templates first, to check that registry.js's own fallback wording is safe
// Exit code 1 when anything is flagged (hand-written `/q:` prompts are listed separately and don't fail the run).
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = +arg('n', 40), SEEDS = +arg('seeds', 3), SAMPLE = +arg('sample', 0), ALL = process.argv.includes('--all');
const SHAPES = process.argv.includes('--shapes'), STRIP = process.argv.includes('--strip');
const ONLY_F = arg('format', '').split(',').filter(Boolean), ONLY_P = arg('pack', '').split(',').filter(Boolean);

const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const s = String(u?.url || u);
  if (!s.startsWith('file:')) return realFetch(u, o);
  try { return new Response(await readFile(fileURLToPath(s.split(/[?#]/)[0])), { status: 200 }); } catch { return new Response('', { status: 404 }); }
};
const js = p => pathToFileURL(join(ROOT, 'js', p)).href;
const { MODULES } = await import(js('formats/index.js'));
for (const m of MODULES) { try { await import(new URL(m, js('formats/index.js')).href); } catch (e) { console.warn(`skip ${m}: ${e.message}`); } }
const reg = await import(js('formats/registry.js'));
const { rngFrom } = await import(js('core/rng.js'));
const { kidsView } = await import(js('core/spec.js'));

const index = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
const raw = new Map();
const packOf = id => {
  const info = index.packs[id];
  if (!raw.has(info.path)) {
    const p = JSON.parse(readFileSync(join(ROOT, 'data', info.path), 'utf8'));
    if (STRIP) for (const m of Object.values(p.factsMeta || {})) for (const k of ['ask', 'askReverse', 'askBool', 'askHigh', 'askLow', 'askNumber', 'stmt', 'noun', 'matchPrompt']) delete m[k];
    raw.set(info.path, p);
  }
  const base = raw.get(info.path);
  if (!info.virtual) return base;
  return { ...base, id, title: info.title, theme: info.virtual.tag, questions: (base.questions || []).filter(q => (q.tags || []).includes(info.virtual.tag)) };
};

const THE_C = /\b(from|in|of|to|is|Is|was|Was|than|for|by) (United States|United Kingdom|United Arab Emirates|Netherlands|Philippines|Czech Republic|Bahamas|Gambia|Maldives|Dominican Republic|Central African Republic|Solomon Islands|Marshall Islands|Comoros)\b(?!\s+(dollar|pound|dirham|peso|sterling))/;
// Nouns a "What is the X of Y?" question may legitimately ask about.
const OK_OF = /^What is the (capital|currency|symbol|chemical symbol|population|area|national anthem|calling code|ISO code|atomic number|main language|official language|name|title|largest|smallest|real name|nickname|world's|first|last|meaning|color|colour) /i;
const CHECKS = [
  ['"the from"-style label', p => /\bthe (from|in|of|by|known for|born in|released|written|painted|discovered|launched|completed|first shown|first published|directed by|lives in|found in|native to|drives on|made by)\b(?! (the|a|an)\b)/i.test(p) && !/\bthe (first|last) /i.test(p) && /\bthe (from|in|of|by|known for|born in|released|written|painted|discovered|launched|completed|first shown|first published|directed by|lives in|found in|native to|drives on)\s+(of|is)\b/i.test(p)],
  // a label dropped into "What is the {label} of {name}?": fine for nouns ("the diameter of"), nonsense for "the from of"
  ['generic "What is the … of"', p => /What is the (?:[\w-]+ )*?(?:from|in|by|for|on|to|released|born|died|written|painted|completed|launched|discovered|decade|century|year|kind|type|act|artist|composer|author|director|kind of \w+) of\b/i.test(p) || /What is the family of\b/.test(p)],
  ['label used as a quantity', p => /\b(highest|lowest|higher|lower|most|least) (released|born|died|written|painted|discovered|launched|completed|first shown|first published|year|decade|period|group)\b/i.test(p)],
  ['"of the year"/"is released" nonsense', p => /\b(of the year|of the decade|is released|is born|is written|is painted|is discovered|is launched|is completed|is first shown|is first published|is from of|is known for is)\b/i.test(p)],
  ['doubled word', p => { const m = /\b([A-Za-z]+) \1\b/i.exec(p); return !!m && !/^(that|had|is|bora|baden|tom|tut|cha|can|mahi|knock|chop|choo|na|la|da|no|go|bye|yo)$/i.test(m[1]); }],
  ['article mismatch', p => /\b[Aa] [aeiAEI][a-z]/.test(p.replace(/\b[Aa] (Eu|eu|U|u|O|o)\w*/g, '')) || /\b[Aa]n [bcdfgjklmnpqrstvwxyz]/.test(p)],
  ['missing "the" before a country', p => THE_C.test(p)],
  ['"the the"', p => /\bthe the\b/i.test(p)],
  // "Typical length (worker or female): …", "(painted in the: 1800s)", "conservation status (iucn)"; explanatory asides in a
  // hand-made template ("the European hornet (a worker or female)") are fine
  ['raw label in parentheses', p => /\b[A-Za-z]+ \([^)]*\):|\((?:[\w-]+ )*(?:in|of|by|for|to|from|the|on):|\(iucn\)|\bstatus \(IUCN\)/.test(p)],
  ['lower-case sentence start', p => /^[a-z]/.test(p) || /[.?!] [a-z]/.test(p.replace(/\b(e\.g|i\.e|vs|St|Dr|Mr|Mrs|Jr|approx|c|D\.C|Bros|Mt|[A-Z])[.!] /g, ''))],
  ['question without "?"', p => /(^|[.!:] )(What|Which|Who|Whose|Where|When|How|Why|Is|Was|Were|Are|Did|Does|Do|Can|Has|Have|In which|In what|From which|On which)\b[^.!?:]*$/.test(p) && !/\?["”’)]?\s*$/.test(p)],
  ['template leftover', p => /\{\w+\}|\bundefined\b|\bnull\b|\bNaN\b|\[object/.test(p)],
  ['spacing/punctuation', p => /\s[,.?!:;]|\s{2,}|\?\?|\.\.(?!\.)|,,/.test(p.replace(/…/g, ''))],
  ['bare label prompt', p => /^[A-Z][a-z]+( [a-z]+)*: [^.?]*$/.test(p) && !/^(Sort|Match|Put|Pair|Name|Order|Find|Spot|Group|Connect|Link|Tap|Type|Guess|Odd one out|Finish the line)\b/.test(p) && !/ \/ | or /.test(p) && p.length < 30],
];

// Item names (song titles like "Ice Ice Baby", "Help!", "Where Is the Love?") are masked for the checks marked M.
const MASKED = new Set(['doubled word', 'lower-case sentence start', 'spacing/punctuation', 'raw label in parentheses', 'article mismatch', '"of the year"/"is released" nonsense']);
// History events are headlines in the present tense ("The Eiffel Tower is completed"): deliberate, not a template slip.
const HEADLINE_PACKS = /^history$/;
const namesCache = new Map();
const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function maskerFor(pack) {
  if (namesCache.has(pack)) return namesCache.get(pack);
  const names = [...new Set((pack.items || []).flatMap(it => [it.name, it.lname, ...Object.values(it.facts || {}).filter(v => typeof v === 'string')]).filter(n => n && n.length >= 3))].sort((a, b) => b.length - a.length);
  const res = names.map(n => new RegExp(`(^|[^\\w])${esc(n)}(?![\\w])`, 'g'));
  // quoted lines ("O Captain! my Captain!") are real quotations, not our wording
  const fn = t => res.reduce((acc, re) => acc.replace(re, '$1Zed'), t.replace(/“[^”]*”/g, '“Zed”'));
  namesCache.set(pack, fn);
  return fn;
}
const promptsOf = q => {
  const out = [q.prompt];
  if (q.data?.ask) out.push(q.data.ask);
  if (q.data?.stmt) out.push(q.data.stmt);
  if (q.data?.question) out.push(q.data.question);
  return out.filter(x => typeof x === 'string' && x.trim());
};

const fmts = reg.listFormats().filter(f => !ONLY_F.length || ONLY_F.includes(f.id));
const ids = Object.keys(index.packs).filter(id => !ONLY_P.length || ONLY_P.includes(id));
const flagged = new Map(), handFlagged = new Map(), seenPrompt = new Map();
let total = 0;
const shapes = new Map();
for (const f of fmts) {
  const pids = f.packless ? ['countries'] : ids;
  for (const id of pids) {
    const info = { id, ...index.packs[id] };
    if (!f.packless && reg.supportsPack(f, info) !== true) continue;
    const pack = packOf(id);
    const runs = [[pack, 0, false], [pack, 1, false], [pack, 3, false]];
    if (info.kidsSafe !== false) runs.push([kidsView(pack), 1, true]);
    for (const [p, difficulty, kids] of runs) {
      for (let s = 0; s < SEEDS; s++) {
        const opts = reg.defaultOpts(f);
        if (kids) for (const o of f.options || []) if (o.kidsDefault != null) opts[o.key] = o.kidsDefault;
        let list = [];
        try {
          list = await f.generate({ rng: rngFrom(`pw:${f.id}:${id}:${difficulty}:${kids}:${s}`), packs: f.packless ? [] : [p], count: N, opts, difficulty, kids, avoid: new Set(), round: 0, spec: { seed: 'pw' } }) || [];
        } catch (e) { list = []; }
        for (const q of list) {
          const mask = maskerFor(pack);
          for (const text of promptsOf(q)) {
            total++;
            const masked = mask(text);
            const key = `${f.id}|${text}`;
            if (SHAPES) { const sh = `${f.id.padEnd(10)} ${masked.replace(/[\d.,]*\d/g, 'N')}`; shapes.set(sh, (shapes.get(sh) || 0) + 1); }
            if (!seenPrompt.has(key)) seenPrompt.set(key, { f: f.id, pack: id, text, qid: q.id, kids });
            for (const [name, test] of CHECKS) {
              if (name.startsWith('"of the year"') && HEADLINE_PACKS.test(id)) continue;
              if (!test(MASKED.has(name) ? masked : text)) continue;
              const hand = String(q.id).includes('/q:');
              const bucket = hand ? handFlagged : flagged;
              if (!bucket.has(name)) bucket.set(name, new Map());
              bucket.get(name).set(key, `${f.id.padEnd(10)} ${id.padEnd(20)} ${text}`);
            }
          }
        }
      }
    }
  }
}

const show = (title, m) => {
  for (const [name, rows] of m) {
    console.log(`\n## ${title}: ${name} (${rows.size})`);
    [...rows.values()].slice(0, ALL ? 1e9 : 25).forEach(r => console.log('  ' + r));
    if (!ALL && rows.size > 25) console.log(`  … ${rows.size - 25} more (--all)`);
  }
};
show('GENERATED', flagged);
show('HAND-WRITTEN (data questions, review only)', handFlagged);
const nGen = [...flagged.values()].reduce((a, m) => a + m.size, 0), nHand = [...handFlagged.values()].reduce((a, m) => a + m.size, 0);
if (SHAPES) { console.log('\n## prompt shapes (item names → Zed, numbers → N)'); [...shapes.keys()].sort().forEach(k => console.log('  ' + k)); }
if (SAMPLE) {
  const all = [...seenPrompt.values()];
  const r = rngFrom(`pw-sample:${Date.now()}`);
  console.log(`\n## ${SAMPLE} random prompts`);
  for (let i = 0; i < SAMPLE && all.length; i++) { const x = all.splice(Math.floor(r() * all.length), 1)[0]; console.log(`  ${x.f.padEnd(10)} ${x.pack.padEnd(20)} ${x.text}`); }
}
console.log(`\npolish_wording: ${total} prompts (${seenPrompt.size} distinct) from ${fmts.length} formats; ${nGen} generated flagged, ${nHand} hand-written flagged`);
globalThis.fetch = realFetch;
process.exit(nGen ? 1 : 0);
