// Menu screens: home, story select, skirmish setup, options, help.
import { CFG } from './config.js';
import { STORY } from './maps.js';
import { STYLES } from './mapgen.js';
import { Settings, Progress, CustomMaps, Resume } from './save.js';
import { showModal, toast } from './ui.js';
import { applyAudioSettings, unlockAudio, Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
let H = null; // handlers from main.js

export function initMenus(handlers) {
  H = handlers;

  // empire identity
  const nameInput = $('empire-name');
  nameInput.value = Settings.data.empireName;
  nameInput.onchange = () => {
    Settings.data.empireName = nameInput.value.trim() || 'Your Empire';
    Settings.save();
  };
  const sw = $('color-swatches');
  CFG.colors.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (Settings.data.colorIdx === i ? ' on' : '');
    b.style.background = c.css;
    b.title = c.name;
    b.onclick = () => {
      Settings.data.colorIdx = i; Settings.save();
      sw.querySelectorAll('.swatch').forEach(s => s.classList.remove('on'));
      b.classList.add('on');
      Sfx.tap();
    };
    sw.appendChild(b);
  });

  $('btn-story').onclick = () => { unlockAudio(); Sfx.select(); renderStoryList(); showScreen('storyselect'); };
  $('btn-skirmish').onclick = () => { unlockAudio(); Sfx.select(); renderSkirmish(); showScreen('skirmish'); };
  $('btn-editor').onclick = () => { unlockAudio(); Sfx.select(); H.onOpenEditor(); };
  $('btn-help').onclick = () => { Sfx.select(); openHelp(); };
  $('btn-options').onclick = () => { Sfx.select(); openOptions(false); };
  $('btn-continue').onclick = () => { unlockAudio(); Sfx.select(); H.onContinue(); };

  document.querySelectorAll('.back-btn').forEach(b => {
    b.onclick = () => { Sfx.tap(); showScreen(b.dataset.back); };
  });

  // skirmish tabs
  $('tab-random').onclick = () => { skTab(true); };
  $('tab-custom').onclick = () => { skTab(false); renderCustomList(); };
}

function skTab(rand) {
  $('tab-random').classList.toggle('on', rand);
  $('tab-custom').classList.toggle('on', !rand);
  $('sk-random').classList.toggle('hidden', !rand);
  $('sk-custom').classList.toggle('hidden', rand);
}

export function showScreen(id) {
  for (const s of ['menu', 'storyselect', 'skirmish']) {
    $(s).classList.toggle('hidden', s !== id);
  }
  if (id === 'menu') {
    $('btn-continue').classList.toggle('hidden', !Resume.load());
  }
}
export function hideAllScreens() { showScreen(null); }

// ---------- story ----------
function renderStoryList() {
  const list = $('story-list');
  list.innerHTML = '';
  STORY.forEach((ch, i) => {
    const done = Progress.isDone(ch.id);
    const locked = i > 0 && !Progress.isDone(STORY[i - 1].id);
    const card = document.createElement('button');
    card.className = 'story-card' + (done ? ' done' : '') + (locked ? ' locked' : '');
    card.innerHTML = `
      <div class="story-num">${done ? '✓' : i + 1}</div>
      <div class="story-info"><h3>${ch.name}</h3><p>${ch.sub}</p></div>`;
    card.onclick = () => {
      if (locked) { Sfx.error(); toast('Complete the previous chapter first'); return; }
      Sfx.select();
      showModal({
        title: 'Chapter ' + (i + 1) + ' — ' + ch.name,
        body: `<p>${ch.intro}</p><p><b>Tip:</b> ${ch.tip}</p>`,
        buttons: [
          { label: 'To Battle', primary: true, onTap: () => H.onStartStory(ch) },
          { label: 'Back' },
        ],
      });
    };
    list.appendChild(card);
  });
}

// ---------- skirmish ----------
const sk = { style: 'random', size: 'medium', rivals: 2, personalities: [] };

function chipRow(el, options, current, onPick) {
  el.innerHTML = '';
  for (const [val, label] of options) {
    const c = document.createElement('button');
    c.className = 'chip' + (val === current ? ' on' : '');
    c.textContent = label;
    c.onclick = () => { Sfx.tap(); onPick(val); };
    el.appendChild(c);
  }
}

