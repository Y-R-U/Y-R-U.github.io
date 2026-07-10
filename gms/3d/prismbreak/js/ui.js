// Screens, popups, shop, rewards UI, fake ads. All dialogs are styled popups.
import { game, startGame, stopGame, rescue, celebrate, armBooster, armForge, updateHud } from './game.js';
import { save, persist, addShards, spendShards, addBooster, useBooster, recordLevel, wipe } from './save.js';
import { levelDef, LEVEL_COUNT } from './levels.js';
import { THEMES, BOOSTERS, DAILY, MONTHLY_GOAL, MONTHLY_REWARD, AD, ECON, WEEKLY_TIERS } from './config.js';
import { dailyState, claimDaily, monthClaims, weeklyState, weeklyRecord, weeklyClaim, activeEvent, eventRecord, eventClaim, adFreebiesLeft, useAdFreebie } from './rewards.js';
import { applyTheme } from './render.js';
import { sfx, setMusic } from './audio.js';
import { seededRng, fmt, fmtTime, todayKey } from './utils.js';

const $ = (id) => document.getElementById(id);
const screens = ['menu', 'levelselect'];

export function show(name) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== name);
  $('hud').classList.toggle('hidden', name !== null);
  if (name === 'menu') refreshMenu();
}

export function toast(msg, ms = 1800) {
  let t = $('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), ms);
}

// ── popup plumbing ────────────────────────────────────────────────────
let popupStack = [];
export function popup(html, { closable = true, cls = '' } = {}) {
  const layer = $('popup-layer'), card = $('popup-card');
  popupStack.push(html);
  card.innerHTML = html + (closable ? '<button class="pclose">✕</button>' : '');
  card.className = cls;
  layer.classList.remove('hidden');
  card.querySelector('.pclose')?.addEventListener('click', () => { sfx.click(); closePopup(); });
  return card;
}
export function closePopup() {
  popupStack = [];
  $('popup-layer').classList.add('hidden');
  $('popup-card').innerHTML = '';
}

function shardPills() {
  document.querySelectorAll('.shard-pill, [data-shards]').forEach(el => {
    el.textContent = '◆ ' + fmt(save.data.shards);
  });
}

// ── menu ──────────────────────────────────────────────────────────────
function refreshMenu() {
  shardPills();
  $('menu-shards').textContent = '◆ ' + fmt(save.data.shards);
  const st = dailyState();
  $('daily-dot').classList.toggle('hidden', st.claimedToday);
  const wk = weeklyState();
  $('weekly-dot').classList.toggle('hidden',
    !WEEKLY_TIERS.some((t, i) => wk.best >= t.score && !wk.claimed[i]));
  const ev = activeEvent();
  const banner = $('event-banner');
  if (ev.active) {
    banner.classList.remove('hidden');
    banner.innerHTML = `<span class="ev-ico">${ev.def.icon}</span><span class="ev-name">${ev.def.name}</span><span class="ev-time">ends in ${fmtCountdown(ev.endsIn)}</span>`;
  } else {
    banner.classList.remove('hidden');
    banner.innerHTML = `<span class="ev-ico">📅</span><span class="ev-name muted">next event in ${fmtCountdown(ev.nextIn)}</span>`;
  }
  const cont = save.data.unlockedLevel;
  $('btn-journey').innerHTML = `💎&ensp;Journey <small>level ${Math.min(cont, LEVEL_COUNT)}</small>`;
}

function fmtCountdown(ms) {
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function initUi() {
  $('btn-journey').addEventListener('click', () => { sfx.click(); showLevelSelect(); });
  $('btn-blitz').addEventListener('click', () => { sfx.click(); launch({ mode: 'blitz' }); });
  $('btn-zen').addEventListener('click', () => { sfx.click(); launch({ mode: 'zen' }); });
  $('btn-weekly').addEventListener('click', () => { sfx.click(); weeklyPopup(); });
  $('btn-daily').addEventListener('click', () => { sfx.click(); dailyPopup(); });
  $('btn-shop').addEventListener('click', () => { sfx.click(); shopPopup(); });
  $('btn-help').addEventListener('click', () => { sfx.click(); helpPopup(); });
  $('btn-options').addEventListener('click', () => { sfx.click(); settingsPopup(); });
  $('event-banner').addEventListener('click', () => { sfx.click(); eventPopup(); });
  document.querySelectorAll('.back-btn').forEach(b => b.addEventListener('click', () => { sfx.click(); show(b.dataset.back); }));

  $('btn-pause').addEventListener('click', () => { sfx.click(); pausePopup(); });
  document.querySelectorAll('.boost').forEach(b => b.addEventListener('click', () => armBooster(b.dataset.boost)));
  $('forge-btn').addEventListener('click', () => armForge());

  game.onEnd = onGameEnd;
  game.onToast = toast;
}

// ── level select ──────────────────────────────────────────────────────
function showLevelSelect() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const lvl = levelDef(n);
    const rec = save.data.levels[n];
    const locked = n > save.data.unlockedLevel;
    const el = document.createElement('button');
    el.className = 'lvl' + (locked ? ' locked' : '') + (lvl.boss ? ' boss' : '') + (rec ? ' done' : '');
    el.innerHTML = locked ? '🔒' : `<b>${n}</b><span class="lstars">${'★'.repeat(rec?.stars || 0)}${'☆'.repeat(3 - (rec?.stars || 0))}</span>${lvl.boss ? '<i>👑</i>' : ''}`;
    if (!locked) el.addEventListener('click', () => { sfx.click(); preLevelPopup(n); });
    grid.appendChild(el);
  }
  show('levelselect');
  const target = grid.children[Math.min(save.data.unlockedLevel, LEVEL_COUNT) - 1];
  target?.scrollIntoView({ block: 'center' });
}

