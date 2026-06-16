// All HUD presentation: vitals bars, gold, style picker, action buttons,
// interaction prompt + channel bar, toasts, level-up popups, damage flash, and
// the inventory / skills / shop / quests / death modals. No alert() — styled
// popups only. Game logic lives elsewhere; this only renders + forwards clicks.

import { ITEMS, STORE_STOCK } from './items.js';
import { SKILLS, SKILL_META, levelForXp, xpProgress, combatLevel, MAX_LEVEL } from './skills.js';

const $ = s => document.querySelector(s);
let A = {};                 // action callbacks from main
let shopMode = 'buy';

const STYLES = [
  { id: 'sword', icon: '⚔️', lb: 'Melee' },
  { id: 'crossbow', icon: '🏹', lb: 'Archery' },
  { id: 'staff', icon: '🔮', lb: 'Magic' },
];

export function initUi(player, actions) {
  A = actions;

  // style picker
  const sb = $('#styles');
  for (const s of STYLES) {
    const b = document.createElement('button');
    b.className = 'style-btn'; b.dataset.style = s.id;
    b.innerHTML = `<span class="ic">${s.icon}</span><span class="lb">${s.lb}</span>`;
    b.onclick = () => A.setStyle(s.id);
    sb.appendChild(b);
  }
  setStyleActive(player.style);

  // action buttons
  $('#act-use').onclick = () => A.interact();
  $('#act-eat').onclick = () => A.eatBest();

  // top buttons -> panels (the 📜 quests button also re-shows the tracker)
  for (const b of document.querySelectorAll('#topbtns button[data-panel]'))
    b.onclick = () => { if (b.dataset.panel === 'quests') { trackerHidden = false; setTracker(lastTracker, lastDone); } togglePanel(b.dataset.panel); };
  $('#tracker .qt-x').onclick = () => { trackerHidden = true; $('#tracker').classList.add('hidden'); };

  setTimeout(() => $('#hint')?.classList.add('fade'), 9000);
}

// ── vitals (called each frame; cheap) ──
export function bars(player) {
  $('#vitals .hp > i').style.width = `${(player.hp / player.maxHp) * 100}%`;
  $('#vitals .hp b').textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
  $('#vitals .food > i').style.width = `${player.food}%`;
  $('#vitals .water > i').style.width = `${player.water}%`;
  $('#gold b').textContent = player.gold;
}

export function setStyleActive(id) {
  for (const b of document.querySelectorAll('.style-btn')) b.classList.toggle('on', b.dataset.style === id);
}

export function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  const wrap = $('#toasts'); wrap.appendChild(t);
  while (wrap.children.length > 4) wrap.firstChild.remove();
  setTimeout(() => t.remove(), 2100);
}

export function prompt(text) {
  const el = $('#prompt'), use = $('#act-use');
  if (text) { el.textContent = text; el.classList.remove('hidden'); use.classList.add('live'); }
  else { el.classList.add('hidden'); use.classList.remove('live'); }
}

export function channel(label, frac) {
  const el = $('#channel');
  if (label == null) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.querySelector('.ch-label').textContent = label;
  el.querySelector('.ch-bar > i').style.width = `${frac * 100}%`;
}

export function levelUp(skill, level) {
  const el = $('#levelpop');
  el.innerHTML = `<div class="lp-1">${SKILL_META[skill].icon} ${SKILL_META[skill].name.toUpperCase()} LEVEL UP</div><div class="lp-2">Level ${level}</div>`;
  el.classList.remove('hidden'); void el.offsetWidth; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 2400);
}

let flashT = null;
export function hurtFlash() {
  const f = $('#dmgflash'); f.style.opacity = '1';
  clearTimeout(flashT); flashT = setTimeout(() => f.style.opacity = '0', 120);
}

