// Round lists shared by the pub quiz builder and the online host setup: round cards (edit/remove/reorder),
// the "add a round" picker (♥ favourites first, then formats) and the round editor screen ('pqround').
import { defineScreen, go, back, header } from '../ui/app.js?v=202610071629';
import { h } from '../ui/kit.js?v=202610071629';
import { popup, toast } from '../ui/popup.js?v=202610071629';
import { listFormats, getFormat, defaultOpts } from '../formats/registry.js?v=202610071629';
import { getIndex } from '../core/packs.js?v=202610071629';
import { supportedPackIds } from '../core/spec.js?v=202610071629';
import { getSettings, getFavs } from '../core/store.js?v=202610071629';
import { cleanFav, favKey, favLabel } from '../ui/favmodel.js?v=202610071629';
import { optionsPanel } from '../ui/setup.js?v=202610071629';
import { sfx } from '../ui/fx.js?v=202610071629';

const CSS = `
.round-card.rc { grid-template-columns: 44px minmax(0, 1fr) auto; cursor: pointer; }
.round-card.rc .r-t { overflow-wrap: anywhere; }
.rc-acts { display: grid; grid-template-columns: repeat(2, 40px); gap: 6px; }
.rc-acts .icon-btn { width: 40px; height: 40px; min-height: 40px; font-size: 17px; }
.rc-acts .icon-btn[disabled] { opacity: .3; }
.rp-sec { font-family: var(--font-display); font-size: 17px; margin: 4px 2px 8px; }
.rp-favs { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.rp-fav { display: grid; grid-template-columns: 34px minmax(0, 1fr) 30px; gap: 8px; align-items: center; text-align: left; padding: 8px 10px; min-height: 52px; background: #ffe1e1; border: var(--line) solid var(--ink); border-radius: 14px; box-shadow: var(--shadow-sm); font: inherit; color: var(--ink); }
.rp-fav:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--ink); }
.rp-fav .i { font-size: 24px; text-align: center; }
.rp-fav b { display: block; font-size: 15px; }
.rp-fav small { display: block; font-size: 12.5px; color: var(--ink-2); overflow-wrap: anywhere; }
.rp-fav .n { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--ink); background: var(--coral); color: #fff; display: grid; place-items: center; font-family: var(--font-display); font-size: 15px; }
.pop-card.rp-pop { max-height: 86vh; overflow-y: auto; }
.rounds-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.rounds-head .sec-title { margin-bottom: 10px; }
.rounds-sum { color: var(--ink-2); font-weight: 800; margin: 0 2px 10px; font-size: 14px; }
.rp-sec:first-child { color: var(--coral); }
.add-round { border-style: dashed; }
body.kids-on .round-card.rc { padding: 14px; }
body.kids-on .rc-acts { grid-template-columns: repeat(2, 52px); gap: 8px; }
body.kids-on .rc-acts .icon-btn { width: 52px; height: 52px; font-size: 22px; }
body.kids-on .rp-fav { min-height: 64px; }
body.kids-on .rp-fav b { font-size: 17px; }
body.kids-on .add-round { min-height: 64px; font-size: 20px; }
`;
function ensureCss() {
  if (document.getElementById('rounds-css')) return;
  document.head.append(h('style', { id: 'rounds-css' }, CSS));
}

export const packsLabel = packs => {
  if (packs === 'all' || !packs?.length) return 'All themes';
  const idx = getIndex();
  const names = packs.map(id => idx?.packs?.[id]?.title).filter(Boolean);
  if (!names.length) return 'All themes';
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
};
export const roundTitle = r => r.title || `${getFormat(r.format)?.title || r.format}`;
export const usable = kids => listFormats().filter(f => !f.hidden && supportedPackIds(f, getIndex(), { kids }).length);
// Themes + whatever differs from the defaults, in the favourites' short style ("80s+90s · 10s clip · Hard").
export function roundThemes(r, kids = !!getSettings().kids) {
  const fmt = getFormat(r.format);
  if (!fmt) return packsLabel(r.packs);
  const t = favLabel({ packs: r.packs, opts: r.opts || {}, difficulty: r.difficulty }, fmt, getIndex(), { kids });
  return fmt.packless && /^Standard picks$/.test(t) ? 'World map' : t || packsLabel(r.packs);
}
export const roundSummary = r => `${r.count} question${r.count === 1 ? '' : 's'} · ${roundThemes(r)}`;