function renderSkirmish() {
  chipRow($('sk-style'), [
    ['random', '🎲 Surprise'], ['classic', 'Classic'], ['jagged', 'Jagged'],
    ['islands', 'Islands'], ['maze', 'Maze'],
  ], sk.style, (v) => { sk.style = v; renderSkirmish(); });
  chipRow($('sk-size'), [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']],
    sk.size, (v) => { sk.size = v; renderSkirmish(); });
  chipRow($('sk-rivals'), [1, 2, 3, 4, 5].map(n => [n, String(n)]),
    sk.rivals, (v) => { sk.rivals = v; renderSkirmish(); });

  const pers = $('sk-personalities');
  pers.innerHTML = '';
  const pKeys = Object.keys(CFG.personalities);
  for (let i = 0; i < sk.rivals; i++) {
    if (sk.personalities[i] === undefined) sk.personalities[i] = 'random';
    const row = document.createElement('div');
    row.className = 'rival-row';
    const colorIdx = rivalColorIdx(i);
    row.innerHTML = `
      <span class="rival-dot" style="background:${CFG.colors[colorIdx].css}"></span>
      <span class="rname">${CFG.aiNames[i]}</span>`;
    const sel = document.createElement('select');
    sel.innerHTML = `<option value="random">🎲 Random</option>` +
      pKeys.map(k => `<option value="${k}">${CFG.personalities[k].label}</option>`).join('');
    sel.value = sk.personalities[i];
    sel.onchange = () => { sk.personalities[i] = sel.value; };
    row.appendChild(sel);
    pers.appendChild(row);
  }

  $('sk-start').onclick = () => {
    Sfx.select();
    const pKeysAll = Object.keys(CFG.personalities);
    const rivals = [];
    for (let i = 0; i < sk.rivals; i++) {
      const p = sk.personalities[i] === 'random'
        ? pKeysAll[Math.floor(Math.random() * pKeysAll.length)] : sk.personalities[i];
      rivals.push({ name: CFG.aiNames[i], personality: p, colorIdx: rivalColorIdx(i) });
    }
    H.onStartSkirmish({
      style: sk.style, size: sk.size, rivals,
      seed: $('sk-seed').value.trim() || undefined,
    });
  };
}

// rivals take the first colours the player didn't pick
export function rivalColorIdx(i) {
  const taken = Settings.data.colorIdx;
  const free = CFG.colors.map((_, ci) => ci).filter(ci => ci !== taken);
  return free[i % free.length];
}

// ---------- custom maps ----------
function renderCustomList() {
  const list = $('custom-list');
  const maps = CustomMaps.list();
  list.innerHTML = maps.length ? '' :
    `<p style="opacity:.7;text-align:center;padding:30px 10px">No custom maps yet.<br>Craft one in the <b>Level Editor</b>.</p>`;
  for (const m of maps) {
    const card = document.createElement('div');
    card.className = 'custom-card';
    card.innerHTML = `
      <div class="cinfo"><h3>${escapeHtml(m.name)}</h3>
      <p>${m.land.length} hexes · ${m.bases.length} empires</p></div>`;
    const play = document.createElement('button');
    play.className = 'play'; play.textContent = '▶ Play';
    play.onclick = () => { Sfx.select(); H.onStartCustom(m); };
    const edit = document.createElement('button');
    edit.textContent = '✏️';
    edit.onclick = () => { Sfx.tap(); H.onOpenEditor(m); };
    const del = document.createElement('button');
    del.textContent = '🗑';
    del.onclick = () => {
      showModal({
        title: 'Delete map?', body: `<p>“${escapeHtml(m.name)}” will be gone for good.</p>`,
        buttons: [{ label: 'Delete', danger: true, onTap: () => { CustomMaps.remove(m.id); renderCustomList(); } }, { label: 'Keep' }],
      });
    };
    card.append(play, edit, del);
    list.appendChild(card);
  }
}

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ---------- options ----------
export function openOptions(inGame) {
  const rows = [
    ['sound', '🔊 Sound effects'],
    ['music', '🎵 Music'],
    ['fastAI', '⏩ Fast rival turns'],
    ['showHints', '💡 Hints & tips'],
  ];
  let body = rows.map(([k, label]) => `
    <div class="opt-row"><span>${label}</span>
      <button class="toggle ${Settings.data[k] ? 'on' : ''}" data-k="${k}"></button></div>`).join('');
  const buttons = [];
  if (inGame) {
    buttons.push({ label: 'Quit to Home', danger: true, onTap: () => H.onQuitToMenu() });
  } else {
    buttons.push({
      label: 'Reset Progress', danger: true, onTap: () => showModal({
        title: 'Reset everything?',
        body: '<p>Story progress and the saved game will be wiped. Custom maps are kept.</p>',
        buttons: [{ label: 'Reset', danger: true, onTap: () => { Progress.reset(); Resume.clear(); toast('Progress reset'); } }, { label: 'Cancel' }],
      }),
    });
  }
  buttons.push({ label: 'Done', primary: true });
  const card = showModal({ title: '⚙️ Options', body, buttons });
  card.querySelectorAll('.toggle').forEach(t => {
    t.onclick = () => {
      const k = t.dataset.k;
      Settings.data[k] = !Settings.data[k];
      Settings.save();
      t.classList.toggle('on', Settings.data[k]);
      if (k === 'music' || k === 'sound') { unlockAudio(); applyAudioSettings(); }
      Sfx.tap();
    };
  });
}

export function openHelp() {
  showModal({
    title: '📜 How to Play',
    body: `
      <p><b>Claim the map, raze every rival base.</b> Turn-based: build and march, then End Turn.</p>
      <p><b>🏰 Land</b> — your base and towers claim the hexes around them. Shared claims turn <b>grey</b> (contested) and pay no one. Every 4 fully-held hexes pay 1 coin a turn.</p>
      <p><b>🏘️ Villages</b> — +${CFG.villageIncome} coin, but they belong to whoever holds their hex. Lose the land, lose the village.</p>
      <p><b>🗼 Towers</b> — wood → stone → mortar. Each adds defence to nearby friends and fires arrows every turn, automatically.</p>
      <p><b>⚔️ Armies</b> — recruit level 1–10 beside a base. ${CFG.armyMoves} move points a turn; attacking costs 1, so you can march 4 and strike, or strike twice. Move onto a friend to <b>merge</b>. Damage = attack − defence (auras count) — a shielded target can repel you.</p>
      <p><b>⬆️ Base levels</b> — bigger claim radius, more arrows, more income. If your land splits, the cut-off part raises a free level 1 base. Lose your last base and your empire falls.</p>`,
    buttons: [{ label: 'To Arms!', primary: true }],
  });
}
