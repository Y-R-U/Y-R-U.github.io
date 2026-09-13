// js/ui/sanctum.js — the meta screens: the Sanctum spend tree, and the three
// pre-run pickers (stage, character, relic loadout) that share its shape.
//
// D9 runs through all four. The Sanctum unfolds: a node whose `requires` has
// not been bought is not dimmed, it is ABSENT, and buying its parent grows the
// door. Locked stages and characters are the opposite case — they are shown,
// because a locked thing whose condition you cannot read is a dead end, not a
// goal.

import {
  DATA, values, el, add, clear, card, btn, tap, page, soulsChip, bar, pips,
  rgbOf, fmtTime, fmtInt, art, portraitFile, empty, ensureStyles,
} from './components.js';
import { writeSave } from '../core/save.js';

const DEPTH_LABEL = ['The Sanctum', 'The Undercroft', 'The Deep', 'Below'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

// ---------------------------------------------------------------------------
// Sanctum
// ---------------------------------------------------------------------------

/** props: { onBack() } */
export function sanctum(root, ctx, props = {}) {
  ensureStyles();
  const save = ctx.save;
  const go = (n, p) => ctx.ns.screens.show(n, p);
  const back = props.onBack || (() => go('title'));

  const souls = soulsChip(save.souls);
  const { scr, body, foot } = page(ctx, 'Sanctum', back, souls);
  add(foot, btn('Done', ctx, back, { cls: 'btn--primary' }));
  root.appendChild(scr);

  function level(id) { return save.sanctum[id] | 0; }

  function costOf(node, lv) {
    if (typeof node.cost === 'function') { try { return node.cost(lv) | 0; } catch (e) { return 0; } }
    const c = +node.cost;
    return Number.isFinite(c) ? Math.round(c * (lv + 1)) : 0;
  }

  function reqs(node) {
    const r = node.requires;
    if (!r) return [];
    return Array.isArray(r) ? r : [r];
  }

  function open(node) { return reqs(node).every((id) => level(id) > 0); }

  function depth(node, guard = 0) {
    const r = reqs(node);
    if (!r.length || guard > 8) return 0;
    let d = 0;
    for (const id of r) {
      const parent = DATA.SANCTUM[id];
      if (parent) d = Math.max(d, depth(parent, guard + 1) + 1);
    }
    return d;
  }

  function buy(node) {
    const lv = level(node.id);
    const max = node.max | 0 || 1;
    if (lv >= max) return;
    const cost = costOf(node, lv);
    if (save.souls < cost) {
      if (ctx.audio) { try { ctx.audio.sfx('uiDeny'); } catch (e) {} }
      if (ctx.ns.callout) ctx.ns.callout('Not enough souls — ' + fmtInt(cost - save.souls) + ' more.');
      return;
    }
    save.souls -= cost;
    save.sanctum[node.id] = lv + 1;
    writeSave(save);
    if (ctx.audio) { try { ctx.audio.sfx('chest'); } catch (e) {} }
    render();
  }

  function render() {
    clear(body);
    clear(souls);
    add(souls, el('span', 'ui-glyph ui-glyph--soul', '◇'), el('span', 'num', fmtInt(save.souls)));

    const all = values(DATA.SANCTUM);
    if (!all.length) {
      add(body, empty('The doors are shut', 'There is nothing here to buy yet.'));
      return;
    }

    const shown = all.filter(open);
    const hidden = all.length - shown.length;
    const bands = new Map();
    for (const n of shown) {
      const d = Math.min(depth(n), DEPTH_LABEL.length - 1);
      if (!bands.has(d)) bands.set(d, []);
      bands.get(d).push(n);
    }

    for (const d of [...bands.keys()].sort((a, b) => a - b)) {
      add(body, band(DEPTH_LABEL[d]));
      const stack = el('div', 'stack');
      for (const n of bands.get(d)) add(stack, nodeCard(n));
      add(body, stack);
    }

    if (hidden > 0) {
      add(body, el('div', 'ui-door', hidden === 1 ? 'One door is still shut.' : hidden + ' doors are still shut.'));
    }
  }

  function nodeCard(node) {
    const lv = level(node.id);
    const max = node.max | 0 || 1;
    const maxed = lv >= max;
    const cost = maxed ? 0 : costOf(node, lv);
    const afford = save.souls >= cost;

    const right = el('span', 'ui-node__r');
    add(right, pips(lv, max, 'var(--gold)'));
    if (maxed) add(right, el('span', 'tiny', 'Max'));
    else {
      const c = el('span', 'ui-cost' + (afford ? '' : ' ui-cost--no'));
      add(c, el('span', 'ui-glyph', '◇'), el('span', 'num', fmtInt(cost)));
      add(right, c);
    }

    const c = card(ctx, {
      icon: node.tag || (node.name || '?').slice(0, 3).toUpperCase(),
      title: node.name || node.id,
      sub: node.desc || '',
      note: perLevelText(node, lv, max),
      accent: 'var(--gold)',
      on: lv > 0,
      onTap: maxed ? null : () => buy(node),
    });
    c.appendChild(right);
    if (maxed) c.classList.add('card--on');
    return c;
  }

  render();
  return { destroy() { scr.remove(); } };
}

function perLevelText(node, lv, max) {
  if (!node.perLevel && node.perLevel !== 0) return null;
  const v = node.perLevel;
  const now = typeof v === 'number' ? v * lv : null;
  const step = typeof v === 'number' ? v : v;
  if (now === null) return String(v);
  const pct = Math.abs(step) < 1;
  const fmt = (n) => (pct ? Math.round(n * 1000) / 10 + '%' : Math.round(n * 100) / 100);
  return lv > 0 ? 'Now ' + fmt(now) + (lv < max ? ' → ' + fmt(now + step) : '') : '+' + fmt(step) + ' per level';
}

function band(label) {
  const b = el('div', 'ui-branch');
  add(b, el('span', 'ui-branch__l', label), el('span', 'ui-branch__r'));
  return b;
}

// ---------------------------------------------------------------------------
// Stage select
// ---------------------------------------------------------------------------

/** props: { onPick(stageId, curse), onBack() } */
export function stageSelect(root, ctx, props = {}) {
  ensureStyles();
  const save = ctx.save;
  const go = (n, p) => ctx.ns.screens.show(n, p);
  const back = props.onBack || (() => go('title'));
  const list = values(DATA.STAGES);
  const curseOn = save.unlocks.indexOf('curse') >= 0;

  const { scr, body, foot } = page(ctx, 'Choose a lane', back);
  add(foot, btn('Back', ctx, back, { cls: 'btn--ghost' }));
  root.appendChild(scr);

  let curse = 0;

  function unlocked(i) {
    if (i === 0) return true;
    if (save.unlocks.indexOf('allstages') >= 0) return true;
    return !!save.stagesCleared[list[i - 1].id];
  }

  function render() {
    clear(body);
    if (!list.length) { add(body, empty('No lanes yet', 'The stage table has not been written.')); return; }

    if (curseOn) add(body, curseRow());

    let act = null, stack = null;
    list.forEach((s, i) => {
      if (s.act !== act) {
        act = s.act;
        add(body, band('Act ' + (ROMAN[act] || act)));
        stack = el('div', 'stack');
        add(body, stack);
      }
      const ok = unlocked(i);
      const cleared = save.stagesCleared[s.id];
      const accent = rgbOf(s.palette && s.palette.accent, 'var(--choir)');
      const c = card(ctx, {
        cls: 'ui-tile',
        icon: String(i + 1),
        title: s.name || s.id,
        sub: ok ? (s.subtitle || '') : '',
        note: ok ? fmtTime(s.duration || 0) + ' · ' + (s.maxAlive || 0) + ' abroad' : null,
        flag: cleared ? 'Clear' : null,
        locked: !ok,
        accent,
        onTap: ok ? () => pick(s) : () => {
          if (ctx.ns.callout) ctx.ns.callout(lockText(list[i - 1]));
        },
      });
      c.querySelector('.card__icon').classList.add('ui-tile__no');
      if (!ok) add(c.querySelector('.card__text'), el('span', 'ui-lock', lockText(list[i - 1])));
      add(stack, c);
    });
  }

  function lockText(prev) {
    const u = DATA.UNLOCKS && DATA.UNLOCKS['stage_' + (prev && prev.id)];
    if (u && u.text) return u.text;
    return prev ? 'Clear ' + (prev.name || prev.id) : 'Not yet';
  }

  function curseRow() {
    const wrap = el('div', 'ui-field');
    const l = el('div', 'ui-field__l');
    add(l, el('div', 'h2', 'Curse'), el('div', 'ui-field__v', curse ? ROMAN[curse] : 'None'));
    const seg = el('div', 'ui-seg');
    const top = Math.max(...list.map((s) => (save.curse[s.id] | 0))) + 1;
    for (let t = 0; t <= Math.min(5, top); t++) {
      const b = btn(t ? ROMAN[t] : '—', ctx, () => { curse = t; render(); }, { cls: 'btn--small' + (curse === t ? ' is-on' : '') });
      add(seg, b);
    }
    add(wrap, l, seg);
    return wrap;
  }

  function pick(s) {
    if (props.onPick) props.onPick(s.id, curse);
  }

  render();
  return { destroy() { scr.remove(); } };
}

// ---------------------------------------------------------------------------
// Character select
// ---------------------------------------------------------------------------

/** props: { onPick(charId), onBack() } */
export function charSelect(root, ctx, props = {}) {
  ensureStyles();
  const save = ctx.save;
  const go = (n, p) => ctx.ns.screens.show(n, p);
  const back = props.onBack || (() => go('title'));
  const list = values(DATA.CHARACTERS);

  const { scr, body, foot } = page(ctx, 'Who goes', back);
  add(foot, btn('Back', ctx, back, { cls: 'btn--ghost' }));
  root.appendChild(scr);

  if (!list.length) {
    add(body, empty('No one yet', 'The cast has not been written.'));
  } else {
    const stack = el('div', 'stack');
    for (const c of list) {
      const have = save.chars.indexOf(c.id) >= 0;
      const w = DATA.WEAPONS[c.weapon];
      const accent = rgbOf(w && w.colour, 'var(--choir)');
      const node = card(ctx, {
        title: c.name || c.id,
        sub: have ? (c.blurb || c.title || '') : '',
        note: have ? signature(c, w) : null,
        flag: have && save.chars.indexOf(c.id) === 0 ? null : null,
        locked: !have,
        accent,
        onTap: have ? () => props.onPick && props.onPick(c.id)
                    : () => ctx.ns.callout && ctx.ns.callout(charLock(c)),
      });
      const fig = el('span', 'ui-charart');
      art(fig, portraitFile(c.portrait), accent);
      node.insertBefore(fig, node.firstChild);
      if (!have) add(node.querySelector('.card__text'), el('span', 'ui-lock', charLock(c)));
      add(stack, node);
    }
    add(body, stack);
  }

  return { destroy() { scr.remove(); } };
}

function signature(c, w) {
  const bits = [];
  if (w) bits.push(w.name);
  const t = c.trait;
  if (t) bits.push(t.text || (t.stat ? traitText(t) : ''));
  return bits.filter(Boolean).join(' · ');
}

function traitText(t) {
  if (typeof t.mul === 'number') {
    const d = Math.round((t.mul - 1) * 100);
    return (d >= 0 ? '+' : '') + d + '% ' + t.stat;
  }
  if (typeof t.add === 'number') return '+' + t.add + ' ' + t.stat;
  return t.stat || '';
}

function charLock(c) {
  if (c.unlock && c.unlock.text) return c.unlock.text;
  const u = DATA.UNLOCKS && DATA.UNLOCKS['char_' + c.id];
  if (u && u.text) return u.text;
  return 'Locked';
}

// ---------------------------------------------------------------------------
// Relic loadout
// ---------------------------------------------------------------------------

/** props: { picked: string[], onDone(ids), onBack() } */
export function loadout(root, ctx, props = {}) {
  ensureStyles();
  const save = ctx.save;
  const go = (n, p) => ctx.ns.screens.show(n, p);
  const back = props.onBack || (() => go('title'));
  const list = values(DATA.RELICS);
  const slots = slotCount(save);
  const picked = (props.picked || []).slice(0, slots);

  const { scr, body, foot } = page(ctx, 'Relics', back);
  const goBtn = btn('Begin', ctx, () => props.onDone && props.onDone(picked), { cls: 'btn--primary' });
  add(foot, goBtn);
  root.appendChild(scr);

  function toggle(r) {
    const i = picked.indexOf(r.id);
    if (i >= 0) picked.splice(i, 1);
    else if (picked.length < slots) picked.push(r.id);
    else {
      picked.shift();                          // a full rack swaps the oldest out
      picked.push(r.id);
    }
    render();
  }

  function render() {
    clear(body);
    const rack = el('div', 'ui-slots');
    for (let i = 0; i < slots; i++) {
      const id = picked[i];
      const r = id && DATA.RELICS[id];
      const s = el('div', 'ui-slot' + (r ? ' is-full' : ''), r ? r.name : 'Empty');
      add(rack, s);
    }
    add(body, rack);

    if (!list.length) { add(body, empty('Nothing to carry', 'The relic table has not been written.')); return; }

    const stack = el('div', 'stack');
    for (const r of list) {
      const on = picked.indexOf(r.id) >= 0;
      const c = card(ctx, {
        icon: r.tag || (r.name || '?').slice(0, 3).toUpperCase(),
        title: r.name || r.id,
        sub: r.desc || '',
        note: [r.good, r.bad].filter(Boolean).join('  ·  ') || null,
        on,
        flag: on ? 'Worn' : null,
        accent: on ? 'var(--gold)' : 'var(--thread)',
        onTap: () => toggle(r),
      });
      if (r.bad) c.querySelector('.ui-note').style.setProperty('--accent', 'var(--danger)');
      add(stack, c);
    }
    add(body, stack);
  }

  render();
  return { destroy() { scr.remove(); } };
}

/** One slot, growing to three (DESIGN §5). Sanctum node `relicslot` buys them. */
export function slotCount(save) {
  return Math.max(1, Math.min(3, 1 + ((save.sanctum && save.sanctum.relicslot) | 0)));
}
