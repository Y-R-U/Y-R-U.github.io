// Lookalike studies: pairs from `lookalikes`, side by side, with the key differences.
import { h } from '../ui/kit.js?v=202610081215';
import { header, go } from '../ui/app.js?v=202610081215';
import { sfx } from '../ui/fx.js?v=202610081215';
import { themeTree, getPack, itemsFor, thumb, factRows, kidsOn } from './data.js?v=202610081215';
import { notice, emptyState, creditBtn, sayBtn, put } from './ui.js?v=202610081215';
import { pick } from '../core/rng.js?v=202610081215';

export function pairsOf(pack, items = pack.items) {
  const ids = new Set(items.map(x => x.id));
  const seen = new Set(), out = [];
  for (const it of items) for (const o of it.lookalikes || []) {
    if (!ids.has(o) || o === it.id) continue;
    const k = [it.id, o].sort().join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([it.id, o]);
  }
  return out;
}

// Short difference notes: a pack `differences` field wins; otherwise the facts that differ.
export function differences(pack, a, b) {
  const notes = [];
  const fromField = (x, y) => {
    const d = x.differences;
    if (!d) return null;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.find(z => z.id === y.id || z.vs === y.id)?.text || null;
    return d[y.id] || null;
  };
  const fa = fromField(a, b), fb = fromField(b, a);
  if (fa) notes.push(fa);
  if (fb && fb !== fa) notes.push(fb);
  const ra = Object.fromEntries(factRows(pack, a).map(r => [r.key, r])), rb = Object.fromEntries(factRows(pack, b).map(r => [r.key, r]));
  const facts = [];
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    const x = ra[k], y = rb[k];
    if (!x || !y || x.meta.type === 'text') continue;
    if (x.text !== y.text) facts.push({ label: x.label, a: x.text, b: y.text });
  }
  return { notes, facts };
}

export async function lookScreen(el, params) {
  const kids = kidsOn();
  if (params.pack && params.a && params.b) return compare(el, params, kids);
  if (params.pack) return pairList(el, params.pack, kids);
  el.append(header('Lookalikes'), h('p.muted', {}, 'Things people mix up, side by side.'));
  const tree = themeTree({ kids, need: p => p.caps?.lookalikes > 0 });
  if (!tree.length) { el.append(emptyState('👯', 'No lookalikes yet', 'Packs with lookalike pairs will show up here.')); return; }
  const list = h('div.l-packs');
  for (const t of tree) for (const p of t.packs) list.append(h('button.l-pk', { type: 'button', dataset: { pack: p.id }, onclick: () => go('l-look', { pack: p.id }) },
    h('span.pk-ico', {}, p.icon || '❓'), h('span.pk-txt', {}, h('b', {}, p.title), h('small', {}, `${p.caps.lookalikes} with lookalikes`)), h('span.pk-go', {}, '›')));
  el.append(list);
}

