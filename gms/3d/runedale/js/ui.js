// All HUD presentation: HP bar, run-energy orb, coins, XP drops, interaction
// prompt + channel bar, toasts, level-up popups, damage flash, tracker, and
// the inventory / skills / quests / shop / bank / furnace / anvil / dialogue /
// death modals. No alert() — styled popups only. Game logic lives elsewhere;
// this only renders + forwards taps.

import { ITEMS, STORE_STOCK, SMELT, SMITH } from './items.js';
import { SKILLS, SKILL_META, levelForXp, xpProgress, combatLevel, MAX_LEVEL } from './skills.js';

const $ = s => document.querySelector(s);
let A = {};                 // action callbacks from main
let shopMode = 'buy';
let bankQty = 1;            // 1 | 5 | 'all'

export function initUi(player, actions) {
  A = actions;

  $('#act-use').onclick = () => A.interact();
  $('#act-eat').onclick = () => A.eatBest();
  $('#runorb').onclick = () => A.toggleRun();

  for (const b of document.querySelectorAll('#topbtns button[data-panel]'))
    b.onclick = () => { if (b.dataset.panel === 'quests') { trackerHidden = false; setTracker(lastTracker, lastDone); } togglePanel(b.dataset.panel); };
  $('#tracker .qt-x').onclick = () => { trackerHidden = true; $('#tracker').classList.add('hidden'); };

  setTimeout(() => $('#hint')?.classList.add('fade'), 9000);
}

// ── vitals (called each frame; cheap) ──
export function bars(player) {
  $('#vitals .hp > i').style.width = `${(player.hp / player.maxHp) * 100}%`;
  $('#vitals .hp b').textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
  $('#gold b').textContent = player.gold;
  const orb = $('#runorb');
  orb.classList.toggle('on', player.runMode);
  orb.querySelector('i').style.height = `${player.energy}%`;
}

export function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  const wrap = $('#toasts'); wrap.appendChild(t);
  while (wrap.children.length > 4) wrap.firstChild.remove();
  setTimeout(() => t.remove(), 2400);
}

// ── floating XP drops, RS style ──
export function xpDrop(skill, amount) {
  const meta = SKILL_META[skill]; if (!meta) return;
  const el = document.createElement('div');
  el.className = 'xpdrop';
  el.textContent = `+${Math.round(amount)} ${meta.icon}`;
  $('#xpdrops').appendChild(el);
  setTimeout(() => el.remove(), 1400);
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
  el.innerHTML = `<div class="lp-1">✨ CONGRATULATIONS ✨</div><div class="lp-2">${SKILL_META[skill].icon} ${SKILL_META[skill].name} is now level ${level}!</div>`;
  el.classList.remove('hidden'); void el.offsetWidth; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 2600);
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
  const el = $(`#panel-${name}`); const willOpen = el.classList.contains('hidden');
  closeAllPanels();
  if (willOpen) { renderPanel(name); el.classList.remove('hidden'); }
}
export function closeAllPanels() {
  for (const m of document.querySelectorAll('.modal')) m.classList.add('hidden');
}
export function openShop() { closeAllPanels(); shopMode = 'buy'; renderShop(); $('#panel-shop').classList.remove('hidden'); }
export function openBank() { closeAllPanels(); renderBank(); $('#panel-bank').classList.remove('hidden'); }
export function openSmelt() { closeAllPanels(); renderSmelt(); $('#panel-smelt').classList.remove('hidden'); }
export function openSmith() { closeAllPanels(); renderSmith(); $('#panel-smith').classList.remove('hidden'); }

let _player = null, _tutorial = null, _bank = null;
export function bindData(player, tutorial, bank) { _player = player; _tutorial = tutorial; _bank = bank; }
function renderPanel(name) {
  if (name === 'inv') renderInventory();
  else if (name === 'skills') renderSkills();
  else if (name === 'quests') renderQuests();
}

function shell(title) {
  return `<div class="card"><h2>${title}<button class="x">✕</button></h2><div class="body"></div></div>`;
}
function wireClose(el) {
  el.querySelector('.x').onclick = () => el.classList.add('hidden');
  el.onclick = (e) => { if (e.target === el) el.classList.add('hidden'); };
}