function preLevelPopup(n) {
  const lvl = levelDef(n);
  const canRainbow = (save.data.boosters.rainbow || 0) > 0;
  const card = popup(`
    <div class="ptitle">${lvl.boss ? '👑 ' + lvl.name : 'LEVEL ' + n}</div>
    <div class="goalbox">
      <div class="goal-big">Reach <b>${fmt(lvl.target)}</b> in <b>${lvl.moves}</b> moves</div>
      <div class="goal-stars">★ ${fmt(lvl.target)} &nbsp; ★★ ${fmt(lvl.star2)} &nbsp; ★★★ ${fmt(lvl.star3)}</div>
      ${lvl.metalChance > 0.15 ? '<div class="goal-warn">⚠️ heavy metal spawns — hunt for crush sandwiches!</div>' : ''}
    </div>
    <label class="chk ${canRainbow ? '' : 'off'}"><input type="checkbox" id="use-rainbow" ${canRainbow ? '' : 'disabled'}/> 🌈 Rainbow Start <b>×${save.data.boosters.rainbow || 0}</b></label>
    <button class="big gold" id="play-lvl">▶&ensp;PLAY</button>
  `);
  card.querySelector('#play-lvl').addEventListener('click', () => {
    const rainbow = card.querySelector('#use-rainbow')?.checked;
    if (rainbow) useBooster('rainbow');
    closePopup();
    launch({ mode: 'journey', level: lvl, rainbow });
  });
}

// ── launching games ───────────────────────────────────────────────────
export function launch({ mode, level = null, rainbow = false }) {
  let rng = Math.random, mods = {};
  if (mode === 'weekly') {
    const wk = weeklyState();
    rng = seededRng(wk.seed);
  }
  if (mode === 'event') {
    const ev = activeEvent();
    if (!ev.active) { toast('No event running right now'); return; }
    mods = { ...ev.def.mods, eventMode: ev.def.mode, eventName: ev.def.icon + ' ' + ev.def.name };
    game.eventKey = ev.key;
    game.eventDef = ev.def;
  }
  show(null);
  closePopup();
  startGame({ mode, level, rng, mods, rainbow });
}

