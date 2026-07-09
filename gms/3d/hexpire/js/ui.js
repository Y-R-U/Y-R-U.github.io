// DOM layer: HUD, context panels, modals, toasts. No three.js, no rules —
// everything mutating the game goes back through handler callbacks.
import { CFG } from './config.js';
import { villagesOwned } from './state.js';
import { computeIncome } from './rules.js';

const $ = (id) => document.getElementById(id);

// ---------- toasts ----------
export function toast(msg, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, ms);
}

// ---------- modal ----------
export function showModal({ title, body, buttons = [{ label: 'OK', primary: true }], onClose }) {
  const root = $('modal-root');
  root.innerHTML = '';
  root.classList.remove('hidden');
  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `<h2>${title}</h2><div class="m-body">${body}</div><div class="m-btns"></div>`;
  const btnRow = card.querySelector('.m-btns');
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.primary) btn.classList.add('primary');
    if (b.danger) btn.classList.add('danger');
    btn.onclick = () => { closeModal(); b.onTap?.(); };
    btnRow.appendChild(btn);
  }
  root.onclick = (e) => { if (e.target === root && onClose !== false) closeModal(); };
  root.appendChild(card);
  return card;
}
export function closeModal() { $('modal-root').classList.add('hidden'); $('modal-root').innerHTML = ''; }

// ---------- HUD ----------
export function showHud(v) { $('hud').classList.toggle('hidden', !v); }

export function updateHud(st, humanIdx) {
  const e = st.empires[humanIdx];
  const inc = computeIncome(st, humanIdx);
  $('hud-coins').innerHTML = `🪙 ${e.coins} <span id="hud-income">+${inc.total}</span>`;
  $('hud-round').textContent = 'Round ' + st.round;
  $('hud-land').textContent = '⬡ ' + inc.hexCount;
  // empire chips
  const chips = $('hud-empires');
  chips.innerHTML = '';
  for (const emp of st.empires) {
    const c = document.createElement('div');
    c.className = 'emp-chip' + (st.turn === emp.idx ? ' turn' : '') + (emp.alive ? '' : ' dead');
    c.innerHTML = `<span class="emp-dot" style="background:${CFG.colors[emp.colorIdx].css}"></span>${emp.name}`;
    chips.appendChild(c);
  }
}

export function showEndTurn(v, sub = '') {
  const b = $('btn-endturn');
  b.classList.toggle('hidden', !v);
  $('et-sub').textContent = sub;
}
export function endTurnAttention(v) { $('btn-endturn').classList.toggle('attention', v); }