let trackerHidden = false, lastTracker = null, lastDone = false;
export function setTracker(text, done = false) {
  lastTracker = text; lastDone = done;
  const tr = $('#tracker');
  if (!text || trackerHidden) { tr.classList.add('hidden'); return; }
  tr.classList.remove('hidden');
  tr.querySelector('.qt-obj').textContent = text;
  tr.querySelector('.qt-obj').classList.toggle('done', done);
}

// ── panels ──
function togglePanel(name) {
  const id = `#panel-${name === 'inv' ? 'inv' : name}`;
  const el = $(id); const willOpen = el.classList.contains('hidden');
  closeAllPanels();
  if (willOpen) { renderPanel(name); el.classList.remove('hidden'); }
}
export function closeAllPanels() {
  for (const m of document.querySelectorAll('.modal')) m.classList.add('hidden');
}
export function openShop() { closeAllPanels(); shopMode = 'buy'; renderShop(); $('#panel-shop').classList.remove('hidden'); }

let _player = null, _quests = null;
export function bindData(player, quests) { _player = player; _quests = quests; }
function renderPanel(name) { if (name === 'inv') renderInventory(); else if (name === 'skills') renderSkills(); else if (name === 'quests') renderQuests(); }

function shell(title) {
  return `<div class="card"><h2>${title}<button class="x">✕</button></h2><div class="body"></div></div>`;
}
function wireClose(el) {
  el.querySelector('.x').onclick = () => el.classList.add('hidden');
  el.onclick = (e) => { if (e.target === el) el.classList.add('hidden'); };
}

export function renderInventory() {
  const p = _player, el = $('#panel-inv');
  el.innerHTML = shell('🎒 Inventory');
  const body = el.querySelector('.body');
  if (!p.items.length) { body.innerHTML = `<div class="empty-note">Your pack is empty. Pick fruit, fish, fight, and loot!</div>`; }
  else {
    const grid = document.createElement('div'); grid.className = 'invgrid';
    for (const stack of p.items) {
      const def = ITEMS[stack.id]; if (!def) continue;
      const equipped = def.cat === 'weapon' && p.equipped[def.style] === stack.id;
      const slot = document.createElement('div');
      slot.className = 'slot' + (equipped ? ' equipped' : '');
      slot.innerHTML = `${stack.n > 1 ? `<span class="sc">${stack.n}</span>` : ''}${equipped ? '<span class="eq">⚔︎</span>' : ''}<div class="si">${def.icon}</div><div class="sn">${def.name}</div>`;
      slot.onclick = () => A.useItem(stack.id);
      grid.appendChild(slot);
    }
    body.appendChild(grid);
  }
  const hint = document.createElement('div'); hint.className = 'inv-hint';
  hint.textContent = 'Tap food/potions to consume · tap a weapon to wield · tools unlock actions';
  body.appendChild(hint);
  wireClose(el);
}

export function renderSkills() {
  const p = _player, el = $('#panel-skills');
  el.innerHTML = shell('📊 Skills');
  const body = el.querySelector('.body');
  const lv = {}; for (const s of SKILLS) lv[s] = levelForXp(p.skills[s].xp);
  const cl = document.createElement('div'); cl.className = 'combat-lvl';
  cl.textContent = `⚔️ Combat level ${combatLevel(lv)}`;
  body.appendChild(cl);
  for (const s of SKILLS) {
    const pr = xpProgress(p.skills[s].xp);
    const row = document.createElement('div'); row.className = 'skrow';
    row.innerHTML = `<span class="ski">${SKILL_META[s].icon}</span><span class="skn">${SKILL_META[s].name}</span>
      <span class="sklv">${pr.level}${pr.level >= MAX_LEVEL ? '' : '/' + MAX_LEVEL}</span>
      <span class="skbar"><i style="width:${pr.into * 100}%"></i></span>`;
    body.appendChild(row);
  }
  wireClose(el);
}