// ── end-of-game results ───────────────────────────────────────────────
function onGameEnd(result) {
  if (result.mode === 'journey') return journeyResults(result);
  // score modes
  let title = "TIME'S UP!", extra = '';
  let shards = ECON.blitz(result.score);
  if (result.mode === 'zen') { shards = 0; title = 'ZEN COMPLETE'; }
  if (result.mode === 'weekly') {
    weeklyRecord(result.score);
    const wk = weeklyState();
    if (wk.runs === 1) shards += ECON.weeklyFirstRun;
    extra = `<div class="rline">weekly best: <b>${fmt(wk.best)}</b></div>`;
  }
  if (result.mode === 'event' && game.eventKey) {
    eventRecord(game.eventKey, result.score);
    extra = `<div class="rline">event best: <b>${fmt(save.data.events[game.eventKey].best)}</b></div>`;
  }
  if (result.mode === 'blitz') {
    save.data.best.blitz = Math.max(save.data.best.blitz, result.score);
    extra = `<div class="rline">best: <b>${fmt(save.data.best.blitz)}</b></div>`;
  }
  if (result.mode === 'zen') {
    save.data.best.zen = Math.max(save.data.best.zen, result.score);
  }
  if (shards) addShards(shards);
  persist();

  const card = popup(`
    <div class="ptitle">${title}</div>
    <div class="rscore">${fmt(result.score)}</div>
    ${extra}
    ${shards ? `<div class="rshards">+${shards} ◆</div>` : ''}
    <div class="btnrow">
      ${shards ? `<button class="mid ad" id="r-ad">📺 +${Math.round(shards * AD.resultsBonus)} ◆ watch ad</button>` : ''}
      <button class="mid gold" id="r-again">↻ Play Again</button>
      <button class="mid" id="r-menu">🏠 Menu</button>
    </div>
  `, { closable: false });
  card.querySelector('#r-ad')?.addEventListener('click', () => {
    watchAd(() => {
      addShards(Math.round(shards * AD.resultsBonus));
      card.querySelector('#r-ad').remove();
      toast(`+${Math.round(shards * AD.resultsBonus)} ◆`);
      shardPills();
    });
  });
  card.querySelector('#r-again').addEventListener('click', () => {
    sfx.click(); closePopup(); stopGame();
    launch({ mode: result.mode });
  });
  card.querySelector('#r-menu').addEventListener('click', () => {
    sfx.click(); closePopup(); stopGame(); show('menu');
    if (result.mode === 'weekly') weeklyPopup();
    if (result.mode === 'event') eventPopup();
  });
}