// Every saved favourite the player can use right now, newest first: [{ fmt, slot, fav (cleaned), label, at }].
export function allFavs(kids) {
  const idx = getIndex();
  const out = [];
  for (const fmt of usable(kids)) {
    getFavs(favKey(fmt, kids)).forEach((raw, slot) => {
      const fav = raw && cleanFav(raw, fmt, idx, { kids });
      if (fav) out.push({ fmt, slot, fav, at: raw.at || 0, label: favLabel(raw, fmt, idx, { kids, timerDefault: kids ? 0 : getSettings().timerSec }) });
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

// A round straight from a favourite (no editor): its packs, options, difficulty and count (default `count`).
export function roundFromFav({ fmt, fav }, { count = 10, kids = false } = {}) {
  const base = defaultOpts(fmt);
  if (kids) for (const o of fmt.options || []) if (o.kidsDefault != null) base[o.key] = o.kidsDefault;
  return {
    format: fmt.id, packs: fmt.packless ? 'all' : fav.packs, count,
    opts: { ...base, ...fav.opts }, difficulty: kids ? 1 : (fav.difficulty ?? 0), fav: true,
  };
}

// Popup: ♥ favourites (one tap adds the round) above the format grid. Resolves { format } | { fav } | null.
export function pickRound(kids, { title = 'Add a round', favs = true } = {}) {
  ensureCss();
  const body = h('div');
  const close = v => body.closest('.pop')._close(v);
  const list = favs ? allFavs(kids) : [];
  if (list.length) {
    body.append(h('div.rp-sec', {}, '♥ From your favourites'),
      h('div.rp-favs', {}, ...list.map(f => h('button.rp-fav', { type: 'button', dataset: { favFormat: f.fmt.id, favSlot: String(f.slot + 1) }, onclick: () => close({ fav: f }) },
        h('span.i', {}, f.fmt.icon), h('span', {}, h('b', {}, f.fmt.title), h('small', {}, f.label)), h('span.n', {}, String(f.slot + 1))))),
      h('div.rp-sec', {}, 'Or pick a format'));
  }
  const grid = h('div.tiles');
  for (const f of usable(kids)) grid.append(h('button.tile', { type: 'button', dataset: { format: f.id }, onclick: () => close({ format: f.id }) }, h('span.t-ico', {}, f.icon), h('span.t-title', {}, f.title)));
  body.append(grid);
  return popup({ title, body, cls: 'rp-pop', actions: [{ label: 'Cancel', value: null }] });
}

// Format-only picker (kept for callers that just need a format id).
export const pickFormat = async kids => (await pickRound(kids, { title: 'Pick a format for this round', favs: false }))?.format || null;

// One round card. opts: { i, n, onEdit, onRemove, onMove(dir), extra (node under the summary) }
export function roundCard(r, { i, n, onEdit, onRemove, onMove, extra = null }) {
  ensureCss();
  const f = getFormat(r.format);
  const stop = fn => e => { e.stopPropagation(); fn(); };
  const acts = h('div.rc-acts', {},
    h('button.icon-btn', { type: 'button', 'aria-label': 'Move up', dataset: { act: 'round-up' }, disabled: i === 0 || !onMove, onclick: stop(() => onMove(-1)) }, '▲'),
    h('button.icon-btn', { type: 'button', 'aria-label': 'Edit round', dataset: { act: 'round-edit' }, onclick: stop(onEdit) }, '✎'),
    h('button.icon-btn', { type: 'button', 'aria-label': 'Move down', dataset: { act: 'round-down' }, disabled: i >= n - 1 || !onMove, onclick: stop(() => onMove(1)) }, '▼'),
    h('button.icon-btn', { type: 'button', 'aria-label': 'Remove round', dataset: { act: 'round-remove' }, disabled: !onRemove, onclick: stop(() => onRemove()) }, '✕'));
  const card = h('div.round-card.rc', { dataset: { round: String(i) }, role: 'button', tabindex: '0', onclick: onEdit },
    h('span.r-ico', {}, f?.icon || '❓'),
    h('div', {}, h('div.r-t', {}, `${i + 1}. ${roundTitle(r)}`, r.fav ? h('span.r-fav', { title: 'From your favourites' }, ' ♥') : null),
      h('div.r-s', {}, `${roundSummary(r)}${f ? '' : ' · format missing'}`), extra),
    acts);
  card.addEventListener('keydown', e => { if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onEdit(); } });
  return card;
}

export function moveItem(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  return true;
}

// Round lists by id: { get() -> rounds (mutable), save(), count (default questions), max, kids? }
// Function declarations so pubquiz.js can register during an import cycle (setup → structures → pubquiz → here).
export function registerRoundList(id, def) { lists()[id] = def; }
function lists() { return (lists.m ||= {}); }

// Adds a round from the picker's choice: a fav goes straight in, a format opens the editor.
export async function addRound(listId, kids) {
  const L = lists()[listId];
  const pick = await pickRound(kids);
  if (!pick) return false;
  if (pick.fav) {
    const rounds = L.get();
    rounds.push(roundFromFav(pick.fav, { count: L.count, kids }));
    L.save();
    sfx('button');
    toast(`Round ${rounds.length}: ${pick.fav.fmt.title} · ${pick.fav.label}`);
    return true;
  }
  go('pqround', { idx: -1, format: pick.format, list: listId });
  return false;
}

defineScreen('pqround', (el, { idx = -1, format, list = 'pub', title: draftTitle }) => {
  ensureCss();
  const L = lists()[list] || lists().pub;
  const rounds = L.get();
  const fmt = getFormat(format);
  const kids = !!getSettings().kids;
  const cur = idx >= 0 ? rounds[idx] : null;
  el.append(header(idx >= 0 ? `Round ${idx + 1}` : 'New round'));
  if (!fmt) { el.append(h('p.panel', {}, 'Format missing')); return; }
  const titleIn = h('input.field', { type: 'text', value: draftTitle ?? cur?.title ?? '', placeholder: `Round name (optional): ${fmt.title}`, maxlength: 40, style: { display: 'block' } });
  const change = h('button.btn.small', { type: 'button', dataset: { act: 'change-format' }, onclick: async () => {
    const id = await pickFormat(kids);
    if (id && id !== fmt.id) go('pqround', { idx, format: id, list, title: titleIn.value }, { replace: true });
  } }, 'Change');
  el.append(h('div.setup-head', {}, h('span.fh-ico', {}, fmt.icon), h('div', { style: { flex: '1', minWidth: '0' } }, h('h2', {}, fmt.title), h('p', {}, fmt.blurb || '')), change), titleIn);
  const body = h('div', { style: { marginTop: '12px' } });
  el.append(body);
  const same = cur && cur.format === fmt.id;
  const panel = optionsPanel(body, fmt, { kids, showTimer: false,
    last: same ? { packs: cur.packs, count: cur.count, opts: cur.opts, difficulty: cur.difficulty } : { count: cur?.count || L.count || 10 } });
  el.append(h('div.start-bar', {}, h('button.btn.go.big.wide', {
    type: 'button', dataset: { act: 'save-round' }, onclick: () => {
      const v = panel.value();
      const r = { format: fmt.id, packs: v.packs, count: v.count, opts: v.opts, difficulty: v.difficulty, title: titleIn.value.trim() || undefined };
      if (idx >= 0 && rounds[idx]) rounds[idx] = r; else rounds.push(r);
      L.save();
      back();
    },
  }, idx >= 0 ? 'Save round' : 'Add round')));
});
