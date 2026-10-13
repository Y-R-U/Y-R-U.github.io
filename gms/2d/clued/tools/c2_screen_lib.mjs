// Lane SCREEN: second-source checks for screen/book items (Wikipedia lead sentence + infobox vs Wikidata).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fetchJSON, wpQids, wdEntities, claims, wdYear, label } from './c2_lib.mjs';
import { DEMONYMS, NATIONALITY_EXTRA } from './local_names.mjs';

const COUNTRIES = JSON.parse(readFileSync(join(ROOT, 'data/geo/countries.json'), 'utf8'));
export const QID_ISO = Object.fromEntries(Object.entries(COUNTRIES).filter(([, c]) => c.q).map(([iso, c]) => [c.q, iso]));
// historical states Wikidata uses as country of origin
Object.assign(QID_ISO, { Q15180: 'RUS', Q713750: 'DEU', Q16957: 'DEU', Q7318: 'DEU', Q83286: 'SRB', Q33946: 'CZE', Q8733: 'CHN', Q174193: 'GBR', Q161885: 'GBR', Q179876: 'GBR' });
export const isoName = iso => COUNTRIES[iso]?.n;
const DEM = new Map();
for (const [iso, l] of Object.entries(DEMONYMS)) for (const d of l) DEM.set(d, iso);
for (const [d, iso] of Object.entries(NATIONALITY_EXTRA)) DEM.set(d, iso);
for (const [d, iso] of Object.entries({ 'New Zealand': 'NZL', 'Hong Kong': 'HKG', Taiwanese: 'TWN', Mexican: 'MEX', Brazilian: 'BRA', Senegalese: 'SEN', Iranian: 'IRN', Filipino: 'PHL', Indonesian: 'IDN', Malaysian: 'MYS', Singaporean: 'SGP', Lebanese: 'LBN', Algerian: 'DZA', Tunisian: 'TUN', Icelandic: 'ISL', Estonian: 'EST', Serbian: 'SRB', Yugoslav: 'SRB', Bosnian: 'BIH', Croatian: 'HRV', Georgian: 'GEO', Armenian: 'ARM', Kazakh: 'KAZ', Czechoslovak: 'CZE', 'West German': 'DEU', 'East German': 'DEU', Bengali: 'IND', Hindi: 'IND', Tamil: 'IND', Telugu: 'IND', Malayalam: 'IND', Kannada: 'IND', Mongolian: 'MNG', Nigerian: 'NGA', Bhutanese: 'BTN', Nepali: 'NPL', 'Sri Lankan': 'LKA', Colombian: 'COL', Uruguayan: 'URY', Paraguayan: 'PRY', Bolivian: 'BOL', Ecuadorian: 'ECU', Luxembourgish: 'LUX', Bulgarian: 'BGR', Slovak: 'SVK', Slovenian: 'SVN', Lithuanian: 'LTU', Latvian: 'LVA', Belarusian: 'BLR', Moldovan: 'MDA', Palestinian: 'PSE', Jordanian: 'JOR', Syrian: 'SYR', Emirati: 'ARE', Qatari: 'QAT', Kuwaiti: 'KWT', Afghan: 'AFG', Cambodian: 'KHM', Burmese: 'MMR', Laotian: 'LAO', 'North Korean': 'PRK', Zimbabwean: 'ZWE', Ugandan: 'UGA', Tanzanian: 'TZA', Cameroonian: 'CMR', Beninese: 'BEN', Chilean: 'CHL', Zimbabwean: 'ZWE', Malian: 'MLI', Puerto: null, English: 'GBR', Scottish: 'GBR', Welsh: 'GBR', British: 'GBR', 'Northern Irish': 'GBR', Soviet: 'RUS' })) if (iso) DEM.set(d, iso);
const DEM_RE = new RegExp(`(?<![\\p{L}])(${[...DEM.keys()].sort((a, b) => b.length - a.length).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}])`, 'gu');
export const demonymIsos = s => [...new Set([...String(s).matchAll(DEM_RE)].map(m => DEM.get(m[1])))];