let bannerTimer = 0;
export function turnBanner(text, cssColor = '#f0d68a', ms = 1300) {
  const el = $('turnbanner');
  el.innerHTML = text;
  el.style.color = cssColor;
  el.classList.remove('hidden');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// ---------- context panel ----------
export function hidePanel() {
  $('panel').classList.add('hidden');
  $('hud').classList.remove('panel-open');
}

function panelShell(title, sub, onClose) {
  const p = $('panel');
  p.classList.remove('hidden');
  $('hud').classList.add('panel-open');   // End Turn steps aside
  p.innerHTML = `
    <div class="p-head">
      <div class="p-title">${title}<span class="p-sub">${sub || ''}</span></div>
      <button class="p-close">✕</button>
    </div>`;
  p.querySelector('.p-close').onclick = onClose;
  return p;
}

function actBtn(ico, label, cost, disabled, onTap, cls = '') {
  const b = document.createElement('button');
  b.className = 'act-btn ' + cls;
  b.disabled = !!disabled;
  b.innerHTML = `<span class="ico">${ico}</span>${label}${cost != null ? `<span class="cost">🪙 ${cost}</span>` : ''}`;
  b.onclick = onTap;
  return b;
}

function statRow(pairs) {
  const div = document.createElement('div');
  div.className = 'p-stat-row';
  div.innerHTML = pairs.map(([k, v]) => `${k} <b>${v}</b>`).join('&ensp;·&ensp;');
  return div;
}

// panel for an empty tile the player owns → build menu
export function buildPanel(st, k, idx, H) {
  const e = st.empires[idx];
  const p = panelShell('Build', 'your land — choose a structure', H.onClose);
  const acts = document.createElement('div');
  acts.className = 'p-actions';
  for (const t of CFG.towerOrder) {
    const cfg = CFG.towers[t];
    acts.appendChild(actBtn(
      t === 'wood' ? '🗼' : t === 'stone' ? '🏰' : '💥',
      cfg.name.split(' ')[0], cfg.cost, e.coins < cfg.cost,
      () => H.onBuild(k, t)));
  }
  const vCost = CFG.villageCost(villagesOwned(st, idx));
  acts.appendChild(actBtn('🏘️', 'Village', vCost, e.coins < vCost, () => H.onVillage(k)));
  p.appendChild(acts);
  const hint = document.createElement('div');
  hint.className = 'p-stat-row';
  hint.style.marginTop = '8px';
  hint.innerHTML = `towers: <b>def / arrows / claim</b> — wood 1·1·1, stone 1·2·2, mortar 2·3·3 · village <b>+${CFG.villageIncome} coin</b>`;
  p.appendChild(hint);
  return p;
}

export function basePanel(st, k, idx, H) {
  const t = st.tiles.get(k);
  const b = t.building;
  const mine = b.owner === idx;
  const cfg = CFG.base[b.level];
  const ownerName = b.owner >= 0 ? st.empires[b.owner].name : 'Neutral';
  const p = panelShell(
    `${mine ? 'Your' : ownerName} Base — Level ${b.level}`,
    mine ? 'the heart of your empire' : 'an enemy stronghold', H.onClose);
  p.insertBefore(statRow([
    ['HP', `${b.hp}/${b.maxHp}`], ['def', cfg.def], ['claim', cfg.radius],
    ['arrows', cfg.arrows], ['income', cfg.income],
  ]), null);
  if (mine) {
    const acts = document.createElement('div');
    acts.className = 'p-actions';
    if (b.level < 5) {
      const cost = CFG.baseUpgrade[b.level];
      acts.appendChild(actBtn('⬆️', `Level ${b.level + 1}`, cost, st.empires[idx].coins < cost, () => H.onUpgradeBase(k)));
    }
    acts.appendChild(actBtn('⚔️', 'Recruit', null, false, () => H.onRecruitStart(k)));
    p.appendChild(acts);
  }
  return p;
}

export function towerPanel(st, k, idx, H) {
  const b = st.tiles.get(k).building;
  const cfg = CFG.towers[b.type];
  const mine = b.owner === idx;
  const ownerName = b.owner >= 0 ? st.empires[b.owner].name : 'Neutral';
  const p = panelShell(`${mine ? 'Your' : ownerName + "'s"} ${cfg.name}`, mine ? '' : 'enemy structure', H.onClose);
  p.appendChild(statRow([
    ['HP', `${b.hp}/${b.maxHp}`], ['def', cfg.def], ['arrows', cfg.arrows], ['claim', cfg.radius],
  ]));
  if (mine) {
    const acts = document.createElement('div');
    acts.className = 'p-actions';
    const i = CFG.towerOrder.indexOf(b.type);
    if (i < CFG.towerOrder.length - 1) {
      const next = CFG.towerOrder[i + 1];
      const cost = CFG.towers[next].cost - cfg.cost;
      acts.appendChild(actBtn('⬆️', CFG.towers[next].name.split(' ')[0], cost,
        st.empires[idx].coins < cost, () => H.onUpgradeTower(k)));
    }
    acts.appendChild(actBtn('💰', 'Sell', '+' + Math.floor(b.invested * CFG.sellRefund), false, () => H.onSell(k), 'danger'));
    p.appendChild(acts);
  }
  return p;
}

export function villagePanel(st, k, idx, H) {
  const b = st.tiles.get(k).building;
  const mine = b.owner === idx;
  const ownerName = b.owner >= 0 ? st.empires[b.owner].name : 'No one';
  const p = panelShell(mine ? 'Your Village' : `Village — ${ownerName}`,
    `pays +${CFG.villageIncome} coin to whoever holds this hex`, H.onClose);
  p.appendChild(statRow([['HP', `${b.hp}/${b.maxHp}`], ['income', '+' + CFG.villageIncome]]));
  if (mine) {
    const acts = document.createElement('div');
    acts.className = 'p-actions';
    acts.appendChild(actBtn('💰', 'Sell', '+' + Math.floor(b.invested * CFG.sellRefund), false, () => H.onSell(k), 'danger'));
    p.appendChild(acts);
  }
  return p;
}

export function armyPanel(st, army, idx, H) {
  const mine = army.owner === idx;
  const name = st.empires[army.owner].name;
  const p = panelShell(
    `${mine ? 'Your' : name + "'s"} Army — Level ${army.level}`,
    mine ? 'tap a highlighted hex to march, red to attack, blue to merge' : 'enemy force', H.onClose);
  p.appendChild(statRow([
    ['HP', `${army.hp}/${army.maxHp}`],
    ['attack', CFG.armyAtk(army.level)], ['defence', CFG.armyDef(army.level)],
    ['moves', mine ? army.movesLeft : CFG.armyMoves],
  ]));
  return p;
}

// recruit flow: level stepper then tap-a-tile
export function recruitPanel(st, idx, chosen, H) {
  const e = st.empires[idx];
  const p = panelShell('Recruit Army', 'choose a level, then tap a highlighted hex beside your base', H.onClose);
  const step = document.createElement('div');
  step.className = 'lvl-stepper';
  const cost = CFG.armyCost(chosen);
  step.innerHTML = `
    <button id="lvl-minus">−</button>
    <div class="lvl-val">Level ${chosen}<small>🪙 ${cost} · atk ${CFG.armyAtk(chosen)} · def ${CFG.armyDef(chosen)}</small></div>
    <button id="lvl-plus">+</button>`;
  p.appendChild(step);
  const afford = document.createElement('div');
  afford.className = 'p-stat-row';
  afford.style.justifyContent = 'center';
  afford.innerHTML = e.coins < cost ? `<b style="color:#e8746c">not enough coin (${e.coins})</b>` : `you have <b>🪙 ${e.coins}</b>`;
  p.appendChild(afford);
  p.querySelector('#lvl-minus').onclick = () => H.onLevel(Math.max(1, chosen - 1));
  p.querySelector('#lvl-plus').onclick = () => H.onLevel(Math.min(CFG.armyMax, chosen + 1));
  return p;
}

export function infoPanel(title, sub, pairs, onClose) {
  const p = panelShell(title, sub, onClose);
  if (pairs?.length) p.appendChild(statRow(pairs));
  return p;
}

// ---------- result ----------
export function resultModal({ win, name, stats, onMenu, onNext, onReplay }) {
  const body = `
    <div class="result-title ${win ? 'win' : 'lose'}">${win ? '👑 VICTORY' : '☠️ DEFEAT'}</div>
    <div class="result-stats">${stats}</div>`;
  const buttons = [];
  if (win && onNext) buttons.push({ label: 'Next Chapter', primary: true, onTap: onNext });
  if (!win && onReplay) buttons.push({ label: 'Try Again', primary: true, onTap: onReplay });
  if (win && !onNext && onReplay) buttons.push({ label: 'Play Again', primary: true, onTap: onReplay });
  buttons.push({ label: 'Home', onTap: onMenu });
  showModal({ title: win ? name + ' prevails!' : name + ' has fallen', body, buttons, onClose: false });
}

// ---------- tutorial card ----------
export function tutShow(html, nextLabel = null, onNext = null) {
  const box = $('tutbox');
  box.classList.remove('hidden');
  $('tut-text').innerHTML = html;
  const btn = $('tut-next');
  if (nextLabel) {
    btn.classList.remove('hidden');
    btn.textContent = nextLabel;
    btn.onclick = onNext;
  } else btn.classList.add('hidden');
}
export function tutHide() { $('tutbox').classList.add('hidden'); }
