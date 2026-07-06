// LASTWALL — all DOM UI: HUD, modal (never alert()), draft, meta grid,
// gate select, transmissions (typewriter), toasts, announcements.
import { UPGRADES, meta } from './meta.js';
import { fmt } from './utils.js';
import { sfx } from './audio.js';

const $ = id => document.getElementById(id);
export const el = {
  boot: $('boot'), bootBar: document.querySelector('#boot-bar i'), bootStatus: $('boot-status'),
  title: $('title'), hud: $('hud'), modal: $('modal'), draft: $('draft'), tx: $('transmission'),
  gatesel: $('gatesel'), metascreen: $('metascreen'),
};

export function bootProgress(p, txt) { el.bootBar.style.width = (p * 100) + '%'; if (txt) el.bootStatus.textContent = txt; }

// ---------- HUD ----------
export function updateHUD(P, run) {
  $('hp-fill').style.width = Math.max(0, P.hp / P.maxHp * 100) + '%';
  $('hp-num').textContent = Math.max(0, Math.ceil(P.hp));
  $('serum').textContent = fmt(run.serum);
  $('level-num').textContent = run.n;
  $('mode-ic').textContent = run.mode === 'story' ? '§' : '∞';
  $('kills').textContent = run.kills;
  // weapons
  const gun = P.activeGun();
  $('wpn-name').textContent = P.temp ? P.temp.def.name : (P.target && !P.temp && Math.hypot(P.target.x - P.x, P.target.z - P.z) < 5 ? P.melee.name : P.gun.name);
  $('wpn-ammo').textContent = P.temp ? (P.temp.ammo !== undefined ? P.temp.ammo : Math.ceil(P.temp.time) + 's') : '∞';
  $('wpn-temp').classList.add('hidden');
  const sup = $('wpn-super');
  if (P.super) {
    sup.classList.remove('hidden');
    $('sup-name').textContent = P.super.def.name;
    $('sup-fill').style.width = (P.super.charge * 100) + '%';
    sup.classList.toggle('ready', P.super.charge >= 1);
  } else sup.classList.add('hidden');
  // boosts
  const bs = [];
  if (P.boosts.dmg.t > 0) bs.push(['⚡×' + P.boosts.dmg.mult.toFixed(0), P.boosts.dmg.t, P.boosts.dmg.max]);
  if (P.boosts.spd.t > 0) bs.push(['👟', P.boosts.spd.t, P.boosts.spd.max]);
  if (P.boosts.shield.t > 0) bs.push(['🛡', P.boosts.shield.t, P.boosts.shield.max]);
  $('boosts').innerHTML = bs.map(([ic, t, max]) => `<div class="boost-chip">${ic}<div class="bt"><i style="width:${t / (max || 12) * 100}%"></i></div></div>`).join('');
  // hurt vignette
  $('dmgflash').style.opacity = P.hurtFlash * .9;
}

export function setObjective(txt) { const o = $('objective'); if (!txt) { o.classList.add('hidden'); return; } o.classList.remove('hidden'); o.textContent = txt; }
export function bossBar(name, frac) {
  const b = $('bossbar');
  if (name == null) { b.classList.add('hidden'); return; }
  b.classList.remove('hidden'); $('boss-name').textContent = name;
  $('boss-fill').style.width = Math.max(0, frac * 100) + '%';
}

export function toast(txt, cls = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + cls; t.textContent = txt;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

let annT = null;
export function announce(big, small = '') {
  const a = $('announce');
  a.classList.remove('hidden');
  a.innerHTML = big + (small ? `<small>${small}</small>` : '');
  clearTimeout(annT); annT = setTimeout(() => a.classList.add('hidden'), 2200);
}

export function setHint(txt) { const h = $('hint'); if (!txt) { h.classList.add('hidden'); return; } h.classList.remove('hidden'); h.innerHTML = txt; }

// quick fade-to-black level transition: darken → mid() → lighten
export function fadeBlack(mid) {
  const f = $('fade');
  f.style.opacity = 1;
  setTimeout(() => { mid?.(); setTimeout(() => { f.style.opacity = 0; }, 140); }, 430);
}

// ---------- modal ----------
let modalCb = null;
export function modal(title, bodyHTML, btns) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHTML;
  const bx = $('modal-btns'); bx.innerHTML = '';
  for (const [label, cls, fn] of btns) {
    const b = document.createElement('button');
    b.className = 'mbtn ' + cls; b.innerHTML = label;
    b.onclick = () => { sfx.click(); fn(); };
    bx.appendChild(b);
  }
  el.modal.classList.remove('hidden');
}
export function closeModal() { el.modal.classList.add('hidden'); }

