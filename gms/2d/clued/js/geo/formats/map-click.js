import { register, collect, pick, shuffle } from '../../formats/registry.js?v=202610161231';
import {
  geo, countryIds, regionMembers, REGIONS, STATE_VIEWS, createMap, frame, message, revealCard, isKids, cname, byLevel,
  stateDifficulty, REGION_CHOICES, REGION_LABELS, STATE_CHOICES, STATE_LABELS, refFor, supportsGeo, theName, regionForCountry, isPlayable,
} from './common.js?v=202610161231';

const EASY_STATES = ['USA', 'CAN', 'AUS', 'BRA', 'IND', 'GBR', 'DEU', 'ITA', 'ESP', 'FRA', 'MEX', 'CHN', 'JPN'];

function stateQuestion(rng, iso, level) {
  const S = geo.states[iso]; if (!S) return null;
  const diff = stateDifficulty(iso);
  const ids = Object.keys(S.s);
  const pool = !level ? ids : ids.filter(id => (level === 3 ? diff[id] >= 2 : diff[id] <= level));
  const sid = pick(rng, pool.length >= 3 ? pool : ids);
  const name = S.s[sid].n;
  const one = S.l.replace(/ and .*/, '').replace(/s$/, '').replace(/ie$/, 'y');
  return {
    format: 'map-click', id: `map-click:${iso}:${sid}`, prompt: `Tap ${name}`, answer: sid, answerText: name,
    explain: `${name} is one of the ${S.l} of ${cname(iso)}.`, refs: [],
    data: { region: iso, kind: 'state', name, level, sub: `${cname(iso)} · ${one}` },
  };
}

export default register({
  id: 'map-click', title: 'Map click', icon: '🗺️', blurb: 'Tap the country, state or province', tags: ['map', 'kids'],
  options: [
    { key: 'region', label: 'Map', type: 'choice', values: [...REGION_CHOICES, 'states'], labels: [...REGION_LABELS, 'States & provinces'], default: 'world' },
    { key: 'country', label: 'States of', type: 'choice', values: STATE_CHOICES, labels: STATE_LABELS, default: 'any' },
    { key: 'ask', label: 'Question', type: 'choice', values: ['tap', 'name'], labels: ['Tap the country', 'Name the highlighted one'], default: 'tap', showIf: o => o.region !== 'states' },
  ],
  supports: supportsGeo, packless: true,
  generate({ rng, packs = [], count, opts = {}, difficulty = 0, avoid, kids: kidsArg }) {
    const kids = !!(opts.kids || kidsArg);
    const level = kids ? 1 : difficulty || 0;
    if (opts.region === 'states') {
      const pool = opts.country && opts.country !== 'any' ? [opts.country] : level === 1 ? EASY_STATES : Object.keys(STATE_VIEWS);
      return collect(count, () => { const q = stateQuestion(rng, pick(rng, pool), level); if (q) q.data.kids = kids; return q; }, avoid);
    }
    const region = REGIONS[opts.region] ? opts.region : 'world';
    const members = region === 'world' ? countryIds() : regionMembers(region);
    if (opts.ask === 'name') return collect(count, () => nameQuestion(rng, byLevel(members, level, undefined, 8, kids), region, level, kids, packs), avoid);
    // Greenland is a territory, never "a country", but "Tap Greenland" is one of the best-known shapes there is
    if (region === 'world') members.push('GRL');
    const pool = byLevel(members, level, undefined, Math.min(8, count), kids);
    return collect(count, () => {
      const iso = pick(rng, pool);
      return {
        format: 'map-click', id: `map-click:${region}:${iso}`, prompt: `Tap ${theName(iso)}`, answer: iso, answerText: cname(iso),
        refs: refFor(packs, iso), data: { region, kind: 'country', name: cname(iso), level, kids },
      };
    }, avoid);
  },
  render(el, q, api) {
    if (q.data?.mode === 'name') return renderName(el, q, api);
    const kids = isKids(q, api);
    const easy = kids || q.data.level === 1;
    const ui = frame(el, { prompt: q.prompt });
    if (q.data.sub) { const s = document.createElement('small'); s.className = 'gmq-sub'; s.textContent = q.data.sub; ui.top.append(s); }
    let done = false;
    const map = createMap(ui.mapEl, {
      region: q.data.region, target: q.data.kind === 'state' ? 'states' : 'countries',
      ...(q.answer === 'GRL' && q.data.region === 'world' ? { playable: id => id === 'GRL' || isPlayable(id) } : {}),
      style: easy && q.data.kind === 'country' ? 'continents' : 'plain', bigTargets: easy, dots: !easy, portraitZoom: !easy,
      onTap(hit) {
        if (done) return;
        if (!hit.id || !hit.playable) { if (hit.id) map.toast('Not part of this round'); return; }
        finish(hit.id);
      },
    });
    const nameOf = id => (q.data.kind === 'state' ? geo.states[q.data.region]?.s[id]?.n : cname(id)) || id;
    const sent = id => (q.data.kind === 'state' ? nameOf(id) : theName(id));
    function finish(given) {
      done = true;
      map.setLocked(true);
      const correct = given === q.answer;
      if (given) { map.setState(given, correct ? 'correct' : 'wrong'); if (!correct) map.label(given, nameOf(given)); }
      if (!correct) { map.setState(q.answer, 'target pulse'); map.flyTo(given ? [given, q.answer] : [q.answer], { maxZoom: 6 }); }
      map.label(q.answer, nameOf(q.answer));
      const msg = correct ? (kids ? `Yes! That's ${sent(q.answer)}! 🎉` : `Correct, that's ${sent(q.answer)}.`)
        : given ? (kids ? `Good try! That's ${sent(given)}. ${cap(sent(q.answer))} is the glowing one.` : `That's ${sent(given)}. ${cap(sent(q.answer))} is highlighted.`)
          : `${cap(sent(q.answer))} is highlighted.`;
      message(ui.foot, msg, correct);
      if (q.data.kind === 'country') ui.foot.append(revealCard(q.answer, kids));
      if (given !== undefined) api.answer({ correct, given, detail: { name: given ? nameOf(given) : null } });
    }
    return {
      map,
      destroy: () => map.destroy(),
      timeout() { if (!done) map.ready.then(() => finish(undefined)); },
      choose(x) {
        map.ready.then(() => {
          if (x === 'correct') return finish(q.answer);
          const other = map.featureIds().find(id => id !== q.answer && map.feature(id).playable);
          finish(other);
        });
      },
    };
  },
});

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// "Which country is highlighted?": wrong answers come from the same pool, same continent first.
function nameQuestion(rng, pool, region, level, kids, packs) {
  if (pool.length < 4) return null;
  const iso = pick(rng, pool), cont = geo.countries[iso].c;
  const others = pool.filter(x => x !== iso);
  const near = shuffle(rng, others.filter(x => geo.countries[x].c === cont));
  const wrong = [...near, ...shuffle(rng, others.filter(x => !near.includes(x)))].slice(0, kids ? 2 : 3);
  const opts = shuffle(rng, [iso, ...wrong]);
  return {
    format: 'map-click', id: `map-click:name:${iso}`, prompt: 'Which country is highlighted?',
    options: opts.map(id => ({ text: cname(id) })), answer: opts.indexOf(iso), answerText: cname(iso),
    refs: refFor(packs, iso), data: { region: region === 'world' ? regionForCountry(iso) : region, kind: 'country', mode: 'name', iso, name: cname(iso), level, kids },
  };
}