const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// Plain-text intro of each article (redirects followed), keyed by the requested title.
export async function wpLeads(titles) {
  const out = {};
  for (const part of chunks([...new Set(titles)], 20)) {
    const j = await fetchJSON('https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exlimit=20&redirects=1&format=json&formatversion=2&titles=' + encodeURIComponent(part.join('|')));
    const norm = Object.fromEntries((j.query.normalized || []).map(n => [n.from, n.to]));
    const red = Object.fromEntries((j.query.redirects || []).map(n => [n.from, n.to]));
    const by = Object.fromEntries(j.query.pages.map(p => [p.title, p.extract || '']));
    for (const t of part) { let n = norm[t] || t; n = red[n] || n; out[t] = by[n] || ''; }
  }
  return out;
}
// First sentence-ish chunk: "X is a 1994 American comedy-drama film directed by …"
export function leadFacts(text) {
  const s = String(text).replace(/\([^()]*\)/g, '').replace(/\s+/g, ' ');
  const m = /\b(?:is|was) (?:a|an) (.{0,160}?)\b(film|movie|television|TV|series|sitcom|soap opera|novel|novella|book|picture book|children's|poem|play|epic|memoir|collection|anthology|animated)/i.exec(s);
  const head = m ? m[1] + m[2] : '';
  const y = /\b(1[89]\d\d|20[0-2]\d)\b/.exec(head);
  return { head, year: y ? +y[1] : null, isos: demonymIsos(head.replace(/\b(language|[A-Z][a-z]+-language)\b.*$/, '')), text: s };
}

// Lead-section wikitext (infobox) per title.
export async function wpInfobox(title) {
  const j = await fetchJSON('https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&section=0&redirects=1&format=json&formatversion=2&page=' + encodeURIComponent(title));
  return j?.parse?.wikitext || '';
}
// Value of "| field = …" up to the next top-level field.
export function ibField(wt, field) {
  const re = new RegExp(`\\n\\s*\\|\\s*${field}\\s*=`, 'i');
  const m = re.exec(wt);
  if (!m) return '';
  let i = m.index + m[0].length, depth = 0, out = '';
  for (; i < wt.length; i++) {
    const two = wt.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; out += two; i++; continue; }
    if (two === '}}' || two === ']]') { if (depth === 0) break; depth--; out += two; i++; continue; }
    if (depth === 0 && wt[i] === '\n' && /^\n\s*\|/.test(wt.slice(i, i + 4))) break;
    out += wt[i];
  }
  return out;
}
// Linked targets in order ([[Target|text]]), plus unlinked plain names from list templates.
const NOTE_T = /^\{\{\s*(efn|refn|sfn|sfnp|r|ref|cite|citation|notetag|ref label|#tag)\b/i;
function dropNotes(v) {
  let out = '';
  for (let i = 0; i < v.length; i++) {
    if (v.startsWith('{{', i) && NOTE_T.test(v.slice(i, i + 20))) {
      let d = 0, j = i;
      for (; j < v.length; j++) { if (v.startsWith('{{', j)) { d++; j++; } else if (v.startsWith('}}', j)) { d--; j++; if (!d) break; } }
      i = j; continue;
    }
    out += v[i];
  }
  return out;
}
export function ibLinks(v) {
  return [...dropNotes(v).replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)].map(m => m[1].trim()).filter(t => !/^(File|Image|Category):/i.test(t));
}

// Every name in a list field, in order: linked ({ link }) or plain text ({ text }). Wikipedia links a person only once
// per article, so a star who is also the writer/director is often plain text in "starring".
export function ibEntries(v) {
  const t = dropNotes(v).replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '')
    .replace(/\{\{\s*(plainlist|plain list|ubl|unbulleted list|hlist|flatlist|bulleted list)\s*\|?/gi, '').replace(/\{\{|\}\}/g, '')
    .replace(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g, (m, x) => `@@${x.trim()}@@`);
  return t.split(/\n\s*\*|\*|<br\s*\/?>|\||\n/i).map(x => x.trim()).filter(Boolean).map(x => {
    const m = /@@([^@]+)@@/.exec(x);
    if (m) return /^(File|Image|Category):/i.test(m[1]) ? null : { link: m[1] };
    const text = x.replace(/'''?|\([^)]*\)|&nbsp;/g, '').replace(/\s+/g, ' ').trim();
    return /^[A-Z][\p{L}.'’ -]{2,40}$/u.test(text) && !/=/.test(x) ? { text } : null;
  }).filter(Boolean);
}

// Wikidata sitelink counts (Wikipedias only): a fame measure.
export async function sitelinkCounts(qids) {
  const out = {};
  for (const part of chunks([...new Set(qids.filter(Boolean))], 40)) {
    const j = await fetchJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${part.join('|')}&props=sitelinks&format=json`);
    for (const [id, e] of Object.entries(j.entities || {})) out[id] = Object.keys(e.sitelinks || {}).filter(k => /wiki$/.test(k) && !/^(commons|species|meta|wikidata|mediawiki|sources|outreach|incubator)wiki$/.test(k)).length;
  }
  return out;
}

export const ISO_OF_QIDS = qs => [...new Set(qs.map(q => QID_ISO[q]).filter(Boolean))];
export { wpQids, wdEntities, claims, wdYear, label };
