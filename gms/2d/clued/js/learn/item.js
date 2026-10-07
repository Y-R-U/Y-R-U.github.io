// Field guide detail card: photo carousel, blurb, facts, lookalikes, sound, read-aloud, credits.
import { h } from '../ui/kit.js?v=202610071324';
import { header, go } from '../ui/app.js?v=202610071324';
import { toast } from '../ui/popup.js?v=202610071324';
import { sfx } from '../ui/fx.js?v=202610071324';
import { itemByRef, factRows, kidsOn, refOf } from './data.js?v=202610071324';
import { getCards, addCards, removeCard, itemLevel } from './model.js?v=202610071324';
import { notice, soundBtn, sayBtn, say, creditBtn, emptyState, stopAudio, put } from './ui.js?v=202610071324';

const LV = ['Not seen yet', 'Seen', 'Learning', 'Learned ★'];

export function carousel(imgs, alt = '') {
  const track = h('div.l-car-track');
  const dots = h('div.l-car-dots');
  imgs.forEach((m, i) => {
    const slide = h('div.l-slide');
    slide.style.setProperty('--fill', `url("${String(m.src).replace(/"/g, '%22')}")`);
    const im = h('img', { src: m.src, alt: i ? '' : alt, loading: i ? 'lazy' : 'eager', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' });
    im.addEventListener('error', () => slide.classList.add('broken'), { once: true });
    slide.append(im);
    track.append(slide);
    if (imgs.length > 1) dots.append(h('button.l-dot', { type: 'button', 'aria-label': `Photo ${i + 1}`, class: i ? '' : 'on', onclick: () => track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' }) }));
  });
  if (imgs.length > 1) track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
  }, { passive: true });
  return h('div.l-car', {}, track, imgs.length > 1 ? dots : null);
}

export async function itemCard(el, params) {
  const kids = kidsOn();
  const found = await itemByRef(params.ref);
  if (!found) { el.append(header('Field guide'), emptyState('❓', 'Not found', 'This entry is missing from its pack.')); return; }
  const { pack, item, ref } = found;
  const list = params.list || [ref];
  const at = list.indexOf(ref);
  const nav = d => { const r = list[at + d]; if (r) { stopAudio(); go('l-item', { ref: r, list }, { replace: true }); } };
  el.append(header(kids ? item.name : `${pack.icon || ''} ${pack.title}`.trim()));

  const imgs = item.media?.img || [];
  const audio = item.media?.audio?.[0];
  const media = h('div.l-item-media', {}, imgs.length ? carousel(imgs, item.name) : h('div.l-noimg', {}, pack.icon || '❓'));
  const rows = factRows(pack, item).filter(r => !kids || r.meta.type !== 'num' || r.meta.unit);
  const speech = () => `${item.name}. ${item.blurb || ''}`;
  const inDeck = () => !!getCards().cards[ref];
  const deckBtn = h('button.btn.small', { type: 'button', dataset: { act: 'deck' } });
  const setDeck = () => { deckBtn.textContent = inDeck() ? '✓ In flashcards' : '+ Flashcard'; deckBtn.classList.toggle('go', inDeck()); };
  deckBtn.addEventListener('click', () => {
    if (inDeck()) { removeCard(ref); toast('Removed from flashcards'); } else { addCards([ref]); toast('Added to flashcards'); sfx('button'); }
    setDeck();
  });
  setDeck();
  const credits = [...imgs, ...(item.media?.audio || [])];
  const lv = itemLevel(ref);

  const info = h('div.l-item-info', {},
    h('div.l-item-title', {},
      h('div', {}, h('h2', {}, item.name), item.sci ? h('div.l-sci', {}, item.sci) : null, item.alt?.length && !kids ? h('div.tiny.muted', {}, 'Also: ' + item.alt.join(', ')) : null),
      h('div.l-item-btns', {}, audio ? soundBtn(audio, { label: `Play ${item.name} sound` }) : null, sayBtn(speech), credits.length ? creditBtn(credits, `${item.name}: credits`) : null)),
    notice(pack.notice),
    item.blurb ? h('p.l-blurb', {}, item.blurb) : null,
    rows.length ? h('table.l-facts', {}, h('tbody', {}, ...(kids ? rows.slice(0, 4) : rows).map(r => h('tr', {}, h('th', {}, r.label), h('td', {}, r.text))))) : null,
    lookRow(pack, item),
    h('div.l-item-acts', {},
      kids ? null : h('span.l-lvchip', { class: 'lv' + lv }, LV[lv]),
      deckBtn,
      item.iso3 ? h('button.btn.small', { type: 'button', onclick: () => go('l-explore', { iso: item.iso3 }) }, '🗺️ On the map') : null));

  const navRow = list.length > 1 ? h('div.l-item-nav', {},
    h('button.btn.small', { type: 'button', disabled: at <= 0, 'aria-label': 'Previous', onclick: () => nav(-1) }, '‹ Prev'),
    h('span.muted.tiny', {}, `${at + 1} / ${list.length}`),
    h('button.btn.small' + (kids ? '.go' : ''), { type: 'button', disabled: at >= list.length - 1, 'aria-label': 'Next', onclick: () => nav(1) }, 'Next ›')) : null;
  put(el, h('div.l-item', {}, media, info), navRow);

  // swipe left/right on the info side to move through the list
  let sx = 0, sy = 0;
  info.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  info.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) nav(dx < 0 ? 1 : -1);
  }, { passive: true });
  const onKey = e => { if (e.key === 'ArrowRight') nav(1); else if (e.key === 'ArrowLeft') nav(-1); };
  document.addEventListener('keydown', onKey);
  if (kids) setTimeout(() => say(speech()), 300);
  return () => { document.removeEventListener('keydown', onKey); stopAudio(); };
}

function lookRow(pack, item) {
  const ids = (item.lookalikes || []).filter(id => pack.items.some(x => x.id === id));
  if (!ids.length) return null;
  const byId = Object.fromEntries(pack.items.map(x => [x.id, x]));
  return h('div.l-looks', {},
    h('div.l-flabel', {}, 'Often confused with'),
    h('div.chips', {}, ...ids.map(id => h('button.chip', { type: 'button', onclick: () => go('l-item', { ref: `${pack.id}/${id}`, list: [refOf(pack, item), `${pack.id}/${id}`] }) }, byId[id].name)),
      h('button.chip.l-cmpbtn', { type: 'button', onclick: () => go('l-look', { pack: pack.id, a: item.id, b: ids[0] }) }, '👯 Compare')));
}
