// GRUDGE BUGS — DOM: screens, HUD, weapon wheel, modals (never alerts),
// shop, daily chest, options, results. main.js wires the callbacks.

import { WEAPONS, FACTIONS, THEMES, HATS, AI, WIND_LABELS, RULES, ECON } from './config.js';
import { $, clamp } from './utils.js';
import * as save from './save.js';
import * as audio from './audio.js';

let cb = {};                 // {startQuick, startStory, toMenu, getBattle, cams, replayIntro}
let wheelOpen = false, paused = false;

export function init(callbacks) {
  cb = callbacks;
  // nav
  for (const b of document.querySelectorAll('.back-btn'))
    b.addEventListener('click', () => { audio.ui(); showScreen(b.dataset.back); });
  $('btn-story').addEventListener('click', () => { audio.ui(); renderStory(); showScreen('storyselect'); });
  $('btn-continue').addEventListener('click', () => { audio.ui(); cb.continueStory(); });
  $('btn-quick').addEventListener('click', () => { audio.ui(); renderQuick(); showScreen('quick'); });
  $('btn-shop').addEventListener('click', () => { audio.ui(); renderShop(); showScreen('shop'); });
  $('btn-help').addEventListener('click', () => { audio.ui(); helpModal(); });
  $('btn-options').addEventListener('click', () => { audio.ui(); optionsModal(); });
  $('btn-replay-intro').addEventListener('click', () => { audio.ui(); cb.replayIntro(); });
  $('btn-pause').addEventListener('click', () => togglePause());
  $('qk-start').addEventListener('click', () => { audio.ui(); cb.startQuick(quickCfg()); });
  $('wheel').addEventListener('click', (e) => { if (e.target === $('wheel')) toggleWheel(false); });
  $('cine-skip').addEventListener('click', () => cb.skipCine?.());
}

export function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  paused = false;
  if (id) $(id).classList.remove('hidden');
  const inMenu = id === 'menu';
  if (inMenu) {
    const p = save.load();
    $('menu-coins').textContent = `🪙 ${p.coins}`;
    const hasStory = Object.keys(p.story).length > 0;
    $('btn-continue').classList.toggle('hidden', !hasStory || Object.keys(p.story).length >= cb.chapterCount());
  }
}

export function hudVisible(on) {
  $('hud').classList.toggle('hidden', !on);
  $('controls').classList.toggle('hidden', !on);
}

export function toast(text, ms = 2200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, ms);
}

// ---------------- generic modal ----------------
export function modal(html, buttons = [{ label: 'OK', gold: true }], onPick) {
  const root = $('modal-root');
  root.classList.remove('hidden');
  root.innerHTML = `<div class="modal">${html}<div class="m-btns"></div></div>`;
  const btns = root.querySelector('.m-btns');
  buttons.forEach((b, i) => {
    const el = document.createElement('button');
    el.textContent = b.label;
    if (b.gold) el.classList.add('gold');
    el.addEventListener('click', () => { audio.ui(); root.classList.add('hidden'); onPick?.(i, b); });
    btns.appendChild(el);
  });
  return root;
}
export function closeModal() { $('modal-root').classList.add('hidden'); }

// ---------------- quick battle setup ----------------
const qk = { faction: 'ants', rivals: 1, size: 3, theme: 'random', diff: 'spicy' };
function chipRow(el, items, sel, onPick) {
  el.innerHTML = '';
  for (const it of items) {
    const c = document.createElement('button');
    c.className = 'chip' + (it.id === sel ? ' on' : '');
    c.innerHTML = (it.emoji ? `<span class="emoji">${it.emoji}</span>` : '') + it.name;
    c.addEventListener('click', () => { audio.ui(); onPick(it.id); });
    el.appendChild(c);
  }
}
function renderQuick() {
  qk.faction = save.load().faction;
  chipRow($('qk-faction'), FACTIONS, qk.faction, (id) => { qk.faction = id; save.load().faction = id; save.save(); renderQuick(); });
  chipRow($('qk-rivals'), [{ id: 1, name: '1' }, { id: 2, name: '2' }, { id: 3, name: '3' }], qk.rivals, (id) => { qk.rivals = id; renderQuick(); });
  chipRow($('qk-size'), [{ id: 2, name: '2 bugs' }, { id: 3, name: '3 bugs' }, { id: 4, name: '4 bugs' }], qk.size, (id) => { qk.size = id; renderQuick(); });
  chipRow($('qk-theme'), [...THEMES, { id: 'random', name: 'Surprise me', emoji: '🎲' }], qk.theme, (id) => { qk.theme = id; renderQuick(); });
  chipRow($('qk-diff'), AI.diffs, qk.diff, (id) => { qk.diff = id; renderQuick(); });
}
function quickCfg() { return { ...qk }; }