async function pairList(el, pid, kids) {
  const pack = await getPack(pid);
  put(el, header(`${pack.icon || ''} ${pack.title}`.trim()), notice(pack.notice));
  const items = itemsFor(pack, false);
  const byId = Object.fromEntries(items.map(x => [x.id, x]));
  const pairs = pairsOf(pack, items);
  if (!pairs.length) { el.append(emptyState('👯', 'No pairs', 'This pack has no lookalikes.')); return; }
  const thumbEl = it => { const t = thumb(it); return t ? h('img', { src: t.src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('span.c-ico', {}, pack.icon); };
  el.append(h('div.l-pairs', {}, ...pairs.map(([a, b]) => h('button.l-pair', { type: 'button', dataset: { a, b }, onclick: () => go('l-look', { pack: pid, a, b }) },
    h('span.pp-img', {}, thumbEl(byId[a])), h('span.pp-img', {}, thumbEl(byId[b])),
    h('span.pp-names', {}, h('b', {}, byId[a].name), h('span.muted', {}, ' vs '), h('b', {}, byId[b].name))))));
}

async function compare(el, { pack: pid, a: aid, b: bid }, kids) {
  const pack = await getPack(pid);
  const by = id => pack.items.find(x => x.id === id);
  const a = by(aid), b = by(bid);
  if (!a || !b) { el.append(header('Lookalikes'), emptyState('❓', 'Pair not found', '')); return; }
  put(el, header(kids ? 'Spot the difference' : 'Compare'), notice(pack.notice));
  const col = it => {
    const t = thumb(it);
    const cr = [...(it.media?.img || [])];
    return h('div.l-cmp-col', {},
      h('button.l-cmp-img', { type: 'button', 'aria-label': `Open ${it.name}`, onclick: () => go('l-item', { ref: `${pid}/${it.id}`, list: [`${pid}/${aid}`, `${pid}/${bid}`] }) },
        t ? h('img', { src: t.src, alt: it.name, referrerpolicy: 'no-referrer' }) : h('span.c-ico', {}, pack.icon)),
      h('div.l-cmp-name', {}, h('b', {}, it.name), cr.length ? creditBtn(cr, `${it.name}: credits`) : null),
      it.sci && !kids ? h('div.l-sci', {}, it.sci) : null,
      it.blurb ? h('p.l-blurb.sm', {}, it.blurb) : null);
  };
  const { notes, facts } = differences(pack, a, b);
  const diffEl = h('div.panel.l-diff', {}, h('h3', {}, kids ? 'How to tell' : 'Key differences'));
  for (const n of notes) diffEl.append(h('p.l-note', {}, n));
  if (facts.length) diffEl.append(h('table.l-facts.cmp', {}, h('thead', {}, h('tr', {}, h('th'), h('th', {}, a.name), h('th', {}, b.name))),
    h('tbody', {}, ...facts.map(f => h('tr', {}, h('th', {}, f.label), h('td', {}, f.a), h('td', {}, f.b))))));
  if (!notes.length && !facts.length) diffEl.append(h('p.muted', {}, 'Their facts match, so look closely at the photos: shape, colour and markings.'));
  const say = sayBtn(() => [a.name, a.blurb, 'and', b.name, b.blurb, ...notes].filter(Boolean).join('. '));
  if (say) diffEl.firstChild.append(' ', say);

  const others = [...new Set([...(a.lookalikes || []), ...pack.items.filter(x => x.lookalikes?.includes(a.id)).map(x => x.id)])].filter(id => id !== b.id && by(id));
  put(el, h('div.l-cmp', {}, col(a), h('div.l-vs', {}, 'vs'), col(b)), diffEl,
    others.length ? h('div.l-looks', {}, h('div.l-flabel', {}, `${a.name} is also confused with`),
      h('div.chips', {}, ...others.map(id => h('button.chip', { type: 'button', onclick: () => go('l-look', { pack: pid, a: aid, b: id }, { replace: true }) }, by(id).name)))) : null,
    quiz(pack, a, b));
}

// One-tap self test: show one photo, pick which of the pair it is.
function quiz(pack, a, b) {
  const box = h('div.panel.l-quiz');
  const pool = [a, b].filter(thumb);
  if (pool.length < 2) return null;
  const round = () => {
    box.innerHTML = '';
    const it = pick(Math.random, pool);
    const img = pick(Math.random, it.media.img);
    box.append(h('h3', {}, 'Test yourself'), h('img.l-quiz-img', { src: img.src, alt: '', referrerpolicy: 'no-referrer' }));
    const row = h('div.l-quiz-btns');
    for (const o of [a, b]) row.append(h('button.btn', { type: 'button', onclick: ev => {
      const ok = o === it;
      ev.currentTarget.classList.add(ok ? 'go' : 'danger');
      sfx(ok ? 'correct' : 'wrong');
      row.querySelectorAll('button').forEach(x => { x.disabled = true; });
      box.append(h('p.center', {}, ok ? 'Yes! ' : `No, that was the ${it.name}. `, h('button.btn.small', { type: 'button', onclick: round }, 'Again')));
    } }, o.name));
    box.append(row);
  };
  round();
  return box;
}