export function renderShop() {
  const p = _player, el = $('#panel-shop');
  el.innerHTML = shell('🛒 General Store');
  const body = el.querySelector('.body');
  body.innerHTML = `<div class="shop-gold">🪙 You have <b>${p.gold}</b> gold</div>
    <div class="shoptabs"><button data-m="buy" class="${shopMode === 'buy' ? 'on' : ''}">Buy</button><button data-m="sell" class="${shopMode === 'sell' ? 'on' : ''}">Sell</button></div>
    <div class="rows"></div>`;
  const rows = body.querySelector('.rows');
  for (const b of body.querySelectorAll('.shoptabs button')) b.onclick = () => { shopMode = b.dataset.m; renderShop(); $('#panel-shop').classList.remove('hidden'); };

  if (shopMode === 'buy') {
    for (const id of STORE_STOCK) {
      const d = ITEMS[id]; const r = document.createElement('div'); r.className = 'shoprow';
      r.innerHTML = `<span class="si">${d.icon}</span><span class="snm">${d.name}</span><span class="spr">🪙 ${d.value}</span>`;
      const btn = document.createElement('button'); btn.textContent = 'Buy'; btn.disabled = p.gold < d.value;
      btn.onclick = () => A.buyItem(id);
      r.appendChild(btn); rows.appendChild(r);
    }
  } else {
    const sellable = p.items.filter(s => ITEMS[s.id] && ITEMS[s.id].value > 0);
    if (!sellable.length) rows.innerHTML = `<div class="empty-note">Nothing to sell.</div>`;
    for (const s of sellable) {
      const d = ITEMS[s.id]; const price = Math.max(1, Math.ceil(d.value * 0.6));
      const r = document.createElement('div'); r.className = 'shoprow';
      r.innerHTML = `<span class="si">${d.icon}</span><span class="snm">${d.name}${s.n > 1 ? ` ×${s.n}` : ''}</span><span class="spr">🪙 ${price} ea</span>`;
      const btn = document.createElement('button'); btn.textContent = 'Sell';
      btn.onclick = () => A.sellItem(s.id, price);
      r.appendChild(btn); rows.appendChild(r);
    }
  }
  wireClose(el);
}

export function renderQuests() {
  const el = $('#panel-quests');
  el.innerHTML = shell('📜 Quests');
  const body = el.querySelector('.body');
  const list = _quests.all();
  if (!list.length) body.innerHTML = `<div class="empty-note">No quests yet.</div>`;
  for (const q of list) {
    const row = document.createElement('div'); row.className = 'questrow' + (q.complete ? ' complete' : '');
    let objs = q.objectives.map(o => `<div class="qo ${o.done ? 'done' : ''}">${o.done ? '✓' : '○'} ${o.text}${o.target ? ` (${Math.min(o.count, o.target)}/${o.target})` : ''}</div>`).join('');
    row.innerHTML = `<div class="qn">${q.name}</div><div class="qd">${q.desc}</div>${objs}`;
    body.appendChild(row);
  }
  wireClose(el);
}

export function refreshOpenPanels() {
  if (!$('#panel-inv').classList.contains('hidden')) renderInventory();
  if (!$('#panel-skills').classList.contains('hidden')) renderSkills();
  if (!$('#panel-shop').classList.contains('hidden')) renderShop();
  if (!$('#panel-quests').classList.contains('hidden')) renderQuests();
}

export function showDeath(stats) {
  const el = $('#panel-death');
  el.innerHTML = `<div class="card"><h2>YOU DIED</h2><div class="body" style="text-align:center">
    <p style="margin-bottom:10px;color:#cabb95">${stats}</p>
    <button class="btn-go">Wake up at the village</button></div></div>`;
  el.querySelector('.btn-go').onclick = () => { el.classList.add('hidden'); A.restart(); };
  el.classList.remove('hidden');
}

export function setBoot(status, frac) {
  const s = document.querySelector('#boot-status'); if (s) s.textContent = status;
  if (frac != null) document.querySelector('#boot-bar > i').style.width = `${frac * 100}%`;
}
export function hideBoot() { document.querySelector('#boot')?.classList.add('hidden'); document.querySelector('#hud')?.classList.remove('hidden'); }