// ── inventory: a fixed RS-style 4×7 grid (28 slots) ──
export function renderInventory() {
  const p = _player, el = $('#panel-inv');
  el.innerHTML = shell(`🎒 Pack <span class="slotcount">${p.slotsUsed()}/28</span>`);
  const body = el.querySelector('.body');
  const grid = document.createElement('div'); grid.className = 'invgrid';
  for (let i = 0; i < 28; i++) {
    const stack = p.items[i];
    const slot = document.createElement('div');
    if (!stack) { slot.className = 'slot empty'; grid.appendChild(slot); continue; }
    const def = ITEMS[stack.id];
    const equipped = def.cat === 'weapon' && p.weapon === stack.id;
    slot.className = 'slot' + (equipped ? ' equipped' : '');
    slot.innerHTML = `${stack.n > 1 ? `<span class="sc">${stack.n}</span>` : ''}${equipped ? '<span class="eq">⚔︎</span>' : ''}<div class="si">${def.icon}</div><div class="sn">${def.name}</div>`;
    slot.onclick = () => A.useItem(stack.id);
    grid.appendChild(slot);
  }
  body.appendChild(grid);
  const hint = document.createElement('div'); hint.className = 'inv-hint';
  hint.textContent = 'Tap food to eat · tap a weapon to wield · tap the tinderbox to light a fire';
  body.appendChild(hint);
  wireClose(el);
}

export function renderSkills() {
  const p = _player, el = $('#panel-skills');
  el.innerHTML = shell('📊 Skills');
  const body = el.querySelector('.body');
  const lv = {}; for (const s of SKILLS) lv[s] = levelForXp(p.skills[s].xp);
  const cl = document.createElement('div'); cl.className = 'combat-lvl';
  cl.innerHTML = `⚔️ Combat level <b>${combatLevel(lv)}</b> &nbsp;·&nbsp; Σ Total level <b>${p.totalLevel()}</b>`;
  body.appendChild(cl);
  for (const s of SKILLS) {
    const pr = xpProgress(p.skills[s].xp);
    const row = document.createElement('div'); row.className = 'skrow';
    row.innerHTML = `<span class="ski">${SKILL_META[s].icon}</span><span class="skn">${SKILL_META[s].name}</span>
      <span class="sklv">${pr.level}${pr.level >= MAX_LEVEL ? '' : '/' + MAX_LEVEL}</span>
      <span class="skbar"><i style="width:${pr.into * 100}%"></i></span>`;
    row.title = `${Math.floor(p.skills[s].xp)} xp`;
    body.appendChild(row);
  }
  wireClose(el);
}

export function renderQuests() {
  const el = $('#panel-quests');
  el.innerHTML = shell('📜 Journal');
  const body = el.querySelector('.body');
  const data = _tutorial.all();

  const h = document.createElement('div'); h.className = 'qhead';
  h.textContent = data.done ? '✅ Tutorial complete' : '🏫 Tutorial';
  body.appendChild(h);
  if (!data.done) {
    for (const s of data.steps) {
      const row = document.createElement('div');
      row.className = 'qo ' + (s.done ? 'done' : s.current ? 'current' : 'locked');
      row.textContent = `${s.done ? '✓' : s.current ? '➤' : '○'} ${s.text}`;
      body.appendChild(row);
      if (!s.done && !s.current) break;   // show only up to the next step
    }
    const skip = document.createElement('button'); skip.className = 'btn-skip';
    skip.textContent = 'Skip tutorial';
    skip.onclick = () => { A.skipTutorial(); renderQuests(); };
    body.appendChild(skip);
  }

  const h2 = document.createElement('div'); h2.className = 'qhead';
  h2.textContent = '🏆 Achievements';
  body.appendChild(h2);
  for (const a of data.achievements) {
    const row = document.createElement('div'); row.className = 'qo ' + (a.done ? 'done' : '');
    row.textContent = `${a.done ? '✓' : '○'} ${a.name} — ${a.desc}${a.n ? ` (${Math.min(a.count, a.n)}/${a.n})` : ''}`;
    body.appendChild(row);
  }
  wireClose(el);
}

