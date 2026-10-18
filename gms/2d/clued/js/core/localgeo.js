// In-country geography for the local focus (data/local/geo.json, built + validated by tools/local_geo_build.mjs):
// state capitals, which state a city is in, bigger/smaller, city populations, tap / name a state on the map.
// Questions come out in existing formats (mc, tf, number, map-click), each marked data.local = cc.
import { pick, shuffle, sample } from './rng.js?v=202610181234';
import { givesAway } from '../formats/registry.js?v=202610181234';

export const HOME_FORMATS = new Set(['mc', 'tf', 'number', 'map-click']);
// Rounds on these packs (or "All themes", or a map round) also get in-country questions.
export const HOME_PACKS = new Set(['countries', 'capitals']);
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ONE = { 'states and territories': 'state or territory', 'provinces and territories': 'province or territory', 'states and union territories': 'state or union territory' };
const unitOne = l => ONE[l] || String(l || 'state').replace(/ and .*/, '').replace(/s$/, '');
const big = n => (n >= 1e6 ? `${+(n / 1e6).toPrecision(3)} million` : Math.round(n).toLocaleString('en-GB'));
const placeOf = (C, c) => (C.phrase === 'urban' ? `the ${c.n} ${C.kind}` : `the city of ${c.n}`);

// Candidate makers: each returns [{ q, d }] for one country (d = 1 easy … 3 hard, before "I live here" easing).
function candidates(cc, C, states, cname, kinds) {
  const out = [];
  const S = C.states || {};
  const codes = Object.keys(S);
  const one = unitOne(C.unit);
  const rank = new Map(C.cities.map((c, i) => [c, i]));
  const cityD = c => (rank.get(c) < 5 ? 1 : rank.get(c) < 15 ? 2 : 3);
  const topCity = {};
  for (const c of C.cities) if (c.st && !topCity[c.st]) topCity[c.st] = c.n;
  const caps = codes.filter(k => S[k].capital);
  const capCount = {};
  for (const k of caps) capCount[S[k].capital] = (capCount[S[k].capital] || 0) + 1;
  const sameName = k => norm(S[k].capital).startsWith(norm(S[k].n)) || norm(S[k].n).startsWith(norm(S[k].capital)) || givesAway(S[k].capital, `What is the capital of ${S[k].n}?`);
  const area = states?.s || {};
  const byArea = codes.slice().sort((a, b) => (area[b]?.a || 0) - (area[a]?.a || 0));
  const areaD = k => { const i = byArea.indexOf(k); return i < byArea.length / 3 ? 1 : i < byArea.length * 2 / 3 ? 2 : 3; };
  const capD = k => (topCity[k] === S[k].capital ? 1 : 2) + (areaD(k) === 3 && codes.length > 12 ? 1 : 0);
  const base = (id, extra) => ({ id: `home:${cc}:${id}`, refs: [], ...extra, data: { ...(extra.data || {}), local: cc } });

  if (kinds.mc) {
    for (const k of caps) {
      if (sameName(k) || capCount[S[k].capital] > 1) continue;
      if (new Set(caps.map(x => S[x].capital)).size < 4) continue;
      out.push({ d: capD(k), make: rng => {
        const opts = shuffle(rng, [S[k].capital, ...sample(rng, [...new Set(caps.filter(x => S[x].capital !== S[k].capital).map(x => S[x].capital))], 3)]);
        return base(`cap:${k}`, { format: 'mc', prompt: `What is the capital of ${S[k].n}?`, options: opts.map(text => ({ text })), answer: opts.indexOf(S[k].capital),
          answerText: S[k].capital, explain: `${S[k].capital} is the capital of ${S[k].n}.`, hint: `It starts with “${S[k].capital.charAt(0)}”` });
      } });
      out.push({ d: capD(k) + 1, make: rng => {
        const opts = shuffle(rng, [k, ...sample(rng, codes.filter(x => x !== k), 3)]);
        const prompt = `${S[k].capital} is the capital of which ${one}?`;
        if (givesAway(S[k].n, prompt, opts.filter(x => x !== k).map(x => S[x].n))) return null;
        return base(`capof:${k}`, { format: 'mc', prompt, options: opts.map(x => ({ text: S[x].n })), answer: opts.indexOf(k),
          answerText: S[k].n, explain: `${S[k].capital} is the capital of ${S[k].n}.`, hint: `It starts with “${S[k].n.charAt(0)}”` });
      } });
    }
    for (const c of C.cities) {
      if (!c.st || !S[c.st] || c.st === 'US-DC' || codes.length < 4) continue;
      out.push({ d: cityD(c), make: rng => {
        const opts = shuffle(rng, [c.st, ...sample(rng, codes.filter(x => x !== c.st && x !== 'US-DC'), 3)]);
        const prompt = `Which ${one} is ${c.n} in?`;
        if (norm(c.n).includes(norm(S[c.st].n)) || givesAway(S[c.st].n, prompt, opts.filter(x => x !== c.st).map(x => S[x].n))) return null;
        return base(`in:${c.n}`, { format: 'mc', prompt, options: opts.map(x => ({ text: S[x].n })), answer: opts.indexOf(c.st),
          answerText: S[c.st].n, explain: `${c.n} is in ${S[c.st].n}.`, hint: `It starts with “${S[c.st].n.charAt(0)}”` });
      } });
    }
    // bigger or smaller: only pairs at least 1.5× apart, so other ways of counting can't flip the answer
    const cs = C.cities.slice(0, 40);
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j], r = a.pop / b.pop;
      if (r < 1.5 || (j - i) % 3) continue;
      out.push({ d: r >= 4 ? 1 : r >= 2 ? 2 : 3, make: rng => {
        const opts = shuffle(rng, [a, b]);
        return base(`more:${a.n}|${b.n}`, { format: 'mc', prompt: `Which has more people: ${opts[0].n} or ${opts[1].n}?`, options: opts.map(x => ({ text: x.n })),
          answer: opts.indexOf(a), answerText: a.n, explain: `${C.kind[0].toUpperCase()}${C.kind.slice(1)} populations (${a.year}): ${a.n} ${big(a.pop)}, ${b.n} ${big(b.pop)}.` });
      } });
    }
  }
  if (kinds.tf) {
    for (const k of caps) {
      if (sameName(k) || capCount[S[k].capital] > 1) continue;
      out.push({ d: capD(k), make: rng => {
        const truth = rng() < 0.5, other = pick(rng, caps.filter(x => S[x].capital !== S[k].capital && !sameName(x)));
        const shown = truth ? S[k].capital : S[other].capital;
        return base(`tfcap:${k}:${shown}`, { format: 'tf', prompt: `${shown} is the capital of ${S[k].n}.`, answer: truth, answerText: truth ? 'True' : 'False',
          explain: `${S[k].capital} is the capital of ${S[k].n}.` });
      } });
    }
  }
  if (kinds.number) {
    const lo = Math.min(...C.cities.map(c => c.pop)), hi = Math.max(...C.cities.map(c => c.pop));
    for (const c of C.cities.slice(0, 40)) {
      out.push({ d: cityD(c), make: () => base(`pop:${c.n}`, { format: 'number', prompt: `In ${c.year}, about how many people lived in ${placeOf(C, c)}?`, answer: c.pop, answerText: big(c.pop),
        explain: `${c.n}: ${big(c.pop)} people (${C.kind}, ${c.year}).`, data: { min: Math.max(1000, lo / 3), max: hi * 2, log: true, unit: '' } }) });
    }
  }
  if (kinds.map && states) {
    for (const k of codes) {
      if (!area[k]) continue;
      out.push({ d: areaD(k), make: () => base(`tap:${k}`, { format: 'map-click', prompt: `Tap ${S[k].n}`, answer: k, answerText: S[k].n,
        explain: `${S[k].n} is one of the ${C.unit} of ${cname}.`, data: { region: cc, kind: 'state', name: S[k].n, level: areaD(k), sub: `${cname} · ${one}` } }) });
      if (codes.length >= 4) out.push({ d: areaD(k), make: rng => {
        const opts = shuffle(rng, [k, ...sample(rng, codes.filter(x => x !== k), 3)]);
        const ask = `Which ${one} is highlighted?`;
        return base(`hl:${k}`, { format: 'map-click', prompt: givesAway(S[k].n, ask, opts.filter(x => x !== k).map(x => S[x].n)) ? 'Which of these is highlighted?' : ask, options: opts.map(x => ({ text: S[x].n })), answer: opts.indexOf(k), answerText: S[k].n,
          data: { region: cc, kind: 'state', mode: 'name', iso: k, name: S[k].n, level: areaD(k) } });
      } });
    }
  }
  return out;
}