// ---------------- story list ----------------
function renderStory() {
  const p = save.load();
  const list = $('story-list');
  list.innerHTML = '';
  cb.chapters().forEach((ch, i) => {
    const stars = p.story[ch.id] || 0;
    const unlocked = i === 0 || (p.story[cb.chapters()[i - 1].id] || 0) > 0;
    const card = document.createElement('div');
    card.className = 'story-card' + (unlocked ? '' : ' locked');
    card.innerHTML = `
      <div class="ch-num">${unlocked ? ch.emoji : '🔒'}</div>
      <div class="ch-info">
        <div class="ch-name">${i + 1}. ${ch.name}</div>
        <div class="ch-sub">${ch.sub}</div>
      </div>
      <div class="ch-stars">${stars ? '⭐'.repeat(stars) : unlocked ? '—' : ''}</div>`;
    if (unlocked) card.addEventListener('click', () => { audio.ui(); cb.startStory(ch); });
    list.appendChild(card);
  });
}

// ---------------- shop ----------------
function renderShop() {
  const p = save.load();
  $('shop-coins').textContent = `🪙 ${p.coins}`;
  const list = $('shop-list');
  list.innerHTML = '';
  for (const hat of HATS) {
    const owned = p.hatsOwned.includes(hat.id);
    const equipped = p.hat === hat.id;
    const card = document.createElement('div');
    card.className = 'hat-card';
    card.innerHTML = `
      <div class="hat-emoji">${hat.emoji}</div>
      <div class="hat-info"><div class="hat-name">${hat.name}</div><div class="hat-desc">${hat.desc}</div></div>`;
    const btn = document.createElement('button');
    if (equipped) { btn.textContent = 'Equipped'; btn.className = 'equipped'; }
    else if (owned) { btn.textContent = 'Equip'; btn.className = 'owned'; }
    else btn.textContent = `🪙 ${hat.price}`;
    btn.addEventListener('click', () => {
      audio.ui();
      if (equipped) return;
      if (owned) { p.hat = hat.id; save.save(); toast(`${hat.emoji} equipped`); renderShop(); return; }
      if (p.coins < hat.price) return toast('Not enough coins — go win some grudges!');
      p.coins -= hat.price; p.hatsOwned.push(hat.id); p.hat = hat.id; save.save();
      toast(`${hat.emoji} ${hat.name} acquired!`);
      renderShop();
    });
    card.appendChild(btn);
    list.appendChild(card);
  }
}

// ---------------- daily chest ----------------
export function maybeDaily() {
  if (!save.dailyAvailable()) return false;
  const p = save.load();
  const nextDay = Math.min(7, (p.daily.last === new Date(Date.now() - 864e5).toISOString().slice(0, 10)) ? p.daily.streak + 1 : 1);
  let grid = '<div class="daily-grid">';
  for (let i = 0; i < 7; i++) {
    const cls = i + 1 < nextDay ? 'claimed' : i + 1 === nextDay ? 'today' : '';
    grid += `<div class="daily-cell ${cls}">D${i + 1}<span class="d-amt">🪙${ECON.daily[i]}</span></div>`;
  }
  grid += '</div>';
  modal(`<h3>🎁 Daily Grudge Chest</h3><p style="text-align:center">Come back daily to grow the streak.</p>${grid}`,
    [{ label: `Claim 🪙 ${ECON.daily[nextDay - 1]}`, gold: true }], () => {
      const r = save.claimDaily(ECON.daily);
      if (r) toast(`+🪙 ${r.amount} — day ${r.day} streak!`);
      showScreen('menu');
    });
  return true;
}