function journeyResults(result) {
  const lvl = result.level;
  if (result.win) {
    const shards = ECON.levelWin(result.score, result.stars);
    recordLevel(lvl.n, result.stars, result.score);
    addShards(shards);
    const card = popup(`
      <div class="ptitle win">LEVEL ${lvl.n} CLEAR!</div>
      <div class="bigstars">${[1, 2, 3].map(i => `<span class="bstar ${i <= result.stars ? 'lit' : ''}" style="animation-delay:${i * 0.28}s">★</span>`).join('')}</div>
      <div class="rscore">${fmt(result.score)}</div>
      <div class="rshards">+${shards} ◆</div>
      <div class="btnrow">
        <button class="mid ad" id="r-ad">📺 +${Math.round(shards * AD.resultsBonus)} ◆ watch ad</button>
        <button class="mid gold" id="r-next">${lvl.n < LEVEL_COUNT ? '▶ Next Level' : '🏆 Done!'}</button>
        <button class="mid" id="r-menu">🏠 Menu</button>
      </div>
    `, { closable: false });
    [1, 2, 3].forEach(i => { if (i <= result.stars) setTimeout(() => sfx.star(i), 300 + i * 280); });
    card.querySelector('#r-ad').addEventListener('click', () => {
      watchAd(() => {
        addShards(Math.round(shards * AD.resultsBonus));
        card.querySelector('#r-ad').remove();
        toast(`+${Math.round(shards * AD.resultsBonus)} ◆`);
        shardPills();
      });
    });
    card.querySelector('#r-next').addEventListener('click', () => {
      sfx.click(); closePopup(); stopGame();
      if (lvl.n < LEVEL_COUNT) preLevelPopup(lvl.n + 1), show('levelselect');
      else show('menu');
    });
    card.querySelector('#r-menu').addEventListener('click', () => { sfx.click(); closePopup(); stopGame(); show('menu'); });
  } else {
    const haveMoves = (save.data.boosters.moves || 0) > 0;
    const card = popup(`
      <div class="ptitle lose">SO CLOSE!</div>
      <div class="rline">needed <b>${fmt(lvl.target)}</b> — got <b>${fmt(result.score)}</b></div>
      <div class="btnrow">
        <button class="mid ad" id="r-rescue">📺 +${AD.rescueMoves} moves — watch ad</button>
        ${haveMoves ? `<button class="mid gold" id="r-boost">➕ use +5 Moves booster (×${save.data.boosters.moves})</button>` : ''}
        <button class="mid" id="r-retry">↻ Retry</button>
        <button class="mid" id="r-menu">🏠 Menu</button>
      </div>
    `, { closable: false });
    card.querySelector('#r-rescue').addEventListener('click', () => {
      watchAd(() => { closePopup(); rescue(AD.rescueMoves); });
    });
    card.querySelector('#r-boost')?.addEventListener('click', () => {
      sfx.click(); useBooster('moves'); closePopup(); rescue(5);
    });
    card.querySelector('#r-retry').addEventListener('click', () => {
      sfx.click(); closePopup(); stopGame(); launch({ mode: 'journey', level: lvl });
    });
    card.querySelector('#r-menu').addEventListener('click', () => { sfx.click(); closePopup(); stopGame(); show('menu'); });
  }
}

// ── pause ─────────────────────────────────────────────────────────────
function pausePopup() {
  game.paused = true;
  const card = popup(`
    <div class="ptitle">PAUSED</div>
    <div class="btnrow">
      <button class="mid gold" id="p-resume">▶ Resume</button>
      <button class="mid" id="p-restart">↻ Restart</button>
      <button class="mid" id="p-quit">🏠 Quit</button>
    </div>
  `, { closable: false });
  card.querySelector('#p-resume').addEventListener('click', () => { sfx.click(); game.paused = false; closePopup(); });
  card.querySelector('#p-restart').addEventListener('click', () => {
    sfx.click(); closePopup();
    const { mode, level } = game;
    stopGame();
    launch({ mode, level });
  });
  card.querySelector('#p-quit').addEventListener('click', () => { sfx.click(); closePopup(); stopGame(); show('menu'); });
}

