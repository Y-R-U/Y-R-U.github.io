// All in-game DOM: HUD chips, the wave-call button + preview, build/tower
// bottom sheets, toasts, one-time coach tips, boss banners, win/lose/pause
// modals and the help guide. Everything is a styled popup — never alert().

import { TOWERS, ENEMIES, ECON } from './config.js';
import { tipSeen, markTip } from './levels.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);

export function createUI(game) {
  const ui = { sheetOpen: null };
  const el = {
    hud: $('hud'), gold: $('gold'), lives: $('lives'), wave: $('wave'),
    speed: $('btn-speed'), pause: $('btn-pause'),
    waveWrap: $('wavebtn-wrap'), waveBtn: $('wavebtn'),
    waveLabel: $('wavebtn-label'), waveSub: $('wavebtn-sub'), preview: $('wave-preview'),
    toasts: $('toasts'), tipbox: $('tipbox'), tipText: $('tip-text'),
    boss: $('bossbanner'), flash: $('dmgflash'),
    sheet: $('sheet'), sheetCard: $('sheet-card'),
    modal: $('modal'), modalCard: $('modal-card'),
  };

  el.speed.onclick = () => { sfx.click(); game.cycleSpeed(); };
  el.pause.onclick = () => { sfx.click(); game.openPause(); };
  el.waveBtn.onclick = () => game.callWave();
  $('tip-ok').onclick = () => { el.tipbox.classList.add('hidden'); sfx.click(); };

  // ── HUD ──
  let lastGold = -1, lastLives = -1, lastWaveTxt = '';
  ui.updateHud = () => {
    if (game.gold !== lastGold) { lastGold = game.gold; el.gold.textContent = game.gold; }
    if (game.lives !== lastLives) { lastLives = game.lives; el.lives.textContent = Math.max(0, game.lives); }
    const wt = `${Math.min(game.waves.idx + 1 + (game.waves.phase === 'countdown' ? 1 : 0), game.waves.total)}/${game.waves.total}`;
    if (wt !== lastWaveTxt) { lastWaveTxt = wt; el.wave.textContent = wt; }
  };
  ui.setSpeedLabel = (s) => { el.speed.textContent = `${s}×`; };
  ui.show = () => el.hud.classList.remove('hidden');
  ui.hide = () => el.hud.classList.add('hidden');

  ui.hurtFlash = () => {
    el.flash.classList.remove('on'); void el.flash.offsetWidth; el.flash.classList.add('on');
    el.lives.parentElement.classList.remove('hurt'); void el.lives.parentElement.offsetWidth;
    el.lives.parentElement.classList.add('hurt');
  };

  // ── wave button ──
  let lastWaveState = '';
  ui.updateWaveButton = () => {
    const w = game.waves;
    const next = w.idx + 1;
    if (w.phase === 'done' || next >= w.total) {
      if (lastWaveState !== 'hide') { lastWaveState = 'hide'; el.waveWrap.classList.add('hidden'); }
      return;
    }
    el.waveWrap.classList.remove('hidden');
    if (w.phase === 'countdown') {
      const secs = Math.max(0, Math.ceil(w.countdown));
      const bonus = w.idx >= 0 ? Math.ceil(Math.max(0, w.countdown) * ECON.earlyBonusPerSec) : 0;
      const key = `cd${next}-${secs}`;
      if (lastWaveState !== key) {
        lastWaveState = key;
        el.waveBtn.classList.remove('subtle');
        el.waveLabel.textContent = `⚔️ Send wave ${next + 1}`;
        el.waveSub.textContent = bonus > 0 ? `auto in ${secs}s · call now +${bonus} 🪙` : `battle begins in ${secs}s`;
        renderPreview(next);
      }
    } else {
      const key = `run${next}`;
      if (lastWaveState !== key) {
        lastWaveState = key;
        el.waveBtn.classList.add('subtle');
        el.waveLabel.textContent = `⚔️ Call wave ${next + 1} early`;
        el.waveSub.textContent = 'stack the pressure — no bonus';
        renderPreview(next);
      }
    }
  };
  function renderPreview(idx) {
    el.preview.innerHTML = '';
    for (const p of game.waves.preview(idx)) {
      const s = document.createElement('span');
      if (ENEMIES[p.type].boss) s.className = 'boss';
      s.textContent = `${p.icon}×${p.n}`;
      s.title = p.name;
      el.preview.appendChild(s);
    }
  }

  // ── toasts + tips ──
  ui.toast = (msg, gold = false) => {
    const t = document.createElement('div');
    t.className = 'toast' + (gold ? ' goldt' : '');
    t.textContent = msg;
    el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  };
  ui.tip = (key, text) => {
    if (tipSeen(key) || game.shotMode) return;
    markTip(key);
    el.tipText.textContent = text;
    el.tipbox.classList.remove('hidden');
  };
  ui.bossBanner = (name) => {
    el.boss.textContent = `⚠ ${name} approaches ⚠`;
    el.boss.classList.remove('hidden');
    void el.boss.offsetWidth;
    setTimeout(() => el.boss.classList.add('hidden'), 3500);
  };

  // ── bottom sheets ──
  ui.closeSheet = () => {
    el.sheet.classList.add('hidden');
    ui.sheetOpen = null;
    game.clearSelection();
  };
  function openSheet(html) {
    el.sheetCard.innerHTML = html;
    el.sheet.classList.remove('hidden');
    el.sheetCard.querySelector('.sheet-x')?.addEventListener('click', () => { sfx.click(); ui.closeSheet(); });
  }

  ui.openBuild = (cx, cz) => {
    ui.sheetOpen = { kind: 'build', cx, cz };
    const rows = Object.entries(TOWERS).map(([id, d]) => {
      const can = game.gold >= d.cost[0];
      return `<button class="tw-row ${can ? '' : 'cant'}" data-t="${id}">
        <span class="ic">${d.icon}</span>
        <span class="inf"><b>${d.name}</b><small>${d.desc}</small></span>
        <span class="cost">🪙 ${d.cost[0]}</span></button>`;
    }).join('');
    openSheet(`<div class="sheet-title">Build a tower <small>on this plot</small><button class="sheet-x">✕</button></div>${rows}`);
    el.sheetCard.querySelectorAll('[data-t]').forEach(b => {
      b.onclick = () => game.buildAt(b.dataset.t, cx, cz);
    });
  };

  ui.openTower = (t) => {
    ui.sheetOpen = { kind: 'tower', t };
    const d = t.def, lvl = t.lvl, maxed = lvl >= 2;
    const pips = '●'.repeat(lvl + 1) + `<span class="off">${'●'.repeat(2 - lvl)}</span>`;
    const nxt = (arr) => maxed ? '' : ` <i>→ ${arr[lvl + 1]}</i>`;
    const stats = [
      d.dmg ? `<span>⚔️ <b>${d.dmg[lvl]}</b>${nxt(d.dmg)}</span>` : '',
      `<span>🎯 <b>${d.range[lvl]}</b>${nxt(d.range)}</span>`,
      `<span>⏱ <b>${d.period[lvl]}s</b>${nxt(d.period)}</span>`,
      d.splash ? `<span>💥 <b>${d.splash[lvl]}</b>${nxt(d.splash)}</span>` : '',
      d.chain ? `<span>🔗 <b>${d.chain[lvl]}</b>${nxt(d.chain)}</span>` : '',
      d.slow ? `<span>🐌 <b>${Math.round((1 - d.slow[lvl]) * 100)}%</b></span>` : '',
    ].join('');
    const upCost = maxed ? null : d.cost[lvl + 1];
    const refund = Math.round(t.invested * ECON.sellRefund);
    openSheet(`<div class="sheet-title">${d.icon} ${d.name} <span class="lvpips">${pips}</span><small></small><button class="sheet-x">✕</button></div>
      <div class="tw-stats">${stats}</div>
      <div class="sheet-btns">
        <button class="b-upg" ${maxed || game.gold < upCost ? 'disabled' : ''}>${maxed ? '★ Max level' : `⬆ Upgrade · 🪙 ${upCost}`}</button>
        <button class="b-sell">Sell · 🪙 ${refund}</button>
      </div>`);
    el.sheetCard.querySelector('.b-upg').onclick = () => game.upgradeTower(t);
    el.sheetCard.querySelector('.b-sell').onclick = () => game.sellTower(t);
  };

  // ── modals ──
  ui.closeModal = () => el.modal.classList.add('hidden');
  function openModal(html) {
    el.modalCard.innerHTML = html;
    el.modal.classList.remove('hidden');
  }
  const btn = (id, label, gold = false) => `<button id="${id}" class="${gold ? 'gold' : ''}">${label}</button>`;

  ui.showWin = ({ stars, kills, goldEarned, hasNext, isCustom }) => {
    const starTxt = '★'.repeat(stars) + `<span class="off">${'★'.repeat(3 - stars)}</span>`;
    openModal(`<h2>Victory!</h2>
      <div class="mstars">${starTxt}</div>
      <div class="msub">${['', 'The castle stands — barely.', 'A solid defence!', 'A flawless defence!'][stars]}</div>
      <div class="mstats"><span><b>${kills}</b>slain</span><span><b>${game.lives}</b>❤️ left</span><span><b>${goldEarned}</b>🪙 earned</span></div>
      <div class="mbtns">
        ${hasNext ? btn('m-next', '⚔️ Next level', true) : ''}
        ${btn('m-replay', '↻ Replay')}
        ${btn('m-quit', isCustom ? '⏏ Done' : '🗺 Level select')}
      </div>`);
    $('m-next') && ($('m-next').onclick = () => game.nextLevel());
    $('m-replay').onclick = () => game.restart();
    $('m-quit').onclick = () => game.quit();
  };

  ui.showLose = ({ wave, kills }) => {
    openModal(`<h2 class="lose">The castle has fallen</h2>
      <div class="msub">The horde broke through on wave ${wave}.<br>${kills} foes were slain in the defence.</div>
      <div class="mbtns">
        ${btn('m-replay', '↻ Try again', true)}
        ${btn('m-quit', '🗺 Level select')}
      </div>`);
    $('m-replay').onclick = () => game.restart();
    $('m-quit').onclick = () => game.quit();
  };

  ui.showPause = () => {
    openModal(`<h2>Paused</h2>
      <div class="msub">${game.level.name || ''}</div>
      <div class="mbtns">
        ${btn('m-resume', '▶ Resume', true)}
        ${btn('m-help', '📜 How to play')}
        ${btn('m-mute', game.mutedLabel())}
        ${btn('m-replay', '↻ Restart level')}
        ${btn('m-quit', '⏏ Quit to menu')}
      </div>`);
    $('m-resume').onclick = () => { sfx.click(); ui.closeModal(); game.resume(); };
    $('m-help').onclick = () => { sfx.click(); ui.showHelp(() => ui.showPause()); };
    $('m-mute').onclick = () => { game.toggleMute(); $('m-mute').textContent = game.mutedLabel().replace(/<[^>]*>/g, ''); };
    $('m-replay').onclick = () => { ui.closeModal(); game.restart(); };
    $('m-quit').onclick = () => { ui.closeModal(); game.quit(); };
  };

  ui.showHelp = (onBack) => {
    const towers = Object.values(TOWERS).map(d =>
      `<div class="hp-row"><span class="ic">${d.icon}</span><div><b>${d.name}</b> — 🪙${d.cost[0]}<small>${d.desc}</small></div></div>`).join('');
    openModal(`<h2>How to Play</h2>
      <div class="help-page">
        <h3>The goal</h3>
        The horde marches from the portal to your castle. Each enemy that reaches
        the gate costs ❤️ hearts — lose them all and the castle falls. Survive
        every wave to win. Fewer hearts lost = more ★.
        <h3>Build &amp; upgrade</h3>
        Tap any empty plot beside the road to build. Tap a tower to upgrade it
        (two upgrades each) or sell it back for ${Math.round(ECON.sellRefund * 100)}% of its gold.
        <h3>The towers</h3>${towers}
        <h3>Know your enemy</h3>
        <div class="hp-row"><span class="ic">⚔️</span><div><b>Armoured</b> foes (knights, shieldmaidens) shrug off small hits — use cannons and catapults.</div></div>
        <div class="hp-row"><span class="ic">🥷</span><div><b>Shades</b> sprint — chill them with a Frost Spire.</div></div>
        <div class="hp-row"><span class="ic">🔮</span><div><b>Warlocks</b> heal the horde around them — kill them first.</div></div>
        <div class="hp-row"><span class="ic">🩹</span><div><b>Mummies</b> regenerate — burst them down.</div></div>
        <div class="hp-row"><span class="ic">👑</span><div><b>Bosses</b> arrive on waves 5, 10, 15 and 20. Prepare.</div></div>
        <h3>Gold</h3>
        Kills pay bounty. Clearing a wave pays a bonus. Calling the next wave
        early pays +${ECON.earlyBonusPerSec} 🪙 per second left on the clock.
        <h3>Make your own levels</h3>
        The Level Editor (on the title screen) lets you draw roads, dress the
        battlefield and script waves — your levels appear under
        <b>Custom</b> in level select.
      </div>
      <div class="mbtns">${btn('m-back', '← Back', true)}</div>`);
    $('m-back').onclick = () => { sfx.click(); onBack ? onBack() : ui.closeModal(); };
  };

  return ui;
}