// ---------------- options ----------------
function optRow(label, key) {
  const p = save.load();
  return `<div class="opt-row"><label>${label}</label>
    <button class="toggle ${p.opts[key] ? 'on' : ''}" data-opt="${key}"><i></i></button></div>`;
}
export function optionsModal() {
  const root = modal(`<h3>⚙️ Options</h3>
    ${optRow('Sound effects', 'sfx')}
    ${optRow('Music', 'music')}
    ${optRow('Camera shake', 'shake')}
    ${optRow('Instant replays', 'replays')}
    ${optRow('Battery saver (less shadow)', 'lite')}
    <p style="font-size:12px;color:#7e9a6c;text-align:center">battery saver applies to the next battle</p>`,
    [{ label: 'Done', gold: true }]);
  for (const t of root.querySelectorAll('.toggle')) {
    t.addEventListener('click', () => {
      const p = save.load();
      const k = t.dataset.opt;
      p.opts[k] = !p.opts[k];
      t.classList.toggle('on', p.opts[k]);
      save.save();
      audio.setSfx(p.opts.sfx);
      audio.setMusic(p.opts.music);
      cb.cams().shakeOn = p.opts.shake;
      audio.ui();
    });
  }
}

export function helpModal() {
  modal(`<h3>📖 How to Grudge</h3>
    <p>🐜 Teams of bugs take turns lobbing things at each other across <b>crumbling dirt ridges</b>. Last team standing eats the sandwich.</p>
    <p>👉 <b>Drag</b> to aim (your bug turns to follow). <b>◀ ▶</b> walk the ridge — the meter is your legs.</p>
    <p>🎯 Every turn opens facing your nearest enemy. Tap <b>🎯</b> to hop the camera between targets — the marker shows through terrain.</p>
    <p>🔥 <b>Hold FIRE</b> to charge power, release to launch. Full charge auto-fires.</p>
    <p>🚀 Tap the weapon button to open the arsenal. 🩴 THE SHOE and 🐝 BEE-52 are aimed by dragging the target ring.</p>
    <p>💨 Mind the wind. 💥 Explosions <b>blow craters out of the ground</b>. 🌊 Knockback is lethal — the drop below is not a suggestion.</p>
    <p>🍓 Take too long and <b>THE JAM RISES</b>.</p>
    <p>🎥 The camera button lets you free-orbit; pinch to zoom. Tap during a replay to skip it.</p>`);
}

// ---------------- pause ----------------
export function togglePause() {
  const b = cb.getBattle();
  if (!b || b.over) return;
  if (paused) { closeModal(); paused = false; return; }
  paused = true;
  audio.ui();
  modal(`<h3>⏸️ Paused</h3><p style="text-align:center">The grudge waits for no bug… except now.</p>`,
    [{ label: 'Resume', gold: true }, { label: 'Options' }, { label: 'Surrender' }],
    (i) => {
      paused = false;
      if (i === 1) { optionsModal(); paused = false; }
      if (i === 2) cb.toMenu();
    });
}
export function isPaused() { return paused; }

// ---------------- weapon wheel ----------------
export function toggleWheel(force) {
  wheelOpen = force ?? !wheelOpen;
  $('wheel').classList.toggle('hidden', !wheelOpen);
  if (wheelOpen) renderWheel();
}
function renderWheel() {
  const b = cb.getBattle();
  if (!b) return;
  const team = b.activeTeam();
  const grid = $('wheel-items');
  grid.innerHTML = '';
  for (const w of WEAPONS) {
    const ammo = team.ammo.get(w.id);
    const el = document.createElement('button');
    el.className = 'wheel-item' + (team.weapon === w.id ? ' on' : '') + (ammo === 0 ? ' empty' : '');
    el.innerHTML = `<div class="wi-icon">${w.icon}</div><div class="wi-name">${w.name}</div>
      <div class="wi-ammo">${ammo < 0 ? '∞' : ammo}</div>`;
    el.title = w.desc;
    el.addEventListener('click', () => {
      if (ammo === 0) return;
      audio.ui();
      b.selectWeapon(w.id);
      toggleWheel(false);
      toast(`${w.icon} ${w.name} — ${w.desc}`, 1800);
    });
    grid.appendChild(el);
  }
}