// ── daily rewards ─────────────────────────────────────────────────────
function dailyPopup() {
  const st = dailyState();
  const mc = monthClaims();
  const now = new Date();
  const monthName = now.toLocaleString('en', { month: 'long' });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const claimedSet = new Set(save.data.daily.claimed);
  const mk = todayKey().slice(0, 7);

  let track = '';
  for (let i = 0; i < 7; i++) {
    const r = DAILY[i];
    const done = st.claimedToday ? i <= st.dayIndex : i < st.dayIndex;
    const today = !st.claimedToday && i === st.dayIndex;
    const label = r.shards ? `${r.shards}◆` : '';
    const bl = r.booster ? BOOSTERS[r.booster].icon : '';
    track += `<div class="dday ${done ? 'done' : ''} ${today ? 'today' : ''} ${r.mega ? 'mega' : ''}">
      <span class="dnum">day ${i + 1}</span><span class="dr">${bl}${label}</span>${done ? '<span class="dchk">✓</span>' : ''}</div>`;
  }

  let cal = '';
  for (let d = 1; d <= daysInMonth; d++) {
    const k = `${mk}-${String(d).padStart(2, '0')}`;
    const isToday = k === todayKey();
    cal += `<span class="cday ${claimedSet.has(k) ? 'got' : ''} ${isToday ? 'now' : ''}">${d}</span>`;
  }

  const monthDone = save.data.monthlyAwarded.includes(mk);
  const card = popup(`
    <div class="ptitle">🎁 DAILY REWARDS</div>
    <div class="streak">streak: <b>${st.streak}</b> day${st.streak === 1 ? '' : 's'}</div>
    <div class="dtrack">${track}</div>
    ${st.claimedToday
      ? '<div class="rline ok">✓ claimed today — come back tomorrow!</div>'
      : '<button class="big gold" id="d-claim">CLAIM DAY ' + (st.dayIndex + 1) + '</button>'}
    <div id="d-double-slot"></div>
    <div class="cal-head">${monthName} — <b>${mc}/${MONTHLY_GOAL}</b> days for the monthly chest</div>
    <div class="calgrid">${cal}</div>
    <div class="monthly ${monthDone ? 'done' : ''}">${monthDone ? '✓ monthly chest claimed!' : `🏆 claim ${MONTHLY_GOAL} days this month → <b>${MONTHLY_REWARD.shards} ◆ + Royal Gold theme</b>`}</div>
  `);
  card.querySelector('#d-claim')?.addEventListener('click', () => {
    const got = claimDaily();
    if (!got) return;
    sfx.reward();
    const bits = [];
    if (got.shards) bits.push(`+${got.shards} ◆`);
    if (got.booster) bits.push(`+${got.n || 1} ${BOOSTERS[got.booster].name}`);
    toast(bits.join('  '));
    if (got.monthly) { sfx.mega(); toast(`🏆 MONTHLY CHEST! +${MONTHLY_REWARD.shards} ◆ + Royal Gold theme!`, 3500); }
    shardPills(); refreshMenu();
    // offer the ad double
    if (got.shards && AD.dailyDouble) {
      closePopup();
      const c2 = popup(`
        <div class="ptitle">DAY ${(got.dayIndex + 1)} CLAIMED!</div>
        <div class="rshards">+${got.shards || 0} ◆ ${got.booster ? '+ ' + BOOSTERS[got.booster].icon : ''}</div>
        <div class="btnrow">
          <button class="mid ad" id="d-double">📺 DOUBLE IT — watch ad</button>
          <button class="mid" id="d-ok">nice ✓</button>
        </div>
      `, { closable: false });
      c2.querySelector('#d-double').addEventListener('click', () => {
        watchAd(() => {
          addShards(got.shards);
          toast(`doubled! +${got.shards} ◆`);
          shardPills();
          closePopup(); dailyPopup();
        });
      });
      c2.querySelector('#d-ok').addEventListener('click', () => { sfx.click(); closePopup(); dailyPopup(); });
    } else {
      closePopup(); dailyPopup();
    }
  });
}

// ── weekly challenge ──────────────────────────────────────────────────
function weeklyPopup() {
  const wk = weeklyState();
  const tiers = WEEKLY_TIERS.map((t, i) => {
    const hit = wk.best >= t.score;
    const claimed = wk.claimed[i];
    return `<div class="tier ${hit ? 'hit' : ''} ${claimed ? 'claimed' : ''}">
      <span class="tsc">${fmt(t.score)}</span>
      <span class="trw">${t.shards} ◆${t.booster ? ' + ' + BOOSTERS[t.booster].icon : ''}</span>
      ${claimed ? '<span class="tok">✓</span>' : hit ? `<button class="tiny gold" data-tier="${i}">CLAIM</button>` : '<span class="tlock">🔒</span>'}
    </div>`;
  }).join('');
  const card = popup(`
    <div class="ptitle">🏆 WEEKLY CHALLENGE</div>
    <div class="rline">${wk.week} — same board for everyone, all week</div>
    <div class="rline">your best: <b class="goldtx">${fmt(wk.best)}</b>${wk.runs === 0 ? ' <span class="muted">(+' + ECON.weeklyFirstRun + ' ◆ first run)</span>' : ''}</div>
    <div class="tiers">${tiers}</div>
    <button class="big gold" id="w-play">⚡ PLAY (90s blitz)</button>
  `);
  card.querySelectorAll('[data-tier]').forEach(b => b.addEventListener('click', () => {
    if (weeklyClaim(parseInt(b.dataset.tier, 10))) {
      sfx.reward(); toast('claimed!'); shardPills(); closePopup(); weeklyPopup();
    }
  }));
  card.querySelector('#w-play').addEventListener('click', () => { sfx.click(); launch({ mode: 'weekly' }); });
}

