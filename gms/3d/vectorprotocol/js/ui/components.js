import { h, pressable, fmt } from './dom.js';
import { icon, roleBadge } from './icons.js';
import { data, unitDef } from '../app/data.js';

export function btn(label, onclick, opts = {}) {
  const cls = ['vp-btn', ...(opts.cls ? opts.cls.split(' ') : [])].join('.');
  const b = h('button.' + cls, { type: 'button', disabled: !!opts.disabled, onclick: (e) => { if (!b.disabled) onclick?.(e); } },
    opts.icon ? icon(opts.icon) : null, label != null ? h('span', label) : null);
  if (opts.id) b.id = opts.id;
  if (opts.sfx) b.dataset.sfx = opts.sfx;   // js/audio click hook: 'none' = this button plays its own sound
  return pressable(b);
}

export function ibtn(iconName, label, onclick, cls = '') {
  return pressable(h('button.vp-ibtn' + (cls ? '.' + cls.split(' ').join('.') : ''), { type: 'button', onclick, 'aria-label': label || iconName },
    icon(iconName), label ? h('span', label) : null));
}

export function bar(v, cls = '') {
  const el = h('div.vp-bar' + (cls ? '.' + cls.split(' ').join('.') : ''), h('b'), h('i'));
  setBar(el, v);
  return el;
}
export function setBar(el, v) {
  v = Math.max(0, Math.min(1, v || 0));
  const prev = parseFloat(el.style.getPropertyValue('--v') || '1');
  el.style.setProperty('--v', v.toFixed(4));
  // the white "ghost" segment trails behind damage, snaps on heals
  if (v < prev) el.style.setProperty('--g', prev.toFixed(4));
  requestAnimationFrame(() => el.style.setProperty('--g', v.toFixed(4)));
}

export function panel(cls = '', ...kids) {
  return h('div.vp-panel' + (cls ? '.' + cls.split(' ').join('.') : ''), ...kids);
}

export function currency(kind, amount) {
  const colors = { credits: 'var(--gold)', cores: 'var(--purple)', scrap: 'var(--text-2)', token: 'var(--cyan)', xp: 'var(--green)' };
  const ic = icon(kind);
  ic.style.color = colors[kind] || 'var(--cyan)';
  return h('span.vp-chip', { dataset: { cur: kind } }, ic, h('span.n', fmt(amount)));
}

let toastHost = null;
// toast(msg, kind '' | 'err' | 'gold', life s, {sub, icon}) — with `sub` it becomes a two-line notice (title + plain-case reason)
export function toast(msg, kind = '', life = 2.4, opts = {}) {
  if (!toastHost || !toastHost.isConnected) {
    toastHost = h('div#toasts');
    document.getElementById('overlay-root').appendChild(toastHost);
  }
  const ic = opts.icon || (opts.sub && kind === 'err' ? 'lock' : null);
  const t = opts.sub || ic
    ? h('div.vp-panel.vp-toast.notice' + (kind ? '.' + kind : ''), { '--life': life + 's' }, ic ? icon(ic) : null, h('div', h('b', msg), opts.sub ? h('small', opts.sub) : null))
    : h('div.vp-panel.vp-toast' + (kind ? '.' + kind : ''), { '--life': life + 's' }, msg);
  for (const old of toastHost.querySelectorAll('.vp-toast')) if (old.textContent === t.textContent) old.remove();   // no stacked duplicates on repeat taps
  toastHost.appendChild(t);
  setTimeout(() => t.remove(), (life + 0.5) * 1000);
  return t;
}