function renderName(el, q, api) {
  const kids = isKids(q, api);
  const iso = q.data.iso;
  const ui = frame(el, { prompt: q.prompt });
  let done = false;
  const map = createMap(ui.mapEl, { region: q.data.region, target: 'none', interactive: false, dotFor: [iso], bigTargets: true, padding: 6, portraitZoom: false });
  map.ready.then(() => { if (!done) map.setState(iso, 'target pulse'); });
  const grid = document.createElement('div');
  grid.className = 'gmq-big' + (q.options.length === 3 ? ' n3' : '');
  const btns = q.options.map((o, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = '#fff6dc';
    b.textContent = o.text ?? '';
    b.addEventListener('click', () => finish(i));
    grid.append(b);
    return b;
  });
  ui.foot.append(grid);
  function finish(i) {
    if (done) return;
    done = true;
    const correct = i === q.answer;
    btns.forEach((b, k) => { b.disabled = true; if (k === q.answer) b.classList.add('ok'); else if (k === i) b.classList.add('bad'); });
    map.ready.then(() => { map.setState(iso, 'target'); map.label(iso, q.answerText); });
    message(ui.foot, correct ? (kids ? `Yes! It's ${q.answerText}! 🎉` : `Correct, ${q.answerText}.`) : `It's ${q.answerText}.`, correct);
    if (q.data.kind !== 'state') ui.foot.append(revealCard(iso, kids));   // local focus: "Which state is highlighted?" (js/core/localgeo.js)
    if (i != null) api.answer({ correct, given: i });
  }
  return {
    map, destroy: () => map.destroy(),
    timeout() { finish(null); },
    choose(x) { finish(x === 'correct' ? q.answer : (q.answer + 1) % q.options.length); },
    eliminate(k = 2) {
      const wrong = btns.map((b, i) => i).filter(i => i !== q.answer && !btns[i].disabled);
      for (const i of shuffle(Math.random, wrong).slice(0, Math.min(k, wrong.length - 1))) { btns[i].disabled = true; btns[i].classList.add('bad'); }
    },
  };
}
