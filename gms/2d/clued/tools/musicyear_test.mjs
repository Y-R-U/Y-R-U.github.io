#!/usr/bin/env node
// First-release years in the song packs (lane MUSICYEAR, tools/music_firstyear.json applied by au_resolve.mjs).
//   node tools/musicyear_test.mjs [dataDir]      (exit 1 on any failure)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.argv[2] || path.join(ROOT, 'data/music');
const PACKS = ['hits-1960s', 'hits-1970s', 'hits-1980s', 'hits-1990s', 'hits-2000s', 'hits-2010s', 'hits-2020s', 'one-hit-wonders'];
const decade = (y) => `${Math.floor(y / 10) * 10}s`;
let fails = 0;
const fail = (m) => { fails++; console.log('FAIL ' + m); };

const items = [];
for (const p of PACKS) for (const it of JSON.parse(fs.readFileSync(path.join(DATA, p + '.json'), 'utf8')).items) items.push({ pack: p, it });
const find = (artist, title) => items.filter((x) => x.it.facts.artist === artist && x.it.name === title);

// known re-releases, re-charts and late-December singles: [artist, title, first year, decade pack]
const KNOWN = [
  ['Kate Bush', 'Running Up That Hill (A Deal with God)', 1985, 'hits-1980s'],   // Stranger Things revival, 2022 chart
  ['Roxette', 'It Must Have Been Love', 1987, 'hits-1980s'],                     // Pretty Woman re-release, 1990
  ['Charlene', "I've Never Been to Me", 1976, 'hits-1970s'],                     // re-released 1982
  ['Elvis vs JXL', 'A Little Less Conversation', 1968, 'hits-1960s'],            // 2002 remix of Elvis's 1968 record
  ['Cliff Richard & The Young Ones', 'Living Doll', 1959, 'hits-1980s'],         // 1986 re-recording; no 1950s pack
  ['Los del Río', 'Macarena', 1993, 'hits-1990s'],                               // 1996 remix chart
  ['Los del Río', 'Macarena', 1993, 'one-hit-wonders'],
  ['Norman Greenbaum', 'Spirit in the Sky', 1969, 'hits-1960s'],
  ['Lizzo', 'Good as Hell', 2016, 'hits-2010s'],                                 // 2019 re-release
  ['Fleetwood Mac', 'Go Your Own Way', 1976, 'hits-1970s'],
];
for (const [artist, title, year, pack] of KNOWN) {
  const hit = find(artist, title).find((x) => x.pack === pack);
  if (!hit) { fail(`${artist} — ${title} not in ${pack} (found in ${find(artist, title).map((x) => x.pack).join(', ') || 'none'})`); continue; }
  const { it } = hit;
  if (it.facts.year !== year) fail(`${artist} — ${title}: year ${it.facts.year}, want ${year}`);
  if (it.facts.decade !== decade(year) || it.group !== decade(year)) fail(`${artist} — ${title}: decade ${it.facts.decade} / group ${it.group}, want ${decade(year)}`);
  if (!it.blurb.includes(String(year))) fail(`${artist} — ${title}: blurb lacks ${year}: ${it.blurb}`);
}

// every override reached its item, and every decade pack holds its own decade (no 1950s pack: those stay put)
const OV = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/music_firstyear.json'), 'utf8')).songs;
let applied = 0;
for (const [key, o] of Object.entries(OV)) {
  const [artist, title] = key.split(' — ');
  for (const { pack, it } of items.filter((x) => x.it.facts.artist === artist && (x.it.name === title || x.it.alt?.includes(title)))) {
    applied++;
    if (it.facts.year !== o.year) fail(`${pack} ${key}: year ${it.facts.year}, override ${o.year}`);
    if (it.facts.decade !== decade(o.year) || it.group !== decade(o.year)) fail(`${pack} ${key}: decade/group ${it.facts.decade}/${it.group}`);
    if (!o.blurb && !it.blurb.includes(`released in ${o.year}`)) fail(`${pack} ${key}: blurb "${it.blurb}"`);
    if (/Year-end charts|year-end charts/.test(it.blurb) && !it.blurb.includes(o.charted || '')) fail(`${pack} ${key}: blurb lost the chart year`);
  }
}
// songs left outside their decade's pack on purpose (docs/notes/MUSICYEAR.md): no 1950s pack, or a same-title song there
const STAY = new Set(['hits-1980s/Living Doll', 'hits-2000s/Breathe']);
for (const { pack, it } of items) {
  const m = pack.match(/^hits-(\d{4}s)$/);
  if (!m || it.facts.decade === m[1] || STAY.has(`${pack}/${it.name}`) || (it.facts.decade === '1950s' && m[1] === '1960s')) continue;
  fail(`${pack}: ${it.facts.artist} — ${it.name} is from the ${it.facts.decade}`);
}
if (applied < Object.keys(OV).length) fail(`only ${applied} items carry the ${Object.keys(OV).length} overrides`);
console.log(fails ? `${fails} failures` : `musicyear_test: all passed (${KNOWN.length} known songs, ${applied} override items)`);
process.exit(fails ? 1 : 0);
