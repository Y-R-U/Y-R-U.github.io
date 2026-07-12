// LONGSHOT — the armory: buy and equip rifles, scopes, ammo, gear.

import { RIFLES, SCOPES, AMMOS, GEARS } from './config.js';
import { save, persist, owns, grantCash } from './save.js';
import { fmt$, el } from './utils.js';
import * as audio from './audio.js';

const CATALOG = { rifle: RIFLES, scope: SCOPES, ammo: AMMOS, gear: GEARS };

function bar(label, frac) {
  const row = el('div', 'statrow');
  row.append(el('div', 'sl', label));
  const b = el('div', 'sb');
  const f = el('div', 'sf');
  f.style.width = Math.round(Math.min(1, Math.max(0.04, frac)) * 100) + '%';
  b.append(f); row.append(b);
  return row;
}

function rifleStats(r) {
  return [
    bar('VELOCITY', r.v0 / 1000),
    bar('STABILITY', (1.45 - r.sway) / 1.05),
    bar('RATE', (2.5 - r.chamber) / 2.2),
    bar('MAGAZINE', r.mag / 12),
  ];
}
function scopeStats(s) {
  const feats = [];
  if (s.rangefinder) feats.push('RANGEFINDER');
  if (s.windmeter) feats.push('WIND METER');
  if (s.smart) feats.push('SMART DOT');
  if (s.nv) feats.push('NIGHT VISION');
  return { bars: [bar('MAX ZOOM', s.zmax / 28)], feats };
}

const tags = (r) => {
  const t = [];
  if (r.suppressed) t.push('SUPPRESSED');
  if (r.heavy) t.push('ANTI-MATERIEL');
  if (r.semi) t.push('SEMI-AUTO');
  if (r.ap) t.push('PIERCES GLASS+ARMOUR');
  if (r.sub) t.push('QUIET · HEAVY DROP');
  return t;
};

export function renderArmory(container, kind, onChange) {
  container.innerHTML = '';
  for (const item of CATALOG[kind]) {
    const owned = owns(kind, item.id) || item.price === 0;
    const equipped = kind === 'gear' ? owned && owns('gear', item.id) : save.loadout[kind] === item.id;
    const card = el('div', 'icard' + (owned ? ' owned' : '') + (equipped && kind !== 'gear' ? ' equipped' : ''));
    const head = el('div', 'ihead');
    head.append(el('div', 'iname', item.name));
    head.append(el('div', 'iprice', owned ? (kind === 'gear' ? 'OWNED' : (equipped ? 'EQUIPPED' : 'OWNED')) : fmt$(item.price)));
    card.append(head);
    const tagList = tags(item);
    card.append(el('div', 'idesc', item.desc + (tagList.length ? `<br><b style="color:var(--amber2)">${tagList.join(' · ')}</b>` : '')));
    if (kind === 'rifle') rifleStats(item).forEach(b => card.append(b));
    if (kind === 'scope') {
      const s = scopeStats(item);
      s.bars.forEach(b => card.append(b));
      if (s.feats.length) card.append(el('div', 'idesc', `<b style="color:var(--green)">${s.feats.join(' · ')}</b>`));
    }
    const btn = el('button', 'ibtn');
    if (!owned) {
      btn.textContent = 'BUY — ' + fmt$(item.price);
      btn.classList.add('buy');
      if (save.cash < item.price) btn.disabled = true;
      btn.onclick = () => {
        if (save.cash < item.price) return;
        grantCash(-item.price);
        save.owned[kind].push(item.id);
        if (kind !== 'gear') save.loadout[kind] = item.id;
        persist();
        audio.cash();
        onChange && onChange();
      };
    } else if (kind === 'gear') {
      btn.textContent = 'ACTIVE';
      btn.disabled = true;
    } else if (equipped) {
      btn.textContent = 'EQUIPPED';
      btn.disabled = true;
    } else {
      btn.textContent = 'EQUIP';
      btn.classList.add('equip');
      btn.onclick = () => {
        save.loadout[kind] = item.id;
        persist();
        audio.ui();
        onChange && onChange();
      };
    }
    card.append(btn);
    container.append(card);
  }
}

// compact loadout picker used on the briefing screen
export function renderLoadout(container, onChange) {
  container.innerHTML = '';
  for (const kind of ['rifle', 'scope', 'ammo']) {
    const row = el('div', 'load-row');
    for (const item of CATALOG[kind]) {
      if (!(owns(kind, item.id) || item.price === 0)) continue;
      const opt = el('button', 'load-opt' + (save.loadout[kind] === item.id ? ' on' : ''));
      opt.textContent = item.name.split(' ')[0] + (kind === 'scope' ? ' ' + item.name.split(' ').pop() : '');
      opt.onclick = () => {
        save.loadout[kind] = item.id;
        persist();
        audio.ui();
        onChange && onChange();
      };
      row.append(opt);
    }
    container.append(row);
  }
}
