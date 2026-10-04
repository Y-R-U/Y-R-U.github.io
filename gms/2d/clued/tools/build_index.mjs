#!/usr/bin/env node
// Validates every data/packs/*.json and writes data/index.json (CONTRACT.md). Packs with errors are left out and the exit code is 1.
// Usage: node tools/build_index.mjs [--quiet] [--strict]   (--strict also fails on warnings)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, validatePack, packCaps } from './c1_schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = join(ROOT, 'data/packs');
const quiet = process.argv.includes('--quiet'), strict = process.argv.includes('--strict');

const THEME_META = {
  animals: ['Animals', '🦁'], nature: ['Nature', '🌿'], geography: ['Geography', '🌍'], screen: ['Screen', '🎬'],
  music: ['Music', '🎵'], books: ['Books & words', '📚'], people: ['People', '🧑'], science: ['Science', '🔬'],
  art: ['Art', '🎨'], history: ['History', '🏛️'], sport: ['Sport', '⚽'], food: ['Food & drink', '🍜'],
  general: ['General knowledge', '💡'], kids: ['Kids', '🧸'],
};

let files = [];
try { files = readdirSync(PACKS).filter(f => f.endsWith('.json')).sort(); } catch {}
const allErr = [], allWarn = [];
const packs = {};
const byTheme = Object.fromEntries(THEMES.map(t => [t, []]));

for (const f of files) {
  const id = f.replace(/\.json$/, '');
  let pack;
  try { pack = JSON.parse(readFileSync(join(PACKS, f), 'utf8')); }
  catch (e) { allErr.push(`pack ${id}: invalid JSON (${e.message})`); continue; }
  const { errors, warnings } = validatePack(pack, id);
  allErr.push(...errors); allWarn.push(...warnings);
  if (errors.length) continue;
  packs[id] = {
    title: pack.title, theme: pack.theme, icon: pack.icon, kids: !!pack.kids,
    items: (pack.items || []).length, questions: (pack.questions || []).length,
    ...(pack.notice ? { notice: pack.notice } : {}),
    ...(pack.kidsSafe === false ? { kidsSafe: false } : {}),
    caps: packCaps(pack),
  };
  byTheme[pack.theme].push(id);
  if (pack.kids && pack.theme !== 'kids') byTheme.kids.push(id);
}

const index = {
  build: new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''),
  themes: THEMES.filter(t => byTheme[t].length).map(t => ({ id: t, title: THEME_META[t][0], icon: THEME_META[t][1], packs: byTheme[t] })),
  packs,
};

if (!quiet || allErr.length) {
  for (const w of allWarn.slice(0, quiet ? 0 : 60)) console.warn('warn:', w);
  if (allWarn.length > 60 && !quiet) console.warn(`… ${allWarn.length - 60} more warnings`);
  for (const e of allErr) console.error('ERROR:', e);
}
// Broken packs are left out of the index (so one lane can't block the rest) but the run still fails.
writeFileSync(join(ROOT, 'data/index.json'), JSON.stringify(index, null, 1) + '\n');
const skipped = files.map(f => f.replace(/\.json$/, '')).filter(id => !packs[id]);
console.log(`build_index: ${Object.keys(packs).length} packs indexed${skipped.length ? `, SKIPPED (errors): ${skipped.join(', ')}` : ''}; ${allErr.length} error(s), ${allWarn.length} warning(s) → data/index.json`);
if (allErr.length || (strict && allWarn.length)) process.exit(1);