// ── events ────────────────────────────────────────────────────────────
function eventPopup() {
  const ev = activeEvent();
  if (!ev.active) {
    popup(`
      <div class="ptitle">📅 EVENTS</div>
      <div class="rline">No event right now.</div>
      <div class="rline">⚡ Weekend events run <b>Fri–Sun</b>, 🌒 Twilight Zen every <b>Wednesday</b>.</div>
      <div class="rline">next event in <b>${fmtCountdown(ev.nextIn)}</b></div>
    `);
    return;
  }
  const tiers = ev.def.tiers.map((t, i) => {
    const hit = ev.state.best >= t.score;
    const claimed = ev.state.claimed[i];
    return `<div class="tier ${hit ? 'hit' : ''} ${claimed ? 'claimed' : ''}">
      <span class="tsc">${fmt(t.score)}</span><span class="trw">${t.shards} ◆</span>
      ${claimed ? '<span class="tok">✓</span>' : hit ? `<button class="tiny gold" data-tier="${i}">CLAIM</button>` : '<span class="tlock">🔒</span>'}
    </div>`;
  }).join('');
  const card = popup(`
    <div class="ptitle">${ev.def.icon} ${ev.def.name}</div>
    <div class="rline">${ev.def.desc}</div>
    <div class="rline">ends in <b>${fmtCountdown(ev.endsIn)}</b> · your best: <b class="goldtx">${fmt(ev.state.best)}</b></div>
    <div class="tiers">${tiers}</div>
    <button class="big gold" id="e-play">${ev.def.mode === 'zen' ? '🌙' : '⚡'} PLAY EVENT</button>
  `);
  card.querySelectorAll('[data-tier]').forEach(b => b.addEventListener('click', () => {
    if (eventClaim(ev.key, ev.def, parseInt(b.dataset.tier, 10))) {
      sfx.reward(); toast('claimed!'); shardPills(); closePopup(); eventPopup();
    }
  }));
  card.querySelector('#e-play').addEventListener('click', () => { sfx.click(); launch({ mode: 'event' }); });
}

