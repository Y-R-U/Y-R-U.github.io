// Sound lab: browse every playable sound (animal calls, anthems, instruments, piano pieces, recordings, previews).
import { h, esc } from '../ui/kit.js?v=202610071336';
import { header, go } from '../ui/app.js?v=202610071336';
import { packList, getPack, loadMusic, kidsOn, kidsItems, thumb, norm, hasAudio, factRows } from './data.js?v=202610071336';
import { soundBtn, creditBtn, emptyState, stopAudio } from './ui.js?v=202610071336';

const GROUPS = [
  { id: 'animals', title: 'Animal calls', icon: '🐦', kids: true, game: true },
  { id: 'anthems', title: 'Anthems', icon: '🏳️', packs: ['anthems'] },
  { id: 'instruments', title: 'Instruments', icon: '🎺', kids: true, packs: ['instruments'] },
  { id: 'piano', title: 'Piano', icon: '🎹', packs: ['classical-piano', 'pd-melodies'] },
  { id: 'rhymes', title: 'Nursery rhymes', icon: '🧸', kids: true, packs: ['nursery-rhymes'] },
  { id: 'classical', title: 'Orchestra', icon: '🎻', packs: ['classical-recordings'] },
  { id: 'screen', title: 'Film & TV', icon: '🎬', kids: true, packs: ['kids-film-tv', 'screen-themes'] },
  { id: 'hits', title: 'Pop hits', icon: '🎤', packs: ['hits-1960s', 'hits-1970s', 'hits-1980s', 'hits-1990s', 'hits-2000s', 'hits-2010s', 'hits-2020s', 'one-hit-wonders', 'music-artists'] },
];
const state = { group: null, q: '' };

async function entriesFor(g, kids) {
  let packs;
  if (g.game) packs = await Promise.all(packList().filter(p => p.caps?.audio > 0 && p.theme !== 'music').map(p => getPack(p.id).catch(() => null)));
  else packs = await Promise.all(g.packs.map(id => loadMusic(id).catch(() => null)));
  const out = [];
  for (const p of packs.filter(Boolean)) {
    const items = (kids && !g.kids ? kidsItems(p) : p.items || []).filter(hasAudio);
    for (const it of items) out.push({ pack: p, item: it });
  }
  return out;
}

function subline(pack, it) {
  const f = it.facts || {};
  if (f.anthem) return f.anthem;
  if (f.artist) return [f.artist, f.year].filter(Boolean).join(' · ');
  if (f.track) return [f.track, f.composer].filter(Boolean).join(' · ');
  if (f.composer) return [f.composer, f.year].filter(Boolean).join(' · ');
  if (it.sci) return it.sci;
  return factRows(pack, it).find(r => r.meta.type === 'cat')?.text || pack.title;
}

export async function soundLab(el) {
  const kids = kidsOn();
  el.append(header(kids ? 'Sounds' : 'Sound lab'));
  const groups = GROUPS.filter(g => !kids || g.kids);
  if (!groups.some(g => g.id === state.group)) state.group = groups[0].id;
  const chips = h('div.chips.l-groups', {}, ...groups.map(g => h('button.chip', { type: 'button', class: g.id === state.group ? 'on' : '', dataset: { group: g.id }, onclick: () => { state.group = g.id; state.q = ''; chips.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.group === g.id)); draw(); } }, `${g.icon} ${g.title}`)));
  const search = h('input.field.l-search', { type: 'search', placeholder: 'Search sounds…', 'aria-label': 'Search sounds' });
  const list = h('div.l-snds');
  el.append(h('div.l-toolbar', {}, chips, kids ? null : h('div.l-tools', {}, search)), list);
  let entries = [];
  async function draw() {
    stopAudio();
    const g = groups.find(x => x.id === state.group);
    list.innerHTML = '<p class="muted center">Loading…</p>';
    entries = await entriesFor(g, kids);
    if (state.group !== g.id) return;
    search.value = state.q;
    render();
  }
  function render() {
    const q = norm(search.value.trim());
    list.innerHTML = '';
    const shown = entries.filter(e => !q || norm(`${e.item.name} ${subline(e.pack, e.item)} ${(e.item.alt || []).join(' ')}`).includes(q));
    if (!shown.length) { list.append(emptyState('🔇', entries.length ? 'No matches' : 'No sounds yet', entries.length ? 'Try another word.' : 'These sounds are still being added.')); return; }
    const frag = document.createDocumentFragment();
    for (const { pack, item } of shown) frag.append(row(pack, item, kids));
    list.append(frag);
  }
  search.addEventListener('input', () => { state.q = search.value; render(); });
  draw();
  return () => stopAudio();
}

function row(pack, it, kids) {
  const a = it.media.audio[0];
  const t = thumb(it);
  const art = a.apple?.art;
  const pic = t ? t.src : art || null;
  const more = h('div.l-snd-more', { hidden: true });
  const r = h('div.l-snd', { dataset: { ref: `${pack.id}/${it.id}` } },
    pic ? h('img.l-snd-img', { src: pic, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' }) : h('span.l-snd-ico', {}, pack.icon || '🎵'),
    h('button.l-snd-txt', { type: 'button', 'aria-expanded': 'false', onclick: e => { more.hidden = !more.hidden; e.currentTarget.setAttribute('aria-expanded', String(!more.hidden)); } },
      h('b', {}, it.name), h('small', {}, subline(pack, it))),
    soundBtn(a, { label: `Play ${it.name}`, big: kids }),
    creditBtn([a, ...(t ? [t] : [])], `${it.name}: credits`));
  if (it.blurb) more.append(h('p.l-blurb.sm', {}, it.blurb));
  if (it.lyrics?.length) more.append(h('p.l-lyrics', { html: it.lyrics.map(esc).join('<br>') }));
  if (a.apple?.url) more.append(h('a.l-apple', { href: a.apple.url, target: '_blank', rel: 'noopener' }, '♪ Listen on Apple Music'));
  if (pack.theme !== 'music' && pack.items) more.append(h('button.btn.small', { type: 'button', onclick: () => go('l-item', { ref: `${pack.id}/${it.id}` }) }, 'Field guide ›'));
  return h('div.l-sndw', {}, r, more);
}