// ---------- transmissions (typewriter) ----------
// Never a soft-lock: tap fast-forwards/dismisses, AND they auto-advance after
// reading time (Aaron's mobile intro hung waiting for a tap that never landed).
let txTimer = null, txDone = null, txFull = '', txAuto = null;
function txScheduleAuto() {
  clearTimeout(txAuto);
  txAuto = setTimeout(() => txSkip(), 1600 + txFull.length * 28);
}
export function transmit(from, text, onDone) {
  el.tx.classList.remove('hidden');
  $('tx-from').textContent = from;
  txFull = text; txDone = onDone;
  const t = $('tx-text');
  t.innerHTML = '<span class="cursor">&nbsp;</span>';
  let i = 0;
  clearInterval(txTimer); clearTimeout(txAuto);
  txTimer = setInterval(() => {
    i += 2;
    t.innerHTML = text.slice(0, i) + '<span class="cursor">&nbsp;</span>';
    if (i >= text.length) { clearInterval(txTimer); txTimer = null; t.textContent = text; txScheduleAuto(); }
  }, 24);
}
export function txSkip() { // tap: finish typing, next tap (or auto): dismiss
  if (el.tx.classList.contains('hidden')) return false;
  if (txTimer) { clearInterval(txTimer); txTimer = null; $('tx-text').textContent = txFull; txScheduleAuto(); return true; }
  clearTimeout(txAuto);
  el.tx.classList.add('hidden');
  const done = txDone; txDone = null;
  done?.();
  return true;
}
export const txOpen = () => !el.tx.classList.contains('hidden');
// tapping the panel itself ("tap to continue" is printed on it) must work
el.tx.addEventListener('pointerdown', e => { e.stopPropagation(); sfx.click(); txSkip(); });

// ---------- draft ----------
export function showDraft(options, rerollsLeft, onPick, onReroll) {
  el.draft.classList.remove('hidden');
  $('reroll-n').textContent = rerollsLeft;
  $('draft-reroll').disabled = rerollsLeft <= 0;
  $('draft-reroll').onclick = () => { sfx.click(); onReroll(); };
  const cx = $('draft-cards'); cx.innerHTML = '';
  options.forEach(p => {
    const c = document.createElement('div');
    c.className = 'pcard' + (p.r === 1 ? ' rare' : p.r === 2 ? ' epic' : '');
    c.innerHTML = `<div class="p-ic">${p.ic}</div><div class="p-name">${p.name}</div><div class="p-desc">${p.desc}</div>`;
    c.onclick = () => { sfx.draft(); onPick(p); };
    cx.appendChild(c);
  });
}
export function hideDraft() { el.draft.classList.add('hidden'); }

// ---------- meta grid ----------
export function renderMeta(onExit) {
  $('meta-serum').textContent = fmt(meta.serum) + ' ⬢';
  const g = $('meta-grid'); g.innerHTML = '';
  for (const u of UPGRADES) {
    const r = meta.up(u.id), maxed = r >= u.max, can = meta.canBuy(u);
    const cell = document.createElement('div');
    cell.className = 'meta-cell' + (maxed ? ' maxed' : can ? '' : ' cant');
    cell.innerHTML = `<div class="m-name">${u.name}</div><div class="m-desc">${u.desc}</div>
      <div class="m-pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('')}</div>
      <div class="m-cost">${maxed ? 'MAX' : u.cost(r) + ' ⬢'}</div>`;
    if (!maxed) cell.onclick = () => { if (meta.buy(u)) { sfx.pickup(); renderMeta(onExit); } else sfx.click(); };
    g.appendChild(cell);
  }
  el.metascreen.classList.remove('hidden');
  $('meta-back').onclick = () => { sfx.click(); el.metascreen.classList.add('hidden'); onExit?.(); };
}

// ---------- gate select ----------
export function showGates(titleTxt, gates, bestInfo, onPick, onBack) {
  $('gatesel-title').textContent = titleTxt;
  const g = $('gatesel-grid'); g.innerHTML = '';
  for (const lv of gates) {
    const cell = document.createElement('div');
    cell.className = 'gate-cell';
    cell.innerHTML = `<b>${lv}</b><small>${lv === 1 ? 'GATE ZERO' : 'GATE ' + (lv - lv % 10 || lv - 1)}</small>`;
    cell.onclick = () => { sfx.gate(); onPick(lv); };
    g.appendChild(cell);
  }
  el.gatesel.classList.remove('hidden');
  $('gatesel-back').onclick = () => { sfx.click(); el.gatesel.classList.add('hidden'); onBack?.(); };
}
export function hideGates() { el.gatesel.classList.add('hidden'); }

// ---------- title ----------
export function showTitle(handlers) {
  el.title.classList.remove('hidden');
  $('story-sub').textContent = meta.storyBest > 0 ? `section ${meta.storyBest} reached` : 'begin the run for the cure';
  $('endless-sub').textContent = meta.endlessBest > 0 ? `best depth ${meta.endlessBest}` : 'go as far as you can';
  $('serum-sub').textContent = fmt(meta.serum) + ' serum banked';
  $('btn-story').onclick = () => { sfx.gate(); handlers.story(); };
  $('btn-endless').onclick = () => { sfx.gate(); handlers.endless(); };
  $('btn-meta').onclick = () => { sfx.click(); handlers.meta(); };
  $('btn-help').onclick = () => { sfx.click(); handlers.help(); };
}
export function hideTitle() { el.title.classList.add('hidden'); }
