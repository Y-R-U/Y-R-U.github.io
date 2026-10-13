#!/usr/bin/env node
// Device → country detection data → data/local/places.json: { iso2: { AU: 'AUS' }, tz: { 'Australia/Sydney': 'AU' } }.
// ISO codes from Wikidata (P297/P298), time zones from the system tz database (zone.tab) plus old link names that
// browsers still report (Asia/Calcutta…). Rerun only to refresh; the output is committed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COUNTRIES = JSON.parse(readFileSync(join(ROOT, 'data/geo/countries.json'), 'utf8'));
const q = 'SELECT DISTINCT ?a2 ?a3 WHERE { ?c wdt:P297 ?a2; wdt:P298 ?a3 . }';
const u = new URL('https://query.wikidata.org/sparql');
u.searchParams.set('query', q);
const r = await fetch(u, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'CluedLocalBuild/1.0 (https://games.br8t.com/gms/2d/clued/)' } });
const iso2 = {};
for (const b of (await r.json()).results.bindings) if (COUNTRIES[b.a3.value]) iso2[b.a2.value] = b.a3.value;
Object.assign(iso2, { XK: 'XKX', GB: 'GBR', UK: 'GBR' });
const tz = {};
for (const line of readFileSync('/usr/share/zoneinfo/zone.tab', 'utf8').split('\n')) {
  if (!line || line[0] === '#') continue;
  const [cc, , zone] = line.split('\t');
  if (iso2[cc]) tz[zone] = cc;
}
Object.assign(tz, {
  'Asia/Calcutta': 'IN', 'Asia/Saigon': 'VN', 'Asia/Katmandu': 'NP', 'Asia/Rangoon': 'MM', 'Asia/Dacca': 'BD', 'Asia/Ulan_Bator': 'MN',
  'Europe/Kiev': 'UA', 'America/Buenos_Aires': 'AR', 'America/Indianapolis': 'US', 'America/Louisville': 'US', 'America/Godthab': 'GL',
  'Australia/ACT': 'AU', 'Australia/Canberra': 'AU', 'Australia/NSW': 'AU', 'Australia/Victoria': 'AU', 'Australia/Queensland': 'AU', 'Australia/West': 'AU',
  'Australia/South': 'AU', 'Australia/North': 'AU', 'Australia/Tasmania': 'AU', 'Pacific/Auckland': 'NZ', 'NZ': 'NZ', 'Europe/London': 'GB', 'GB': 'GB',
  'US/Eastern': 'US', 'US/Central': 'US', 'US/Mountain': 'US', 'US/Pacific': 'US', 'US/Alaska': 'US', 'US/Hawaii': 'US', 'US/Arizona': 'US',
  'Canada/Eastern': 'CA', 'Canada/Central': 'CA', 'Canada/Mountain': 'CA', 'Canada/Pacific': 'CA', 'Canada/Atlantic': 'CA', 'Canada/Newfoundland': 'CA',
  'Brazil/East': 'BR', 'Japan': 'JP', 'Asia/Istanbul': 'TR', 'Europe/Istanbul': 'TR', 'Turkey': 'TR', 'Singapore': 'SG', 'Hongkong': 'HK', 'Eire': 'IE',
});
mkdirSync(join(ROOT, 'data/local'), { recursive: true });
writeFileSync(join(ROOT, 'data/local/places.json'), JSON.stringify({ v: 1, note: 'Built by tools/local_places.mjs', iso2, tz }));
console.log(`places.json: ${Object.keys(iso2).length} countries, ${Object.keys(tz).length} time zones`);
