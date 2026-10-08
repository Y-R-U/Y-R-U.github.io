// Mastery: overall numbers, the world map coloured by countries learned, pack progress rings, kids stickers.
import { h } from '../ui/kit.js?v=202610081215';
import { header, go } from '../ui/app.js?v=202610081215';
import { kidsProgress } from '../ui/stickers.js?v=202610081215';
import { themeTree, getPack, kidsOn } from './data.js?v=202610081215';
import { getMastery, getCards, packPct } from './model.js?v=202610081215';
import { countryScores, mapBand, level } from './mastery.js?v=202610081215';
import { ring } from './ui.js?v=202610081215';
import { BUILD } from '../build.js?v=202610081215';

const GEO_PACKS = ['countries', 'flags', 'capitals'];
const BAND = ['', 'lm1', 'lm2', 'lm3'];

export async function isoRefMap() {
  const out = {};
  const packs = (await Promise.all(GEO_PACKS.map(id => getPack(id).catch(() => null)))).filter(Boolean);
  for (const p of packs) for (const it of p.items || []) {
    if (!it.iso3) continue;
    (out[it.iso3] || (out[it.iso3] = [])).push(`${p.id}/${it.id}`);
  }
  return out;
}

export async function masteryScreen(el) {
  const kids = kidsOn();
  el.append(header(kids ? 'My stickers' : 'Mastery'));
  const m = getMastery(), c = getCards();
  const refs = new Set([...Object.keys(m.items), ...Object.keys(c.cards)]);
  const counts = [0, 0, 0, 0];
  for (const r of refs) counts[level(m.items[r], c.cards[r])]++;
  if (kids) {
    const kp = kidsProgress();
    el.append(h('div.panel.center.l-kidstick', {},
      h('div', { html: `<b>⭐ ${kp.stars} stars</b> · ${kp.next} more to the next sticker` }),
      h('div.sticker-shelf', {}, ...kp.stickers.map((x, i) => h('span.sticker', { class: i < kp.have ? '' : 'locked' }, x)))));
  }
  el.append(h('div.l-sum.panel', {},
    h('div.l-stat', {}, h('b', {}, String(counts[3])), h('small', {}, 'learned')),
    h('div.l-stat', {}, h('b', {}, String(counts[2])), h('small', {}, 'learning')),
    h('div.l-stat', {}, h('b', {}, String(counts[1])), h('small', {}, 'seen')),
    h('div.l-stat', {}, h('b', {}, String(Object.keys(c.cards).length)), h('small', {}, 'flashcards'))));

  // world map
  const mapBox = h('div.l-mmap');
  const legend = h('div.l-legend.tiny', {},
    h('span', {}, h('i.lm0'), 'Not yet'), h('span', {}, h('i.lm1'), 'Seen'), h('span', {}, h('i.lm2'), 'Learning'), h('span', {}, h('i.lm3'), 'Learned'));
  const mapNote = h('p.tiny.muted', {}, 'Countries colour in as you learn their flag, capital and facts.');
  el.append(h('h2.sec-title', {}, '🌍 World map'), h('div.panel.l-mapwrap', {}, mapBox, legend, mapNote));
  drawMap(mapBox, mapNote, m, c);

  // packs
  el.append(h('h2.sec-title', {}, kids ? 'Packs' : 'Pack progress'));
  const list = h('div.l-packs');
  for (const t of themeTree({ kids })) for (const p of t.packs) {
    const pct = packPct(p.id, p.items, m, c);
    list.append(h('button.l-pk', { type: 'button', dataset: { pack: p.id }, onclick: () => go('l-pack', { id: p.id }) },
      h('span.pk-ico', {}, p.icon || '❓'), h('span.pk-txt', {}, h('b', {}, p.title), h('small', {}, `${pct}% · ${p.items} entries`)), ring(pct, { size: 40 })));
  }
  el.append(list);
}

async function drawMap(box, note, m, c) {
  let mapMod;
  try { mapMod = await import(`../geo/map.js?v=${BUILD}`); } catch (e) { box.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'The map is not available yet.' })); return; }
  const isoRefs = await isoRefMap();
  const scores = countryScores(isoRefs, m.items, c.cards);
  let map;
  try {
    map = mapMod.createMap(box, {
      region: 'world', style: 'plain', set: 'all', controls: true,
      onTap(hit) {
        if (!hit?.id) return;
        const s = scores[hit.id];
        const name = map.feature(hit.id)?.props?.n || hit.id;
        note.textContent = `${name}: ${s?.seen ? Math.round(100 * s.score) + '% learned' : 'not learned yet'}`;
      },
    });
    await map.ready;
  } catch (e) { console.warn('[learn] map failed', e); return; }
  let n = 0;
  for (const [iso, s] of Object.entries(scores)) {
    const b = mapBand(s);
    if (b) { map.setState(iso, BAND[b]); if (b === 3) n++; }
  }
  if (n) note.textContent = `${n} countr${n === 1 ? 'y' : 'ies'} learned. Tap one to see how far you are.`;
}
