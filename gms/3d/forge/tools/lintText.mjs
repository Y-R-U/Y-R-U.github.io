#!/usr/bin/env node
// Prose checks on the dialogue packs. lintQuests.mjs proves the packs are structurally sound;
// this one is about what the player reads.
//
//   node tools/lintText.mjs
//   node tools/lintText.mjs --worst    also list the twelve longest lines

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normaliseDialogue, normaliseQuests, MAX_LINE } from '../js/game/questdef.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MARKUP = /[<>*_`|~\[\]{}]|&[a-z]+;|\\n/i;
const LONG_SCENE = 8;
const readJson = p => JSON.parse(readFileSync(p, 'utf8'));

export function lintText(root = ROOT) {
  const errors = [], warnings = [], lines = [];
  const data = join(root, 'data');
  const packs = readJson(join(data, 'quests/index.json'));
  const cast = existsSync(join(data, 'cast.json')) ? readJson(join(data, 'cast.json')) : {};

  const nodes = {}, defs = {};
  for (const pack of packs) {
    const dp = join(data, `dialogue/${pack}.json`);
    if (existsSync(dp)) {
      const r = normaliseDialogue(readJson(dp), { pack });
      errors.push(...r.errors);
      Object.assign(nodes, r.nodes);
    }
    Object.assign(defs, normaliseQuests(readJson(join(data, `quests/${pack}.json`)), { pack }).defs);
  }

  const played = new Set();
  for (const def of Object.values(defs)) {
    for (const e of def.onDone) if (e[0] === 'dialogue') played.add(e[1]);
    for (const s of def.steps) {
      for (const e of s.onDone || []) if (e[0] === 'dialogue') played.add(e[1]);
      for (const o of s.objectives) if (o.k === 'talk' && o.node) played.add(o.node);
    }
  }
  for (const n of Object.values(nodes)) {
    for (const c of n.choices || []) if (c.goto) played.add(c.goto);
    if (n.next) played.add(n.next);
  }

  for (const [id, n] of Object.entries(nodes)) {
    if (!played.has(id)) warnings.push(`${id}: nothing ever plays this node`);
    if (n.lines.length > LONG_SCENE) warnings.push(`${id}: ${n.lines.length} bubbles — over ${LONG_SCENE} reads as a cutscene`);
    n.lines.forEach((l, i) => {
      if (!cast[l[0]] && l[0] !== 'player') warnings.push(`${id}.lines[${i}]: speaker ${l[0]} has no name in data/cast.json`);
      for (let j = 1; j < l.length; j++) {
        if (MARKUP.test(l[j])) errors.push(`${id}.lines[${i}][${j}]: the format carries plain strings — no markup`);
        lines.push({ where: `${id}[${i}]`, n: l[j].length, text: l[j] });
      }
    });
    for (const c of n.choices || []) {
      if (MARKUP.test(c.say)) errors.push(`${id}: choice "${c.say}" contains markup`);
      lines.push({ where: `${id} choice`, n: c.say.length, text: c.say });
    }
  }
  return { errors, warnings, lines, nodes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, warnings, lines, nodes } = lintText();
  for (const w of warnings) console.warn(`  warn  ${w}`);
  for (const e of errors) console.error(` error  ${e}`);
  if (process.argv.includes('--worst')) {
    for (const l of [...lines].sort((a, b) => b.n - a.n).slice(0, 12)) {
      console.log(`  ${String(l.n).padStart(2)}/${MAX_LINE}  ${l.where.padEnd(24)} ${l.text}`);
    }
  }
  const longest = lines.reduce((m, l) => Math.max(m, l.n), 0);
  console.log(`${Object.keys(nodes).length} nodes · ${lines.length} lines · longest ${longest}/${MAX_LINE} · ${warnings.length} warnings · ${errors.length} errors`);
  process.exit(errors.length ? 1 : 0);
}