// ---------------- HUD ----------------
export function updateHUD(b) {
  if (!b) return;
  // team pills
  const wrap = $('hud-teams');
  wrap.innerHTML = '';
  for (const t of b.teams) {
    const hp = t.bugs.reduce((a, x) => a + (x.alive ? Math.max(0, x.hp) : 0), 0);
    const maxhp = t.bugs.reduce((a, x) => a + x.maxhp, 0);
    const alive = t.bugs.some(x => x.alive);
    const el = document.createElement('div');
    el.className = 'team-pill' + (alive ? '' : ' dead');
    el.style.borderLeftColor = t.faction.ui;
    el.innerHTML = `${t.faction.emoji} <div class="hpbar"><i style="width:${(hp / maxhp) * 100}%;background:${t.faction.ui}"></i></div>`;
    wrap.appendChild(el);
  }
  // wind
  const wl = WIND_LABELS.filter(([m]) => b.wind.mag >= m).pop();
  $('wind-label').textContent = wl ? wl[1] : 'calm';
  // weapon button
  const team = b.activeTeam();
  if (team) {
    const w = WEAPONS.find(x => x.id === team.weapon);
    $('weapon-icon').textContent = w.icon;
    $('weapon-name').textContent = w.name;
    const ammo = team.ammo.get(w.id);
    $('weapon-ammo').textContent = ammo < 0 ? '' : `×${ammo}`;
  }
  // controls only on the human's turn
  const mine = b.phase === 'play' && team && !team.isAI;
  $('controls').classList.toggle('hidden', !mine || b.over);
  $('hud-timer').classList.toggle('hidden', !mine || b.over);
  $('aim-hint').classList.toggle('hidden', !mine || b.turnCount > 1);
}

// called every frame — cheap updates only
export function tickHUD(b) {
  if (!b) return;
  const mine = b.phase === 'play' && b.activeTeam() && !b.activeTeam().isAI;
  if (mine) {
    const t = Math.ceil(b.timer);
    $('hud-timer').textContent = t;
    $('hud-timer').classList.toggle('low', t <= 10);
    $('walk-fill').style.width = `${clamp(b.moveLeft / RULES.moveBudget, 0, 1) * 100}%`;
  }
  const charging = b.aim.charging;
  $('powerbar').classList.toggle('hidden', !charging);
  if (charging) $('power-fill').style.width = `${b.aim.power * 100}%`;
  // wind arrow relative to camera
  const cam = cb.cams().cam;
  const camYaw = Math.atan2(cam.position.x - cb.cams().smoothLook.x, cam.position.z - cb.cams().smoothLook.z);
  const a = Math.atan2(b.wind.x, b.wind.z) - camYaw;
  $('wind-arrow').style.display = 'inline-block';
  $('wind-arrow').style.transform = `rotate(${(-a * 180 / Math.PI) + 90}deg)`;
  $('wind-arrow').style.opacity = String(0.35 + b.wind.mag * 0.65);
}

export function turnBanner(bug) {
  const el = $('hud-turn');
  el.innerHTML = `${bug.faction.emoji} <span style="color:${bug.faction.ui}">${bug.name}</span>`;
  el.classList.remove('hidden');
  clearTimeout(el._to);
  el._to = setTimeout(() => el.classList.add('hidden'), 1800);
}

// ---------------- results ----------------
export function resultsModal(res, coins, stars, { isStory, hasNext }, onPick) {
  const title = res.playerWon ? '🏆 GRUDGE SETTLED' : res.winnerTeam === -1 ? '💀 EVERYBODY LOST' : '😵 GRUDGE LOST';
  const flavor = res.playerWon
    ? ['The sandwich respects you now.', 'Somewhere, a tiny violin plays for them.', 'Absolute scenes on the ledge.'][Math.floor(Math.random() * 3)]
    : ['The ledge remembers.', 'Regroup. Rehydrate. Re-grudge.', 'They will write songs about this defeat. Mean ones.'][Math.floor(Math.random() * 3)];
  modal(`<h3>${title}</h3>
    ${isStory && res.playerWon ? `<div class="resstars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>` : ''}
    <p style="text-align:center">${flavor}</p>
    <div class="rescoins">+🪙 ${coins}</div>
    <p style="text-align:center;font-size:12.5px;color:#a9c793">${res.rounds} rounds · ${Object.values(res.kills || {}).reduce((a, b) => a + b, 0)} bugs avenged</p>`,
    res.playerWon && isStory && hasNext
      ? [{ label: '▶ Next Chapter', gold: true }, { label: 'Menu' }]
      : [{ label: res.playerWon ? 'Menu' : '↻ Rematch', gold: true }, { label: res.playerWon ? '↻ Again' : 'Menu' }],
    onPick);
}