// ── shop ──────────────────────────────────────────────────────────────
function shopPopup() {
  const boosters = Object.entries(BOOSTERS).map(([k, b]) => `
    <div class="shopitem">
      <span class="si-ico">${b.icon}</span>
      <div class="si-mid"><b>${b.name}</b> <span class="si-own">×${save.data.boosters[k] || 0}</span><small>${b.desc}</small></div>
      <button class="tiny gold" data-buy="${k}">${b.price} ◆</button>
    </div>`).join('');
  const themes = Object.entries(THEMES).map(([k, t]) => {
    const owned = save.data.themesOwned.includes(k);
    const current = save.data.theme === k;
    const buyable = t.price >= 0;
    return `<div class="shopitem theme">
      <span class="si-swatch" style="background:linear-gradient(135deg,#${t.bgTop.toString(16).padStart(6, '0')},#${t.frame.toString(16).padStart(6, '0')})"></span>
      <div class="si-mid"><b>${t.name}</b><small>${buyable ? '' : 'monthly chest exclusive'}</small></div>
      ${current ? '<span class="tok">in use</span>'
        : owned ? `<button class="tiny" data-usetheme="${k}">USE</button>`
        : buyable && t.price > 0 ? `<button class="tiny gold" data-buytheme="${k}">${t.price} ◆</button>`
        : '<span class="tlock">🔒</span>'}
    </div>`;
  }).join('');
  const freebies = adFreebiesLeft();
  const card = popup(`
    <div class="ptitle">🛒 SHOP</div>
    <div class="rshards">balance: ${fmt(save.data.shards)} ◆</div>
    <button class="mid ad wide" id="s-free" ${freebies <= 0 ? 'disabled' : ''}>📺 FREE ${AD.freeShards} ◆ — watch ad (${freebies}/${AD.freeShardsPerDay} left today)</button>
    <div class="shead">BOOSTERS</div>
    <div class="shoplist">${boosters}</div>
    <div class="shead">GEM THEMES</div>
    <div class="shoplist">${themes}</div>
  `, { cls: 'tall' });
  card.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.buy;
    if (spendShards(BOOSTERS[k].price)) { addBooster(k); sfx.reward(); toast(`+1 ${BOOSTERS[k].name}`); closePopup(); shopPopup(); }
    else { sfx.badSwap(); toast('not enough shards!'); }
  }));
  card.querySelectorAll('[data-buytheme]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.buytheme;
    if (spendShards(THEMES[k].price)) {
      save.data.themesOwned.push(k); save.data.theme = k; persist();
      applyTheme(THEMES[k]); sfx.mega(); toast(`${THEMES[k].name} equipped!`); closePopup(); shopPopup();
    } else { sfx.badSwap(); toast('not enough shards!'); }
  }));
  card.querySelectorAll('[data-usetheme]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.usetheme;
    save.data.theme = k; persist();
    applyTheme(THEMES[k]); sfx.click(); toast(`${THEMES[k].name} equipped!`); closePopup(); shopPopup();
  }));
  card.querySelector('#s-free')?.addEventListener('click', () => {
    if (adFreebiesLeft() <= 0) return;
    watchAd(() => {
      useAdFreebie();
      sfx.reward(); toast(`+${AD.freeShards} ◆`); shardPills(); closePopup(); shopPopup();
    });
  });
}

// ── fake ad ───────────────────────────────────────────────────────────
const FAKE_ADS = [
  { emo: '✨', head: 'SHINE-O-MATIC 3000', line: 'Polishes 64 gems a minute. Now with turbo buffing!' },
  { emo: '🥤', head: 'MOLTEN COLA', line: 'Now with 20% more magma. Drink responsibly. It is lava.' },
  { emo: '🛡️', head: "CAPTAIN PRISM'S INSURANCE", line: 'Covers shattering, crushing & acts of supernova.' },
  { emo: '🚀', head: 'Y-R-U SPACELINES', line: 'Fly through all 60 levels. Legroom not included.' },
  { emo: '🔨', head: 'FORGE-B-GONE', line: 'Tired of hammers? Neither are we. Buy nine hammers.' },
  { emo: '🐟', head: 'GEM-FED SALMON', line: 'Our fish eat only the finest amethyst. Tastes purple.' },
];

export function watchAd(onDone) {
  sfx.click();
  const ad = FAKE_ADS[Math.floor(Math.random() * FAKE_ADS.length)];
  const card = popup(`
    <div class="ad-tag">ADVERTISEMENT (not really)</div>
    <div class="ad-box">
      <div class="ad-emo">${ad.emo}</div>
      <div class="ad-head">${ad.head}</div>
      <div class="ad-line">${ad.line}</div>
      <div class="ad-bar"><i id="ad-fill"></i></div>
      <div class="ad-count" id="ad-count">5</div>
    </div>
  `, { closable: false, cls: 'admodal' });
  let left = 5;
  const fill = card.querySelector('#ad-fill');
  const iv = setInterval(() => {
    left--;
    sfx.tick();
    card.querySelector('#ad-count').textContent = Math.max(left, 0);
    fill.style.width = ((5 - left) / 5 * 100) + '%';
    if (left <= 0) {
      clearInterval(iv);
      card.querySelector('#ad-count').outerHTML = '<button class="mid gold" id="ad-claim">CLAIM REWARD ▶</button>';
      card.querySelector('#ad-claim').addEventListener('click', () => { sfx.reward(); closePopup(); onDone(); });
    }
  }, 1000);
  fill.style.width = '0%';
}

