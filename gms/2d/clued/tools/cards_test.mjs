// Flashcard faces for every item in every pack: a usable front that never shows the answer. `node tools/cards_test.mjs [-v]`
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardFace, faceText, mcOptions } from '../js/learn/face.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('-v');
const files = [
  ...fs.readdirSync(path.join(ROOT, 'data/packs')).map(f => 'data/packs/' + f),
  ...fs.readdirSync(path.join(ROOT, 'data/music')).filter(f => f.endsWith('.json')).map(f => 'data/music/' + f),
].filter(f => f.endsWith('.json') && !path.basename(f).startsWith('_'));

const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let pass = 0, fail = 0, cards = 0;
const skipped = {};
const kinds = { img: 0, audio: 0, text: 0 };
const bad = (msg) => { fail++; if (fail <= 40) console.log('FAIL', msg); };
const kidsOf = p => p.kidsSafe === false ? [] : (p.items || []).filter(it => p.kids || it.difficulty === 1 || it.facts?.kids === true);
let rng = 1;
const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);

for (const f of files) {
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  pack.id = pack.id || path.basename(f, '.json');
  for (const kids of [false, true]) {
    const items = kids ? kidsOf(pack) : pack.items || [];
    for (const it of items) {
      const face = cardFace(pack, it, { kids });
      if (!face) { (skipped[pack.id + (kids ? ' (kids)' : '')] ||= []).push(it.id); continue; }
      cards++;
      kinds[face.kind]++;
      const where = `${pack.id}/${it.id}${kids ? ' kids' : ''}`;
      const usable = face.kind === 'img' ? !!face.img?.src : face.kind === 'audio' ? !!face.audio?.src : (face.lines || []).some(l => l.replace(/[\W_]/g, '').length >= 8);
      if (usable && face.ask) pass++; else bad(`${where}: unusable ${face.kind} front ${JSON.stringify(face)}`);
      const shown = fold(faceText(face));
      const names = [it.name, it.lname, ...(it.alt || [])].filter(n => fold(n).trim().length >= 4);
      const hit = names.find(n => shown.includes(fold(n).trim()));
      if (hit) bad(`${where}: front shows the answer "${hit}": ${faceText(face).replace(/\s+/g, ' ')}`); else pass++;
      if (VERBOSE && face.kind === 'text' && rand() < 0.03) console.log(`  ${where}: [${face.ask}] ${face.lines.join(' | ')}`);
      const mc = mcOptions(pack, it, items.length >= 4 ? items : pack.items, kids ? 3 : 4, rand, { kids });
      const want = Math.min(kids ? 3 : 4, new Set((items.length >= 4 ? items : pack.items).map(x => fold(x.name))).size);
      if (!mc || mc.options[mc.answer] !== it.name || mc.options.length !== want || new Set(mc.options.map(fold)).size !== mc.options.length) {
        bad(`${where}: bad options ${JSON.stringify(mc)} (want ${want})`);
      } else pass++;
    }
  }
}

const skipCount = Object.values(skipped).reduce((a, b) => a + b.length, 0);
console.log(`cards ${cards} (img ${kinds.img}, audio ${kinds.audio}, text ${kinds.text}); skipped ${skipCount}`);
for (const [p, ids] of Object.entries(skipped)) console.log(`  skipped ${p}: ${ids.length}${VERBOSE ? ' ' + ids.slice(0, 8).join(', ') : ''}`);
// Adults must get a card for nearly everything: a skip is only allowed when the item truly has nothing to show.
const adultSkips = Object.entries(skipped).filter(([p]) => !p.endsWith('(kids)')).reduce((a, [, v]) => a + v.length, 0);
if (adultSkips > 0.01 * cards) bad(`too many items skipped for adults: ${adultSkips}`); else pass++;
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