// Styled modal. Resolves with the value of the chosen action (or null on backdrop dismiss).
const openModals = new Set();
// screens.show() closes every open modal on a route change (QA Q9: a picker left over from the arena blocked ENGAGE)
export function closeModals() { for (const c of [...openModals]) c(null); }
export function modal({ title, body, actions = [{ label: 'OK', value: true, cls: 'primary' }], cls = '', dismissable = true }) {
  return new Promise((resolve) => {
    const close = (v) => { openModals.delete(close); wrap.remove(); resolve(v); };
    openModals.add(close);
    const content = typeof body === 'string' ? h('div.body', body) : h('div.body', body);
    const box = h('div.vp-panel.vp-modal' + (cls ? '.' + cls : ''), { onclick: (e) => e.stopPropagation() },
      title ? h('h2.vp-title', title) : null, h('div.divider'), content,
      h('div.acts', actions.map((a) => btn(a.label, () => close(a.value), { cls: a.cls || '' }))));
    const wrap = h('div.vp-modal-wrap', { onclick: () => dismissable && close(null) }, box);
    document.getElementById('overlay-root').appendChild(wrap);
  });
}
export const confirmBox = (title, body, yes = 'Confirm', no = 'Cancel') =>
  modal({ title, body, actions: [{ label: no, value: false }, { label: yes, value: true, cls: 'primary' }] });

export function stars(n, max = 3) {
  const s = h('span.stars');
  for (let i = 0; i < max; i++) s.appendChild(icon(i < n ? 'star' : 'starO'));
  return s;
}

// Unit card: frame around a 3D-rendered portrait (filled asynchronously by portraits.js).
export function unitCard(u, opts = {}) {
  const art = h('div.art', h('div.ph', icon(u.role || 'hex')));
  const card = h('div.vp-card', { dataset: { rarity: u.rarity || 'common', faction: u.rarity === 'legendary' ? 'legendary' : (u.faction || 'corporate'), uid: u.uid || u.id }, onclick: opts.onclick },
    art, h('div.rl', roleBadge(u.role)),
    u.stars != null ? h('div.stars', '★'.repeat(u.stars)) : null,
    u.level != null ? h('div.lv', 'Lv.' + u.level) : null,
    nameEl(u.name || u.model || '???'), h('div.plate'));
  if (opts.portrait !== false) opts.portraits?.fill(art, u);
  return pressable(card);
}

// long names ("SOVEREIGN PALADIN") shrink to the card width and wrap to two lines instead of clipping
function nameEl(name) {
  const n = String(name);
  return h('div.nm' + (n.length > 13 && n.includes(' ') ? '.xlong' : n.length > 9 ? '.long' : ''), n);
}

export function header(title, onBack, right) {
  return h('div.scr-head',
    onBack ? ibtn('back', '', onBack, 'sm') : h('div', { style: { width: '44px' } }),
    h('h2.vp-title.grow', title), right || h('div', { style: { width: '44px' } }));
}

// reward object ({credits, scrap, chips, xp, arena_tokens, event_marks, buffs:{id:n}, cards:[def], shards:{def:n}}) -> chips
const RW_ICON = { credits: 'credits', scrap: 'scrap', chips: 'cores', xp: 'xp', arena_tokens: 'token', event_marks: 'flag' };
const rwName = (id, kind) => (kind === 'buff' ? data().buffs?.[id]?.name : unitDef(id)?.name) || id;
export function rewardChips(r, { names = rwName, small = false } = {}) {
  if (!r) return [];
  const out = [];
  const chip = (ic, txt, cls = '') => h('span.vp-chip' + (small ? '.sm' : '') + cls, icon(ic), txt);
  for (const k of ['credits', 'scrap', 'chips', 'xp', 'arena_tokens', 'event_marks']) if (r[k]) out.push(chip(RW_ICON[k], fmt(r[k]) + (k === 'xp' ? ' XP' : '')));
  for (const [k, n] of Object.entries(r.buffs || {})) out.push(chip('up', names(k, 'buff') + (n > 1 ? ' ×' + n : ''), '.t-gold'));
  for (const id of r.cards || []) out.push(chip('user', names(id, 'unit'), '.t-gold'));
  for (const [k, n] of Object.entries(r.shards || {})) out.push(chip('hex', names(k, 'unit') + ' ×' + n));
  return out;
}
