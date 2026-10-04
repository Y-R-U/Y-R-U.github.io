// Blind guessability check against the local vision model (OpenAI-compatible, :7872 by default).
// Run ONLY while Flux is idle (the script unloads it first). The model is never told the answer.
// Usage: node tools/mv_blind.mjs [--pack movie-moments] [--apply]   (--apply rewrites scene difficulty in the prompts file)
// Results: tools/mv_blind_<pack>.json  { "film-id-n": { guesses: [...], rank: 1|2|3|0 } }
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const packId = args.includes('--pack') ? args[args.indexOf('--pack') + 1] : 'movie-moments';
const VLM = process.env.VLM || 'http://localhost:7872/v1';
const FILES = { 'movie-moments': ['tools/mv_prompts.json', 'media/moments', 'film'], 'book-moments': ['tools/mv_prompts_books.json', 'media/book-moments', 'novel'], 'song-pictures': ['tools/mv_prompts_songs.json', 'media/song-pictures', 'song title (drawn literally)'] };
const [pf, media, kind] = FILES[packId];
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, pf), 'utf8'));
const OUT = path.join(ROOT, `tools/mv_blind_${packId}.json`);
const res = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

const st = await fetch('http://localhost:7867/api/status').then(r => r.json()).catch(() => ({}));
if (st.running_job_id || st.queue_depth) { console.log('Flux is busy; run this later.'); process.exit(1); }
await fetch('http://localhost:7867/admin/unload', { method: 'POST' }).catch(() => {});
const model = (await (await fetch(VLM + '/models')).json()).data[0].id;

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const matches = (guess, f) => [f.name, ...(f.alt || [])].some(n => { const a = norm(guess), b = norm(n); return a && (a === b || a.includes(b) || (b.includes(a) && a.length > 4)); });

for (const f of cfg.films) {
  for (let i = 0; i < f.scenes.length; i++) {
    const key = `${f.id}-${i + 1}`, file = path.join(ROOT, media, key + '.webp');
    if (res[key] || f.scenes[i].drop || !fs.existsSync(file)) continue;
    const b64 = fs.readFileSync(file).toString('base64');
    const body = {
      model, max_tokens: 200, temperature: 0,
      messages: [{ role: 'user', content: [
        { type: 'text', text: `This illustration depicts a famous ${kind}. Which ${kind} is it? Give your top 3 guesses, one per line, titles only, no explanation.` },
        { type: 'image_url', image_url: { url: `data:image/webp;base64,${b64}` } },
      ] }],
    };
    const r = await (await fetch(VLM + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    const text = (r.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const guesses = text.split('\n').map(s => s.replace(/^\s*[\d.)*-]+\s*/, '').replace(/[*"]/g, '').trim()).filter(Boolean).slice(0, 3);
    const idx = guesses.findIndex(g => matches(g, f));
    res[key] = { guesses, rank: idx + 1 };
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
    console.log(key, idx + 1 || '-', guesses.join(' | '));
  }
}

const ranks = Object.values(res).map(r => r.rank);
console.log(`top1 ${ranks.filter(r => r === 1).length}, top3 ${ranks.filter(r => r > 0).length}, missed ${ranks.filter(r => r === 0).length} of ${ranks.length}`);
if (args.includes('--apply')) {
  for (const f of cfg.films) f.scenes.forEach((sc, i) => {
    const r = res[`${f.id}-${i + 1}`];
    if (r) sc.d = r.rank === 1 ? 1 : r.rank > 0 ? 2 : 3;
  });
  fs.writeFileSync(path.join(ROOT, pf), JSON.stringify(cfg, null, 1));
  console.log('difficulties applied; rerun node tools/mv_build.mjs', packId);
}
