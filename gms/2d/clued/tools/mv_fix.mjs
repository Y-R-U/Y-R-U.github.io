// Apply review decisions: node tools/mv_fix.mjs edits.json [--pack movie-moments]
// edits.json = { "film-id-n": { "p"?: new prompt, "d"?: 1-3, "cap"?: caption, "drop"?: true, "reject"?: true } }
// A new prompt or reject:true deletes the webp and bumps the seed attempt so mv_gen regenerates it.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const packId = args.includes('--pack') ? args[args.indexOf('--pack') + 1] : 'movie-moments';
const FILES = { 'movie-moments': ['tools/mv_prompts.json', 'media/moments'], 'book-moments': ['tools/mv_prompts_books.json', 'media/book-moments'], 'song-pictures': ['tools/mv_prompts_songs.json', 'media/song-pictures'] };
const [pf, media] = FILES[packId];
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, pf), 'utf8'));
const edits = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const STATE = path.join(ROOT, 'tools/mv_state.json');
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};

for (const [key, e] of Object.entries(edits)) {
  const m = key.match(/^(.*)-(\d+)$/);
  const film = cfg.films.find(f => f.id === m[1]);
  const sc = film?.scenes[+m[2] - 1];
  if (!sc) { console.log('no such scene', key); continue; }
  const regen = (e.p && e.p !== sc.p) || e.reject;
  for (const k of ['p', 'd', 'cap', 'drop']) if (e[k] !== undefined) sc[k] = e[k];
  const s = state[key] || (state[key] = {});
  if (e.drop) { s.dropped = true; try { fs.unlinkSync(path.join(ROOT, media, key + '.webp')); } catch {} }
  if (regen && !e.drop) {
    s.attempt = (s.attempt || 0) + 1;
    try { fs.unlinkSync(path.join(ROOT, media, key + '.webp')); } catch {}
    if (s.attempt >= 3) console.log('WARNING', key, 'attempt', s.attempt + 1, '(last try, then drop)');
  }
  console.log(key, regen ? 'regen' : '', e.drop ? 'dropped' : '', e.d ? 'd=' + e.d : '');
}
fs.writeFileSync(path.join(ROOT, pf), JSON.stringify(cfg, null, 1));
fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