// Up to `count` in-country questions for this round's format. difficulty 0 = mixed; live = one step easier, otherwise one step harder
// (Aaron: your own state capitals are easy, someone else's are medium/hard).
export function homeQuestions({ rng, cc, format, count, difficulty = 0, kids = false, live = false, geo, states, cname, avoid }) {
  const C = geo?.countries?.[cc];
  if (!C || !HOME_FORMATS.has(format)) return [];
  const kinds = { mc: format === 'mc', tf: format === 'tf', number: format === 'number', map: format === 'map-click' };
  let cands = candidates(cc, C, states?.[cc] || null, cname, kinds).map(c => ({ ...c, d: live ? Math.max(1, c.d - 1) : Math.min(3, c.d + 1) }));
  const want = kids ? 1 : difficulty;
  if (want) {
    const bands = want === 1 ? [[1], [1, 2]] : want === 2 ? [[2], [1, 2], [1, 2, 3]] : [[3], [2, 3], [1, 2, 3]];
    for (const b of kids ? [[1]] : bands) { const l = cands.filter(c => b.includes(c.d)); if (l.length >= Math.min(count, 6) || b === bands[bands.length - 1]) { cands = l; break; } }
  }
  const out = [], ids = new Set();
  for (const c of shuffle(rng, cands)) {
    if (out.length >= count) break;
    const q = c.make(rng);
    if (!q || ids.has(q.id) || avoid?.has(q.id)) continue;
    ids.add(q.id);
    q.data.level = q.data.level ?? c.d;
    q.lv = c.d;
    if (kids) q.data.kids = true;
    out.push(q);
  }
  return out;
}