export function renderShop() {
  const p = _player, el = $('#panel-shop');
  el.innerHTML = shell('🛒 General Store');
  const body = el.querySelector('.body');
  body.innerHTML = `<div class="shop-gold">🪙 You have <b>${p.gold}</b> coins</div>
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
      const d = ITEMS[s.id]; const price = Math.max(1, Math.ceil(d.value * 0.5));
      const r = document.createElement('div'); r.className = 'shoprow';
      r.innerHTML = `<span class="si">${d.icon}</span><span class="snm">${d.name}${s.n > 1 ? ` ×${s.n}` : ''}</span><span class="spr">🪙 ${price} ea</span>`;
      const btn = document.createElement('button'); btn.textContent = 'Sell';
      btn.onclick = () => A.sellItem(s.id, price);
      r.appendChild(btn); rows.appendChild(r);
    }
  }
  wireClose(el);
}

// ── bank: one shared vault; tap moves items at the selected quantity ──
export function renderBank() {
  const p = _player, el = $('#panel-bank');
  el.innerHTML = shell('🏦 Bank of Runedale');
  const body = el.querySelector('.body');

  const qtys = [1, 5, 'all'];
  const qbar = document.createElement('div'); qbar.className = 'shoptabs';
  for (const q of qtys) {
    const b = document.createElement('button');
    b.textContent = q === 'all' ? 'All' : `×${q}`;
    b.className = bankQty === q ? 'on' : '';
    b.onclick = () => { bankQty = q; renderBank(); $('#panel-bank').classList.remove('hidden'); };
    qbar.appendChild(b);
  }
  const dep = document.createElement('button'); dep.textContent = '⬇ Deposit pack';
  dep.onclick = () => { A.depositAll(); };
  qbar.appendChild(dep);
  body.appendChild(qbar);

  const bh = document.createElement('div'); bh.className = 'qhead'; bh.textContent = '🏦 Vault — tap to withdraw';
  body.appendChild(bh);
  const bgrid = document.createElement('div'); bgrid.className = 'invgrid bankgrid';
  const entries = Object.entries(_bank.items);
  if (!entries.length) { const e = document.createElement('div'); e.className = 'empty-note'; e.textContent = 'Your vault is empty.'; body.appendChild(e); }
  for (const [id, n] of entries) {
    const def = ITEMS[id]; if (!def) continue;
    const slot = document.createElement('div'); slot.className = 'slot';
    slot.innerHTML = `<span class="sc">${n}</span><div class="si">${def.icon}</div><div class="sn">${def.name}</div>`;
    slot.onclick = () => A.withdraw(id, bankQty);
    bgrid.appendChild(slot);
  }
  if (entries.length) body.appendChild(bgrid);

  const ph = document.createElement('div'); ph.className = 'qhead'; ph.textContent = `🎒 Pack ${p.slotsUsed()}/28 — tap to deposit`;
  body.appendChild(ph);
  const pgrid = document.createElement('div'); pgrid.className = 'invgrid bankgrid';
  for (const stack of p.items) {
    const def = ITEMS[stack.id]; if (!def) continue;
    const slot = document.createElement('div'); slot.className = 'slot';
    slot.innerHTML = `${stack.n > 1 ? `<span class="sc">${stack.n}</span>` : ''}<div class="si">${def.icon}</div><div class="sn">${def.name}</div>`;
    slot.onclick = () => A.deposit(stack.id, bankQty);
    pgrid.appendChild(slot);
  }
  body.appendChild(pgrid);
  wireClose(el);
}

// ── furnace / anvil recipe panels ──
export function renderSmelt() {
  const p = _player, el = $('#panel-smelt');
  el.innerHTML = shell('🔥 Furnace');
  const body = el.querySelector('.body');
  const lvl = levelForXp(p.skills.smithing.xp);
  for (const r of SMELT) {
    const needs = Object.entries(r.needs).map(([id, n]) => `${n}× ${ITEMS[id].icon} ${ITEMS[id].name}`).join(' + ');
    const can = lvl >= r.lvl && Object.entries(r.needs).every(([id, n]) => p.countItem(id) >= n);
    const row = document.createElement('div'); row.className = 'shoprow';
    row.innerHTML = `<span class="si">${r.icon}</span><span class="snm">${r.name}<small>${needs}${r.fail ? ' · may crumble' : ''}</small></span><span class="spr">Lv ${r.lvl}</span>`;
    const btn = document.createElement('button'); btn.textContent = 'Smelt'; btn.disabled = !can;
    btn.onclick = () => { el.classList.add('hidden'); A.smelt(r); };
    row.appendChild(btn); body.appendChild(row);
  }
  wireClose(el);
}

export function renderSmith() {
  const p = _player, el = $('#panel-smith');
  el.innerHTML = shell('🔨 Anvil');
  const body = el.querySelector('.body');
  const lvl = levelForXp(p.skills.smithing.xp);
  if (!p.hasItem('hammer')) { const e = document.createElement('div'); e.className = 'empty-note'; e.textContent = 'You need a hammer to smith.'; body.appendChild(e); }
  for (const r of SMITH) {
    const d = ITEMS[r.id];
    const can = p.hasItem('hammer') && lvl >= r.lvl && p.countItem(r.bar) >= r.bars;
    const row = document.createElement('div'); row.className = 'shoprow';
    row.innerHTML = `<span class="si">${d.icon}</span><span class="snm">${d.name}<small>${r.bars}× ${ITEMS[r.bar].icon} ${ITEMS[r.bar].name}</small></span><span class="spr">Lv ${r.lvl}</span>`;
    const btn = document.createElement('button'); btn.textContent = 'Smith'; btn.disabled = !can;
    btn.onclick = () => { el.classList.add('hidden'); A.smith(r); };
    row.appendChild(btn); body.appendChild(row);
  }
  wireClose(el);
}

// ── NPC dialogue ──
export function dialogue(name, lines) {
  const el = $('#panel-dialog');
  let i = 0;
  const render = () => {
    el.innerHTML = `<div class="card dlg"><h2>💬 ${name}</h2><div class="body"><p class="dlg-line">${lines[i]}</p>
      <button class="btn-go">${i < lines.length - 1 ? 'Continue' : 'Got it'}</button></div></div>`;
    el.querySelector('.btn-go').onclick = () => { i++; if (i < lines.length) render(); else el.classList.add('hidden'); };
  };
  render();
  el.classList.remove('hidden');
}

export function refreshOpenPanels() {
  if (!$('#panel-inv').classList.contains('hidden')) renderInventory();
  if (!$('#panel-skills').classList.contains('hidden')) renderSkills();
  if (!$('#panel-shop').classList.contains('hidden')) renderShop();
  if (!$('#panel-quests').classList.contains('hidden')) renderQuests();
  if (!$('#panel-bank').classList.contains('hidden')) renderBank();
  if (!$('#panel-smelt').classList.contains('hidden')) renderSmelt();
  if (!$('#panel-smith').classList.contains('hidden')) renderSmith();
}

export function showDeath(stats) {
  const el = $('#panel-death');
  el.innerHTML = `<div class="card"><h2>Oh dear, you are dead!</h2><div class="body" style="text-align:center">
    <p style="margin-bottom:10px;color:#cabb95">${stats}</p>
    <button class="btn-go">Wake up in Bramblewick</button></div></div>`;
  el.querySelector('.btn-go').onclick = () => { el.classList.add('hidden'); A.restart(); };
  el.classList.remove('hidden');
}

export function setBoot(status, frac) {
  const s = document.querySelector('#boot-status'); if (s) s.textContent = status;
  if (frac != null) document.querySelector('#boot-bar > i').style.width = `${frac * 100}%`;
}
export function hideBoot() { document.querySelector('#boot')?.classList.add('hidden'); document.querySelector('#hud')?.classList.remove('hidden'); }