// ── settings & help ───────────────────────────────────────────────────
function settingsPopup() {
  const s = save.data.settings;
  const card = popup(`
    <div class="ptitle">⚙️ OPTIONS</div>
    <label class="chk"><input type="checkbox" id="o-sfx" ${s.sfx ? 'checked' : ''}/> 🔊 Sound effects</label>
    <label class="chk"><input type="checkbox" id="o-music" ${s.music ? 'checked' : ''}/> 🎵 Music</label>
    <label class="chk"><input type="checkbox" id="o-hints" ${s.hints ? 'checked' : ''}/> 💡 Move hints</label>
    <button class="mid" id="o-reset">🗑 Reset all progress</button>
    <div class="menu-foot">Prism Break · a Y-R-U game · built by Fable 5</div>
  `);
  card.querySelector('#o-sfx').addEventListener('change', e => { s.sfx = e.target.checked; persist(); sfx.click(); });
  card.querySelector('#o-music').addEventListener('change', e => { setMusic(e.target.checked); persist(); });
  card.querySelector('#o-hints').addEventListener('change', e => { s.hints = e.target.checked; persist(); });
  card.querySelector('#o-reset').addEventListener('click', () => {
    const c2 = popup(`
      <div class="ptitle lose">RESET EVERYTHING?</div>
      <div class="rline">All levels, shards, themes and streaks will be wiped.</div>
      <div class="btnrow">
        <button class="mid" id="rz-no">Cancel</button>
        <button class="mid lose" id="rz-yes">Yes, wipe it</button>
      </div>
    `, { closable: false });
    c2.querySelector('#rz-no').addEventListener('click', () => { sfx.click(); closePopup(); settingsPopup(); });
    c2.querySelector('#rz-yes').addEventListener('click', () => { wipe(); location.reload(); });
  });
}

function helpPopup() {
  popup(`
    <div class="ptitle">📖 HOW TO PLAY</div>
    <div class="help">
      <p><b>Swap</b> two gems (tap-tap or swipe) to line up <b>3+</b> of a colour. Chains cascade for multiplied score.</p>
      <div class="shead">GLASS &amp; METAL</div>
      <p>Gems come in <b>glass</b> (see-through) and <b>metal</b> (banded, heavy) finishes — both match by colour. Metal scores double.</p>
      <p>💥 <b>THE CRUSH:</b> when a metal gem <b>drops</b> onto a glass gem that's sitting on another metal, the glass is <b>crushed flat</b> — big bonus points and it charges your Forge fast.</p>
      <div class="shead">SPECIAL GEMS</div>
      <p>➡️ <b>4 in a row</b> → Line Blaster (clears the row/column)<br/>
      💥 <b>L or T shape</b> → Starburst (3×3 blast)<br/>
      🌟 <b>6+ cluster</b> → Supernova (5×5 blast)<br/>
      🌈 <b>5 in a row</b> → Prism Orb (swap with any colour to wipe it)</p>
      <p><b>Swap two specials together</b> for massive combos — two Prism Orbs clear the entire board!</p>
      <div class="shead">THE FORGE</div>
      <p>Clearing metal &amp; crushing glass fills the <b>FORGE</b> meter. When it's full, tap it then tap anywhere: 3×3 hammer smash, free.</p>
      <div class="shead">EVERY DAY</div>
      <p>🎁 Daily rewards (streaks + a monthly chest at ${MONTHLY_GOAL} days) · 🏆 Weekly seeded challenge · 📅 weekend &amp; Wednesday events · 🛒 spend shards ◆ on boosters and themes.</p>
    </div>
  `, { cls: 'tall' });
}
