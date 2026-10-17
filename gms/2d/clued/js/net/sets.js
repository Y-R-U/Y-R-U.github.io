// Saved sets: named online round lists (+ answer time, gap, streak), per mode, synced with the br8t account.
import { h } from '../ui/kit.js?v=202610170843';
import { popup, confirmPop, toast } from '../ui/popup.js?v=202610170843';
import { read, write, KEYS } from '../core/store.js?v=202610170843';
import { getFormat } from '../formats/registry.js?v=202610170843';
import { roundThemes } from '../structures/rounds.js?v=202610170843';
import { getSuggested } from './suggested.js?v=202610170843';
import { isOn, localLabel } from '../core/local.js?v=202610170843';

export const MAX_SETS = 20;
const total = rounds => rounds.reduce((n, r) => n + (r.count || 0), 0);
const allSets = () => { const r = read(KEYS.sets); return Array.isArray(r?.list) ? r.list.filter(x => x && x.name && Array.isArray(x.rounds)) : []; };
export const getSets = kids => allSets().filter(x => !!x.kids === kids).sort((a, b) => (b.at || 0) - (a.at || 0));
const writeSets = list => write(KEYS.sets, { v: 1, list });
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const copyRounds = rounds => JSON.parse(JSON.stringify(rounds));

// Same name in the same mode overwrites. Returns 'saved' | 'updated' | 'full'.
export function saveSet(name, { kids, rounds, timing, local }) {
  const all = allSets();
  const list = all.filter(x => !(!!x.kids === kids && sameName(x.name, name)));
  const had = list.length < all.length;
  if (!had && getSets(kids).length >= MAX_SETS) return 'full';
  list.push({ name, kids, rounds: copyRounds(rounds), timing: { ...(timing || {}) }, ...(local !== undefined ? { local } : {}), at: Date.now() });
  writeSets(list);
  return had ? 'updated' : 'saved';
}

export async function askSetName(rounds, name = '') {
  const input = h('input.field', { type: 'text', maxlength: '40', placeholder: 'e.g. Friday family quiz', value: name, 'aria-label': 'Set name' });
  const body = h('div.stack', {}, h('p.muted', { style: { margin: 0 } }, `${rounds.length} round${rounds.length === 1 ? '' : 's'} · ${total(rounds)} questions, with the answer time and gap.`), input);
  setTimeout(() => { input.focus(); input.select(); }, 60);
  const ok = await popup({ title: 'Save this set', body, actions: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }] });
  return ok ? input.value.trim().slice(0, 40) || null : null;
}

// Name prompt + save + toast. Resolves the saved name or null.
export async function saveSetPrompt({ kids, rounds, timing, name = '', local }) {
  const nm = await askSetName(rounds, name);
  if (!nm) return null;
  const res = saveSet(nm, { kids, rounds, timing, local });
  if (res === 'full') { toast(`You can keep ${MAX_SETS} sets: delete one first`); return null; }
  toast(res === 'updated' ? `Updated “${nm}”` : `Saved “${nm}”`);
  return nm;
}

const roundsLine = set => `${set.rounds.length} round${set.rounds.length === 1 ? '' : 's'} · ${total(set.rounds)} questions${set.timing?.answerSec ? ` · ${set.timing.answerSec} s answers` : ''}${isOn(set.local) ? ` · ${localLabel(set.local)}` : ''}`;
const themesLine = (set, kids) => set.rounds.map(r => `${getFormat(r.format)?.icon || '❓'} ${r.title || roundThemes(r, kids)}`).join(' · ');

// Popup with two tabs: Suggested (read-only, js/net/suggested.js) and My sets (tap to load, ✕ to delete).
// Opens on My sets when there are any. Resolves the set to load ({ suggested: true } for a suggestion), or null.
export function pickSet(kids) {
  const body = h('div.sets-pop');
  const close = v => body.closest('.pop')._close(v);
  let tab = getSets(kids).length ? 'mine' : 'suggested';
  const tabs = h('div.set-tabs', { role: 'tablist' });
  const list = h('div.sets-list', { role: 'tabpanel' });
  body.append(tabs, list);
  const row = (set, del) => h('div.set-row', { dataset: { set: set.name }, class: del ? null : 'no-del' },
    h('button.set-load', { type: 'button', onclick: () => close(del ? set : { ...set, suggested: true }) },
      h('b', {}, set.name),
      set.blurb ? h('small.set-blurb', {}, set.blurb) : null,
      h('small', {}, roundsLine(set)),
      h('small', {}, themesLine(set, kids))),
    del ? h('button.icon-btn', { type: 'button', 'aria-label': `Delete ${set.name}`, dataset: { act: 'set-delete' }, onclick: async () => {
      if (!(await confirmPop('Delete this set?', `“${set.name}” will be gone for good.`, 'Delete', 'Keep', true))) return;
      writeSets(allSets().filter(x => !(!!x.kids === kids && sameName(x.name, set.name))));
      fill();
    } }, '✕') : null);
  function fill() {
    const mine = getSets(kids);
    tabs.replaceChildren(...[['suggested', '⭐ Suggested'], ['mine', `My sets (${mine.length})`]].map(([id, label]) =>
      h('button.set-tab', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), dataset: { tab: id }, onclick: () => { tab = id; fill(); } }, label)));
    if (tab === 'suggested') list.replaceChildren(...getSuggested(kids).map(s => row(s, false)));
    else list.replaceChildren(...(mine.length ? mine.map(s => row(s, true))
      : [h('p.muted', {}, 'No saved sets yet. Load a suggestion, change the rounds, then 💾 Save set.')]));
  }
  fill();
  return popup({ title: 'Sets', body, cls: 'rp-pop', actions: [{ label: 'Cancel', value: null }] });
}
