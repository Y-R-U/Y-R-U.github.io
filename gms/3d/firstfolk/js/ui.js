// HUD + all in-game UI: resource chips, faith bar, day-clock dial, age
// objective, the mode toolbar (hand/sculpt/leyline/build/miracle), contextual
// sheets, inspect cards, toasts, one-time tips and the help modal.
// Styled in-game popups only — never alert().

import { CFG, AGES, BUILDINGS, MIRACLES } from './config.js';
import { fmt, clamp } from './utils.js';

const $ = (id) => document.getElementById(id);

export function createUI(game) {
  const ui = { mode: 'hand', sheetFor: null, inspected: null };
  const els = {
    food: $('r-food'), wood: $('r-wood'), stone: $('r-stone'), pop: $('r-pop'),
    faith: $('r-faith'), faithBar: $('faith-bar').querySelector('i'),
    age: $('r-age'), chipAge: $('chip-age'), chipStone: $('chip-stone'),
    objective: $('objective'), toasts: $('toasts'), banner: $('banner'),
    sheet: $('sheet'), card: $('sheet-card'), toolbar: $('toolbar'),
    tipbox: $('tipbox'), tipText: $('tip-text'), clock: $('clock'),
    speed: $('btn-speed'), pause: $('btn-pause'), menu: $('btn-menu'),
    modal: $('modal'), modalCard: $('modal-card'), dmg: $('dmgflash'),
  };
  const clockG = els.clock.getContext('2d');

  let seenTips = {};
  try { seenTips = JSON.parse(localStorage.getItem('firstfolk-tips') || '{}'); } catch { /* ok */ }

  // ── toolbar ─────────────────────────────────────────────────────────────────
  els.toolbar.querySelectorAll('.mode').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode;
      if (btn.classList.contains('locked')) {
        ui.toast(m === 'leyline' ? 'Leylines await the Age of Field' : 'Locked');
        return;
      }
      game.AU.unlock(); game.AU.sfx.click();
      ui.setMode(ui.mode === m && m !== 'hand' ? 'hand' : m);
    });
  });

  ui.setMode = (m) => {
    ui.mode = m;
    game.P.setMode(m);
    game.cancelPlacing?.();
    els.toolbar.querySelectorAll('.mode').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    ui.inspected = null;
    if (m === 'hand') closeSheet();
    else if (m === 'sculpt') renderSculpt();
    else if (m === 'leyline') renderLey();
    else if (m === 'build') renderBuild();
    else if (m === 'miracle') renderMiracles();
  };

  function openSheet(html) { els.sheet.classList.remove('hidden'); els.card.innerHTML = html; }
  function closeSheet() { els.sheet.classList.add('hidden'); els.card.innerHTML = ''; ui.sheetFor = null; }
  ui.closeSheet = closeSheet;
  ui.sheetOpen = () => !els.sheet.classList.contains('hidden');

  const xBtn = `<button class="x">✕</button>`;
  function wireX() { els.card.querySelector('.x')?.addEventListener('click', () => { ui.setMode('hand'); }); }

  // ── sculpt sheet ────────────────────────────────────────────────────────────
  function renderSculpt() {
    ui.sheetFor = 'sculpt';
    openSheet(`
      <div class="sheet-title">⛰ Shape the land ${xBtn}</div>
      <div class="seg" id="sc-tools">
        <button data-t="raise"><span class="ico">🔼</span>Raise</button>
        <button data-t="lower"><span class="ico">🔽</span>Lower</button>
        <button data-t="flatten"><span class="ico">▬</span>Flatten</button>
        <button data-t="smooth"><span class="ico">〰️</span>Smooth</button>
      </div>
      <div class="brushrow">Brush <input type="range" id="sc-brush" min="${CFG.sculpt.rMin}" max="${CFG.sculpt.rMax}" step="0.5" value="${game.P.brush}"><span id="sc-bv">${game.P.brush}m</span></div>
      <div class="sheet-sub">Drag on the land. Shaping the earth spends a little ✨faith. Buildings anchor the ground beneath them; drowned or ripped-up trees become free logs.</div>`);
    wireX();
    const seg = els.card.querySelector('#sc-tools');
    const paint = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === game.P.sculptTool));
    seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { game.P.sculptTool = b.dataset.t; game.AU.sfx.click(); paint(); }));
    paint();
    const slider = els.card.querySelector('#sc-brush');
    slider.addEventListener('input', () => { game.P.brush = +slider.value; els.card.querySelector('#sc-bv').textContent = `${slider.value}m`; });
  }

  // ── leyline sheet ───────────────────────────────────────────────────────────
  function renderLey() {
    ui.sheetFor = 'leyline';
    openSheet(`
      <div class="sheet-title">🌟 Leylines ${xBtn}</div>
      <div class="seg" id="ley-tools">
        <button data-t="draw"><span class="ico">✒️</span>Draw</button>
        <button data-t="erase"><span class="ico">🧽</span>Erase</button>
      </div>
      <div class="sheet-sub">Paint glowing paths (½ ✨ per stride). Folk walking a leyline move half again as fast and shed a whisper of faith. They shine brightest at night.</div>`);
    wireX();
    const seg = els.card.querySelector('#ley-tools');
    const paint = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === game.P.leyTool));
    seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { game.P.leyTool = b.dataset.t; game.AU.sfx.click(); paint(); }));
    paint();
  }

  // ── build sheet ─────────────────────────────────────────────────────────────
  const costStr = (c) => Object.entries(c).map(([k, v]) => `${v}${k === 'wood' ? '🪵' : '🪨'}`).join(' ');
  function renderBuild() {
    ui.sheetFor = 'build';
    let cards = '';
    for (const [type, def] of Object.entries(BUILDINGS)) {
      const locked = game.state.age < def.age;
      const only1 = type === 'monument' && game.B.list.some(b => b.type === 'monument');
      cards += `
        <button class="bcard ${locked ? 'locked' : ''}" data-b="${type}" ${only1 ? 'disabled' : ''}>
          <span class="ico">${def.icon}</span>
          <span class="nm">${def.name}</span>
          <span class="cost">${locked ? `Age ${['', 'I', 'II', 'III', 'IV', 'V'][def.age]}` : costStr(def.cost)}</span>
          <span class="info">${only1 ? 'Already begun' : def.desc}</span>
        </button>`;
    }
    openSheet(`
      <div class="sheet-title">🏠 Build ${xBtn}</div>
      <div class="build-grid">${cards}</div>
      <div class="sheet-sub">Sites need no gold — your folk haul the timber and stone themselves, then hammer it up. Pick a flat, dry spot.</div>`);
    wireX();
    els.card.querySelectorAll('.bcard').forEach(b => b.addEventListener('click', () => {
      const type = b.dataset.b;
      if (game.state.age < BUILDINGS[type].age) { ui.toast(`${BUILDINGS[type].name} unlocks in a later Age`); game.AU.sfx.denied(); return; }
      game.AU.sfx.click();
      game.startPlacing(type);
    }));
  }

  ui.renderPlaceSheet = (type, ok2) => {
    ui.sheetFor = 'place';
    const def = BUILDINGS[type];
    openSheet(`
      <div class="sheet-title">${def.icon} Placing: ${def.name}</div>
      <div class="sheet-sub">${def.needsRock ? 'Must touch bare rock (crags & cliffs). ' : ''}Drag or tap the land to position it${ok2 ? '' : ' — <b style="color:#ff9d7a">this ground won’t do</b>'}.</div>
      <div class="confirmrow">
        <button class="ok" id="pl-ok" ${ok2 ? '' : 'disabled'}>✓ Stake it out</button>
        <button class="no" id="pl-no">✗ Cancel</button>
      </div>`);
    els.card.querySelector('#pl-ok').addEventListener('click', () => game.confirmPlacing());
    els.card.querySelector('#pl-no').addEventListener('click', () => { game.cancelPlacing(); ui.setMode('hand'); });
  };

  // ── miracles sheet ──────────────────────────────────────────────────────────
  function renderMiracles() {
    ui.sheetFor = 'miracle';
    let cards = '';
    for (const [name, def] of Object.entries(MIRACLES)) {
      const locked = game.state.age < def.age;
      cards += `
        <button class="bcard cool ${locked ? 'locked' : ''}" data-m="${name}">
          <span class="ico">${def.icon}</span>
          <span class="nm">${def.name}</span>
          <span class="cost">${locked ? `Age ${['', 'I', 'II', 'III', 'IV', 'V'][def.age]}` : `${def.cost}✨`}</span>
          <span class="info">${def.desc}</span>
          <span class="cd" data-cd="${name}" style="transform: scaleY(0)"></span>
        </button>`;
    }
    openSheet(`
      <div class="sheet-title">⚡ Miracles ${xBtn}</div>
      <div class="mir-grid">${cards}</div>
      <div class="sheet-sub" id="mir-hint">${game.state.age < 2 ? 'The heavens open in the Age of Field — grow your tribe.' : 'Choose a miracle, then tap the land.'}</div>`);
    wireX();
    els.card.querySelectorAll('.bcard').forEach(b => b.addEventListener('click', () => {
      const name = b.dataset.m;
      const def = MIRACLES[name];
      if (game.state.age < def.age) { ui.toast('The heavens are not ready'); game.AU.sfx.denied(); return; }
      if (game.P.cd[name] > 0) { ui.toast('Still gathering…'); return; }
      if (game.state.faith < def.cost) { ui.needFaith(); return; }
      game.AU.sfx.click();
      if (!def.aim) { game.P.cast(name); renderMiracles(); return; }
      game.P.armedMiracle = name;
      els.card.querySelectorAll('.bcard').forEach(c => c.classList.toggle('on', c.dataset.m === name));
      els.card.querySelector('#mir-hint').innerHTML = `<b>${def.icon} ${def.name}</b> armed — tap where it should fall.`;
    }));
  }
  ui.rerenderMiracles = () => { if (ui.sheetFor === 'miracle') renderMiracles(); };

  // ── inspect cards ───────────────────────────────────────────────────────────
  ui.showVillager = (v) => {
    ui.inspected = { kind: 'v', v };
    const jobNames = { villager: 'Villager', farmer: 'Farmer', forester: 'Forester', quarrier: 'Quarrier', priest: 'Priest', guard: 'Guard' };
    openSheet(`
      <div class="sheet-title">${v.adult ? '🧑‍🌾' : '🧒'} ${v.name} — ${v.adult ? jobNames[v.job] || v.job : 'Child'} ${xBtn}</div>
      <div class="inforow"><span class="ico">❤️</span><div class="hpbar"><i style="width:${(v.hp / v.maxHp * 100) | 0}%"></i></div></div>
      <div class="inforow"><span class="ico">🍎</span><div class="hpbar"><i style="width:${(v.hunger * 100) | 0}%"></i></div></div>
      <div class="sheet-sub">${v.carry ? `Hauling ${v.carry.n} ${v.carry.type}. ` : ''}${v.state === 'flee' ? 'Fleeing! ' : ''}${!v.adult ? 'Will come of age soon. ' : ''}Folk mind their own lives — shape the world around them.</div>`);
    wireX();
  };
  ui.showBuilding = (b) => {
    ui.inspected = { kind: 'b', b };
    const def = b.def || { name: 'Campfire', icon: '🔥' };
    let body = '', actions = '';
    if (b.type === 'fire') {
      body = `<div class="sheet-sub">The first fire. Goods are stockpiled here, and your folk gather to pray at dusk. Keep it — keep them.</div>`;
    } else if (b.state === 'site') {
      const needs = ['wood', 'stone'].filter(t => (b.needs[t] || 0) > 0)
        .map(t => `${t === 'wood' ? '🪵' : '🪨'} ${Math.min(b.delivered[t] || 0, b.needs[t])}/${b.needs[t]}`).join(' · ');
      body = `<div class="sheet-sub">Awaiting materials — ${needs}. Free folk haul from the stockpile.</div>`;
      actions = `<button class="no" id="b-demolish">🗑 Tear down</button>`;
    } else if (b.state === 'building') {
      body = `<div class="inforow"><span class="ico">🔨</span><div class="hpbar"><i style="width:${(b.work / b.workNeed * 100) | 0}%"></i></div></div>
              <div class="sheet-sub">Under construction.</div>`;
      actions = `<button class="no" id="b-demolish">🗑 Tear down</button>`;
    } else if (b.state === 'blessing') {
      body = `<div class="sheet-sub">Stage ${b.stage} of ${b.def.stages} stands ready. Consecrate it with ✨${b.def.consecrate} faith.</div>`;
      actions = `<button class="ok" id="b-bless">✨ Consecrate (${b.def.consecrate})</button>`;
    } else {
      const bits = [];
      if (b.type === 'hut') bits.push(`Houses ${BUILDINGS.hut.houses}.`);
      if (b.plots) bits.push(`${b.plots.filter(p => p.state === 'ripe').length} plots ripe.`);
      if (b.def?.job) bits.push(`${b.jobWorkers.filter(w => !w.dead).length}/${b.def.job.n} ${b.def.job.type}s.`);
      if (b.type === 'monument') bits.push(`Stage ${b.stage} of ${b.def.stages}.`);
      body = `<div class="inforow"><span class="ico">❤️</span><div class="hpbar"><i style="width:${(b.hp / b.maxHp * 100) | 0}%"></i></div></div>
              <div class="sheet-sub">${bits.join(' ')}${b.burning > 0 ? ' 🔥 BURNING!' : ''}</div>`;
      if (b.type !== 'monument') actions = `<button class="no" id="b-demolish">🗑 Tear down</button>`;
    }
    openSheet(`
      <div class="sheet-title">${def.icon} ${def.name} ${xBtn}</div>
      ${body}
      ${actions ? `<div class="confirmrow">${actions}</div>` : ''}`);
    wireX();
    els.card.querySelector('#b-demolish')?.addEventListener('click', () => {
      game.B.demolish(b); closeSheet(); game.AU.sfx.collapse();
    });
    els.card.querySelector('#b-bless')?.addEventListener('click', async () => {
      if (await game.B.consecrate(b)) ui.showBuilding(b);
    });
  };

  // ── chrome: toasts, tips, banner, modal ─────────────────────────────────────
  ui.toast = (msg, bad = false) => {
    const d = document.createElement('div');
    d.className = 'toast';
    if (bad) d.style.borderColor = '#a04a35';
    d.textContent = msg;
    els.toasts.appendChild(d);
    setTimeout(() => d.remove(), 2900);
    while (els.toasts.children.length > 3) els.toasts.firstChild.remove();
  };
  ui.banner = (text, bad = false) => {
    els.banner.classList.remove('hidden');
    els.banner.classList.toggle('bad', bad);
    const [big, small] = text.split('\n');
    els.banner.innerHTML = `${big}${small ? `<small>${small}</small>` : ''}`;
    els.banner.style.animation = 'none';
    void els.banner.offsetWidth;
    els.banner.style.animation = '';
    clearTimeout(ui._bt);
    ui._bt = setTimeout(() => els.banner.classList.add('hidden'), 3400);
  };
  ui.tip = (id, text) => {
    if (seenTips[id]) return;
    seenTips[id] = 1;
    try { localStorage.setItem('firstfolk-tips', JSON.stringify(seenTips)); } catch { /* ok */ }
    els.tipText.textContent = text;
    els.tipbox.classList.remove('hidden');
  };
  $('tip-ok').addEventListener('click', () => els.tipbox.classList.add('hidden'));
  let faithFlashT = 0;
  ui.needFaith = () => {
    const now = performance.now();
    if (now - faithFlashT < 1500) return;
    faithFlashT = now;
    ui.toast('Not enough ✨ faith — your folk pray at the fire each night');
    game.AU.sfx.denied();
  };
  ui.dmgFlash = () => {
    els.dmg.style.opacity = '1';
    setTimeout(() => { els.dmg.style.opacity = '0'; }, 220);
  };
  ui.modal = (html) => { els.modal.classList.remove('hidden'); els.modalCard.innerHTML = html; };
  ui.closeModal = () => { els.modal.classList.add('hidden'); };
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) ui.closeModal(); });

  ui.help = () => {
    ui.modal(`
      <h2>📜 How to Play</h2>
      <p>You are the young god of a small island. You never command your folk —
      you shape their world, and they live in it.</p>
      <h3>The loop</h3>
      <ul>
        <li><b>🖐 Look</b> — drag to pan, pinch/scroll to zoom, two fingers (or right-drag) to spin. Tap folk & buildings to inspect.</li>
        <li><b>⛰ Sculpt</b> — raise, lower, flatten. Buildings need flat dry ground; quarries need bare rock.</li>
        <li><b>🏠 Build</b> — stake a site; free folk haul timber & stone to it, then hammer it up. Huts grow the tribe.</li>
        <li><b>🌟 Leylines</b> — paint glowing roads; folk walk them faster and shed faith.</li>
        <li><b>⚡ Miracles</b> — rain on crops, sprout forests, smite raiders.</li>
      </ul>
      <h3>The rhythm</h3>
      <p>Folk work by day, <b>pray at the fire at dusk</b> (that's your ✨faith), sleep,
      and eat at dawn. No food means starving folk. Wolves prowl at night from the
      Age of Stone; longships raid from the Age of Faith — a Watchtower's guard
      and a well-aimed bolt keep them honest.</p>
      <h3>The goal</h3>
      <p>Grow through five Ages and raise the <b>🗿 Monument</b> — three stages,
      three consecrations — to take your place in the sky.</p>
      <div class="confirmrow"><button class="ok" id="hlp-ok">Begin</button></div>`);
    $('hlp-ok').addEventListener('click', ui.closeModal);
  };

  // ── top bar buttons ─────────────────────────────────────────────────────────
  els.speed.addEventListener('click', () => {
    game.speed = game.speed >= 3 ? 1 : 3;
    els.speed.textContent = `${game.speed}×`;
    game.AU.sfx.click();
  });
  els.pause.addEventListener('click', () => {
    game.paused = !game.paused;
    els.pause.textContent = game.paused ? '▶' : '⏸';
    game.AU.sfx.click();
  });
  els.menu.addEventListener('click', () => game.openMenu());

  // ── per-frame refresh ───────────────────────────────────────────────────────
  let acc = 0;
  const flash = (id) => { const el = $(id); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); };
  ui.flashChip = (type) => flash(`chip-${type}`);

  ui.update = (dt) => {
    acc += dt;
    if (acc < 0.2) return;
    acc = 0;
    const s = game.stocks, st = game.state;
    els.food.textContent = fmt(s.food);
    els.wood.textContent = fmt(s.wood);
    els.stone.textContent = fmt(s.stone);
    els.pop.textContent = `${game.V.pop()}/${game.B.housing()}`;
    const cap = CFG.faithCap[st.age - 1];
    els.faith.textContent = `${Math.floor(st.faith)}/${cap}`;
    els.faithBar.style.width = `${clamp(st.faith / cap * 100, 0, 100)}%`;
    const age = AGES[st.age - 1];
    els.age.textContent = age.name;
    els.chipAge.firstChild.textContent = `${age.icon} `;
    els.chipStone.classList.toggle('hidden', st.age < 3);
    // objective
    const next = AGES[st.age];
    if (next) {
      const parts = [];
      if (next.need.pop) parts.push(`${game.V.pop()}/${next.need.pop} folk`);
      if (next.need.stone) parts.push(`${Math.min(s.stone, next.need.stone)}/${next.need.stone} 🪨`);
      if (next.need.temple) parts.push(game.B.count('temple') ? '⛪ built' : 'build a ⛪ Temple');
      els.objective.textContent = `Next — ${next.icon} ${next.name}: ${parts.join(' · ')}`;
      els.objective.classList.remove('hidden');
    } else {
      const mon = game.B.list.find(b => b.type === 'monument');
      els.objective.textContent = mon
        ? `🗿 Monument: stage ${mon.stage}/${mon.def.stages}${mon.state === 'blessing' ? ' — consecrate it!' : ''}`
        : '🗿 Raise the Monument to ascend';
      els.objective.classList.remove('hidden');
    }
    // clock
    drawClock(game.W.dayT, game.W.day);
    // miracle cooldown shades
    if (ui.sheetFor === 'miracle') {
      els.card.querySelectorAll('.cd').forEach(el => {
        const name = el.dataset.cd;
        const def = MIRACLES[name];
        const k = clamp((game.P.cd[name] || 0) / def.cd, 0, 1);
        el.style.transform = `scaleY(${k})`;
      });
    }
    // live-refresh inspect card
    if (ui.inspected?.kind === 'b' && ui.sheetOpen()) {
      const b = ui.inspected.b;
      if (!game.B.list.includes(b)) closeSheet();
    }
  };

  function drawClock(dayT, day) {
    const g = clockG, S = 52, c = S / 2;
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2);
    g.fillStyle = 'rgba(12,22,15,0.85)'; g.fill();
    g.strokeStyle = '#33503b'; g.lineWidth = 1.5; g.stroke();
    // day arc (sunrise→dusk) gold, night navy
    const a0 = -Math.PI / 2;
    const toA = (t) => a0 + t * Math.PI * 2;
    g.beginPath(); g.arc(c, c, c - 5, toA(CFG.day.sunrise), toA(CFG.day.dusk));
    g.strokeStyle = '#e3b653'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(c, c, c - 5, toA(CFG.day.dusk), toA(1 + CFG.day.sunrise));
    g.strokeStyle = '#3a4a7a'; g.lineWidth = 3; g.stroke();
    // needle
    const na = toA(dayT);
    g.beginPath(); g.moveTo(c, c);
    g.lineTo(c + Math.cos(na) * (c - 7), c + Math.sin(na) * (c - 7));
    g.strokeStyle = '#efe6cf'; g.lineWidth = 2; g.stroke();
    // day number
    g.fillStyle = '#b9caa9'; g.font = '700 9px sans-serif'; g.textAlign = 'center';
    g.fillText(`d${day}`, c, c + 16);
  }

  ui.refreshUnlocks = () => {
    const leyBtn = els.toolbar.querySelector('[data-mode=leyline]');
    const unlocked = game.state.age >= 2;
    leyBtn.classList.toggle('locked', !unlocked);
    leyBtn.classList.toggle('hidden', false);
    if (ui.sheetFor === 'build') renderBuild();
    if (ui.sheetFor === 'miracle') renderMiracles();
  };

  return ui;
}
